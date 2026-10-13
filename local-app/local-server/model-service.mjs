import { readFileSync, existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const modelRoot = fileURLToPath(new URL('../../local-models/', import.meta.url));
export const modelExecutable = path.join(modelRoot, 'ollama', 'ollama.exe');
const config = JSON.parse(readFileSync(new URL('./ai-config.json', import.meta.url), 'utf8'));

/** Local defaults plus explicit caller overrides; OLLAMA_MODELS stays in this project. */
export function getModelEnvironment(base = process.env) {
  return { ...config, ...base, OLLAMA_MODELS: path.join(modelRoot, 'models') };
}

export async function probeModelService() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(1000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/** Returns {process:null,...} for an already-running service; caller must not stop it. */
export async function startModelService({ env = getModelEnvironment(), detached = false } = {}) {
  const existing = await probeModelService();
  if (existing) return { process: null, alreadyRunning: true, version: existing.version };
  if (!existsSync(modelExecutable)) throw Error(`Portable Ollama is missing: ${modelExecutable}`);
  const logDirectory = path.join(modelRoot, 'logs');
  mkdirSync(logDirectory, { recursive: true });
  const stdout = openSync(path.join(logDirectory, 'ollama.stdout.log'), 'a');
  const stderr = openSync(path.join(logDirectory, 'ollama.stderr.log'), 'a');
  const child = spawn(modelExecutable, ['serve'], { env, cwd: path.dirname(modelExecutable), windowsHide: true, detached, stdio: ['ignore', stdout, stderr] });
  closeSync(stdout); closeSync(stderr);
  let spawnError;
  child.once('error', (error) => { spawnError = error; });
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw Error(`Ollama exited. Check ${logDirectory}`);
    const ready = await probeModelService();
    if (ready) {
      if (detached) child.unref();
      return { process: child, alreadyRunning: false, version: ready.version };
    }
  }
  child.kill();
  throw Error(`Ollama startup timed out. Check ${logDirectory}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = await startModelService({ detached: true });
  console.log(`Ollama ${service.version} ${service.alreadyRunning ? 'already running' : `started, PID ${service.process.pid}`} at 127.0.0.1:11434.`);
}
