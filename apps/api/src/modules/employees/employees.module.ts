import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { RolesController } from './roles.controller';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [EmployeesController, RolesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}

