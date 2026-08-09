import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

const listPages = [
  'apps/web/src/features/animals/AnimalsPage.tsx',
  'apps/web/src/features/appointments/AppointmentsPage.tsx',
  'apps/web/src/features/billing/BillsPage.tsx',
  'apps/web/src/features/documents/DocumentTemplatesPage.tsx',
  'apps/web/src/features/hospital/HospitalPage.tsx',
  'apps/web/src/features/laboratory/LaboratoryPage.tsx',
  'apps/web/src/features/medicalPhrases/MedicalPhrasesSettingsPage.tsx',
  'apps/web/src/features/news/NewsPage.tsx',
  'apps/web/src/features/onlineRequests/OnlineRequestsPage.tsx',
  'apps/web/src/features/owners/OwnerCardPage.tsx',
  'apps/web/src/features/owners/OwnersPage.tsx',
  'apps/web/src/features/queue/QueuePage.tsx',
  'apps/web/src/features/sales/SalesPage.tsx',
  'apps/web/src/features/tasks/TasksPage.tsx',
  'apps/web/src/features/visits/VisitsPage.tsx',
];

test('поиск в списках запускается при наборе текста и сохраняет немедленный запуск', async () => {
  const liveSearch = await read('apps/web/src/shared/ui/LiveSearchInput.tsx');

  assert.match(liveSearch, /debounceMs = 300/);
  assert.match(liveSearch, /onChange\?\.\(event\)/);
  assert.match(liveSearch, /window\.setTimeout/);
  assert.match(liveSearch, /event\.type === 'click'/);
  assert.match(liveSearch, /onSearchRef\.current\?\.\(value, undefined, \{ source: 'input' \}\)/);
  assert.match(liveSearch, /cancelScheduledSearch\(\);[\s\S]*onSearch\?\.\(value, event, info\)/);

  for (const path of listPages) {
    const page = await read(path);
    assert.match(page, /<LiveSearchInput\b/, `${path} должен использовать живой поиск`);
    assert.doesNotMatch(page, /<Input\.Search\b/, `${path} не должен обходить живой поиск`);
  }
});

test('новый PDF получает загруженный логотип организации и фиксирует его контрольную сумму', async () => {
  const [documentsService, pdfService] = await Promise.all([
    read('apps/api/src/modules/documents/documents.service.ts'),
    read('apps/api/src/modules/documents/document-pdf.service.ts'),
  ]);

  assert.match(documentsService, /logoStorageKey: true/);
  assert.match(documentsService, /logoMimeType: true/);
  assert.match(documentsService, /document\.visit\.appointment\?\.office\?\.organization/);
  assert.match(documentsService, /document\.visit\.queueEntry\?\.office\?\.organization/);
  assert.match(documentsService, /document\.visit\.hospitalBox\?\.office\.organization/);
  assert.match(documentsService, /document\.visit\.owner\.office\?\.organization/);
  assert.match(documentsService, /tx\.organization\.findFirst/);
  assert.match(documentsService, /clinicName: organization\?\.displayName/);
  assert.match(documentsService, /this\.storage\.getObject\(storageKey\)/);
  assert.match(documentsService, /clinicLogoSha256/);
  assert.match(documentsService, /this\.pdfService\.render\(pdfSnapshot, clinicLogo\)/);
  assert.match(pdfService, /document\.image\(clinicLogo\.data/);
  assert.doesNotMatch(pdfService, /temichevvet-logo\.jpg/);
});
