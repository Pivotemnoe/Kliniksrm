import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../apps/web/src/features/queue/workstationDevice.ts',import.meta.url),'utf8');
const script=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('plain HTTP without randomUUID keeps the same workstation across page loads',()=>{
 const stored=new Map();
 const load=()=>{const scope={exports:{},window:{crypto:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)}}};vm.runInNewContext(script,scope);return scope.exports.getQueueWorkstationDeviceId()};
 const first=load();assert.match(first,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(load(),first);assert.equal(load(),first);
});
