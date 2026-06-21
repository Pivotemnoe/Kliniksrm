import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnimalsModule } from '../animals/animals.module';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';

@Module({
  imports: [AuditModule, AnimalsModule],
  controllers: [OwnersController],
  providers: [OwnersService],
})
export class OwnersModule {}
