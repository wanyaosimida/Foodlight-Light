import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { mirrorAssets, archiveStorageFiles } from './mirror-assets.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const source = 'https://miaoda-site-img.cdn.bcebos.com/original.png';

function setup(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'foodlight-assets-test-'));
  const db = new DatabaseSync(join(dataDir, 'foodlight.sqlite'));
  t.after(() => {
    db.close();
    assert.equal(dirname(resolve(dataDir)), resolve(tmpdir()));
    assert.ok(dataDir.includes('foodlight-assets-test-'));
    rmSync(dataDir, { recursive: true, force: true });
  });
  db.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));
  db.prepare('INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?,?,?)').run('user', 'assets@example.test', 'test', 'test', '2026-01-01');
  db.prepare('INSERT INTO recipes(id,owner_id,title,cover_url,steps,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('recipe', 'user', 'Test recipe', source, JSON.stringify([{ text: 'Do not follow https://unrelated.example/page', image_url: source }]), '2026-01-01', '2026-01-01');
  return { dataDir, db };
}

test('read-only inventory; real image bytes, provenance, backup, nested rewrite and idempotency', async t => {
  const { dataDir, db } = setup(t);
  let fetches = 0;
  const fetchImpl = async (url, options) => {
    fetches++;
    assert.equal(url, source);
    assert.equal(options.redirect, 'error');
    return new Response(image, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(image.length) } });
  };
  const beforeFiles = readdirSync(dataDir);
  const inventory = await mirrorAssets({ dataDir, fetchImpl });
  assert.equal(inventory.remoteUnique, 1);
  assert.equal(fetches, 0);
  assert.deepEqual(readdirSync(dataDir), beforeFiles);
  const result = await mirrorAssets({ dataDir, apply: true, fetchImpl });
  assert.equal(result.downloaded, 1);
  assert.equal(result.changedFields, 2);
  assert.equal(result.failures, 0);
  assert.equal(fetches, 1);
  const recipe = db.prepare('SELECT cover_url,steps FROM recipes').get();
  assert.match(recipe.cover_url, /^images\/mirror_[a-f0-9]{64}\.png$/);
  assert.deepEqual(readFileSync(join(dataDir, recipe.cover_url)), image);
  assert.equal(JSON.parse(recipe.steps)[0].image_url, recipe.cover_url);
  assert.equal(JSON.parse(recipe.steps)[0].text, 'Do not follow https://unrelated.example/page');
  assert.equal(db.prepare('SELECT content_type FROM storage_objects').get().content_type, 'image/png');
  const backup = new DatabaseSync(result.backupPath, { readOnly: true });
  assert.equal(backup.prepare('SELECT cover_url FROM recipes').get().cover_url, source);
  backup.close();
  const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
  assert.equal(manifest.mappings[0].source, source);
  const repeated = await mirrorAssets({ dataDir, apply: true, fetchImpl });
  assert.equal(repeated.changedFields, 0);
  assert.equal(fetches, 1);
  assert.equal(JSON.parse(readFileSync(result.manifestPath, 'utf8')).mappings.length, 1);
});

test('failed, HTML, unknown-host and missing cloud storage assets preserve their references', async t => {
  const { dataDir, db } = setup(t);
  db.prepare('UPDATE recipes SET steps=?').run(JSON.stringify([{ image_url: 'https://unknown.example/photo.png' }, { image_url: 'images/missing-original.jpg' }]));
  const result = await mirrorAssets({ dataDir, apply: true, fetchImpl: async () => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }) });
  assert.equal(result.changedFields, 0);
  assert.equal(result.failures, 3);
  assert.equal(db.prepare('SELECT cover_url FROM recipes').get().cover_url, source);
  assert.equal(readdirSync(join(dataDir, 'images')).length, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM storage_objects').get().n, 0);
  assert.equal(existsSync(join(dataDir, 'backups')), false);
});

test('concurrent user edits are never overwritten while original images download', async t => {
  const { dataDir, db } = setup(t);
  const result = await mirrorAssets({ dataDir, apply: true, fetchImpl: async () => {
    db.prepare('UPDATE recipes SET cover_url=?').run('images/new-user-photo.jpg');
    return new Response(image, { headers: { 'content-type': 'image/png' } });
  } });
  assert.equal(db.prepare('SELECT cover_url FROM recipes').get().cover_url, 'images/new-user-photo.jpg');
  assert.equal(result.changedFields, 1);
  assert.equal(result.failures, 1);
});

test('downloaded Storage originals are copied without business-record changes; orphan ownership is documented', t => {
  const { dataDir, db } = setup(t);
  const sourceDir = join(dataDir, 'original-downloads');
  mkdirSync(sourceDir);
  writeFileSync(join(sourceDir, 'referenced.png'), image);
  writeFileSync(join(sourceDir, 'orphan.png'), image);
  db.prepare('UPDATE recipes SET cover_url=?').run('images/referenced.png');
  const originalRecipes = db.prepare('SELECT * FROM recipes').all();
  const result = archiveStorageFiles({ sourceDir, names: ['referenced.png', 'orphan.png'], dataDir });
  assert.equal(result.archived, 2);
  assert.equal(result.unreferencedArchives, 1);
  assert.equal(result.references, 1);
  assert.deepEqual(db.prepare('SELECT * FROM recipes').all(), originalRecipes);
  for (const name of ['referenced.png', 'orphan.png']) {
    assert.deepEqual(readFileSync(join(sourceDir, name)), image);
    assert.deepEqual(readFileSync(join(dataDir, 'images', name)), image);
  }
  const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
  assert.match(manifest.files.find(file => file.name === 'orphan.png').ownerPolicy, /^unreferenced-storage-archive/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM storage_objects').get().n, 2);
  archiveStorageFiles({ sourceDir, names: ['referenced.png', 'orphan.png'], dataDir });
  assert.equal(db.prepare('SELECT count(*) AS n FROM storage_objects').get().n, 2);
});
