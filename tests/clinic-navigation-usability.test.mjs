import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('технический порядок способов оплаты скрыт от сотрудника', async () => {
  const page = await read('apps/web/src/features/finance/FinanceSettingsPage.tsx');

  assert.doesNotMatch(page, /title: 'Порядок'/);
  assert.doesNotMatch(page, /<Form\.Item label="Порядок">/);
  assert.match(page, /getNextPaymentMethodSortOrder/);
});

test('лабораторный профиль объединяет от одного до двадцати анализов', async () => {
  const page = await read('apps/web/src/features/laboratory/LaboratoryPage.tsx');
  const visitTab = await read('apps/web/src/features/visits/VisitLaboratoryTab.tsx');
  const dto = await read('apps/api/src/modules/laboratory/dto/upsert-laboratory-profile.dto.ts');

  assert.match(page, /Новый профиль из нескольких анализов/);
  assert.match(page, /\.min\(1, 'Выберите хотя бы один анализ'\)\.max\(20/);
  assert.match(page, /maxCount=\{20\}/);
  assert.match(page, /все входящие анализы добавятся автоматически/);
  assert.match(visitTab, /Профиль добавляет сразу всю карточку анализов/);
  assert.match(visitTab, /profile\.tests\.length/);
  assert.match(dto, /@ArrayMaxSize\(20\)/);
});

test('в списке приёмов есть отдельная понятная кнопка открытия', async () => {
  const page = await read('apps/web/src/features/visits/VisitsPage.tsx');

  assert.match(page, /title: 'Действия'/);
  assert.match(page, /<FolderOpenOutlined \/>/);
  assert.match(page, />\s*Открыть\s*<\/Button>/);
  assert.match(page, /formatDateTime\(value\)/);
});
