import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { formatNormalizedRussianPhone, normalizePhoneForLookup } from '../../common/phone';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { AuthEmployee } from '../auth/auth.types';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';
import { CreateGroomerDto } from './grooming.dto';

@Injectable()
export class GroomingTeamService {
  constructor(private readonly prisma: PrismaService, private readonly modules: ClinicModulesService,
    private readonly audit: AuditService, private readonly passwords: PasswordService) {}

  private assertManager(actor: AuthEmployee) {
    if (!actor.roles.some(role => ['director', 'administrator'].includes(role)) || !actor.permissions.includes('grooming.manage'))
      throw new ForbiddenException('Командой груминга управляет администратор или директор');
  }

  async createGroomer(input: CreateGroomerDto, actor: AuthEmployee) {
    this.assertManager(actor);
    const installation = await this.modules.assertEnabled('GROOMING');
    const phoneNormalized = normalizePhoneForLookup(input.phone);
    const phone = formatNormalizedRussianPhone(phoneNormalized);
    const email = input.email?.trim().toLowerCase() || null;
    if (!phoneNormalized && !email) throw new BadRequestException('Укажите телефон или email для входа грумера');
    if (input.phone?.trim() && !phoneNormalized) throw new BadRequestException('Проверьте телефон грумера');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Проверьте email грумера');
    if (input.fullName.trim().length < 2) throw new BadRequestException('Укажите имя грумера');
    const passwordHash = await this.passwords.hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, 2)`;
        const current = await tx.clinicModuleInstallation.findUniqueOrThrow({ where: { id: installation.id } });
        if (!current.enabled) throw new ForbiddenException('Груминг отключён');
        const role = await tx.role.findUniqueOrThrow({ where: { code: 'groomer' } });
        const user = await tx.user.create({ data: { phone, phoneNormalized, email, passwordHash, mustChangePassword: true } });
        const employee = await tx.employee.create({ data: { userId: user.id, fullName: input.fullName.trim(), phone,
          accountScope: 'GROOMING', position: 'Грумер', defaultRoute: '/grooming/calendar',
          medicalPhraseAssistantEnabled: false, roles: { create: { roleId: role.id } } } });
        const specialist = await tx.groomingSpecialist.create({ data: { installationId: installation.id, employeeId: employee.id,
          displayName: employee.fullName, species: [...new Set(input.species)], maxUserId: input.maxUserId || null } });
        await this.audit.log({ actorId: actor.id, action: 'grooming.groomer.create', entityType: 'GroomingSpecialist', entityId: specialist.id,
          metadata: { accountScope: 'GROOMING' } }, tx);
        return { ...specialist, login: phone || email, phone, email };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Этот телефон или email уже используется. Укажите отдельные данные для входа грумера');
      throw error;
    }
  }

  async setupWorkplaces(actor: AuthEmployee) {
    this.assertManager(actor);
    const installation = await this.modules.assertEnabled('GROOMING');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, 2)`;
      if (!(await tx.clinicModuleInstallation.findUniqueOrThrow({ where: { id: installation.id } })).enabled) throw new ForbiddenException('Груминг отключён');
      let location = await tx.groomingLocation.findFirst({ where: { installationId: installation.id, isActive: true }, orderBy: { createdAt: 'asc' } });
      if (!location) location = await tx.groomingLocation.create({ data: { installationId: installation.id, name: 'Груминг', timezone: 'Europe/Moscow' } });
      const existing = await tx.groomingWorkplace.count({ where: { location: { installationId: installation.id } } });
      if (!existing) {
        await tx.groomingWorkplace.createMany({ data: [1, 2].map(number => ({ locationId: location!.id, name: `Рабочее место ${number}` })) });
        await this.audit.log({ actorId: actor.id, action: 'grooming.workplaces.setup', entityType: 'ClinicModuleInstallation', entityId: installation.id }, tx);
      }
      return { ok: true };
    });
  }
}
