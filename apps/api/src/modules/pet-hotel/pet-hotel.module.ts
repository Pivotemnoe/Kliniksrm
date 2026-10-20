import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicModulesModule } from '../clinic-modules/clinic-modules.module';
import { PetHotelService } from './pet-hotel.service';
import { PetHotelController } from './pet-hotel.controller';
@Module({ imports: [AuditModule, ClinicModulesModule], controllers: [PetHotelController], providers: [PetHotelService], exports: [PetHotelService] })
export class PetHotelModule {}
