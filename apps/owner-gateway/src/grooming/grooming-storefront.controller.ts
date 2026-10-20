import { Body, Controller, Get, Header, Headers, Post, Query, Req } from '@nestjs/common';
import { IsObject } from 'class-validator';
import type { Request } from 'express';
import { assertSecret } from '../security';
import { GroomingStorefrontService } from './grooming-storefront.service';
class SnapshotDto { @IsObject() payload!: Record<string, unknown>; }
@Controller('internal/v1/grooming/portal')
export class GroomingStorefrontInternalController {
  constructor(private readonly service: GroomingStorefrontService) {}
  @Post('storefront')
  store(@Headers('x-owner-gateway-secret') secret: string | undefined, @Body() input: SnapshotDto) {
    assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет шлюза не настроен');
    return this.service.store(input.payload);
  }
}
@Controller('v1/public/grooming')
export class GroomingAvailabilityController {
  constructor(private readonly service: GroomingStorefrontService) {}
  @Get('availability') @Header('Cache-Control', 'no-store')
  availability(@Query() query: Record<string, string>, @Req() request: Request) { return this.service.availability(query, request.ip || 'unknown'); }
}
