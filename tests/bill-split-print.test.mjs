import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {buildSync} from 'esbuild';
// Exercise the real print functions without mounting the authenticated bill editor.
const source=readFileSync('apps/web/src/features/billing/BillCardPage.tsx','utf8');
const tree=ts.createSourceFile('BillCardPage.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions=['printBillDocument','escapeHtml'].map(name=>{
 const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(tree);
}).join('\n');
const code=buildSync({stdin:{contents:`
import {groupHospitalBillItems,billQuantityText,billPriceText} from './apps/web/src/features/billing/groupBillLines';
import {printBrandHeader,printImagesScript} from './apps/web/src/shared/print/branding';
import {formatDate,formatDateTime} from './apps/web/src/shared/utils/date';
import {formatMoney,subtractMoney} from './apps/web/src/shared/utils/money';
import {billSourceLabels,paymentStatusLabels,paymentTypeLabels} from './apps/web/src/features/billing/types';
${functions}\nexport {printBillDocument};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
function render(bill,paper,showPayments=true){let html='';const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,URL,window:{location:{href:'http://127.0.0.1:15179/'},open:()=>({document:{write:x=>html+=x,close(){}}})}});module.exports.printBillDocument(bill,{paper,showPayments,showCustomer:true});return html;}
const payment=(type,amount)=>({type,amount,paidAt:'2026-10-20T10:00:00Z',cashbox:{title:'Тестовая касса <1>'}});
const bill={source:'MANUAL',status:'PAID',totalAmount:1000,paidAmount:1000,createdAt:'2026-10-20T10:00:00Z',owner:{fullName:'Тестовый владелец'},animal:{nickname:'Тест'},items:[{title:'Тестовая услуга',quantity:1,unitPrice:1000,discount:0,totalAmount:1000}],payments:[payment('CASH',400),payment('CARD',600)]};
for(const paper of ['A4','RECEIPT_58','RECEIPT_80']){
 test(`${paper}: cash/card and exact totals survive print generation`,()=>{
  const html=render(bill,paper),payments=html.split('<h2>Оплаты</h2>')[1];
  assert.match(payments,/Наличные/);assert.match(payments,/Карта/);
  assert.match(payments,/400,00/);assert.match(payments,/600,00/);
  assert.equal((payments.match(/Тестовая касса &lt;1&gt;/g)||[]).length,2);
  assert.match(html,/<span>Долг<\/span><strong>0,00/);
  assert.match(html,/<span>Оплачено<\/span><strong>1\s000,00/);
  if(paper!=='A4')assert.match(payments,/receipt-payment-title/);
  if(process.env.PRINT_QA_OUTPUT){mkdirSync(process.env.PRINT_QA_OUTPUT,{recursive:true});writeFileSync(`${process.env.PRINT_QA_OUTPUT}/${paper}.html`,html.replace(/<script>[\s\S]*?<\/script>/g,''));}
 });
 test(`${paper}: refund remains negative and debt reflects net payment`,()=>{
  const html=render({...bill,status:'PARTIAL',paidAmount:600,payments:[...bill.payments,payment('CASH',-400)]},paper);
  assert.match(html,/-400,00/);assert.match(html,/<span>Долг<\/span><strong>400,00/);
 });
 test(`${paper}: payment details can be hidden without hiding the paid total`,()=>{
  const html=render(bill,paper,false);assert.doesNotMatch(html,/<h2>Оплаты<\/h2>/);assert.match(html,/<span>Оплачено<\/span><strong>1\s000,00/);
 });
}
