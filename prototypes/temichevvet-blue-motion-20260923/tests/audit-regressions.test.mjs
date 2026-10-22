import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serviceCatalogItems } from '../src/service-catalog.js';
import { filterCatalog } from '../src/catalog.js';

test('visual diagnostics and mixed diagnostic categories reach the right directions', () => {
  const items = [
    { id:'1', title:'УЗИ обзорное', category:'Визуальная диагностика' },
    { id:'2', title:'Кардиограмма', category:'Диагностика' },
    { id:'3', title:'Общий анализ крови', category:'Диагностика' },
    { id:'4', title:'Исследование мочи', category:'Диагностика' },
  ];
  assert.deepEqual(serviceCatalogItems(items,'diagnostics').map(x=>x.id), ['1','2']);
  assert.deepEqual(serviceCatalogItems(items,'laboratory').map(x=>x.id), ['3','4']);
});
test('price order groups categories without changing source catalog or IDs', () => {
  const items = [{id:'a',title:'Я',category:'Б'}, {id:'b',title:'Б',category:'А'}, {id:'c',title:'А',category:'А'}];
  assert.deepEqual(filterCatalog(items,'','').map(x=>x.id), ['c','b','a']);
  assert.deepEqual(items.map(x=>x.id), ['a','b','c']);
});
test('visit exposes online request without obsolete phone-only claim', async () => {
  const html = await readFile(new URL('../dist/client/visit/index.html', import.meta.url), 'utf8');
  assert.match(html, /Оставить заявку на приём/);
  assert.doesNotMatch(html, /Заявки через сайт пока не принимаются/);
  const chat = await readFile(new URL('../src/ClinicChatPanel.jsx', import.meta.url),'utf8');
  assert.doesNotMatch(chat, /setLeadOpen\(true\) : send\("Хочу поговорить с администратором по записи"\)/);
});
