import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { root, baseRevision, sourceRevision, runtimeFiles, packet, releaseId, buildEnv, baseWebImage, baseApiImage, baseOwnerImage, candidateWebImage, candidateOwnerImage, ownerRevision } from './config.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = run('git', ['rev-parse', sourceRevision]).trim();
const changed = run('git', ['diff', '--name-only', baseRevision, revision]).trim().split('\n');
assert.deepEqual(changed.filter(name => name.startsWith('apps/')).sort(), [...runtimeFiles].sort(), 'Only approved frontend runtime files belong to the release');
assert.ok(changed.every(name=>runtimeFiles.includes(name)||name.startsWith('tests/')||name.startsWith('scripts/redesign-release/')), 'Unexpected changes outside the release scope');
for (const name of ['package.json', 'package-lock.json', 'prisma/schema.prisma', 'apps/owner-gateway/prisma/schema.prisma']) {
  assert.equal(sha(await readFile(resolve(root, name))), sha(run('git', ['show', `${baseRevision}:${name}`])), `${name} must stay at the baseline`);
}
for (const name of runtimeFiles) assert.equal(sha(await readFile(resolve(root, name))), sha(run('git', ['show', `${revision}:${name}`])), `Uncommitted runtime drift: ${name}`);
console.log(`Approved scope: ${runtimeFiles.length} runtime files; API, schemas, dependencies and routes unchanged.`);
await mkdir(packet, { recursive: true });
await writeFile(resolve(packet, 'source.patch'), run('git', ['diff', '--binary', baseRevision, revision, '--', 'apps/', 'tests/']));
const buildLog = run('npm', ['run', 'web:build'], { env: buildEnv() });
await writeFile(resolve(packet, 'web-build.log'), buildLog);
await cp(resolve(root, 'apps/web/dist'), resolve(packet, 'web'), { recursive: true });
await mkdir(resolve(packet, 'owner-public'), { recursive: true });
for (const name of ['app.js', 'app.css', 'index.html', 'sw.js']) await cp(resolve(root, 'apps/owner-gateway/public', name), resolve(packet, 'owner-public', name));
const release = { releaseId, revision, baseRevision, createdAt: new Date().toISOString(), productionDeployed: false, liveTargetVerified: false,
  platform: 'linux/amd64', authMode: 'protected', apiBaseUrl: '/api', runtimeFiles, nodeBuildVersion: process.version,
  images: {}, unchanged: ['API', 'database schemas', 'package lock', 'permissions', 'routes', 'configuration secrets'], publication: 'local images only; no registry push' };
for (const [component, image] of Object.entries({ web: baseWebImage, api: baseApiImage, owner: baseOwnerImage })) {
  const info = JSON.parse(run('docker', ['image', 'inspect', image]))[0];
  assert.equal(info.Architecture, 'amd64');
  if (component !== 'owner') assert.equal(info.Config.Labels['org.opencontainers.image.revision'], baseRevision);
  release.images[component] = { previous: image, previousId: info.Id, previousLayers: info.RootFS.Layers };
}
await writeFile(resolve(packet, 'web/release.json'), JSON.stringify({ releaseId, revision, baseRevision, component: 'staff-web' }));
const label = `LABEL org.opencontainers.image.revision="${revision}" io.temichevvet.redesign.release="${releaseId}"`;
await writeFile(resolve(packet, 'Dockerfile.web'), `FROM ${baseWebImage}\n${label}\nCOPY web/ /usr/share/nginx/html/\nCOPY web/assets/ /opt/temichevvet-web-assets/\n`);
await writeFile(resolve(packet, 'Dockerfile.owner'), `FROM ${baseOwnerImage}\nLABEL org.opencontainers.image.revision="${ownerRevision}" io.temichevvet.redesign.release="crm-redesign-20261019-r1"\nCOPY owner-public/ /app/apps/owner-gateway/dist/public/\n`);
for (const [component, image] of [['web', candidateWebImage]]) {
  console.log(`Building isolated AMD64 ${component} image (copy-only overlay)...`);
  const build = run('docker', ['build', '--platform', 'linux/amd64', '--pull=false', '--network', 'none', '-f', `Dockerfile.${component}`, '-t', image, '.'], { cwd: packet });
  await writeFile(resolve(packet, `${component}-image-build.log`), build);
  const info = JSON.parse(run('docker', ['image', 'inspect', image]))[0];
  assert.equal(info.Architecture, 'amd64'); assert.equal(info.Config.Labels['org.opencontainers.image.revision'], revision);
  assert.deepEqual(info.RootFS.Layers.slice(0, release.images[component].previousLayers.length), release.images[component].previousLayers);
  Object.assign(release.images[component], { candidate: image, candidateId: info.Id });
}
const retainedOwner=JSON.parse(run('docker',['image','inspect',candidateOwnerImage]))[0];
assert.equal(retainedOwner.Architecture,'amd64');
assert.equal(retainedOwner.Config.Labels['org.opencontainers.image.revision'],ownerRevision);
assert.deepEqual(retainedOwner.RootFS.Layers.slice(0,release.images.owner.previousLayers.length),release.images.owner.previousLayers);
for(const name of ['app.js','app.css','index.html','sw.js']) assert.equal(sha(await readFile(resolve(packet,'owner-public',name))),sha(run('git',['show',`${ownerRevision}:apps/owner-gateway/public/${name}`])));
Object.assign(release.images.owner,{candidate:candidateOwnerImage,candidateId:retainedOwner.Id,revision:ownerRevision,reusedUnchanged:true});
// Production artifacts must not contain the local runner, fixtures or its credentials.
async function inspectFiles(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) await inspectFiles(path);
    else {
      const contents = await readFile(path);
      for (const forbidden of ['LocalCRM2026!', 'synthetic-qa-only', 'crm_redesign_local', '127.0.0.1:4222', 'Локальная CRM · тестовые данные']) assert.ok(!contents.includes(Buffer.from(forbidden)), `Local data found in ${relative(packet, path)}`);
    }
  }
}
await inspectFiles(resolve(packet, 'web')); await inspectFiles(resolve(packet, 'owner-public'));
await writeFile(resolve(packet, 'release.json'), JSON.stringify(release, null, 2));
console.log(`Local image pair ready. Manifest: ${resolve(packet, 'release.json')}`);
