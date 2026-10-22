import 'reflect-metadata';
import test from 'node:test';import assert from 'node:assert/strict';import {PrismaClient} from '@prisma/client';import {mkdtempSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {AuthService} from '../apps/api/dist/modules/auth/auth.service.js';import {SessionAuthGuard} from '../apps/api/dist/modules/auth/session-auth.guard.js';import {Reflector} from '@nestjs/core';
const url=process.env.NIGHT_REPORTS_TEST_DATABASE_URL;
test('guarded release restores exact rows, rejects concurrent edits and refreshes existing session rights',{skip:!url},async()=>{
const u=new URL(url);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'15488');assert.match(u.pathname,/^\/night_reports_qa_\d+$/);
const db=new PrismaClient({datasources:{db:{url}}});
const codes=['business.read','stock.read','stock.manage','billing.read','billing.manage','payments.manage','daily_finance.read','daily_finance.manage','daily_finance.submit','payroll.read','payroll.manage','reports.prevention.read','reports.prevention.generate'];
const run=(mode,dir,ok=true)=>{const r=spawnSync(process.execPath,['scripts/admin-report-release/rights.cjs',mode,dir],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});if(ok)assert.equal(r.status,0,r.stderr);else assert.notEqual(r.status,0);};
try{
for(const code of codes)await db.permission.upsert({where:{code},create:{code,title:code},update:{}});
const p=await db.permission.findUnique({where:{code:'business.read'}});const admin=await db.role.upsert({where:{code:'administrator'},create:{code:'administrator',title:'Synthetic administrator'},update:{}});
const director=await db.role.upsert({where:{code:'director'},create:{code:'director',title:'Synthetic director'},update:{}});
for(const r of [admin,director])await db.rolePermission.upsert({where:{roleId_permissionId:{roleId:r.id,permissionId:p.id}},create:{roleId:r.id,permissionId:p.id},update:{}});
const employee=await db.employee.create({data:{fullName:'Synthetic session QA',roles:{create:{roleId:admin.id}},permissionOverrides:{create:{permissionId:p.id,effect:'GRANT'}}}});
const dual=await db.employee.create({data:{fullName:'Synthetic dual QA',roles:{create:[{roleId:admin.id},{roleId:director.id}]}}});
const user=await db.user.create({data:{email:`qa-${employee.id}@example.invalid`,passwordHash:'not-a-real-password',employee:{connect:{id:employee.id}}}});
const auth=new AuthService(db,{}, {log:async()=>{}});const token='synthetic-token-'+employee.id;
await db.session.create({data:{id:auth.hashSessionToken(token),userId:user.id,expiresAt:new Date(Date.now()+3600000)}});
const guard=new SessionAuthGuard(new Reflector(),db,auth,{log:async()=>{}});
const getRights=async()=>{const req={headers:{cookie:`clinic_crm_session=${token}`},method:'GET',ip:'127.0.0.1',url:'/v1/reports/summary'};await guard.canActivate({getHandler:()=>getRights,getClass:()=>SessionAuthGuard,switchToHttp:()=>({getRequest:()=>req})});return req.auth.employee.permissions};
assert.ok((await getRights()).includes('business.read'));
const dir=mkdtempSync(join(tmpdir(),'crm-rights-'));run('snapshot',dir);run('apply',dir);run('verify',dir);
assert.ok(!(await getRights()).includes('business.read'),'same pre-existing session loses permission');
assert.equal(await db.employeePermissionOverride.count({where:{employeeId:dual.id}}),0);
run('rollback',dir);assert.ok((await getRights()).includes('business.read'));
const stale=mkdtempSync(join(tmpdir(),'crm-rights-stale-'));run('snapshot',stale);await db.employeeRole.create({data:{employeeId:employee.id,roleId:director.id}});run('apply',stale,false);await db.employeeRole.delete({where:{employeeId_roleId:{employeeId:employee.id,roleId:director.id}}});
const conflict=mkdtempSync(join(tmpdir(),'crm-rights-conflict-'));run('snapshot',conflict);run('apply',conflict);const applied=JSON.parse(readFileSync(join(conflict,'applied.json'),'utf8')).overrides.find(x=>x.employeeId===employee.id);
await db.employeePermissionOverride.update({where:{employeeId_permissionId:{employeeId:employee.id,permissionId:p.id}},data:{effect:'GRANT'}});run('rollback',conflict,false);assert.equal((await db.employeePermissionOverride.findUnique({where:{employeeId_permissionId:{employeeId:employee.id,permissionId:p.id}}})).effect,'GRANT');
await db.$executeRawUnsafe('UPDATE "EmployeePermissionOverride" SET effect=$3::"PermissionEffect", "createdAt"=$4::timestamp, "updatedAt"=$5::timestamp WHERE "employeeId"=$1 AND "permissionId"=$2',employee.id,p.id,applied.effect,applied.createdAt,applied.updatedAt);run('rollback',conflict);
}finally{await db.$disconnect()}
});
