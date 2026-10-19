import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GroomingStandaloneAppModule } from './modules/grooming/grooming-standalone.module';
import { assertRuntimeSecurityConfiguration } from './config/runtime-config';
import { apiAbuseProtection, apiBodyParsers } from './common/abuse-protection';

async function bootstrap() {
  assertRuntimeSecurityConfiguration();
  const app = await NestFactory.create<NestExpressApplication>(GroomingStandaloneAppModule, { bodyParser: false });
  app.use(apiAbuseProtection()); app.use(apiBodyParsers('1mb'));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.APP_URL || 'http://127.0.0.1:4241').split(',').map(x => x.trim()), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.GROOMING_API_PORT || 4242), '0.0.0.0');
}
void bootstrap();
