#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const FORMAT_VERSION = 'temichevvet-vetaf-preflight-v1';

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Неизвестный аргумент: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Не указано значение для --${key}`);
    result[key] = value;
    index += 1;
  }
  for (const key of ['owners', 'patients', 'output-dir']) {
    if (!result[key]) throw new Error(`Обязательный параметр: --${key}`);
  }
  return result;
}

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeName(value) {
  return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

function normalizePhone(value) {
  let digits = clean(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length === 11 && digits.startsWith('7') ? digits : '';
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function groupDuplicates(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function csvCell(value) {
  return `"${clean(value).replace(/"/g, '""')}"`;
}

function toWindowsCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

const months = new Map([
  ['января', 1], ['февраля', 2], ['марта', 3], ['апреля', 4], ['мая', 5], ['июня', 6],
  ['июля', 7], ['августа', 8], ['сентября', 9], ['октября', 10], ['ноября', 11], ['декабря', 12],
]);

function validIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function classifyLastVisit(value, capturedAt) {
  const display = clean(value);
  if (!display || display === '—') return { isoDate: '', precision: 'missing' };
  const captured = new Date(capturedAt);
  const capturedIsValid = !Number.isNaN(captured.getTime());
  const explicit = display.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/i);
  if (explicit) {
    const month = months.get(explicit[2].toLocaleLowerCase('ru-RU'));
    const isoDate = month ? validIsoDate(Number(explicit[3]), month, Number(explicit[1])) : '';
    return { isoDate, precision: isoDate ? 'exact_date' : 'unrecognized' };
  }
  const currentYear = display.match(/^(\d{1,2}):(\d{2}),\s*(\d{1,2})\s+([а-яё]+)$/i);
  if (currentYear && capturedIsValid) {
    const month = months.get(currentYear[4].toLocaleLowerCase('ru-RU'));
    const isoDate = month ? validIsoDate(captured.getUTCFullYear(), month, Number(currentYear[3])) : '';
    return { isoDate, precision: isoDate ? 'year_inferred_from_export' : 'unrecognized' };
  }
  const relative = display.match(/^(\d{1,2}):(\d{2}),\s*(сегодня|вчера)$/i);
  if (relative && capturedIsValid) {
    const date = new Date(Date.UTC(captured.getUTCFullYear(), captured.getUTCMonth(), captured.getUTCDate()));
    if (relative[3].toLocaleLowerCase('ru-RU') === 'вчера') date.setUTCDate(date.getUTCDate() - 1);
    return { isoDate: date.toISOString().slice(0, 10), precision: 'date_inferred_from_export' };
  }
  return { isoDate: '', precision: 'unrecognized' };
}

async function writeProtected(path, content) {
  await writeFile(path, content, { encoding: typeof content === 'string' ? 'utf8' : undefined, mode: 0o600 });
  await chmod(path, 0o600);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const ownersPath = resolve(args.owners);
  const patientsPath = resolve(args.patients);
  const outputDir = resolve(args['output-dir']);
  const [ownersBuffer, patientsBuffer] = await Promise.all([readFile(ownersPath), readFile(patientsPath)]);
  const owners = JSON.parse(ownersBuffer.toString('utf8'));
  const patientDocument = JSON.parse(patientsBuffer.toString('utf8'));
  const patients = patientDocument.patients;
  if (!Array.isArray(owners)) throw new Error('Файл владельцев должен содержать JSON-массив');
  if (!Array.isArray(patients)) throw new Error('Файл пациентов не содержит массив patients');

  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await chmod(outputDir, 0o700);
  const existingFiles = await readdir(outputDir);
  if (existingFiles.length) throw new Error(`Папка результата не пуста: ${outputDir}`);

  const blockingIssues = [];
  const warnings = [];
  const ownerByRow = new Map();
  const ownerByExportNumber = new Map();
  for (const owner of owners) {
    const sourceRow = Number(owner.source_row);
    const exportNumber = clean(owner.vetaf_export_number);
    if (!Number.isInteger(sourceRow) || sourceRow < 1) blockingIssues.push({ code: 'invalid_owner_source_row' });
    if (!exportNumber) blockingIssues.push({ code: 'missing_owner_export_number', sourceRow });
    if (!clean(owner.name)) blockingIssues.push({ code: 'missing_owner_name', sourceRow });
    if (ownerByRow.has(sourceRow)) blockingIssues.push({ code: 'duplicate_owner_source_row', sourceRow });
    if (ownerByExportNumber.has(exportNumber)) blockingIssues.push({ code: 'duplicate_owner_export_number', sourceRow });
    ownerByRow.set(sourceRow, owner);
    ownerByExportNumber.set(exportNumber, owner);
  }

  const phoneCollisionGroups = groupDuplicates(owners, (owner) => normalizePhone(owner.primary_phone));
  if (phoneCollisionGroups.length) {
    blockingIssues.push({
      code: 'owners_share_primary_phone',
      groups: phoneCollisionGroups.length,
      rows: phoneCollisionGroups.reduce((sum, group) => sum + group.length, 0),
    });
  }
  const nameCollisionGroups = groupDuplicates(owners, (owner) => normalizeName(owner.name));
  if (nameCollisionGroups.length) {
    warnings.push({
      code: 'owners_share_normalized_name',
      groups: nameCollisionGroups.length,
      rows: nameCollisionGroups.reduce((sum, group) => sum + group.length, 0),
      handling: 'Различаются стабильными ID владельцев и не объединяются только по ФИО',
    });
  }

  const patientIds = new Set();
  const referencedOwnerRows = new Set();
  let missingLastVisit = 0;
  let unrecognizedLastVisit = 0;
  const lastVisitPrecisions = new Map();
  for (const patient of patients) {
    const patientId = clean(patient.patient_id);
    const ownerSourceRow = Number(patient.owner_source_row);
    if (!patientId) blockingIssues.push({ code: 'missing_patient_id' });
    if (patientIds.has(patientId)) blockingIssues.push({ code: 'duplicate_patient_id', patientId });
    patientIds.add(patientId);
    if (!clean(patient.name)) blockingIssues.push({ code: 'missing_patient_name', patientId });
    if (!clean(patient.species)) blockingIssues.push({ code: 'missing_patient_species', patientId });
    if (!clean(patient.status)) blockingIssues.push({ code: 'missing_patient_status', patientId });
    const owner = ownerByRow.get(ownerSourceRow);
    if (!owner) {
      blockingIssues.push({ code: 'unknown_owner_source_row', patientId, ownerSourceRow });
      continue;
    }
    if (clean(patient.owner_vetaf_export_number) !== clean(owner.vetaf_export_number)) {
      blockingIssues.push({ code: 'owner_export_number_mismatch', patientId, ownerSourceRow });
    }
    if (patient.owner_match_status !== 'resolved') blockingIssues.push({ code: 'owner_link_not_resolved', patientId });
    referencedOwnerRows.add(ownerSourceRow);
    const lastVisit = classifyLastVisit(patient.last_visit_display, patientDocument.generated_at);
    lastVisitPrecisions.set(lastVisit.precision, (lastVisitPrecisions.get(lastVisit.precision) ?? 0) + 1);
    if (lastVisit.precision === 'missing') missingLastVisit += 1;
    if (lastVisit.precision === 'unrecognized') unrecognizedLastVisit += 1;
  }

  const sameOwnerNicknameGroups = groupDuplicates(
    patients,
    (patient) => `${patient.owner_source_row}\u001f${normalizeName(patient.name)}`,
  );
  if (sameOwnerNicknameGroups.length) {
    warnings.push({
      code: 'same_owner_same_patient_nickname',
      groups: sameOwnerNicknameGroups.length,
      rows: sameOwnerNicknameGroups.reduce((sum, group) => sum + group.length, 0),
      handling: 'Различаются стабильными ID пациентов и не объединяются только по кличке',
    });
  }
  if (missingLastVisit) warnings.push({ code: 'missing_last_visit', rows: missingLastVisit });
  if (unrecognizedLastVisit) warnings.push({ code: 'unrecognized_last_visit', rows: unrecognizedLastVisit });

  const ownerHeaders = ['owner_source_id', 'owner_export_number', 'owner_name', 'phone', 'extra_phone', 'email', 'address'];
  const ownerRows = owners.map((owner) => [
    `owner:${clean(owner.vetaf_export_number)}`,
    clean(owner.vetaf_export_number),
    clean(owner.name),
    clean(owner.primary_phone),
    clean(owner.additional_phone),
    clean(owner.email),
    clean(owner.address),
  ]);
  const animalHeaders = [
    'animal_source_id', 'patient_id', 'owner_source_id', 'owner_export_number', 'animal_name', 'species',
    'animal_status', 'last_visit_display', 'last_visit_iso', 'last_visit_precision', 'source_url',
  ];
  const animalRows = patients.map((patient) => {
    const lastVisit = classifyLastVisit(patient.last_visit_display, patientDocument.generated_at);
    return [
      `patient:${clean(patient.patient_id)}`,
      clean(patient.patient_id),
      `owner:${clean(patient.owner_vetaf_export_number)}`,
      clean(patient.owner_vetaf_export_number),
      clean(patient.name),
      clean(patient.species),
      clean(patient.status),
      clean(patient.last_visit_display),
      lastVisit.isoDate,
      lastVisit.precision,
      clean(patient.source_url),
    ];
  });
  const clientsHeaders = [
    'id', 'id владельца', 'id пациента', 'владелец', 'телефон', 'дополнительный телефон',
    'email', 'адрес', 'кличка', 'вид', 'статус пациента',
  ];
  const clientsRows = patients.map((patient) => {
    const owner = ownerByRow.get(Number(patient.owner_source_row));
    return [
      `patient-row:${clean(patient.patient_id)}`,
      `owner:${clean(owner?.vetaf_export_number)}`,
      `patient:${clean(patient.patient_id)}`,
      clean(owner?.name),
      clean(owner?.primary_phone),
      clean(owner?.additional_phone),
      clean(owner?.email),
      clean(owner?.address),
      clean(patient.name),
      clean(patient.species),
      clean(patient.status),
    ];
  });
  for (const owner of owners) {
    if (referencedOwnerRows.has(Number(owner.source_row))) continue;
    clientsRows.push([
      `owner-row:${clean(owner.vetaf_export_number)}`,
      `owner:${clean(owner.vetaf_export_number)}`,
      '',
      clean(owner.name),
      clean(owner.primary_phone),
      clean(owner.additional_phone),
      clean(owner.email),
      clean(owner.address),
      '', '', '',
    ]);
  }
  const visitHeaders = ['animal_source_id', 'owner_source_id', 'last_visit_display', 'last_visit_iso', 'precision', 'import_allowed'];
  const visitRows = patients.map((patient) => {
    const lastVisit = classifyLastVisit(patient.last_visit_display, patientDocument.generated_at);
    return [
      `patient:${clean(patient.patient_id)}`,
      `owner:${clean(patient.owner_vetaf_export_number)}`,
      clean(patient.last_visit_display),
      lastVisit.isoDate,
      lastVisit.precision,
      'НЕТ — только справочная дата, медицинский приём не создавать',
    ];
  });

  const files = {
    'owners.csv': toWindowsCsv(ownerHeaders, ownerRows),
    'animals.csv': toWindowsCsv(animalHeaders, animalRows),
    'clients-import.csv': toWindowsCsv(clientsHeaders, clientsRows),
    'visits-summary-reference-only.csv': toWindowsCsv(visitHeaders, visitRows),
  };
  const outputChecksums = {};
  for (const [fileName, content] of Object.entries(files)) {
    await writeProtected(join(outputDir, fileName), content);
    outputChecksums[fileName] = sha256(Buffer.from(content, 'utf8'));
  }

  const report = {
    format: FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    sourceCapturedAt: patientDocument.generated_at ?? null,
    status: blockingIssues.length ? 'BLOCKED' : 'READY_FOR_CRM_PREVIEW_ONLY',
    databaseWrites: 0,
    counts: {
      owners: owners.length,
      patients: patients.length,
      resolvedPatientOwnerLinks: patients.length - blockingIssues.filter((issue) => issue.code === 'owner_link_not_resolved').length,
      referencedOwners: referencedOwnerRows.size,
      ownersWithoutPatients: owners.length - referencedOwnerRows.size,
      clientsImportRows: clientsRows.length,
      ownerNameCollisionGroups: nameCollisionGroups.length,
      sameOwnerSameNicknameGroups: sameOwnerNicknameGroups.length,
      missingLastVisit,
      unrecognizedLastVisit,
      lastVisitPrecision: Object.fromEntries([...lastVisitPrecisions.entries()].sort(([left], [right]) => left.localeCompare(right))),
    },
    blockingIssues,
    warnings,
    policy: {
      clientsImport: 'Файл подготовлен только для кнопки «Проверить файл без записи»; перенос в БД требует отдельного подтверждения',
      visitsSummary: 'Справочный файл нельзя загружать как историю лечения: он не содержит медицинского текста, врача и точного времени для всех строк',
      sourceProtection: 'Исходные JSON не изменялись',
    },
  };
  await writeProtected(join(outputDir, 'dry-run-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const manifest = {
    format: FORMAT_VERSION,
    generatedAt: report.generatedAt,
    status: report.status,
    databaseWrites: 0,
    sources: {
      owners: { file: basename(ownersPath), sha256: sha256(ownersBuffer), rows: owners.length },
      patients: { file: basename(patientsPath), sha256: sha256(patientsBuffer), rows: patients.length },
    },
    outputs: Object.fromEntries(Object.entries(outputChecksums).map(([file, checksum]) => [file, { sha256: checksum }])),
    report: 'dry-run-report.json',
  };
  await writeProtected(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeProtected(join(outputDir, 'README.txt'), [
    'TemichevVet — подготовка переноса владельцев и пациентов',
    '',
    `Статус: ${report.status}`,
    'На этом этапе база CRM не открывалась и не изменялась.',
    '',
    'clients-import.csv можно использовать только на экране «Перенос данных» через кнопку «Проверить файл без записи».',
    'Не нажимайте «Перенести» до отдельной сверки с реальной базой клиники и явного подтверждения.',
    'visits-summary-reference-only.csv — только справочник последних дат. Его нельзя импортировать как медицинскую историю.',
    '',
    'Все CSV: UTF-8 с BOM, разделитель «;», окончания строк Windows CRLF.',
    '',
  ].join('\r\n'));

  console.log(JSON.stringify({
    status: report.status,
    databaseWrites: 0,
    owners: report.counts.owners,
    patients: report.counts.patients,
    clientsImportRows: report.counts.clientsImportRows,
    blockingIssues: blockingIssues.length,
    warnings: warnings.length,
    outputDir,
  }));
  if (blockingIssues.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
