// Run inside API container; backup directory must be private and writable.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const [mode,dir]=process.argv.slice(2);
if(!['snapshot','apply','rollback','verify'].includes(mode)||!dir)throw Error('Usage: rights.cjs snapshot|apply|rollback|verify PRIVATE_DIRECTORY');
const db=new PrismaClient();
const codes=['business.read','stock.read','stock.manage','billing.read','billing.manage','payments.manage','daily_finance.read','daily_finance.manage','daily_finance.submit','payroll.read','payroll.manage','reports.prevention.read','reports.prevention.generate'];
const names=codes.map(c=>`'${c}'`).join(',');
const admin=`SELECT id FROM "Role" WHERE code='administrator'`;
const targets=`SELECT DISTINCT er."employeeId" FROM "EmployeeRole" er JOIN "Role" r ON r.id=er."roleId" WHERE r.code='administrator' AND NOT EXISTS(SELECT 1 FROM "EmployeeRole" dr JOIN "Role" d ON d.id=dr."roleId" WHERE dr."employeeId"=er."employeeId" AND d.code='director')`;
const specs={
 roles:['Role',`code IN ('administrator','director')`,['id']],
 memberships:['EmployeeRole','TRUE',['employeeId','roleId']],
 definitions:['Permission',`code IN (${names})`,['id']],
 grants:['RolePermission',`"roleId" IN (${admin}) AND "permissionId" IN (SELECT id FROM "Permission" WHERE code IN (${names}))`,['roleId','permissionId']],
 overrides:['EmployeePermissionOverride',`"employeeId" IN (${targets}) AND "permissionId" IN (SELECT id FROM "Permission" WHERE code='business.read')`,['employeeId','permissionId']]
};
const file=n=>path.join(dir,n+'.json');
function save(n,data){const p=file(n); if(fs.existsSync(p))throw Error('Refuse overwrite '+n);fs.writeFileSync(p,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});fs.fsyncSync(fs.openSync(p,'r'));}
const read=n=>JSON.parse(fs.readFileSync(file(n),'utf8'));
async function snap(tx){const result={};for(const [key,[table,where]]of Object.entries(specs)){result[key]=(await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM "${table}" t WHERE ${where} ORDER BY row_to_json(t)::text`)).map(r=>JSON.parse(r.row));}return result;}
async function lock(tx){await tx.$executeRawUnsafe('SET LOCAL lock_timeout = \'5s\'');await tx.$executeRawUnsafe('LOCK TABLE "Role", "EmployeeRole", "Permission", "RolePermission", "EmployeePermissionOverride" IN SHARE ROW EXCLUSIVE MODE');}
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Rights or memberships changed; abort without overwriting concurrent edits');}
async function restore(tx,key,before,after){const [table,,keys]=specs[key];const id=r=>keys.map(k=>r[k]).join('|');const b=new Map(before.map(r=>[id(r),r])),a=new Map(after.map(r=>[id(r),r]));for(const k of new Set([...b.keys(),...a.keys()])){const old=b.get(k),applied=a.get(k);if(JSON.stringify(old)===JSON.stringify(applied))continue;const row=applied||old;const where=keys.map((v,i)=>`"${v}"=$${i+1}`).join(' AND ');if(key==='definitions'){await tx.$executeRawUnsafe(`UPDATE "Permission" SET title=$2 WHERE id=$1`,row.id,old.title);continue;}await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE ${where}`,...keys.map(v=>row[v]));if(old)await tx.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}", $1::json)`,JSON.stringify(old));}}
(async()=>{try{
 if(mode==='snapshot'){const s=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');return snap(tx)});assert.equal(s.definitions.length,codes.length);assert.equal(s.roles.filter(r=>r.code==='administrator').length,1);save('before',s);console.log(JSON.stringify({snapshot:true,targets:s.memberships.length,permissionCodes:s.definitions.length}));return;}
 const before=read('before');
 if(mode==='apply'){
  await db.$transaction(async tx=>{await lock(tx);equal(await snap(tx),before);
   // No schema migration runner or seed: only the explicitly reviewed rights SQL.
   const sql=fs.readFileSync(path.join(__dirname,'rights.sql'),'utf8');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
   const after=await snap(tx);save('applied',after); // Durable expected after-image before commit, enables recovery after interrupted client.
  },{timeout:30000});console.log(JSON.stringify({applied:true}));return;
 }
 const applied=read('applied');
 if(mode==='verify'){await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');equal(await snap(tx),applied)});console.log(JSON.stringify({verified:true}));return;}
 await db.$transaction(async tx=>{await lock(tx);const current=await snap(tx);if(JSON.stringify(current)===JSON.stringify(before))return;equal(current,applied);for(const k of ['overrides','grants','definitions'])await restore(tx,k,before[k],applied[k]);equal(await snap(tx),before);},{timeout:30000});console.log(JSON.stringify({rolledBack:true}));
}finally{await db.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});
