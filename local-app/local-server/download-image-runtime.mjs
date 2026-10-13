// Resumable public artifacts; verify hashes from the original publishers before use.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../local-models/image-runtime/', import.meta.url));
const artifacts = [
  { file: 'runtime-vulkan.zip', size: 31932748, sha256: '744c8f817c66ecfd02fbb9dc8b122e1f29f7240db1f6086dfde2669403c5d896',
    url: 'https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/assets/579551453',
    source: 'https://github.com/leejet/stable-diffusion.cpp/releases/tag/master-890-74988b2' },
  { file: 'sd_turbo.safetensors', size: 5214561328, sha256: '3f067a1b943cf162f2b8f8588f6cf5824bd5b4c7d1d88d87164b9ca123616549',
    url: 'https://modelscope.cn/models/AI-ModelScope/sd-turbo/resolve/master/sd_turbo.safetensors',
    initialMirror: 'https://hf-mirror.com/stabilityai/sd-turbo/resolve/b261bac6fd2cf515557d5d0707481eafa0485ec2/sd_turbo.safetensors',
    source: 'https://huggingface.co/stabilityai/sd-turbo/blob/b261bac6fd2cf515557d5d0707481eafa0485ec2/sd_turbo.safetensors' },
];
const length = async p => (await stat(p).catch(() => ({ size: 0 }))).size;
async function hashFile(p) { const hash = createHash('sha256'); for await (const chunk of createReadStream(p)) hash.update(chunk); return hash.digest('hex'); }
await mkdir(root, { recursive: true });
for (const artifact of artifacts) {
  if (process.argv[2] && artifact.file !== process.argv[2]) continue;
  const destination = path.join(root, artifact.file);
  if (await length(destination) === artifact.size && await hashFile(destination) === artifact.sha256) { console.log(`${artifact.file}: already verified`); continue; }
  const segmentSize = 128 * 1024 * 1024;
  const count = Math.ceil(artifact.size / segmentSize);
  const segments = Array.from({ length: count }, (_, i) => ({ path: `${destination}.part-${i}`, start: i * segmentSize, size: Math.min(segmentSize, artifact.size - i * segmentSize) }));
  const head = await fetch(artifact.url, { method: artifact.file.endsWith('.safetensors') ? 'GET' : 'HEAD', headers: { Accept: 'application/octet-stream', Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30000) });
  if (!head.ok) throw Error(`Download unavailable: ${head.status}`);
  const downloadUrl = head.url;
  await head.body?.cancel();
  const host = new URL(downloadUrl).hostname;
  if (!['release-assets.githubusercontent.com', 'github.com', 'hf-mirror.com', 'cas-bridge.xethub.hf.co', 'cdn-lfs-cn-1.modelscope.cn'].includes(host)) throw Error(`Unexpected artifact host: ${host}`);
  let next = 0;
  const progress = setInterval(async () => {
    const bytes = (await Promise.all(segments.map(s => length(s.path)))).reduce((a, b) => a + b, 0);
    console.log(`${artifact.file}: ${(bytes / artifact.size * 100).toFixed(1)}% (${(bytes / 1048576).toFixed(0)} / ${(artifact.size / 1048576).toFixed(0)} MiB)`);
  }, 15000);
  try {
    await Promise.all(Array.from({ length: Math.min(8, count) }, async () => {
      while (next < segments.length) {
        const segment = segments[next++];
        for (let attempt = 0; attempt < 4; attempt++) {
          const have = await length(segment.path);
          if (have === segment.size) break;
          if (have > segment.size) throw Error('Oversized artifact segment');
          const start = segment.start + have, end = segment.start + segment.size - 1;
          try {
            const response = await fetch(downloadUrl, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(300000) });
            if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${artifact.size}`) throw Error(`Invalid download range: ${response.status}`);
            await pipeline(Readable.fromWeb(response.body), createWriteStream(segment.path, { flags: 'a' }));
            if (await length(segment.path) !== segment.size) throw Error('Incomplete download');
            break;
          } catch (e) { if (attempt === 3) throw e; }
        }
      }
    }));
    const assembled = `${destination}.assembling`;
    for (let i = 0; i < segments.length; i++) await pipeline(createReadStream(segments[i].path), createWriteStream(assembled, { flags: i ? 'a' : 'w' }));
    if (await hashFile(assembled) !== artifact.sha256) throw Error('Artifact SHA256 mismatch; refusing installation');
    await rename(assembled, destination);
    console.log(`${artifact.file}: verified SHA256 ${artifact.sha256}`);
  } finally { clearInterval(progress); }
}
await writeFile(path.join(root, 'provenance.json'), JSON.stringify({ installedAt: new Date().toISOString(), artifacts }, null, 2));
