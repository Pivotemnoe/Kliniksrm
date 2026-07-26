#!/usr/bin/env node
import { randomUUID, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const format = 'temichevvet-offline-license-v1';
const privateKeyPath = required('--private-key');
const customer = required('--customer');
const installationId = required('--installation-id');
const hostFingerprint = required('--host-fingerprint');
const validUntilInput = required('--valid-until');
const outputPath = resolve(required('--output'));
const validUntil = new Date(validUntilInput);
if (Number.isNaN(validUntil.getTime())) fail('Некорректная дата --valid-until');
const features = (valueAfter('--features') || 'crm,support,updates').split(',').map((value) => value.trim()).filter(Boolean);
const maxOffices = Number(valueAfter('--max-offices') || 1);
if (!Number.isInteger(maxOffices) || maxOffices < 1) fail('--max-offices должен быть целым числом больше нуля');
const payload = {
  customer,
  features,
  hostFingerprint,
  installationId,
  issuedAt: new Date().toISOString(),
  licenseId: valueAfter('--license-id') || randomUUID(),
  maxOffices,
  validUntil: validUntil.toISOString(),
};
const canonical = JSON.stringify(sortValue(payload));
const privateKey = await readFile(resolve(privateKeyPath), 'utf8');
const signature = sign(null, Buffer.from(canonical, 'utf8'), privateKey);
const document = {
  format,
  payload: Buffer.from(canonical, 'utf8').toString('base64url'),
  signature: signature.toString('base64url'),
};
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(`Лицензия создана: ${outputPath}`);
console.log(`Клиника: ${customer}`);
console.log(`Действует до: ${payload.validUntil}`);

function required(name) { const value = valueAfter(name); if (!value) fail(`Не указан ${name}`); return value; }
function valueAfter(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function fail(message) { console.error(message); process.exit(2); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortValue(child)]));
}
