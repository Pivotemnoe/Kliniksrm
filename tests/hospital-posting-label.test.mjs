import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../apps/web/src/features/hospital/HospitalSheet.tsx', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source + '\nexport { describeCompletedPosting };', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: () => ({}) });
test('cancelled unperformed plan never claims stock write-off or pending billing', () => {
 const plan = { recordStatus: 'SKIPPED', plannedProductId: 'p', plannedStockQuantity: 0.5, plannedQuantity: 1, plannedUnitPrice: 120, plannedProduct: { writeOffUnit: 'мл' } };
 assert.equal(exports.describeCompletedPosting(plan), '');
 assert.match(exports.describeCompletedPosting({ ...plan, recordStatus: 'COMPLETED' }), /Списано 0.5 мл/);
});
