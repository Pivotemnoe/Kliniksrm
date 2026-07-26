#!/usr/bin/env node
import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDir = resolve(valueAfter('--output-dir') || 'private-license-keys');
if (!process.argv.includes('--i-understand-private-key')) {
  fail('Добавьте --i-understand-private-key и храните созданный закрытый ключ вне проекта и флешки клиники.');
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
await mkdir(outputDir, { recursive: true });
const privatePath = resolve(outputDir, 'temichevvet-license-private.pem');
const publicPath = resolve(outputDir, 'temichevvet-license-public.pem');
await writeFile(privatePath, privateKey, { encoding: 'utf8', flag: 'wx' });
await chmod(privatePath, 0o600);
await writeFile(publicPath, publicKey, { encoding: 'utf8', flag: 'wx' });
console.log(`Закрытый ключ: ${privatePath}`);
console.log(`Открытый ключ: ${publicPath}`);
console.log('Закрытый ключ не копируйте в CRM, Docker-образ или клинику.');

function valueAfter(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function fail(message) { console.error(message); process.exit(2); }
