import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('черновик документа можно удалить, а сформированный документ защищён', async () => {
  const [controller, service, api, ui] = await Promise.all([
    read('apps/api/src/modules/documents/documents.controller.ts'),
    read('apps/api/src/modules/documents/documents.service.ts'),
    read('apps/web/src/features/documents/documents.api.ts'),
    read('apps/web/src/features/visits/VisitDocumentsTab.tsx'),
  ]);

  assert.match(controller, /@Delete\('visits\/:visitId\/documents\/:documentId'\)/);
  assert.match(service, /document\.status !== DocumentStatus\.DRAFT/);
  assert.match(service, /document\.status !== DocumentStatus\.CANCELLED/);
  assert.match(service, /document\.generatedDocument/);
  assert.match(service, /action: 'visit_document\.delete'/);
  assert.match(api, /method: 'DELETE'/);
  assert.match(ui, /Удалить документ\?/);
  assert.match(ui, /canDeleteVisitDocument/);
});

test('предпросмотр документов подставляет данные вместо служебных переменных', async () => {
  const [templates, visitDocuments] = await Promise.all([
    read('apps/web/src/features/documents/DocumentTemplatesPage.tsx'),
    read('apps/web/src/features/visits/VisitDocumentsTab.tsx'),
  ]);

  assert.match(templates, /renderDocumentPreview\(previewBody/);
  assert.match(templates, /'owner\.fullName': 'Иванова Анна Сергеевна'/);
  assert.match(templates, /Предпросмотр на примере/);
  assert.match(visitDocuments, /renderVisitDocumentPreview\(previewBody/);
  assert.match(visitDocuments, /'owner\.fullName': visit\.owner\.fullName/);
  assert.match(visitDocuments, /Предпросмотр с данными приёма/);
});

test('редактор шаблона вставляет поля в позицию курсора и предлагает готовые разделы', async () => {
  const [templates, palette, editor] = await Promise.all([
    read('apps/web/src/features/documents/DocumentTemplatesPage.tsx'),
    read('apps/web/src/features/documents/DocumentVariablePalette.tsx'),
    read('apps/web/src/features/documents/documentTemplateEditor.ts'),
  ]);

  assert.match(templates, /bodySelectionRef/);
  assert.match(templates, /setSelectionRange\(result\.cursor, result\.cursor\)/);
  assert.match(templates, /onBlur=\{\(event\) => \{/);
  assert.match(templates, /onKeyUp=\{\(event\) => \{/);
  assert.match(templates, /onInsertBlock=\{insertBlock\}/);
  assert.match(templates, /Поставьте курсор в нужное место/);
  assert.match(palette, /Вставить блок/);
  assert.match(palette, /КЛИНИКА[\s\S]*Адрес: \{clinic\.address\}/);
  assert.match(palette, /ВЛАДЕЛЕЦ[\s\S]*ФИО: \{owner\.fullName\}/);
  assert.match(palette, /ПАЦИЕНТ[\s\S]*Кличка: \{animal\.nickname\}/);
  assert.match(editor, /body\.slice\(0, start\)/);
  assert.match(editor, /body\.slice\(end\)/);
});

test('Документы 2.0 добавляют версии, неизменяемый снимок и журнал без удаления старых данных', async () => {
  const [schema, migration, service] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260804000300_documents_2_foundation/migration.sql'),
    read('apps/api/src/modules/documents/documents.service.ts'),
  ]);

  assert.match(schema, /model DocumentTemplateVersion/);
  assert.match(schema, /model DocumentEvent/);
  assert.match(schema, /contentSha256\s+String\?/);
  assert.match(schema, /pdfSha256\s+String\?/);
  assert.match(schema, /snapshot\s+Json\?/);
  assert.match(migration, /INSERT INTO "DocumentTemplateVersion"/);
  assert.match(migration, /LEFT JOIN "DocumentTemplateCategory"/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
  assert.match(service, /currentVersion: \{ increment: 1 \}/);
  assert.match(service, /createHash\('sha256'\)/);
  assert.match(service, /Сформированный документ нельзя переписывать/);
  assert.match(service, /DocumentEventType\.SIGNED/);
});

test('сформированный PDF сохраняется с SHA-256, открывается из архива и печатается по точной версии', async () => {
  const [controller, service, pdfService, api, ui, portal] = await Promise.all([
    read('apps/api/src/modules/documents/documents.controller.ts'),
    read('apps/api/src/modules/documents/documents.service.ts'),
    read('apps/api/src/modules/documents/document-pdf.service.ts'),
    read('apps/web/src/features/documents/documents.api.ts'),
    read('apps/web/src/features/visits/VisitDocumentsTab.tsx'),
    read('apps/api/src/modules/client-portal/client-portal.service.ts'),
  ]);

  assert.match(controller, /@Get\('visits\/:visitId\/documents\/:documentId\/pdf'\)/);
  assert.match(service, /pdfSha256 = createHash\('sha256'\)/);
  assert.match(service, /storage\.putObject\(storageKey, pdf, 'application\/pdf'\)/);
  assert.match(service, /DocumentEventType\.PRINTED/);
  assert.match(pdfService, /Roboto-Regular\.ttf/);
  assert.match(pdfService, /Страница \$\{index \+ 1\} из \$\{pages\.count\}/);
  assert.match(api, /downloadVisitDocumentPdf/);
  assert.match(ui, /downloadVisitDocumentPdf\(visit\.id, document\.id\)/);
  assert.match(portal, /getGeneratedDocumentText\(generatedDocument\?\.snapshot\)/);
});

test('врач видит прямой путь от черновика к сформированному и подписанному документу', async () => {
  const ui = await read('apps/web/src/features/visits/VisitDocumentsTab.tsx');

  assert.match(ui, /Сохранить черновик/);
  assert.match(ui, /Сформировать/);
  assert.match(ui, /Подписать/);
  assert.match(ui, /Печать PDF/);
  assert.match(ui, /Сначала сформируйте документ/);
  assert.match(ui, /record\.generatedDocument && record\.status !== 'CANCELLED'/);
  assert.doesNotMatch(ui, /name="status"/);
  assert.doesNotMatch(ui, /temichevvet-logo\.jpg/);
});

test('печатная форма документа не выводит телефон владельца, а русские имена файлов восстанавливаются', async () => {
  const [pdfService, documentsService, filesService] = await Promise.all([
    read('apps/api/src/modules/documents/document-pdf.service.ts'),
    read('apps/api/src/modules/documents/documents.service.ts'),
    read('apps/api/src/modules/files/files.service.ts'),
  ]);

  assert.doesNotMatch(pdfService, /ownerPhone|['"]Телефон['"]/);
  assert.doesNotMatch(documentsService, /ownerPhone:/);
  assert.match(documentsService, /schemaVersion: 2/);
  assert.match(filesService, /decodeMojibakeFileName/);
  assert.match(filesService, /Buffer\.from\(value, 'latin1'\)\.toString\('utf8'\)/);
  assert.match(filesService, /normalizedOriginalName\(file\.originalName\)/);
});

test('отправка сформированного документа связана с журналом доставки', async () => {
  const [dto, notifications, ui] = await Promise.all([
    read('apps/api/src/modules/notifications/dto/create-notification.dto.ts'),
    read('apps/api/src/modules/notifications/notifications.service.ts'),
    read('apps/web/src/features/visits/VisitDocumentsTab.tsx'),
  ]);

  assert.match(dto, /visitDocumentId\?: string \| null/);
  assert.match(notifications, /DocumentEventType\.DELIVERY_QUEUED/);
  assert.match(notifications, /Отправить можно только сформированный или подписанный документ/);
  assert.match(ui, /visitDocumentId: document\.id/);
  assert.match(ui, /История документа/);
  assert.match(ui, /Сформированная версия защищена от изменений/);
});

test('файл загружается прямо в общий архив пациента без фиктивного приёма', async () => {
  const [schema, controller, service, ui] = await Promise.all([
    read('prisma/schema.prisma'),
    read('apps/api/src/modules/files/files.controller.ts'),
    read('apps/api/src/modules/files/files.service.ts'),
    read('apps/web/src/features/animals/AnimalCardPage.tsx'),
  ]);

  assert.match(schema, /animalId\s+String\?/);
  assert.match(controller, /@Post\('animals\/:animalId'\)/);
  assert.match(service, /OR: \[\{ animalId \}, \{ visit: \{ animalId \} \}\]/);
  assert.match(service, /kind: 'animal'/);
  assert.match(ui, /label: 'Архив документов'/);
  assert.match(ui, /uploadAnimalFile\(animal\.id, file\)/);
});

test('переносной комплект добавляет данные только отдельным ручным импортом', async () => {
  const portable = await read('scripts/create-portable-flash.sh');

  assert.match(portable, /--include-transfer-data PATH/);
  assert.match(portable, /Проверить файл без записи/);
  assert.match(portable, /Автоматическая запись в БД отключена/);
  assert.match(portable, /rm -f "\$directory"\/\._\*/);
  assert.doesNotMatch(portable, /prisma[^\n]+clients-import\.csv/i);
});
