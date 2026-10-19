import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicModulesModule } from '../clinic-modules/clinic-modules.module';
import { GroomingCrmService } from './grooming.service';
import { GroomingController } from './grooming.controller';
import { GroomingSyncService } from './grooming-sync.service';
import { GroomingStaffController } from './grooming-staff.controller';
import { GroomingStaffNotificationsService } from './grooming-staff-notifications.service';
@Module({ imports: [AuditModule, ClinicModulesModule], controllers: [GroomingController, GroomingStaffController], providers: [GroomingCrmService, GroomingSyncService, GroomingStaffNotificationsService], exports: [GroomingCrmService] })
export class GroomingCrmModule {}
