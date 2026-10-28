// Reuse the reviewed synthetic fixture, but generate private copies with an iOS-only schema.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const generated = new URL('./.generated/', import.meta.url);
if (process.env.STAFF_IOS_QA_CONFIRM !== 'isolated-synthetic') throw new Error('Set STAFF_IOS_QA_CONFIRM=isolated-synthetic');
process.chdir(root);
await mkdir(generated, { recursive: true });
for (const name of ['grooming-crm-fixture.mjs', 'staff-mobile-fixture.mjs']) {
  const source = await readFile(new URL('../../../tests/helpers/' + name, import.meta.url), 'utf8');
  const copy = source.replaceAll('../../apps/api/dist/', './backend/apps/api/dist/').replaceAll('../../apps/owner-gateway/', '../../../../apps/owner-gateway/').replaceAll('staff-mobile-20261028', 'staff-ios-20261028').replaceAll('staff_mobile_qa_20261028', 'staff_ios_qa_20261028');
  await writeFile(new URL(name, generated), copy);
}
const source = await readFile(new URL('../../../scripts/staff-app/prepare-local-qa.mjs', import.meta.url), 'utf8');
const copy = source.replace('../../tests/helpers/grooming-crm-fixture.mjs', './grooming-crm-fixture.mjs').replace("'prisma/schema.prisma'", "'apps/staff-ios/QA/.generated/backend/prisma/schema.prisma'").replaceAll('staff-mobile-20261028', 'staff-ios-20261028').replaceAll('staff_mobile_qa_20261028', 'staff_ios_qa_20261028').replaceAll('Codex staff-mobile isolated synthetic QA 20261028', 'Codex staff-ios isolated synthetic QA 20261028');
await writeFile(new URL('prepare-schema.mjs', generated), copy);
const result = spawnSync(process.execPath, [fileURLToPath(new URL('prepare-schema.mjs', generated))], { cwd: root, stdio: 'inherit', env: { ...process.env, STAFF_APP_QA_CONFIRM: 'isolated-synthetic', STAFF_APP_QA_RESET: process.env.STAFF_IOS_QA_RESET || '' } });
if (result.status !== 0) process.exit(result.status || 1);
