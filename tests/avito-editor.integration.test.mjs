import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { avitoFixture } from './helpers/avito-fixture.mjs';
const require = createRequire(import.meta.url);
const { unzipSync, strFromU8 } = require('fflate');
const { Reflector } = require('@nestjs/core');
const { PermissionsGuard } = require('../apps/api/dist/modules/auth/permissions.guard.js');
const { AvitoEditorController } = require('../apps/api/dist/modules/avito/avito-editor.controller.js');
const { AvitoApiClient } = require('../apps/api/dist/modules/avito/avito-api.client.js');
const { checkedImage, parseListingContent } = require('../apps/api/dist/modules/avito/avito-editor.policy.js');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6wH8AAAAASUVORK5CYII=', 'base64');
const image = () => ({ originalname: '../../sample.png', mimetype: 'image/png', size: png.length, buffer: png });

test('every editor endpoint, including photos, packages, AI and access checks, requires a director with avito.manage', () => {
  const guard = new PermissionsGuard(new Reflector());
  const allowed = (method, roles, permissions) => guard.canActivate({ getHandler: () => AvitoEditorController.prototype[method], getClass: () => AvitoEditorController, switchToHttp: () => ({ getRequest: () => ({ auth: { employee: { roles, permissions } } }) }) });
  for (const method of Object.getOwnPropertyNames(AvitoEditorController.prototype).filter(x => x !== 'constructor')) {
    assert.equal(allowed(method, ['director'], ['avito.manage']), true);
    for (const role of ['administrator','doctor']) assert.throws(() => allowed(method, [role], ['avito.read','avito.operate','avito.manage']));
    assert.throws(() => allowed(method, ['director'], ['avito.read']));
  }
});
test('editor accepts only the intended fields and supported raster formats, strips file paths and rejects mismatches', () => {
  assert.throws(() => parseListingContent({ title: 'x', livePublishingEnabled: true }), /Неизвестное/);
  assert.throws(() => parseListingContent({ photoIds: ['a','a'] }), /фотографий/);
  assert.throws(() => parseListingContent({ title: 'a'.repeat(101) }));
  assert.equal(checkedImage(image()).originalName, 'sample.png');
  assert.throws(() => checkedImage({ ...image(), mimetype: 'image/jpeg' }), /Содержимое/);
  assert.throws(() => checkedImage({ ...image(), buffer: Buffer.from('<svg onload=alert(1)>aaaa</svg>'), size: 31 }));
});
test('publishing introspection validates the account and performs no record-changing request, including after a 403', async () => {
  const oldFetch = global.fetch; const prior = { id: process.env.AVITO_CLIENT_ID, secret: process.env.AVITO_CLIENT_SECRET, file: process.env.AVITO_CREDENTIALS_FILE };
  process.env.AVITO_CLIENT_ID = 'synthetic-id'; process.env.AVITO_CLIENT_SECRET = 'synthetic-secret'; delete process.env.AVITO_CREDENTIALS_FILE;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method || 'GET' });
    if (url.endsWith('/token')) return Response.json({ access_token: 'synthetic-access', expires_in: 3600 });
    if (url.endsWith('/self')) return Response.json({ id: 900001 });
    if (url.endsWith('/profile')) return Response.json({ error: { message: 'private details must not escape' } }, { status: 403 });
    if (url.endsWith('/fields')) return Response.json({ node: { slug: 'uhod_za_zhivotnymi' }, fields: ['Id','Title','Description','AvitoId','Images'].map(tag => ({ tag })) });
    throw Error('Unexpected network request');
  };
  try {
    const api = new AvitoApiClient(); const result = await api.publishingAccess('900001');
    assert.equal(result.profileHttpStatus, 403); assert.equal(result.writeTested, false); assert.equal(result.livePublishingEnabled, false);
    assert.ok(result.operations.every(operation => operation.schemaSupported && operation.access === 'BLOCKED'));
    assert.ok(!JSON.stringify(result).includes('private details')); assert.deepEqual(calls.filter(x => x.method !== 'GET').map(x => x.path), ['/token']);
    const before = calls.length; await assert.rejects(() => api.publishingAccess('900002'), /другому профилю/); assert.equal(calls.length, before + 1);
  } finally { global.fetch = oldFetch; for (const [key,value] of [['AVITO_CLIENT_ID',prior.id],['AVITO_CLIENT_SECRET',prior.secret],['AVITO_CREDENTIALS_FILE',prior.file]]) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('editor saves versioned local drafts, scopes media and references, invalidates approval and never changes Avito', { skip: !process.env.AVITO_QA_DATABASE_URL }, async t => {
  const f = await avitoFixture(); const { prisma, editor, actorId } = f; const run = randomUUID(); const ids = [];
  const service = await prisma.service.create({ data: { title: `Редактор тест ${run}`, price: 1300, isActive: true } });
  const office = await prisma.clinicOffice.create({ data: { organizationId: 'avito-qa-org', name: 'Филиал редактора', address: 'Тестовый адрес 1', phone: '+7 900 000-00-01' } });
  const otherOrg = await prisma.organization.create({ data: { displayName: 'Чужая тестовая организация', createdAt: new Date('2030-01-01') } });
  const foreignOffice = await prisma.clinicOffice.create({ data: { organizationId: otherOrg.id, name: 'Чужой филиал' } });
  let draft; let oldRevision;
  const make = async sourceListingId => { const dto = { clientKey: randomUUID(), direction: 'CLINIC', ...(sourceListingId ? { sourceListingId } : {}) }; const d = await editor.create(dto, actorId); ids.push(d.id); return { dto, draft: d }; };
  try {
    await t.test('create retries return the same draft; existing listings are verified and only the title is imported', async () => {
      const made = await make('101'); draft = made.draft;
      assert.equal((await editor.create(made.dto, actorId)).id, draft.id); assert.equal(draft.sourceListingId, '101'); assert.equal(draft.content.description, ''); assert.equal(draft.content.photoIds.length, 0);
      await assert.rejects(() => editor.create({ ...made.dto, direction: 'HOTEL' }, actorId), /уже использован/);
      await assert.rejects(() => make('999999'), /не найдено/);
    });
    await t.test('save validates the owning clinic, rejects invented fields, persists content and prevents stale overwrites', async () => {
      const data = { ...draft.content, title: 'Вакцинация животных', description: 'Организационные вопросы вакцинации и запись через администратора.', serviceId: service.id, officeId: office.id, brief: 'Спокойно объяснить порядок обращения' };
      await assert.rejects(() => editor.save(draft.id, { version: draft.version, content: { ...data, officeId: foreignOffice.id } }, actorId), /не относится/);
      draft = await editor.save(draft.id, { version: draft.version, content: data }, actorId); oldRevision = draft.version;
      assert.equal((await editor.get(draft.id)).content.description, data.description); assert.equal(draft.facts.service.priceText, '1 300 ₽');
      await assert.rejects(() => editor.save(draft.id, { version: 1, content: data }, actorId), /изменился/);
    });
    await t.test('photos stay private, deduplicate by bytes, and cannot be attached to another draft', async () => {
      draft = await editor.upload(draft.id, draft.version, image(), actorId); const version = draft.version;
      assert.equal(draft.content.photoIds.length, 1); assert.equal(draft.media[0].originalName, 'sample.png'); assert.ok(!JSON.stringify(draft).includes('iVBOR'));
      assert.equal((await editor.upload(draft.id, draft.version, image(), actorId)).version, version);
      assert.deepEqual(Buffer.from((await editor.media(draft.id, draft.media[0].id)).bytes), png);
      const jpg = readFileSync('apps/web/public/brand/temichevvet-logo.jpg');
      draft = await editor.upload(draft.id, draft.version, { originalname: 'logo.jpg', mimetype: 'image/jpeg', size: jpg.length, buffer: jpg }, actorId);
      const reordered = [...draft.content.photoIds].reverse();
      draft = await editor.save(draft.id, { version: draft.version, content: { ...draft.content, photoIds: reordered } }, actorId);
      assert.deepEqual((await editor.get(draft.id)).content.photoIds, reordered);
      const second = (await make()).draft;
      await assert.rejects(() => editor.save(second.id, { version: second.version, content: { ...second.content, photoIds: draft.content.photoIds } }, actorId), /не принадлежит/);
      await assert.rejects(() => editor.media(second.id, draft.media[0].id), /не найдена/);
    });
    await t.test('template generation uses live CRM facts, AI is optional, and generation does not save or publish', async () => {
      const before = draft.version; const result = await editor.generate(draft.id, { version: before, mode: 'TEMPLATE', clientKey: randomUUID() });
      assert.equal(result.saved, false); assert.match(result.description, /1.?300/); assert.equal((await editor.get(draft.id)).version, before);
      await prisma.service.update({ where: { id: service.id }, data: { price: 0 } });
      const unknown = await editor.generate(draft.id, { version: before, mode: 'TEMPLATE', clientKey: randomUUID() });
      assert.match(unknown.description, /Стоимость уточнит администратор/); assert.ok(!unknown.description.includes('0 ₽'));
      await prisma.service.update({ where: { id: service.id }, data: { price: 1300 } });
      const previous = f.model.generateCopy; f.model.generateCopy = async () => null;
      await assert.rejects(() => editor.generate(draft.id, { version: before, mode: 'AI', clientKey: randomUUID() }), /недоступен/); f.model.generateCopy = previous;
    });
    await t.test('approval enables only a manual package and current CRM changes require review again', async () => {
      draft = await editor.save(draft.id, { version: draft.version, content: { ...draft.content, description: `${draft.content.description}\nСтоимость: 1 300 ₽.` } }, actorId);
      draft = await editor.approve(draft.id, draft.version, actorId); assert.equal(draft.approvalCurrent, true);
      const files = unzipSync(await editor.export(draft.id)); assert.equal(Object.keys(files).filter(name => name.startsWith('photos/')).length, 2);
      const manifest = JSON.parse(strFromU8(files['manifest.json'])); assert.equal(manifest.sourceListingId, '101'); assert.equal(manifest.automaticPublishing, false); assert.equal(manifest.kind, 'MANUAL_PLACEMENT_PACKAGE'); assert.equal('feed.xml' in files, false);
      assert.ok(manifest.photos[0].includes(draft.content.photoIds[0]));
      await prisma.service.update({ where: { id: service.id }, data: { price: 1700 } });
      assert.equal((await editor.get(draft.id)).approvalCurrent, false); await assert.rejects(() => editor.export(draft.id), /Данные CRM могли измениться/);
      await assert.rejects(() => editor.approve(draft.id, draft.version, actorId), /Цена в описании отличается/);
      draft = await editor.save(draft.id, { version: draft.version, content: { ...draft.content, description: draft.content.description.replace('1 300 ₽','1 700 ₽') } }, actorId);
      draft = await editor.approve(draft.id, draft.version, actorId); assert.match(draft.facts.service.priceText, /1.?700/);
      draft = await editor.save(draft.id, { version: draft.version, content: { ...draft.content, description: draft.content.description + '\nПодробности в переписке.' } }, actorId); assert.equal(draft.approvalCurrent, false); assert.equal(draft.status, 'DRAFT');
    });
    await t.test('restoration creates a new draft revision and keeps previous photographs recoverable', async () => {
      const version = draft.version; draft = await editor.restore(draft.id, version, oldRevision, actorId);
      assert.equal(draft.version, version + 1); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.content.photoIds.length, 0); assert.equal(draft.media.length, 2);
      assert.ok(draft.revisions.some(value => value.version === version));
    });
    await t.test('access checks persist only safe metadata, while publication is refused by the server', async () => {
      const sent = f.api.sent.length; const check = await editor.check(actorId); assert.equal(check.writeTested, false);
      assert.equal((await editor.catalog()).publishingCheck.profileHttpStatus, 403); assert.throws(() => editor.publish(), /отключены/); assert.equal(f.api.sent.length, sent);
      const foreign = await prisma.clinicModuleInstallation.create({ data: { organizationId: otherOrg.id, moduleKey: 'avito-administrator' } });
      const foreignIntegration = await prisma.avitoIntegration.create({ data: { installationId: foreign.id, settings: f.settings } });
      const stranger = await prisma.avitoListingDraft.create({ data: { integrationId: foreignIntegration.id, clientKey: randomUUID(), title: 'private', content: {}, createdBy: actorId } });
      try { await assert.rejects(() => editor.get(stranger.id), /не найден/); await assert.rejects(() => editor.save(stranger.id, { version: 1, content: {} }, actorId), /не найден/); }
      finally { await prisma.avitoListingDraft.delete({ where: { id: stranger.id } }); await prisma.avitoIntegration.delete({ where: { id: foreignIntegration.id } }); await prisma.clinicModuleInstallation.delete({ where: { id: foreign.id } }); }
    });
  } finally {
    await prisma.avitoListingDraftRevision.deleteMany({ where: { draftId: { in: ids } } }); await prisma.avitoListingMedia.deleteMany({ where: { draftId: { in: ids } } }); await prisma.avitoListingDraft.deleteMany({ where: { id: { in: ids } } });
    await prisma.service.delete({ where: { id: service.id } }); await prisma.clinicOffice.deleteMany({ where: { id: { in: [office.id, foreignOffice.id] } } }); await prisma.organization.delete({ where: { id: otherOrg.id } }); await prisma.$disconnect();
  }
});
