import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { hashToken } from '../security';
import { BoundedRateLimiter } from '../abuse-protection';
import { HotelSnapshot, hotelQuote, hotelRoomFree, hotelSelection, hotelSnapshot } from './pet-hotel-contract';

const token = () => randomBytes(32).toString('base64url');
@Injectable()
export class PetHotelStorefrontService {
  private limits = new BoundedRateLimiter();
  constructor(private readonly prisma: PrismaService) {}
  async store(payload: Record<string, unknown>) {
    const data = hotelSnapshot(payload), fingerprint = hashToken(JSON.stringify(data));
    await this.prisma.petHotelStorefrontSnapshot.upsert({ where: { id: 'pet-hotel' }, create: { id: 'pet-hotel', payload: data, fingerprint }, update: { payload: data, fingerprint, receivedAt: new Date() } });
    return { ok: true, fingerprint };
  }
  private async snapshot() {
    const row = await this.prisma.petHotelStorefrontSnapshot.findUnique({ where: { id: 'pet-hotel' } });
    if (!row) return null;
    const data = row.payload as unknown as HotelSnapshot;
    return { data, version: row.fingerprint, fresh: Date.now() - row.receivedAt.getTime() < 90000 && Math.abs(Date.now() - Date.parse(data.capturedAt)) < 90000 };
  }
  private online(data: HotelSnapshot, fresh: boolean) { return fresh && data.enabled && data.selfBookingEnabled && process.env.PET_HOTEL_CRM_SYNC_ENABLED === 'true'; }
  async catalog() {
    const source = await this.snapshot();
    if (!source) return { connected: false, enabled: false, selfBookingEnabled: false, rooms: [] };
    return { schemaVersion: 1, connected: true, enabled: source.data.enabled, selfBookingEnabled: this.online(source.data, source.fresh), fresh: source.fresh, asOf: source.data.capturedAt, version: source.version, testMode: source.data.testMode, settings: source.data.settings, rooms: source.data.rooms.filter(r => r.isActive).sort((a, b) => a.sortOrder - b.sortOrder), portalUrl: process.env.OWNER_GATEWAY_PUBLIC_URL ? process.env.OWNER_GATEWAY_PUBLIC_URL.replace(/\/+$/, '') + '/portal/pet-hotel' : null };
  }
  async availability(query: Record<string, unknown>, ip: string) {
    this.limits.consume('hotel-options:' + ip, 20, 60000);
    const source = await this.snapshot();
    if (!source?.fresh) throw new ServiceUnavailableException('Занятость номеров обновляется. Попробуйте немного позже.');
    if (!this.online(source.data, source.fresh)) return { enabled: false, rooms: [], notice: 'Онлайн-бронирование пока закрыто. Свяжитесь с администратором.' };
    const selection = hotelSelection(query, source.data.settings);
    const rooms = source.data.rooms.filter(r => r.isActive && r.species === selection.species && hotelRoomFree(source.data, r.id, selection)).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 100);
    const expiresAt = new Date(Date.now() + 5 * 60000);
    await this.prisma.petHotelBookingDraft.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const offered = await this.prisma.$transaction(async tx => Promise.all(rooms.map(async room => {
      const offerToken = token(), quote = hotelQuote(room.dailyRate, source.data.settings.walkRate, selection);
      const payload = { ...selection, roomId: room.id, roomName: room.name, roomVersion: room.version, quote };
      await tx.petHotelBookingDraft.create({ data: { purpose: 'OFFER', tokenHash: hashToken(offerToken), ipHash: hashToken(ip), payload, expiresAt } });
      return { id: room.id, code: room.code, name: room.name, species: room.species, version: room.version, quote, offerToken, expiresAt };
    })));
    return { enabled: true, rooms: offered, asOf: source.data.capturedAt, version: source.version, testMode: source.data.testMode, notice: 'Выбор номера ещё не создаёт бронь. После входа проверим занятость и цену повторно.' };
  }
  async draft(offerToken: string, ip: string) {
    this.limits.consume('hotel-draft:' + ip, 20, 60000);
    const offer = await this.prisma.petHotelBookingDraft.findUnique({ where: { tokenHash: hashToken(offerToken) } });
    if (!offer || offer.purpose !== 'OFFER' || offer.expiresAt <= new Date()) throw new NotFoundException('Предложение истекло. Проверьте свободные номера заново.');
    const source = await this.snapshot();
    if (!source?.fresh || !this.online(source.data, source.fresh)) throw new ServiceUnavailableException('Занятость номеров обновляется.');
    const payload = offer.payload as Record<string, any>, selection = hotelSelection(payload, source.data.settings);
    const room = source.data.rooms.find(r => r.id === payload.roomId && r.isActive && r.species === selection.species);
    if (!room || !hotelRoomFree(source.data, room.id, selection)) throw new ConflictException('Этот номер уже недоступен. Выберите другой.');
    const quote = hotelQuote(room.dailyRate, source.data.settings.walkRate, selection);
    if (room.version !== payload.roomVersion || !Object.entries(quote).every(([key, value]) => payload.quote?.[key] === value)) throw new ConflictException('Тариф изменился. Проверьте номера и стоимость заново.');
    const draftToken = token(), expiresAt = new Date(Date.now() + 15 * 60000);
    await this.prisma.petHotelBookingDraft.create({ data: { purpose: 'DRAFT', tokenHash: hashToken(draftToken), ipHash: hashToken(ip), payload, expiresAt } });
    return { token: draftToken, expiresAt };
  }
  async consume(ownerId: string, draftToken: string) {
    return this.prisma.$transaction(async tx => {
      const draft = await tx.petHotelBookingDraft.findUnique({ where: { tokenHash: hashToken(draftToken) } });
      if (!draft || draft.purpose !== 'DRAFT' || draft.expiresAt <= new Date()) throw new NotFoundException('Выбор с сайта истёк. Выберите номер снова.');
      const claimed = await tx.petHotelBookingDraft.updateMany({ where: { id: draft.id, OR: [{ consumedByOwnerId: null }, { consumedByOwnerId: ownerId }] }, data: { consumedByOwnerId: ownerId } });
      if (!claimed.count) throw new ForbiddenException('Этот выбор уже открыт в другом кабинете.');
      return draft.payload;
    });
  }
}
