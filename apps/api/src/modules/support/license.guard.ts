import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SupportService } from './support.service';

const allowedPrefixes = ['/api/health', '/api/v1/meta', '/api/v1/auth', '/api/v1/support'];

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly support: SupportService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ path?: string; originalUrl?: string }>();
    const path = request.path || request.originalUrl || '';
    if (allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return true;
    await this.support.assertLicensed();
    return true;
  }
}
