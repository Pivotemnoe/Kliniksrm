import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../apps/web/src/features/billing/groupBillLines.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { groupBillLines, billQuantityText, billPriceText } = exports;
const product = { id: '1', title: 'Препарат', kind: 'PRODUCT', productId: 'p', quantity: '1', stockQuantity: '1', billingUnit: 'мл', stockUnit: 'мл', unitPrice: '120', totalAmount: '120' };
test('three completed millilitre doses become one 3 ml line, same total and untouched inputs', () => {
 const input = [1,2,3].map(id => ({ ...product, id: String(id) }));
 const lines = groupBillLines(input);
 assert.equal(lines.length, 1);
 assert.equal(Number(lines[0].stockQuantity), 3);
 assert.equal(Number(lines[0].totalAmount), 360);
 assert.equal(billQuantityText(lines[0]), '3 мл');

 assert.equal(input[0].quantity, '1');
});
test('four services are one row; distinct product IDs and units stay separate', () => {
 const service = { ...product, productId: null, serviceId: 's', kind: 'SERVICE', stockQuantity: null, billingUnit: 'усл.' };
 assert.equal(Number(groupBillLines([service,service,service,service])[0].quantity), 4);
 assert.equal(groupBillLines([product, {...product,productId:'other'}, {...product,unitPrice:'130',totalAmount:'130'}, {...product,stockUnit:'мг'}]).length, 3);
 const [varied] = groupBillLines([product,{...product,quantity:'2',stockQuantity:'2',totalAmount:'240'}]);
 assert.equal(billQuantityText(varied),'3 мл');
 assert.equal(Number(varied.totalAmount),360);
 const [changedPrice] = groupBillLines([product,{...product,unitPrice:'130',totalAmount:'130'}]);
 assert.equal(Number(changedPrice.totalAmount),250);
 assert.equal(changedPrice.priceVaries,true);
});
test('fractional consumption is exact and never confused with paid injections', () => {
 const injection = {...product,stockQuantity:'0.1',billingUnit:'введение'};
 const [line] = groupBillLines([injection,injection,injection]);
 assert.equal(billQuantityText(line), '3 введение');
 assert.equal(Number(line.stockQuantity),0.3);
 assert.equal(Number(line.totalAmount), 360);
 assert.equal(billPriceText(line, v => `${v} ₽`),'120 ₽');
});
