import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PermissionsGuard } from './permissions.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [
    PasswordService,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}

