import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Windows startup and updater reject conflicting release overrides before import', async()=>{
  for(const name of ['start-clinic-server','update-clinic-server']){
    const source=await readFile(`scripts/${name}.ps1`,'utf8');
    const body=source.split('function Import-RuntimeEnvOverrides {')[1].split('function ')[0];
    assert.match(body,/Assert-ReleaseOverridesConsistent \$EnvFile \$RuntimeEnvFile/);
    assert.ok(body.indexOf('Assert-ReleaseOverridesConsistent')<body.indexOf('SetEnvironmentVariable'));
  }
  const starter=await readFile('scripts/start-clinic-server.ps1','utf8');
  assert.match(starter,/\$Build -or \$NoImageUpdate -or !\$UpdateImages/);
  assert.match(starter,/Refusing to replace the installed release with old local images/);
});
