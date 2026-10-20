import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicModulesModule } from '../clinic-modules/clinic-modules.module';
import { GroomingCrmService } from './grooming.service';
import { GroomingController } from './grooming.controller';
import { GroomingSyncService } from './grooming-sync.service';
import { GroomingStaffController } from './grooming-staff.controller';
import { GroomingStaffNotificationsService } from './grooming-staff-notifications.service';
import { GroomingTeamService } from './grooming-team.service';
import { AuthModule } from '../auth/auth.module';
import { RemoteAccessModule } from '../remote-access/remote-access.module';
import { GroomingPhonesController } from './grooming-phones.controller';
@Module({ imports: [AuditModule, ClinicModulesModule, AuthModule, RemoteAccessModule], controllers: [GroomingController, GroomingStaffController, GroomingPhonesController], providers: [GroomingCrmService, GroomingSyncService, GroomingStaffNotificationsService, GroomingTeamService], exports: [GroomingCrmService] })
export class GroomingCrmModule {}
