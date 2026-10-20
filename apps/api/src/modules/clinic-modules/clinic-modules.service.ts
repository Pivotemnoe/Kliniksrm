import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SupportService } from '../support/support.service';
import { AVITO_MODULE_KEY, AVITO_CAPABILITIES } from '../avito/avito.settings';

export const CLINIC_MODULE_CATALOG = [
  { key: AVITO_MODULE_KEY, title: 'Администратор Авито', description: 'Обращения и объявления Авито. Отдельные правила клиники, груминга и зоогостиницы.', licenseFeature: AVITO_MODULE_KEY, commercialType: 'ADD_ON', route: '/avito', capabilities: AVITO_CAPABILITIES },
  { key: 'GROOMING', title: 'Груминг', description: 'Графики грумеров, самостоятельная запись, кабинет владельца и уведомления MAX.', licenseFeature: 'GROOMING', commercialType: 'ADD_ON', route: '/grooming', capabilities: ['calendar', 'self-booking', 'client-portal', 'max-notifications'] },
  { key: 'PET_HOTEL', title: 'Зоогостиница', description: 'Номера для кошек и собак, календарь занятости, брони, заезд и выезд, расчёт проживания.', licenseFeature: 'PET_HOTEL', commercialType: 'ADD_ON', route: '/pet-hotel', capabilities: ['rooms', 'occupancy-calendar', 'reservations', 'check-in-out', 'stay-pricing'] },
] as const;

@Injectable()
export class ClinicModulesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly support: SupportService) {}

  async organizationId() {
    // Each CRM installation serves one clinic. Never take the clinic ID from a browser or webhook.
    const organization = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!organization) throw new NotFoundException('Сначала заполните организацию клиники');
    return organization.id;
  }
  async installation(moduleKey: string = 'GROOMING') {
    if (!CLINIC_MODULE_CATALOG.some(m => m.key === moduleKey)) throw new NotFoundException('Модуль не найден');
    const organizationId = await this.organizationId();
    return this.prisma.clinicModuleInstallation.upsert({ where: { organizationId_moduleKey: { organizationId, moduleKey } }, create: { organizationId, moduleKey }, update: {} });
  }
  async entitlement(moduleKey: string) {
    const license = await this.support.getLicenseState();
    return !license.enforcementActive || (license.status === 'VALID' && (license.features.includes('*') || license.features.includes(moduleKey)));
  }
  async assertEnabled(moduleKey: string = 'GROOMING') {
    const installation = await this.installation(moduleKey);
    const title = CLINIC_MODULE_CATALOG.find(item => item.key === moduleKey)?.title || moduleKey;
    if (!installation.enabled) throw new ForbiddenException(`Модуль «${title}» отключён директором`);
    if (!await this.entitlement(moduleKey)) throw new ForbiddenException(`В лицензии не подключено дополнение «${title}»`);
    return installation;
  }
  async catalog() {
    return Promise.all(CLINIC_MODULE_CATALOG.map(async item => {
      const installation = await this.installation(item.key);
      const futureBookings = item.key === 'GROOMING' ? await this.prisma.groomingReservation.count({ where: { status: { in: ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] }, startsAt: { gt: new Date() } } })
        : item.key === 'PET_HOTEL' ? await this.prisma.petHotelReservation.count({ where: { installationId: installation.id, status: { in: ['RESERVED', 'IN_HOUSE'] } } }) : 0;
      return { ...item, installation, entitled: await this.entitlement(item.key), futureBookings };
    }));
  }
  async availability() {
    return Promise.all(CLINIC_MODULE_CATALOG.map(async item => { const installation = await this.installation(item.key); const entitled = await this.entitlement(item.key); return { key: item.key, enabled: installation.enabled, entitled, available: installation.enabled && entitled }; }));
  }
  async setEnabled(moduleKey: string, enabled: boolean, version: number, actorId: string) {
    const current = await this.installation(moduleKey);
    if (enabled && !await this.entitlement(moduleKey)) throw new ForbiddenException('Дополнение не включено в лицензию этой клиники');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, 1)`;
      if (moduleKey === 'GROOMING') await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, 2)`;
      if (moduleKey === 'PET_HOTEL') await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020, 3)`;
      const changed = await tx.clinicModuleInstallation.updateMany({ where: { id: current.id, version }, data: { enabled, enabledAt: enabled && !current.enabled ? new Date() : current.enabledAt, version: { increment: 1 }, updatedById: actorId } });
      if (!changed.count) throw new ConflictException('Настройки модуля уже изменены. Обновите страницу.');

      if (moduleKey === AVITO_MODULE_KEY && !enabled) {
        const integration = await tx.avitoIntegration.findUnique({ where: { installationId: current.id } });
        if (integration) await tx.avitoOutgoingOperation.updateMany({ where: { conversation: { integrationId: integration.id }, status: { in: ['DRAFT', 'PENDING'] } }, data: { status: 'CANCELLED', error: 'Модуль отключён' } });
      }
      await this.audit.log({ actorId, action: enabled ? 'clinic_module.enable' : 'clinic_module.disable', entityType: 'ClinicModuleInstallation', entityId: current.id, metadata: { moduleKey } }, tx);
      return tx.clinicModuleInstallation.findUniqueOrThrow({ where: { id: current.id } });
    });
  }
}
