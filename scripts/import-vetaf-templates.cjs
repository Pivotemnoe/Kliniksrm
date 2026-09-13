/* Additive import. Dry-run by default. Private exports and mappings must not be committed.
 * node scripts/import-vetaf-templates.cjs prepared.json original.json mapping.json [--apply]
 * CRM_APP_ROOT=/app in the API container. Requires a verified database backup before --apply.
 */
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
function sourceId(kind, url) {
  const h=hash(`temichevvet:vetaf:${kind}:${url}`);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function prepareEntries(bundle, original, mapping, normalize, extract) {
  if(bundle.schemaVersion!==1 || !Array.isArray(bundle.documents) || !bundle.documents.length) throw Error('Invalid package');
  const ids=new Set(); const originals=new Map(original.templates.map(d=>[String(d.id),d]));
  if(originals.size!==original.templates.length || originals.size!==bundle.documents.length) throw Error('Original/package count mismatch');
  const entries=bundle.documents.map(d=>{
    if(ids.has(String(d.sourceId))) throw Error('Duplicate source'); ids.add(String(d.sourceId));
    const src=originals.get(String(d.sourceId));
    if(!src || src.url!==d.sourceUrl || hash(src.html)!==d.sourceSha256) throw Error(`Source mismatch: ${d.sourceId}`);
    const layout=normalize(d.layout); if(!layout?.blocks.length) throw Error(`Empty layout: ${d.sourceId}`);
    const laboratory=d.kind==='laboratory'; const link=mapping.links[String(d.sourceId)];
    if(laboratory && !Object.hasOwn(mapping.links,String(d.sourceId))) throw Error(`Explicit mapping required: ${d.sourceId}`);
    const indicators=laboratory?extract(layout).indicators:[];
    if(laboratory&&!indicators.length) throw Error(`No indicators: ${d.sourceId}`);
    if(link&&(!link.serviceId||!link.expectedTitle)) throw Error('Mapping requires service id and exact title');
    return {id:sourceId('document',d.sourceUrl),testId:sourceId('test',d.sourceUrl),source:d,layout,link,laboratory,
      categoryTitle:laboratory?'VetAF · лабораторные бланки':`VetAF · архив · ${d.categoryTitle.replace(' — архив переноса','')}`,
      title:`${d.title} [VetAF]`, indicators:indicators.length,
      provenance:{source:'VetAF',sourceId:String(d.sourceId),sourceUrl:d.sourceUrl,sourceSha256:d.sourceSha256,
        packageSha256:hash(JSON.stringify(d)),originalHtml:src.html,importedAt:mapping.importedAt,
        reviewRequired:true,automaticApplication:false},
    };
  });
  if(Object.keys(mapping.links).some(id=>!entries.some(e=>e.laboratory&&String(e.source.sourceId)===id))) throw Error('Unknown mapping source');
  return entries;
}
async function importTemplates(p, entries, actorId, apply=false) {
  return p.$transaction(async tx=>{
    // Serialize this importer only; never locks the clinical tables.
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(73620193)");
    const actor=await tx.employee.findUnique({where:{id:actorId},select:{id:true,fullName:true}});
    if(!actor) throw Error('Import actor not found');
    const plan=[];
    // Complete preflight before any writes.
    for(const e of entries) {
      const existing=await tx.documentTemplate.findUnique({where:{id:e.id},include:{versions:{where:{version:1}}}});
      if(existing&&(existing.variables?.vetafImport?.packageSha256!==e.provenance.packageSha256 || existing.versions.length!==1)) throw Error(`Import conflict: ${e.source.sourceId}`);
      const test=e.laboratory?await tx.laboratoryTest.findUnique({where:{id:e.testId}}):null;
      if(test&&(!existing||test.documentTemplateId!==e.id)) throw Error(`Test conflict: ${e.source.sourceId}`);
      if(e.link) {
        const service=await tx.service.findUnique({where:{id:e.link.serviceId}});
        if(!service?.isActive||service.title!==e.link.expectedTitle) throw Error(`Service changed: ${e.source.sourceId}`);
      }
      plan.push({entry:e,createDocument:!existing,createTest:e.laboratory&&!test});
    }
    if(apply) for(const {entry:e,createDocument,createTest} of plan) {
      if(createDocument) {
        const category=await tx.documentTemplateCategory.upsert({where:{title:e.categoryTitle},update:{},create:{title:e.categoryTitle}});
        const data={title:e.title,body:e.source.body,layout:e.layout,requiresSignature:false,variables:{vetafImport:e.provenance}};
        await tx.documentTemplate.create({data:{id:e.id,categoryId:category.id,...data}});
        await tx.documentTemplateVersion.create({data:{templateId:e.id,version:1,categoryTitle:e.categoryTitle,...data,createdById:actor.id,createdByName:actor.fullName}});
      }
      if(createTest) await tx.laboratoryTest.create({data:{id:e.testId,title:e.title,code:`VETAF-${e.source.sourceId}`,
        documentTemplateId:e.id,serviceId:e.link?.serviceId??null,isActive:Boolean(e.link),groupName:'Бланки VetAF',species:[],
        description:'Перенесено из VetAF без изменения клинических значений. Нормы и единицы требуют проверки врачом по анализатору; отсутствующие нормы не дополнены.'}});
    }
    const result=plan.map(({entry:e,createDocument,createTest})=>({sourceId:e.source.sourceId,title:e.title,documentId:e.id,createDocument,createTest,linkedService:e.link?.expectedTitle??null,indicators:e.indicators}));
    if(apply&&plan.some(e=>e.createDocument||e.createTest)) await tx.auditLog.create({data:{actorId:actor.id,action:'vetaf.templates.import',entityType:'DocumentTemplate',metadata:{additive:true,templates:result,clinicalRecordsChanged:false}}});
    return {apply,documentsToCreate:plan.filter(e=>e.createDocument).length,testsToCreate:plan.filter(e=>e.createTest).length,items:result};
  },{timeout:60000});
}
module.exports={prepareEntries,importTemplates,sourceId};
if(require.main===module) {
  const [preparedPath,originalPath,mappingPath,mode]=process.argv.slice(2);
  if(!preparedPath||!originalPath||!mappingPath||(mode&&mode!=='--apply')) throw Error('Expected prepared.json original.json mapping.json [--apply]');
  const root=process.env.CRM_APP_ROOT||path.resolve(__dirname,'..');
  const {PrismaClient}=require(path.join(root,'node_modules/@prisma/client'));
  const {normalizeDocumentLayout}=require(path.join(root,'apps/api/dist/modules/documents/document-layout.js'));
  const {extractLaboratoryDocumentIndicators}=require(path.join(root,'apps/api/dist/modules/laboratory/laboratory-document-form.js'));
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));const mapping=read(mappingPath);
  const entries=prepareEntries(read(preparedPath),read(originalPath),mapping,normalizeDocumentLayout,extractLaboratoryDocumentIndicators);
  const p=new PrismaClient();
  importTemplates(p,entries,mapping.actorId,mode==='--apply').then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
}
