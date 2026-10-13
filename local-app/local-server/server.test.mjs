import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createClient } from '@supabase/supabase-js';

const root = dirname(fileURLToPath(import.meta.url));
const bucket = 'app-ejgfa726qvi9_foodlight_images';
const password = 'test-only-password-42';
function client(url) {
  return createClient(url, 'local-test-anon-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function ok(response) {
  assert.equal(response.error, null, response.error?.message);
  return response.data;
}
async function launch(dataDir) {
  const proc = spawn(process.execPath, [join(root, 'server.mjs')], {
    env: { ...process.env, LOCAL_DATA_DIR: dataDir, LOCAL_API_PORT: '0' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  proc.stderr.on('data', bytes => { errors += bytes; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server start timed out: ${errors}`)), 15000);
    proc.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
    proc.stdout.on('data', bytes => {
      output += bytes;
      const match = output.match(/Local API: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timeout); resolveUrl(match[1]); }
    });
  });
  return { proc, url };
}
async function stop(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = once(proc, 'exit');
  proc.kill();
  await exited;
}

test('local SQLite server supports the real Supabase client and persists app records', async t => {
  const dataDir = mkdtempSync(join(tmpdir(), 'foodlight-backend-test-'));
  let server = await launch(dataDir);
  t.after(async () => {
    await stop(server.proc);
    // Only this test's unique directory is removed; never the configured app data directory.
    assert.equal(dirname(resolve(dataDir)), resolve(tmpdir()));
    assert.ok(dataDir.includes('foodlight-backend-test-'));
    rmSync(dataDir, { recursive: true, force: true });
  });
  let alice = client(server.url);
  let bob = client(server.url);
  let aliceId, bobId, recipeId, postId, mealId;

  await t.test('registration, normalized login, profile creation, private access, and refresh rotation', async () => {
    const registered = ok(await alice.auth.signUp({ email: 'Alice@miaoda.com', password }));
    aliceId = registered.user.id;
    assert.equal(registered.user.email, 'alice@miaoda.com');
    assert.ok(registered.session.access_token);
    bobId = ok(await bob.auth.signUp({ email: 'bob@miaoda.com', password })).user.id;
    assert.equal(ok(await alice.auth.getUser()).user.id, aliceId);
    const profile = ok(await alice.from('profiles').select('*').eq('id', aliceId).maybeSingle());
    assert.equal(profile.email, 'alice@miaoda.com');
    assert.ok(profile.created_at);
    assert.equal(ok(await bob.from('profiles').select('*').eq('id', aliceId).maybeSingle()), null);
    assert.ok((await client(server.url).from('profiles').select('*')).error);
    assert.ok((await client(server.url).auth.signInWithPassword({ email: 'alice@miaoda.com', password: 'wrong' })).error);
    const oldSession = registered.session;
    const refreshed = ok(await alice.auth.refreshSession()).session;
    assert.notEqual(refreshed.access_token, oldSession.access_token);
    const reused = await client(server.url).auth.refreshSession({ refresh_token: oldSession.refresh_token });
    assert.ok(reused.error, 'a used refresh token cannot be replayed');
    const refreshAsAccess = await fetch(`${server.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${refreshed.refresh_token}` } });
    assert.equal(refreshAsAccess.status, 401);
    const changed = ok(await alice.from('profiles').update({ nickname: '本地测试', age: 28, role: 'admin' }).eq('id', aliceId).select().single());
    assert.equal(changed.nickname, '本地测试');
    assert.equal(changed.role, 'user');
  });

  await t.test('recipe JSON, booleans, single-row writes, ownership, and atomic batches', async () => {
    const recipe = ok(await alice.from('recipes').insert({ title: '本地蒸蛋', owner_id: bobId, ingredients: [{ name: '鸡蛋', amount: '2个' }], steps: ['搅拌', '蒸熟'], nutrition: { calories: 180 }, is_ai_generated: true }).select().maybeSingle());
    recipeId = recipe.id;
    assert.equal(recipe.owner_id, aliceId);
    assert.equal(recipe.is_ai_generated, true);
    assert.deepEqual(recipe.steps, ['搅拌', '蒸熟']);
    assert.ok(recipe.created_at && recipe.updated_at);
    assert.equal(ok(await bob.from('recipes').select('*').eq('id', recipeId).maybeSingle()), null);
    assert.deepEqual(ok(await bob.from('recipes').update({ title: '被修改' }).eq('id', recipeId).select()), []);
    assert.deepEqual(ok(await bob.from('recipes').delete().eq('id', recipeId).select()), []);
    const changed = ok(await alice.from('recipes').update({ title: '鸡蛋羹', is_ai_generated: false }).eq('id', recipeId).select().single());
    assert.equal(changed.is_ai_generated, false);
    assert.equal(changed.title, '鸡蛋羹');
    const failed = await alice.from('recipes').insert([{ id: 'atomic-test', title: 'Should roll back' }, { id: 'atomic-test', title: 'Duplicate' }]);
    assert.ok(failed.error);
    assert.equal(ok(await alice.from('recipes').select('*').eq('id', 'atomic-test').maybeSingle()), null);
    assert.ok((await alice.from('recipes').select('*').eq('id', 'absent').single()).error);
  });

  await t.test('meal logs, date ranges, pagination, weight logs and food library persist typed values', async () => {
    const meal = ok(await alice.from('meal_logs').insert({ food_name: '鸡蛋羹', log_date: '2026-09-22', recipe_id: recipeId, calories: 180, protein: 14, carbs: 5, fat: 10, gl_value: 3 }).select().single());
    mealId = meal.id;
    assert.equal(meal.protein, 14);
    assert.ok((await bob.from('meal_logs').insert({ food_name: '不得关联', recipe_id: recipeId })).error);
    ok(await alice.from('meal_logs').insert([{ food_name: '昨天', log_date: '2026-09-21' }, { food_name: '明天', log_date: '2026-09-23' }]));
    const range = ok(await alice.from('meal_logs').select('*').gte('log_date', '2026-09-21').lte('log_date', '2026-09-22').order('log_date', { ascending: true }).range(1, 1));
    assert.equal(range.length, 1);
    assert.equal(range[0].id, mealId);
    assert.equal((await alice.from('meal_logs').select('*', { count: 'exact', head: true })).count, 3);
    assert.deepEqual(ok(await bob.from('meal_logs').select('*')), []);
    const weight = ok(await alice.from('weight_logs').insert({ weight_kg: 66.5 }).select().single());
    assert.match(weight.log_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(weight.weight_kg, 66.5);
    assert.deepEqual(ok(await bob.from('weight_logs').select('*')), []);
    const food = ok(await alice.from('food_library').insert({ name: '酸奶', nutrition: { protein: '3.5g' } }).select().single());
    assert.equal(food.category, '其他');
    assert.deepEqual(food.nutrition, { protein: '3.5g' });
    assert.deepEqual(ok(await bob.from('food_library').select('*')), []);
    ok(await alice.from('food_library').update({ category: '乳制品' }).eq('id', food.id));
    assert.equal(ok(await alice.from('food_library').select('category').eq('id', food.id).single()).category, '乳制品');
    ok(await alice.from('food_library').delete().eq('id', food.id));
    assert.deepEqual(ok(await alice.from('food_library').select('*')), []);
  });

  await t.test('public community reads, private favorites, owner mutations, counters and cascade deletes', async () => {
    const post = ok(await alice.from('community_posts').insert({ content: '今天的健康午餐', images: [], tags: ['午餐'], data: { calories: 180 }, author_name: '本地测试', like_count: 100 }).select().single());
    postId = post.id;
    assert.equal(post.like_count, 0);
    assert.equal(ok(await bob.from('community_posts').select('*'))[0].id, postId, 'unfiltered public reads work');
    assert.deepEqual(ok(await bob.from('community_posts').delete().eq('id', postId).select()), []);
    const comment = ok(await bob.from('community_comments').insert({ post_id: postId, content: '看起来不错' }).select().single());
    const like = ok(await bob.from('community_likes').insert({ post_id: postId }).select().single());
    const favorite = ok(await bob.from('community_favorites').insert({ post_id: postId }).select().single());
    const follow = ok(await bob.from('community_follows').insert({ followee_id: aliceId, follower_id: aliceId }).select().single());
    assert.equal(follow.follower_id, bobId);
    assert.equal(ok(await alice.from('community_comments').select('*'))[0].id, comment.id);
    assert.equal(ok(await alice.from('community_likes').select('*'))[0].id, like.id);
    assert.equal(ok(await alice.from('community_follows').select('followee_id').eq('follower_id', bobId))[0].followee_id, aliceId);
    assert.deepEqual(ok(await alice.from('community_favorites').select('*')), []);
    assert.deepEqual(ok(await alice.from('community_comments').update({ content: 'Unauthorized' }).eq('id', comment.id).select()), []);
    assert.deepEqual(ok(await alice.from('community_likes').delete().eq('id', like.id).select()), []);
    assert.ok((await bob.from('community_likes').insert({ post_id: postId })).error);
    let counts = ok(await alice.from('community_posts').select('like_count,comment_count,favorite_count').eq('id', postId).single());
    assert.deepEqual(counts, { like_count: 1, comment_count: 1, favorite_count: 1 });
    ok(await bob.from('community_comments').delete().eq('id', comment.id));
    ok(await bob.from('community_likes').delete().eq('id', like.id));
    ok(await bob.from('community_favorites').delete().eq('id', favorite.id));
    ok(await bob.from('community_follows').delete().eq('id', follow.id));
    counts = ok(await alice.from('community_posts').select('like_count,comment_count,favorite_count').eq('id', postId).single());
    assert.deepEqual(counts, { like_count: 0, comment_count: 0, favorite_count: 0 });
    ok(await bob.from('community_comments').insert({ post_id: postId, content: '级联删除测试' }));
    ok(await alice.from('community_posts').delete().eq('id', postId));
    assert.deepEqual(ok(await bob.from('community_comments').select('*').eq('post_id', postId)), []);
  });

  await t.test('image bytes survive ArrayBuffer and browser Blob uploads, including thumbnail URLs', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64');
    const storage = alice.storage.from(bucket);
    for (const [name, input] of [['raw.png', png.buffer.slice(png.byteOffset, png.byteOffset + png.length)], ['blob.png', new Blob([png], { type: 'image/png' })]]) {
      ok(await storage.upload(`images/${name}`, input, { contentType: 'image/png', upsert: false }));
      for (const options of [undefined, { transform: { width: 400, height: 400, resize: 'cover', quality: 75 } }]) {
        const url = storage.getPublicUrl(`images/${name}`, options).data.publicUrl;
        const response = await fetch(url);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/png');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
      }
    }
    assert.ok((await storage.upload('images/raw.png', png, { contentType: 'image/png' })).error);
    assert.ok((await bob.storage.from(bucket).upload('images/raw.png', png, { contentType: 'image/png', upsert: true })).error);
    ok(await storage.upload('images/raw.png', png, { contentType: 'image/png', upsert: true }));
    assert.ok((await storage.upload('images/../bad.png', png, { contentType: 'image/png' })).error);
  });

  await t.test('data and auth survive a server restart, logout revokes both tokens', async () => {
    await stop(server.proc);
    assert.ok(existsSync(join(dataDir, 'foodlight.sqlite')));
    assert.ok(statSync(join(dataDir, 'foodlight.sqlite')).size > 0);
    server = await launch(dataDir);
    alice = client(server.url);
    bob = client(server.url);
    const session = ok(await alice.auth.signInWithPassword({ email: 'ALICE@miaoda.com', password })).session;
    assert.equal(session.user.id, aliceId);
    assert.equal(ok(await alice.from('recipes').select('*').eq('id', recipeId).single()).title, '鸡蛋羹');
    assert.equal(ok(await alice.from('meal_logs').select('*').eq('id', mealId).single()).food_name, '鸡蛋羹');
    const other = client(server.url);
    const otherSession = ok(await other.auth.signInWithPassword({ email: 'alice@miaoda.com', password })).session;
    ok(await alice.auth.signOut({ scope: 'local' }));
    assert.ok((await alice.auth.refreshSession({ refresh_token: session.refresh_token })).error);
    assert.equal(ok(await other.auth.getUser()).user.id, aliceId, 'local logout preserves another login');
    ok(await other.auth.signOut());
    assert.ok((await client(server.url).auth.refreshSession({ refresh_token: otherSession.refresh_token })).error);
    const expiredAccess = await fetch(`${server.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${otherSession.access_token}` } });
    assert.equal(expiredAccess.status, 401);
  });
});
