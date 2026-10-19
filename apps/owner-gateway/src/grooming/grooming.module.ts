import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GroomingService } from './grooming.service';
import { GroomingMaxClient } from './grooming-max.client';
import { GroomingInternalController, GroomingPublicController } from './grooming.controller';
import { GroomingDraftPublicController, GroomingPortalController, GroomingPortalInternalController } from './grooming-portal.controller';
import { GroomingPortalService } from './grooming-portal.service';
import { MaxBotClient } from '../max-bot.client';
import { OwnerNotificationService } from '../owner-notification.service';
@Module({controllers:[GroomingPublicController,GroomingInternalController,GroomingPortalController,GroomingPortalInternalController,GroomingDraftPublicController],providers:[PrismaService,GroomingService,GroomingMaxClient,GroomingPortalService,MaxBotClient,OwnerNotificationService],exports:[GroomingPortalService]})
export class GroomingModule {}
