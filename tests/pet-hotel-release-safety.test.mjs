import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('gateway hotel configuration changes only the named module and preserves existing settings',()=>{
 const source=String.raw`
import ast,pathlib,tempfile,re
source=pathlib.Path('deploy/pet-hotel-integrated/release-gateway.py').read_text()
tree=ast.parse(source);wanted={'HOTEL_ENV','put_hotel_configuration','assert_environment'}
parts=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in wanted for t in n.targets)]
namespace={'re':re};exec(compile(ast.Module(body=parts,type_ignores=[]),'release-helpers','exec'),namespace)
with tempfile.TemporaryDirectory(prefix='hotel-release-config-') as folder:
 root=pathlib.Path(folder);namespace.update(ROOT=root,candidate={'reference':'candidate:verified'})
 (root/'.env').write_text('OWNER_GATEWAY_IMAGE=baseline:verified\nMAX_BOT_TOKEN=synthetic-preserve\nGROOMING_CRM_SYNC_ENABLED=true\n')
 before='services:\n  gateway:\n    image: '+chr(36)+'{OWNER_GATEWAY_IMAGE}\n    environment:\n      MAX_BOT_TOKEN: '+chr(36)+'{MAX_BOT_TOKEN}\n      GROOMING_CRM_SYNC_ENABLED: true\n  postgres:\n    image: postgres:pinned\nvolumes:\n  database:\n'
 (root/'docker-compose.yml').write_text(before)
 namespace['put_hotel_configuration']();text=(root/'docker-compose.yml').read_text()
 assert text[text.index('  postgres:'):]==before[before.index('  postgres:'):]
 assert 'MAX_BOT_TOKEN=synthetic-preserve' in (root/'.env').read_text()
 assert 'GROOMING_CRM_SYNC_ENABLED=true' in (root/'.env').read_text()
 assert text.count('      PET_HOTEL_CRM_SYNC_ENABLED:')==1
 try:namespace['put_hotel_configuration']();raise AssertionError('duplicate was accepted')
 except RuntimeError:pass
 old={'MAX_BOT_TOKEN':'preserve','GROOMING_CRM_SYNC_ENABLED':'true'}
 new={**old,**namespace['HOTEL_ENV'],'TEMICHEVVET_GIT_COMMIT':'candidate'}
 namespace['assert_environment'](old,new)
 for changed in [{**new,'MAX_BOT_TOKEN':'changed'},{**new,'GROOMING_CRM_SYNC_ENABLED':'false'},{**new,'SURPRISE':'added'}]:
  try:namespace['assert_environment'](old,changed);raise AssertionError('unrelated setting accepted')
  except RuntimeError:pass
print('PASS')
`;
 assert.equal(execFileSync('python3',['-c',source],{encoding:'utf8'}).trim(),'PASS');
});
test('release packet pins only the hotel migrations and leaves seeding disabled',()=>{
 const source=readFileSync('deploy/pet-hotel-integrated/prepare-context.mjs','utf8');
 assert.match(source,/20261020203000_pet_hotel_delivery_intent/);
 assert.match(source,/seedOnStart!==['"]false['"]/);
 const build=readFileSync('deploy/pet-hotel-integrated/build-clinic.ps1','utf8');
 assert.match(build,/Unrelated runtime changed/);assert.match(build,/Unexpected runtime file/);
 const release=readFileSync('deploy/pet-hotel-integrated/release-clinic.ps1','utf8');
 assert.match(release,/Protected Compose service changed/);assert.match(release,/FAILED_ROLLED_BACK/);
});
