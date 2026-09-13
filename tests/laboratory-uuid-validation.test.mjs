import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
require('reflect-metadata');
const {ValidationPipe,Module}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
const {CreateHospitalLaboratoryOrderDto: Hospital}=require('../apps/api/dist/modules/laboratory/dto/create-hospital-laboratory-order.dto.js');
const {CreateVisitLaboratoryOrderDto: Visit}=require('../apps/api/dist/modules/visits/dto/create-visit-laboratory-order.dto.js');
const {UpsertLaboratoryProfileDto: Profile}=require('../apps/api/dist/modules/laboratory/dto/upsert-laboratory-profile.dto.js');
const {sourceId}=require('../scripts/import-vetaf-templates.cjs');
const imported='d210012e-8e69-5e3a-ab70-e261a12d4624';
const native='7b8a6101-7b61-4c20-9101-000000000001';
const pipe=()=>new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true});

test('production validation accepts native and imported ids in hospital, visit and profiles', async()=>{
  for(const id of [native,imported,sourceId('test','https://example.test/template/16625')]) {
    for(const [metatype,body] of [[Hospital,{testIds:[id]}],[Hospital,{testId:id}],[Visit,{testIds:[id]}],[Visit,{profileIds:[id]}],[Profile,{title:'Profile',testIds:[id]}]]) {
      const dto=await pipe().transform(body,{type:'body',metatype});
      assert.ok(dto instanceof metatype);
    }
  }
});
test('UUID format, array limits and unknown field protection remain enforced', async()=>{
  for(const value of ['VETAF-16625','Биохимия',123,null,{},'not-a-uuid']) {
    for(const metatype of [Hospital,Visit,Profile]) await assert.rejects(pipe().transform({...(metatype===Profile?{title:'P'}:{}),testIds:[value]},{type:'body',metatype}),e=>e.getStatus()===400);
  }
  for(const body of [{testIds:[]},{testIds:Array(101).fill(imported)},{testIds:imported},{testIds:[imported],unexpected:true}]) await assert.rejects(pipe().transform(body,{type:'body',metatype:Hospital}));
});

test('HTTP POST passes imported ids through real Nest body validation and rejects bad ids before handler',async()=>{
  let handled=0;
  const {LaboratoryController}=require('../apps/api/dist/modules/laboratory/laboratory.controller.js');
  const {LaboratoryService}=require('../apps/api/dist/modules/laboratory/laboratory.service.js');
  const {VisitsController}=require('../apps/api/dist/modules/visits/visits.controller.js');
  const {VisitsService}=require('../apps/api/dist/modules/visits/visits.service.js');
  // Real routes/DTO metadata; only storage and authentication are isolated fixtures.
  const handler=(_id,dto)=>{handled++;return {testIds:dto.testIds};};
  class TestModule {}
  Module({controllers:[LaboratoryController,VisitsController],providers:[
    {provide:LaboratoryService,useValue:{createHospitalOrder:handler}},
    {provide:VisitsService,useValue:{createLaboratoryOrder:handler}},
  ]})(TestModule);
  const app=await NestFactory.create(TestModule,{logger:false});
  app.use((req,_res,next)=>{req.auth={employee:{id:'fixture-doctor'}};next();});
  app.useGlobalPipes(pipe());
  try {
    await app.listen(0,'127.0.0.1');
    const base=await app.getUrl();
    for(const route of ['/v1/laboratory/hospital/fixture-stay/orders','/v1/visits/fixture-visit/laboratory-orders']) {
      const response=await fetch(`${base}${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({testIds:[imported]})});
      assert.equal(response.status,201);assert.deepEqual(await response.json(),{testIds:[imported]});
      const invalid=await fetch(`${base}${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({testIds:['VETAF-16625']})});
      assert.equal(invalid.status,400);
    }
    assert.equal(handled,2);
  } finally {await app.close();}
});
