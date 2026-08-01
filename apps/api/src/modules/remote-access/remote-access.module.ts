import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RemoteAccessController } from './remote-access.controller';
import { RemoteAccessService } from './remote-access.service';

@Module({
  imports: [AuditModule],
  controllers: [RemoteAccessController],
  providers: [RemoteAccessService],
  exports: [RemoteAccessService],
})
export class RemoteAccessModule {}
