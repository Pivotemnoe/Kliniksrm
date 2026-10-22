// Rebind tested clinical bytes after an upstream metadata/Prisma-format-only qualification.
import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root=process.cwd(),packet=path.resolve(process.argv[2]),qa=path.resolve(process.argv[3]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=await fs.readFile(packet+'/source-manifest.json'),source=JSON.parse(sourceBytes),tested=JSON.parse(await fs.readFile(qa+'/receipt.json','utf8'));
assert.equal(tested.passed,true);assert.equal(tested.actualPayload,true);
for(const [mode,dir,key]of[['forward','api','clinicalForwardFiles'],['compat','rollback-api','clinicalCompatFiles']]){
 const files={};async function walk(d){for(const e of await fs.readdir(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())await walk(p);else if(e.isFile())files[p.slice((packet+'/'+dir).length+1)]=sha(await fs.readFile(p));else throw Error('Symlink in upstream payload');}}
 await walk(packet+'/'+dir);assert.deepEqual(files,tested[key],mode+' compiled payload changed after actual QA');
}
const raw=execFileSync('git',['show',source.sourceRevision+':prisma/schema.prisma']);
assert.equal(sha(raw),tested.clinicalSchemaSha256,'Tested raw source schema was not the qualified source');
const folder=path.join(path.dirname(qa),'dependency-schema');await fs.mkdir(folder,{recursive:true});const old=folder+'/tested-schema.prisma';await fs.writeFile(old,raw);
const version=JSON.parse(await fs.readFile(root+'/node_modules/prisma/package.json','utf8')).version;assert.equal(version,'6.19.3');
const log=execFileSync('node',[root+'/node_modules/prisma/build/index.js','format','--schema',old],{encoding:'utf8'});await fs.writeFile(folder+'/format.log',log);
const formatted=await fs.readFile(old),qualified=await fs.readFile(packet+'/schema.prisma');assert.equal(sha(formatted),sha(qualified),'Qualified schema changed beyond pinned official formatting');
assert.equal(sha(qualified),source.schemaProof.formattedCandidateSha256);
const binding={checkedAt:new Date().toISOString(),passed:true,testedManifestSha256:tested.clinicalSourceManifestSha256,qualifiedManifestSha256:sha(sourceBytes),forwardCompiledBytesUnchanged:true,compatCompiledBytesUnchanged:true,forwardFiles:Object.keys(tested.clinicalForwardFiles).length,compatFiles:Object.keys(tested.clinicalCompatFiles).length,testedRawSchemaSha256:sha(raw),qualifiedFormattedSchemaSha256:sha(qualified),schemaFormattingOnly:true,prismaVersion:version,sourceRevision:source.sourceRevision,rollbackSourceRevision:source.rollback.sourceRevision,forwardReference:source.candidate.reference,compatReference:source.rollback.reference,requiredRootAcceptance:'Exact built forward/compat image IDs, unchanged payload/generated client, compatible clinical replay and rollback acceptance must be recorded in the external root review before any host mutation. No API Apply is performed here.'};
if(process.argv[4]){
 const bytes=await fs.readFile(path.resolve(process.argv[4])),images=JSON.parse(bytes);
 assert.equal(images.status,'IMAGES_PREPARED');assert.equal(images.metadataStamped,true);assert.equal(images.runtimeUnchanged,true);assert.equal(images.productionChanged,false);assert.equal(images.sourceManifestSha256,binding.qualifiedManifestSha256);
 for(const [mode,key,revision,count,unit]of[['candidate','forward',source.sourceRevision,36,75],['rollback','compat',source.rollback.sourceRevision,21,52]]){
  const image=images.images.find(v=>v.mode===mode);assert(image);assert.match(image.image,/^sha256:[0-9a-f]{64}$/);assert.equal(image.revision,revision);assert.equal(image.filesystemIdentical,true);
  assert.equal(image.qualification.status,'PASS');assert.equal(image.qualification.overlayFiles,count);assert.equal(image.qualification.sourceRevision,revision);assert.equal(image.qualification.schemaSha256,binding.qualifiedFormattedSchemaSha256);assert.equal(image.qualification.prismaVersion.client,'6.19.3');assert(image.qualification.unitPass>=unit);assert.equal(image.qualification.productionChanged,false);
  binding[key+'PreparedSourceReference']=binding[key+'Reference'];binding[key+'Reference']=image.reference;binding[key+'ImageId']=image.image;
 }
 binding.imageIdentificationSha256=sha(bytes);binding.imageQualificationPrepared=true;
 await fs.writeFile(qa+'/clinical-images-identified.json',bytes);
}
await fs.writeFile(qa+'/clinical-dependency-binding.json',JSON.stringify(binding,null,2)+'\n');await fs.writeFile(qa+'/clinical-qualified-source-manifest.json',sourceBytes);console.log(binding);
