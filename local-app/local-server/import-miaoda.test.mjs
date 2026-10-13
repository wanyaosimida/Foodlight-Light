import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { importMiaoda, parseCsv, parseTextArray, TABLES } from './import-miaoda.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const timestamp = '2026-09-22 01:02:03.123456+00';
const uid = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const records = () => ({
  profiles: [
    { id: uid(1), email: 'alice@miaoda.com', nickname: 'NULL', allergies: '花生,\n其他"说明"', age: 28, height_cm: 165.5 },
    { id: uid(2), email: 'test@example.com', nickname: '', weight_kg: 62.3 },
  ],
  recipes: [{ id: uid(3), owner_id: uid(1), title: '中文,蒸蛋', ingredients: JSON.stringify([{ name: '鸡蛋', amount: '2个' }]), steps: '["搅拌","蒸熟"]', nutrition: '{"calories":180.5}', is_ai_generated: true }],
  meal_logs: [{ id: uid(4), owner_id: uid(1), recipe_id: uid(3), log_date: '2026-09-22', food_name: '蒸蛋', calories: 180.5, gl_value: 2.6 }],
  weight_logs: [{ id: uid(5), owner_id: uid(1), log_date: '2026-09-22', weight_kg: 65.2 }],
  community_posts: [{ id: uid(6), owner_id: uid(1), content: '原始内容\n第二行', tags: '{"健康餐","含,逗号","反\\\\斜线","引\\"号"}', like_count: 9, comment_count: 4, favorite_count: 2 }],
  community_comments: [{ id: uid(7), owner_id: uid(2), post_id: uid(6), content: '评论\r\n第二行' }],
  community_likes: [{ id: uid(8), owner_id: uid(2), post_id: uid(6) }],
  community_favorites: [{ id: uid(9), owner_id: uid(2), post_id: uid(6) }],
  community_follows: [{ id: uid(10), follower_id: uid(2), followee_id: uid(1) }],
  food_library: [{ id: uid(11), owner_id: uid(1), name: '牛奶', nutrition: '{"protein":3.2}', ingredients: '生牛乳' }],
});

function csvCell(value) {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) || text === '' || text === 'NULL' || text === '\\N' ? `"${text.replaceAll('"', '""')}"` : text;
}
function fixture(directory, rows = records(), omit = []) {
  mkdirSync(directory, { recursive: true });
  const model = new DatabaseSync(':memory:');
  model.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));
  const counts = {};
  for (const table of TABLES) {
    const columns = model.prepare(`PRAGMA table_info(${table})`).all();
    const defaults = Object.fromEntries(columns.map(column => [column.name,
      column.name.endsWith('_at') ? timestamp : column.dflt_value !== null ? model.prepare(`SELECT ${column.dflt_value} AS value`).get().value : null]));
    counts[table] = rows[table]?.length || 0;
    if (omit.includes(table)) continue;
    const output = [columns.map(column => column.name).join(','), ...(rows[table] || []).map(row => {
      const input = { ...defaults, ...row };
      return columns.map(column => csvCell(input[column.name])).join(',');
    })].join('\r\n') + '\r\n';
    writeFileSync(join(directory, `${table}_rows.csv`), '\uFEFF' + output);
  }
  model.close();
  return counts;
}
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'foodlight-import-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('foodlight-import-test-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test('CSV and PostgreSQL arrays preserve quoted values, multiline data and NULL distinctions', () => {
  const parsed = parseCsv('\uFEFFa,b,c\r\n"with,comma","two\nlines","NULL"\r\n,"",NULL\r\n');
  assert.deepEqual(parsed.headers, ['a', 'b', 'c']);
  assert.equal(parsed.rows[0][1].value, 'two\nlines');
  assert.equal(parsed.rows[0][2].quoted, true);
  assert.equal(parsed.rows[1][1].quoted, true);
  assert.equal(parsed.rows[1][2].quoted, false);
  assert.deepEqual(parseTextArray('{"tag,one","反\\\\斜线","引\\"号",NULL,"NULL",""}'), ['tag,one', '反\\斜线', '引"号', null, 'NULL', '']);
  assert.deepEqual(parseTextArray('["中文","abc"]'), ['中文', 'abc']);
  assert.deepEqual(parseTextArray('{}'), []);
  assert.throws(() => parseCsv('a,b\n"unfinished,b'), /未闭合/);
  assert.throws(() => parseCsv('a,b\n1'), /列数不完整/);
  assert.throws(() => parseCsv(''), /缺少表头/);
});

test('ten-table import preserves values and counters, creates usable hashed local logins, and is idempotent', t => {
  const directory = temporary(t);
  const sourceDir = join(directory, 'source');
  const dataDir = join(directory, 'data');
  const expectedCounts = fixture(sourceDir);
  const first = importMiaoda({ sourceDir, dataDir, expectedCounts });
  assert.equal(first.status, 'success');
  assert.equal(first.coverage, 'all-ten-tables');
  assert.equal(first.cloudRowCountsVerified, true);
  assert.equal(first.usersCreated, 2);
  assert.equal(first.backupPath, null);
  assert.equal(first.tables.reduce((sum, table) => sum + table.inserted, 0), 11);
  const db = new DatabaseSync(join(dataDir, 'foodlight.sqlite'));
  const profile = db.prepare('SELECT * FROM profiles WHERE id=?').get(uid(1));
  assert.equal(profile.nickname, 'NULL');
  assert.equal(profile.phone, null);
  assert.equal(profile.allergies, '花生,\n其他"说明"');
  assert.equal(profile.created_at, timestamp);
  assert.equal(db.prepare('SELECT nickname FROM profiles WHERE id=?').get(uid(2)).nickname, '');
  const recipe = db.prepare('SELECT * FROM recipes WHERE id=?').get(uid(3));
  assert.equal(recipe.title, '中文,蒸蛋');
  assert.equal(recipe.is_ai_generated, 1);
  assert.deepEqual(JSON.parse(recipe.ingredients), [{ name: '鸡蛋', amount: '2个' }]);
  assert.equal(JSON.parse(recipe.nutrition).calories, 180.5);
  const post = db.prepare('SELECT * FROM community_posts WHERE id=?').get(uid(6));
  assert.deepEqual([post.like_count, post.comment_count, post.favorite_count], [9, 4, 2], 'preserve cloud counters even when reaction exports differ');
  assert.deepEqual(JSON.parse(post.tags), ['健康餐', '含,逗号', '反\\斜线', '引"号']);
  const accountFile = readFileSync(join(dataDir, 'local-accounts.txt'), 'utf8');
  const passwords = [...accountFile.matchAll(/本地密码: (\S+)/g)].map(match => match[1]);
  assert.equal(passwords.length, 2);
  const localUsers = db.prepare('SELECT * FROM users ORDER BY id').all();
  localUsers.forEach((user, index) => {
    assert.equal(user.password_hash, scryptSync(passwords[index], user.salt, 64).toString('hex'));
    assert.match(user.email, /^[a-z0-9_]{3,20}@miaoda\.com$/);
  });
  assert.equal(db.prepare('SELECT email FROM profiles WHERE id=?').get(uid(2)).email, 'test@example.com', 'profile data retains its original external email');
  // A subsequent in-app action must still update counters via restored triggers.
  db.prepare('INSERT INTO community_likes(id,post_id,owner_id,created_at) VALUES(?,?,?,?)').run(uid(12), uid(6), uid(1), timestamp);
  assert.equal(db.prepare('SELECT like_count FROM community_posts WHERE id=?').get(uid(6)).like_count, 10);
  db.prepare('UPDATE recipes SET title=? WHERE id=?').run('本地用户编辑', uid(3));
  db.prepare('UPDATE profiles SET nickname=? WHERE id=?').run('本地昵称', uid(1));
  db.close();
  const second = importMiaoda({ sourceDir, dataDir, expectedCounts });
  assert.equal(second.usersCreated, 0);
  assert.equal(second.tables.reduce((sum, table) => sum + table.inserted, 0), 0);
  assert.equal(second.tables.reduce((sum, table) => sum + table.skippedExistingId, 0), 11);
  assert.ok(existsSync(second.backupPath));
  assert.equal(readFileSync(join(dataDir, 'local-accounts.txt'), 'utf8'), accountFile, 'existing local credentials are never reset');
  const after = new DatabaseSync(join(dataDir, 'foodlight.sqlite'));
  assert.equal(after.prepare('SELECT title FROM recipes WHERE id=?').get(uid(3)).title, '本地用户编辑');
  assert.equal(after.prepare('SELECT nickname FROM profiles WHERE id=?').get(uid(1)).nickname, '本地昵称');
  assert.equal(after.prepare('SELECT like_count FROM community_posts WHERE id=?').get(uid(6)).like_count, 10);
  after.close();
  const backup = new DatabaseSync(second.backupPath, { readOnly: true });
  assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(backup.prepare('SELECT title FROM recipes WHERE id=?').get(uid(3)).title, '本地用户编辑');
  backup.close();
  const cli = spawnSync(process.execPath, [join(root, 'import-miaoda.mjs'), sourceDir, '--data-dir', dataDir], { encoding: 'utf8', windowsHide: true });
  assert.equal(cli.status, 0, cli.stderr);
  passwords.forEach(password => assert.equal(cli.stdout.includes(password) || cli.stderr.includes(password), false));
  assert.equal(JSON.parse(cli.stdout).usersCreated, 0);
});

test('missing zero-row CSVs require explicit verified counts and are reported as declared empty', t => {
  const directory = temporary(t);
  const sourceDir = join(directory, 'source');
  const input = records();
  const empty = ['community_comments', 'community_likes', 'community_favorites', 'community_follows', 'food_library'];
  empty.forEach(table => { input[table] = []; });
  const expectedCounts = fixture(sourceDir, input, empty);
  const dataDir = join(directory, 'data');
  assert.throws(() => importMiaoda({ sourceDir, dataDir }), /缺少 5 个表/);
  assert.equal(existsSync(dataDir), false, 'incomplete exports fail before creating a database');
  const result = importMiaoda({ sourceDir, dataDir, expectedCounts });
  assert.equal(result.coverage, 'all-ten-tables');
  assert.equal(result.cloudRowCountsVerified, true);
  assert.equal(result.tables.filter(table => table.sourceStatus === 'declared-empty-no-csv').length, 5);
  assert.equal(existsSync(join(sourceDir, 'community_likes_rows.csv')), false, 'no synthetic CSV is created');
});

test('count mismatch, malformed CSV and invalid values refuse partial import; FK failure rolls back users and rows', t => {
  const directory = temporary(t);
  const sourceDir = join(directory, 'source');
  const dataDir = join(directory, 'data');
  const input = records();
  const expectedCounts = fixture(sourceDir, input);
  assert.throws(() => importMiaoda({ sourceDir, dataDir, expectedCounts: { ...expectedCounts, meal_logs: 245 } }), /行数与导出页面不一致/);
  assert.equal(existsSync(dataDir), false);
  input.recipes[0].is_ai_generated = 'maybe';
  fixture(sourceDir, input);
  assert.throws(() => importMiaoda({ sourceDir, dataDir }), /有效布尔值/);
  assert.equal(existsSync(dataDir), false);
  input.recipes[0].is_ai_generated = false;
  input.recipes[0].owner_id = uid(999);
  fixture(sourceDir, input);
  assert.throws(() => importMiaoda({ sourceDir, dataDir }), /缺少关联账号/);
  const db = new DatabaseSync(join(dataDir, 'foodlight.sqlite'));
  assert.equal(db.prepare('SELECT count(*) AS count FROM users').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM profiles').get().count, 0);
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type='trigger'").get().count, 6);
  db.close();
  assert.equal(existsSync(join(dataDir, 'local-accounts.txt')), false);
  const reports = readdirSync(join(dataDir, 'import-reports'));
  const report = JSON.parse(readFileSync(join(dataDir, 'import-reports', reports[0]), 'utf8'));
  assert.equal(report.status, 'rolled-back');
  assert.equal(report.usersCreated, 0);
  assert.equal(report.tables.reduce((sum, table) => sum + table.inserted, 0), 0);
});
