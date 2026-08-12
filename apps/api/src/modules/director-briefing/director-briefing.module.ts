import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DirectorBriefingController } from './director-briefing.controller';
import { DirectorBriefingService } from './director-briefing.service';

@Module({
  imports: [AuditModule],
  controllers: [DirectorBriefingController],
  providers: [DirectorBriefingService],
})
export class DirectorBriefingModule {}
