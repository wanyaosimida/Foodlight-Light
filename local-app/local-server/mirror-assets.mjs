import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOSTS = ['miaoda-site-img.cdn.bcebos.com'];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FIELDS = {
  profiles: { avatar_url: false },
  recipes: { cover_url: false, steps: true },
  meal_logs: { image_url: false },
  community_posts: { images: true, author_avatar: false, data: true },
  community_comments: { author_avatar: false },
};
const MEDIA_KEYS = /^(?:image|images|image_url|image_urls|cover|cover_url|avatar|avatar_url|author_avatar|thumbnail|thumbnail_url|audio_url|sound_url)$/i;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function visitMedia(value, replace, media = false) {
  if (typeof value === 'string') return media ? replace(value) : value;
  if (Array.isArray(value)) return value.map(item => visitMedia(item, replace, media));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, visitMedia(item, replace, MEDIA_KEYS.test(key))]));
  return value;
}

export function imageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return { extension: 'gif', contentType: 'image/gif' };
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { extension: 'webp', contentType: 'image/webp' };
  throw new Error('响应不是受支持的原始图片（拒绝网页、音效及无法识别的文件）');
}

function atomicJson(path, data) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  renameSync(temporary, path);
}

function collect(db, dataDir) {
  const cells = [], sources = new Map(), missing = new Map();
  for (const [table, fields] of Object.entries(FIELDS)) {
    const rows = db.prepare(`SELECT id, ${table === 'profiles' ? 'id' : 'owner_id'} AS owner_id, ${Object.keys(fields).join(', ')} FROM ${table}`).all();
    for (const row of rows) for (const [column, json] of Object.entries(fields)) {
      const original = row[column];
      if (!original) continue;
      let value;
      try { value = json ? JSON.parse(original) : original; }
      catch { throw new Error(`无法解析 ${table}.${column}，请先核对导入数据`); }
      const cell = { table, column, id: row.id, ownerId: row.owner_id, original, value, json };
      cells.push(cell);
      visitMedia(value, source => {
        if (/^https?:\/\//i.test(source)) {
          if (!sources.has(source)) sources.set(source, []);
          sources.get(source).push(cell);
        } else if (/^(?:app-ejgfa726qvi9_foodlight_images\/)?images\//.test(source)) {
          const path = source.replace(/^app-ejgfa726qvi9_foodlight_images\//, '');
          if (!/^images\/[a-zA-Z0-9_.-]+$/.test(path) || !existsSync(join(dataDir, path))) {
            if (!missing.has(source)) missing.set(source, { source, reason: '原云存储相对路径没有本地文件；需另行导出该文件或提供其公开下载地址', references: 0 });
            missing.get(source).references++;
          }
        }
        return source;
      }, !json || column === 'images');
    }
  }
  return { cells, sources, missing };
}

async function downloadImage(url, { allowedHosts, fetchImpl, maxBytes }) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedHosts.includes(parsed.hostname)) {
    throw new Error('URL 不在已核对的公开 HTTPS 图片主机清单中');
  }
  // No cookies, bearer tokens, or redirects are used to access original images.
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`原图下载失败 HTTP ${response.status}`);
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type && !['application/octet-stream', 'binary/octet-stream', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) {
    throw new Error(`原图响应类型不受支持: ${type}`);
  }
  const expected = Number(response.headers.get('content-length'));
  if (expected > maxBytes) throw new Error('图片大小超过本地存储限制');
  if (!response.body) throw new Error('原图响应为空');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('图片大小超过本地存储限制');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (expected > 0 && size !== expected && !response.headers.get('content-encoding')) throw new Error('图片下载不完整');
  return { bytes, ...imageType(bytes) };
}

/** With apply=false this performs a read-only inventory and does not fetch or create files. */
export async function mirrorAssets({ dataDir = join(root, 'data'), apply = false, allowedHosts = DEFAULT_HOSTS,
  fetchImpl = fetch, maxBytes = MAX_IMAGE_BYTES } = {}) {
  dataDir = resolve(dataDir);
  const dbPath = join(dataDir, 'foodlight.sqlite');
  if (!existsSync(dbPath)) throw new Error('本地数据库尚未建立，请先完成数据导入');
  const db = new DatabaseSync(dbPath, { readOnly: !apply });
  db.exec('PRAGMA busy_timeout=5000');
  try {
    const { cells, sources, missing } = collect(db, dataDir);
    const summary = { apply, remoteUnique: sources.size, remoteReferences: [...sources.values()].reduce((sum, refs) => sum + refs.length, 0),
      hosts: [...new Set([...sources.keys()].map(url => new URL(url).hostname))], missingStorageFiles: missing.size };
    if (!apply) return summary;

    mkdirSync(join(dataDir, 'images'), { recursive: true });
    const manifestPath = join(dataDir, 'asset-mirror-manifest.json');
    const oldManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { mappings: [] };
    const mappings = new Map(oldManifest.mappings.map(item => [item.source, item]));
    const ready = new Map(), failures = [...missing.values()];
    let downloaded = 0, reused = 0;
    const urls = [...sources.keys()];
    for (let offset = 0; offset < urls.length; offset += 3) {
      await Promise.all(urls.slice(offset, offset + 3).map(async source => {
        try {
          const old = mappings.get(source);
          if (old && /^images\/mirror_[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(old.path) && existsSync(join(dataDir, old.path))) {
            const bytes = readFileSync(join(dataDir, old.path));
            const type = imageType(bytes);
            if (sha256(bytes) === old.sha256 && type.contentType === old.contentType) { ready.set(source, old); reused++; return; }
          }
          const asset = await downloadImage(source, { allowedHosts, fetchImpl, maxBytes });
          const hash = sha256(asset.bytes);
          const path = `images/mirror_${hash}.${asset.extension}`;
          const file = join(dataDir, path);
          if (existsSync(file)) {
            if (sha256(readFileSync(file)) !== hash) throw new Error('目标同名文件内容不符，已保留原文件');
          } else writeFileSync(file, asset.bytes, { flag: 'wx' });
          const item = { source, path, sha256: hash, bytes: asset.bytes.length, contentType: asset.contentType, downloadedAt: new Date().toISOString() };
          mappings.set(source, item);
          ready.set(source, item);
          downloaded++;
        } catch (error) {
          failures.push({ source, reason: error.message, references: sources.get(source).length });
        }
      }));
    }

    // Store provenance before changing references, so every rewritten URL stays recoverable.
    atomicJson(manifestPath, { version: 1, updatedAt: new Date().toISOString(), mappings: [...mappings.values()] });
    const updates = cells.map(cell => {
      const replaced = visitMedia(cell.value, source => ready.get(source)?.path || source, !cell.json || cell.column === 'images');
      const value = cell.json ? JSON.stringify(replaced) : replaced;
      return { ...cell, value };
    }).filter(cell => cell.json ? JSON.stringify(JSON.parse(cell.original)) !== cell.value : cell.original !== cell.value);

    let changedFields = 0, backupPath = null;
    if (updates.length) {
      const backupDir = join(dataDir, 'backups');
      mkdirSync(backupDir, { recursive: true });
      backupPath = join(backupDir, `before-asset-mirror-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`);
      db.prepare('VACUUM INTO ?').run(backupPath);
      db.exec('BEGIN IMMEDIATE');
      try {
        const storage = db.prepare('INSERT INTO storage_objects(path,owner_id,content_type,created_at) VALUES(?,?,?,?) ON CONFLICT(path) DO NOTHING');
        for (const [source, asset] of ready) storage.run(asset.path, sources.get(source)[0].ownerId, asset.contentType, asset.downloadedAt);
        for (const cell of updates) {
          // Respect edits made while images were downloading: never overwrite a changed field.
          const result = db.prepare(`UPDATE ${cell.table} SET ${cell.column} = ? WHERE id = ? AND ${cell.column} = ?`).run(cell.value, cell.id, cell.original);
          if (result.changes) changedFields++;
          else failures.push({ table: cell.table, column: cell.column, reason: '下载期间该记录已变化，已保留较新内容；再次执行可重试' });
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    atomicJson(join(dataDir, 'asset-mirror-failures.json'), { updatedAt: new Date().toISOString(), failures });
    const result = { ...summary, downloaded, reused, changedFields, failures: failures.length, backupPath, manifestPath };
    atomicJson(join(dataDir, 'asset-mirror-report.json'), result);
    return result;
  } finally { db.close(); }
}

// Archive files explicitly exported via the project's Storage UI. Existing Downloads
// originals and all business records remain unchanged; only storage metadata is added.
export function archiveStorageFiles({ sourceDir, names, dataDir = join(root, 'data') }) {
  dataDir = resolve(dataDir);
  if (!sourceDir || !Array.isArray(names) || !names.length || names.some(name => !/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|gif)$/.test(name))) {
    throw new Error('必须指定原始下载目录和明确的图片文件名');
  }
  const files = names.map(name => {
    const source = resolve(sourceDir, name);
    const bytes = readFileSync(source);
    const type = imageType(bytes);
    return { name, source, path: `images/${name}`, bytes: bytes.length, sha256: sha256(bytes), contentType: type.contentType };
  });
  const db = new DatabaseSync(join(dataDir, 'foodlight.sqlite'));
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  try {
    const { cells } = collect(db, dataDir);
    const matchedOwners = new Set();
    const ownership = new Map();
    for (const file of files) {
      const owners = new Set();
      let references = 0;
      for (const cell of cells) visitMedia(cell.value, source => {
        if (source.replace(/^app-ejgfa726qvi9_foodlight_images\//, '') === file.path) {
          references++; owners.add(cell.ownerId); matchedOwners.add(cell.ownerId);
        }
        return source;
      }, !cell.json || cell.column === 'images');
      ownership.set(file.path, { owners, references });
    }
    // Orphan files are archived under the sole known owner of this same export,
    // because storage_objects.owner_id is NOT NULL. This is recorded explicitly.
    if (files.some(file => ownership.get(file.path).owners.size === 0) && matchedOwners.size !== 1) {
      throw new Error('未引用图片的本地存储归属不明确，未复制或修改数据库');
    }
    for (const file of files) {
      const { owners, references } = ownership.get(file.path);
      if (owners.size > 1) throw new Error('同一原图存在多个记录所有者，需明确本地存储归属');
      file.ownerId = [...owners][0] || [...matchedOwners][0];
      file.references = references;
      file.ownerPolicy = references ? 'owner-of-referencing-imported-records' : 'unreferenced-storage-archive-associated-with-sole-referenced-import-owner';
      const target = join(dataDir, file.path);
      if (existsSync(target) && sha256(readFileSync(target)) !== file.sha256) throw new Error('本地存在不同内容的同名图片，已保留原文件');
      const stored = db.prepare('SELECT owner_id, content_type FROM storage_objects WHERE path=?').get(file.path);
      if (stored && (stored.owner_id !== file.ownerId || stored.content_type !== file.contentType)) throw new Error('已有存储元数据与原图不匹配，未覆盖');
    }
    mkdirSync(join(dataDir, 'images'), { recursive: true });
    mkdirSync(join(dataDir, 'backups'), { recursive: true });
    const backupPath = join(dataDir, 'backups', `before-storage-archive-${randomUUID()}.sqlite`);
    db.prepare('VACUUM INTO ?').run(backupPath);
    for (const file of files) if (!existsSync(join(dataDir, file.path))) {
      copyFileSync(file.source, join(dataDir, file.path), constants.COPYFILE_EXCL);
    }
    const manifestPath = join(dataDir, 'storage-archive-manifest.json');
    const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).files : [];
    const merged = new Map(previous.map(file => [file.path, file]));
    for (const file of files) merged.set(file.path, file);
    atomicJson(manifestPath, { version: 1, updatedAt: new Date().toISOString(), backupPath, files: [...merged.values()] });
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert = db.prepare('INSERT INTO storage_objects(path,owner_id,content_type,created_at) VALUES(?,?,?,?) ON CONFLICT(path) DO NOTHING');
      for (const file of files) insert.run(file.path, file.ownerId, file.contentType, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { archived: files.length, referencedFiles: files.filter(file => file.references).length,
      unreferencedArchives: files.filter(file => !file.references).length, references: files.reduce((sum, file) => sum + file.references, 0),
      bytes: files.reduce((sum, file) => sum + file.bytes, 0), manifestPath, backupPath };
  } finally { db.close(); }
}

async function main(argv) {
  let dataDir = process.env.LOCAL_DATA_DIR || join(root, 'data');
  let apply = false;
  const allowedHosts = [...DEFAULT_HOSTS];
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--apply') apply = true;
    else if (argv[index] === '--data-dir' && argv[index + 1]) dataDir = argv[++index];
    else if (argv[index] === '--allow-host' && argv[index + 1]) allowedHosts.push(argv[++index]);
    else throw new Error('用法: node local-server/mirror-assets.mjs [--apply] [--data-dir DIR] [--allow-host HOST]');
  }
  console.log(JSON.stringify(await mirrorAssets({ dataDir, apply, allowedHosts }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
