import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(root, 'schema.sql'), 'utf8');
export const TABLES = ['profiles', 'recipes', 'meal_logs', 'weight_logs', 'community_posts',
  'community_comments', 'community_likes', 'community_favorites', 'community_follows', 'food_library'];
const JSON_COLUMNS = {
  recipes: ['ingredients', 'steps', 'nutrition'],
  community_posts: ['images', 'data', 'tags'],
  food_library: ['nutrition'],
};

// RFC 4180 parser. Preserve whether a value was quoted so a literal "NULL"
// remains text while an unquoted NULL or empty field can represent SQL NULL.
export function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], value = '', quoted = false, inQuotes = false, closed = false;
  const field = () => { row.push({ value, quoted }); value = ''; quoted = false; closed = false; };
  const line = () => {
    field();
    if (row.length !== 1 || row[0].value !== '' || row[0].quoted) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { inQuotes = false; closed = true; }
      else value += char;
    } else if (char === ',') field();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      line();
    } else if (char === '"' && value === '' && !closed) { quoted = true; inQuotes = true; }
    else {
      if (closed || char === '"') throw new Error(`CSV 第 ${rows.length + 1} 行引号格式错误`);
      value += char;
    }
  }
  if (inQuotes) throw new Error('CSV 引号未闭合，文件可能下载不完整');
  if (value !== '' || quoted || closed || row.length) line();
  if (!rows.length) throw new Error('CSV 缺少表头，不能把空文件视为零行导出');
  const headers = rows.shift().map(cell => cell.value.trim());
  if (headers.some(name => !name) || new Set(headers).size !== headers.length) throw new Error('CSV 表头为空或重复');
  rows.forEach((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV 第 ${index + 2} 行列数不完整：预期 ${headers.length}，实际 ${cells.length}`);
  });
  return { headers, rows };
}

// Supabase may serialize PostgreSQL text[] as either JSON or {"a","b"}.
export function parseTextArray(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some(value => value !== null && typeof value !== 'string')) throw new Error('文本数组包含非文本值');
    return parsed;
  }
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) throw new Error('无效的 PostgreSQL 文本数组');
  if (trimmed === '{}') return [];
  const content = trimmed.slice(1, -1);
  const result = [];
  let value = '', quoted = false, inQuotes = false, closed = false;
  const push = () => {
    const item = quoted ? value : value.trim();
    if (!quoted && !item) throw new Error('文本数组包含空的未加引号项');
    result.push(!quoted && item === 'NULL' ? null : item);
    value = ''; quoted = false; closed = false;
  };
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '\\') {
      if (++i >= content.length) throw new Error('文本数组转义不完整');
      value += content[i];
    } else if (inQuotes) {
      if (char === '"') { inQuotes = false; closed = true; }
      else value += char;
    } else if (char === ',') push();
    else if (char === '"' && value.trim() === '' && !closed) { value = ''; quoted = true; inQuotes = true; }
    else {
      if (char === '{' || char === '}' || char === '"' || (closed && char.trim())) throw new Error('文本数组格式错误');
      if (!closed) value += char;
    }
  }
  if (inQuotes) throw new Error('文本数组引号未闭合');
  push();
  return result;
}

function convertCell(cell, column, table) {
  const text = cell.value;
  if (!cell.quoted && (text === '' || text === 'NULL' || text === '\\N')) {
    if (column.notnull || column.pk) throw new Error(`必填字段 ${column.name} 为空`);
    return null;
  }
  if (JSON_COLUMNS[table]?.includes(column.name)) {
    return JSON.stringify(column.name === 'tags' ? parseTextArray(text) : JSON.parse(text));
  }
  if (column.name === 'is_ai_generated') {
    if (['true', 't', '1'].includes(text.toLowerCase())) return 1;
    if (['false', 'f', '0'].includes(text.toLowerCase())) return 0;
    throw new Error('is_ai_generated 不是有效布尔值');
  }
  if (/INT|REAL|NUMERIC/i.test(column.type)) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) throw new Error(`数值字段 ${column.name} 格式错误`);
    const number = Number(text);
    if (!Number.isFinite(number) || (/INT/i.test(column.type) && !Number.isSafeInteger(number))) throw new Error(`数值字段 ${column.name} 超出有效范围`);
    return number;
  }
  return text;
}

function readSources(sourceDir, allowPartial, expectedCounts) {
  if (expectedCounts) {
    for (const [table, count] of Object.entries(expectedCounts)) {
      if (!TABLES.includes(table) || !Number.isSafeInteger(count) || count < 0) throw new Error('expected-counts 必须是已验证表名与非负整数的映射');
    }
  }
  const model = new DatabaseSync(':memory:');
  model.exec(schema);
  const declaredEmpty = TABLES.filter(table => !existsSync(join(sourceDir, `${table}_rows.csv`)) && expectedCounts?.[table] === 0);
  const missing = TABLES.filter(table => !existsSync(join(sourceDir, `${table}_rows.csv`)) && !declaredEmpty.includes(table));
  if (missing.length && !allowPartial) {
    model.close();
    throw new Error(`缺少 ${missing.length} 个表的CSV：${missing.join(', ')}。必须补全，或明确使用 --allow-partial 并记录缺表。`);
  }
  if (missing.length === TABLES.length) { model.close(); throw new Error('目录内没有任何已验证业务表的 *_rows.csv'); }
  const sources = [];
  try {
    for (const table of TABLES.filter(name => !missing.includes(name))) {
      const file = `${table}_rows.csv`;
      const columns = model.prepare(`PRAGMA table_info(${table})`).all();
      if (declaredEmpty.includes(table)) {
        sources.push({ table, file: null, sourceStatus: 'declared-empty-no-csv', bytes: 0, sha256: null,
          headers: columns.map(column => column.name), rows: [] });
        continue;
      }
      const bytes = readFileSync(join(sourceDir, file));
      let parsed;
      try { parsed = parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch (e) { throw new Error(`${file}: ${e.message}`); }
      const known = new Map(columns.map(column => [column.name, column]));
      const unknown = parsed.headers.filter(name => !known.has(name));
      const absent = columns.map(column => column.name).filter(name => !parsed.headers.includes(name));
      if (unknown.length || absent.length) throw new Error(`${file} 表头不完整或不匹配；未知字段: ${unknown.join(', ') || '无'}；缺少字段: ${absent.join(', ') || '无'}`);
      const seen = new Set();
      const rows = parsed.rows.map((cells, rowIndex) => {
        try {
          const record = Object.fromEntries(parsed.headers.map((name, index) => [name, convertCell(cells[index], known.get(name), table)]));
          if (!record.id || seen.has(record.id)) throw new Error('记录UUID缺失或在CSV中重复');
          seen.add(record.id);
          return record;
        } catch (e) { throw new Error(`${file} 第 ${rowIndex + 2} 行：${e.message}`); }
      });
      if (expectedCounts && Object.hasOwn(expectedCounts, table) && expectedCounts[table] !== rows.length) {
        throw new Error(`${file} 行数与导出页面不一致：预期 ${expectedCounts[table]}，CSV实际 ${rows.length}`);
      }
      sources.push({ table, file, sourceStatus: 'csv-export', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), headers: parsed.headers, rows });
    }
  } finally { model.close(); }
  return { missing, sources };
}

export function importMiaoda({ sourceDir, dataDir = join(root, 'data'), allowPartial = false, expectedCounts = null }) {
  sourceDir = resolve(sourceDir);
  dataDir = resolve(dataDir);
  const { missing, sources } = readSources(sourceDir, allowPartial, expectedCounts);
  mkdirSync(dataDir, { recursive: true });
  const databasePath = join(dataDir, 'foodlight.sqlite');
  const hadDatabase = existsSync(databasePath);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const reportDir = join(dataDir, 'import-reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `miaoda-${runId}.json`);
  const accountsPath = join(dataDir, 'local-accounts.txt');
  const pendingAccountsPath = join(dataDir, `local-accounts.pending-${runId}.txt`);
  const report = {
    source: 'Miaoda database UI CSV export', startedAt: new Date().toISOString(), status: 'pending',
    sourceDir, databasePath, backupPath: null, coverage: missing.length ? 'partial' : 'all-ten-tables',
    cloudRowCountsVerified: Boolean(expectedCounts && TABLES.every(table => Object.hasOwn(expectedCounts, table))),
    missingTables: missing, usersCreated: 0, accountFile: null,
    tables: sources.map(source => ({ table: source.table, file: source.file, sourceStatus: source.sourceStatus, bytes: source.bytes, sha256: source.sha256,
      csvRows: source.rows.length, expectedRows: expectedCounts?.[source.table] ?? null, inserted: 0, skippedExistingId: 0 })),
  };
  const db = new DatabaseSync(databasePath);
  let inTransaction = false;
  let committed = false;
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    if (hadDatabase) {
      const backupDir = join(dataDir, 'backups');
      mkdirSync(backupDir, { recursive: true });
      report.backupPath = join(backupDir, `foodlight-before-miaoda-${runId}.sqlite`);
      db.prepare('VACUUM INTO ?').run(report.backupPath);
    }
    db.exec(schema);
    db.exec('BEGIN IMMEDIATE');
    inTransaction = true;
    // Imported post counters already include the exported reactions. Disable
    // only insert counter triggers transactionally, then restore their exact SQL.
    const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND name IN ('likes_insert','comments_insert','favorites_insert')").all();
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
    const accounts = [];
    for (const profile of sources.find(source => source.table === 'profiles')?.rows || []) {
      if (db.prepare('SELECT id FROM users WHERE id = ?').get(profile.id)) continue;
      const originalEmail = (profile.email || '').trim().toLowerCase();
      // The recovered app signs in with a 3–20 character username and @miaoda.com.
      // Keep the original profile email unchanged while choosing a usable local login.
      const email = /^[a-z0-9_]{3,20}@miaoda\.com$/.test(originalEmail) ? originalEmail : `import_${profile.id.replaceAll('-', '').slice(0, 12)}@miaoda.com`;
      if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)) throw new Error('导入账号邮箱已被另一个本地UUID使用；未覆盖现有账号，请先人工处理账号冲突');
      const password = randomBytes(18).toString('base64url');
      const salt = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?,?,?)').run(profile.id, email, scryptSync(password, salt, 64).toString('hex'), salt, profile.created_at);
      accounts.push({ id: profile.id, email, password });
    }
    report.usersCreated = accounts.length;
    for (const source of sources) {
      const stats = report.tables.find(entry => entry.table === source.table);
      const statement = db.prepare(`INSERT INTO ${source.table} (${source.headers.join(',')}) VALUES (${source.headers.map(() => '?').join(',')}) ON CONFLICT(id) DO NOTHING`);
      source.rows.forEach((row, index) => {
        try {
          const result = statement.run(...source.headers.map(name => row[name]));
          if (result.changes) stats.inserted++;
          else stats.skippedExistingId++;
        } catch (e) {
          if (/FOREIGN KEY constraint/i.test(e.message)) throw new Error(`${source.file} 第 ${index + 2} 行缺少关联账号、食谱或帖子；可能缺表或云端有关联孤立记录。全部新导入数据已回滚。`);
          throw new Error(`${source.file} 第 ${index + 2} 行无法导入：${e.message}`);
        }
      });
      stats.localTotalAfter = db.prepare(`SELECT count(*) AS count FROM ${source.table}`).get().count;
    }
    for (const trigger of triggers) db.exec(trigger.sql);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('外键完整性验证未通过，已回滚');
    if (accounts.length) {
      const previous = existsSync(accountsPath) ? readFileSync(accountsPath, 'utf8') : '食光 APP 本地账号\n此文件仅保存在本机，密码为导入时随机生成；不是原秒哒密码。请勿上传或分享。\n';
      const added = accounts.map(account => `UUID: ${account.id}\n邮箱: ${account.email}\n用户名: ${account.email.endsWith('@miaoda.com') ? account.email.slice(0, -11) : '请在支持邮箱的登录界面使用完整邮箱'}\n本地密码: ${account.password}\n`).join('\n');
      writeFileSync(pendingAccountsPath, `${previous}\n导入时间: ${new Date().toISOString()}\n${added}`, { flag: 'wx', mode: 0o600 });
    }
    db.exec('COMMIT');
    inTransaction = false;
    committed = true;
    if (accounts.length) {
      renameSync(pendingAccountsPath, accountsPath);
      report.accountFile = accountsPath;
    }
    report.status = 'success';
    report.finishedAt = new Date().toISOString();
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    return { ...report, reportPath };
  } catch (e) {
    if (inTransaction) db.exec('ROLLBACK');
    if (!committed && existsSync(pendingAccountsPath)) unlinkSync(pendingAccountsPath);
    report.status = committed ? 'committed-file-finalization-failed' : 'rolled-back';
    report.error = e.message;
    if (!committed) {
      report.usersCreated = 0;
      for (const stats of report.tables) { stats.attemptedInserted = stats.inserted; stats.inserted = 0; delete stats.localTotalAfter; }
    }
    if (committed && existsSync(pendingAccountsPath)) report.recoverAccountsFrom = pendingAccountsPath;
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(`${e.message}\n导入报告: ${reportPath}${report.recoverAccountsFrom ? `\n账号文件待完成重命名: ${pendingAccountsPath}` : ''}`);
  } finally { db.close(); }
}

function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--allow-partial') options.allowPartial = true;
    else if (argv[i] === '--data-dir' || argv[i] === '--expected-counts') {
      const key = argv[i] === '--data-dir' ? 'dataDir' : 'expectedCountsPath';
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${argv[i]} 缺少参数`);
      options[key] = argv[++i];
    } else if (!argv[i].startsWith('--') && !options.sourceDir) options.sourceDir = argv[i];
    else throw new Error(`未知参数: ${argv[i]}`);
  }
  if (!options.sourceDir) throw new Error('用法: node local-server/import-miaoda.mjs <CSV目录> [--data-dir <目录>] [--allow-partial] [--expected-counts <JSON文件>]');
  if (options.expectedCountsPath) options.expectedCounts = JSON.parse(readFileSync(options.expectedCountsPath, 'utf8').replace(/^\uFEFF/, ''));
  const result = importMiaoda(options);
  console.log(JSON.stringify({ status: result.status, coverage: result.coverage, cloudRowCountsVerified: result.cloudRowCountsVerified,
    missingTables: result.missingTables, tables: result.tables.map(({ table, csvRows, inserted, skippedExistingId }) => ({ table, csvRows, inserted, skippedExistingId })),
    usersCreated: result.usersCreated, accountFile: result.accountFile, backupPath: result.backupPath, reportPath: result.reportPath }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
