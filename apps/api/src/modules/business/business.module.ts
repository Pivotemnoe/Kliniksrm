import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';

@Module({
  imports: [AuditModule],
  controllers: [BusinessController],
  providers: [BusinessService],
})
export class BusinessModule {}
