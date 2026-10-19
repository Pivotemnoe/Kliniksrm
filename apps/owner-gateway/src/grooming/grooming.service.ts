import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { contactPhone } from '../clinic-contact';
import { BoundedRateLimiter } from '../abuse-protection';
import { GROOMING_BREEDS, GROOMING_CATALOG_VERSION, GROOMING_SERVICES, groomingLook } from './catalog';
import { GroomingBookingDto } from './grooming.dto';
import { GroomingDeliveryError, GroomingMaxClient } from './grooming-max.client';

@Injectable()
export class GroomingService implements OnModuleInit, OnModuleDestroy {
 private timer?: ReturnType<typeof setInterval>;
 private running = false;
 private limits = new BoundedRateLimiter();
 constructor(private readonly prisma: PrismaService, private readonly max: GroomingMaxClient) {}
 onModuleInit() {
  this.timer = setInterval(() => { void this.dispatch().catch(() => undefined); }, 30000);
  this.timer.unref();
 }
 onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
 recipients() {
  const values = (process.env.GROOMING_MAX_RECIPIENT_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (values.length > 10 || values.some(v => !/^\d{1,20}$/.test(v))) return [];
  return [...new Set(values)];
 }
 configuration() {
  const privacyUrl = process.env.GROOMING_PRIVACY_URL?.trim() || '';
  let validPrivacy = false;
  try { validPrivacy = new URL(privacyUrl).protocol === 'https:'; } catch {}
  const maxReady = this.max.configured() && this.recipients().length > 0;
  return {
   enabled: process.env.GROOMING_BOOKING_ENABLED === 'true' && maxReady && validPrivacy && Boolean(process.env.GROOMING_PRIVACY_VERSION?.trim()),
   mode: process.env.GROOMING_QA_MODE === 'true' && process.env.NODE_ENV !== 'production' ? 'qa' : 'live',
   bookingPortalUrl: process.env.GROOMING_CRM_SYNC_ENABLED === 'true' && process.env.OWNER_GATEWAY_PUBLIC_URL ? `${process.env.OWNER_GATEWAY_PUBLIC_URL.trim().replace(/\/+$/, '')}/portal/grooming` : null,
   maxReady, privacyUrl:validPrivacy ? privacyUrl : null,
   catalogVersion:GROOMING_CATALOG_VERSION, breeds:GROOMING_BREEDS, services:GROOMING_SERVICES,
  };
 }
 async create(dto: GroomingBookingDto, ip: string) {
  const config = this.configuration();
  if (!config.enabled) throw new ServiceUnavailableException('Запись пока не подключена. Сохраните образ и вернитесь позже.');
  this.limits.consume('grooming:' + ip, 8);
  if (dto.website?.trim() || dto.contactConsent !== true) throw new BadRequestException('Подтвердите разрешение на связь по заявке');
  const breed = GROOMING_BREEDS.find(b => b.id === dto.breedId);
  const service = GROOMING_SERVICES.find(s => s.id === dto.serviceId);
  if (!breed || !service) throw new BadRequestException('Выберите породу и услугу из каталога');
  const looks = dto.lookIds.map(id => groomingLook(id));
  if (looks.some(v => !v || v.breedId !== breed.id)) throw new BadRequestException('Выберите образы этой породы');
  const contactName = plain(dto.contactName), petName = plain(dto.petName);
  if (contactName.length < 2 || !petName) throw new BadRequestException('Заполните имя и кличку');
  if (dto.preferredDate) {
   const day = new Date(dto.preferredDate + 'T12:00:00Z');
   const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== dto.preferredDate || dto.preferredDate < today || day.getTime() > Date.now() + 181*86400000)
    throw new BadRequestException('Выберите желаемую дату в ближайшие 6 месяцев');
  }
  const input = {contactName,phone:contactPhone(dto.phone),petName,breedId:breed.id,serviceId:service.id,
   preferredDate:dto.preferredDate || null,timeWindow:dto.timeWindow,notes:plain(dto.notes),looks};
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  let request;
  try {
   request = await this.prisma.groomingRequest.create({data:{
    ...input,looks:looks as never,inputHash:hash,clientRequestId:dto.clientRequestId,consentVersion:process.env.GROOMING_PRIVACY_VERSION!.trim(),
    deliveries:{create:this.recipients().map(recipientId => ({recipientId}))}
   }});
  } catch (error) {
   if ((error as {code?:string})?.code !== 'P2002') throw error;
   request = await this.prisma.groomingRequest.findUniqueOrThrow({where:{clientRequestId:dto.clientRequestId}});
   if (request.inputHash !== hash) throw new ConflictException('Этот номер запроса уже использован. Обновите форму.');
  }
  void this.dispatch().catch(() => undefined);
  return {ok:true,requestId:request.id,status:'received',mode:config.mode,createdAt:request.createdAt};
 }
 async pending() {
  const rows = await this.prisma.groomingRequest.findMany({where:{crmRequestId:null},orderBy:{createdAt:'asc'},take:100,include:{deliveries:{select:{status:true,sentAt:true,errorCode:true}}}});
  return rows.map(row => {const breed=GROOMING_BREEDS.find(b=>b.id===row.breedId);return {...row,species:breed?.species || null,size:breed?.size || null,breedName:breed?.name || row.breedId};});
 }
 async acknowledge(id: string, crmRequestId: string) {
  const updated = await this.prisma.groomingRequest.updateMany({where:{id,OR:[{crmRequestId:null},{crmRequestId}]},data:{crmRequestId}});
  if (updated.count) return {ok:true};
  const row = await this.prisma.groomingRequest.findUnique({where:{id},select:{id:true}});
  if (!row) throw new NotFoundException('Заявка не найдена');
  throw new ConflictException('Заявка уже связана с другой записью CRM');
 }
 async dispatch() {
  if (this.running || !this.configuration().enabled) return {sent:0};
  this.running = true; let sent = 0;
  try {
   // A crashed/ambiguous attempt needs staff reconciliation, not a blind duplicate.
   await this.prisma.groomingMaxDelivery.updateMany({where:{status:'SENDING',startedAt:{lt:new Date(Date.now()-120000)}},data:{status:'UNCERTAIN',errorCode:'WORKER_INTERRUPTED'}});
   const rows = await this.prisma.groomingMaxDelivery.findMany({where:{status:{in:['PENDING','RETRY']},nextAttemptAt:{lte:new Date()}},orderBy:{nextAttemptAt:'asc'},take:20,include:{request:true}});
   for (const row of rows) {
    if (!this.recipients().includes(row.recipientId)) {
     await this.prisma.groomingMaxDelivery.updateMany({where:{id:row.id,status:row.status},data:{status:'CANCELLED',errorCode:'RECIPIENT_REMOVED'}}); continue;
    }
    const claimed = await this.prisma.groomingMaxDelivery.updateMany({where:{id:row.id,status:row.status},data:{status:'SENDING',startedAt:new Date(),attempts:{increment:1}}});
    if (!claimed.count) continue;
    try {
     const mid = await this.max.send(row.recipientId, notificationText(row.request));
     await this.prisma.groomingMaxDelivery.update({where:{id:row.id},data:{status:'SENT',providerMessageId:mid,sentAt:new Date(),errorCode:null}});
     sent++;
    } catch (error) {
     const known = error instanceof GroomingDeliveryError ? error : new GroomingDeliveryError('DELIVERY_UNCERTAIN',false,true);
     const retry = known.retryable && row.attempts < 4;
     await this.prisma.groomingMaxDelivery.update({where:{id:row.id},data:{
      status:known.uncertain ? 'UNCERTAIN' : retry ? 'RETRY' : 'FAILED',errorCode:known.code,
      nextAttemptAt:new Date(Date.now() + Math.min(3600000,60000 * 2**row.attempts))
     }});
    }
   }
   return {sent};
  } finally { this.running = false; }
 }
}
function plain(value: string) { return value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
export function notificationText(row: {id:string,contactName:string,phone:string,petName:string,breedId:string,serviceId:string,preferredDate:string|null,timeWindow:string,notes:string,looks:unknown}) {
 const entry = GROOMING_BREEDS.find(b => b.id === row.breedId);
 const breed = entry?.name || row.breedId;
 const animal = entry?.species === 'cat' ? 'Кошка' : 'Собака';
 const service = GROOMING_SERVICES.find(s => s.id === row.serviceId)?.name || row.serviceId;
 const windows:Record<string,string> = {ANY:'любое время',MORNING:'утро',AFTERNOON:'день',EVENING:'вечер'};
 const looks = row.looks as {styleName:string}[];
 return [
  'TemichevVET · заявка на груминг', '№ ' + row.id,
  'Клиент: ' + row.contactName, 'Телефон: ' + row.phone, 'Питомец: ' + row.petName + ' · ' + animal + ' · ' + breed,
  'Услуга: ' + service, 'Пожелание по времени: ' + (row.preferredDate || 'обсудить дату') + ', ' + windows[row.timeWindow],
  'Образы: ' + (looks.map(v => v.styleName).join(', ') || 'обсудить с грумером'),
  'Пожелания: ' + (row.notes || 'нет'), 'Это заявка. Время ещё не подтверждено.'
 ].join('\n');
}
