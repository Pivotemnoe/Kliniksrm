import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd(), output = path.resolve(process.argv[2] || 'output/pet-hotel-sync-isolation-20261021/packet');
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()) throw Error('Commit the reviewed source and release tools before packaging');
await mkdir(output); await mkdir(path.join(output, 'api'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const preflight = JSON.parse(await readFile('output/pet-hotel-sync-isolation-20261021/production-preflight.json', 'utf8'));
const api = preflight.containers.find(x => x.name === 'clinic-crm-api'), web = preflight.containers.find(x => x.name === 'clinic-crm-web');
if (api.image !== 'sha256:fb6a0d3cc27398fe1060ceb460710bbd7d634c4dd0a5d50673940076751656b9' || web.image !== 'sha256:fd18a8e9b93e209fd0c83f006ab1364dbd6ce0a7aec8b7d4f823be6fb92dad92') throw Error('Requalify the production baseline');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const compiled = [];
for (const ext of ['js', 'js.map', 'd.ts']) {
  const name = 'pet-hotel-sync.service.' + ext, file = path.join('apps/api/dist/modules/pet-hotel', name);
  if (!(await stat(file)).isFile()) throw Error('Missing compiled API artifact');
  const bytes = await readFile(file); compiled.push({ name, sha256: sha(bytes) }); await writeFile(path.join(output, 'api', name), bytes);
}
const sourceHash = sha(await readFile('apps/api/src/modules/pet-hotel/pet-hotel-sync.service.ts'));
if (sourceHash !== '6485fbd6df5aa057fe5c03428be97a47367b40d4a00fe11e19bb3ade5799c598') throw Error('Reviewed source changed');
const manifest = {
  releaseId: 'crm-pet-hotel-sync-20261021-r1', revision,
  scope: 'ONE_API_MODULE_STAGE_ISOLATION_NO_SCHEMA_CHANGE', sourceHash, compiled,
  previous: api, web, protected: preflight.containers.filter(x => x.name !== 'clinic-crm-api'),
  configuration: preflight.configuration,
  candidate: { reference: 'temichevvet-crm-api:pet-hotel-sync-' + revision.slice(0, 12), id: null },
  tests: { apiBuild: true, faultInjection: 12, bridgeIntegration: 11, realHttpTimeout: true, baselineRealHttpTimeoutFailed: true },
};
await writeFile(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const name of ['Dockerfile.api', 'qualify.cjs', 'release-api.ps1', 'verify-release.ps1']) await copyFile(path.join('deploy/pet-hotel-sync-isolation', name), path.join(output, name));
const checksums = {};
for (const name of ['release.json', 'Dockerfile.api', 'qualify.cjs', 'release-api.ps1', 'verify-release.ps1', ...compiled.map(x => 'api/' + x.name)]) checksums[name] = sha(await readFile(path.join(output, name)));
await writeFile(path.join(output, 'checksums.json'), JSON.stringify(checksums, null, 2) + '\n');
console.log(JSON.stringify({ output, releaseId: manifest.releaseId, revision, sourceHash, compiledFiles: compiled.length }));
