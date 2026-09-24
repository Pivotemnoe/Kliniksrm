import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrintModule } from './helpers/print-module.mjs';
const { documentFragments } = loadPrintModule('visits/examDocumentFragments.ts');
test('composite scheme keeps text and table row order, ignores blank and layout-only blocks', () => {
 const actual = documentFragments({body:'fallback must not appear',layout:{blocks:[
  {type:'text',text:'Схема'}, {type:'spacer'}, {type:'text',text:'   '},
  {type:'table',rows:[['Препарат','Доза'],['A','{{dose}}'],['','']]}, {type:'pageBreak'}, {type:'text',text:'Контроль'},
 ]}});
 assert.deepEqual(Array.from(actual),['Схема','Препарат | Доза','A | {{dose}}','Контроль']);
});
test('plain documents split paragraphs without substituting clinical placeholders', () => {
 assert.deepEqual(Array.from(documentFragments({body:'Первый\n\n{{animal.weight}}\n\n'})),['Первый','{{animal.weight}}']);
 assert.equal(documentFragments({body:''}).length,0);
});
