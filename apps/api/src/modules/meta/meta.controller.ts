import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

const modules = [
  'news',
  'auth',
  'employees',
  'roles',
  'audit',
  'owners',
  'animals',
  'queue',
  'appointments',
  'visits',
  'billing',
  'payments',
  'stock',
  'supplies',
  'hospital',
  'documents',
  'files',
  'settings',
  'backups',
  'dashboard',
  'laboratory',
  'notifications',
  'online-requests',
  'client-portal',
];

@ApiTags('meta')
@Controller('v1/meta')
export class MetaController {
  @Get()
  @ApiOkResponse({ description: 'MVP backend module map.' })
  getMeta() {
    return {
      name: 'TemichevVet CRM API',
      version: '0.1.0',
      modules,
    };
  }
}
