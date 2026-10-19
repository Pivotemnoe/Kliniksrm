import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SupportModule } from '../support/support.module';
import { ClinicModulesController } from './clinic-modules.controller';
import { ClinicModulesService } from './clinic-modules.service';
@Module({ imports: [AuditModule, SupportModule], controllers: [ClinicModulesController], providers: [ClinicModulesService], exports: [ClinicModulesService] })
export class ClinicModulesModule {}
