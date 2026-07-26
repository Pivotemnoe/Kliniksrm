import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);

async function runPreflight(owners, patients) {
  const root = await mkdtemp(join(tmpdir(), 'temichevvet-vetaf-preflight-'));
  const outputDir = join(root, 'output');
  await mkdir(outputDir);
  const ownersPath = join(root, 'owners.json');
  const patientsPath = join(root, 'patients.json');
  await writeFile(ownersPath, JSON.stringify(owners));
  await writeFile(patientsPath, JSON.stringify({
    generated_at: '2026-07-26T09:00:00.000Z',
    patients,
  }));
  try {
    const result = await execFileAsync('node', [
      'scripts/prepare-vetaf-import.mjs',
      '--owners', ownersPath,
      '--patients', patientsPath,
      '--output-dir', outputDir,
    ], { cwd: projectRoot });
    return { root, outputDir, result };
  } catch (error) {
    error.root = root;
    error.outputDir = outputDir;
    throw error;
  }
}

const owner = {
  source_row: 2,
  vetaf_export_number: '10',
  name: 'Иванов Иван',
  normalized_name: 'иванов иван',
  primary_phone: '+7 900 000-00-00',
  additional_phone: '+7 900 000-00-01',
  email: 'owner@example.test',
  address: 'Тестовый адрес',
};

test('автономная подготовка создаёт Windows-совместимый dry-run без доступа к БД', async () => {
  const patients = [
    {
      patient_id: '501', name: 'Барсик', species: 'Кошка', status: 'Здоров',
      last_visit_display: '25 июля 2026', source_url: 'https://example.test/patients/501',
      owner_source_row: 2, owner_vetaf_export_number: '10', owner_match_status: 'resolved',
    },
    {
      patient_id: '502', name: 'Барсик', species: 'Кошка', status: 'Обследование',
      last_visit_display: '10:30, вчера', source_url: 'https://example.test/patients/502',
      owner_source_row: 2, owner_vetaf_export_number: '10', owner_match_status: 'resolved',
    },
  ];
  const prepared = await runPreflight([owner], patients);
  try {
    const report = JSON.parse(await readFile(join(prepared.outputDir, 'dry-run-report.json'), 'utf8'));
    const csv = await readFile(join(prepared.outputDir, 'clients-import.csv'));
    assert.equal(report.status, 'READY_FOR_CRM_PREVIEW_ONLY');
    assert.equal(report.databaseWrites, 0);
    assert.equal(report.counts.owners, 1);
    assert.equal(report.counts.patients, 2);
    assert.equal(report.counts.sameOwnerSameNicknameGroups, 1);
    assert.equal(report.counts.lastVisitPrecision.exact_date, 1);
    assert.equal(report.counts.lastVisitPrecision.date_inferred_from_export, 1);
    assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.match(csv.toString('utf8'), /\r\n/);
    assert.match(csv.toString('utf8'), /"id владельца";"id пациента"/);
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
});

test('повтор основного телефона у разных владельцев блокирует готовность комплекта', async () => {
  const root = await mkdtemp(join(tmpdir(), 'temichevvet-vetaf-collision-'));
  const outputDir = join(root, 'output');
  await mkdir(outputDir);
  const ownersPath = join(root, 'owners.json');
  const patientsPath = join(root, 'patients.json');
  await writeFile(ownersPath, JSON.stringify([
    owner,
    { ...owner, source_row: 3, vetaf_export_number: '11', name: 'Петров Пётр' },
  ]));
  await writeFile(patientsPath, JSON.stringify({ generated_at: '2026-07-26T09:00:00.000Z', patients: [] }));
  try {
    await assert.rejects(
      execFileAsync('node', [
        'scripts/prepare-vetaf-import.mjs', '--owners', ownersPath, '--patients', patientsPath, '--output-dir', outputDir,
      ], { cwd: projectRoot }),
      (error) => error.code === 2,
    );
    const report = JSON.parse(await readFile(join(outputDir, 'dry-run-report.json'), 'utf8'));
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.blockingIssues[0].code, 'owners_share_primary_phone');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('код подготовки не подключается к Prisma, Docker или сети', async () => {
  const source = await readFile(new URL('../scripts/prepare-vetaf-import.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /PrismaClient|DATABASE_URL|docker|fetch\(|https\.request|http\.request/);
});

test('стабильный ID пациента не даёт объединить двух животных с одинаковой кличкой', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  let createdData;
  const tx = {
    dataTransferEntityLink: {
      findMany: async ({ where }) => {
        if (where.sourceEntityId === 'patient:2') return [];
        if (where.sourceEntityId?.not === 'patient:2') return [{ targetEntityId: 'animal-existing' }];
        return [];
      },
      create: async () => ({ id: 'link-new' }),
    },
    animal: {
      findMany: async () => [{ id: 'animal-existing', ownerId: 'owner-1', nickname: 'Барсик' }],
      findUnique: async () => null,
      create: async ({ data }) => {
        createdData = data;
        return { id: 'animal-new', ...data };
      },
    },
  };
  const service = new DataTransferService({}, { log: async () => undefined });
  const result = await service.resolveAnimal(tx, 'batch-1', 'row-2', 'owner-1', {
    source_id: 'patient-row:2',
    animal_source_id: 'patient:2',
    animal_name: 'Барсик',
    species: 'Кошка',
    animal_status: 'Обследование',
  });
  assert.equal(result.animal.id, 'animal-new');
  assert.equal(result.created, 1);
  assert.equal(createdData.status, 'Обследование');
});
