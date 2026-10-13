import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAI, getAICapabilities } from './ai.mjs';
import { searchLocalNutrition } from './nutrition-search.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.LOCAL_DATA_DIR || join(root, 'data'));
const imageDir = join(dataDir, 'images');
mkdirSync(imageDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 'foodlight.sqlite'));
db.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));
// Upgrade the first local prototype without changing its existing records.
const sessionColumns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(row => row.name));
if (!sessionColumns.has('session_id')) db.exec('ALTER TABLE sessions ADD COLUMN session_id TEXT');
if (!sessionColumns.has('token_kind')) db.exec("ALTER TABLE sessions ADD COLUMN token_kind TEXT NOT NULL DEFAULT 'access'");
const port = Number(process.env.LOCAL_API_PORT || 54321);
const jsonColumns = {
  recipes: ['ingredients', 'steps', 'nutrition'],
  community_posts: ['images', 'data', 'tags'],
  food_library: ['nutrition'],
};
const tables = ['profiles', 'recipes', 'meal_logs', 'weight_logs', 'community_posts',
  'community_comments', 'community_likes', 'community_favorites', 'community_follows', 'food_library'];
const publicTables = new Set(['community_posts', 'community_comments', 'community_likes', 'community_follows']);
const columns = Object.fromEntries(tables.map(table => [table,
  new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name))]));
const immutable = new Set(['id', 'owner_id', 'follower_id', 'role', 'post_id', 'followee_id', 'created_at',
  'like_count', 'comment_count', 'favorite_count']);
const now = () => new Date().toISOString();
const tokenFor = req => req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-client-info, x-upsert, range, range-unit, accept, accept-profile, content-profile, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'content-range',
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(data === null ? '' : JSON.stringify(data));
}
function error(res, status, message, code = String(status), details = null) {
  send(res, status, { code, message, error: message, details, hint: null });
}
async function body(req, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new HttpError(413, '请求体过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  try { return JSON.parse((await body(req)).toString()); }
  catch (e) { if (e instanceof SyntaxError) throw new HttpError(400, '无效的 JSON'); throw e; }
}
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
function sessionFor(req) {
  return db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ? AND token_kind = 'access'").get(tokenFor(req), Date.now());
}
function userFor(req) {
  const session = sessionFor(req);
  return session && db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(session.user_id);
}
function authUser(user) {
  return { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated',
    created_at: user.created_at, updated_at: user.created_at, confirmed_at: user.created_at,
    email_confirmed_at: user.created_at, app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {}, identities: [] };
}
function issue(user, sessionId = randomUUID()) {
  const access_token = randomBytes(32).toString('hex');
  const refresh_token = randomBytes(32).toString('hex');
  const expires_in = 30 * 24 * 3600;
  const expires_at = Math.floor(Date.now() / 1000) + expires_in;
  const insert = db.prepare('INSERT INTO sessions(token, user_id, expires_at, session_id, token_kind) VALUES(?, ?, ?, ?, ?)');
  insert.run(access_token, user.id, expires_at * 1000, sessionId, 'access');
  insert.run(refresh_token, user.id, expires_at * 1000, sessionId, 'refresh');
  return { access_token, refresh_token, token_type: 'bearer', expires_in, expires_at, user: authUser(user) };
}
function rowsOut(rows, table, select) {
  const requested = select && select !== '*' ? select.split(',').filter(col => columns[table].has(col)) : null;
  return rows.map(row => {
    const result = {};
    for (const [key, value] of Object.entries(row)) {
      if (requested && !requested.includes(key)) continue;
      result[key] = jsonColumns[table]?.includes(key) && typeof value === 'string' ? JSON.parse(value) :
        key === 'is_ai_generated' ? Boolean(value) : value;
    }
    return result;
  });
}
function resultRows(req, res, rows, table, url, status = 200, headers = {}) {
  const out = rowsOut(rows, table, url.searchParams.get('select'));
  if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
    if (out.length !== 1) return error(res, 406, 'JSON object requested, multiple (or no) rows returned',
      'PGRST116', `The result contains ${out.length} rows`);
    return send(res, status, out[0], headers);
  }
  return send(res, status, out, headers);
}
function filters(url, table, user, method) {
  const clauses = [];
  const values = [];
  if (table === 'profiles') { clauses.push('id = ?'); values.push(user.id); }
  else if (table === 'community_follows' && !['GET', 'HEAD'].includes(method)) {
    clauses.push('follower_id = ?'); values.push(user.id);
  } else if (!publicTables.has(table) || !['GET', 'HEAD'].includes(method)) {
    clauses.push('owner_id = ?'); values.push(user.id);
  }
  for (const [field, raw] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(field)) continue;
    if (!columns[table].has(field)) throw new HttpError(400, `不支持的筛选字段: ${field}`);
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    if (['eq', 'neq', 'gte', 'lte', 'gt', 'lt'].includes(op)) {
      clauses.push(`${field} ${{ eq: '=', neq: '!=', gte: '>=', lte: '<=', gt: '>', lt: '<' }[op]} ?`);
      values.push(val);
    } else if (op === 'in') {
      const items = val.replace(/^\(|\)$/g, '').split(',').filter(Boolean).map(value => value.replace(/^"|"$/g, ''));
      clauses.push(items.length ? `${field} IN (${items.map(() => '?').join(',')})` : '0');
      values.push(...items);
    } else if (op === 'is' && val === 'null') clauses.push(`${field} IS NULL`);
    else throw new HttpError(400, `不支持的筛选操作: ${op}`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}
function sqlValue(table, key, value) {
  if (value === null || value === undefined) return null;
  if (jsonColumns[table]?.includes(key)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (!['string', 'number'].includes(typeof value)) throw new HttpError(400, `无效的字段值: ${key}`);
  return value;
}
function validateReferences(table, input, user) {
  if (table === 'meal_logs' && input.recipe_id && !db.prepare('SELECT id FROM recipes WHERE id = ? AND owner_id = ?').get(input.recipe_id, user.id)) {
    throw new HttpError(403, '不能关联其他用户的食谱');
  }
}
function applyInsert(table, item, user) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, '记录必须是对象');
  const input = { ...item };
  input.id = input.id || randomUUID();
  if (table === 'community_follows') input.follower_id = user.id;
  else if (table === 'profiles') { input.id = user.id; input.role = 'user'; }
  else input.owner_id = user.id;
  if (table === 'community_posts') input.like_count = input.comment_count = input.favorite_count = 0;
  if (columns[table].has('created_at') && !input.created_at) input.created_at = now();
  if (columns[table].has('updated_at') && !input.updated_at) input.updated_at = now();
  if (columns[table].has('log_date') && !input.log_date) input.log_date = now().slice(0, 10);
  validateReferences(table, input, user);
  const fields = Object.keys(input).filter(key => columns[table].has(key));
  const values = fields.map(key => sqlValue(table, key, input[key]));
  db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...values);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(input.id);
}
async function handleAuth(req, res, url) {
  if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
    const input = await jsonBody(req);
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = input.password;
    if (!email.includes('@') || typeof password !== 'string' || password.length < 6) return error(res, 400, '账号或密码无效');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return error(res, 422, 'User already registered');
    const user = { id: randomUUID(), email, created_at: now() };
    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync(password, salt, 64).toString('hex');
    const session = transaction(() => {
      db.prepare('INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?,?,?)').run(user.id, email, passwordHash, salt, user.created_at);
      db.prepare('INSERT INTO profiles(id,email,created_at,updated_at) VALUES(?,?,?,?)').run(user.id, email, user.created_at, user.created_at);
      return issue(user);
    });
    return send(res, 200, session);
  }
  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    const input = await jsonBody(req);
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const row = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ? AND token_kind = 'refresh'").get(input.refresh_token || '', Date.now());
      if (!row) return error(res, 401, 'Refresh token expired');
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
      const session = transaction(() => {
        db.prepare('DELETE FROM sessions WHERE session_id = ?').run(row.session_id);
        return issue(user, row.session_id);
      });
      return send(res, 200, session);
    }
    if (url.searchParams.get('grant_type') !== 'password') return error(res, 400, 'Unsupported grant type');
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || typeof input.password !== 'string') return error(res, 400, 'Invalid login credentials');
    const actual = scryptSync(input.password, user.salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(user.password_hash, 'hex'))) return error(res, 400, 'Invalid login credentials');
    return send(res, 200, transaction(() => issue(user)));
  }
  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    const user = userFor(req);
    return user ? send(res, 200, authUser(user)) : error(res, 401, 'Not authenticated');
  }
  if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
    const session = sessionFor(req);
    if (session) {
      const scope = url.searchParams.get('scope') || 'global';
      if (scope === 'local') db.prepare('DELETE FROM sessions WHERE session_id = ? OR token = ?').run(session.session_id, session.token);
      else if (scope === 'others') db.prepare('DELETE FROM sessions WHERE user_id = ? AND session_id != ?').run(session.user_id, session.session_id);
      else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(session.user_id);
    }
    return send(res, 204, null);
  }
  return error(res, 404, 'Auth endpoint not found');
}
async function handleRest(req, res, url) {
  const table = url.pathname.slice('/rest/v1/'.length);
  if (!tables.includes(table)) return error(res, 404, 'Table not found');
  const user = userFor(req);
  if (!user) return error(res, 401, '请先登录');
  const { where, values } = filters(url, table, user, req.method);
  const returning = req.headers.prefer?.includes('return=representation');
  if (req.method === 'GET' || req.method === 'HEAD') {
    const orderParts = (url.searchParams.get('order') || '').split(',').filter(Boolean).map(part => {
      const [field, direction] = part.split('.');
      if (!columns[table].has(field)) throw new HttpError(400, '无效的排序字段');
      return `${field} ${direction === 'desc' ? 'DESC' : 'ASC'}`;
    });
    const order = orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '';
    const range = req.headers.range?.match(/^(\d+)-(\d+)$/);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? (range ? +range[2] - +range[1] + 1 : 1000)), 1000);
    const offset = range ? Number(range[1]) : Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 0 || offset < 0) throw new HttpError(400, '无效的分页范围');
    const rows = db.prepare(`SELECT * FROM ${table} ${where}${order} LIMIT ? OFFSET ?`).all(...values, limit, offset);
    const total = db.prepare(`SELECT count(*) AS total FROM ${table} ${where}`).get(...values).total;
    const headers = { 'Content-Range': `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${total}` };
    if (req.method === 'HEAD') return send(res, 200, null, headers);
    return resultRows(req, res, rows, table, url, 200, headers);
  }
  if (req.method === 'POST') {
    const input = await jsonBody(req);
    const rows = transaction(() => (Array.isArray(input) ? input : [input]).map(item => applyInsert(table, item, user)));
    return returning ? resultRows(req, res, rows, table, url, 201) : send(res, 201, null);
  }
  if (req.method === 'PATCH') {
    const input = await jsonBody(req);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, '更新必须是对象');
    validateReferences(table, input, user);
    const fields = Object.keys(input).filter(key => columns[table].has(key) && !immutable.has(key));
    if (!fields.length) return returning ? resultRows(req, res, [], table, url) : send(res, 204, null);
    const params = fields.map(key => sqlValue(table, key, input[key]));
    const rows = db.prepare(`UPDATE ${table} SET ${fields.map(key => `${key} = ?`).join(', ')} ${where} RETURNING *`).all(...params, ...values);
    return returning ? resultRows(req, res, rows, table, url) : send(res, 204, null);
  }
  if (req.method === 'DELETE') {
    const rows = db.prepare(`DELETE FROM ${table} ${where} RETURNING *`).all(...values);
    return returning ? resultRows(req, res, rows, table, url) : send(res, 204, null);
  }
  return error(res, 405, 'Method not allowed');
}
async function handleStorage(req, res, url) {
  const match = url.pathname.match(/^\/storage\/v1\/(?:object\/(?:public\/)?|render\/image\/public\/)([^/]+)\/(.+)$/);
  if (!match) return error(res, 400, 'Invalid image path');
  const bucket = match[1];
  const path = decodeURIComponent(match[2]);
  if (bucket !== 'app-ejgfa726qvi9_foodlight_images' || !/^images\/[a-zA-Z0-9_.-]+$/.test(path)) return error(res, 400, 'Invalid image path');
  const target = resolve(imageDir, path.slice('images/'.length));
  if (!target.startsWith(imageDir + sep)) return error(res, 400, 'Invalid path');
  if (req.method === 'POST') {
    const user = userFor(req);
    if (!user) return error(res, 401, '请先登录');
    const stored = db.prepare('SELECT * FROM storage_objects WHERE path = ?').get(path);
    if (existsSync(target) && req.headers['x-upsert'] !== 'true') return error(res, 409, 'Image already exists');
    if (existsSync(target) && stored?.owner_id !== user.id) return error(res, 403, '不能覆盖其他用户的图片');
    let bytes = await body(req);
    let contentType = req.headers['content-type']?.split(';')[0] || 'application/octet-stream';
    if (contentType === 'multipart/form-data') {
      const form = await new Request('http://localhost', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: bytes }).formData();
      const file = [...form.values()].find(value => typeof value !== 'string' && typeof value.arrayBuffer === 'function');
      if (!file) throw new HttpError(400, '图片文件缺失');
      contentType = file.type;
      bytes = Buffer.from(await file.arrayBuffer());
    }
    const extensionTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    if (contentType === 'application/octet-stream') contentType = extensionTypes[extname(target).toLowerCase()] || contentType;
    if (!Object.values(extensionTypes).includes(contentType)) throw new HttpError(400, '仅支持 PNG、JPEG、WebP 或 GIF 图片');
    writeFileSync(target, bytes, { flag: existsSync(target) ? 'w' : 'wx' });
    db.prepare('INSERT INTO storage_objects(path,owner_id,content_type,created_at) VALUES(?,?,?,?) ON CONFLICT(path) DO UPDATE SET content_type=excluded.content_type').run(path, user.id, contentType, now());
    return send(res, 200, { Key: `${bucket}/${path}`, Id: randomUUID() });
  }
  if (req.method === 'GET' && existsSync(target)) {
    const stored = db.prepare('SELECT content_type FROM storage_objects WHERE path = ?').get(path);
    // The app's transformed thumbnail URL serves the same local original.
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': stored?.content_type || (target.endsWith('.png') ? 'image/png' : 'image/jpeg'), 'X-Content-Type-Options': 'nosniff' });
    return res.end(readFileSync(target));
  }
  return error(res, 404, 'Image not found');
}
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, null);
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'foodlight-local', database: 'foodlight.sqlite', ai: { ...getAICapabilities(), nutritionSearch: true, nutritionSource: 'local-records' } });
    if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url);
    if (url.pathname.startsWith('/storage/v1/')) return await handleStorage(req, res, url);
    if (url.pathname.startsWith('/functions/v1/')) {
      if (req.method !== 'POST') return error(res, 405, 'Method not allowed');
      const user = userFor(req);
      if (!user) return error(res, 401, '请先登录');
      const input = await jsonBody(req);
      const functionName = url.pathname.slice('/functions/v1/'.length);
      if (functionName === 'baidu-nutrition') return send(res, 200, searchLocalNutrition(db, input.query, user.id));
      const result = await handleAI(functionName, input);
      return send(res, result.status, result.body);
    }
    return error(res, 404, 'Not found');
  } catch (e) {
    const constraint = e.code === 'ERR_SQLITE_ERROR' && /constraint failed/i.test(e.message);
    if (!e.status && !constraint) console.error(e);
    error(res, e.status || (constraint ? 409 : 500), e.message || 'Server error');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local API: http://127.0.0.1:${server.address().port}; SQLite: ${join(dataDir, 'foodlight.sqlite')}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { db.close(); process.exit(0); });
  server.closeAllConnections();
});
