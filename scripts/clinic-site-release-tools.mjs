import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const bridge = ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i','/Users/konstantin/.ssh/temichevvet_pwa_codex','root@5.129.239.104'];
const windows = ['-i','/Users/konstantin/.ssh/temichevvet_tecno_codex','-o','BatchMode=yes','-o','HostKeyAlias=192.168.0.81','-o','UserKnownHostsFile=/Users/konstantin/.ssh/known_hosts','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ProxyCommand=ssh -i /Users/konstantin/.ssh/temichevvet_pwa_codex -o BatchMode=yes root@5.129.239.104 -W %h:%p'];
export function run(command,args,input) { return new Promise((resolve,reject)=>{ const cp=spawn(command,args,{stdio:['pipe','pipe','inherit']});let output='';cp.stdout.setEncoding('utf8');cp.stdout.on('data',x=>{output+=x;process.stdout.write(x)});cp.on('error',reject);cp.on('close',code=>code===0?resolve(output):reject(new Error(`${command} exited ${code}`)));cp.stdin.end(input);}); }
const [mode,file,destination] = process.argv.slice(2);
if(mode==='ru') await run('ssh',[...bridge,'ssh -o BatchMode=yes -i /root/.ssh/temichevvet_gateway_to_ru -p 22065 root@127.0.0.1 bash -s'],await fs.readFile(file));
else if(mode==='ru-upload') {
  if(!/^\/(tmp|var\/www\/temichevvet-clinic|opt\/temichevvet-owner-gateway)\/[a-zA-Z0-9_./-]+$/.test(destination)) throw Error('Unsafe destination');
  await run('ssh',[...bridge,`ssh -o BatchMode=yes -i /root/.ssh/temichevvet_gateway_to_ru -p 22065 root@127.0.0.1 'umask 077; dd of=${destination} status=none'`],await fs.readFile(file));
}
else if(mode==='tecno') {
 const name=path.basename(file);if(!/^[a-zA-Z0-9_.-]+\.ps1$/.test(name))throw Error('Unsafe file');
 const sha=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 await run('scp',['-P','22081',...windows,file,`temichevvet@127.0.0.1:${name}`]);
 const result=await run('ssh',['-p','22081',...windows,'temichevvet@127.0.0.1',`powershell.exe -NoProfile -Command "if ((Get-FileHash '${name}' -Algorithm SHA256).Hash -ne '${sha}') { exit 9 }; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File '${name}'; exit $LASTEXITCODE"`]);
 if(destination)await fs.writeFile(destination,result);
}
else if(mode==='tecno-upload') await run('scp',['-P','22081',...windows,file,`temichevvet@127.0.0.1:${destination || path.basename(file)}`]);
else throw Error('Expected ru, ru-upload, tecno, tecno-upload');
