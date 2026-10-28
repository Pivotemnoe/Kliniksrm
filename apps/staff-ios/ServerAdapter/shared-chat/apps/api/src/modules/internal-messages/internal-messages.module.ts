import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InternalMessagesController } from './internal-messages.controller';
import { StaffClinicChatService } from './staff-clinic-chat.service';
import { InternalMessagesService } from './internal-messages.service';

@Module({
  imports: [AuditModule],
  controllers: [InternalMessagesController],
  providers: [InternalMessagesService, StaffClinicChatService],
})
export class InternalMessagesModule {}
