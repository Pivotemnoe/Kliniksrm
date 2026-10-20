import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicModulesModule } from '../clinic-modules/clinic-modules.module';
import { PetHotelService } from './pet-hotel.service';
import { PetHotelController } from './pet-hotel.controller';
import { PetHotelOwnerService } from './pet-hotel-portal.service';
import { PetHotelSyncService } from './pet-hotel-sync.service';
import { LiveUpdatesModule } from '../live-updates/live-updates.module';
@Module({ imports: [AuditModule, ClinicModulesModule, LiveUpdatesModule], controllers: [PetHotelController], providers: [PetHotelService, PetHotelOwnerService, PetHotelSyncService], exports: [PetHotelService, PetHotelOwnerService, PetHotelSyncService] })
export class PetHotelModule {}
