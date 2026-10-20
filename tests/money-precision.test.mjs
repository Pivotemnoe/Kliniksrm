import assert from 'node:assert/strict';
import test from 'node:test';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
function web(path) {
  const source = buildSync({entryPoints:[root+path],bundle:true,platform:'node',format:'cjs',write:false,external:['react','react/jsx-runtime','antd'],loader:{'.svg':'dataurl','.png':'dataurl'}}).outputFiles[0].text;
  const mod = new Module(root+'money-qa.cjs'); mod.filename=root+'money-qa.cjs'; mod.paths=Module._nodeModulePaths(root); mod._compile(source,mod.filename); return mod.exports;
}
const money = web('apps/web/src/shared/utils/money.ts');
const { MoneyStatistic } = web('apps/web/src/shared/ui/MoneyStatistic.tsx');
const text = value => renderToStaticMarkup(React.createElement(MoneyStatistic,{value})).replace(/<[^>]*>/g,'').replace(/\s/g,'');

test('19 October cash reconciliation sums exact kopecks, keeps one-kopeck differences and does not change quantities', () => {
  const actual = money.sumMoney([68565,-7859,-84675.51,0]);
  assert.equal(actual,-23969.51); assert.equal(money.subtractMoney(actual,'-23969.51'),0);
  assert.equal(money.subtractMoney(actual,'-23969.52'),0.01);
  assert.equal(money.subtractMoney(actual,'-23969.50'),-0.01);
  assert.equal(money.sumMoney(Array(1000).fill('0.01')),10);
  assert.equal(money.toMoneyNumber('0.001'),0.001);
  assert.equal(money.toMoneyKopecks('9999999999.99'),999999999999);
});
test('currency formatter rounds halves, normalizes negative zero and avoids scientific notation', () => {
  assert.equal(money.moneyForExport(1.005),'1.01'); assert.equal(money.moneyForExport(-1.005),'-1.01');
  for(const value of [0,-0,3.637978807091713e-12,-7.275957614183426e-12]) {
    assert.equal(money.roundMoney(value),0); assert.equal(money.moneyForExport(value),'0.00'); assert.equal(text(value),'0,00₽');
  }
  assert.equal(text(-23969.509999999995),'-23969,51₽');
  assert.equal(text(0.01),'0,01₽'); assert.equal(text(-0.01),'-0,01₽');
});
test('derived business/report arithmetic uses decimal addition and keeps fractional stock cost before display', () => {
  const {addReportMoney,sumReportMoney,subtractReportMoney,multiplyReportMoney}=require('../apps/api/dist/modules/reports/report-money.js');
  assert.equal(addReportMoney(0.1,0.2),0.3); assert.equal(sumReportMoney(Array(200000).fill('0.01')),2000);
  assert.equal(subtractReportMoney(68565,7859,84675.51),-23969.51);
  assert.equal(multiplyReportMoney('0.001','12.3456'),0.0123456);
  const {calculateManagementResult,aggregateBusinessDaily}=require('../apps/api/dist/modules/business/business.service.js');
  const result=calculateManagementResult({accruedSystemRevenue:0.1,profitIncome:0.2,costOfGoods:0.1,payrollExpense:0.05,dailySalaryExpense:0.03,operatingExpenses:0.02,cashIncome:79485,refunds:0,manualIncome:0,manualExpense:18779,supplierOutflow:84675.51});
  assert.equal(result.accruedRevenue,0.3);assert.equal(result.operatingProfit,0.1);assert.equal(result.cashNet,-23969.51);
  const {Prisma}=require('@prisma/client'), d=v=>new Prisma.Decimal(v), date=new Date('2026-10-19T10:00Z');
  const daily=aggregateBusinessDaily({bills:[],payments:[{paidAt:date,amount:d(0.1)},{paidAt:date,amount:d(0.2)}],entries:[],movements:[],supplierPayments:[{paidAt:date,amount:d(0.3)}]},180);
  assert.equal(daily[0].cashIncome,0.3);assert.equal(daily[0].cashNet,0);
});
test('Excel currency cells remain numeric with two decimals; counts and fractional quantities stay separate', () => {
  const {buildReportWorkbook}=web('apps/web/src/features/reports/reportExport.ts');
  const xml=buildReportWorkbook({range:{from:'2026-09-01',to:'2026-10-20'},finance:{billedAmount:-23969.509999999995,paidAmount:3.637978807091713e-12,refundedAmount:0,debtAmount:0,depositsAmount:0,paymentMethods:[],debtors:[]},profit:{grossProfit:0},traffic:{visitsTotal:1,visitsCompleted:1,visitsOverdue:0,overdueNotifications:0,newOwners:1,daily:[]},sales:{services:[{title:'Synthetic test',quantity:0.001,lines:1,discount:0,revenue:0.1+0.2}],products:[]},employees:[],vaccinations:{administeredItems:[],upcomingItems:[],overdueItems:[],identifiedAnimals:[]},stock:{lowStockItems:[],expiryItems:[]}});
  assert.match(xml,/<NumberFormat ss:Format="0.00"/);
  assert.match(xml,/<Cell ss:StyleID="Money"><Data ss:Type="Number">-23969.51<\/Data>/);
  assert.match(xml,/<Cell ss:StyleID="Money"><Data ss:Type="Number">0.00<\/Data>/);
  assert.match(xml,/<Cell><Data ss:Type="Number">0.001<\/Data>/);
  assert.doesNotMatch(xml,/e-\d+/);
});
test('daily report, payment-method groups and totals agree for fractional receipts and refund', async () => {
  const {ReportsService}=require('../apps/api/dist/modules/reports/reports.service.js');
  const day=new Date('2026-09-25T10:00Z');
  const bills=[0.1,0.2].map((n,i)=>({id:'synthetic-'+i,createdAt:day,totalAmount:n,paidAmount:n,owner:null,visit:null,items:[{serviceId:'synthetic-service',productId:null,title:'Synthetic',quantity:1,discount:0,totalAmount:n}]}));
  const payments=[0.1,0.2,-0.3].map(amount=>({paidAt:day,amount,type:'CARD',paymentMethod:{id:'card',title:'Card'}}));
  const empty={findMany:async()=>[]};
  const db={bill:{findMany:async({where})=>where.createdAt?bills:[]},payment:{findMany:async()=>payments},owner:{aggregate:async()=>({_sum:{balance:0}}),count:async()=>0},visit:empty,visitOverdueAlert:empty,appointment:empty,vaccination:empty,animal:empty,stockBatch:empty,stockMovement:empty,supplyInvoice:empty,employee:empty};
  const report=await new ReportsService(db).getSummary({from:'2026-09-01',to:'2026-10-31'});
  assert.equal(report.finance.billedAmount,0.3); assert.equal(report.finance.paidAmount,0);
  assert.equal(report.finance.paymentMethods[0].net,0); assert.equal(report.finance.paymentMethods[0].received,0.3);
  assert.equal(report.sales.services[0].revenue,0.3);
  const daily=report.traffic.daily.find(r=>r.date==='2026-09-25');assert.equal(daily.billedAmount,0.3);assert.equal(daily.paidAmount,0);
});
test('all numeric currency Statistic cards use the shared formatter while count cards remain counts', async () => {
  const fs=await import('node:fs/promises');
  for(const path of ['business/DailyFinancePage.tsx','business/BusinessPage.tsx','visits/VisitServicesTab.tsx']){
    const source=await fs.readFile(root+'apps/web/src/features/'+path,'utf8');
    const ts=require('typescript'),file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node){
      if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(file)==='Statistic'){
        const suffix=node.attributes.properties.find(p=>p.name?.getText(file)==='suffix');
        assert.ok(!suffix||!suffix.getText(file).includes('₽'),path+' has an unformatted currency Statistic');
      }
      ts.forEachChild(node,visit);
    }visit(file);
    if(path==='business/BusinessPage.tsx'){assert.match(source,/<Statistic title="Черновиков" value=\{summary.control.draftDays\}/);assert.match(source,/<MoneyStatistic title="Сумма расхождений" value=\{summary.control.totalDifference\}/);}
  }
});
