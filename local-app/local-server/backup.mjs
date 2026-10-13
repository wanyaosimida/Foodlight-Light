import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.LOCAL_DATA_DIR || join(serverDir, 'data'));
const source = join(dataDir, 'foodlight.sqlite');
if (!existsSync(source)) throw new Error(`找不到数据库：${source}`);
const backupDir = join(dataDir, 'backups');
mkdirSync(backupDir, { recursive: true });
const destination = join(backupDir, `foodlight-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const db = new DatabaseSync(source);
try {
  db.exec('PRAGMA busy_timeout = 10000');
  db.prepare('VACUUM INTO ?').run(destination);
} finally {
  db.close();
}
const snapshot = new DatabaseSync(destination, { readOnly: true });
try {
  const rows = snapshot.prepare('PRAGMA integrity_check').all();
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok') throw new Error('备份完整性检查失败');
} finally {
  snapshot.close();
}
console.log(`数据库快照已保存并通过完整性检查：${destination}`);
console.log('完整备份还需保留 images、generated-media 文件夹及本地账号文件。');
