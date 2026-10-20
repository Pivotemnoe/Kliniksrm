import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1:4274').pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/'){res.writeHead(302,{Location:'/pet-hotel/'});res.end();return;}
  const path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(404);res.end('Not found');return;}
  try{const info=await stat(path);if(!info.isFile())throw Error();const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4274,'127.0.0.1',()=>process.stdout.write('Pet hotel local preview: http://127.0.0.1:4274/pet-hotel/\n'));
