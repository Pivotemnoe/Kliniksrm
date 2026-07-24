import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpsertOwnerSnapshotDto } from './dto/upsert-owner-snapshot.dto';
import { SendOwnerMessageDto } from './dto/send-owner-message.dto';
import { InternalSyncService } from './internal-sync.service';
import { assertSecret } from './security';

@Controller('internal/v1/owners')
export class InternalSyncController {
  constructor(private readonly internalSyncService: InternalSyncService) {}

  @Put(':ownerId/snapshot')
  upsertSnapshot(
    @Param('ownerId') ownerId: string,
    @Headers('x-owner-gateway-secret') secret: string | undefined,
    @Body() dto: UpsertOwnerSnapshotDto,
  ) {
    this.assertSyncSecret(secret);
    return this.internalSyncService.upsertSnapshot(ownerId, dto);
  }

  @Get(':ownerId/status')
  getStatus(
    @Param('ownerId') ownerId: string,
    @Headers('x-owner-gateway-secret') secret: string | undefined,
  ) {
    this.assertSyncSecret(secret);
    return this.internalSyncService.getStatus(ownerId);
  }

  @Post(':ownerId/invitations')
  createInvitation(
    @Param('ownerId') ownerId: string,
    @Headers('x-owner-gateway-secret') secret: string | undefined,
    @Body() dto: CreateInvitationDto,
  ) {
    this.assertSyncSecret(secret);
    return this.internalSyncService.createInvitation(ownerId, dto);
  }

  @Post(':ownerId/messages')
  sendMessage(
    @Param('ownerId') ownerId: string,
    @Headers('x-owner-gateway-secret') secret: string | undefined,
    @Body() dto: SendOwnerMessageDto,
  ) {
    this.assertSyncSecret(secret);
    return this.internalSyncService.sendMessage(ownerId, dto);
  }

  @Delete(':ownerId/invitations/active')
  revokeInvitation(
    @Param('ownerId') ownerId: string,
    @Headers('x-owner-gateway-secret') secret: string | undefined,
  ) {
    this.assertSyncSecret(secret);
    return this.internalSyncService.revokeInvitation(ownerId);
  }

  @Delete(':ownerId/access')
  revokeAccess(
    @Param('ownerId') ownerId: string,
    @Headers('x-owner-gateway-secret') secret: string | undefined,
  ) {
    this.assertSyncSecret(secret);
    return this.internalSyncService.revokeAccess(ownerId);
  }

  @Delete(':ownerId/connections/:channel')
  resetConnection(
    @Param('ownerId') ownerId: string,
    @Param('channel') channel: string,
    @Headers('x-owner-gateway-secret') secret: string | undefined,
  ) {
    this.assertSyncSecret(secret);
    return this.internalSyncService.resetConnection(ownerId, channel);
  }

  private assertSyncSecret(secret: string | undefined) {
    assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет синхронизации шлюза не настроен');
  }
}
