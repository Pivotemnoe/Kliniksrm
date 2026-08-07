import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('журнал стационара добавляется без изменения существующих клинических записей', async () => {
  const migration = await read('prisma/migrations/20260727000100_hospital_records/migration.sql');

  assert.match(migration, /CREATE TABLE "HospitalRecord"/);
  assert.match(migration, /REFERENCES "Visit"\("id"\)/);
  assert.doesNotMatch(migration, /^\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b|UPDATE\s+[^\s]+\s+SET\b)/im);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|VisitExam|Bill)"/);
});

test('стационар имеет отдельную карту и временной журнал', async () => {
  const routes = await read('apps/web/src/app/routes.tsx');
  const card = await read('apps/web/src/features/hospital/HospitalCardPage.tsx');
  const hospitalList = await read('apps/web/src/features/hospital/HospitalPage.tsx');

  assert.match(routes, /path: '\/hospital\/:stayId'/);
  assert.match(card, /Полный лист стационара/);
  assert.match(card, /Всё пребывание на одном экране/);
  assert.match(hospitalList, /label: animal\.nickname/);
  assert.doesNotMatch(hospitalList, /label: `\$\{animal\.nickname\} · \$\{owner\.fullName\}`/);
});

test('обычные приёмы и стационар разделены в пользовательском интерфейсе', async () => {
  const visitsPage = await read('apps/web/src/features/visits/VisitsPage.tsx');
  const visitCard = await read('apps/web/src/features/visits/VisitCardPage.tsx');
  const exam = await read('apps/web/src/features/visits/VisitExamTab.tsx');

  assert.doesNotMatch(visitsPage, /excludeHospital: true/);
  assert.match(visitCard, /Открыть карту стационара/);
  assert.match(visitCard, /hospitalStay/);
  assert.doesNotMatch(visitCard, /<VisitHospitalTab/);
  assert.match(exam, /value="Стационар"/);
});

test('пребывание в стационаре имеет независимый от приёма жизненный цикл', async () => {
  const migration = await read('prisma/migrations/20260728000100_hospital_stay_lifecycle/migration.sql');
  const service = await read('apps/api/src/modules/hospital/hospital.service.ts');

  assert.match(migration, /CREATE TABLE "HospitalStay"/);
  assert.match(migration, /"sourceVisitId" TEXT NOT NULL/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.match(service, /data: \{ status: VisitStatus\.COMPLETED, completedAt \}/);
  assert.match(service, /tx\.hospitalStay\.create/);
  assert.match(service, /status: HospitalStayStatus\.ACTIVE/);
  assert.match(service, /data: \{ status: HospitalStayStatus\.DISCHARGED, completedAt: new Date\(\) \}/);
  assert.doesNotMatch(service, /data: \{ status: VisitStatus\.COMPLETED, completedAt: new Date\(\) \}/);
});

test('поиск стационара работает без обязательного фильтра статуса', async () => {
  const service = await read('apps/api/src/modules/hospital/hospital.service.ts');
  const page = await read('apps/web/src/features/hospital/HospitalPage.tsx');

  assert.match(service, /\.\.\.\(query\.status \? \{ status: query\.status \} : \{\}\)/);
  assert.doesNotMatch(service, /query\.status \? \[query\.status\]/);
  assert.match(page, /value=\{status\}/);
  assert.match(page, /placeholder="Все статусы"/);
});

test('температура стационара передаётся числом с точностью до десятых', async () => {
  const dto = await read('apps/api/src/modules/hospital/dto/create-hospital-record.dto.ts');
  const card = await read('apps/web/src/features/hospital/HospitalCardPage.tsx');

  assert.match(dto, /@Type\(\(\) => Number\)/);
  assert.match(dto, /maxDecimalPlaces: 1/);
  assert.match(card, /Math\.round\(Number\(String\(values\.temperatureC\)\.replace\(',', '\.'\)\) \* 10\) \/ 10/);
});

test('запись стационара редактируется и может быть связана со счётом и складом', async () => {
  const [schema, migration, controller, service, card, api] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260730000300_hospital_record_billing/migration.sql'),
    read('apps/api/src/modules/hospital/hospital.controller.ts'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/hospital.api.ts'),
  ]);

  assert.match(schema, /billItemId\s+String\?\s+@unique/);
  assert.match(migration, /REFERENCES "BillItem"\("id"\) ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE\s+FROM|TRUNCATE)\b/i);
  assert.match(controller, /@Patch\(':stayId\/records\/:recordId'\)/);
  assert.match(service, /hospital\.record\.update/);
  assert.match(service, /StockMovementType\.VISIT_USAGE/);
  assert.match(service, /recalculateHospitalBill/);
  assert.match(card, /Изменить/);
  assert.match(card, /Товар — начислить и списать со склада/);
  assert.match(card, /Услуга — начислить по прайсу/);
  assert.match(api, /updateHospitalRecord/);
});

test('многосуточный лист стационара добавляется совместимой миграцией без перезаписи истории', async () => {
  const [schema, migration] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260803000100_hospital_full_sheet/migration.sql'),
  ]);

  assert.match(schema, /enum HospitalRecordStatus[\s\S]*PLANNED[\s\S]*COMPLETED[\s\S]*SKIPPED[\s\S]*AMENDMENT/);
  assert.match(schema, /createdAsPlan\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /parentRecord\s+HospitalRecord\?/);
  assert.match(migration, /SET "completedAt" = "recordedAt"/);
  assert.match(migration, /FOREIGN KEY \("parentRecordId"\) REFERENCES "HospitalRecord"\("id"\) ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE\s+FROM|TRUNCATE)\b/i);
});

test('прошлые сутки стационара исправляются дополнением, а не прямой перезаписью', async () => {
  const [controller, service, dto] = await Promise.all([
    read('apps/api/src/modules/hospital/hospital.controller.ts'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/api/src/modules/hospital/dto/create-hospital-amendment.dto.ts'),
  ]);

  assert.match(controller, /records\/:recordId\/amendments/);
  assert.match(service, /ensureDirectRecordEditAllowed/);
  assert.match(service, /Прошлые сутки закрыты/);
  assert.match(service, /recordStatus: HospitalRecordStatus\.AMENDMENT/);
  assert.match(service, /parentRecordId: existing\.id/);
  assert.match(service, /action: 'hospital\.record\.amend'/);
  assert.match(dto, /reason!:/);
});

test('план прошлых суток можно завершить или отменить без перезаписи исходного назначения', async () => {
  const [policy, dtoModule, service, card, sheet] = await Promise.all([
    import('../apps/api/dist/modules/hospital/hospital-record-policy.js'),
    import('../apps/api/dist/modules/hospital/dto/update-hospital-record.dto.js'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/HospitalSheet.tsx'),
  ]);

  assert.equal(policy.isPlannedDispositionTransition('PLANNED', 'COMPLETED'), true);
  assert.equal(policy.isPlannedDispositionTransition('PLANNED', 'SKIPPED'), true);
  assert.equal(policy.isPlannedDispositionTransition('COMPLETED', 'COMPLETED'), false);
  assert.deepEqual(policy.findUnsafeLateDispositionFields({
    recordStatus: 'COMPLETED',
    completedAt: '2026-08-07T10:00:00.000Z',
    temperatureC: 38.5,
  }), []);
  assert.deepEqual(policy.findUnsafeLateDispositionFields({
    recordStatus: 'COMPLETED',
    title: 'Переписанное назначение',
  }), ['title']);
  assert.deepEqual(policy.findUnsafeLateDispositionFields({
    recordStatus: 'COMPLETED',
    stockQuantity: 999,
  }), ['stockQuantity']);
  const transformedDto = new dtoModule.UpdateHospitalRecordDto();
  transformedDto.recordStatus = 'COMPLETED';
  transformedDto.completedAt = '2026-08-07T10:00:00.000Z';
  assert.deepEqual(
    policy.findUnsafeLateDispositionFields(transformedDto),
    [],
    'непереданные optional-поля настоящего DTO не должны блокировать выполнение',
  );
  transformedDto.title = 'Переписанное назначение';
  assert.deepEqual(policy.findUnsafeLateDispositionFields(transformedDto), ['title']);
  assert.match(service, /const lateDisposition = recordDayClosed/);
  assert.match(service, /findUnsafeLateDispositionFields\(dto\)/);
  assert.match(service, /lateDisposition,/);
  assert.match(sheet, /active && record\.recordStatus === 'PLANNED'/);
  assert.doesNotMatch(sheet, /recordStatus === 'PLANNED' && record\.canEditDirectly/);
  assert.match(card, /Назначение прошлых суток можно отметить выполненным или отменённым/);
  assert.match(card, /Исходное назначение не переписывается/);
  assert.match(card, /Невыполненное назначение при этом можно отдельно отметить выполненным или отменённым/);
  assert.match(card, /Чтобы провести склад и счёт, отметьте назначение «Выполнено»/);
  assert.match(sheet, /Отменить назначение/);
  assert.match(sheet, /SKIPPED: \{ label: 'Отменено'/);
});

test('исправление планового препарата сохраняет новое списание и использует его при выполнении', async () => {
  const [service, dto, card, sheet, types] = await Promise.all([
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/api/src/modules/hospital/dto/create-hospital-amendment.dto.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/HospitalSheet.tsx'),
    read('apps/web/src/features/hospital/types.ts'),
  ]);

  assert.match(dto, /stockQuantity\?: number/);
  assert.match(dto, /quantity\?: number/);
  assert.match(dto, /unitPrice\?: number/);
  assert.match(types, /CreateHospitalAmendmentInput[\s\S]*stockQuantity\?: number/);
  assert.match(service, /plannedStockQuantity: correctedPlan\.stockQuantity/);
  assert.match(service, /const lockedPlannedCatalog = getEffectivePlannedCatalog\(lockedRecord\)/);
  assert.match(service, /stockQuantity: dto\.stockQuantity \?\? decimalToOptionalNumber\(lockedPlannedCatalog\.stockQuantity\)/);
  assert.match(service, /Проведённое списание нельзя переписать исправлением/);
  assert.match(card, /Исправить плановое списание и начисление/);
  assert.match(card, /Списать при выполнении/);
  assert.match(card, /Списание со склада и начисление произойдут только после отметки назначения «Выполнено»/);
  assert.match(sheet, /Исправлено: \{describePlannedPosting\(record\)\}/);
  assert.match(sheet, /getEffectivePlannedRecord/);
});

test('врач видит полный лист, назначения и выполнение и может печатать A4/PDF', async () => {
  const [service, card, sheet, print, help, styles] = await Promise.all([
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/HospitalSheet.tsx'),
    read('apps/web/src/features/hospital/hospitalPrint.ts'),
    read('apps/web/src/features/help/HelpPage.tsx'),
    read('apps/web/src/styles.css'),
  ]);

  assert.match(card, /Полный лист стационара/);
  assert.match(card, /Назначить план лечения/);
  assert.match(card, /Записать выполненное действие/);
  assert.match(card, /Требуется выполнить лечение/);
  assert.match(card, /Напоминание появится к указанному времени/);
  assert.match(card, /Отчёт владельцу \/ PDF/);
  assert.match(card, /Итоговый лист в истории пациента/);
  assert.match(service, /dto\.completedAt \? new Date\(dto\.completedAt\) : recordedAt/);
  assert.match(sheet, /Температура за всё пребывание/);
  assert.match(sheet, /Назначение выполнено/);
  assert.match(sheet, /hospital-complete-checkbox/);
  assert.match(sheet, /Указать результат/);
  assert.match(sheet, /Исправление/);
  assert.match(print, /@page \{ size: A4 portrait/);
  assert.match(print, /Отчёт о лечении в стационаре/);
  assert.match(print, /<th>Выполнено<\/th>/);
  assert.match(print, /recordStatus === 'COMPLETED'/);
  assert.match(print, /recordType !== 'TEMPERATURE'/);
  assert.match(print, /groupOwnerReportRecords/);
  assert.match(print, /class="date-column">Дата/);
  assert.match(print, /day\.products\.set\(productKey/);
  assert.match(print, /\(current\?\.quantity \?\? 0\) \+ productAmount\.quantity/);
  assert.match(print, /readProductAmount/);
  assert.match(print, /formatDecimalAmount/);
  assert.doesNotMatch(print, /Выполнено \$\{.*count.*\} раза/);
  assert.doesNotMatch(print, /Температура за всё пребывание|renderTemperatureChart/);
  assert.doesNotMatch(print, /Назначение \/ выполнение|Исполнитель|recordedBy|class="time"|Выполнено:.*formatTime/);
  assert.doesNotMatch(`${card}\n${sheet}\n${print}`, /Добавить факт|План \/ факт|Факт \/ результат|План выполнен/);
  assert.match(help, /Запись текущих суток можно изменить напрямую/);
  assert.match(styles, /\.hospital-sheet-day \{\s+min-width: 0;/);
  assert.match(styles, /\.hospital-full-sheet-panel \.list-panel-body \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.hospital-sheet-grid \{\s+grid-template-columns: 1fr;/);
});

test('в карте стационара текущий день показан выше прошедших дней', async () => {
  const sheet = await read('apps/web/src/features/hospital/HospitalSheet.tsx');
  const { compareHospitalDayKeys } = await import('../apps/web/src/features/hospital/hospitalDayOrder.ts');
  const today = '2026-08-07';
  const days = ['2026-07-29', '2026-08-08', '2026-08-06', today, '2026-08-10'];

  assert.match(sheet, /const todayKey = dateKey\(new Date\(\)\.toISOString\(\), timeZone\)/);
  assert.match(sheet, /\.sort\(\(\[leftKey\], \[rightKey\]\) => compareHospitalDayKeys\(leftKey, rightKey, todayKey\)\)/);
  assert.match(sheet, /const sortedGroup = \[\.\.\.group\]\.sort\(\(left, right\) => new Date\(left\.recordedAt\)\.getTime\(\) - new Date\(right\.recordedAt\)\.getTime\(\)\)/);
  assert.match(sheet, /records: sortedGroup/);
  assert.deepEqual(days.sort((left, right) => compareHospitalDayKeys(left, right, today)), [
    today,
    '2026-08-08',
    '2026-08-10',
    '2026-08-06',
    '2026-07-29',
  ]);
});

test('план лечения создаёт несколько действий, повторов и складских списаний без перезаписи старых записей', async () => {
  const [schema, migration, catalogMigration, controller, service, dto, modal, sheet, api, types] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260804000100_hospital_treatment_plans/migration.sql'),
    read('prisma/migrations/20260804000200_hospital_planned_catalog_items/migration.sql'),
    read('apps/api/src/modules/hospital/hospital.controller.ts'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
    read('apps/api/src/modules/hospital/dto/create-hospital-treatment-plan.dto.ts'),
    read('apps/web/src/features/hospital/HospitalTreatmentPlanModal.tsx'),
    read('apps/web/src/features/hospital/HospitalSheet.tsx'),
    read('apps/web/src/features/hospital/hospital.api.ts'),
    read('apps/web/src/features/hospital/types.ts'),
  ]);

  assert.match(schema, /model HospitalTreatmentPlan/);
  assert.match(schema, /treatmentPlanItemId\s+String\?/);
  assert.match(schema, /plannedProductId\s+String\?/);
  assert.match(schema, /plannedStockQuantity\s+Decimal\?/);
  assert.match(migration, /ADD COLUMN "treatmentPlanId" TEXT/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE\s+FROM|TRUNCATE|UPDATE\s+"HospitalRecord")\b/i);
  assert.match(catalogMigration, /ADD COLUMN "plannedProductId" TEXT/);
  assert.match(catalogMigration, /ADD COLUMN "plannedStockQuantity" DECIMAL\(12,3\)/);
  assert.doesNotMatch(catalogMigration, /^\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b|UPDATE\s+)/im);
  assert.match(controller, /:stayId\/treatment-plans/);
  assert.match(dto, /scheduledAt!:\s*string\[\]/);
  assert.match(dto, /ArrayMaxSize\(60\)/);
  assert.match(dto, /productId\?: string/);
  assert.match(dto, /stockQuantity\?: number/);
  assert.match(service, /hospitalTreatmentPlan\.create/);
  assert.match(service, /hospital\.treatment_plan\.create/);
  assert.match(service, /recordCount > 200/);
  assert.match(service, /plannedStockQuantity: line\?\.stockQuantity/);
  assert.match(service, /SELECT "id" FROM "HospitalRecord" WHERE "id" = \$\{existing\.id\} FOR UPDATE/);
  assert.match(service, /writeOffHospitalProduct\(tx, stay\.sourceVisitId, billItem\.id, postedLine, warehouseScope\)/);
  assert.match(service, /lockedRecord\.recordStatus === HospitalRecordStatus\.COMPLETED && lockedRecord\.billItemId/);
  assert.match(modal, /Добавить препарат, процедуру или другое действие/);
  assert.match(modal, /Добавить точную дату/);
  assert.match(modal, /Сформировать даты/);
  assert.match(modal, /Списать при каждом выполнении/);
  assert.match(modal, /Списание и начисление произойдут только после отметки «Выполнено»/);
  assert.match(modal, /Каждое появится в листе стационара в своё время/);
  assert.match(sheet, /План: \{record\.treatmentPlan\.title\}/);
  assert.match(sheet, /При выполнении списать/);
  assert.match(api, /createHospitalTreatmentPlan/);
  assert.match(types, /CreateHospitalTreatmentPlanInput/);
  assert.match(types, /plannedProductId: string \| null/);
});
