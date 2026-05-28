import { Module } from '@nestjs/common';
import { AnimalsModule } from './modules/animals/animals.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthModule } from './modules/health/health.module';
import { MetaModule } from './modules/meta/meta.module';
import { OwnersModule } from './modules/owners/owners.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, HealthModule, MetaModule, EmployeesModule, OwnersModule, AnimalsModule],
})
export class AppModule {}
