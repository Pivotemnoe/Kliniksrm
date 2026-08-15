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

test('платный лабораторный анализ связывается с одной услугой и существующим документом', async () => {
  const [page, visitTab, service, dto] = await Promise.all([
    read('apps/web/src/features/laboratory/LaboratoryPage.tsx'),
    read('apps/web/src/features/visits/VisitLaboratoryTab.tsx'),
    read('apps/api/src/modules/laboratory/laboratory.service.ts'),
    read('apps/api/src/modules/laboratory/dto/upsert-laboratory-test.dto.ts'),
  ]);

  assert.match(page, /Свяжите услугу с документом результатов/);
  assert.match(page, /listDocumentTemplates/);
  assert.match(page, /name="documentTemplateId"/);
  assert.doesNotMatch(page, /Новый профиль из нескольких анализов/);
  assert.match(visitTab, /Каждый анализ уже связан с услугой и готовым документом/);
  assert.doesNotMatch(visitTab, /name="profileIds"/);
  assert.match(service, /ensureActiveTestConfigured/);
  assert.match(dto, /documentTemplateId\?: string/);
});

test('в списке приёмов есть отдельная понятная кнопка открытия', async () => {
  const page = await read('apps/web/src/features/visits/VisitsPage.tsx');

  assert.match(page, /title: 'Действия'/);
  assert.match(page, /<FolderOpenOutlined \/>/);
  assert.match(page, />\s*Открыть\s*<\/Button>/);
  assert.match(page, /formatDateTime\(value\)/);
});
