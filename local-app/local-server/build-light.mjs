import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = resolve(process.argv[2] || join(dirname(app), '迁移包/Foodlight-Light'));
if (existsSync(destination)) throw Error(`目标已经存在，避免覆盖：${destination}`);
mkdirSync(destination, { recursive: true });
function copyTree(source, target, exclude = () => false) {
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) {
    if (exclude(name)) continue;
    const file = join(source, name);
    const info = lstatSync(file);
    if (info.isSymbolicLink()) throw Error(`轻量包不复制原电脑目录链接：${file}`);
    if (info.isDirectory()) copyTree(file, join(target, name), exclude);
    else copyFileSync(file, join(target, name));
  }
}
const saved = join(destination, 'local-app');
mkdirSync(saved, { recursive: true });
for (const name of ['src', 'assets', 'supabase']) copyTree(join(app, name), join(saved, name));
for (const name of readdirSync(app)) {
  if (lstatSync(join(app, name)).isFile() && !['.env', 'start-local.cmd'].includes(name)) copyFileSync(join(app, name), join(saved, name));
}
copyTree(join(app, 'local-server'), join(saved, 'local-server'), name => ['data', '__pycache__'].includes(name) || name.endsWith('.pyc'));
copyTree(join(app, 'dist-portable'), join(saved, 'web'));
const data = join(saved, 'local-server/data');
mkdirSync(data, { recursive: true });
const databaseFile = join(data, 'foodlight.sqlite');
const source = new DatabaseSync(join(app, 'local-server/data/foodlight.sqlite'), { readOnly: true });
source.exec('PRAGMA busy_timeout = 10000');
source.prepare('VACUUM INTO ?').run(databaseFile);
source.close();
const db = new DatabaseSync(databaseFile);
db.exec('DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('轻量包数据库快照校验失败');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const counts = Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT count(*) n FROM "${name}"`).get().n]));
db.close();
for (const name of ['images', 'generated-media']) if (existsSync(join(app, 'local-server/data', name))) copyTree(join(app, 'local-server/data', name), join(data, name));
for (const name of ['local-accounts.txt', 'asset-mirror-manifest.json', 'storage-recovery-report.json']) {
  if (existsSync(join(app, 'local-server/data', name))) copyFileSync(join(app, 'local-server/data', name), join(data, name));
}
for (const [name, action] of Object.entries({
  '启动项目.cmd': 'start', '仅启动基础功能.cmd': 'basic', '下载Qwen模型.cmd': 'pull',
  '检查运行环境.cmd': 'check', '安装开发依赖.cmd': 'install-deps', '开发模式.cmd': 'dev',
  '重新构建网页.cmd': 'rebuild', '停止项目.cmd': 'stop', '检查完整性.cmd': 'verify', '备份数据库.cmd': 'backup',
})) {
  writeFileSync(join(destination, name), `@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nset PYTHONDONTWRITEBYTECODE=1\r\nif not exist "%~dp0runtime\\node\\node.exe" (\r\n  echo 请先按“Windows下载与部署说明.md”下载 Node.js 并解压到 runtime\\node\\。\r\n  pause\r\n  exit /b 1\r\n)\r\n"%~dp0runtime\\node\\node.exe" "%~dp0local-app\\local-server\\portable.mjs" ${action}\r\npause\r\n`);
}
copyFileSync(join(app, 'local-server/LIGHT-README.md'), join(destination, 'Windows下载与部署说明.md'));
copyFileSync(join(app, 'local-server/download-resources.json'), join(destination, '下载资源.json'));
writeFileSync(join(destination, 'PACKAGE-INFO.json'), JSON.stringify({
  distribution: 'light', target: 'Windows 10/11 x64', created: new Date().toISOString(),
  databaseCounts: counts,
  included: ['前后端源码', '已编译网页', 'SQLite 账号与业务数据', '上传图片', '已生成媒体', '启动脚本', '下载链接和详细说明'],
  excluded: ['Qwen 模型', 'SD-Turbo 模型', 'Node.js', 'Python', 'Ollama', '图片推理引擎', 'node_modules', '离线依赖 ZIP', '缓存', '日志', '重复下载', '历史备份', '旧登录会话'],
}, null, 2));
console.log(`轻量包准备完成：${destination}`);
console.log(JSON.stringify(counts));
