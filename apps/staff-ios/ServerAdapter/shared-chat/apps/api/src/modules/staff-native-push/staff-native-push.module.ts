import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ClinicModulesModule } from '../clinic-modules/clinic-modules.module';
import { StaffNativePushController } from './staff-native-push.controller';
import { StaffNativePushService } from './staff-native-push.service';
@Module({ imports: [AuthModule, AuditModule, ClinicModulesModule], controllers: [StaffNativePushController],
  providers: [StaffNativePushService], exports: [StaffNativePushService] })
export class StaffNativePushModule {}
