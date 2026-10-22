import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The live manifests and authorization stay with the operator, outside Git.
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){assert.ok(process.argv[i].startsWith('--')&&process.argv[i+1]);args.set(process.argv[i].slice(2),process.argv[i+1]);}
const packet=path.resolve(args.get('packet-root')||''),mode=args.get('mode'),output=path.resolve(args.get('output')||'');
assert.ok(args.has('packet-root')&&args.has('output')&&['candidate','rollback'].includes(mode),'Use --packet-root <private sealed packet> --mode candidate|rollback --output <new private directory> [--compiled-dist <rebuilt dist>]');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=(name,expected)=>{const b=fs.readFileSync(path.join(packet,name));assert.equal(sha(b),expected,'Protected packet differs: '+name);return JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));};
const prepared=read('prepared-release.json','fb21445e210d638c88bcf9e630f8f4ef9610c06682be43192fe424e5e53de652');
const manifest=read('source-manifest.json','5e14fd1c0129ed56b15cc2500ca767b46e8bf33483d78310deb825cadf2f08bd');
function relative(name){assert.ok(name&&!name.includes('\\')&&!path.posix.isAbsolute(name)&&!name.split('/').some(x=>!x||x==='..'||x==='.'),'Unsafe packet path');return name;}
for(const f of prepared.artifacts)assert.equal(sha(fs.readFileSync(path.join(packet,relative(f.name)))),f.sha256,'Sealed artifact differs: '+f.name);
assert.ok(!fs.existsSync(output),'Never overwrite a context');assert.ok(fs.statSync(path.dirname(output)).isDirectory());
assert.notEqual(spawnSync('git',['-C',path.dirname(output),'rev-parse','--show-toplevel'],{stdio:'ignore'}).status,0,'Private build context must be outside a Git checkout');
const overlay=mode==='candidate'?manifest.overlay:manifest.rollback.overlay;
assert.equal(overlay.length,mode==='candidate'?36:21);
const dist=args.has('compiled-dist')?path.resolve(args.get('compiled-dist')):path.join(packet,mode==='candidate'?'api':'rollback-api');
for(const f of overlay)assert.equal(sha(fs.readFileSync(path.join(dist,relative(f.name)))),f.sha256,'Compiled output differs: '+f.name);
fs.mkdirSync(output,{mode:0o700});
function copy(name,dest=name){const target=path.join(output,relative(dest));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(packet,relative(name)),target);}
copy('source-manifest.json');copy('schema.prisma');copy('migration/migration.sql');copy('api-scoped-entrypoint.sh');
for(const f of overlay){const target=path.join(output,'api',relative(f.name));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dist,f.name),target);}
for(const f of prepared.artifacts.filter(f=>f.name.startsWith('qa/')))copy(f.name);
const ops=path.dirname(fileURLToPath(import.meta.url));
for(const n of ['capture-baseline.cjs','qualify.cjs']){
 const expected=prepared.artifacts.find(f=>f.name==='qa/'+n);assert.ok(expected);
 assert.equal(sha(fs.readFileSync(path.join(ops,n))),expected.sha256,'Public helper differs from reviewed helper');
}
const revision=mode==='candidate'?manifest.sourceRevision:manifest.rollback.sourceRevision;
assert.match(revision,/^[a-f0-9]{40}$/);
const dockerfile=`ARG BASE_IMAGE
FROM \${BASE_IMAGE} AS generated
WORKDIR /app
COPY source-manifest.json /opt/source-manifest.json
COPY qa/capture-baseline.cjs /opt/capture-baseline.cjs
RUN node /opt/capture-baseline.cjs
COPY schema.prisma /app/prisma/schema.prisma
RUN DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused CHECKPOINT_DISABLE=1 PRISMA_GENERATE_SKIP_AUTOINSTALL=1 node /app/node_modules/prisma/build/index.js generate --schema /app/prisma/schema.prisma
FROM \${BASE_IMAGE} AS runtime
WORKDIR /app
COPY --from=generated /app/node_modules/.prisma/client /app/node_modules/.prisma/client
COPY api/ /app/apps/api/dist/
COPY schema.prisma /app/prisma/schema.prisma
COPY migration/ /app/prisma/migrations/20261022080000_pet_service_booking_attribution/
COPY --chmod=755 api-scoped-entrypoint.sh /app/apps/api/docker-entrypoint.sh
ENV TEMICHEVVET_GIT_COMMIT=${revision}
LABEL org.opencontainers.image.revision="${revision}"
FROM runtime AS qualification
COPY --from=generated /opt/baseline-datamodel.json /opt/baseline-datamodel.json
COPY source-manifest.json /opt/source-manifest.json
COPY qa/ /opt/qualify/
RUN mkdir -p /opt/qualify/apps/api && ln -s /app/apps/api/dist /opt/qualify/apps/api/dist && ln -s /app/node_modules /opt/qualify/node_modules && node /opt/qualify/qualify.cjs ${mode}
FROM runtime
COPY --from=qualification /opt/qualify/qualification.json /opt/release/qualification.json
`;
fs.writeFileSync(path.join(output,'Dockerfile'),dockerfile);
console.log(JSON.stringify({status:'PRIVATE_CONTEXT_PREPARED',mode,revision,compiledFiles:overlay.length,output,startsRuntime:false,appliesMigration:false,buildUsesNetwork:false}));
