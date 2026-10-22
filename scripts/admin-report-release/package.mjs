import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync} from 'node:fs';import {resolve,relative,join} from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=resolve('outputs/admin-report-release/packet');mkdirSync(out,{recursive:true});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const name of readdirSync('scripts/admin-report-release'))if(name!=='package.mjs')cpSync(join('scripts/admin-report-release',name),join(out,name));
for(const mod of ['business/business.service','dashboard/dashboard.service','reports/reports.controller'])for(const suffix of ['.js','.js.map','.d.ts']){const target=join(out,'api',mod+suffix);mkdirSync(resolve(target,'..'),{recursive:true});cpSync('apps/api/dist/modules/'+mod+suffix,target);}
cpSync('apps/web/dist',join(out,'web'),{recursive:true});writeFileSync(join(out,'web/release.json'),JSON.stringify({revision,baseRevision:'05c8ad41421f5590a3b272649cc8a2a4dbee72b2'}));
const avito=JSON.parse(readFileSync('/Users/konstantin/Documents/CRM/output/deployments/crm-avito-system-events-20261022-r1/packet/release.json'));
const receipt=JSON.parse(readFileSync('/Users/konstantin/Documents/CRM/output/deployments/crm-avito-system-events-20261022-r1/runtime-verification-private.json'));
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const files=walk(out).filter(p=>!p.endsWith('/manifest.json')).map(p=>({name:relative(out,p),sha256:createHash('sha256').update(readFileSync(p)).digest('hex')}));
const manifest={releaseId:'crm-admin-reports-20261022-r1',revision,sourceBase:'05c8ad41421f5590a3b272649cc8a2a4dbee72b2',previousApi:'sha256:45641d7c24b61e52ad539face76abd7704953b015986441665a8b1fd9a317827',previousWeb:'sha256:142f0979b04417adec8c4cff1f6d9eebdcefa57ded0a7927fb2bd25f8851d1ba',candidateApi:'temichevvet-crm-api:admin-reports-'+revision.slice(0,12),candidateWeb:'temichevvet-crm-web:admin-reports-'+revision.slice(0,12),settingsSha256:receipt.settingsSha256,avitoFiles:avito.compiled,files};
if(!manifest.settingsSha256)throw Error('Missing verified settings hash');writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({packet:out,revision,files:files.length}));
