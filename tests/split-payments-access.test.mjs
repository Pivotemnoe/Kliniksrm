import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { PermissionsGuard } = require('../apps/api/dist/modules/auth/permissions.guard.js');
const { BillingController } = require('../apps/api/dist/modules/billing/billing.controller.js');
const { BillingService } = require('../apps/api/dist/modules/billing/billing.service.js');

test('split payment HTTP route enforces cashier permission and validates both nested payment parts', async () => {
  const calls=[];
  class FixtureModule {}
  Module({controllers:[BillingController],providers:[{provide:BillingService,useValue:{createSplitPayment:(...args)=>{calls.push(args);return [{id:'one'},{id:'two'}];}}}]})(FixtureModule);
  const app=await NestFactory.create(FixtureModule,{logger:false});
  app.use((req,_res,next)=>{req.auth={employee:{id:'synthetic-actor',roles:[],permissions:req.headers['x-fixture-role']==='cashier'?['payments.manage']:['billing.read']}};next();});
  app.useGlobalGuards(new PermissionsGuard(new Reflector()));
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  try {
    await app.listen(0,'127.0.0.1');const base=await app.getUrl(),billId=randomUUID();
    const dto={operationId:randomUUID(),parts:[{paymentMethodId:randomUUID(),cashboxId:randomUUID(),amount:30.01},{paymentMethodId:randomUUID(),cashboxId:randomUUID(),amount:69.99}]};
    const request=(body,role='cashier',id=billId)=>fetch(base+'/v1/bills/'+id+'/payments/split',{method:'POST',headers:{'content-type':'application/json','x-fixture-role':role},body:JSON.stringify(body)});
    assert.equal((await request(dto,'reader')).status,403);assert.equal(calls.length,0);
    assert.equal((await request(dto)).status,201);assert.equal(calls.length,1);assert.equal(calls[0][0],billId);assert.equal(calls[0][2],'synthetic-actor');
    const invalid=[{...dto,operationId:'bad'},{...dto,parts:[]},{...dto,parts:[dto.parts[0]]},{...dto,parts:[...dto.parts,dto.parts[0]]},{...dto,parts:[{...dto.parts[0],amount:0},dto.parts[1]]},{...dto,parts:[{...dto.parts[0],amount:-1},dto.parts[1]]},{...dto,parts:[{...dto.parts[0],amount:0.001},dto.parts[1]]},{...dto,parts:[{...dto.parts[0],amount:1000000000},dto.parts[1]]},{...dto,parts:[{...dto.parts[0],cashboxId:'bad'},dto.parts[1]]},{...dto,parts:[{...dto.parts[0],type:'CASH'},dto.parts[1]]},{...dto,paidAt:'bad'},{...dto,unexpected:true}];
    for(const body of invalid)assert.equal((await request(body)).status,400);
    assert.equal((await request(dto,'cashier','not-a-uuid')).status,400);assert.equal(calls.length,1);
  } finally {await app.close();}
});
