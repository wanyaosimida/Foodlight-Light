import { existsSync, mkdirSync, readdirSync, lstatSync, readlinkSync, copyFileSync, readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const project = dirname(app);
const destination = resolve(process.argv[2] || join(project, '迁移包/Foodlight-Portable'));
const pythonSource = process.argv[3] || 'C:/Users/tang/AppData/Local/Programs/Python/Python311';
const cache = join(dirname(destination), 'build-cache');
if (existsSync(destination) && !process.argv.includes('--resume')) throw Error(`目标目录已存在，避免覆盖已有迁移包：${destination}`);
mkdirSync(destination, { recursive: true });
mkdirSync(cache, { recursive: true });

function copyTree(source, target, exclude = () => false, parent = '') {
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) {
    const subpath = parent ? `${parent}/${name}` : name;
    if (exclude(subpath, name)) continue;
    const original = join(source, name);
    const saved = join(target, name);
    const info = lstatSync(original);
    if (info.isSymbolicLink()) throw Error(`不允许复制绑定原路径的链接：${original}`);
    if (info.isDirectory()) copyTree(original, saved, exclude, subpath);
    else if (!existsSync(saved) || statSync(saved).size !== info.size) copyFileSync(original, saved);
  }
}
const savedApp = join(destination, 'local-app');
mkdirSync(savedApp, { recursive: true });
for (const directory of ['src', 'assets', 'supabase']) copyTree(join(app, directory), join(savedApp, directory));
for (const item of readdirSync(app)) {
  if (!lstatSync(join(app, item)).isFile() || item === '.env') continue;
  copyFileSync(join(app, item), join(savedApp, item));
}
copyTree(join(app, 'local-server'), join(savedApp, 'local-server'), (path, name) =>
  name === '__pycache__' || name.endsWith('.pyc') || name === 'data');
copyTree(join(app, 'dist-portable'), join(savedApp, 'web'));

console.log('创建一致性 SQLite 数据快照……');
const data = join(savedApp, 'local-server/data');
mkdirSync(data, { recursive: true });
const sourceDB = new DatabaseSync(join(app, 'local-server/data/foodlight.sqlite'));
sourceDB.exec('PRAGMA busy_timeout = 10000');
if (!existsSync(join(data, 'foodlight.sqlite'))) sourceDB.prepare('VACUUM INTO ?').run(join(data, 'foodlight.sqlite'));
sourceDB.close();
const database = new DatabaseSync(join(data, 'foodlight.sqlite'));
if (database.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('数据库快照校验失败');
const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const counts = Object.fromEntries(tables.map(({ name }) => [name, database.prepare(`SELECT count(*) n FROM ${name}`).get().n]));
// 会话是原浏览器的临时登录态；账号、密码哈希和全部业务记录继续保留。
database.exec('DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
database.close();
for (const directory of ['images', 'generated-media']) {
  const original = join(app, 'local-server/data', directory);
  if (existsSync(original)) copyTree(original, join(data, directory));
}
for (const name of ['local-accounts.txt', 'asset-mirror-manifest.json', 'storage-recovery-report.json']) {
  const original = join(app, 'local-server/data', name);
  if (existsSync(original)) copyFileSync(original, join(data, name));
}

console.log('复制便携模型与运行库……');
for (const directory of ['models', 'ollama']) copyTree(join(project, 'local-models', directory), join(destination, 'local-models', directory));
copyTree(join(app, 'local-models/image-runtime'), join(savedApp, 'local-models/image-runtime'),
  (path, name) => name.endsWith('.zip') || name.endsWith('.png') || name === 'image-edit-verification.json');
const savedNode = join(destination, 'runtime/node');
mkdirSync(savedNode, { recursive: true });
copyFileSync(process.execPath, join(savedNode, 'node.exe'));
const nodeDirectory = dirname(process.execPath);
for (const name of ['npm.cmd', 'npx.cmd']) {
  if (existsSync(join(nodeDirectory, name))) copyFileSync(join(nodeDirectory, name), join(savedNode, name));
}
if (existsSync(join(nodeDirectory, 'node_modules/npm'))) copyTree(join(nodeDirectory, 'node_modules/npm'), join(savedNode, 'node_modules/npm'));
const savedPython = join(destination, 'runtime/python');
mkdirSync(savedPython, { recursive: true });
for (const name of readdirSync(pythonSource)) {
  if (/^(?:python(?:w|3|311)?\.(?:exe|dll)|vcruntime[^/]*\.dll|LICENSE\.txt)$/.test(name)) copyFileSync(join(pythonSource, name), join(savedPython, name));
}
copyTree(join(pythonSource, 'DLLs'), join(savedPython, 'DLLs'), (path, name) => name.endsWith('.pdb'));
copyTree(join(pythonSource, 'Lib'), join(savedPython, 'Lib'), (path, name) =>
  ['site-packages', 'test', 'tests', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', '__pycache__'].includes(name) || name.endsWith('.pyc'));
writeFileSync(join(savedPython, 'python311._pth'), '.\nLib\nDLLs\n../../local-app/local-server\nimport site\n');

console.log('归档离线开发依赖，移除原电脑绝对路径……');
const modules = join(app, 'node_modules');
const files = [];
const links = [];
function inventory(folder) {
  for (const name of readdirSync(folder)) {
    const full = join(folder, name);
    if (full === join(modules, '.pnpm-config') || full === join(modules, '.bin')) continue;
    const info = lstatSync(full);
    const entry = relative(modules, full).split(sep).join('/');
    if (info.isSymbolicLink()) {
      const target = resolve(dirname(full), readlinkSync(full));
      if (!target.startsWith(modules + sep)) throw Error(`依赖指向工程外部：${full}`);
      links.push({ path: entry, target: relative(modules, target).split(sep).join('/') });
    } else if (info.isDirectory()) inventory(full);
    else if (!entry.startsWith('.bin/') && !entry.startsWith('.pnpm-config/')) files.push(entry);
  }
}
inventory(modules);
writeFileSync(join(cache, 'dependency-files.json'), JSON.stringify(files));
writeFileSync(join(destination, 'runtime/dependency-links.json'), JSON.stringify(links));
const bins = {};
const packageJson = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
for (const name of Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
  const file = join(modules, name, 'package.json');
  if (!existsSync(file)) continue;
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const entries = typeof spec.bin === 'string' ? { [basename(name)]: spec.bin } : spec.bin || {};
  for (const [bin, entry] of Object.entries(entries)) bins[bin] = `${name}/${entry}`;
}
writeFileSync(join(destination, 'runtime/dependency-bins.json'), JSON.stringify(bins));
const archiveResult = spawnSync(join(savedPython, 'python.exe'), [join(savedApp, 'local-server/portable-zip.py'), 'archive-files', modules, join(destination, 'runtime/development-dependencies.zip'), join(cache, 'dependency-files.json')], { stdio: 'inherit', windowsHide: true });
if (archiveResult.status !== 0) throw Error('离线开发依赖归档失败');
for (const [name, action] of Object.entries({ '启动项目.cmd': 'start', '开发模式.cmd': 'dev', '重新构建网页.cmd': 'rebuild', '停止项目.cmd': 'stop', '检查完整性.cmd': 'verify', '备份数据库.cmd': 'backup' })) {
  writeFileSync(join(destination, name), `@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node\\node.exe" "%~dp0local-app\\local-server\\portable.mjs" ${action}\r\npause\r\n`);
}
copyFileSync(join(app, 'local-server/PORTABLE-README.md'), join(destination, '使用说明.md'));
for (const [source, target] of [['NODE-LICENSE.txt', 'runtime/node/LICENSE.txt'], ['OLLAMA-LICENSE.txt', 'local-models/ollama/LICENSE.txt']]) {
  if (existsSync(join(cache, source))) copyFileSync(join(cache, source), join(destination, target));
}
writeFileSync(join(destination, 'PACKAGE-INFO.json'), JSON.stringify({
  target: 'Windows 10/11 x64', snapshotCreated: new Date().toISOString(),
  node: process.version, python: '3.11.9', ollama: '0.34.2',
  model: 'qwen3-vl:4b-instruct', imageModel: 'SD-Turbo',
  databaseCounts: { ...counts, sessions: 0 }, dependencyFiles: files.length, dependencyLinks: links.length,
  sources: { python: 'https://www.python.org/downloads/release/python-3119/', node: `https://nodejs.org/download/release/${process.version}/`,
    ollama: 'https://github.com/ollama/ollama/releases/tag/v0.34.2' },
  excluded: ['APK 提取与恢复目录', '下载 ZIP/分片', '原 Python 虚拟环境', 'Expo/Metro 缓存', '日志', '历史备份', '重复 CSV 导出', '测试图片和测试报告', '旧会话', '绝对路径依赖链接'],
}, null, 2));
console.log(`迁移包目录已准备：${destination}`);
console.log(`数据表计数：${JSON.stringify(counts)}`);

export async function sealPackage(root = destination) {
  const entries = [];
  async function walk(folder) {
    for (const name of readdirSync(folder).sort()) {
      if (name === 'PACKAGE-MANIFEST.json' || name === 'portable-state.json' || name === '__pycache__' || name === 'logs') continue;
      const file = join(folder, name);
      const info = lstatSync(file);
      if (info.isSymbolicLink()) throw Error(`迁移包中存在绝对路径链接：${file}`);
      if (info.isDirectory()) await walk(file);
      else {
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(file)) hash.update(chunk);
        entries.push({ path: relative(root, file).split(sep).join('/'), bytes: info.size, sha256: hash.digest('hex') });
        if (info.size > 100 * 1024 * 1024) console.log(`已校验：${relative(root, file)}`);
      }
    }
  }
  await walk(root);
  writeFileSync(join(root, 'PACKAGE-MANIFEST.json'), JSON.stringify({ created: new Date().toISOString(), files: entries, totalBytes: entries.reduce((n, e) => n + e.bytes, 0) }, null, 2));
  console.log(`已生成 ${entries.length} 个文件的 SHA256 清单。`);
}
await sealPackage();
