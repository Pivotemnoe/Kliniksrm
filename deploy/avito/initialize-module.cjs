// Run once by the authorized release operator, inside the qualified API container.
// No session, user, role override, appointment or outgoing message is created.
const { createRequire } = require('node:module');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const requireApi = createRequire('/app/apps/api/package.json');
requireApi('reflect-metadata');
const { PrismaClient } = requireApi('@prisma/client');
const from = name => requireApi(`/app/apps/api/dist/modules/${name}.js`);
const { AuditService } = from('audit/audit.service');
const { SupportService } = from('support/support.service');
const { AuthService } = from('auth/auth.service');
const { ClinicModulesService } = from('clinic-modules/clinic-modules.service');
const { AvitoService } = from('avito/avito.service');
const { AvitoApiClient } = from('avito/avito-api.client');
const { AvitoCrmKnowledgeService } = from('avito/avito-crm-knowledge.service');
const { AvitoModelGatewayClient } = from('avito/avito-model-gateway.client');
const { AvitoEditorService } = from('avito/avito-editor.service');
const { parseAvitoSettings } = from('avito/avito.settings');
const prisma = new PrismaClient();
async function main() {
  if (process.env.AVITO_RELEASE_EXECUTE !== 'clinic-20261020') throw Error('Explicit release execution marker required');
  for (const flag of ['AVITO_INGEST_ENABLED', 'AVITO_LIVE_SEND_ENABLED', 'AVITO_AI_ENABLED']) if (process.env[flag] !== 'false') throw Error('Initial external switch must be false: ' + flag);
  const actorId = process.env.AVITO_RELEASE_ACTOR_ID;
  if (!actorId) throw Error('A real director actor is required');
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: actorId }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissionOverrides: { include: { permission: true } } } });
  const actor = AuthService.prototype.serializeEmployee(employee);
  if (actor.status !== 'ACTIVE' || !actor.roles.includes('director') || !actor.permissions.includes('avito.manage')) throw Error('Director authorization does not allow this installation');
  const directory = path.dirname(__filename);
  const plan = JSON.parse(await readFile(path.join(directory, 'clinic-settings.json'), 'utf8'));
  const settings = parseAvitoSettings({ ...plan.settings, mode: 'MANUAL' });
  if (settings.profiles.filter(x => x.enabled).map(x => x.direction).join(',') !== 'CLINIC' || settings.clinicProgrammeTable.prices.length !== 8) throw Error('Only the approved clinical setup may be installed');
  const audit = new AuditService(prisma);
  const support = new SupportService(prisma, audit, undefined);
  const modules = new ClinicModulesService(prisma, audit, support);
  const api = new AvitoApiClient();
  const model = new AvitoModelGatewayClient();
  const avito = new AvitoService(prisma, modules, api, audit, new AvitoCrmKnowledgeService(prisma), model);
  const editor = new AvitoEditorService(prisma, avito, api, audit, model);
  const profile = await api.self();
  if (String(profile.id) !== String(plan.expectedAvitoAccountId)) throw Error('Connected Avito account differs from the approved clinic account');
  // All seven drafts belong to this same verified account. Share each bounded
  // read of its inventory during this import instead of rereading five statuses
  // for every draft. This cache exists only for the lifetime of the release job.
  const inventory = new Map();
  const ownListings = api.ownListings.bind(api);
  api.ownListings = (page = 1, status = 'all') => {
    const key = `${page}:${status}`;
    if (!inventory.has(key)) inventory.set(key, ownListings(page, status));
    return inventory.get(key);
  };
  let integration = await avito.integration();
  if (JSON.stringify(integration.settings) !== JSON.stringify(settings)) await avito.updateSettings({ version: integration.settingsVersion, settings }, actor.id);
  const installation = await modules.installation('avito-administrator');
  if (!installation.enabled) await modules.setEnabled('avito-administrator', true, installation.version, actor.id);
  const connection = await avito.checkConnection(actor.id);
  const adsFile = path.join(directory, 'reviewed/ads.json');
  const ads = JSON.parse(await readFile(adsFile, 'utf8')).ads;
  const drafts = [];
  for (const ad of ads) {
    if (!/^[a-z0-9-]+$/.test(ad.slug)) throw Error('Invalid reviewed draft key');
    let draft = await editor.create({ clientKey: 'clinic-release-20261020-' + ad.slug, direction: 'CLINIC', ...(ad.sourceListingId ? { sourceListingId: ad.sourceListingId } : {}) }, actor.id);
    // A later staff edit is preserved when an interrupted initialization is resumed.
    if (draft.version === 1) draft = await editor.save(draft.id, { version: draft.version, content: { ...draft.content, title: ad.title, description: ad.description, serviceId: ad.serviceId ?? null, officeId: ad.officeId, brief: ad.priceNote } }, actor.id);
    for (const photo of ad.photos.filter(name => name.endsWith('.jpg'))) {
      if (!/^photos\/[a-zA-Z0-9_-]+\.jpg$/.test(photo)) throw Error('Unexpected reviewed photo path');
      const bytes = await readFile(path.join(directory, 'reviewed', photo));
      draft = await editor.upload(draft.id, draft.version, { originalname: path.basename(photo), mimetype: 'image/jpeg', buffer: bytes, size: bytes.length }, actor.id);
    }
    const saved = await editor.get(draft.id);
    if (saved.status !== 'DRAFT' || saved.approvalCurrent || saved.content.description !== ad.description || saved.title !== ad.title) throw Error('Persisted draft differs from the reviewed content');
    drafts.push({ id: saved.id, slug: ad.slug, status: saved.status, photos: saved.content.photoIds.length, approvalCurrent: saved.approvalCurrent, warnings: saved.issues });
  }
  integration = await avito.integration();
  const receipt = { at: new Date().toISOString(), actorId: actor.id, module: integration.installation.moduleKey, enabled: integration.installation.enabled, mode: integration.settings.mode, enabledDirections: integration.settings.profiles.filter(x => x.enabled).map(x => x.direction), programmeVariants: integration.settings.clinicProgrammeTable.prices.length, connection, drafts, outgoingCreated: false, appointmentsCreated: false, externalWorkersEnabled: false };
  await writeFile(path.join(directory, 'initialization-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
