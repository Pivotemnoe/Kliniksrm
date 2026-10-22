import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BillingService } from '../apps/api/dist/modules/billing/billing.service.js';
import { AuditService } from '../apps/api/dist/modules/audit/audit.service.js';
import { BusinessService } from '../apps/api/dist/modules/business/business.service.js';
import { FinanceService } from '../apps/api/dist/modules/finance/finance.service.js';
const url=process.env.SPLIT_PAYMENTS_TEST_DATABASE_URL;
test('split bill payments are atomic, method-specific, replay-safe and preserve completed visits', {skip:!url}, async t=>{
  const parsed=new URL(url);assert.ok(parsed.hostname==='127.0.0.1'&&parsed.port==='15488'&&/^\/split_payments_qa_\d+$/.test(parsed.pathname));
  const db=new PrismaClient({datasources:{db:{url}}});t.after(()=>db.$disconnect());
  const audit=new AuditService(db),billing=new BillingService(db,audit,{},new FinanceService(db,audit)),business=new BusinessService(db,audit);
  const office=await db.clinicOffice.create({data:{name:'Synthetic split QA',organization:{create:{displayName:'Synthetic split QA'}}}});
  const employee=await db.employee.create({data:{fullName:'Synthetic cashier'}});
  const owner=await db.owner.create({data:{fullName:'Synthetic owner',officeId:office.id,balance:50}});
  const animal=await db.animal.create({data:{ownerId:owner.id,nickname:'Synthetic patient'}});
  const warehouse=await db.warehouse.create({data:{name:'Synthetic warehouse',officeId:office.id}});
  const cashbox=await db.cashbox.create({data:{title:'Synthetic cashbox',officeId:office.id}});
  const [cash,card,deposit]=await Promise.all(['CASH','CARD','DEPOSIT'].map(type=>db.paymentMethod.create({data:{title:'Synthetic '+type+' '+randomUUID(),type}})));
  const product=await db.product.create({data:{title:'Synthetic medicine',stockUnit:'шт',writeOffUnit:'шт'}}),material=await db.product.create({data:{title:'Synthetic consumable',stockUnit:'шт',writeOffUnit:'шт'}});
  const batch=await db.stockBatch.create({data:{productId:product.id,warehouseId:warehouse.id,quantity:100,rest:100}}),linked=await db.stockBatch.create({data:{productId:material.id,warehouseId:warehouse.id,quantity:100,rest:100}});
  await db.productLinkedProduct.create({data:{sourceProductId:product.id,productId:material.id,quantity:2}});
  const makeBill=async (withStock=false,amount=100)=>{
    const visit=await db.visit.create({data:{ownerId:owner.id,animalId:animal.id,employeeId:employee.id,status:'COMPLETED',visitType:'FOLLOW_UP',exam:{create:{comment:'Synthetic unchanged clinical note'}},completedAt:new Date('2026-10-19T18:00Z')}});
    return db.bill.create({data:{source:'VISIT',visitId:visit.id,ownerId:owner.id,animalId:animal.id,totalAmount:amount,items:{create:{...(withStock?{productId:product.id,stockQuantity:1}:{}),title:'Synthetic bill line',quantity:1,unitPrice:amount,totalAmount:amount}}},include:{items:true}});
  };
  const input=(a=30,b=70,method=cash)=>({operationId:randomUUID(),parts:[{paymentMethodId:method.id,cashboxId:cashbox.id,amount:a},{paymentMethodId:card.id,cashboxId:cashbox.id,amount:b}],paidAt:'2026-10-20T10:00:00Z'});
  let paid,request,created;
  await t.test('completed unpaid visit is paid by cash/card; stock and linked consumable are consumed once',async()=>{
    paid=await makeBill(true);request=input();created=await billing.createSplitPayment(paid.id,request,employee.id);
    assert.deepEqual(created.map(p=>[p.type,p.amount.toString()]),[['CASH','30'],['CARD','70']]);
    const bill=await db.bill.findUnique({where:{id:paid.id}});assert.equal(bill.status,'PAID');assert.equal(bill.paidAmount.toString(),'100');
    const visit=await db.visit.findUnique({where:{id:paid.visitId},include:{exam:true}});assert.equal(visit.status,'COMPLETED');assert.equal(visit.exam.comment,'Synthetic unchanged clinical note');
    assert.equal((await db.stockBatch.findUnique({where:{id:batch.id}})).rest.toString(),'99');assert.equal((await db.stockBatch.findUnique({where:{id:linked.id}})).rest.toString(),'98');
  });
  await t.test('retry returns original payments and different amounts with the same key are rejected',async()=>{
    const moves=await db.stockMovement.count(),auditCount=await db.auditLog.count();
    assert.deepEqual((await billing.createSplitPayment(paid.id,request,employee.id)).map(p=>p.id),created.map(p=>p.id));
    assert.equal(await db.stockMovement.count(),moves);assert.equal(await db.auditLog.count(),auditCount);
    await assert.rejects(billing.createSplitPayment(paid.id,{...request,parts:[{...request.parts[0],amount:40},{...request.parts[1],amount:60}]},employee.id),/другими суммами/);
  });
  await t.test('day close separates the two methods and sees the exact total',async()=>{
    const snapshot=await business.calculateDailySnapshot(office.id,'2026-10-20');
    assert.equal(snapshot.lines.find(l=>l.paymentMethodId===cash.id).systemAmount.toString(),'30');assert.equal(snapshot.lines.find(l=>l.paymentMethodId===card.id).systemAmount.toString(),'70');assert.equal(snapshot.expectedAmount.toString(),'100');
  });
  await t.test('invalid total, duplicate method and inactive cashbox leave no payment or audit behind',async()=>{
    const bill=await makeBill(),before=await db.auditLog.count();
    await assert.rejects(billing.createSplitPayment(bill.id,input(20,70),employee.id),/остатком/);
    const dup=input();dup.parts[1].paymentMethodId=cash.id;await assert.rejects(billing.createSplitPayment(bill.id,dup,employee.id),/разных/);
    await db.cashbox.update({where:{id:cashbox.id},data:{isActive:false}});await assert.rejects(billing.createSplitPayment(bill.id,input(),employee.id),/недоступны/);await db.cashbox.update({where:{id:cashbox.id},data:{isActive:true}});
    assert.equal(await db.payment.count({where:{billId:bill.id}}),0);assert.equal(await db.auditLog.count(),before);
  });
  await t.test('insufficient stock rolls back both payments, snapshot and audit',async()=>{
    const bill=await makeBill(true),before=await db.auditLog.count();await db.stockBatch.update({where:{id:linked.id},data:{rest:0}});
    await assert.rejects(billing.createSplitPayment(bill.id,input(),employee.id));
    assert.equal(await db.payment.count({where:{billId:bill.id}}),0);assert.equal(await db.auditLog.count(),before);assert.equal(await db.consumableUsageSnapshot.count({where:{billItemId:bill.items[0].id}}),0);
    assert.equal((await db.stockBatch.findUnique({where:{id:batch.id}})).rest.toString(),'99');await db.stockBatch.update({where:{id:linked.id},data:{rest:98}});
  });
  await t.test('concurrent attempts with different keys charge the bill once',async()=>{
    const bill=await makeBill();const results=await Promise.allSettled([billing.createSplitPayment(bill.id,input(),employee.id),billing.createSplitPayment(bill.id,input(),employee.id)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.payment.count({where:{billId:bill.id}}),2);
  });
  await t.test('concurrent retries of the same operation return the same two payment IDs',async()=>{
    const bill=await makeBill(),dto=input();const results=await Promise.all([billing.createSplitPayment(bill.id,dto,employee.id),billing.createSplitPayment(bill.id,dto,employee.id)]);
    assert.deepEqual(results[0].map(p=>p.id),results[1].map(p=>p.id));assert.equal(await db.payment.count({where:{billId:bill.id}}),2);
  });
  await t.test('ordinary one-method partial payment still works before splitting the remainder',async()=>{
    const bill=await makeBill();await billing.createPayment(bill.id,{type:'CASH',paymentMethodId:cash.id,cashboxId:cashbox.id,amount:20},employee.id);
    assert.equal((await db.bill.findUnique({where:{id:bill.id}})).status,'PARTIAL');
    await billing.createSplitPayment(bill.id,input(30,50),employee.id);assert.equal((await db.bill.findUnique({where:{id:bill.id}})).paidAmount.toString(),'100');
  });
  await t.test('two bills cannot spend the same deposit concurrently',async()=>{
    const bills=await Promise.all([makeBill(),makeBill()]);await db.owner.update({where:{id:owner.id},data:{balance:50}});
    const results=await Promise.allSettled(bills.map(bill=>billing.createSplitPayment(bill.id,input(40,60,deposit),employee.id)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.owner.findUnique({where:{id:owner.id}})).balance.toString(),'10');
    assert.equal(await db.payment.count({where:{billId:{in:bills.map(b=>b.id)}}}),2);
  });
  await t.test('existing partial payment is preserved and only its remaining debt is split',async()=>{
    const bill=await makeBill();await db.payment.create({data:{billId:bill.id,type:'CASH',amount:20,employeeId:employee.id}});await db.bill.update({where:{id:bill.id},data:{paidAmount:20,status:'PARTIAL'}});
    await billing.createSplitPayment(bill.id,input(30,50),employee.id);assert.equal((await db.bill.findUnique({where:{id:bill.id}})).paidAmount.toString(),'100');assert.equal(await db.payment.count({where:{billId:bill.id}}),3);
  });
  await t.test('insufficient deposit after an earlier cash/card part rolls back the whole split',async()=>{
    const bill=await makeBill(),dto=input(40,60,deposit);dto.parts.reverse();const before=await db.auditLog.count();
    await db.owner.update({where:{id:owner.id},data:{balance:20}});await assert.rejects(billing.createSplitPayment(bill.id,dto,employee.id),/Недостаточно/);
    assert.equal(await db.payment.count({where:{billId:bill.id}}),0);assert.equal(await db.auditLog.count(),before);assert.equal((await db.owner.findUnique({where:{id:owner.id}})).balance.toString(),'20');
  });
  await t.test('cash refund retains its original method/cashbox and does not reverse card proceeds',async()=>{
    const refund=await billing.refundPayment(paid.id,created[0].id,{amount:30,comment:'Synthetic refund'},employee.id);
    assert.equal(refund.type,'CASH');assert.equal(refund.cashboxId,cashbox.id);assert.equal(refund.paymentMethodId,cash.id);assert.equal(refund.amount.toString(),'-30');
    assert.equal((await db.payment.findUnique({where:{id:created[1].id}})).amount.toString(),'70');
  });
  await t.test('late payment blocks approval; returned close recalculates and can be balanced',async()=>{
    const actor={id:employee.id,permissions:['*'],roles:['director']}, businessDate='2026-10-20';
    const initial=await business.prepareDailyClose({officeId:office.id,businessDate},actor);
    const balanced=await business.prepareDailyClose({officeId:office.id,businessDate,lines:initial.lines.map(l=>({lineKey:l.lineKey,actualAmount:Number(l.systemAmount)}))},actor);
    assert.equal(Number(balanced.difference),0);
    await business.submitDailyClose(balanced.id,employee.id);
    const late=await makeBill();await billing.createSplitPayment(late.id,input(),employee.id);
    await assert.rejects(business.approveDailyClose(balanced.id,employee.id),/изменились оплаты/);
    await business.returnDailyClose(balanced.id,{reason:'Synthetic late payment reconciliation'},employee.id);
    const updated=await business.prepareDailyClose({officeId:office.id,businessDate},actor);
    assert.equal(Number(updated.expectedAmount),Number(initial.expectedAmount)+100);
    const final=await business.prepareDailyClose({officeId:office.id,businessDate,lines:updated.lines.map(l=>({lineKey:l.lineKey,actualAmount:Number(l.systemAmount)}))},actor);
    assert.equal(Number(final.difference),0);
    await business.submitDailyClose(final.id,employee.id);await business.approveDailyClose(final.id,employee.id);
  });

});
