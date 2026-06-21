import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({
  imports: [AuditModule],
  controllers: [NewsController],
  providers: [NewsService],
})
export class NewsModule {}
