// The release runner keeps both snapshots in its ACL-protected backup directory.
require('/app/node_modules/reflect-metadata');
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const fs=require('node:fs'),{createHash}=require('node:crypto');
const manifest=require('/tmp/grooming-wash-release.json'),mode=process.argv[2]||'plan',db=new PrismaClient();
const keys=new Set(manifest.retiredCatalogKeys),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plain=x=>JSON.parse(JSON.stringify(x)),snapshotPath='/tmp/grooming-wash-before.json',reportPath='/tmp/grooming-wash-applied.json';
const receiptId='grooming:policy-release:'+manifest.releaseId;
async function identity(tx){
  const integration=await tx.avitoIntegration.findFirstOrThrow({include:{installation:true}});
  if(integration.accountId!=='367079428')throw Error('Unexpected clinic account');
  const installation=await tx.clinicModuleInstallation.findUniqueOrThrow({where:{organizationId_moduleKey:{organizationId:integration.installation.organizationId,moduleKey:'GROOMING'}}});
  const actors=await tx.employee.findMany({where:{fullName:'Темичев Константин Валерьевич',status:'ACTIVE',roles:{some:{role:{code:'director'}}}},select:{id:true}});
  if(actors.length!==1)throw Error('Director identity is ambiguous');
  return{installation,actor:{...actors[0],roles:['director'],permissions:['grooming.manage']}};
}
async function capture(tx,installationId){
  const where={installationId},orderBy={id:'asc'};
  const services=await tx.groomingService.findMany({where,orderBy}),rules=await tx.groomingServiceRule.findMany({where,orderBy});
  const protectedState={
    bookings:await tx.groomingReservation.findMany({where,orderBy}),
    settings:await tx.groomingSettings.findMany({where,orderBy:{installationId:'asc'}}),
    specialists:await tx.groomingSpecialist.findMany({where,orderBy}),
    shifts:await tx.groomingWorkPeriod.findMany({where:{specialist:{installationId}},orderBy}),
    locations:await tx.groomingLocation.findMany({where,orderBy}),
    workplaces:await tx.groomingWorkplace.findMany({where:{location:{installationId}},orderBy}),
  };
  return plain({installationId,services,rules,protectedHash:hash(protectedState),bookingCount:protectedState.bookings.length});
}
function verify(before,after){
  if(before.protectedHash!==after.protectedHash||before.services.length!==after.services.length||before.rules.length!==after.rules.length)throw Error('Unrelated grooming data changed');
  const retiredIds=new Set(before.services.filter(s=>keys.has(s.catalogKey)).map(s=>s.id));
  for(const field of ['services','rules'])for(const old of before[field]){
    const current=after[field].find(row=>row.id===old.id),retired=(field==='services'?keys.has(old.catalogKey):retiredIds.has(old.serviceId))&&old.isActive;
    if(!current)throw Error('History row was removed');
    if(retired){const expected={...old,isActive:false,version:old.version+1,updatedAt:current.updatedAt};if(hash(expected)!==hash(current))throw Error('Retirement changed more than status and version');}
    else if(hash(old)!==hash(current))throw Error('Unrelated price or rule was modified');
  }
}
(async()=>{
  if(!['plan','apply','verify'].includes(mode)||manifest.retiredCatalogKeys.length!==46)throw Error('Unqualified policy');
  if(![manifest.previous.revision,manifest.revision].includes(process.env.TEMICHEVVET_GIT_COMMIT))throw Error('Unexpected API revision');
  if(mode==='plan'){
    const plan=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const{installation}=await identity(tx),before=await capture(tx,installation.id);return{releaseId:manifest.releaseId,before,baselineHash:hash(before)}});
    fs.writeFileSync(snapshotPath,JSON.stringify(plan),{mode:0o600});
    console.log(JSON.stringify({mode,baselineHash:plan.baselineHash,existingServices:plan.before.services.length,activeRetiredServices:plan.before.services.filter(s=>s.isActive&&keys.has(s.catalogKey)).length,bookingsPreserved:plan.before.bookingCount,productionDatabaseWrites:0}));return;
  }
  if(mode==='apply'&&(!process.argv.includes('--execute')||process.env.TEMICHEVVET_GIT_COMMIT!==manifest.revision))throw Error('Explicit execution on the candidate API required');
  const plan=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));if(plan.releaseId!==manifest.releaseId||hash(plan.before)!==plan.baselineHash)throw Error('Snapshot identity differs');
  const report=await db.$transaction(async tx=>{
    if(mode==='verify')await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');else await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(20261019,2)');
    const{installation,actor}=await identity(tx),current=await capture(tx,installation.id),prior=await tx.groomingCommandReceipt.findUnique({where:{id:receiptId}});
    if(prior){if(prior.fingerprint!==plan.baselineHash||hash(current)!==prior.result.afterHash)throw Error('Preserve later catalog changes; requalify before proceeding');return prior.result;}
    if(mode==='verify')throw Error('Policy has not been applied');
    if(hash(current)!==plan.baselineHash)throw Error('Catalog changed after snapshot');
    const {groomingPriceEntries,groomingRetiredCatalogKeys}=require('/app/apps/api/dist/modules/grooming/price-catalog.js');
    if(hash([...groomingRetiredCatalogKeys].sort())!==hash([...keys].sort())||groomingPriceEntries().some(e=>!current.services.some(s=>s.catalogKey===e.catalogKey)))throw Error('This release only retires existing services');
    const {GroomingCrmService}=require('/app/apps/api/dist/modules/grooming/grooming.service.js'),{AuditService}=require('/app/apps/api/dist/modules/audit/audit.service.js');
    const scoped=new Proxy(tx,{get(target,key){return key==='$transaction'?async fn=>fn(tx):Reflect.get(target,key);}});
    const service=new GroomingCrmService(scoped,{installation:async key=>{if(key!=='GROOMING')throw Error('Unexpected module');return installation;}},new AuditService(scoped));
    const result=await service.importPrices({clientKey:manifest.releaseId},actor),after=await capture(tx,installation.id);verify(current,after);
    if(result.created!==0)throw Error('Unexpected service creation');
    const saved={releaseId:manifest.releaseId,at:new Date().toISOString(),before:current,after,afterHash:hash(after),result,historyPreserved:true,otherPricesPreserved:true};
    await tx.groomingCommandReceipt.create({data:{id:receiptId,fingerprint:plan.baselineHash,result:plain(saved)}});return saved;
  },{timeout:30000});
  fs.writeFileSync(reportPath,JSON.stringify(report),{mode:0o600});
  console.log(JSON.stringify({mode,releaseId:report.releaseId,...report.result,historyPreserved:true,otherPricesPreserved:true,bookingCount:report.after.bookingCount,afterHash:report.afterHash}));
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.$disconnect());
