import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('поиск товара и услуги идёт по полному серверному каталогу с первого символа', async () => {
  const [picker, visit, bill, sale, stock, hospital] = await Promise.all([
    read('apps/web/src/features/stock/useCatalogPicker.ts'),
    read('apps/web/src/features/visits/VisitServicesTab.tsx'),
    read('apps/web/src/features/billing/BillCardPage.tsx'),
    read('apps/web/src/features/sales/SalesPage.tsx'),
    read('apps/web/src/features/stock/StockPage.tsx'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
  ]);

  assert.match(picker, /listProducts\(\{ search: search \|\| undefined/);
  assert.match(picker, /listServices\(\{ search: search \|\| undefined/);
  assert.match(picker, /useDeferredValue/);
  assert.match(picker, /query\.data\?\.items/);
  assert.doesNotMatch(picker, /knownItems|setKnownItems/);
  assert.match(visit, /useVisitProductCatalogPicker/);
  assert.match(visit, /useVisitServiceCatalogPicker/);
  assert.match(visit, /filterOption=\{false\}/);
  assert.match(visit, /onSearch=\{productsQuery\.onSearch\}/);
  assert.match(picker, /getVisitClinicalCatalog/);
  for (const page of [bill, sale]) {
    assert.match(page, /useProductCatalogPicker/);
    assert.match(page, /useServiceCatalogPicker/);
    assert.match(page, /filterOption=\{false\}/);
    assert.match(page, /onSearch=\{productsQuery\.onSearch\}/);
  }
  assert.doesNotMatch(stock, /normalizedProductSearch\.length >= 3/);
  assert.doesNotMatch(stock, /Введите минимум 3 символа/);
  assert.match(hospital, /withRussianSearchVariants\(search/);
  assert.match(hospital, /title: \{ contains: variant, mode: 'insensitive'/);
  assert.match(hospital, /barcodes: \{ some: \{ value: \{ contains: variant/);
});

test('лабораторный бланк редактируется в документах и печатается из привязанной формы', async () => {
  const [organizationController, editor, visitDocuments, templatePage, laboratoryPage, laboratoryResultsDrawer, laboratoryPrint, laboratoryForm, styles] = await Promise.all([
    read('apps/api/src/modules/organization/organization.controller.ts'),
    read('apps/web/src/features/documents/DocumentVisualEditor.tsx'),
    read('apps/web/src/features/visits/VisitDocumentsTab.tsx'),
    read('apps/web/src/features/documents/DocumentTemplatesPage.tsx'),
    read('apps/web/src/features/laboratory/LaboratoryPage.tsx'),
    read('apps/web/src/features/laboratory/LaboratoryResultsTableDrawer.tsx'),
    read('apps/web/src/features/laboratory/laboratoryPrint.ts'),
    read('apps/api/src/modules/laboratory/laboratory-document-form.ts'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(editor, /DocumentTableGridEditor/);
  assert.match(editor, /Нажмите нужную ячейку и введите значение/);
  assert.match(editor, /placeholder=\{rowIndex < block\.headerRows \? 'Заголовок' : 'Введите значение'\}/);
  assert.match(editor, /Добавить строку/);
  assert.match(editor, /Добавить столбец/);
  assert.doesNotMatch(editor, /столбцы разделяются символом \|/);
  assert.match(visitDocuments, /width="min\(1280px, calc\(100vw - 24px\)\)"/);
  assert.match(templatePage, /renderPrintableLayout/);
  assert.match(templatePage, /class="document-table"/);
  assert.match(templatePage, /organization\?\.logoUrl/);
  assert.match(organizationController, /@Get\('print-profile'\)/);
  assert.match(organizationController, /@Get\('print-logo'\)/);
  assert.match(organizationController, /@RequireAnyPermissions\('settings\.read', 'documents\.print'\)/);
  assert.match(laboratoryPage, /Печать A5/);
  assert.match(laboratoryPage, /listDocumentTemplates/);
  assert.match(laboratoryPage, /name="documentTemplateId"/);
  assert.match(laboratoryResultsDrawer, /Сохранить всю таблицу/);
  assert.match(laboratoryPrint, /@page \{ size: A5 portrait; margin: 0; \}/);
  assert.match(laboratoryPrint, /snapshot\.documentTemplateTitle/);
  assert.match(laboratoryPrint, /order\.visit\.owner\.fullName/);
  assert.match(laboratoryPrint, /order\.visit\.animal\.nickname/);
  assert.match(laboratoryPrint, /organization\?\.logoUrl/);
  assert.match(laboratoryForm, /The laboratory does not own another form editor/);
  assert.match(styles, /\.document-table-grid-scroll/);
});

test('в стационаре ручные выполнения объяснены отдельно, а блок повтора сохранён', async () => {
  const modal = await read('apps/web/src/features/hospital/HospitalTreatmentPlanModal.tsx');

  assert.match(modal, /Первое выполнение/);
  assert.match(modal, /Дополнительное выполнение/);
  assert.match(modal, /Добавить ещё одно выполнение вручную/);
  assert.match(modal, /Для одинакового интервала используйте блок «Повтор» ниже/);
  assert.match(modal, /Быстро сформировать повтор/);
  assert.match(modal, /Сформировать даты/);
  assert.doesNotMatch(modal, /Добавить точную дату/);
});

test('пациент архивируется с причиной без удаления истории и может быть восстановлен', async () => {
  const [schema, migration, dto, controller, service, api, card, ownerAnimals, ownersService, scheduling] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260812000200_animal_archive/migration.sql'),
    read('apps/api/src/modules/animals/dto/archive-animal.dto.ts'),
    read('apps/api/src/modules/animals/animals.controller.ts'),
    read('apps/api/src/modules/animals/animals.service.ts'),
    read('apps/web/src/features/animals/animals.api.ts'),
    read('apps/web/src/features/animals/AnimalCardPage.tsx'),
    read('apps/web/src/features/owners/OwnerAnimalsTab.tsx'),
    read('apps/api/src/modules/owners/owners.service.ts'),
    read('apps/api/src/modules/scheduling/scheduling.service.ts'),
  ]);

  assert.match(schema, /archivedAt\s+DateTime\?/);
  assert.match(schema, /archiveReason\s+String\?/);
  assert.match(migration, /ADD COLUMN "archivedAt"/);
  assert.match(dto, /DECEASED = 'DECEASED'/);
  assert.match(dto, /ERRONEOUS = 'ERRONEOUS'/);
  assert.match(dto, /OTHER = 'OTHER'/);
  assert.match(controller, /@Post\(':animalId\/archive'\)/);
  assert.match(controller, /@Post\(':animalId\/restore'\)/);
  assert.match(controller, /@RequirePermissions\('animals\.manage'\)/);
  assert.match(service, /action: 'animal\.archive'/);
  assert.match(service, /action: 'animal\.restore'/);
  assert.match(service, /cancelledFutureNotifications/);
  assert.match(service, /linkedRecords/);
  assert.doesNotMatch(service, /tx\.animal\.delete/);
  assert.match(api, /\/archive/);
  assert.match(api, /\/restore/);
  assert.doesNotMatch(api, /method: 'DELETE'/);
  assert.match(card, /Убрать из активных/);
  assert.match(card, /История лечения, документов и оплат не удаляется/);
  assert.match(ownerAnimals, /Показать архив/);
  assert.match(ownerAnimals, /Восстановить/);
  assert.match(ownersService, /includeArchived/);
  assert.match(ownersService, /archivedAt: null/);
  assert.match(scheduling, /Для новой операции сначала восстановите карточку/);
});
