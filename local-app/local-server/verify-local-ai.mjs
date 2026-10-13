// Real inference smoke test. Uses synthetic inputs; never writes application data.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { handleAI } from './ai.mjs';

const label = await readFile(new URL('../../local-models/test-assets/synthetic-nutrition-label.png', import.meta.url));
const image = `data:image/png;base64,${label.toString('base64')}`;
const allCases = [
  ['community-ai', { action: 'caption', context: { meal: '西兰花炒鸡蛋', calories: 350 } }],
  ['community-ai', { action: 'comment', post_type: 'meal', summary: '今天做了西兰花炒鸡蛋' }],
  ['community-ai', { action: 'moderate', text: '今天吃了西兰花和鸡蛋，搭配一碗米饭。' }],
  ['deepseek-recipe', { goal: 'balance', gender: 'female', age: 30, height_cm: 165, weight_kg: 60, activity_level: 'medium', allergies: '花生', tdee: 1800 }],
  ['recipe-generate', { ingredients: ['鸡蛋', '西兰花'], taste: '清淡', meal_type: 'lunch', calorie_limit: 500, cook_time: '20分钟', tools: ['炒锅'], servings: 1 }],
  ['food-substitute', { food: { name: '炸鸡', calories: 300, protein: 20, carbs: 20, fat: 18, sugar: 2, sodium: 500 }, portion: '100g', filter: '低脂' }],
  ['fridge-clearance', { expiring_ingredients: ['鸡蛋'], regular_ingredients: ['番茄'], seasonings: ['盐', '食用油'], cook_minutes_limit: 15, tools: ['炒锅'], servings: 1 }],
  ['takeout-advisor', { scene: 'takeout', target_cuisine: '家常中餐', menu_text: '清蒸鱼，番茄炒蛋，米饭，清炒青菜', calorie_budget: 550, dietary_goal: 'balance' }],
  ['glycemic-advisor', { meal_name: '测试午餐', items: [{ name: '米饭', carbs: 50, amount: '约180g' }], total_carbs: 50, total_protein: 20, total_fat: 10 }],
  ['package-scan', { image }],
  ['food-recognition', { image }],
];
const selected = process.env.LOCAL_AI_TEST_CASES?.split(',');
const cases = selected ? allCases.filter(([name]) => selected.includes(name)) : allCases;
const results = [];
for (const [name, body] of cases) {
  const started = performance.now();
  let upstream;
  const result = await handleAI(name, body, { fetchImpl: async (...args) => {
    const response = await fetch(...args);
    upstream = await response.clone().json().catch(() => null);
    return response;
  } });
  const elapsedSeconds = Math.round((performance.now() - started) / 100) / 10;
  results.push({ name, action: body.action, status: result.status, elapsedSeconds, result: result.body, ...(result.status !== 200 && upstream ? { upstream } : {}) });
  console.log(`${name}${body.action ? `/${body.action}` : ''}: HTTP ${result.status}, ${elapsedSeconds}s, ${result.status === 200 ? Object.keys(result.body).join(', ') : result.body.error}`);
}
const outputDirectory = new URL('../../local-models/test-results/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL(selected ? 'real-inference-recheck.json' : 'real-inference.json', outputDirectory), JSON.stringify({ testedAt: new Date().toISOString(), model: process.env.LOCAL_AI_MODEL, note: 'Real local inference using synthetic data. Nutrition estimates are not independently validated.', results }, null, 2));
if (results.some((result) => result.status !== 200)) process.exitCode = 1;
