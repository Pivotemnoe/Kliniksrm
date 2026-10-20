import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PetHotelPublicController, PetHotelPortalController, PetHotelInternalController } from './pet-hotel.controller';
import { PetHotelPortalService } from './pet-hotel-portal.service';
import { PetHotelStorefrontService } from './pet-hotel-storefront.service';
import { PetHotelRegistrationService } from './pet-hotel-registration.service';
import { PetHotelPageController } from './pet-hotel-page.controller';
import { PetHotelDeliveryService } from './pet-hotel-delivery.service';
import { MaxBotClient } from '../max-bot.client';
import { OwnerNotificationService } from '../owner-notification.service';
@Module({ controllers: [PetHotelPublicController, PetHotelPortalController, PetHotelInternalController, PetHotelPageController], providers: [PrismaService, PetHotelPortalService, PetHotelStorefrontService, PetHotelRegistrationService, PetHotelDeliveryService, MaxBotClient, OwnerNotificationService], exports: [PetHotelRegistrationService] })
export class PetHotelModule {}
