import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {AuthService}=require('../apps/api/dist/modules/auth/auth.service.js');
const {SessionAuthGuard}=require('../apps/api/dist/modules/auth/session-auth.guard.js');
const {SESSION_COOKIE_NAME}=require('../apps/api/dist/modules/auth/session-cookie.js');
function fixture({roles=['doctor'],revoked=false,deviceEmployee='e',policy=true}={}) {
  const employee={id:'e',status:'ACTIVE',restrictLoginToShifts:true,allowRemoteOutsideShift:false,roles:roles.map(code=>({role:{code,permissions:[]}})),permissionOverrides:[]};
  const device={id:'d',employeeId:deviceEmployee,revokedAt:revoked?new Date():null,organization:{remoteAccessPolicy:{enabled:policy}}};
  const prisma={employeeShift:{findFirst:async()=>null},remoteAccessPolicy:{findFirst:async()=>({enabled:policy,idleTimeoutMinutes:15})},remoteAccessDevice:{findUnique:async()=>device,update:async()=>{},updateMany:async()=>{}},user:{findFirst:async()=>({id:'u',employee,passwordHash:'hash',mustChangePassword:false})},session:{create:async()=>{},deleteMany:async()=>{},updateMany:async()=>{}}};
  const service=new AuthService(prisma,{verifyPassword:async()=>true},{log:async()=>{}});
  return {employee,device,prisma,service};
}
test('trusted read-only remote employee can log in outside shifts without changing shift permissions',async()=>{
  const f=fixture(); const result=await f.service.login({login:'doctor@example.test',password:'test'},null,null,{accessType:'REMOTE',remoteDeviceToken:'trusted'});
  assert.ok(result.token); assert.equal(f.employee.allowRemoteOutsideShift,false);
  await assert.rejects(f.service.login({login:'doctor@example.test',password:'test'}),/смен/);
});
test('remote trust, revocation, active employee and policy remain mandatory outside shifts',async()=>{
  for (const options of [{revoked:true},{deviceEmployee:'other'},{policy:false}]) {
    const f=fixture(options); await assert.rejects(f.service.login({login:'doctor@example.test',password:'x'},null,null,{accessType:'REMOTE',remoteDeviceToken:'x'}));
  }
  const f=fixture(); f.employee.status='BLOCKED'; await assert.rejects(f.service.login({login:'doctor@example.test',password:'x'},null,null,{accessType:'REMOTE',remoteDeviceToken:'x'}));
});
test('director write access does not inherit the new read-only shift exemption',async()=>{
  const f=fixture({roles:['director']}); await assert.rejects(f.service.login({login:'director@example.test',password:'x'},null,null,{accessType:'REMOTE',remoteDeviceToken:'x'}),/смен/);
});
test('read-only session stays valid outside shifts but all clinical mutation verbs fail',async()=>{
  const f=fixture(); f.service.touchSession=async()=>{};
  f.prisma.session.findUnique=async()=>({id:'s',userId:'u',accessType:'REMOTE',remoteDeviceId:'d',remoteDevice:f.device,expiresAt:new Date(Date.now()+60000),user:{employee:f.employee,mustChangePassword:false}});
  const guard=new SessionAuthGuard({getAllAndOverride:()=>false},f.prisma,f.service,{log:async()=>{}});
  const request={headers:{cookie:`${SESSION_COOKIE_NAME}=token`},method:'GET',originalUrl:'/api/v1/visits'};
  const ctx={getHandler:()=>{},getClass:()=>{},switchToHttp:()=>({getRequest:()=>request})};
  assert.equal(await guard.canActivate(ctx),true);
  for (const method of ['POST','PATCH','PUT','DELETE']) { request.method=method; await assert.rejects(guard.canActivate(ctx),/просмотр/); }
  request.method='GET'; f.device.employeeId='other'; await assert.rejects(guard.canActivate(ctx),/отозвано/);
});
