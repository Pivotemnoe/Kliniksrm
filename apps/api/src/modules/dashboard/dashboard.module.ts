import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [NotificationsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
