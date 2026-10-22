// Prepare only. No network, Docker mutation, deployment, or active pointer changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

export const SOURCE = 'f88aba9451bddfb0d3cfe52cdaa31bd48ae31e41';
export const BASE_IMAGE = 'sha256:339981be14103cd2ad16d26c71d93d80c058e89b0d3ca2bb5a61ea6f2ecf14fb';
export const CLINIC_JS = '22ab1c61e24d6fb0cc51b15d2002e6b03418a7a7af131d110339fc371d21f80e';
export const MODULES = ['booking-attribution', 'grooming/grooming-portal.dto', 'grooming/grooming-portal.service', 'pet-hotel/pet-hotel.dto', 'pet-hotel/pet-hotel.controller', 'pet-hotel/pet-hotel-storefront.service', 'pet-hotel/pet-hotel-portal.service'];
export const COMPAT_MODULES = MODULES.filter(p => !['pet-hotel/pet-hotel.controller', 'pet-hotel/pet-hotel-storefront.service'].includes(p));
const sha = data => createHash('sha256').update(data).digest('hex');
const read = p => fs.readFile(p);
const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const put = async (p, bytes) => {await fs.mkdir(path.dirname(p), {recursive: true}); await fs.writeFile(p, bytes);};
async function manifest(root) {
  const result = {};
  async function walk(dir) {for (const e of (await fs.readdir(dir, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name); if (e.isDirectory()) await walk(p);
    else {assert(e.isFile(), 'No symlinks in payload'); result[path.relative(root, p).split(path.sep).join('/')] = sha(await read(p));}
  }}
  await walk(root); return result;
}
function replaceOnce(text, before, after) {assert.equal(text.split(before).length, 2, 'Expected exactly one reviewed insertion'); return text.replace(before, after);}
function changes(before, after) {return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(p => before[p] !== after[p]);}
const root = process.cwd(), input = path.resolve(process.argv[2]), dest = path.resolve(process.argv[3]);
assert(input && dest && input !== dest);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','Commit the release tooling before preparing an immutable packet');
const b = await json(input+'/baseline/baseline.json');
assert.equal(b.previous.id, BASE_IMAGE); assert.equal(b.hostName, 'msk-1-vm-d817'); assert.equal(b.distribution['clinic-chat.service.js'], CLINIC_JS);
for (const kind of ['grooming', 'pet-hotel']) assert.deepEqual(await manifest(input+'/baseline/'+kind), b.static[kind].files, 'Incomplete live static baseline');
assert.deepEqual(await manifest(input+'/baseline/gateway-dist'), b.distribution);
await fs.mkdir(dest); // Immutable: caller must choose a new path.
const gateway = {before: b.distribution, forward: {...b.distribution}, compat: {...b.distribution}, overlay: {forward: {}, compat: {}}};
for (const mode of ['forward', 'compat']) {
  const prefixes = mode === 'forward' ? MODULES : COMPAT_MODULES;
  for (const prefix of prefixes) for (const ext of ['.js', '.js.map', '.d.ts']) {
    const p = prefix+ext, source = mode === 'compat' && prefix === 'grooming/grooming-portal.service' ? input+'/compiled-compat/' : input+'/compiled-forward/';
    let bytes = await read(source+p);
    // Prisma inference reordered unrelated declaration fields. Keep live declarations
    // whose signatures did not change, and edit only the one new optional argument.
    if(ext==='.d.ts' && b.distribution[p]){
      if(['grooming/grooming-portal.service','pet-hotel/pet-hotel-portal.service','pet-hotel/pet-hotel.controller'].includes(prefix))bytes=await read(input+'/baseline/gateway-dist/'+p);
      if(prefix==='pet-hotel/pet-hotel-storefront.service')bytes=Buffer.from(replaceOnce(await fs.readFile(input+'/baseline/gateway-dist/'+p,'utf8'),'draft(offerToken: string, ip: string):','draft(offerToken: string, ip: string, sourceAttribution?: unknown):'));
    }
    const hash = sha(bytes);
    gateway[mode][p] = hash;
    if (b.distribution[p] !== hash) {await put(dest+'/gateway/'+mode+'/'+p, bytes); gateway.overlay[mode][p] = {before: b.distribution[p] || null, after: hash};}
  }
}
for (const name of ['grooming.js', 'pet-hotel.js']) {
  const p = 'public/'+name, before = await fs.readFile(input+'/baseline/gateway-dist/'+p, 'utf8');
  const prefix = name === 'grooming.js' ? '...(!moving && draft.attribution ? { attribution: draft.attribution } : {}), ' : '...(!moving&&draft.attribution?{attribution:draft.attribution}:{}),';
  const marker = name === 'grooming.js' ? '...(moving ? { reservationId: moving.id, version: moving.version } : {})' : '...(moving?{reservationId:moving.id,version:moving.version}:{})';
  const bytes = Buffer.from(replaceOnce(before, marker, prefix+marker));
  await put(dest+'/gateway/forward/'+p, bytes); gateway.forward[p] = sha(bytes); gateway.overlay.forward[p] = {before: b.distribution[p], after: sha(bytes)};
}
for (const mode of ['forward','compat']) {
  assert.equal(gateway[mode]['clinic-chat.service.js'], CLINIC_JS);
  assert.deepEqual(changes(b.distribution, gateway[mode]), Object.keys(gateway.overlay[mode]).sort());
  const dockerfile = `ARG BASE_GATEWAY_IMAGE=${b.previous.reference}\nFROM \${BASE_GATEWAY_IMAGE}\nARG RELEASE_REVISION\nLABEL org.opencontainers.image.revision=$RELEASE_REVISION\nCOPY ${mode}/ /app/apps/owner-gateway/dist/\n`;
  await put(dest+'/gateway/Dockerfile.'+mode, dockerfile);
}
await put(dest+'/gateway/distribution.json', JSON.stringify(gateway, null, 2)+'\n');
const staticSites = {};
const helper = await read(root+'/packages/booking-attribution/browser.mjs'), helperName = 'booking-attribution-v1-'+sha(helper).slice(0,16)+'.js';
const proto = root+'/prototypes/temichevvet-pet-hotel-20261020/public/pet-hotel/';
for (const kind of ['grooming', 'pet-hotel']) {
  const baseline = b.static[kind].files;
  for (const mode of ['forward','compat']) await fs.cp(input+'/baseline/'+kind, dest+'/static/'+kind+'/'+mode, {recursive:true});
  const forward = dest+'/static/'+kind+'/forward', compat = dest+'/static/'+kind+'/compat';
  const retained = [];
  if (kind === 'grooming') {
    const compiledBase = await manifest(input+'/grooming-compiled-baseline'), compiledNew = await manifest(input+'/grooming-compiled-forward');
    for (const [p,h] of Object.entries(compiledBase)) assert.equal(baseline[p], h, 'Rebuilt approved grooming differs from actual live: '+p);
    const delta = changes(compiledBase, compiledNew), newJs = delta.filter(p => p.endsWith('.js') && compiledNew[p]);
    assert.equal(newJs.length,1); assert.deepEqual(delta.filter(p => p !== 'index.html' && !p.endsWith('.js')),[],'No CSS/image/text asset changes');
    const oldHtml = await fs.readFile(input+'/grooming-compiled-baseline/index.html','utf8'), html = await fs.readFile(input+'/grooming-compiled-forward/index.html','utf8');
    const oldJs = Object.keys(compiledBase).find(p => /assets\/index-.*\.js$/.test(p));
    assert.equal(replaceOnce(oldHtml,'/'+oldJs,'/'+newJs[0]), html, 'HTML change must be one JS URL');
    await put(forward+'/index.html', html);
    for (const p of newJs) {const bytes=await read(input+'/grooming-compiled-forward/'+p); await put(forward+'/'+p,bytes); await put(compat+'/'+p,bytes); retained.push(p);}
  } else {
    for (const p of ['app.js','booking.js']) {
      const approved=execFileSync('git',['show',SOURCE+'^:prototypes/temichevvet-pet-hotel-20261020/public/pet-hotel/'+p]);
      assert.equal(sha(approved),baseline['pet-hotel/'+p],'Hotel before-source differs from the live rate release');
      let bytes=await fs.readFile(proto+p,'utf8'); bytes=bytes.replaceAll("'./booking-attribution.js'", "'./"+helperName+"'");
      await put(forward+'/pet-hotel/'+p,bytes);
    }
    const p='pet-hotel/'+helperName; await put(forward+'/'+p,helper); await put(compat+'/'+p,helper); retained.push(p);
    // No local page/style/rate/503 copy changes may slip into a metadata-only packet.
    for (const p of ['index.html','style.css','rates.js','articles.js']) assert.equal(sha(await read(forward+'/pet-hotel/'+p)),baseline['pet-hotel/'+p]);
  }
  for (const mode of ['forward','compat']) {
    const dir=dest+'/static/'+kind+'/'+mode, releaseFile=kind==='grooming'?'release.json':'pet-hotel/release.json';
    const previous=await json(dir+'/'+releaseFile), fileMap=await manifest(dir); delete fileMap[releaseFile];
    await put(dir+'/'+releaseFile,JSON.stringify({...previous,releaseId:'booking-attribution-'+kind+'-'+(mode==='compat'?'compat-':'')+'20261022-r1',revision:SOURCE,baseRevision:previous.revision,baseRelease:previous.releaseId,feature:'AVITO optional attribution; visual baseline preserved',compatibility:mode==='compat'?'readers retained; new draft source may be dropped':'forward',retainedAssets:retained,files:fileMap},null,2)+'\n');
  }
  staticSites[kind]={target:b.static[kind].target,before:baseline,forward:await manifest(forward),compat:await manifest(compat),retainedAssets:retained};
  staticSites[kind].changed=changes(baseline,staticSites[kind].forward);
  const allowed=kind==='grooming'?['index.html','release.json',...retained]:['pet-hotel/app.js','pet-hotel/booking.js','pet-hotel/release.json',...retained];
  assert.deepEqual(staticSites[kind].changed.sort(),allowed.sort());
  for(const p of retained)assert.equal(staticSites[kind].forward[p],staticSites[kind].compat[p]);
}
const toolingRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const release={schemaVersion:1,releaseId:'booking-attribution-20261022-r1',sourceRevision:SOURCE,toolingRevision,excludedVisualRevision:'114684e51d3766cfca3b56006b3052441d57d851',hostName:b.hostName,previous:b.previous,configuration:b.configuration,runtimeHash:b.runtimeHash,protectedBaseline:b.protected,
  gateway:{previous:b.previous,forwardReference:'temichevvet-owner-gateway:booking-attribution-20261022-r1',compatReference:'temichevvet-owner-gateway:booking-attribution-compat-20261022-r1',distribution:gateway},static:staticSites,
  databaseMigrations:false,staffChanges:false,selfBookingEnablement:false,maxConfigurationChanges:false,visualChanges:false,preparedOnly:true,applyPerformed:false,
  expectedGroomingCatalog:{selfBookingEnabled:false,servicesCount:172,specialistsCount:0},
  rollbackPolicy:'Switch static to compat trees retaining new asset URLs, gateway to compat image retaining tolerant DTOs and identical normalized operation fingerprints. Never restore data or use bare 339 after new clients/drafts/operations.'};
await put(dest+'/release.json',JSON.stringify(release,null,2)+'\n');
for(const p of ['publish.py','README.md'])await fs.copyFile(root+'/deploy/booking-attribution/'+p,dest+'/'+p);
try{await fs.copyFile(input+'/public-health-baseline.json',dest+'/review/public-health-baseline.json');}catch(e){if(e.code!=='ENOENT')throw e;}
const sourceFiles=[...MODULES.map(p=>'apps/owner-gateway/src/'+p+'.ts'),'apps/owner-gateway/public/grooming.js','apps/owner-gateway/public/pet-hotel.js','packages/booking-attribution/browser.mjs','prototypes/temichevvet-grooming-fitting-20261015/src/App.jsx','prototypes/temichevvet-grooming-fitting-20261015/src/SiteBooking.jsx','prototypes/temichevvet-pet-hotel-20261020/public/pet-hotel/app.js','prototypes/temichevvet-pet-hotel-20261020/public/pet-hotel/booking.js'];
await put(dest+'/review/source-f88.patch',execFileSync('git',['diff',SOURCE+'^',SOURCE,'--',...sourceFiles]));
await fs.copyFile(input+'/compat-create-draft.source.patch',dest+'/review/compat-create-draft.source.patch');
for(const mode of ['forward','compat']){
 let diff='';
 for(const p of Object.keys(gateway.overlay[mode]).filter(p=>p.endsWith('.js'))){
  const previous=b.distribution[p]?input+'/baseline/gateway-dist/'+p:'/dev/null',candidate=dest+'/gateway/'+mode+'/'+p;
  try{diff+=execFileSync('diff',['-u','--label','before/'+p,'--label',mode+'/'+p,previous,candidate],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;diff+=String(e.stdout);}
 }
 await put(dest+'/review/gateway-'+mode+'.patch',diff);
}
try{await fs.cp(input+'/qa',dest+'/qa',{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
const maps=await manifest(dest);await put(dest+'/checksums.json',JSON.stringify(maps,null,2)+'\n');
console.log(JSON.stringify({destination:dest,sourceRevision:SOURCE,gatewayChanged:Object.keys(gateway.overlay.forward),gatewayCompatChanged:Object.keys(gateway.overlay.compat),static:Object.fromEntries(Object.entries(staticSites).map(([k,s])=>[k,{changed:s.changed,retained:s.retainedAssets}]))},null,2));
