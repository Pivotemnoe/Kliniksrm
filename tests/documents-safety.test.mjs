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

test('переносной комплект добавляет данные только отдельным ручным импортом', async () => {
  const portable = await read('scripts/create-portable-flash.sh');

  assert.match(portable, /--include-transfer-data PATH/);
  assert.match(portable, /Проверить файл без записи/);
  assert.match(portable, /Автоматическая запись в БД отключена/);
  assert.match(portable, /rm -f "\$directory"\/\._\*/);
  assert.doesNotMatch(portable, /prisma[^\n]+clients-import\.csv/i);
});
