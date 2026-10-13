import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { getModelEnvironment, startModelService } from './model-service.mjs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const children = [];
const localEnv = getModelEnvironment();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function launch(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: appDir, stdio: 'inherit', windowsHide: true, env: { ...localEnv, ...env },
  });
  children.push(child);
  child.on('error', e => { console.error(e.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  const modelService = await startModelService({ env: localEnv });
  if (modelService.process) children.push(modelService.process);
} catch (e) {
  console.warn(`本地模型未启动：${e.message}。数据库和普通功能仍可使用。`);
}
const mediaPython = join(appDir, 'local-models/media-venv/Scripts/python.exe');
let mediaRunning = false;
try { mediaRunning = (await fetch('http://127.0.0.1:54322/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
if (!mediaRunning && existsSync(mediaPython)) {
  const media = spawn(mediaPython, ['local-server/media_server.py', '--ollama-model', localEnv.LOCAL_AI_MODEL], {
    cwd: appDir, env: localEnv, windowsHide: true, stdio: 'inherit',
  });
  media.on('error', e => console.warn(`本地音效服务未启动：${e.message}`));
  children.push(media);
}
let api;
try { api = await fetch('http://127.0.0.1:54321/health', { signal: AbortSignal.timeout(1200) }).then(r => r.json()); } catch {}
if (api && api.service !== 'foodlight-local') throw new Error('54321端口被其他服务占用，请先关闭该服务。');
if (!api) {
  launch(['local-server/server.mjs']);
  for (let attempt = 0; attempt < 40; attempt++) {
    try { api = await fetch('http://127.0.0.1:54321/health').then(r => r.json()); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!api) { stop(1); throw new Error('本地数据库服务启动失败。'); }
}
try {
  const existing = await fetch('http://localhost:19006', { signal: AbortSignal.timeout(1200) });
  if (existing.ok) {
    console.log('前端已经启动：http://localhost:19006');
    if (!children.length) process.exit(0);
  } else throw new Error('not running');
} catch {
  console.log('启动食光本地版：http://localhost:19006（首次编译请稍候）');
  launch([join(appDir, 'node_modules/expo/bin/cli'), 'start', '--web', '--port', '19006', '--host', 'localhost'], { EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1' });
}
