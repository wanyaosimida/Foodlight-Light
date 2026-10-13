import { createReadStream, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2]);
const files = [];
async function walk(folder) {
  for (const name of readdirSync(folder).sort()) {
    if (name === 'PACKAGE-MANIFEST.json' || name === 'portable-state.json' || name === '__pycache__' || name === 'logs' || name.endsWith('.sqlite-wal') || name.endsWith('.sqlite-shm')) continue;
    const file = join(folder, name);
    const info = lstatSync(file);
    if (info.isSymbolicLink()) throw Error(`Package contains a machine-specific link: ${file}`);
    if (info.isDirectory()) await walk(file);
    else {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      files.push({ path: relative(root, file).split(sep).join('/'), bytes: info.size, sha256: hash.digest('hex') });
      if (info.size > 100 * 1024 * 1024) console.log(`Verified: ${relative(root, file)}`);
    }
  }
}
await walk(root);
writeFileSync(join(root, 'PACKAGE-MANIFEST.json'), JSON.stringify({ created: new Date().toISOString(), totalBytes: files.reduce((n, f) => n + f.bytes, 0), files }, null, 2));
console.log(`SHA256 manifest saved for ${files.length} files.`);
