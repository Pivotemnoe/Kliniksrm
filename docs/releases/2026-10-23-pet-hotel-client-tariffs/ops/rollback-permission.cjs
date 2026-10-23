const {createRequire}=require('node:module'),fs=require('node:fs');
const req=createRequire('/app/apps/api/package.json'),{PrismaClient}=req('@prisma/client'),db=new PrismaClient();
const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
(async()=>{await db.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020,3)`;
 const rows=await tx.$queryRawUnsafe('SELECT id,checksum FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL',plan.migration);
 if(rows.length!==1||rows[0].checksum!==plan.migrationSha256)throw Error('Rollback migration identity differs');
 const later=await tx.$queryRawUnsafe('SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE migration_name>$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL',plan.migration);
 if(later[0].n)throw Error('A later migration must be reviewed before rollback');
 if(!plan.adminHadManage){const role=await tx.role.findUniqueOrThrow({where:{code:'administrator'}}),permission=await tx.permission.findUniqueOrThrow({where:{code:'pet_hotel.manage'}});await tx.rolePermission.deleteMany({where:{roleId:role.id,permissionId:permission.id}});}
 await tx.$executeRawUnsafe('DELETE FROM "_prisma_migrations" WHERE id=$1 AND checksum=$2',rows[0].id,plan.migrationSha256);
 await tx.auditLog.create({data:{action:'deploy.pet_hotel.permission.rollback',entityType:'Release',entityId:plan.releaseId,metadata:{migration:plan.migration}}});
 },{timeout:15000});console.log(JSON.stringify({status:'PERMISSION_ROLLED_BACK',migration:plan.migration}));})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
