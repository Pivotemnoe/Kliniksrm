import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashToken } from '../security';
import { Prisma } from '../generated/client';
import { HotelOperationDto, HotelResultDto } from './pet-hotel.dto';

const allowed: Record<string, string[]> = {
  STATE: [], OPTIONS: ['animalId', 'species', 'startsAt', 'endsAt', 'weightKg', 'walkCount', 'reservationId'],
  BOOK: ['offerToken', 'animalId', 'notes', 'contactConsent', 'bookingConsent'],
  RESCHEDULE: ['offerToken', 'animalId', 'notes', 'contactConsent', 'bookingConsent', 'reservationId', 'version'],
  CANCEL: ['reservationId', 'version'], PET_CREATE: ['nickname', 'species', 'breed', 'weightKg'],
};
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const fingerprint = (v: unknown) => hashToken(JSON.stringify(stable(v)));
@Injectable()
export class PetHotelPortalService {
  constructor(private readonly prisma: PrismaService) {}
  async owner(token: string) {
    const session = await this.prisma.portalSession.findUnique({ where: { tokenHash: hashToken(token || '') } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ForbiddenException('Войдите в личный кабинет');
    return session;
  }
  async operation(token: string, input: HotelOperationDto) {
    if (process.env.PET_HOTEL_CRM_SYNC_ENABLED !== 'true') throw new ServiceUnavailableException('Кабинет гостиницы пока не подключён');
    const session = await this.owner(token);
    if (!allowed[input.kind] || Object.keys(input.input).some(k => !allowed[input.kind].includes(k)) || JSON.stringify(input.input).length > 14000) throw new BadRequestException('Некорректные данные запроса гостиницы');
    const hash = fingerprint({ kind: input.kind, input: input.input });
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020, hashtext(${session.ownerId}))`;
      if (!await tx.portalSession.findFirst({ where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } } })) throw new ForbiddenException('Войдите в личный кабинет');
      const prior = await tx.petHotelPortalOperation.findUnique({ where: { ownerId_clientKey: { ownerId: session.ownerId, clientKey: input.clientKey } } });
      if (prior) { if (prior.fingerprint !== hash) throw new ConflictException('Ключ запроса использован с другими данными'); return this.public(prior); }
      const recent = await tx.petHotelPortalOperation.count({ where: { ownerId: session.ownerId, createdAt: { gt: new Date(Date.now() - 60000) } } });
      if (recent >= 30) throw new ConflictException('Слишком много запросов. Подождите минуту');
      return this.public(await tx.petHotelPortalOperation.create({ data: { ownerId: session.ownerId, clientKey: input.clientKey, kind: input.kind, fingerprint: hash, input: json(input.input), expiresAt: new Date(Date.now() + 10 * 60000) } }));
    });
  }
  private public(row: { id: string; kind: string; status: string; result: unknown; error: string | null }) { return { id: row.id, kind: row.kind, status: row.status, result: row.result, error: row.error }; }
  async result(token: string, id: string, byKey = false) {
    const session = await this.owner(token);
    const row = await this.prisma.petHotelPortalOperation.findFirst({ where: { ownerId: session.ownerId, ...(byKey ? { clientKey: id } : { id }) } });
    if (!row) throw new NotFoundException('Запрос не найден');
    return this.public(row);
  }
  async pending() { return { items: await this.prisma.petHotelPortalOperation.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50 }) }; }
  async complete(id: string, input: HotelResultDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020, hashtext(${id}))`;
      const row = await tx.petHotelPortalOperation.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Запрос не найден');
      const result = input.result || null, error = input.error || null;
      if (row.status !== 'PENDING') {
        if (row.status !== input.status || fingerprint(row.result) !== fingerprint(result) || row.error !== error) throw new ConflictException('Результат запроса уже сохранён');
        return { ok: true };
      }
      if (JSON.stringify(result).length > 300000) throw new BadRequestException('Слишком большой ответ гостиницы');
      await tx.petHotelPortalOperation.update({ where: { id }, data: { status: input.status, result: result ? json(result) : Prisma.DbNull, error, completedAt: new Date() } });
      return { ok: true };
    });
  }
}
