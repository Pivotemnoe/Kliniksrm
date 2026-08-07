import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InternalMessagesController } from './internal-messages.controller';
import { InternalMessagesService } from './internal-messages.service';

@Module({
  imports: [AuditModule],
  controllers: [InternalMessagesController],
  providers: [InternalMessagesService],
})
export class InternalMessagesModule {}
