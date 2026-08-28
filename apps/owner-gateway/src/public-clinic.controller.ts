import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreatePublicClinicAnalyticsEventDto } from './dto/create-public-clinic-analytics-event.dto';
import { CreatePublicClinicInquiryDto } from './dto/create-public-clinic-inquiry.dto';
import { PublicClinicService } from './public-clinic.service';

@Controller('v1/public/clinic')
export class PublicClinicController {
  constructor(private readonly publicClinicService: PublicClinicService) {}

  @Post('inquiries')
  createInquiry(@Body() dto: CreatePublicClinicInquiryDto, @Req() request: Request) {
    return this.publicClinicService.createInquiry(dto, request.ip || 'unknown');
  }

  @Post('analytics/events')
  createAnalyticsEvent(@Body() dto: CreatePublicClinicAnalyticsEventDto, @Req() request: Request) {
    return this.publicClinicService.createAnalyticsEvent(dto, request.ip || 'unknown');
  }
}
