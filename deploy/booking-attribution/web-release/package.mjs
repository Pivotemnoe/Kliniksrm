import {cpSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const revision='7e4f6b0e946b2266147adcc429eb4ecc50f8ab50';
execFileSync('git',['diff','--exit-code',revision,'--','apps/web']);
const source=resolve('apps/web/dist'),out=resolve(process.argv[2]||'output/booking-source-web-20261022/packet');
if(existsSync(out))throw Error('Preserve the existing immutable packet');
if(!existsSync(join(source,'index.html')))throw Error('Build Web before packaging');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 const path=join(dir,entry.name);
 if(lstatSync(path).isSymbolicLink())throw Error('Symlinks are not a release payload');
 return entry.isDirectory()?walk(path):[path];
});
walk(source);mkdirSync(out,{recursive:true});cpSync(source,join(out,'web'),{recursive:true});
writeFileSync(join(out,'web/release.json'),JSON.stringify({revision,baseRevision:'f795bf214e0bf3cd01d1529e3ea8c07b0788dde3',releaseId:'crm-booking-source-web-20261022-r1'}));
for(const name of ['Dockerfile.web','prepare-web.ps1','release-web.ps1'])cpSync(join('deploy/booking-attribution/web-release',name),join(out,name));
const files=walk(out).map(path=>({name:relative(out,path).split('\\').join('/'),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const manifest={releaseId:'crm-booking-source-web-20261022-r1',revision,baseRevision:revision,sourceWebBase:'64427937a194076f3114b51315aac4725fc79d4c',
 images:{api:{previousId:null},web:{previousId:'sha256:12d225af8448dc1794052bd429c13d1b8733f1b0b7e5f4e5938dcd958960f185',previous:null,candidate:'temichevvet-crm-web:booking-source-7e4f6b0e946b',candidateId:null}},files};
writeFileSync(join(out,'release.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({packet:out,revision,files:files.length,webFiles:files.filter(x=>x.name.startsWith('web/')).length,needsSealedApiAndImageIdentity:true}));
