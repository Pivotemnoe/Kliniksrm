// Isolated browser test harness. No production API, database, credentials or service records.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { PublicClinicCatalogService }=require('../../../apps/owner-gateway/dist/public-clinic-catalog.service.js');
const { Prisma }=require('../../../apps/owner-gateway/dist/generated/client/index.js');
const { PublicClinicCatalogSyncService }=require('../../../apps/api/dist/modules/notifications/public-clinic-catalog-sync.service.js');
let row=null;
const db={publicClinicCatalog:{async create({data}){if(row)throw new Prisma.PrismaClientKnownRequestError('duplicate',{code:'P2002',clientVersion:'6'});row=data;},async updateMany({where,data}){if(row.capturedAt<where.capturedAt.lt){row={...row,...data};return {count:1};}return {count:0};},async findUnique(){return row;}}};
const gateway=new PublicClinicCatalogService(db);
let rows=[{id:'qa-1',title:'Тестовый приём — вымышленная цена',category:{title:'Приём'},priceType:'FIXED',price:1000,minimumPrice:null,maximumPrice:null,isActive:true,publicOnWebsite:true},{id:'qa-2',title:'Тестовое УЗИ — вымышленная цена',category:{title:'Диагностика'},priceType:'FLOATING',price:2000,minimumPrice:2000,maximumPrice:3000,isActive:true,publicOnWebsite:true}];
process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED='true';
const sync=new PublicClinicCatalogSyncService({service:{async findMany({where}){return rows.filter(s=>s.isActive===where.isActive&&s.publicOnWebsite===where.publicOnWebsite);}}},{async syncPublicCatalog(snapshot){await gateway.upsert(snapshot);}});
await sync.syncOnce();
const root=path.resolve('dist/client');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/v1/public/clinic/catalog'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(await gateway.get()));return;}
 let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+'/')&&file!==root){res.writeHead(403);res.end();return;}
 try{if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');let body=await fs.readFile(file);if(file.endsWith('.html'))body=body.toString().replace('<body>','<body><aside style="background:#d2e5ae;color:#122a3a;padding:16px;font:14px sans-serif">ТЕСТ СИНХРОНИЗАЦИИ. Все услуги и цены вымышленные.</aside>');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}
}).listen(4191,'127.0.0.1',()=>console.log('Synthetic catalog QA http://127.0.0.1:4191/prices; commands: edit, archive, stale, restore'));
readline.createInterface({input:process.stdin}).on('line',async command=>{
 if(command==='edit')rows[0].price=1500;
 else if(command==='archive')rows[1].isActive=false;
 else if(command==='stale'){row.capturedAt=new Date(Date.now()-90000000);console.log('stale');return;}
 else if(command==='restore'){row=null;rows[1].isActive=true;}
 else return;
 console.log(command,await sync.syncOnce());
});
