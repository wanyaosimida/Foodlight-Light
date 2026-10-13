import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { handleAI } from './ai.mjs';
import { getModelEnvironment } from './model-service.mjs';

const directory = new URL('../local-models/image-runtime/', import.meta.url);
const reference = await readFile(new URL('avatar-test.png', directory));
const started = Date.now();
const result = await handleAI('image-edits', {
  prompt: 'An adult man wearing a blue sports shirt, holding a salad bowl, warm ivory background, editorial illustration',
  size: '1024x1024', images: [{ b64_json: reference.toString('base64') }],
}, { env: getModelEnvironment() });
assert.equal(result.status, 200, result.body.error);
const image = Buffer.from(result.body.data[0].b64_json, 'base64');
assert.equal(image.subarray(1, 4).toString(), 'PNG');
assert.equal(image.readUInt32BE(16), 512);
assert.equal(image.readUInt32BE(20), 512);
await writeFile(new URL('avatar-edit-test.png', directory), image);
const report = { checkedAt: new Date().toISOString(), interface: 'image-edits', status: result.status,
  runtime: result.body.runtime, model: result.body.model, width: 512, height: 512,
  bytes: image.length, durationMs: Date.now() - started };
await writeFile(new URL('image-edit-verification.json', directory), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
