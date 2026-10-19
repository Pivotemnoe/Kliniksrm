import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { baseWebImage, baseApiImage, baseOwnerImage, root, qaDir, qaProject } from './config.mjs';

const names = { web: `${qaProject}-web`, api: `${qaProject}-api`, postgres: `${qaProject}-postgres`, redis: `${qaProject}-redis`, minio: `${qaProject}-minio`, gateway: `${qaProject}-gateway` };
const ownerSyncSecret = 'local-release-qa-sync-only-20261019';
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed: ${result.stderr || result.error}`);
  return result.stdout;
}
async function ready(url) {
  for (let i = 0; i < 80; i++) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise(done => setTimeout(done, 500));
  }
  throw new Error(`QA health failed: ${url}`);
}
await mkdir(qaDir, { recursive: true });
const existing = docker(['ps', '-a', '--filter', `label=io.temichevvet.release-qa=${qaProject}`, '--format', '{{.Names}}']).trim();
const resume = process.argv.includes('--resume');
if (resume) { try { await access(resolve(qaDir, 'baseline-containers.json')); throw new Error('Completed QA environment must not be reset'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
assert.ok(!existing || resume, 'QA environment already exists; inspect it instead of resetting data');
if (existing) for (const name of existing.split('\n')) assert.ok(Object.values(names).includes(name));
const before = JSON.parse(docker(['inspect', 'crm-assistant-qa-20261008', 'crm-avito-qa-20261019', 'crm-grooming-qa-20261019'])).map(v => ({ name: v.Name, id: v.Id, started: v.State.StartedAt, image: v.Image }));
await writeFile(resolve(qaDir, 'original-containers-before.json'), JSON.stringify(before, null, 2));
const volumeName = `${qaProject}-assets`;
for (const [kind, name] of [['network', qaProject], ['network', `${qaProject}-edge`], ['volume', volumeName]]) {
  const result = spawnSync('docker', [kind, 'inspect', name], { encoding: 'utf8' });
  if (result.status === 0) assert.equal(JSON.parse(result.stdout)[0].Labels['io.temichevvet.release-qa'], qaProject);
  else docker([kind, 'create', ...(kind === 'network' && name === qaProject ? ['--internal'] : []), '--label', `io.temichevvet.release-qa=${qaProject}`, name]);
}
const service = (name, image, extra = {}) => ({ image, container_name: names[name], labels: { 'io.temichevvet.release-qa': qaProject }, networks: { qa: { aliases: [name] } }, ...extra });
const compose = { name: qaProject, services: {
  postgres: service('postgres', 'postgres:16-alpine', { networks: { qa: { aliases: ['postgres'] }, edge: {} }, environment: { POSTGRES_USER: 'crm_qa', POSTGRES_PASSWORD: 'synthetic-qa-only', POSTGRES_DB: 'crm_redesign_production_qa' }, ports: ['127.0.0.1:15490:5432'] }),
  redis: service('redis', 'redis:7-alpine'),
  minio: service('minio', 'minio/minio:RELEASE.2025-09-07T16-13-09Z', { environment: { MINIO_ROOT_USER: 'release-qa', MINIO_ROOT_PASSWORD: 'release-qa-only-20261019' }, command: ['server', '/data'] }),
  gateway: service('gateway', '${OWNER_GATEWAY_IMAGE}', { networks: { qa: { aliases: ['gateway'] }, edge: {} }, platform: 'linux/amd64', ports: ['127.0.0.1:4253:4100'], environment: {
    NODE_ENV: 'test', OWNER_GATEWAY_DATABASE_URL: 'postgresql://crm_qa:synthetic-qa-only@postgres:5432/crm_redesign_owner_production_qa', OWNER_GATEWAY_PORT: '4100', OWNER_GATEWAY_PUBLIC_URL: 'http://127.0.0.1:4253',
    OWNER_GATEWAY_SYNC_SECRET: ownerSyncSecret, OWNER_GATEWAY_SESSION_COOKIE: 'crm_release_owner_session', CLINIC_ASSISTANT_ENABLED: 'false', OWNER_GATEWAY_TRUST_PROXY: 'false' } }),
  api: service('api', baseApiImage, { platform: 'linux/amd64', entrypoint: ['node', 'apps/api/dist/main.js'], environment: {
    NODE_ENV: 'test', CLINIC_RUNTIME_MODE: 'test', API_PORT: '4000', APP_URL: 'http://127.0.0.1:4251',
    DATABASE_URL: 'postgresql://crm_qa:synthetic-qa-only@postgres:5432/crm_redesign_production_qa', REDIS_URL: 'redis://redis:6379',
    S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'crm-release-qa', S3_ACCESS_KEY: 'release-qa', S3_SECRET_KEY: 'release-qa-only-20261019',
    SESSION_COOKIE_NAME: 'crm_release_qa_session', SESSION_COOKIE_SECURE: 'false', SESSION_SECRET: randomBytes(32).toString('hex'),
    SEED_ON_START: 'false', SEED_TEST_DATA: 'false', API_DOCS_ENABLED: 'false', TEMICHEVVET_LICENSE_MODE: 'compatibility',
    OWNER_GATEWAY_URL: 'http://gateway:4100', OWNER_GATEWAY_SYNC_SECRET: ownerSyncSecret, OWNER_GATEWAY_BOOKING_SYNC_ENABLED: 'true', CLINIC_SITE_CATALOG_SYNC_ENABLED: 'false',
    CLINIC_ASSISTANT_ENABLED: 'false', CLINIC_ASSISTANT_REMINDERS_ENABLED: 'false', CRM_SOURCE_VERSION: 'efd0f54fdc0656e1445ad292e98b820e673b02d0' } }),
  web: service('web', '${TEMICHEVVET_WEB_IMAGE}', { networks: { qa: { aliases: ['web'] }, edge: {} }, platform: 'linux/amd64', ports: ['127.0.0.1:4251:80'], volumes: [`${volumeName}:/usr/share/nginx/html/assets`] }),
}, networks: { qa: { name: qaProject, external: true }, edge: { name: `${qaProject}-edge`, external: true } }, volumes: { [volumeName]: { external: true, name: volumeName } } };
await writeFile(resolve(qaDir, 'docker-compose.yml'), JSON.stringify(compose, null, 2));
await writeFile(resolve(qaDir, '.env'), `TEMICHEVVET_WEB_IMAGE=${baseWebImage}\nOWNER_GATEWAY_IMAGE=${baseOwnerImage}\n`);
const cmd = args => docker(['compose', '--project-name', qaProject, '--project-directory', qaDir, ...args]);
if (!resume) {
cmd(['up', '-d', '--no-deps', '--pull', 'never', 'postgres', 'redis', 'minio']);
for (let attempt = 0; attempt < 60; attempt++) {
  const result = spawnSync('docker', ['exec', names.postgres, 'pg_isready', '-U', 'crm_qa'], { encoding: 'utf8' });
  if (result.status === 0) break;
  if (attempt === 59) throw new Error('QA PostgreSQL not ready');
  await new Promise(done => setTimeout(done, 250));
}
for (const [sourceDatabase, targetDatabase] of [['crm_redesign_local', 'crm_redesign_production_qa'], ['crm_redesign_owner_local', 'crm_redesign_owner_production_qa']]) {
  // Only two named synthetic databases are exported. Their original containers are never stopped.
  assert.ok(sourceDatabase.startsWith('crm_redesign_'));
  if (targetDatabase !== 'crm_redesign_production_qa') docker(['exec', names.postgres, 'createdb', '-U', 'crm_qa', targetDatabase]);
  const dump = docker(['exec', 'crm-assistant-qa-20261008', 'pg_dump', '-U', 'crm_qa', '-d', sourceDatabase, '-Fc'], { encoding: null });
  docker(['exec', '-i', names.postgres, 'pg_restore', '-U', 'crm_qa', '-d', targetDatabase, '--no-owner', '--no-acl', '--exit-on-error'], { input: dump });
}
// Apply the already-live schema change only to the newly cloned synthetic database.
const migration = await readFile(resolve(root, 'prisma/migrations/20261019000100_general_consumable_bindings/migration.sql'), 'utf8');
const present=docker(['exec',names.postgres,'psql','-U','crm_qa','-d','crm_redesign_production_qa','-tA','-c',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ServiceConsumableRule','ConsumableUsageSnapshot');"]).trim();
if(present==='0') docker(['exec', '-i', names.postgres, 'psql', '-U', 'crm_qa', '-d', 'crm_redesign_production_qa', '-v', 'ON_ERROR_STOP=1'], { input: migration });
else assert.equal(present,'2','Partial synthetic schema is not accepted');
// Avoid replaying historical jobs or invitations in the isolated copy.
docker(['exec', names.postgres, 'psql', '-U', 'crm_qa', '-d', 'crm_redesign_production_qa', '-v', 'ON_ERROR_STOP=1', '-c', 'UPDATE "BackgroundJob" SET status = \'DONE\'; UPDATE "ClientPortalAccess" SET status = \'DISABLED\';']);
}
cmd(['up', '-d', '--no-deps', '--pull', 'never', 'gateway']);
await ready('http://127.0.0.1:4253/health');
cmd(['up', '-d', '--no-deps', '--pull', 'never', 'api', 'web']);
await ready('http://127.0.0.1:4251/api/health');
await copyFile('/Users/konstantin/Documents/CRM/tmp/crm-local/fixtures.json', resolve(qaDir, 'fixtures.json'));
const config = `import { fileURLToPath } from 'node:url';\nexport const dataDir=fileURLToPath(new URL('./',import.meta.url));\nexport const password='LocalCRM2026!';\nexport const webUrl='http://127.0.0.1:4251';\nexport const ownerUrl='http://127.0.0.1:4253';\nexport const databaseUrl='postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15490/crm_redesign_production_qa';\nexport function assertLocalDatabase(){const u=new URL(databaseUrl);if(u.hostname!=='127.0.0.1'||u.port!=='15490'||u.pathname!=='/crm_redesign_production_qa')throw new Error('Only the release QA database is allowed');}\n`;
await writeFile(resolve(qaDir, 'config.mjs'), config);
for (const script of ['verify.mjs', 'owner-fixtures.mjs']) {
  const original = await readFile(`/Users/konstantin/Documents/CRM/scripts/crm-local/${script}`, 'utf8');
  await writeFile(resolve(qaDir, script), original.replaceAll('d3519019-', 'd3519020-').replaceAll('crm_redesign_local', 'crm_redesign_production_qa'));
}
const snapshot = JSON.parse(docker(['inspect', ...Object.values(names)])).map(v => ({ name: v.Name, id: v.Id, image: v.Image, started: v.State.StartedAt }));
await writeFile(resolve(qaDir, 'baseline-containers.json'), JSON.stringify(snapshot, null, 2));
console.log('Isolated baseline available: http://127.0.0.1:4251 (staff), http://127.0.0.1:4253/portal (owner). Existing containers unchanged.');
