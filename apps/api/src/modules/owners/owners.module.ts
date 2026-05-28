import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';

@Module({
  imports: [AuditModule],
  controllers: [OwnersController],
  providers: [OwnersService],
})
export class OwnersModule {}
