// Resumable download from the official GitHub release API; no third-party mirror.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, rename } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = fileURLToPath(new URL('../../local-models/downloads/', import.meta.url));
const destination = path.join(directory, 'ollama-windows-amd64-v0.34.2.zip');
const total = 1460928014;
const checksum = '8f3fd071a2a2f9497b562f43502c77c2b701a99d1ee5dfda28da8c786373063b';
const asset = 'https://api.github.com/repos/ollama/ollama/releases/assets/571258336';
const count = 16;
const segmentSize = Math.ceil(total / count);
await mkdir(directory, { recursive: true });
const segments = Array.from({ length: count }, (_, index) => ({
  path: path.join(directory, `ollama-v0.34.2.part-${String(index).padStart(2, '0')}`),
  start: index * segmentSize, size: Math.min(segmentSize, total - index * segmentSize),
}));
const length = async (file) => (await stat(file).catch(() => ({ size: 0 }))).size;
let lastCompleted = 0;
let lastTime = Date.now();
const progress = setInterval(async () => {
  const done = (await Promise.all(segments.map((item) => length(item.path)))).reduce((sum, n) => sum + n, 0);
  const elapsed = (Date.now() - lastTime) / 1000;
  console.log(`Ollama ZIP ${(done / total * 100).toFixed(1)}% (${(done / 1024 / 1024).toFixed(0)} / ${(total / 1024 / 1024).toFixed(0)} MiB), ${((done - lastCompleted) / elapsed / 1024 / 1024).toFixed(2)} MiB/s`);
  lastCompleted = done; lastTime = Date.now();
}, 10000);

async function signedURL() {
  const response = await fetch(asset, { headers: { Accept: 'application/octet-stream' }, redirect: 'manual' });
  const location = response.headers.get('location');
  if (response.status !== 302 || !location || new URL(location).hostname !== 'release-assets.githubusercontent.com') throw Error('Official release API did not return the expected download host.');
  return location;
}

try {
  const url = await signedURL();
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < segments.length) {
      const item = segments[next++];
      for (let attempt = 1; attempt <= 5; attempt++) {
        const have = await length(item.path);
        if (have === item.size) break;
        if (have > item.size) throw Error(`Segment is larger than expected: ${item.path}`);
        try {
          const start = item.start + have;
          const end = item.start + item.size - 1;
          const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(15 * 60 * 1000) });
          if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${total}`) throw Error(`Invalid ranged download response: ${response.status}`);
          await pipeline(Readable.fromWeb(response.body), createWriteStream(item.path, { flags: 'a' }));
          if (await length(item.path) !== item.size) throw Error('Incomplete segment');
          break;
        } catch (error) {
          if (attempt === 5) throw error;
          console.log(`Retrying segment ${Math.floor(item.start / segmentSize)} (${attempt}/5)`);
        }
      }
    }
  }));
  clearInterval(progress);
  const assembled = `${destination}.assembling`;
  for (let index = 0; index < segments.length; index++) {
    await pipeline(createReadStream(segments[index].path), createWriteStream(assembled, { flags: index ? 'a' : 'w' }));
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(assembled)) hash.update(chunk);
  if (hash.digest('hex') !== checksum) throw Error('SHA256 mismatch: do not install this download.');
  if (await length(destination)) await rename(destination, `${destination}.single-partial`);
  await rename(assembled, destination);
  console.log(`Verified official Ollama v0.34.2 ZIP: ${destination}`);
} finally { clearInterval(progress); }
