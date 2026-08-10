import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('миграция редактора, архива и помощника только расширяет рабочую схему', async () => {
  const [migration, schema] = await Promise.all([
    read('prisma/migrations/20260810000100_document_editor_archive_assistant/migration.sql'),
    read('prisma/schema.prisma'),
  ]);

  assert.match(migration, /ADD COLUMN "layout" JSONB/);
  assert.match(migration, /ADD COLUMN "archiveCategory" TEXT/);
  assert.match(migration, /ADD COLUMN "medicalPhraseAssistantEnabled" BOOLEAN NOT NULL DEFAULT true/);
  assert.match(migration, /SET "isAccepted" = true/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
  assert.match(schema, /model VisitDocument[\s\S]*layout\s+Json\?/);
  assert.match(schema, /model FileObject[\s\S]*archiveCategory\s+String\?/);
  assert.match(schema, /model MedicalPhrase[\s\S]*isAccepted\s+Boolean/);
});

test('визуальный A4 сохраняется в версии, снимке, PDF и экспортируется в DOCX', async () => {
  const [layout, dto, service, pdf, visual, docx, templates] = await Promise.all([
    read('apps/api/src/modules/documents/document-layout.ts'),
    read('apps/api/src/modules/documents/dto/create-document-template.dto.ts'),
    read('apps/api/src/modules/documents/documents.service.ts'),
    read('apps/api/src/modules/documents/document-pdf.service.ts'),
    read('apps/web/src/features/documents/DocumentVisualEditor.tsx'),
    read('apps/web/src/features/documents/documentDocx.ts'),
    read('apps/web/src/features/documents/DocumentTemplatesPage.tsx'),
  ]);

  assert.match(layout, /rawBlocks\.length > 80/);
  assert.match(layout, /type: 'table'/);
  assert.match(layout, /type: 'pageBreak'/);
  assert.match(dto, /layout\?: Record<string, unknown>/);
  assert.match(service, /schemaVersion: 3/);
  assert.match(service, /renderDocumentLayout/);
  assert.match(service, /layout: true/);
  assert.match(pdf, /drawStructuredDocument/);
  assert.match(pdf, /drawTable/);
  assert.match(pdf, /document\.addPage\(\)/);
  assert.match(visual, /Предпросмотр A4/);
  assert.match(visual, /Готовая клиническая форма/);
  assert.match(docx, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(docx, /w:type="page"/);
  assert.match(templates, /exportDocumentDocx/);
});

test('архив пациента поддерживает пакет, категории, поиск, дубли, аудит и неизменяемый PDF', async () => {
  const [controller, service, archive, api] = await Promise.all([
    read('apps/api/src/modules/files/files.controller.ts'),
    read('apps/api/src/modules/files/files.service.ts'),
    read('apps/web/src/features/files/PatientDocumentArchive.tsx'),
    read('apps/web/src/features/files/files.api.ts'),
  ]);

  assert.match(controller, /FilesInterceptor\('files', 20/);
  assert.match(controller, /@Patch\(':fileId\/archive'\)/);
  assert.match(service, /checksumSha256,[\s\S]*OR: \[\{ animalId \}, \{ visit: \{ animalId \} \}\]/);
  assert.match(service, /action: 'file\.batch_upload'/);
  assert.match(service, /action: 'file\.download'/);
  assert.match(service, /action: 'file\.archive_metadata_update'/);
  assert.match(service, /Сформированный PDF является неизменяемой медицинской записью/);
  assert.match(archive, /История лечения/);
  assert.match(archive, /Дата документа/);
  assert.match(archive, /Источник/);
  assert.match(archive, /Загружено: \$\{result\.uploaded\.length\}/);
  assert.match(api, /uploadAnimalFilesBatch/);
  assert.match(api, /updateAnimalArchiveMetadata/);
});

test('личный помощник предлагает после двух повторов и оставляет врачу все решения', async () => {
  const [schema, controller, service, editor] = await Promise.all([
    read('prisma/schema.prisma'),
    read('apps/api/src/modules/medical-phrases/medical-phrases.controller.ts'),
    read('apps/api/src/modules/medical-phrases/medical-phrases.service.ts'),
    read('apps/web/src/features/visits/MedicalTextArea.tsx'),
  ]);

  assert.match(schema, /medicalPhraseAssistantEnabled\s+Boolean\s+@default\(true\)/);
  assert.match(controller, /@Patch\('personal\/settings'\)/);
  assert.match(controller, /@Patch\('personal\/:phraseId'\)/);
  assert.match(service, /usageCount: \{ gte: 2 \}/);
  assert.match(service, /action === 'ACCEPT'/);
  assert.match(service, /action === 'REJECT'/);
  assert.match(service, /action === 'PIN'/);
  assert.match(service, /medicalPhrase\.assistantSettings/);
  assert.match(service, /medicalPhrase\.usage/);
  const removePersonalSection = service.match(/async removePersonal[\s\S]*?\n  async listForManagement/)?.[0] ?? '';
  assert.match(removePersonalSection, /isActive: false[\s\S]*dismissedAt: new Date\(\)/);
  assert.doesNotMatch(removePersonalSection, /medicalPhrase\.delete/);
  assert.match(editor, /Решение всегда принимает врач/);
  assert.match(editor, /Сохранить текущий текст как личную фразу/);
  assert.match(editor, /Больше не предлагать эту фразу/);
  assert.match(editor, /Личный помощник выключен/);
  assert.doesNotMatch(editor, /автоматически поставить диагноз/i);
});
