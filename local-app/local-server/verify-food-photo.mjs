// Real model positive test using an existing app asset. No application DB writes.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { handleAI } from './ai.mjs';
import { getModelEnvironment } from './model-service.mjs';

const photo = await readFile(new URL('../assets/featured/f1.png', import.meta.url));
const env = getModelEnvironment();
const started = performance.now();
const response = await handleAI('food-recognition', { image: `data:image/png;base64,${photo.toString('base64')}` }, { env });
const elapsedSeconds = Math.round((performance.now() - started) / 100) / 10;
const items = response.body.items || [];
const reasonableObjects = items.some((item) => /牛油果|鳄梨|沙拉/.test(item.name));
const observedCoverage = {
  avocado: items.some((item) => /牛油果|鳄梨/.test(item.name)),
  saladOrGreens: items.some((item) => /沙拉|生菜|蔬菜|绿叶/.test(item.name)),
  chicken: items.some((item) => /鸡/.test(item.name)),
  tomato: items.some((item) => /番茄|西红柿/.test(item.name)),
};
const editableNumericFields = items.length > 0 && items.every((item) => ['calories', 'protein', 'carbs', 'fat'].every((key) => Number.isFinite(item[key]) && item[key] >= 0));
const estimatesMarkedUnverified = items.length > 0 && items.every((item) => item.verified === false);
const passed = response.status === 200 && reasonableObjects && editableNumericFields && estimatesMarkedUnverified;
const report = {
  testedAt: new Date().toISOString(), model: env.LOCAL_AI_VISION_MODEL,
  sourceAsset: 'local-app/assets/featured/f1.png',
  visualReference: 'The existing app image visibly contains avocado, a bowl of leafy salad with chicken pieces, and tomato; some ingredients are partly obscured.',
  status: response.status, elapsedSeconds, passed,
  checks: { reasonableObjects, editableNumericFields, estimatesMarkedUnverified },
  observedCoverage,
  note: 'Positive image recognition and frontend data contract test only. Portion and nutrition are model estimates, not weighed or laboratory-verified values. Nothing was written to user meal records.',
  result: response.body,
};
const output = new URL('../../local-models/test-results/food-photo-positive.json', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
