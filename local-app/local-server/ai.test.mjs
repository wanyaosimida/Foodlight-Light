import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { AI_FUNCTIONS, getAICapabilities, handleAI } from './ai.mjs';

// Fixtures are transport test data, not actual model inference or nutrition facts.
const meal = { title: 'fixture-meal', ingredients: [{ name: 'fixture-ingredient', amount: '1g' }], steps: ['fixture-step'], calories: 1, protein: 1, carbs: 1, fat: 1 };
const fixtures = {
  'deepseek-recipe': { breakfast: meal, lunch: meal, dinner: meal, snack: meal, comment: 'fixture-comment' },
  'recipe-generate': { recipes: [{ ...meal, steps: [{ text: 'fixture-step', time: '1分钟' }], difficulty: 1, cook_minutes: 1, tags: ['fixture'], tip: 'fixture' }] },
  'food-substitute': { analysis: 'fixture', items: [{ name: 'fixture', category: '低卡', calories: 1, protein: 1, carbs: 1, fat: 1, sugar: 1, sodium: 1, similarity: 50, health_score: 1, reason: 'fixture', portion: '1g' }] },
  'fridge-clearance': { tip: 'fixture', recipes: [{ ...meal, ingredients: [{ name: 'fixture', amount: '1g', is_expiring: true }], clearance_rate: '50%', cook_time_minutes: 1, difficulty: 1, zero_waste_hack: 'fixture' }] },
  'takeout-advisor': { analysis: 'fixture', recommended_combos: [{ name: 'fixture', estimated_calories: 1, protein: 1, carbs: 1, fat: 1, items: ['fixture'], reason: 'fixture' }], red_dishes: [{ name: 'fixture', risk: 'fixture' }], takeout_note: 'fixture', dining_hacks: ['fixture'] },
  'glycemic-advisor': { gl_value: 1, gl_level: 'low', gl_label: 'fixture', coma_risk_percent: 1, coma_peak_time: 'fixture', coma_symptom: 'fixture', optimal_order: [{ step: 1, type: 'fiber', label: 'fixture', reason: 'fixture', duration: 'fixture' }], rescue_actions: ['fixture'] },
  'community-ai': { caption: 'fixture-caption' },
  'food-recognition': { _scene_type: 'food_photo', items: [{ name: 'fixture', weight_g: 1, portion: '1g', cooking_method: 'fixture', calories: 1, protein: 1, carbs: 1, fat: 1, verified: true }] },
  'package-scan': { product_name: 'fixture', brand: 'fixture', net_content: '1g', nutrition: { calories: 1, protein: 1, carbs: 1, fat: 1, sugar: 1, sodium: 1, fiber: 1 }, ingredients: 'fixture', risk_points: ['fixture'], level: '适量购买', advice: 'fixture', translations: ['fixture'], alternatives: [{ name: 'fixture', calories: 1 }], _label_energy: { value: 4.184, unit: 'kJ', basis_g: 100 } },
};
const inputs = {
  'deepseek-recipe': { goal: 'balance', gender: 'female', age: 30, height_cm: 160, weight_kg: 50, activity_level: 'medium', allergies: '测试用过敏项', tdee: 1800 },
  'recipe-generate': { ingredients: ['fixture'], calorie_limit: 500, servings: 1 },
  'food-substitute': { food: { name: 'fixture', calories: 1 } },
  'fridge-clearance': { expiring_ingredients: ['fixture'], cook_minutes_limit: 5 },
  'takeout-advisor': { target_cuisine: 'fixture', calorie_budget: 500 },
  'glycemic-advisor': { total_carbs: 1 },
  'community-ai': { action: 'caption', context: { test: true } },
  'food-recognition': { image: 'data:image/png;base64,YWJj' },
  'package-scan': { image: 'YWJj' },
  'baidu-nutrition': { query: 'fixture' },
  'image-generations': { prompt: 'fixture' },
  'image-edits': { prompt: 'fixture', images: [{ b64_json: 'YWJj' }] },
  'kling-sound': { prompt: 'fixture' },
};
let server;
let base;
let captured;
let responseMode = 'normal';
before(async () => {
  server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    captured = { url: request.url, headers: request.headers, body: JSON.parse(raw) };
    response.setHeader('Content-Type', 'application/json');
    if (responseMode === 'http-error') { response.writeHead(500); response.end('{"error":"fixture private server detail"}'); return; }
    if (request.url === '/v1/chat/completions') {
      let output = fixtures[captured.body.model];
      if (responseMode === 'malformed') output = { recipes: [{ title: 'missing required fields' }] };
      if (responseMode === 'moderate') output = { passed: false, reason: 'fixture-reason' };
      if (responseMode === 'comments') output = { comments: ['fixture-1', 'fixture-2', 'fixture-3'] };
      if (responseMode === 'unreadable') output = { error: '测试图片无法识别' };
      if (responseMode === 'invalid-score') {
        output = structuredClone(fixtures['food-substitute']);
        output.items[0].health_score = 6;
      }
      if (responseMode === 'fractional-difficulty') {
        output = structuredClone(fixtures['recipe-generate']);
        output.recipes[0].difficulty = 2.5;
      }
      response.end(JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\`` } }] }));
    } else if (request.url === '/search') response.end(JSON.stringify({ result: [{ title: 'fixture evidence', source: 'fixture' }] }));
    else if (request.url === '/sound') response.end(JSON.stringify({ audio_url: 'fixture://not-real-audio' }));
    else response.end(JSON.stringify({ data: [{ b64_json: 'YWJj' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

test('all 13 functions explicitly report absent configuration without network calls', async () => {
  let calls = 0;
  for (const name of AI_FUNCTIONS) {
    const result = await handleAI(name, inputs[name], { env: {}, fetchImpl: () => { calls++; throw Error('must not connect'); } });
    assert.equal(result.status, 503, name);
    assert.equal(result.body.code, 'AI_NOT_CONFIGURED', name);
    assert.match(result.body.error, /AI-CONFIG/);
  }
  assert.equal(calls, 0);
  assert.equal(getAICapabilities({}).text, false);
});

test('all text/vision contracts survive real local HTTP and preserve required fields', async () => {
  responseMode = 'normal';
  for (const name of Object.keys(fixtures)) {
    const result = await handleAI(name, inputs[name], { env: { LOCAL_AI_MODEL: name, LOCAL_AI_VISION_MODEL: name, LOCAL_AI_BASE_URL: `${base}/v1` } });
    assert.equal(result.status, 200, `${name}: ${JSON.stringify(result.body)}`);
    assert.equal(captured.url, '/v1/chat/completions');
    assert.equal(captured.body.stream, false);
    assert.equal(captured.headers['x-gateway-authorization'], undefined);
    const expected = name === 'deepseek-recipe' ? { recipe: fixtures[name] } : structuredClone(fixtures[name]);
    if (name === 'package-scan') delete expected._label_energy;
    if (name === 'food-recognition') {
      assert.equal(result.body.items[0].verified, false, 'model output must not assert database verification');
      assert.equal(captured.body.messages[1].content[1].image_url.url, inputs[name].image);
    } else assert.deepEqual(result.body, expected);
  }
});

test('community moderation and comments retain original response contracts', async () => {
  const options = { env: { LOCAL_AI_MODEL: 'community-ai', LOCAL_AI_BASE_URL: `${base}/v1` } };
  responseMode = 'moderate';
  assert.deepEqual((await handleAI('community-ai', { action: 'moderate', text: 'fixture' }, options)).body, { passed: false, reason: 'fixture-reason' });
  responseMode = 'comments';
  assert.equal((await handleAI('community-ai', { action: 'comment', summary: 'fixture' }, options)).body.comments.length, 3);
  assert.equal((await handleAI('community-ai', { action: 'unknown' }, options)).status, 400);
});

test('invalid upstream data and unreadable packaging never turn into fake success', async () => {
  const env = { LOCAL_AI_MODEL: 'recipe-generate', LOCAL_AI_VISION_MODEL: 'package-scan', LOCAL_AI_BASE_URL: `${base}/v1` };
  responseMode = 'malformed';
  const malformed = await handleAI('recipe-generate', inputs['recipe-generate'], { env });
  assert.equal(malformed.status, 502);
  assert.equal(malformed.body.code, 'AI_INVALID_RESPONSE');
  responseMode = 'unreadable';
  assert.equal((await handleAI('package-scan', inputs['package-scan'], { env })).status, 422);
  responseMode = 'http-error';
  const error = await handleAI('recipe-generate', inputs['recipe-generate'], { env });
  assert.equal(error.status, 502);
  assert.doesNotMatch(JSON.stringify(error.body), /private server detail/);
});

test('specialized local endpoints use JSON contracts and normalize search response', async () => {
  responseMode = 'normal';
  const env = {
    LOCAL_NUTRITION_SEARCH_URL: `${base}/search`, LOCAL_IMAGE_GENERATION_URL: `${base}/images`,
    LOCAL_IMAGE_EDIT_URL: `${base}/edits`, LOCAL_SOUND_URL: `${base}/sound`, LOCAL_IMAGE_MODEL: 'fixture-model',
  };
  assert.equal((await handleAI('baidu-nutrition', inputs['baidu-nutrition'], { env })).body.results[0].source, 'fixture');
  assert.equal((await handleAI('image-generations', inputs['image-generations'], { env })).body.data[0].b64_json, 'YWJj');
  assert.equal(captured.body.response_format, 'b64_json');
  assert.equal((await handleAI('image-edits', inputs['image-edits'], { env })).status, 200);
  assert.deepEqual(captured.body.images, [{ b64_json: 'YWJj' }]);
  assert.equal((await handleAI('kling-sound', inputs['kling-sound'], { env })).status, 200);
  assert.equal(captured.body.duration, 3);
});

test('model scores that would break frontend stars or difficulty labels are rejected', async () => {
  const env = { LOCAL_AI_MODEL: 'fixture', LOCAL_AI_BASE_URL: `${base}/v1`, LOCAL_AI_STRUCTURED_OUTPUT: 'true' };
  responseMode = 'invalid-score';
  const score = await handleAI('food-substitute', inputs['food-substitute'], { env });
  assert.equal(score.status, 502);
  assert.equal(captured.body.response_format.json_schema.schema.properties.items.items.properties.health_score.maximum, 5);
  responseMode = 'fractional-difficulty';
  const difficulty = await handleAI('recipe-generate', inputs['recipe-generate'], { env });
  assert.equal(difficulty.status, 502);
});

test('external service, old gateway, arbitrary image URL, and unknown function are rejected', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw Error('must not connect'); };
  let env = { LOCAL_AI_MODEL: 'fixture', LOCAL_AI_BASE_URL: 'https://example.com/v1' };
  assert.equal((await handleAI('community-ai', inputs['community-ai'], { env, fetchImpl })).body.code, 'AI_REMOTE_DISABLED');
  env = { ...env, LOCAL_AI_BASE_URL: 'https://any-gateway.miaoda.online/v1', LOCAL_AI_ALLOW_REMOTE: 'true' };
  assert.equal((await handleAI('community-ai', inputs['community-ai'], { env, fetchImpl })).body.code, 'AI_INVALID_CONFIG');
  env = { LOCAL_AI_VISION_MODEL: 'fixture', LOCAL_AI_BASE_URL: `${base}/v1` };
  assert.equal((await handleAI('food-recognition', { image: 'https://example.com/image.jpg' }, { env, fetchImpl })).status, 400);
  assert.equal((await handleAI('unknown', {}, { env, fetchImpl })).status, 404);
  assert.equal(calls, 0);
});

test('connection and timeout failures remain actionable and do not expose keys', async () => {
  const env = { LOCAL_AI_MODEL: 'fixture', LOCAL_AI_API_KEY: 'fixture-secret' };
  const fetchImpl = async () => { const error = new Error('fixture-secret'); error.name = 'TimeoutError'; throw error; };
  const result = await handleAI('community-ai', inputs['community-ai'], { env, fetchImpl });
  assert.equal(result.status, 504);
  assert.equal(result.body.code, 'AI_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(result.body), /fixture-secret/);
});

test('known media failures become actionable errors without forwarding upstream secrets', async () => {
  const env = { LOCAL_IMAGE_GENERATION_URL: 'http://127.0.0.1:54322/v1/images/generations' };
  const fetchImpl = async () => new Response(JSON.stringify({ code: 'IMAGE_MODEL_NOT_INSTALLED', error: 'private-path-and-secret' }), { status: 503 });
  const result = await handleAI('image-generations', { prompt: 'a journal illustration' }, { env, fetchImpl });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'IMAGE_MODEL_NOT_INSTALLED');
  assert.match(result.body.error, /图片模型尚未安装/);
  assert.doesNotMatch(JSON.stringify(result), /private-path-and-secret/);
});
