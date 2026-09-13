import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {prepareEntries,importTemplates}=require('../scripts/import-vetaf-templates.cjs');
const {normalizeDocumentLayout}=require('../apps/api/dist/modules/documents/document-layout.js');
const {extractLaboratoryDocumentIndicators}=require('../apps/api/dist/modules/laboratory/laboratory-document-form.js');
function prepared() {
  const html='<p>source</p>',url='https://source.example/templates/1';
  const original={templates:[{id:'1',url,html}]};
  const document={sourceId:'1',sourceUrl:url,sourceSha256:createHash('sha256').update(html).digest('hex'),title:'Test',kind:'laboratory',body:'source',layout:{schemaVersion:1,blocks:[{id:'t',type:'table',headerRows:1,rows:[['Показатель','Результат','Нормы'],['A','','1–2']]}]}};
  const bundle={schemaVersion:1,documents:[document]},mapping={links:{'1':{serviceId:'s',expectedTitle:'Service'}}};
  return {bundle,original,mapping,entries:()=>prepareEntries(bundle,original,mapping,normalizeDocumentLayout,extractLaboratoryDocumentIndicators)};
}
function database() {
  const documents=new Map(),tests=new Map(),versions=[],writes=[];
  const tx={
    $executeRawUnsafe:async()=>{},employee:{findUnique:async()=>({id:'actor',fullName:'Actor'})},
    service:{findUnique:async()=>({id:'s',title:'Service',isActive:true})},
    documentTemplate:{findUnique:async({where})=>documents.has(where.id)?{...documents.get(where.id),versions:versions.filter(v=>v.templateId===where.id)}:null,create:async({data})=>{writes.push('document');documents.set(data.id,data)}},
    documentTemplateCategory:{upsert:async()=>({id:'category'})},
    documentTemplateVersion:{create:async({data})=>versions.push(data)},
    laboratoryTest:{findUnique:async({where})=>tests.get(where.id),create:async({data})=>{writes.push('test');tests.set(data.id,data)}},
    auditLog:{create:async()=>writes.push('audit')},
  };
  return {p:{$transaction:async fn=>fn(tx)},tx,documents,tests,versions,writes};
}
test('dry-run does not write; apply is additive and a repeat is a no-op',async()=>{
  const f=prepared(),db=database(),entries=f.entries();
  assert.equal((await importTemplates(db.p,entries,'actor')).documentsToCreate,1);assert.deepEqual(db.writes,[]);
  await importTemplates(db.p,entries,'actor',true);assert.deepEqual(db.writes,['document','test','audit']);
  assert.equal(db.documents.values().next().value.variables.vetafImport.originalHtml,'<p>source</p>');
  assert.equal((await importTemplates(db.p,entries,'actor',true)).documentsToCreate,0);
  assert.equal(db.writes.length,3);assert.equal(db.versions.length,1);
});
test('changed service, source hash, duplicate package or absent mapping fail closed',async()=>{
  const f=prepared(),db=database();db.tx.service.findUnique=async()=>({title:'Different',isActive:true});
  await assert.rejects(importTemplates(db.p,f.entries(),'actor',true),/Service changed/);assert.deepEqual(db.writes,[]);
  f.original.templates[0].html='changed';assert.throws(f.entries,/Source mismatch/);
  const g=prepared();g.bundle.documents.push(g.bundle.documents[0]);assert.throws(g.entries,/count mismatch/);
  const h=prepared();h.mapping.links={};assert.throws(h.entries,/mapping required/);
});
test('unmapped lab is retained inactive; existing edited records are never overwritten',async()=>{
  const f=prepared(),db=database();f.mapping.links['1']=null;const entries=f.entries();
  await importTemplates(db.p,entries,'actor',true);assert.equal(db.tests.values().next().value.isActive,false);
  db.documents.get(entries[0].id).title='Edited by clinic';
  await importTemplates(db.p,entries,'actor',true);assert.equal(db.documents.get(entries[0].id).title,'Edited by clinic');
  db.documents.get(entries[0].id).variables={};
  await assert.rejects(importTemplates(db.p,entries,'actor',true),/Import conflict/);
});
