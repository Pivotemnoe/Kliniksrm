// Local build recipe; run only in the dedicated source worktree. Always restores temporary source edits.
import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),out=path.resolve(process.argv[2]),gw=path.join(root,'apps/owner-gateway'),proto='prototypes/temichevvet-grooming-fitting-20261015';
execFileSync('git',['diff','--exit-code','f88aba9451bddfb0d3cfe52cdaa31bd48ae31e41','--','apps/owner-gateway/src','prototypes/temichevvet-grooming-fitting-20261015/src','packages/booking-attribution'],{stdio:'pipe'});
execFileSync('npm',['run','build','--workspace','@clinic-crm/owner-gateway'],{cwd:root,stdio:'pipe'});
await fs.cp(gw+'/dist',out+'/compiled-forward',{recursive:true,errorOnExist:true,force:false});
const service=gw+'/src/grooming/grooming-portal.service.ts',source=await fs.readFile(service,'utf8');
const before=execFileSync('git',['show','f88aba9^:apps/owner-gateway/src/grooming/grooming-portal.service.ts'],{encoding:'utf8'});
const start=source.indexOf('  async createDraft('),end=source.indexOf('  async consumeDraft(',start);
const bs=before.indexOf('  async createDraft('),be=before.indexOf('  async consumeDraft(',bs);
assert(start>=0&&end>start&&bs>=0&&be>bs);
try{
 await fs.writeFile(service,source.slice(0,start)+before.slice(bs,be)+source.slice(end));
 execFileSync(root+'/node_modules/.bin/tsc',['-p',gw+'/tsconfig.build.json'],{cwd:gw,stdio:'pipe'});
 await fs.cp(gw+'/dist',out+'/compiled-compat',{recursive:true,errorOnExist:true,force:false});
 await fs.writeFile(out+'/compat-create-draft.source.patch',execFileSync('git',['diff','--',service],{encoding:'utf8'}));
}finally{await fs.writeFile(service,source);}
const staging=out+'/grooming-build-source/'+proto;await fs.mkdir(staging,{recursive:true});
for(const name of ['src','public','index.html','package.json','vite.config.mjs'])await fs.cp(root+'/'+proto+'/'+name,staging+'/'+name,{recursive:true});
for(const p of ['apps/owner-gateway/src/grooming/catalog.ts','apps/api/src/modules/grooming/price-catalog.json']){await fs.mkdir(path.dirname(out+'/grooming-build-source/'+p),{recursive:true});await fs.copyFile(root+'/'+p,out+'/grooming-build-source/'+p);}
await fs.mkdir(out+'/grooming-build-source/packages/booking-attribution',{recursive:true});
await fs.copyFile(root+'/packages/booking-attribution/browser.mjs',out+'/grooming-build-source/packages/booking-attribution/browser.mjs');
await fs.symlink(root+'/'+proto+'/node_modules',staging+'/node_modules','dir');
for(const file of ['src/App.jsx','src/SiteBooking.jsx'])await fs.writeFile(staging+'/'+file,execFileSync('git',['show','90b6c6ff839b951fad27167ffdf15859c1a5923b:'+proto+'/'+file]));
execFileSync(staging+'/node_modules/.bin/vite',['build'],{cwd:staging,stdio:'pipe'});await fs.cp(staging+'/dist/client',out+'/grooming-compiled-baseline',{recursive:true});
for(const file of ['src/App.jsx','src/SiteBooking.jsx'])await fs.copyFile(root+'/'+proto+'/'+file,staging+'/'+file);
execFileSync(staging+'/node_modules/.bin/vite',['build'],{cwd:staging,stdio:'pipe'});await fs.cp(staging+'/dist/client',out+'/grooming-compiled-forward',{recursive:true});
console.log('Compiled forward and compat gateway modules; built live-source and attribution-only grooming separately.');
