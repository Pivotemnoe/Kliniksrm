// Dedicated synthetic QA. No production environment, database or MAX transport.
import {createServer,request as forward} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {configureIndependentQa,independentApp,independentFixture,qaPassword} from '../tests/helpers/grooming-independent-qa.mjs';
configureIndependentQa(true);
process.env.REMOTE_DEVICE_COOKIE_NAME='grooming_independent_device_qa';
const require=createRequire(import.meta.url), webpush=require('web-push');
const out=resolve('output/grooming-independent-20261020');await mkdir(out,{recursive:true});
let vapid;try{vapid=JSON.parse(await readFile(resolve(out,'private-vapid.json'),'utf8'))}catch{vapid=webpush.generateVAPIDKeys();await writeFile(resolve(out,'private-vapid.json'),JSON.stringify(vapid),{mode:0o600})}
Object.assign(process.env,{GROOMING_STAFF_PUSH_ENABLED:'true',GROOMING_STAFF_VAPID_SUBJECT:'mailto:qa@example.local',GROOMING_STAFF_VAPID_PUBLIC_KEY:vapid.publicKey,GROOMING_STAFF_VAPID_PRIVATE_KEY:vapid.privateKey});
const fixture=await independentFixture();
await writeFile(resolve(out,'preview-access.json'),JSON.stringify({url:'http://127.0.0.1:4301/grooming/specialists',administrator:fixture.administrator.email,director:fixture.director.email,password:qaPassword},null,2),{mode:0o600});await fixture.close();
const app=await independentApp();await app.listen(4302,'127.0.0.1');
const root=resolve('apps/web/dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const servers=[];
for(const [port,remote] of [[4301,false],[4303,true]]){
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403);res.end();return}
  if(path==='/grooming/manifest.webmanifest'){
   const manifest=JSON.parse(await readFile(resolve(root,'grooming/manifest.webmanifest'),'utf8'));
   Object.assign(manifest,{id:'/grooming/qa-20261020',name:'TemichevVet · Груминг QA',short_name:'Груминг QA'});
   res.writeHead(200,{'Content-Type':'application/manifest+json','Cache-Control':'no-store'});res.end(JSON.stringify(manifest));return;
  }
  if(path.startsWith('/api/')){const headers={...req.headers,host:'127.0.0.1:4302'};delete headers['x-temichevvet-remote-access'];delete headers['x-temichevvet-gateway-secret'];
   if(remote){headers['x-temichevvet-remote-access']='1';headers['x-temichevvet-gateway-secret']=process.env.REMOTE_ACCESS_GATEWAY_SECRET}
   const proxy=forward({hostname:'127.0.0.1',port:4302,path:req.url,method:req.method,headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});proxy.on('error',()=>{res.writeHead(502);res.end('Local QA API unavailable')});req.pipe(proxy);return;
  }
  try{let file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)&&file!==root)throw Error();
   let data;try{data=await readFile(file)}catch{if(extname(path)&&!path.endsWith('.html')){res.writeHead(404);res.end();return}file=resolve(root,path.startsWith('/grooming/')||path==='/remote/enroll'?'grooming/index.html':'index.html');data=await readFile(file)}
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end()}
 });await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));servers.push(server);
}
console.log('Independent grooming QA ready: admin 127.0.0.1:4301; personal phone localhost:4303. Synthetic data only.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{for(const server of servers){server.closeAllConnections();server.close()}app.getHttpServer().closeAllConnections();await app.close();process.exit(0)});
