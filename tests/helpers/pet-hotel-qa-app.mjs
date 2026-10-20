import 'reflect-metadata';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function configureHotelQa(name = 'pet_hotel_tests_20261020_qa') {
  if (!['pet_hotel_tests_20261020_qa', 'pet_hotel_preview_20261020_qa'].includes(name)) throw Error('Unexpected QA database');
  const keep = Object.fromEntries(['PATH','HOME','TMPDIR','LANG','TZ'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, keep, { NODE_ENV:'test', CLINIC_RUNTIME_MODE:'test', TEMICHEVVET_LICENSE_MODE:'compatibility', DATABASE_URL:`postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/${name}`, SESSION_COOKIE_NAME:'pet_hotel_local_staff', SESSION_COOKIE_SECURE:'false', PET_HOTEL_QA_MODE:'true', GROOMING_QA_MODE:'true', GROOMING_CRM_SYNC_ENABLED:'false', CLINIC_ASSISTANT_ENABLED:'false', CLINIC_ASSISTANT_REMINDERS_ENABLED:'false', CLINIC_SITE_CATALOG_SYNC_ENABLED:'false', AVITO_WORKER_ENABLED:'false' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => { const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); if (!['127.0.0.1','localhost','[::1]'].includes(u.hostname)) throw Error('External transport disabled in pet hotel QA'); return realFetch(input, options); };
}
export async function hotelQaApp() {
  const { Module, ValidationPipe } = require('@nestjs/common'), { NestFactory } = require('@nestjs/core');
  const { PrismaModule } = require('../../apps/api/dist/prisma/prisma.module.js');
  const { AuthModule } = require('../../apps/api/dist/modules/auth/auth.module.js');
  const { ClinicModulesModule } = require('../../apps/api/dist/modules/clinic-modules/clinic-modules.module.js');
  const { PetHotelModule } = require('../../apps/api/dist/modules/pet-hotel/pet-hotel.module.js');
  const { GroomingCrmModule } = require('../../apps/api/dist/modules/grooming/grooming.module.js');
  const { AvitoModule } = require('../../apps/api/dist/modules/avito/avito.module.js');
  const { StaffAlertsModule } = require('../../apps/api/dist/modules/staff-alerts/staff-alerts.module.js');
  const { InternalMessagesModule } = require('../../apps/api/dist/modules/internal-messages/internal-messages.module.js');
  const { LiveUpdatesModule } = require('../../apps/api/dist/modules/live-updates/live-updates.module.js');
  const { AuditModule } = require('../../apps/api/dist/modules/audit/audit.module.js');
  const { apiBodyParsers, apiAbuseProtection } = require('../../apps/api/dist/common/abuse-protection.js');
  class HotelQaAppModule {}
  Module({ imports:[PrismaModule, AuthModule, ClinicModulesModule, PetHotelModule, GroomingCrmModule, AvitoModule, StaffAlertsModule, InternalMessagesModule, LiveUpdatesModule, AuditModule] })(HotelQaAppModule);
  const app = await NestFactory.create(HotelQaAppModule, { bodyParser:false, logger:false });
  app.use(apiAbuseProtection()); app.use(apiBodyParsers('1mb')); app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist:true, forbidNonWhitelisted:true, transform:true }));
  return app;
}
