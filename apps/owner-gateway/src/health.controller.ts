import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { ok: true, service: 'temichevvet-owner-gateway', at: new Date().toISOString() };
  }
}
