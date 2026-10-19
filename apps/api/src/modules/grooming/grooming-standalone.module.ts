import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';
import { ClinicModulesModule } from '../clinic-modules/clinic-modules.module';
import { GroomingCrmModule } from './grooming.module';
import { RemoteAccessModule } from '../remote-access/remote-access.module';

// Platform identity, licensing and storage; no medical runtime modules.
@Module({ imports: [PrismaModule, AuthModule, HealthModule, ClinicModulesModule, RemoteAccessModule, GroomingCrmModule] })
export class GroomingStandaloneAppModule {}
