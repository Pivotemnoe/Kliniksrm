const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const m=require('/opt/source-manifest.json'),{Prisma}=require('/app/node_modules/@prisma/client');
assert.equal(require('/app/node_modules/prisma/package.json').version,'6.19.3');
assert.equal(require('/app/node_modules/@prisma/client/package.json').version,'6.19.3');
assert.equal(Prisma.prismaVersion.engine,m.baseline.prismaEngine);
const schema=fs.readFileSync('/app/node_modules/.prisma/client/schema.prisma');
assert.equal(crypto.createHash('sha256').update(schema).digest('hex'),m.baseline.schemaSha256);
fs.writeFileSync('/opt/baseline-datamodel.json',JSON.stringify(Prisma.dmmf.datamodel));
