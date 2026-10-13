import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(process.argv[2]);
const app = join(root, 'local-app');
const report = { verifiedAt: new Date().toISOString(), packageRoot: root, checks: {} };
const checks = report.checks;
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(900000) });
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  return response.json();
}
const post = payload => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
assert.ok(process.execPath.startsWith(join(root, 'runtime/node')));
const controller = await json('http://127.0.0.1:19006/__portable/health');
assert.equal(controller.root, root);
checks.portableController = true;
const api = await json('http://127.0.0.1:54321/health');
assert.equal(api.service, 'foodlight-local');
checks.api = api.ok;
const media = await json('http://127.0.0.1:54322/health');
assert.equal(media.images.ready, true);
assert.equal(media.sound.ready, true);
checks.imageBackend = media.images.backend;
const html = await fetch('http://127.0.0.1:19006/stats').then(r => r.text());
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
assert.ok(scripts.length);
for (const source of scripts) assert.equal((await fetch(`http://127.0.0.1:19006${source}`)).status, 200);
checks.webRoutesAndScripts = true;

const database = new DatabaseSync(join(app, 'local-server/data/foodlight.sqlite'), { readOnly: true });
assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
checks.databaseIntegrity = true;
const accounts = readFileSync(join(app, 'local-server/data/local-accounts.txt'), 'utf8');
const account = accounts.split('UUID:').find(s => s.includes('邮箱: user@miaoda.com'));
const password = /本地密码:\s*(\S+)/.exec(account)[1];
const session = await json('http://127.0.0.1:54321/auth/v1/token?grant_type=password', post({ email: 'user@miaoda.com', password }));
const headers = { Authorization: `Bearer ${session.access_token}` };
for (const table of ['meal_logs', 'weight_logs', 'recipes']) {
  const rows = await json(`http://127.0.0.1:54321/rest/v1/${table}?owner_id=eq.${session.user.id}&limit=1000`, { headers });
  assert.equal(rows.length, database.prepare(`SELECT count(*) n FROM ${table} WHERE owner_id=?`).get(session.user.id).n);
  checks[table] = rows.length;
}
database.close();
checks.login = true;
console.log('包内登录、数据、网页资源检查通过。');

const text = await json('http://127.0.0.1:11434/api/chat', post({ model: 'qwen3-vl:4b-instruct',
  stream: false, think: false, messages: [{ role: 'user', content: '只回复中文的“本地迁移成功”五个字。' }],
  options: { num_predict: 30, num_ctx: 2048, temperature: 0 } }));
assert.ok(text.message?.content?.trim());
checks.textModel = { response: text.message.content.trim(), local: true };
console.log('真实文字模型推理通过。');

const foodPhoto = readFileSync(join(app, 'assets/featured/f1.png')).toString('base64');
const vision = await json('http://127.0.0.1:11434/api/chat', post({ model: 'qwen3-vl:4b-instruct',
  stream: false, think: false, messages: [{ role: 'user', content: '用中文简短描述这张食物图片。', images: [foodPhoto] }],
  options: { num_predict: 80, num_ctx: 2048, temperature: 0 } }));
assert.ok(vision.message?.content?.trim());
checks.visionModel = { response: vision.message.content.trim(), local: true };
console.log('真实视觉模型推理通过。');

const sound = await json('http://127.0.0.1:54322/v1/audio/sound', post({ prompt: '厨房切菜音效', duration: 1 }));
const wav = Buffer.from(await fetch(sound.data[0].url).then(r => r.arrayBuffer()));
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
checks.sound = { bytes: wav.length, local: true };
const image = await json('http://127.0.0.1:54322/v1/images/generations', post({ prompt: 'a colorful healthy vegetable salad, food illustration', size: '512x512', n: 1 }));
const png = Buffer.from(image.data[0].b64_json, 'base64');
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 512);
assert.equal(png.readUInt32BE(20), 512);
checks.imageModel = { bytes: png.length, width: 512, height: 512, local: true };
console.log('真实图片模型与音效检查通过。');
writeFileSync(join(root, 'VALIDATION-REPORT.json'), JSON.stringify(report, null, 2));
console.log('全部迁移运行检查通过。');
