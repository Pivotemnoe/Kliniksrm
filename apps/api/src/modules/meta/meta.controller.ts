import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

const modules = [
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
  'documents',
  'files',
  'settings',
  'backups',
];

@ApiTags('meta')
@Controller('v1/meta')
export class MetaController {
  @Get()
  @ApiOkResponse({ description: 'MVP backend module map.' })
  getMeta() {
    return {
      name: 'Clinic CRM API',
      version: '0.1.0',
      modules,
    };
  }
}
