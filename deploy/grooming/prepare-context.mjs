import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, copyFile, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const destination=resolve(root,'.artifacts/grooming-integration/compact-context');
// Prisma 6.9.0, official uncompressed engine checksum from binaries.prisma.sh.
// The engine is a private release input, not committed into the application source.
const engine='schema-engine-linux-musl-openssl-3.0.x';
const engineBytes=await readFile(resolve(root,'.artifacts/grooming-integration/engines',engine));
if(createHash('sha256').update(engineBytes).digest('hex')!=='955e3bff1be23248a0922a219f7c4e200acc8fdd1fc72479557c0a9d782bd64a')throw new Error('Prisma release engine checksum differs');
await mkdir(join(destination,'engines'),{recursive:true});
await writeFile(join(destination,'engines',engine),engineBytes,{mode:0o755});
const paths=['prisma','apps/api/dist/modules/grooming','apps/api/dist/modules/clinic-modules','apps/api/dist/app.module.js','apps/owner-gateway/prisma','apps/owner-gateway/dist/grooming','apps/owner-gateway/dist/app.module.js','apps/owner-gateway/dist/max-bot.client.js','apps/owner-gateway/dist/max-webhook.service.js','apps/owner-gateway/dist/owner-notification.service.js','apps/owner-gateway/dist/portal-page.controller.js','apps/owner-gateway/dist/portal.service.js','apps/owner-gateway/dist/dto/owner-notification.dto.js','apps/owner-gateway/public/grooming.html','apps/owner-gateway/public/grooming.css','apps/owner-gateway/public/grooming.js','apps/owner-gateway/public/app.js','apps/owner-gateway/public/index.html','apps/web/dist','apps/web/nginx.conf'];
for(const path of paths){await mkdir(resolve(destination,path,'..'),{recursive:true});await cp(resolve(root,path),resolve(destination,path),{recursive:true});}
async function validateWeb(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await validateWeb(path);else if(/\.(html|js)$/.test(entry.name)){const source=await readFile(path,'utf8');for(const forbidden of ['http://127.0.0.1:4000/api','LocalGrooming2026!','synthetic-grooming-only'])if(source.includes(forbidden))throw new Error('Non-production value found in '+path);}}}
await validateWeb(join(destination,'apps/web/dist'));
const release={releaseId:'grooming-integration-20261019-r1',revision,clinicalBaseRevision:'efd0f54fdc0656e1445ad292e98b820e673b02d0',acceptedStockRevision:'86962b5018701f2fef3482fae7b3edda9039b9a8',component:'staff-web-with-grooming'};
await writeFile(join(destination,'apps/web/dist/release.json'),JSON.stringify(release));
for(const component of ['api','gateway','web'])await copyFile(join(root,`deploy/grooming/Dockerfile.${component}`),join(destination,`Dockerfile.${component}`));
for(const file of ['backup-database.ps1','release-clinic.ps1','initialize-module.cjs','provision-groomer-device.cjs','release-gateway.py'])await copyFile(join(root,'deploy/grooming',file),join(destination,file));
await writeFile(join(destination,'source.json'),JSON.stringify(release,null,2));
console.log(JSON.stringify({destination,revision,paths:paths.length,productionWebValuesChecked:true}));
