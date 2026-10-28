import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { BoundedRateLimiter } from '../abuse-protection';

type Item = Record<string, any>;
type Snapshot = { testMode: boolean; capturedAt: string; enabled: boolean; selfBookingEnabled: boolean; services: Item[]; specialists: Item[]; rules: Item[]; shifts: Item[]; busy: Item[] };
const minute = 60000, day = 86400000;
const text = (value: unknown, length = 180) => typeof value === 'string' ? value.slice(0, length) : '';
const instant = (value: unknown) => { const v = text(value, 40), n = Date.parse(v); if (!Number.isFinite(n)) throw new BadRequestException('Некорректное время расписания'); return v; };
const localDay = (date: Date, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const details = (data: any) => Object.fromEntries(['species', 'breedId', 'breedRowId', 'breedName', 'kind', 'serviceName', 'category', 'durationHint', 'note', 'condition', 'unit', 'supplement'].filter(key => typeof data?.[key] === 'string' || typeof data?.[key] === 'boolean').map(key => [key, typeof data[key] === 'string' ? data[key].slice(0, 300) : data[key]]));

@Injectable()
export class GroomingStorefrontService {
  private limits = new BoundedRateLimiter();
  constructor(private readonly prisma: PrismaService) {}

  async store(payload: Record<string, unknown>) {
    if (payload.schemaVersion !== 1 || JSON.stringify(payload).length > 2500000) throw new BadRequestException('Некорректный снимок груминга');
    for (const key of ['services', 'specialists', 'rules', 'shifts', 'busy']) if (!Array.isArray(payload[key]) || (payload[key] as unknown[]).length > 5001) throw new BadRequestException('Некорректный список расписания');
    const capturedAt = instant(payload.capturedAt);
    if (Math.abs(Date.now() - Date.parse(capturedAt)) > 120000) throw new BadRequestException('Время источника расписания отличается');
    const services = (payload.services as Item[]).map(s => ({ id: text(s.id, 100), title: text(s.title), price: text(s.price, 30), maximumPrice: s.maximumPrice == null ? null : text(s.maximumPrice, 30), priceType: text(s.priceType, 20), priceLabel: text(s.priceLabel, 100), catalogKey: text(s.catalogKey, 150), catalogData: details(s.catalogData), bookable: s.bookable === true, version: Number(s.version) }));
    const specialists = (payload.specialists as Item[]).map(s => ({ id: text(s.id, 100), employeeId: text(s.employeeId, 100), displayName: text(s.displayName, 120), species: Array.isArray(s.species) ? s.species.filter((v: string) => ['DOG', 'CAT'].includes(v)) : [] }));
    const rules = (payload.rules as Item[]).map(r => {
      for (const key of ['durationMinutes', 'bufferMinutes', 'stepMinutes', 'minimumLeadMinutes', 'maximumDaysAhead']) if (!Number.isInteger(r[key]) || r[key] < 0 || r[key] > 10080) throw new BadRequestException('Некорректные параметры длительности');
      if (r.durationMinutes < 5 || r.durationMinutes > 480 || r.stepMinutes < 5 || r.stepMinutes > 60 || r.maximumDaysAhead > 90) throw new BadRequestException('Некорректные параметры записи');
      try { new Intl.DateTimeFormat('ru', { timeZone: r.timezone }); } catch { throw new BadRequestException('Некорректный часовой пояс'); }
      return { followShiftWorkplace: r.followShiftWorkplace === true, ...Object.fromEntries(['id', 'specialistId', 'employeeId', 'serviceId', 'locationId', 'workplaceId', 'species', 'size', 'coat', 'durationMinutes', 'bufferMinutes', 'stepMinutes', 'minimumLeadMinutes', 'maximumDaysAhead', 'timezone', 'locationName'].map(k => [k, typeof r[k] === 'number' ? r[k] : text(r[k], 120)])) };
    });
    const shifts = (payload.shifts as Item[]).map(s => ({ specialistId: text(s.specialistId, 100), locationId: text(s.locationId, 100), workplaceId: s.workplaceId ? text(s.workplaceId, 100) : null, timezone: text(s.timezone, 100), locationName: text(s.locationName, 120), workplaceName: text(s.workplaceName, 120), kind: s.kind === 'WORK' ? 'WORK' : 'BLOCK', startsAt: instant(s.startsAt), endsAt: instant(s.endsAt) }));
    const busy = (payload.busy as Item[]).map(s => ({ employeeId: text(s.employeeId, 100), workplaceId: text(s.workplaceId, 100), startsAt: instant(s.startsAt), endsAt: instant(s.endsAt) }));
    const safe: Snapshot = { testMode: payload.testMode === true, capturedAt, enabled: payload.enabled === true, selfBookingEnabled: payload.selfBookingEnabled === true, services, specialists, rules, shifts, busy };
    const fingerprint = createHash('sha256').update(JSON.stringify(safe)).digest('hex');
    await this.prisma.groomingStorefrontSnapshot.upsert({ where: { id: 'grooming' }, create: { id: 'grooming', payload: safe as any, fingerprint }, update: { payload: safe as any, fingerprint, receivedAt: new Date() } });
    return { ok: true, fingerprint };
  }
  private async snapshot() {
    const stored = await this.prisma.groomingStorefrontSnapshot.findUnique({ where: { id: 'grooming' } });
    return stored ? { data: stored.payload as unknown as Snapshot, fingerprint: stored.fingerprint, fresh: Date.now() - stored.receivedAt.getTime() < 90000 && Date.now() - Date.parse((stored.payload as any).capturedAt) < 90000 } : null;
  }
  async catalog() {
    const snapshot = await this.snapshot();
    if (!snapshot) return { connected: false, selfBookingEnabled: false, services: [], specialists: [] };
    return { connected: true, testMode: snapshot.data.testMode, selfBookingEnabled: snapshot.fresh && snapshot.data.enabled && snapshot.data.selfBookingEnabled, fresh: snapshot.fresh, asOf: snapshot.data.capturedAt, version: snapshot.fingerprint,
      services: snapshot.data.services, specialists: snapshot.data.specialists.map(({ employeeId, ...s }) => s) };
  }
  async availability(query: { serviceId?: string; specialistId?: string; date?: string; species?: string; size?: string; coat?: string }, ip: string, now = new Date()) {
    this.limits.consume('grooming-availability:' + ip, 60, 60000);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date || '') || !['DOG', 'CAT'].includes(query.species || '') || !['ANY', 'SMALL', 'MEDIUM', 'LARGE'].includes(query.size || '') || !['ANY', 'SHORT', 'LONG', 'CURLY', 'DOUBLE'].includes(query.coat || 'ANY')) throw new BadRequestException('Выберите дату, вид и размер питомца');
    const center = Date.parse(query.date + 'T12:00:00Z');
    if (!Number.isFinite(center) || new Date(center).toISOString().slice(0, 10) !== query.date || Math.abs(center - now.getTime()) > 92 * day) throw new BadRequestException('Выберите дату в ближайшие 90 дней');
    const snapshot = await this.snapshot();
    if (!snapshot?.fresh) throw new ServiceUnavailableException('Расписание обновляется. Попробуйте немного позже.');
    const data = snapshot.data;
    if (!data.enabled || !data.selfBookingEnabled) return { slots: [], enabled: false, notice: 'Онлайн-запись пока закрыта. Салон настраивает расписание.' };
    const service = data.services.find(s => s.id === query.serviceId && s.bookable);
    if (!service) return { slots: [], enabled: true, notice: 'Для этой услуги время согласует администратор.' };
    const slots: Item[] = [];
    for (const r of data.rules.filter(r => r.serviceId === service.id && r.species === query.species && ['ANY', query.size].includes(r.size) && ['ANY', query.coat || 'ANY'].includes(r.coat) && (!query.specialistId || r.specialistId === query.specialistId))) {
      const durationMinutes = Math.max(90, Math.ceil(r.durationMinutes / 30) * 30);
      const specialist = data.specialists.find(s => s.id === r.specialistId);
      if (!specialist) continue;
      const from = Math.max(center - 26 * 3600000, now.getTime() + r.minimumLeadMinutes * minute), to = Math.min(center + 26 * 3600000, now.getTime() + r.maximumDaysAhead * day);
      for (const shift of data.shifts.filter(s => s.kind === 'WORK' && s.specialistId === r.specialistId && (r.followShiftWorkplace ? Boolean(s.workplaceId) : s.locationId === r.locationId && (!s.workplaceId || s.workplaceId === r.workplaceId)))) {
        const workplaceId = r.followShiftWorkplace ? shift.workplaceId : r.workplaceId, timezone = r.followShiftWorkplace && shift.timezone ? shift.timezone : r.timezone;
        const start = Date.parse(shift.startsAt), end = Math.min(Date.parse(shift.endsAt), to), step = r.stepMinutes * minute;
        for (let t = start + Math.max(0, Math.ceil((from - start) / step)) * step; t + (durationMinutes + r.bufferMinutes) * minute <= end; t += step) {
          const finish = t + (durationMinutes + r.bufferMinutes) * minute;
          if (localDay(new Date(t), timezone) !== query.date) continue;
          if (data.shifts.some(s => s.kind === 'BLOCK' && s.specialistId === r.specialistId && Date.parse(s.startsAt) < finish && Date.parse(s.endsAt) > t)) continue;
          if (data.busy.some(b => (b.employeeId === r.employeeId || b.workplaceId === workplaceId) && Date.parse(b.startsAt) < finish && Date.parse(b.endsAt) > t)) continue;
          slots.push({ serviceId: service.id, specialistId: r.specialistId, startsAt: new Date(t).toISOString(), endsAt: new Date(t + durationMinutes * minute).toISOString(), specialistName: specialist.displayName, durationMinutes, priceLabel: service.priceLabel, timezone, locationName: r.followShiftWorkplace ? shift.locationName : r.locationName, workplaceName: shift.workplaceName, workplaceId });
          if (slots.length >= 300) break;
        }
        if (slots.length >= 300) break;
      }
      if (slots.length >= 300) break;
    }
    const unique = [...new Map(slots.map(s => [s.specialistId + ':' + s.startsAt, s])).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 160);
    return { slots: unique, enabled: true, testMode: data.testMode, version: snapshot.fingerprint, asOf: data.capturedAt, notice: 'Выберите время. Бронь подтвердится после входа через MAX и повторной проверки расписания.' };
  }
  async selection(input: { serviceId: string; specialistId: string; startsAt: string; species: string; size: string; coat: string }) {
    const snapshot = await this.snapshot();
    if (!snapshot?.fresh || !snapshot.data.selfBookingEnabled) throw new ServiceUnavailableException('Расписание обновилось. Выберите время заново.');
    const service = snapshot.data.services.find(s => s.id === input.serviceId && s.bookable), specialist = snapshot.data.specialists.find(s => s.id === input.specialistId);
    if (!service || !specialist || !snapshot.data.rules.some(r => r.serviceId === service.id && r.specialistId === specialist.id && r.species === input.species && ['ANY', input.size].includes(r.size) && ['ANY', input.coat].includes(r.coat))) throw new BadRequestException('Услуга и специалист изменились. Выберите время заново.');
    const startsAt = instant(input.startsAt);
    if (Date.parse(startsAt) <= Date.now()) throw new BadRequestException('Выберите будущее время');
    return { serviceId: service.id, specialistId: specialist.id, startsAt, species: input.species, size: input.size, coat: input.coat, date: localDay(new Date(startsAt), 'Europe/Moscow'), serviceTitle: service.title, specialistName: specialist.displayName, priceLabel: service.priceLabel, catalogData: service.catalogData };
  }
}
