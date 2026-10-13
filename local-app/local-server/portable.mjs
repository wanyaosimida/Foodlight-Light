import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, createReadStream, statSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { getModelEnvironment, modelExecutable } from './model-service.mjs';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const root = dirname(app);
const python = join(root, 'runtime/python/python.exe');
const stateFile = join(root, 'runtime/portable-state.json');
const command = process.argv[2] || 'start';
const webPort = Number(process.env.PORTABLE_WEB_PORT || 19006);
const apiPort = Number(process.env.PORTABLE_API_PORT || 54321);
const mediaPort = Number(process.env.PORTABLE_MEDIA_PORT || 54322);
const modelPort = Number(process.env.PORTABLE_MODEL_PORT || 11434);
const env = {
  ...getModelEnvironment(),
  PATH: `${dirname(process.execPath)};${process.env.PATH || ''}`,
  LOCAL_DATA_DIR: join(app, 'local-server/data'),
  LOCAL_API_PORT: String(apiPort),
  OLLAMA_HOST: `127.0.0.1:${modelPort}`,
  OLLAMA_NO_CLOUD: '1',
  LOCAL_AI_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
  LOCAL_SOUND_URL: `http://127.0.0.1:${mediaPort}/v1/audio/sound`,
  LOCAL_IMAGE_GENERATION_URL: `http://127.0.0.1:${mediaPort}/v1/images/generations`,
  LOCAL_IMAGE_EDIT_URL: `http://127.0.0.1:${mediaPort}/v1/images/edits`,
  MEDIA_OLLAMA_URL: `http://127.0.0.1:${modelPort}`,
  MEDIA_IMAGE_BACKEND: process.env.MEDIA_IMAGE_BACKEND || 'auto',
  MEDIA_IMAGE_TIMEOUT_SECONDS: '900',
  LOCAL_AI_TIMEOUT_MS: '900000',
  EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1',
  EXPO_PUBLIC_LOCAL_MODE: 'true',
  EXPO_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${apiPort}`,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'local-development-key',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(2500) }); return r.ok ? await r.json() : null; }
  catch { return null; }
}
async function waitReady(url, ready = () => true, child) {
  for (let i = 0; i < 120; i++) {
    if (child && child.exitCode !== null) throw Error(`服务启动失败，退出码 ${child.exitCode}`);
    const result = await getJSON(url);
    if (result && ready(result)) return result;
    await sleep(500);
  }
  throw Error(`服务启动超时：${url}`);
}
async function portBusy(port) {
  return new Promise(resolveBusy => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); resolveBusy(value); };
    socket.setTimeout(1200, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
function restoreDependencies() {
  const archive = join(root, 'runtime/development-dependencies.zip');
  if (!existsSync(archive)) {
    const pnpm = join(root, 'tools/node_modules/pnpm/bin/pnpm.cjs');
    if (!existsSync(pnpm)) {
      const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
      if (!existsSync(npm)) throw Error('请下载完整 Node.js Windows ZIP，保留其中的 node_modules/npm 文件夹。');
      console.log('联网安装开发工具 pnpm 11.19.0……');
      const tool = spawnSync(process.execPath, [npm, 'install', '--prefix', join(root, 'tools'), '--no-audit', '--no-fund', 'pnpm@11.19.0'], { stdio: 'inherit', windowsHide: true });
      if (tool.status !== 0) throw Error('pnpm 下载失败，请检查网络后重试。');
    }
    console.log('根据锁文件联网安装开发依赖……');
    const result = spawnSync(process.execPath, [pnpm, 'install', '--frozen-lockfile'], { cwd: app, env, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw Error('开发依赖安装失败，请查看上方报错并检查网络。');
    return;
  }
  const marker = join(app, 'node_modules/.portable-ready');
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === root) return;
  if (!existsSync(marker)) {
    console.log('首次开发启动：正在解压包内依赖，无需联网安装……');
    const result = spawnSync(python, [join(app, 'local-server/portable-zip.py'), 'extract', archive, join(app, 'node_modules')], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw Error('开发依赖解压失败');
  }
  const links = JSON.parse(readFileSync(join(root, 'runtime/dependency-links.json'), 'utf8'));
  const modules = join(app, 'node_modules');
  for (const { path, target } of links) {
    const destination = resolve(modules, path);
    const targetPath = resolve(modules, target);
    if (!destination.startsWith(modules + sep) || !targetPath.startsWith(modules + sep)) throw Error('无效的依赖路径');
    try {
      const info = lstatSync(destination);
      if (!info.isSymbolicLink() || resolve(dirname(destination), readlinkSync(destination)) === targetPath) continue;
      unlinkSync(destination);
    } catch {}
    mkdirSync(dirname(destination), { recursive: true });
    symlinkSync(targetPath, destination, 'junction');
  }
  const bins = JSON.parse(readFileSync(join(root, 'runtime/dependency-bins.json'), 'utf8'));
  mkdirSync(join(modules, '.bin'), { recursive: true });
  for (const [name, target] of Object.entries(bins)) {
    writeFileSync(join(modules, '.bin', `${name}.cmd`),
      `@echo off\r\n"%~dp0..\\..\\..\\runtime\\node\\node.exe" "%~dp0..\\${target.replaceAll('/', '\\')}" %*\r\n`);
  }
  writeFileSync(marker, root + '\n');
}

if (command === 'stop') {
  if (!existsSync(stateFile)) { console.log('该迁移包没有正在运行的服务。'); process.exit(0); }
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  const response = await fetch(`http://127.0.0.1:${state.webPort}/__portable/stop`, {
    method: 'POST', headers: { Authorization: `Bearer ${state.token}` }, signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  if (!response?.ok) { console.log('该迁移包的服务已经停止。'); process.exit(0); }
  console.log('正在停止该迁移包的服务。');
  process.exit(0);
}
if (command === 'verify') {
  if (!existsSync(python)) throw Error('请先按下载说明把 Python 解压到 runtime/python，再运行完整性检查。');
  const result = spawnSync(python, [join(app, 'local-server/portable-zip.py'), 'verify', root], { stdio: 'inherit', windowsHide: true });
  process.exit(result.status ?? 1);
}
if (command === 'backup') {
  const result = spawnSync(process.execPath, [join(app, 'local-server/backup.mjs')], { env, stdio: 'inherit', windowsHide: true });
  process.exit(result.status ?? 1);
}
if (command === 'rebuild') {
  restoreDependencies();
  const result = spawnSync(process.execPath, [join(app, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', 'web'], { cwd: app, env, stdio: 'inherit', windowsHide: true });
  process.exit(result.status ?? 1);
}
if (command === 'install-deps') { restoreDependencies(); process.exit(0); }
if (command === 'check') {
  let failed = false;
  for (const [label, file] of [
    ['Python', python], ['Ollama', modelExecutable],
    ['SD-Turbo', join(app, 'local-models/image-runtime/sd_turbo.safetensors')],
    ['图片引擎', join(app, 'local-models/image-runtime/bin/sd-cli.exe')],
    ['网页', join(app, 'web/index.html')], ['数据库', join(app, 'local-server/data/foodlight.sqlite')],
  ]) {
    const present = existsSync(file);
    console.log(`${present ? '已找到' : '缺少'} ${label}：${file}`);
    if (!present) failed = true;
  }
  console.log(`Node.js：${process.version} (${process.arch})`);
  const manifest = join(root, 'local-models/models/manifests/registry.ollama.ai/library/qwen3-vl/4b-instruct');
  if (!existsSync(manifest)) { console.log('尚未下载 Qwen，请运行“下载Qwen模型.cmd”。'); failed = true; }
  if (!failed) console.log('所需资源路径均已找到；启动项目会进一步检查服务与模型。');
  process.exit(failed ? 1 : 0);
}
if (!['start', 'dev', 'basic', 'pull'].includes(command)) throw Error(`未知操作：${command}`);
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('此包需要 Windows 10/11 x64。');
if (Number(process.versions.node.split('.')[0]) < 24) throw Error('请使用说明中的 Node.js 24 x64。');
if (command === 'dev') restoreDependencies();
if (command === 'basic') {
  for (const key of ['LOCAL_AI_MODEL', 'LOCAL_AI_VISION_MODEL', 'LOCAL_SOUND_URL', 'LOCAL_IMAGE_GENERATION_URL', 'LOCAL_IMAGE_EDIT_URL']) env[key] = '';
}

if (command !== 'pull' && await portBusy(webPort)) {
  const existing = await getJSON(`http://127.0.0.1:${webPort}/__portable/health`);
  if (existing?.root === root) { console.log(`本迁移包已运行：http://localhost:${webPort}/home`); process.exit(0); }
  throw Error(`端口 ${webPort} 已被另一份项目占用。请先停止原项目，然后重新启动此包。`);
}
for (const port of command === 'pull' ? [modelPort] : command === 'basic' ? [apiPort] : [apiPort, mediaPort, modelPort]) {
  if (await portBusy(port)) throw Error(`端口 ${port} 被其他服务占用。请先关闭原项目或原 Ollama 服务。`);
}
for (const file of command === 'pull' ? [modelExecutable] : command === 'basic' ? [join(app, 'web/index.html')] : [python, modelExecutable, join(app, 'web/index.html')]) {
  if (!existsSync(file)) throw Error(`尚未下载或放置所需资源：${file}。请按“Windows下载与部署说明.md”操作。`);
}

const children = [];
let server;
let stopping = false;
const token = randomBytes(24).toString('hex');
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server?.close();
  server?.closeAllConnections();
  for (const child of children) {
    if (child.exitCode !== null) continue;
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
  if (existsSync(stateFile)) rmSync(stateFile);
  process.exitCode = code;
}
function launch(executable, args, cwd = app) {
  const child = spawn(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.once('error', error => { console.error(error.message); stop(1); });
  child.once('exit', code => { if (!stopping) { console.error(`服务退出：${executable} (${code})`); stop(code || 1); } });
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

try {
  if (command !== 'basic') {
  console.log('启动本地模型服务……');
  const ollama = launch(modelExecutable, ['serve'], dirname(modelExecutable));
  await waitReady(`http://127.0.0.1:${modelPort}/api/version`, undefined, ollama);
  if (command === 'pull') {
    console.log(`下载 ${env.LOCAL_AI_MODEL} 到 ${env.OLLAMA_MODELS}，请等待下载完成……`);
    const result = spawnSync(modelExecutable, ['pull', env.LOCAL_AI_MODEL], { env, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw Error('Qwen 下载失败，可以重新运行本脚本续传。');
    console.log('Qwen 下载完成。');
    stop(0);
    process.exit(0);
  }
  const models = await getJSON(`http://127.0.0.1:${modelPort}/api/tags`);
  if (!models?.models?.some(m => m.name === env.LOCAL_AI_MODEL)) throw Error('Qwen 模型没有找到，请运行“下载Qwen模型.cmd”。');
  const media = launch(python, [join(app, 'local-server/media_server.py'), '--port', String(mediaPort), '--ollama-model', env.LOCAL_AI_MODEL]);
  const mediaHealth = await waitReady(`http://127.0.0.1:${mediaPort}/health`, undefined, media);
  if (!mediaHealth.images?.ready || !mediaHealth.sound?.ready) throw Error('图片模型或媒体运行库未就绪。');
  console.log(`图片计算设备：${mediaHealth.images.backend}`);
  } else console.log('基础模式：启动网页和数据库；AI 与音效未启用。');
  const api = launch(process.execPath, [join(app, 'local-server/server.mjs')]);
  await waitReady(`http://127.0.0.1:${apiPort}/health`, h => h.service === 'foodlight-local', api);
  if (command === 'dev') {
    launch(process.execPath, [join(app, 'node_modules/expo/bin/cli'), 'start', '--web', '--port', String(webPort), '--host', 'localhost']);
    console.log(`开发服务正在编译：http://localhost:${webPort}/home`);
  } else {
    const web = join(app, 'web');
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.wav': 'audio/wav' };
    server = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${webPort}`);
      if (url.pathname === '/__portable/health') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: true, root, mode: 'portable', apiPort }));
      }
      if (url.pathname === '/__portable/stop' && req.method === 'POST') {
        if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403); return res.end(); }
        res.end('Stopping'); setTimeout(() => stop(), 50); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
      let file = resolve(web, '.' + pathname);
      if (file !== web && !file.startsWith(web + sep)) { res.writeHead(403); return res.end(); }
      if (file === web || !extname(pathname)) file = join(web, 'index.html');
      if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cache-Control', 'no-cache');
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    });
    await new Promise((ready, reject) => { server.once('error', reject); server.listen(webPort, '127.0.0.1', ready); });
    writeFileSync(stateFile, JSON.stringify({ token, root, webPort, pid: process.pid }));
    console.log(`食光已启动：http://localhost:${webPort}/home`);
    console.log('关闭服务请运行“停止项目.cmd”，或在当前窗口按 Ctrl+C。');
    if (process.env.PORTABLE_NO_BROWSER !== '1') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', `http://localhost:${webPort}/home`], { windowsHide: true, stdio: 'ignore' }).unref();
  }
} catch (error) {
  console.error(`启动失败：${error.message}`);
  stop(1);
}
