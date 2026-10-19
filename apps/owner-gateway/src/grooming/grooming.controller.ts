import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Req, ForbiddenException } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { assertSecret } from '../security';
import { GroomingBookingDto } from './grooming.dto';
import { GroomingService } from './grooming.service';
class AckDto { @IsString() @MinLength(1) @MaxLength(100) crmRequestId!: string; }
@Controller('v1/public/grooming')
export class GroomingPublicController {
 constructor(private readonly service: GroomingService) {}
 @Get('catalog') @Header('Cache-Control','no-store')
 catalog() { return this.service.configuration(); }
 @Post('bookings') @Header('Cache-Control','no-store')
 create(@Body() dto:GroomingBookingDto,@Req() request:Request) {
  const origins = (process.env.GROOMING_SITE_ORIGINS || '').split(',').map(v=>v.trim()).filter(Boolean);
  if (!request.headers.origin || !origins.includes(request.headers.origin)) throw new ForbiddenException('Источник заявки не разрешён');
  return this.service.create(dto,request.ip || 'unknown');
 }
}
@Controller('internal/v1/grooming')
export class GroomingInternalController {
 constructor(private readonly service:GroomingService) {}
 private auth(secret?:string) { assertSecret(secret,process.env.OWNER_GATEWAY_SYNC_SECRET,'Секрет синхронизации не настроен'); }
 @Get('requests') @Header('Cache-Control','no-store')
 pending(@Headers('x-owner-gateway-secret') secret?:string) { this.auth(secret); return this.service.pending(); }
 @Post('requests/:id/imported')
 imported(@Headers('x-owner-gateway-secret') secret:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AckDto) { this.auth(secret); return this.service.acknowledge(id,dto.crmRequestId); }
 @Post('notifications/dispatch')
 dispatch(@Headers('x-owner-gateway-secret') secret?:string) { this.auth(secret); return this.service.dispatch(); }
}
