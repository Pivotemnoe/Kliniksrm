const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const m=JSON.parse(fs.readFileSync('/release/manifest.json','utf8'));
for(const f of m.files.filter(x=>x.name.startsWith('api/')))assert.equal(crypto.createHash('sha256').update(fs.readFileSync('/app/apps/api/dist/modules/'+f.name.slice(4))).digest('hex'),f.sha256);
const guard=fs.readFileSync('/app/apps/api/dist/modules/auth/session-auth.guard.js','utf8');
assert.match(guard,/session\.findUnique/);assert.match(guard,/permissionOverrides/);assert.match(guard,/serializeEmployee/);
console.log(JSON.stringify({compiledVerified:true,sessionPermissionLookupPreserved:true}));
