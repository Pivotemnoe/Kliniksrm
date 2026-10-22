import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const root=process.cwd(),deploy=join(root,'deploy/grooming-owner-contact');
const baseline=JSON.parse(await readFile(resolve(process.argv[2]),'utf8'));
const destination=resolve(process.argv[3]);
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw Error('Commit the immutable payload first');
if(baseline.hostName!=='msk-1-vm-d817')throw Error('Wrong target');
const reviewed=JSON.parse(await readFile(join(deploy,'payload/sha256.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files={};
for(const name of ['grooming.html','grooming.js']){
 const before=await readFile(join(deploy,'payload/before',name)),candidate=await readFile(join(deploy,'payload/candidate',name));
 if(hash(before)!==baseline.files[name]||hash(before)!==reviewed[name].before||hash(candidate)!==reviewed[name].candidate)throw Error('Source or target drift: '+name);
 files[name]={path:'/app/apps/owner-gateway/dist/public/'+name,previousHash:hash(before),candidateHash:hash(candidate)};
}
await mkdir(dirname(destination),{recursive:true});await mkdir(destination);
for(const folder of ['candidate','rollback'])await mkdir(join(destination,folder));
for(const name of Object.keys(files)){
 await copyFile(join(deploy,'payload/before',name),join(destination,'rollback',name));
 await copyFile(join(deploy,'payload/candidate',name),join(destination,'candidate',name));
}
for(const name of ['Dockerfile.gateway','release-owner-static.py'])await copyFile(join(deploy,name),join(destination,name));
const manifest={releaseId:'grooming-owner-contact-20261022-r1',revision,component:'closed-grooming-owner-contact',hostName:baseline.hostName,
 previous:{id:baseline.previous.id,reference:baseline.previous.reference},candidate:{reference:'temichevvet-owner-gateway:grooming-owner-contact-'+revision.slice(0,12)},
 files,configuration:baseline.configuration,protectedBaseline:{services:baseline.protected,static:baseline.static,nginx:baseline.nginx},
 databaseMigrations:false,maxConfigurationChanges:false,rollbackCommand:'python3 release-owner-static.py rollback'};
await writeFile(join(destination,'release.json'),JSON.stringify(manifest,null,2)+'\n');
const checksums={};
for(const name of ['Dockerfile.gateway','release-owner-static.py','release.json',...Object.keys(files).flatMap(n=>['candidate/'+n,'rollback/'+n])])checksums[name]=hash(await readFile(join(destination,name)));
await writeFile(join(destination,'checksums.json'),JSON.stringify(checksums,null,2)+'\n');
console.log(JSON.stringify({destination,revision,candidate:manifest.candidate.reference,files}));
