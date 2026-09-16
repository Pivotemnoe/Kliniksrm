import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const load = (path) => require(`../apps/api/dist/modules/${path}.js`);

test('diagnosis title and description are free text; type and status use their own enums', async () => {
  for (const [file, name] of [['create', 'Create'], ['update', 'Update']]) {
    const Dto = load(`visits/dto/${file}-visit-diagnosis.dto`)[`${name}VisitDiagnosisDto`];
    assert.equal((await validate(plainToInstance(Dto, { title: 'Гастрит', description: 'Описание осмотра', diagnosisType: 'Клинический', status: 'На лечении' }))).length, 0);
    const errors = await validate(plainToInstance(Dto, { title: 'Гастрит', diagnosisType: 'На лечении', status: 'Клинический' }));
    assert.deepEqual(errors.map(e => e.property).sort(), ['diagnosisType', 'status']);
  }
});

test('patient and owner filters apply before search ranking and pagination', async () => {
  for (const search of [undefined, 'Бар']) {
    const calls = [];
    const model = { findMany: async (q) => { calls.push(q); return []; }, count: async () => 0 };
    const prisma = { animal: model, owner: model, $transaction: (ops) => Promise.all(ops) };
    await new (load('animals/animals.service').AnimalsService)(prisma).listAnimals({ search, species: 'Собака', sex: 'MALE', isFavorite: 'true', ownerId: 'owner' });
    assert.equal(calls[0].where.sex, 'MALE');
    assert.equal(calls[0].where.species.equals, 'Собака');
    assert.equal(calls[0].where.ownerId, 'owner');
    assert.equal(calls[0].where.isFavorite, true);
    calls.length = 0;
    await new (load('owners/owners.service').OwnersService)(prisma).listOwners({ search, hasAnimals: 'false', hasVisits: 'true' });
    assert.deepEqual(calls[0].where.animals, { none: { archivedAt: null } });
    assert.deepEqual(calls[0].where.visits, { some: { status: { not: 'CANCELLED' } } });
  }
});

test('draft PDF opens without saving, signing, or changing the visit', async () => {
  const { DocumentsService } = load('documents/documents.service');
  let snapshot;
  const prisma = {
    visitDocument: {
      findFirst: async () => ({ id: 'doc', status: 'DRAFT', generatedDocument: null }),
      findFirstOrThrow: async () => ({ title: 'Анализ', body: 'Результат', layout: null, visit: { startedAt: new Date(), owner: { fullName: 'Тест' }, animal: { nickname: 'Пациент' } } }),
    },
    organization: { findFirst: async () => ({ displayName: 'Клиника' }) },
  };
  const service = new DocumentsService(prisma, { log: async () => {} }, { render: async s => { snapshot = s; return Buffer.from('pdf'); } });
  const result = await service.openGeneratedPdf('visit', 'doc', 'actor');
  assert.match(snapshot.title, /черновик/);
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'pdf');
  prisma.visitDocument.findFirst = async () => ({ id: 'doc', status: 'SIGNED', generatedDocument: null });
  await assert.rejects(() => service.openGeneratedPdf('visit', 'doc', 'actor'), /восстановление/);
});

test('PDF renderer respects A4/A5 and both orientations', async () => {
  const { DocumentPdfService } = load('documents/document-pdf.service');
  const { defaultDocumentLayoutPage } = load('documents/document-layout');
  for (const [size, short, long] of [['A4', 595.28, 841.89], ['A5', 419.53, 595.28]]) {
    for (const orientation of ['portrait', 'landscape']) {
      const pdf = await new DocumentPdfService().render({ title: 'Тест', clinicName: 'Клиника', body: '', layout: { schemaVersion: 1, page: { ...defaultDocumentLayoutPage, size, orientation, showClinicHeader: false, showVisitMeta: false, showSignatures: false }, blocks: [{ id: 't', type: 'table', headerRows: 1, rows: [['Показатель', 'Значение'], ['Тест', '1,2']] }] } });
      const dimensions = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'));
      assert.ok(dimensions);
      assert.equal(Number(dimensions[1]), orientation === 'portrait' ? short : long);
      assert.equal(Number(dimensions[2]), orientation === 'portrait' ? long : short);
    }
  }
});
