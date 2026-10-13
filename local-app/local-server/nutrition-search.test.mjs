import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { searchLocalNutrition } from './nutrition-search.mjs';

function setup(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  for (const id of ['alice', 'bob']) db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, `${id}@example.test`, 'test', 'test', '2026-01-01');
  const meal = db.prepare('INSERT INTO meal_logs(id,owner_id,food_name,portion,calories,protein,carbs,fat,log_date,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  meal.run('meal-older', 'alice', '燕麦粥', '200克', 125, 4.4, 21, 3, '2026-01-01', '2026-01-01');
  meal.run('meal-latest', 'alice', '燕麦粥', '200克', 125, 4.4, 21, 3, '2026-01-02', '2026-01-02');
  meal.run('other-account', 'bob', '燕麦粥', '500克', 700, 100, 200, 60, '2026-01-03', '2026-01-03');
  db.prepare('INSERT INTO recipes(id,owner_id,title,nutrition,is_ai_generated,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('recipe', 'alice', '牛奶燕麦粥', JSON.stringify({ calories: 230, protein: 8, carbs: null }), 1, '2026-01-03', '2026-01-03');
  return db;
}

test('returns only actual caller-owned numbers and original portions, with clear provenance', t => {
  const db = setup(t);
  const result = searchLocalNutrition(db, '燕麦粥', 'alice');
  assert.equal(result.source, 'local-records');
  assert.equal(result.verified, false);
  assert.equal(result.results.length, 2, 'duplicate historical values are collapsed');
  const meal = result.results[0];
  assert.equal(meal.id, 'meal-latest');
  assert.equal(meal.portion, '200克');
  assert.equal(meal.calories, 125, 'does not convert a recorded portion to 100g');
  assert.equal(meal.protein, 4.4);
  assert.equal(meal.verified, false);
  const recipe = result.results[1];
  assert.match(recipe.source_label, /AI 估计/);
  assert.equal(recipe.calories, 230);
  assert.equal(recipe.carbs, null, 'missing fields are not filled with fabricated zeroes');
  assert.equal(recipe.fat, null);
  assert.equal(recipe.portion, null);
  assert.equal(searchLocalNutrition(db, '燕麦粥', 'bob').results.length, 1);
});

test('empty matches and literal SQL/wildcard input never produce invented references', t => {
  const db = setup(t);
  for (const query of ['完全没有的食材', 'x%_OR1=1']) {
    const result = searchLocalNutrition(db, query, 'alice');
    assert.deepEqual(result.results, []);
    assert.equal(result.verified, false);
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM meal_logs').get().n, 3);
  assert.throws(() => searchLocalNutrition(db, '', 'alice'), { status: 400 });
  assert.throws(() => searchLocalNutrition(db, '燕麦粥', ''), { status: 401 });
});
