import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { GroomingCrmModule } from '../grooming/grooming.module';
import { OwnersModule } from '../owners/owners.module';
import { StaffAppController } from './staff-app.controller';
import { StaffAppService } from './staff-app.service';
@Module({ imports: [AuthModule, AuditModule, AppointmentsModule, GroomingCrmModule, OwnersModule],
  controllers: [StaffAppController], providers: [StaffAppService] })
export class StaffAppModule {}
