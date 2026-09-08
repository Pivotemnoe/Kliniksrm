import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(relative, dependencies = {}) {
  const source = readFileSync(new URL(`../apps/web/src/${relative}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const dates = load('shared/utils/animalBirthDate.ts');
const writes = [];
const logic = load('features/animals/registrationAnimal.ts', {
  '../../shared/utils/animalBirthDate': dates,
  './animals.api': { updateAnimal: async (...args) => { writes.push(args); } },
  '../../app/queryClient': { queryClient: { invalidateQueries: async () => {} } },
});
const animal = { id:'a', ownerId:'o', nickname:'Лео', species:'Кошка', breed:null, sex:'UNKNOWN', birthDate:null, color:'Рыжий', microchip:'123' };

test('existing patient with missing imported demographics can be booked unchanged without a write', async () => {
  const edit = logic.buildRegistrationAnimalEdit(animal, logic.registrationAnimalValues(animal));
  assert.deepEqual(edit.changes, {});
  assert.equal(edit.error, undefined);
  const count = writes.length;
  await logic.saveRegistrationAnimalEdit(edit, 'a', 'o');
  assert.equal(writes.length, count);
});
test('only edited fields are sent to the same patient, preserving unrelated clinical details', async () => {
  const edit = logic.buildRegistrationAnimalEdit(animal, { ...logic.registrationAnimalValues(animal), sex:'MALE', breed:'Со слов владельца', birthDate:'2020' });
  assert.deepEqual(edit.changes, { sex:'MALE', breed:'Со слов владельца', birthDate:'2020-01-01' });
  await logic.saveRegistrationAnimalEdit(edit, 'a', 'o');
  assert.deepEqual(writes.at(-1), ['a', edit.changes]);
});
test('switching the patient or owner cannot apply the previous patients draft', async () => {
  const edit = logic.buildRegistrationAnimalEdit(animal, { ...logic.registrationAnimalValues(animal), sex:'FEMALE' });
  await assert.rejects(logic.saveRegistrationAnimalEdit(edit, 'b', 'o'), /Пациент изменился/);
  await assert.rejects(logic.saveRegistrationAnimalEdit(edit, 'a', 'another-owner'), /Пациент изменился/);
});
test('unchanged dates are not rewritten and invalid or future dates are rejected', () => {
  const dated = {...animal,birthDate:'2020-02-03T00:00:00.000Z'};
  assert.deepEqual(logic.buildRegistrationAnimalEdit(dated,logic.registrationAnimalValues(dated)).changes,{});
  for (const birthDate of ['31.02.2020','2100','']) {
    assert.ok(logic.buildRegistrationAnimalEdit(dated,{...logic.registrationAnimalValues(dated),birthDate}).error);
  }
  assert.equal(logic.buildRegistrationAnimalEdit(animal,{...logic.registrationAnimalValues(animal),birthDate:'06.2020'}).changes.birthDate,'2020-06-01');
});
test('invalid edits never silently proceed to registration', async () => {
  const edit = logic.buildRegistrationAnimalEdit(animal,{...logic.registrationAnimalValues(animal),nickname:''});
  const count=writes.length;
  await assert.rejects(logic.saveRegistrationAnimalEdit(edit,'a','o'),/Не удаляйте/);
  assert.equal(writes.length,count);
});

test('registration updates the existing animal before queue creation and strips the edit envelope', async () => {
  const order=[];
  const queue=load('features/queue/createQueueEntryFromForm.ts',{
    '../owners/owners.api':{createOwner:()=>assert.fail('No duplicate owner'),createOwnerAnimal:()=>assert.fail('No duplicate animal')},
    './queue.api':{createQueueEntry:async(input)=>{order.push('queue');assert.equal('animalEdit' in input,false);return input;}},
    '../animals/registrationAnimal':{saveRegistrationAnimalEdit:async(edit,id,ownerId)=>{order.push('animal');assert.equal(id,'a');assert.equal(ownerId,'o');if(edit.error)throw new Error(edit.error);}},
  });
  await queue.createQueueEntryFromForm({ownerId:'o',animalId:'a',animalEdit:{changes:{sex:'MALE'}}});
  assert.deepEqual(order,['animal','queue']);
  order.length=0;
  await assert.rejects(queue.createQueueEntryFromForm({ownerId:'o',animalId:'a',animalEdit:{error:'save failed'}}));
  assert.deepEqual(order,['animal']);
});

const { OwnersService } = require('../apps/api/dist/modules/owners/owners.service.js');
test('owner last visit uses newest non-cancelled history without exposing the visit list', async () => {
  const date=new Date('2026-09-07T12:00:00Z');
  const service=new OwnersService({owner:{findUnique:async(query)=>{
    assert.deepEqual(query.include.visits,{where:{status:{not:'CANCELLED'}},orderBy:{startedAt:'desc'},take:1,select:{startedAt:true}});
    return {id:'o',visits:[{startedAt:date}]};
  }}},{},{});
  assert.deepEqual(await service.getOwner('o'),{id:'o',lastVisitAt:date});
});
test('animal history is scoped to the owner, keeps birth date and sex, and distinguishes no visits', async () => {
  const service=new OwnersService({owner:{findUnique:async()=>({id:'o'})},animal:{findMany:async(query)=>{
    assert.deepEqual(query.where,{ownerId:'o',archivedAt:null});
    assert.equal(query.include.visits.take,1);
    assert.equal(query.include.visits.where.status.not,'CANCELLED');
    return [{...animal,visits:[]},{...animal,id:'b',visits:[{startedAt:'2026-09-06'}]}];
  }}},{},{});
  const result=await service.listOwnerAnimals('o');
  assert.equal(result[0].lastVisitAt,null);
  assert.equal(result[0].sex,'UNKNOWN');
  assert.equal(result[1].lastVisitAt,'2026-09-06');
  assert.equal('visits' in result[1],false);
});
