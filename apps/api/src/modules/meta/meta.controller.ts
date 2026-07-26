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
  'reports',
];

@ApiTags('meta')
@Controller('v1/meta')
export class MetaController {
  @Get()
  @ApiOkResponse({ description: 'MVP backend module map.' })
  getMeta() {
    return {
      name: 'TemichevVet CRM API',
      version: resolveReleaseVersion(),
      revision: process.env.TEMICHEVVET_GIT_COMMIT || 'local',
      buildDate: process.env.TEMICHEVVET_BUILD_DATE || null,
      imageSource: process.env.TEMICHEVVET_IMAGE_SOURCE || null,
      modules,
    };
  }
}

export function resolveReleaseVersion(env: NodeJS.ProcessEnv = process.env) {
  const sourceVersion = env.CRM_SOURCE_VERSION?.trim();
  if (sourceVersion && sourceVersion !== 'local') {
    return sourceVersion.slice(0, 12);
  }

  const revision = env.TEMICHEVVET_GIT_COMMIT?.trim();
  if (revision && revision !== 'local') {
    return revision.slice(0, 12);
  }

  return 'локальная';
}
