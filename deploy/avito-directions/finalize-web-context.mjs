import{readFile,writeFile}from'node:fs/promises';import{execFileSync}from'node:child_process';
const out='output/deployments/crm-avito-directions-20261021-r1',revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const pre=JSON.parse(await readFile(out+'/web-preflight.json','utf8')),prepared=JSON.parse(await readFile(out+'/api-packet/release.json','utf8'));
const api=pre.containers.find(x=>x.name==='clinic-crm-api'),web=pre.containers.find(x=>x.name==='clinic-crm-web');
if(api.reference!==prepared.candidate.reference||!prepared.candidate.id||api.image!==prepared.candidate.id||web.image!=='sha256:fd18a8e9b93e209fd0c83f006ab1364dbd6ce0a7aec8b7d4f823be6fb92dad92')throw Error('API acceptance or Web baseline differs');
const manifest={releaseId:'crm-avito-directions-20261021-r1-web',revision,baseRevision:revision,previousWebRevision:'1a14f1ea03db073e0676077d91c2c2a817afb466',configuration:pre.configuration,images:{api:{previous:api.reference,previousId:api.image},web:{previous:web.reference,previousId:web.image,candidate:'temichevvet-crm-web:avito-directions-'+revision.slice(0,12),candidateId:null}}};
await writeFile(out+'/web-packet/release.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({releaseId:manifest.releaseId,revision,api:api.reference,web:manifest.images.web.candidate}));
