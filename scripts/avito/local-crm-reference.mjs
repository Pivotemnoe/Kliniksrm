import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const MAX_AGE = 24 * 3600000;
export function validateLocalReference(raw, now = new Date()) {
  if (!raw || raw.source !== 'clinic-crm-postgres/Service+ClinicOffice' || raw.readOnly !== true
    || !Array.isArray(raw.services) || !raw.services.length || raw.services.length > 5000
    || !Array.isArray(raw.offices) || !raw.offices.length || raw.offices.length > 20) throw Error('Нужен экспорт справочников из рабочей CRM в режиме чтения');
  const capturedAt = new Date(raw.capturedAt);
  if (!Number.isFinite(capturedAt.getTime()) || now - capturedAt > MAX_AGE || capturedAt - now > 300000) throw Error('Обновите локальный снимок справочников CRM: он старше суток или имеет неверную дату');
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
  const money = value => value === null || Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 9999999999.99;
  for (const service of raw.services) if (!id(service.id) || typeof service.title !== 'string' || !service.title.trim() || service.title.length > 2000
    || !['FIXED', 'FLOATING'].includes(service.priceType) || ![service.price, service.minimumPrice, service.maximumPrice].every(money)) throw Error('Некорректная услуга в снимке CRM');
  for (const office of raw.offices) if (!id(office.id) || typeof office.name !== 'string' || !office.name.trim()
    || ![office.phone, office.address].every(value => value === null || typeof value === 'string')
    || typeof office.timezone !== 'string' || !office.workingHours || typeof office.workingHours !== 'object' || Array.isArray(office.workingHours)) throw Error('Некорректная карточка филиала CRM');
  if (new Set(raw.services.map(s => s.id)).size !== raw.services.length || new Set(raw.offices.map(o => o.id)).size !== raw.offices.length) throw Error('Повторяющиеся идентификаторы в справочнике');
  if (raw.vaccineAvailability !== undefined && (!Array.isArray(raw.vaccineAvailability) || raw.vaccineAvailability.length > 20)) throw Error('Некорректный снимок наличия вакцин');
  for (const office of raw.vaccineAvailability || []) {
    if (!raw.offices.some(o => o.id === office.officeId) || !Array.isArray(office.products) || office.products.length > 50) throw Error('Некорректный филиал снимка вакцин');
    for (const p of office.products) if (!id(p.id) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 1000 || !['AVAILABLE', 'NOT_AVAILABLE'].includes(p.status)) throw Error('Некорректная позиция вакцины');
  }
  return { ...raw, capturedAt: capturedAt.toISOString() };
}

export async function importLocalReference(prisma, file, organizationId) {
  const raw = await readFile(file, 'utf8');
  const reference = validateLocalReference(JSON.parse(raw));
  // Caller binds Prisma to the dedicated pilot DB. No owners, patients, costs or stock are copied.
  await prisma.$transaction(async tx => {
    await tx.service.updateMany({ where: { id: { notIn: reference.services.map(s => s.id) } }, data: { isActive: false } });
    for (const service of reference.services) {
      const data = { title: service.title, priceType: service.priceType, price: service.price, minimumPrice: service.minimumPrice, maximumPrice: service.maximumPrice, isActive: true };
      await tx.service.upsert({ where: { id: service.id }, create: { id: service.id, ...data }, update: data });
    }
    for (const office of reference.offices) {
      const data = { organizationId, name: office.name, phone: office.phone, address: office.address, timezone: office.timezone, workingHours: office.workingHours };
      await tx.clinicOffice.upsert({ where: { id: office.id }, create: { id: office.id, ...data }, update: data });
    }
  }, { timeout: 30000 });
  return { kind: 'LOCAL_SNAPSHOT', capturedAt: reference.capturedAt, services: reference.services.length, offices: reference.offices.length,
    sha256: createHash('sha256').update(raw).digest('hex'), vaccineProducts: reference.vaccineAvailability?.reduce((n, office) => n + office.products.length, 0) ?? 0, stale: false };
}

export const referenceStale = reference => !reference || Date.now() - new Date(reference.capturedAt).getTime() > MAX_AGE;
export const inventoryStale = reference => !reference || Date.now() - new Date(reference.capturedAt).getTime() > 15 * 60000;
