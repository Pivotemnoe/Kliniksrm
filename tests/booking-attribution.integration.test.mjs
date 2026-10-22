import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { AuditService } = require('../apps/api/dist/modules/audit/audit.service.js');
const { ClinicModulesService } = require('../apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const { GroomingCrmService } = require('../apps/api/dist/modules/grooming/grooming.service.js');
const { GroomingSyncService } = require('../apps/api/dist/modules/grooming/grooming-sync.service.js');
const { GroomingBookDto } = require('../apps/api/dist/modules/grooming/grooming.dto.js');
const { PetHotelService } = require('../apps/api/dist/modules/pet-hotel/pet-hotel.service.js');
const { PetHotelOwnerService } = require('../apps/api/dist/modules/pet-hotel/pet-hotel-portal.service.js');
const { HotelOwnerBookDto } = require('../apps/api/dist/modules/pet-hotel/pet-hotel-portal.dto.js');
const { PetHotelBookingDto } = require('../apps/api/dist/modules/pet-hotel/pet-hotel.dto.js');
const { bookingAttribution } = require('../apps/api/dist/common/booking-attribution.js');
const url = process.env.BOOKING_ATTRIBUTION_TEST_DATABASE_URL;

test('referral validation accepts only the complete non-sensitive pair', async () => {
  const good = { source: 'AVITO', listingId: '8339919613' };
  assert.deepEqual(bookingAttribution(good), good);
  for (const value of [null, [], 'AVITO', {}, { source: 'AVITO' }, { listingId: '123' },
    { source: 'OTHER', listingId: '123' }, { source: 'AVITO', listingId: 123 },
    { source: 'AVITO', listingId: '0' }, { source: 'AVITO', listingId: '00123' },
    { source: 'AVITO', listingId: '1'.repeat(21) }, { ...good, phone: '+79990000000' },
    { source: 'AVITO', listingId: 'https://example.test/?token=never' }]) {
    assert.equal(bookingAttribution(value), undefined);
    const fields = { clientKey: randomUUID(), offerToken: 'x'.repeat(64), contactConsent: true, bookingConsent: true,
      ownerId: 'qa-owner', animalId: 'qa-pet', roomId: 'qa-room', startsAt: '2026-11-01T07:00:00Z', endsAt: '2026-11-03T07:00:00Z', walkCount: 0, notes: '' };
    for (const Dto of [GroomingBookDto, HotelOwnerBookDto, PetHotelBookingDto]) {
      const dto = plainToInstance(Dto, { ...fields, attribution: value });
      await validate(dto, { whitelist: true });
      assert.equal(dto.attribution, undefined);
    }
  }
});

test('real migration and owner commands preserve referral through save, retry, reopen and move', { skip: !url, timeout: 60000 }, async t => {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1'); assert.equal(parsed.port, '15508');
  assert.equal(parsed.pathname, '/booking_attribution_20261022'); assert.equal(parsed.username, 'booking_attribution_qa');
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => db.$disconnect());
  assert.equal(await db.organization.count(), 0, 'Run only against a fresh dedicated synthetic database');
  process.env.GROOMING_BOOKING_SIGNING_SECRET = 'local-referral-test-only-not-a-live-secret';
  process.env.PET_HOTEL_BOOKING_SIGNING_SECRET = 'local-hotel-referral-test-only-secret';
  await db.organization.create({ data: { displayName: 'Вымышленная клиника · источник записи' } });
  const employee = await db.employee.create({ data: { fullName: 'Вымышленный грумер', accountScope: 'GROOMING' } });
  const actor = { id: employee.id, roles: ['director'], permissions: ['pet_hotel.read', 'pet_hotel.operate', 'pet_hotel.manage'] };
  const owner = await db.owner.create({ data: { fullName: 'Вымышленный владелец', portalAccess: { create: { status: 'ENABLED' } } } });
  const other = await db.owner.create({ data: { fullName: 'Другой вымышленный владелец' } });
  const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Луна · пример', species: 'Кошка' } });
  const audit = new AuditService(db), modules = new ClinicModulesService(db, audit, { getLicenseState: async () => ({ enforcementActive: false, features: [] }) });
  const gi = await modules.installation('GROOMING'), hi = await modules.installation('PET_HOTEL');
  await db.clinicModuleInstallation.updateMany({ where: { id: { in: [gi.id, hi.id] } }, data: { enabled: true } });
  await db.groomingSettings.create({ data: { installationId: gi.id, selfBookingEnabled: true, administratorMaxIds: [], reminderHours: [] } });
  const hs = await db.petHotelSettings.create({ data: { installationId: hi.id, selfBookingEnabled: true, dailyRate: 700, administratorMaxIds: [], reminderHours: [] } });
  const room = await db.petHotelRoom.create({ data: { installationId: hi.id, code: 'CAT-1', name: 'Тестовый номер', species: 'CAT', dailyRate: 700 } });
  const location = await db.groomingLocation.create({ data: { installationId: gi.id, name: 'Тестовая студия', address: 'Вымышленный адрес', timezone: 'Europe/Moscow' } });
  const workplace = await db.groomingWorkplace.create({ data: { locationId: location.id, name: 'Тестовый стол' } });
  const specialist = await db.groomingSpecialist.create({ data: { installationId: gi.id, employeeId: employee.id, displayName: employee.fullName, species: ['CAT'], isActive: true } });
  const service = await db.groomingService.create({ data: { installationId: gi.id, title: 'Уход · пример', price: 2500 } });
  const rule = await db.groomingServiceRule.create({ data: { installationId: gi.id, specialistId: specialist.id, serviceId: service.id, locationId: location.id, workplaceId: workplace.id, species: 'CAT', size: 'ANY', coat: 'ANY', durationMinutes: 60, bufferMinutes: 15, stepMinutes: 15, minimumLeadMinutes: 0, maximumDaysAhead: 90, isActive: true } });
  const now = new Date(), day = new Date(+now + 5 * 86400000).toISOString().slice(0, 10);
  const start = new Date(day + 'T10:00:00+03:00');
  await db.groomingWorkPeriod.create({ data: { specialistId: specialist.id, locationId: location.id, startsAt: new Date(day + 'T09:00:00+03:00'), endsAt: new Date(day + 'T19:00:00+03:00') } });

  // Seed rows using only pre-migration columns, then run the actual additive SQL.
  const past = new Date(+now - 10 * 86400000);
  const legacyG = await db.groomingReservation.create({ data: { installationId: gi.id, ruleId: rule.id, ownerId: owner.id, animalId: animal.id, employeeId: employee.id, locationId: location.id, workplaceId: workplace.id, serviceTitle: 'Сохранённый уход', price: 1234.56, species: 'CAT', size: 'ANY', startsAt: past, endsAt: new Date(+past + 3600000), blockedUntil: new Date(+past + 4500000), status: 'COMPLETED', source: 'CLIENT_PORTAL' }, select: { id: true, source: true, price: true, status: true, version: true } });
  const legacyH = await db.petHotelReservation.create({ data: { installationId: hi.id, roomId: room.id, ownerId: owner.id, animalId: animal.id, species: 'CAT', startsAt: past, endsAt: new Date(+past + 2 * 86400000), billableDays: 2, dailyRate: 650, walkRate: 0, totalPrice: 1300, status: 'CHECKED_OUT', source: 'CRM' }, select: { id: true, source: true, dailyRate: true, totalPrice: true, status: true, version: true } });
  await t.test('additive migration preserves existing rates, origins, statuses and versions', async () => {
    const sql = await readFile(new URL('../prisma/migrations/20261022080000_pet_service_booking_attribution/migration.sql', import.meta.url), 'utf8');
    await db.$transaction(async tx => { for (const statement of sql.replace(/--[^\n]*/g, '').split(';').filter(x => x.trim())) await tx.$executeRawUnsafe(statement); });
    assert.deepEqual(await db.groomingReservation.findUnique({ where: { id: legacyG.id }, select: { id: true, source: true, price: true, status: true, version: true } }), legacyG);
    assert.deepEqual(await db.petHotelReservation.findUnique({ where: { id: legacyH.id }, select: { id: true, source: true, dailyRate: true, totalPrice: true, status: true, version: true } }), legacyH);
    assert.equal((await db.groomingReservation.findUnique({ where: { id: legacyG.id } })).attribution, null);
    assert.equal((await db.petHotelReservation.findUnique({ where: { id: legacyH.id } })).attribution, null);
  });
  const grooming = new GroomingCrmService(db, modules, audit), sync = new GroomingSyncService(db, grooming);
  const hotel = new PetHotelService(db, modules, audit), portal = new PetHotelOwnerService(db, hotel, audit);
  const attribution = { source: 'AVITO', listingId: '8339919613' }, hotelAttribution = { source: 'AVITO', listingId: '4322482374' };
  const gSelection = { animalId: animal.id, serviceId: service.id, species: 'CAT', size: 'ANY', coat: 'ANY', date: day };
  let bookedG, gInput;
  await t.test('grooming owner command validates, saves and reopens the exact source with price unchanged', async () => {
    const offers = await grooming.options(owner.id, gSelection, now);
    gInput = { offerToken: offers.offers[0].offerToken, contactConsent: true, bookingConsent: true, attribution };
    const operation = { id: randomUUID(), ownerId: owner.id, kind: 'BOOK', input: gInput, expiresAt: new Date(+now + 120000).toISOString() };
    bookedG = await sync.execute(operation);
    assert.deepEqual((await grooming.portalState(owner.id)).bookings.find(b => b.id === bookedG.id).attribution, attribution);
    assert.equal(bookedG.price, '2500'); assert.equal(bookedG.source, 'CLIENT_PORTAL');
    assert.equal((await sync.execute(operation)).id, bookedG.id);
    assert.equal(await db.groomingReservation.count({ where: { id: bookedG.id } }), 1);
  });
  await t.test('a staff move cannot replace grooming referral or original portal source', async () => {
    const offers = await grooming.options(owner.id, { ...gSelection, reservationId: bookedG.id }, now, actor);
    const otherTime = offers.offers.find(o => o.startsAt !== bookedG.startsAt);
    const moved = await grooming.book(owner.id, { ...gInput, clientKey: randomUUID(), offerToken: otherTime.offerToken, attribution: hotelAttribution }, now, actor, { id: bookedG.id, version: bookedG.version });
    assert.deepEqual(moved.attribution, attribution); assert.equal(moved.source, 'CLIENT_PORTAL'); assert.equal(moved.price, '2500');
  });
  const operation = (kind, input, ownerId = owner.id) => ({ id: randomUUID(), ownerId, kind, input, expiresAt: new Date(+now + 120000).toISOString() });
  const hSelection = { animalId: animal.id, species: 'CAT', startsAt: start.toISOString(), endsAt: new Date(+start + 51 * 3600000).toISOString(), walkCount: 0 };
  let bookedH;
  await t.test('hotel owner BOOK retains its separate listing and recovers an idempotent receipt', async () => {
    const offers = await portal.execute(operation('OPTIONS', hSelection), now);
    const command = operation('BOOK', { animalId: animal.id, offerToken: offers.rooms[0].offerToken, notes: 'Тест', contactConsent: true, bookingConsent: true, attribution: hotelAttribution });
    bookedH = await portal.execute(command, now);
    assert.equal((await portal.execute(command, now)).id, bookedH.id);
    const saved = await db.petHotelReservation.findUniqueOrThrow({ where: { id: bookedH.id } });
    assert.deepEqual(saved.attribution, hotelAttribution); assert.equal(saved.source, 'OWNER_PORTAL');
    assert.equal(saved.totalPrice.toString(), '2100'); assert.equal(saved.billableDays, 3);
    assert.equal((await hotel.booking(saved.id)).attribution.listingId, hotelAttribution.listingId);
  });
  await t.test('hotel move preserves referral, origin and saved rate; metadata grants no ownership', async () => {
    const input = { ...hSelection, reservationId: bookedH.id, startsAt: new Date(+start + 5 * 86400000).toISOString(), endsAt: new Date(+start + 7 * 86400000 + 3 * 3600000).toISOString() };
    const offers = await portal.execute(operation('OPTIONS', input), now);
    const command = operation('RESCHEDULE', { reservationId: bookedH.id, version: bookedH.version, animalId: animal.id, offerToken: offers.rooms[0].offerToken, notes: '', contactConsent: true, bookingConsent: true, attribution });
    await assert.rejects(portal.execute({ ...command, id: randomUUID(), ownerId: other.id }, now), e => e.getStatus?.() === 409);
    await portal.execute(command, now);
    const saved = await db.petHotelReservation.findUniqueOrThrow({ where: { id: bookedH.id } });
    assert.deepEqual(saved.attribution, hotelAttribution); assert.equal(saved.source, 'OWNER_PORTAL'); assert.equal(saved.dailyRate.toString(), '700');
  });
  await t.test('malformed attribution is discarded while an otherwise valid booking still saves', async () => {
    const shift = 15 * 86400000;
    const offers = await portal.execute(operation('OPTIONS', { ...hSelection, startsAt: new Date(+start + shift).toISOString(), endsAt: new Date(+start + shift + 51 * 3600000).toISOString() }), now);
    const saved = await portal.execute(operation('BOOK', { animalId: animal.id, offerToken: offers.rooms[0].offerToken, notes: '', contactConsent: true, bookingConsent: true, attribution: { ...hotelAttribution, phone: 'never retain this' } }), now);
    assert.equal((await db.petHotelReservation.findUniqueOrThrow({ where: { id: saved.id } })).attribution, null);
    assert.equal(saved.totalPrice, '2100.00');
    assert.equal(await db.appointment.count(), 0); assert.equal(await db.payment.count(), 0);
  });
});
