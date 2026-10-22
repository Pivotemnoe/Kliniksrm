import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {PrismaClient} from '@prisma/client';
import {BusinessService} from '../apps/api/dist/modules/business/business.service.js';
import {BillingService} from '../apps/api/dist/modules/billing/billing.service.js';
import {FinanceService} from '../apps/api/dist/modules/finance/finance.service.js';
import {AuditService} from '../apps/api/dist/modules/audit/audit.service.js';
import {SchedulingService} from '../apps/api/dist/modules/scheduling/scheduling.service.js';
const url=process.env.NIGHT_REPORTS_TEST_DATABASE_URL;
test('split payments reconcile and belong to the cashbox office only', {skip:!url}, async()=>{
const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.port,'15488');assert.match(parsed.pathname,/^\/night_reports_qa_\d+$/);
const db=new PrismaClient({datasources:{db:{url}}});
try{
const audit=new AuditService(db), business=new BusinessService(db,audit), billing=new BillingService(db,audit,new SchedulingService(db,audit),new FinanceService(db,audit));
const org=await db.organization.create({data:{displayName:'Synthetic finance QA'}});
const a=await db.clinicOffice.create({data:{organizationId:org.id,name:'QA A'}}),b=await db.clinicOffice.create({data:{organizationId:org.id,name:'QA B'}});
const owner=await db.owner.create({data:{fullName:'Synthetic QA',officeId:a.id}}),employee=await db.employee.create({data:{fullName:'Synthetic cashier'}});
const cashbox=await db.cashbox.create({data:{officeId:b.id,title:'QA cashbox'}});
const cash=await db.paymentMethod.upsert({where:{title:'QA cash'},create:{title:'QA cash',type:'CASH'},update:{}}),card=await db.paymentMethod.upsert({where:{title:'QA card'},create:{title:'QA card',type:'CARD'},update:{}});
const bill=await db.bill.create({data:{ownerId:owner.id,source:'MANUAL',totalAmount:1000,items:{create:{title:'Synthetic service',quantity:1,unitPrice:1000,totalAmount:1000}}}});
const pay=async(method,amount)=>billing.createPayment(bill.id,{type:method.type,paymentMethodId:method.id,cashboxId:cashbox.id,amount},employee.id);
await pay(cash,400);assert.equal((await db.bill.findUnique({where:{id:bill.id}})).status,'PARTIAL');
await pay(card,600);let paid=await db.bill.findUnique({where:{id:bill.id}});assert.equal(paid.status,'PAID');assert.equal(Number(paid.paidAmount),1000);
await assert.rejects(()=>pay(cash,1));console.log('PASS split cash 400 + card 600, partial/paid status, overpayment rejection');
const day=new Date().toISOString().slice(0,10),actor={id:employee.id,permissions:['*'],roles:['director']};
const closeB=await business.prepareDailyClose({officeId:b.id,businessDate:day},actor);assert.equal(Number(closeB.expectedAmount),1000);assert.equal(closeB.lines.length,2);console.log('PASS daily close preserves two payment methods');
const closeA=await business.prepareDailyClose({officeId:a.id,businessDate:day},actor);assert.equal(Number(closeA.expectedAmount),0,'Payment in office B must not also count in owner home office A');console.log('PASS no duplicate revenue across offices');
// Legacy records have no office-bearing cashbox and retain owner-office attribution.
const unassigned=await db.cashbox.create({data:{title:'QA unassigned'}});
const legacyBill=await db.bill.create({data:{ownerId:owner.id,source:'MANUAL',totalAmount:30}});
await db.payment.createMany({data:[{billId:legacyBill.id,employeeId:employee.id,type:'CASH',amount:10},{billId:legacyBill.id,employeeId:employee.id,type:'CASH',amount:20,cashboxId:unassigned.id}]});
const legacyA=await business.prepareDailyClose({officeId:a.id,businessDate:day},actor);assert.equal(Number(legacyA.expectedAmount),30);
const unchangedB=await business.prepareDailyClose({officeId:b.id,businessDate:day},actor);assert.equal(Number(unchangedB.expectedAmount),1000);
console.log('PASS legacy null/unassigned cashbox uses owner office only');
const balanced=await business.prepareDailyClose({officeId:b.id,businessDate:day,lines:closeB.lines.map(x=>({lineKey:x.lineKey,actualAmount:Number(x.systemAmount)}))},actor);assert.equal(Number(balanced.difference),0);
await business.submitDailyClose(balanced.id,employee.id);await business.approveDailyClose(balanced.id,employee.id);console.log('PASS balanced close submit and approve');
}finally{await db.$disconnect()}

});
