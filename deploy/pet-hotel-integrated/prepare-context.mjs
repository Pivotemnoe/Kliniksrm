import {execFileSync} from 'node:child_process';
import {mkdir,cp,copyFile,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),releaseId='crm-pet-hotel-integrated-20261020-r1';
const out=join(root,'output/deployments',releaseId),packet=join(out,'packet');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('Release source must be committed and clean');
const pre=JSON.parse(await readFile(join(out,'production-preflight.json'),'utf8'));
const db=JSON.parse(await readFile(join(out,'database-preflight.json'),'utf8'));
const gateway=JSON.parse(await readFile(join(out,'gateway-preflight.json'),'utf8'));
if(pre.hostName!=='WIN-I123AM83GR4'||pre.release.revision!=='908cbbdd0aae9e302fc9b7ed5cc56de00804436d'||db.environment.seedOnStart!=='false')throw Error('Unexpected current clinic baseline');
if(db.migrations.some(m=>!m.finished_at&&!m.rolled_back_at))throw Error('Existing failed clinic migration');
async function checkMigrations(path,applied,expected){
 const pending=[];
 for(const dir of await readdir(path,{withFileTypes:true})){
  if(!dir.isDirectory())continue;const sql=await readFile(join(path,dir.name,'migration.sql'));
  if(applied.has(dir.name)){if(createHash('sha256').update(sql).digest('hex')!==applied.get(dir.name))throw Error('Applied migration differs: '+dir.name);applied.delete(dir.name);}else pending.push(dir.name);
 }
 if(applied.size)throw Error('A live migration is absent from release source');
 if(JSON.stringify(pending.sort())!==JSON.stringify(expected))throw Error('Unrelated pending migrations: '+pending.join(','));
}
const expected=['20261020130000_pet_hotel_module','20261020203000_pet_hotel_owner_booking'];
const gatewayExpected=['20261020190000_pet_hotel_portal','20261020200000_pet_hotel_staff_delivery','20261020203000_pet_hotel_delivery_intent'];
await checkMigrations(join(root,'prisma/migrations'),new Map(db.migrations.filter(m=>m.finished_at&&!m.rolled_back_at).map(m=>[m.migration_name,m.checksum])),expected);
const gatewayApplied=new Map(gateway.migrations.trim().split('\n').map(line=>line.split('|').slice(0,2)));
await checkMigrations(join(root,'apps/owner-gateway/prisma/migrations'),gatewayApplied,gatewayExpected);
await rm(packet,{recursive:true,force:true});await mkdir(packet,{recursive:true});
async function compiled(source,destination,paths){for(const path of paths)for(const suffix of ['js','js.map','d.ts']){const relative=path+'.'+suffix;await mkdir(dirname(join(packet,destination,relative)),{recursive:true});await copyFile(join(root,source,relative),join(packet,destination,relative));}}
await cp(join(root,'prisma'),join(packet,'prisma'),{recursive:true});
await cp(join(root,'apps/api/dist/modules/pet-hotel'),join(packet,'api/modules/pet-hotel'),{recursive:true});
await compiled('apps/api/dist','api',['app.module','modules/clinic-modules/clinic-modules.service','modules/clinic-modules/clinic-modules.controller','modules/live-updates/live-updates.module']);
await cp(join(root,'apps/web/dist'),join(packet,'web'),{recursive:true});
await cp(join(root,'apps/owner-gateway/prisma'),join(packet,'gateway/prisma'),{recursive:true});
await cp(join(root,'apps/owner-gateway/dist/pet-hotel'),join(packet,'gateway/dist/pet-hotel'),{recursive:true});
await compiled('apps/owner-gateway/dist','gateway/dist',['app.module','max-webhook.service','max-bot.client','owner-notification.service','portal.service','dto/owner-notification.dto']);
const publicFiles=['pet-hotel.html','pet-hotel.js','pet-hotel.css'];
// Shared portal navigation is included only when the approved source delta changes it.
for(const name of ['index.html','app.js']){
 const changed=execFileSync('git',['diff','--name-only',pre.release.revision,'HEAD','--','apps/owner-gateway/public/'+name],{cwd:root,encoding:'utf8'}).trim();
 if(changed)publicFiles.push(name);
}
await mkdir(join(packet,'gateway/public'),{recursive:true});for(const name of publicFiles)await copyFile(join(root,'apps/owner-gateway/public',name),join(packet,'gateway/public',name));
const engine=await readFile('/Users/konstantin/Documents/CRM/output/deployments/crm-avito-clinic-20261020-r1/clinic/engines/schema-engine-linux-musl-openssl-3.0.x');
if(createHash('sha256').update(engine).digest('hex')!=='955e3bff1be23248a0922a219f7c4e200acc8fdd1fc72479557c0a9d782bd64a')throw Error('Prisma engine checksum differs');
await mkdir(join(packet,'engines'),{recursive:true});await writeFile(join(packet,'engines/schema-engine-linux-musl-openssl-3.0.x'),engine,{mode:0o755});
for(const name of ['Dockerfile.api','Dockerfile.web','Dockerfile.gateway','build-clinic.ps1','backup-database.ps1','release-clinic.ps1','initialize.cjs','qualify.cjs','qualify-gateway.cjs','release-gateway.py','protected-rows.sql','README.md']){
 const bytes=await readFile(join(root,'deploy/pet-hotel-integrated',name));
 await writeFile(join(packet,name),name.endsWith('.ps1')?Buffer.concat([Buffer.from([239,187,191]),Buffer.from(bytes.toString('utf8').replace(/^\uFEFF/,''))]):bytes);
}
const previous={};for(const kind of ['api','web']){const c=pre.containers.find(c=>c.name==='clinic-crm-'+kind);previous[kind]={reference:c.reference,id:c.image};}
const release={releaseId,revision,baseRevision:pre.release.revision,actorId:'7caf9a94-9bb3-4fdf-8289-040a4a4b50c5',previous,
 images:{api:{reference:'temichevvet-crm-api:pet-hotel-integrated-'+revision.slice(0,12),id:null},web:{reference:'temichevvet-crm-web:pet-hotel-integrated-'+revision.slice(0,12),id:null}},
 configuration:pre.configuration,pendingMigrations:expected,protectedApiFiles:0,
 gateway:{hostName:gateway.hostName,previous:{reference:gateway.reference,id:gateway.image},candidate:{reference:'temichevvet-owner-gateway:pet-hotel-integrated-'+revision.slice(0,12)},pendingMigrations:gatewayExpected,publicFiles}};
await writeFile(join(packet,'release.json'),JSON.stringify(release,null,2));
await writeFile(join(packet,'web/release.json'),JSON.stringify({releaseId,revision,baseRevision:pre.release.revision,component:'staff-web-with-integrated-pet-hotel'}));
const checksums={};async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())await scan(path);else if(e.isFile()){
 const bytes=await readFile(path);checksums[path.slice(packet.length+1)]=createHash('sha256').update(bytes).digest('hex');
 if(/\.(html|js)$/.test(e.name)){const s=bytes.toString('utf8');for(const bad of ['http://127.0.0.1:4000/api','LocalGrooming2026!','LocalGroomingOnly2026!','PreviewGroomerReady2026!','synthetic-grooming-only','integrated-hotel-director@example.local'])if(s.includes(bad))throw Error('QA value in release: '+path);}
}}}
await scan(packet);await writeFile(join(out,'packet-checksums.json'),JSON.stringify(checksums,null,2));
console.log(JSON.stringify({packet,revision,pendingMigrations:expected,gatewayMigrations:gatewayExpected,files:Object.keys(checksums).length,productionWebValuesChecked:true}));
