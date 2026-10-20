import {execFileSync} from 'node:child_process';
import {mkdir,cp,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'../..'),releaseId='crm-grooming-independent-20261020-r1';
const out=join(root,'output/deployments',releaseId),packet=join(out,'packet');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('Release source must be committed and clean');
const pre=JSON.parse(await readFile(join(out,'production-preflight.json'),'utf8'));
const db=JSON.parse(await readFile(join(out,'database-preflight.json'),'utf8'));
const gateway=JSON.parse(await readFile(join(out,'gateway-preflight.json'),'utf8'));
if(pre.hostName!=='WIN-I123AM83GR4'||pre.release.revision!=='ccaea00f1de24eafeb86fb6df8f735714c95c6e5'||db.environment.seedOnStart!=='false')throw Error('Unexpected current clinic baseline');
if(db.migrations.some(m=>!m.finished_at&&!m.rolled_back_at))throw Error('Existing failed clinic migration');
const applied=new Map(db.migrations.filter(m=>m.finished_at&&!m.rolled_back_at).map(m=>[m.migration_name,m.checksum])),pending=[];
for(const dir of await readdir(join(root,'prisma/migrations'),{withFileTypes:true})){
 if(!dir.isDirectory())continue;
 const sql=await readFile(join(root,'prisma/migrations',dir.name,'migration.sql'));
 if(applied.has(dir.name)){if(createHash('sha256').update(sql).digest('hex')!==applied.get(dir.name))throw Error('Applied clinic migration differs: '+dir.name);applied.delete(dir.name);}else pending.push(dir.name);
}
if(applied.size)throw Error('A live clinic migration is absent from release source');
const expected=['20261020130000_grooming_price_catalog','20261020160000_grooming_independent_team','20261020163000_grooming_workplace_schedule'];
if(JSON.stringify(pending.sort())!==JSON.stringify(expected))throw Error('Unrelated pending clinic migrations: '+pending.join(','));
await mkdir(packet,{recursive:true});
await cp(join(root,'prisma'),join(packet,'prisma'),{recursive:true});
await cp(join(root,'apps/api/dist/modules/grooming'),join(packet,'api/modules/grooming'),{recursive:true});
for(const path of ['auth/auth','employees/employees','internal-messages/internal-messages','payroll/payroll','remote-access/remote-access','reports/reports','scheduling/scheduling'])for(const suffix of ['js','js.map','d.ts']){
 const relative='modules/'+path+'.service.'+suffix;await mkdir(join(packet,'api',relative,'..'),{recursive:true});await copyFile(join(root,'apps/api/dist',relative),join(packet,'api',relative));
}
await cp(join(root,'apps/web/dist'),join(packet,'web'),{recursive:true});
await cp(join(root,'apps/owner-gateway/prisma'),join(packet,'gateway/prisma'),{recursive:true});
await cp(join(root,'apps/owner-gateway/dist/grooming'),join(packet,'gateway/grooming'),{recursive:true});
const engine=await readFile('/Users/konstantin/Documents/CRM/output/deployments/crm-avito-clinic-20261020-r1/clinic/engines/schema-engine-linux-musl-openssl-3.0.x');
if(createHash('sha256').update(engine).digest('hex')!=='955e3bff1be23248a0922a219f7c4e200acc8fdd1fc72479557c0a9d782bd64a')throw Error('Prisma engine checksum differs');
await mkdir(join(packet,'engines'),{recursive:true});await writeFile(join(packet,'engines/schema-engine-linux-musl-openssl-3.0.x'),engine,{mode:0o755});
for(const name of ['Dockerfile.api','Dockerfile.web','Dockerfile.gateway','build-clinic.ps1','backup-database.ps1','release-clinic.ps1','initialize.cjs','qualify.cjs','qualify-gateway.cjs','release-gateway.py','protected-rows.sql'])await copyFile(join(root,'deploy/grooming-independent',name),join(packet,name));
const previous={};for(const kind of ['api','web']){const container=pre.containers.find(c=>c.name==='clinic-crm-'+kind);previous[kind]={reference:container.reference,id:container.image};}
const release={releaseId,revision,baseRevision:pre.release.revision,actorId:'7caf9a94-9bb3-4fdf-8289-040a4a4b50c5',previous,
 images:{api:{reference:'temichevvet-crm-api:grooming-independent-'+revision.slice(0,12),id:null},web:{reference:'temichevvet-crm-web:grooming-independent-'+revision.slice(0,12),id:null}},
 configuration:pre.configuration,pendingMigrations:expected,protectedApiFiles:0,
 gateway:{hostName:gateway.hostName,previous:{reference:gateway.reference,id:gateway.image},candidate:{reference:'temichevvet-owner-gateway:grooming-independent-'+revision.slice(0,12)},pendingMigrations:['20261020130000_grooming_storefront']}};
await writeFile(join(packet,'release.json'),JSON.stringify(release,null,2));
await writeFile(join(packet,'web/release.json'),JSON.stringify({releaseId,revision,baseRevision:pre.release.revision,component:'staff-web-with-independent-grooming'}));
const checksums={};
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await scan(path);else if(entry.isFile()){
 const bytes=await readFile(path);checksums[path.slice(packet.length+1)]=createHash('sha256').update(bytes).digest('hex');
 if(/\.(html|js)$/.test(entry.name)){const source=bytes.toString('utf8');for(const bad of ['http://127.0.0.1:4000/api','LocalGrooming2026!','LocalGroomingOnly2026!','PreviewGroomerReady2026!','synthetic-grooming-only','MAX перехвачен'])if(source.includes(bad))throw Error('QA value in release: '+path);}
}}}
await scan(packet);await writeFile(join(out,'packet-checksums.json'),JSON.stringify(checksums,null,2));
console.log(JSON.stringify({packet,revision,pendingMigrations:expected,files:Object.keys(checksums).length,productionWebValuesChecked:true}));
