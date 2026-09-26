import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
function load(path, globals = {}) {
 const code = buildSync({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
 const module = { exports: {} }; vm.runInNewContext(code, { module, exports: module.exports, URL, ...globals }); return module.exports;
}
const branding = load('apps/web/src/shared/print/branding.ts', { window: { location: { href: 'https://staff.example/' } } });
const tick = () => new Promise(resolve => setImmediate(resolve));
test('print waits for a slow logo and image decode, without dropping the image', async () => {
 let prints = 0, finish;
 const image = { complete: false, src: '/custom-logo', dataset: { clinicLogo: '' }, decode: () => new Promise(resolve => { finish = resolve; }) };
 const code = branding.printImagesScript().replace(/^<script>|<\/script>$/g, '');
 vm.runInNewContext(code, { document: { images: [image] }, window: { print: () => prints++, alert: assert.fail } });
 await tick(); assert.equal(prints, 0);
 image.onload(); await tick(); assert.equal(prints, 0);
 finish(); await tick(); assert.equal(prints, 1); assert.equal(image.src, '/custom-logo');
});
test('failed configured logo retries bundled clinic logo before printing', async () => {
 let prints = 0;
 const image = { complete: true, naturalWidth: 0, src: 'https://staff.example/api/logo', dataset: { clinicLogo: '' }, decode: async () => {} };
 vm.runInNewContext(branding.printImagesScript().replace(/^<script>|<\/script>$/g, ''), { document: { images: [image] }, window: { print: () => prints++, alert: assert.fail } });
 assert.equal(image.src, 'https://staff.example/brand/temichevvet-logo.jpg'); assert.equal(prints, 0);
 image.onload(); await tick(); assert.equal(prints, 1);
});
test('recommendation saves are ordered, survive failure and preserve a newer draft', async () => {
 const storage = new Map();
 const m = load('apps/web/src/features/visits/recommendationDraft.ts', { localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } });
 const old = { treatmentPlan: 'old', careNotes: '' }, latest = { treatmentPlan: 'latest', careNotes: 'care' };
 m.writeRecommendationDraft('v', latest); m.clearRecommendationDraft('v', JSON.stringify(old));
 assert.equal(m.readRecommendationDraft('v').values.treatmentPlan, 'latest');
 let release; const order = [];
 const a = m.enqueueRecommendationSave('v', () => new Promise((_, reject) => { order.push('first'); release = reject; }));
 const b = m.enqueueRecommendationSave('v', async () => { order.push('second'); });
 await tick(); assert.deepEqual(order, ['first']); release(Error('offline')); await assert.rejects(a); await b;
 assert.deepEqual(order, ['first', 'second']);
 m.clearRecommendationDraft('v', JSON.stringify(latest)); assert.equal(m.readRecommendationDraft('v'), null);
});
