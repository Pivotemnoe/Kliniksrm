import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {extractLaboratoryDocumentIndicators: extract} = require('../apps/api/dist/modules/laboratory/laboratory-document-form.js');
const form = () => ({schemaVersion:1, blocks:[{id:'blood',type:'table',headerRows:1,rows:[
  ['Полное наименование','Сокращение','Норма кошки','Результат','Норма собаки','Ед.'],
  ['Гемоглобин','HGB','80–150','','120–180','г/л'],
]}]});

test('new cat/dog orders have only their own reference, preserving source and bindings', () => {
  const source=form(), original=structuredClone(source);
  for(const [species, norm] of [['Кошка','80–150'],['Собака','120–180']]) {
    const result=extract(source,species);
    assert.equal(result.indicators[0].referenceRange,norm);
    assert.equal(result.indicators[0].unit,'г/л');
    assert.equal(result.layout.blocks[0].rows[0][result.indicators[0].resultColumnIndex],'Результат');
    assert.equal(result.layout.blocks[0].rows[0].length,5);
  }
  assert.deepEqual(source,original);
  assert.equal(extract(source).layout.blocks[0].rows[0].length,6);
});
test('unknown/unsupported species never inherits cat or dog reference', () => {
  for(const species of [null,'','Кролик']) {
    const result=extract(form(),species);
    assert.equal(result.indicators[0].referenceRange,null);
    assert.equal(result.layout.blocks[0].rows[1].includes('80–150'),false);
    assert.equal(result.layout.blocks[0].rows[1].includes('120–180'),false);
  }
});
test('plural Нормы, decimal comma and missing norms are preserved literally', () => {
  const source={schemaVersion:1,blocks:[{id:'t',type:'table',headerRows:1,rows:[
    ['Показатель','Результат','Нормы','Единица измерения'],['Белок','','5,2–8,1','г/дл'],['Другой','','',''],
  ]}]};
  const {indicators}=extract(source,'Собака');
  assert.equal(indicators[0].referenceRange,'5,2–8,1');
  assert.equal(indicators[1].referenceRange,null);
});
test('existing result snapshot stays independent when template changes', () => {
  const source=form(); const snapshot=extract(source,'Собака');
  source.blocks[0].rows[1][4]='changed';
  assert.equal(snapshot.indicators[0].referenceRange,'120–180');
  assert.equal(snapshot.layout.blocks[0].rows[1].includes('changed'),false);
});

test('printed form matches saved result, corrected unit/reference and patient identity', async () => {
  const {buildSync}=require('esbuild');
  const bundled=buildSync({entryPoints:['apps/web/src/features/laboratory/laboratoryPrint.ts'],bundle:true,write:false,platform:'node',format:'esm'}).outputFiles[0].text;
  const {buildLaboratoryOrderPrintHtml}=await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
  const parsed=extract(form(),'Собака'), indicator=parsed.indicators[0];
  const snapshot={schemaVersion:1,testId:'test',testTitle:'Test',documentTemplateId:'doc',documentTemplateTitle:'ОАК',documentTemplateVersion:1,layout:parsed.layout,bindings:[{itemId:'item',...indicator}]};
  const order={id:'order',status:'COMPLETED',comment:null,createdAt:'2026-09-13T10:00:00Z',completedAt:null,formSnapshots:[snapshot],
    visit:{owner:{fullName:'Тестовый владелец',phone:null},animal:{nickname:'Тестовый пёс',species:'Собака',breed:null,birthDate:'2024-01-01'},employee:null},
    items:[{id:'item',resultValue:'140,5',resultText:null,unit:'edited-unit',referenceRange:'edited-reference'}]};
  const html=buildLaboratoryOrderPrintHtml(order);
  for(const value of ['140,5','edited-unit','edited-reference','Тестовый владелец','Тестовый пёс','2 года']) assert.ok(html.includes(value),value);
  assert.ok(!html.includes('80–150'));assert.ok(!html.includes('120–180'));
  assert.equal(parsed.layout.blocks[0].rows[1].includes('120–180'),true);
  // Older snapshots without the optional bindings retain their original reference.
  delete snapshot.bindings[0].unitColumnIndex;delete snapshot.bindings[0].referenceColumnIndex;
  assert.ok(buildLaboratoryOrderPrintHtml(order).includes('120–180'));
});

test('A5 print omits removed rows and prints manual indicators once without changing template bindings', async () => {
  const {buildSync}=require('esbuild');
  const bundled=buildSync({entryPoints:['apps/web/src/features/laboratory/laboratoryPrint.ts'],bundle:true,write:false,platform:'node',format:'esm'}).outputFiles[0].text;
  const {buildLaboratoryOrderPrintHtml:print}=await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
  const source={schemaVersion:1,blocks:[{id:'t',type:'table',headerRows:1,rows:[
    ['Показатель','Результат','Норма','Ед.'],['Удалённый маркер','','old-ref','u'],['Сохранённый маркер','','old-ref','u'],
  ]}]};
  const parsed=extract(source,'Собака');
  const snapshot={schemaVersion:1,testId:'test',testTitle:'Test',documentTemplateId:'doc',documentTemplateTitle:'Бланк',documentTemplateVersion:1,layout:parsed.layout,bindings:parsed.indicators.map((v,i)=>({...v,itemId:`row${i}`}))};
  const order={id:'order',status:'COMPLETED',comment:null,createdAt:'2026-09-14T10:00:00Z',completedAt:null,formSnapshots:[snapshot],
    visit:{owner:{fullName:'Тестовый владелец',phone:null},animal:{nickname:'Тестовый пациент',species:'Собака',breed:null},employee:null},
    items:[{id:'row0',status:'CANCELLED',title:'Удалённый маркер',resultValue:'deleted-value'},
      {id:'row1',status:'COMPLETED',title:'Сохранённый маркер',resultValue:'2,5',unit:'saved-unit',referenceRange:'saved-ref'},
      {id:'manual',status:'COMPLETED',title:'Новый <маркер>',code:'NEW',resultValue:'3,5',unit:'manual-unit',referenceRange:'manual-ref'},
      {id:'removed-manual',status:'CANCELLED',title:'Удалённый дополнительный',resultValue:'deleted-manual'},
    ]};
  const before=structuredClone(order);
  for(const snapshots of [[snapshot],[snapshot,snapshot],null]) {
    const html=print({...order,formSnapshots:snapshots});
    for(const text of ['2,5','saved-ref','saved-unit','3,5','manual-ref','manual-unit','Новый &lt;маркер&gt;','size: A5 portrait']) assert.ok(html.includes(text),text);
    for(const text of ['Удалённый маркер','deleted-value','Удалённый дополнительный','deleted-manual','<маркер>']) assert.ok(!html.includes(text),text);
    assert.equal(html.split('Новый &lt;маркер&gt;').length-1,1);
  }
  assert.deepEqual(order,before);
});
