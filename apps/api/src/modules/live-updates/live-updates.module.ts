import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LiveUpdatesController } from './live-updates.controller';
import { LiveUpdatesInterceptor } from './live-updates.interceptor';
import { LiveUpdatesService } from './live-updates.service';

@Module({
  controllers: [LiveUpdatesController],
  providers: [
    LiveUpdatesService,
    { provide: APP_INTERCEPTOR, useClass: LiveUpdatesInterceptor },
  ],
})
export class LiveUpdatesModule {}
