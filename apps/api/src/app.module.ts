import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { MetaModule } from './modules/meta/meta.module';
import { OwnersModule } from './modules/owners/owners.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, HealthModule, MetaModule, OwnersModule],
})
export class AppModule {}
