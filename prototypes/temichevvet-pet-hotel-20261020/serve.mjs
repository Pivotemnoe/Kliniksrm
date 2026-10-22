import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.woff2':'font/woff2'};
const gateway=process.env.PET_HOTEL_GATEWAY_ORIGIN?new URL(process.env.PET_HOTEL_GATEWAY_ORIGIN):null;
if(gateway&&(!['127.0.0.1','localhost','[::1]'].includes(gateway.hostname)||gateway.protocol!=='http:'))throw Error('The local hotel preview only proxies a loopback gateway');
const publicPaths=new Set(['/v1/public/pet-hotel/catalog','/v1/public/pet-hotel/availability','/v1/public/pet-hotel/drafts']);
async function publicApi(req,res,url){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const method=url.pathname.endsWith('/drafts')?'POST':'GET';
  if(req.method!==method){res.writeHead(405);res.end(JSON.stringify({message:'Метод недоступен'}));return;}
  if(!gateway){res.writeHead(url.pathname.endsWith('/catalog')?200:503);res.end(JSON.stringify(url.pathname.endsWith('/catalog')?{connected:false,enabled:false,selfBookingEnabled:false,rooms:[]}:{message:'Онлайн-бронирование пока не подключено'}));return;}
  try{
    const chunks=[];let size=0;
    if(method==='POST')for await(const chunk of req){size+=chunk.length;if(size>16000){res.writeHead(413);res.end(JSON.stringify({message:'Слишком большой запрос'}));return;}chunks.push(chunk);}
    const response=await fetch(gateway.origin+url.pathname+url.search,{method,headers:{accept:'application/json',...(method==='POST'?{'content-type':'application/json',origin:req.headers.origin||'http://127.0.0.1:4274'}:{})},...(method==='POST'?{body:Buffer.concat(chunks)}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
    res.writeHead(response.status);res.end(await response.text());
  }catch{res.writeHead(503);res.end(JSON.stringify({message:'Связь с гостиницей временно недоступна. Повторите проверку.'}));}
}
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const url=new URL(req.url,'http://127.0.0.1:4274');
  if(publicPaths.has(url.pathname)){await publicApi(req,res,url);return;}
  if(req.method==='GET'&&url.pathname==='/pet-hotel/booking-attribution.js'){
    const data=await readFile(new URL('../../packages/booking-attribution/browser.mjs',import.meta.url));
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(data);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1:4274').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/'){res.writeHead(302,{Location:'/pet-hotel/'});res.end();return;}
  const path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(404);res.end('Not found');return;}
  try{const info=await stat(path);if(!info.isFile())throw Error();const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4274,'127.0.0.1',()=>process.stdout.write('Pet hotel local preview: http://127.0.0.1:4274/pet-hotel/\n'));
