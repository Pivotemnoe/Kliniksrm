import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
require('reflect-metadata');
const ts = require('typescript');
const { ValidationPipe } = require('@nestjs/common');
const { CreateTaskDto } = require('../apps/api/dist/modules/tasks/dto/create-task.dto.js');
const { UpdateTaskDto } = require('../apps/api/dist/modules/tasks/dto/update-task.dto.js');
const source = await readFile(new URL('../apps/web/src/features/tasks/TaskFormDrawer.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('TaskFormDrawer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TaskFormDrawer');
const submit = component.body.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'submit');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const dates = {};
vm.runInNewContext(compile(await readFile(new URL('../apps/web/src/shared/utils/date.ts', import.meta.url), 'utf8')), { exports: dates });
const code = compile(submit.getText(ast));
function payload(overrides = {}, isEdit = false) {
  let result;
  const handler = vm.runInNewContext(`${code}; submit`, { isEdit, fromDatetimeLocal: dates.fromDatetimeLocal, onSubmit: body => { result = JSON.parse(JSON.stringify(body)); } });
  handler({ title: 'Контроль лечения', taskType: null, ownerId: null, animalId: null, assigneeMode: 'none', assigneeId: null, assigneeRoleCode: null, dueAt: null, status: 'OPEN', comment: null, ...overrides });
  return result;
}
const validate = (body, metatype) => new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }).transform(body, { type: 'body', metatype });

test('new task from the actual form passes the unchanged strict create DTO', async () => {
  const body = payload();
  const dto = await validate(body, CreateTaskDto);
  assert.equal(dto.title, 'Контроль лечения');
  assert.equal(Object.hasOwn(body, 'status'), false);
});

test('a new form never submits a stale edit status', async () => {
  for (const status of ['OPEN', 'DONE', 'CANCELLED', 'ARCHIVED']) {
    const body = payload({ status });
    await validate(body, CreateTaskDto);
    assert.equal(Object.hasOwn(body, 'status'), false);
  }
});

test('create retains patient, employee, due date and comment', async () => {
  const values = { ownerId: 'd3519000-0000-4000-8000-000000000100', animalId: 'd3519000-0000-4000-8000-000000000200', assigneeMode: 'employee', assigneeId: '066a9b81-b745-42f0-8b72-0ec12f99b25b', assigneeRoleCode: 'doctor', taskType: 'follow_up', dueAt: '2026-10-20T15:30', comment: 'Позвонить владельцу' };
  const body = payload(values);
  const dto = await validate(body, CreateTaskDto);
  assert.equal(dto.ownerId, values.ownerId);
  assert.equal(dto.animalId, values.animalId);
  assert.equal(dto.assigneeId, values.assigneeId);
  assert.equal(dto.assigneeRoleCode, null);
  assert.equal(dto.dueAt, new Date(values.dueAt).toISOString());
  assert.equal(dto.taskType, values.taskType);
  assert.equal(dto.comment, values.comment);
});

test('create retains role assignment and clears the inactive employee choice', async () => {
  const body = payload({ assigneeMode: 'role', assigneeId: '066a9b81-b745-42f0-8b72-0ec12f99b25b', assigneeRoleCode: 'doctor' });
  const dto = await validate(body, CreateTaskDto);
  assert.equal(dto.assigneeRoleCode, 'doctor');
  assert.equal(dto.assigneeId, null);
});

test('editing still submits each selected status through the strict update DTO', async () => {
  for (const status of ['OPEN', 'DONE', 'CANCELLED', 'ARCHIVED']) {
    const body = payload({ status }, true);
    const dto = await validate(body, UpdateTaskDto);
    assert.equal(dto.status, status);
  }
});

test('strict API validation still rejects unsupported create fields', async () => {
  await assert.rejects(validate({ title: 'Контроль лечения', status: 'OPEN' }, CreateTaskDto), error => error.getStatus() === 400 && error.getResponse().message.includes('property status should not exist'));
});
