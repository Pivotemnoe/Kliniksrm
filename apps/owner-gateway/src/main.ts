import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { assertGatewaySecurityConfiguration } from './runtime-config';

async function bootstrap() {
  assertGatewaySecurityConfiguration();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.set('trust proxy', process.env.OWNER_GATEWAY_TRUST_PROXY === 'true');
  app.useBodyParser('json', { limit: process.env.OWNER_GATEWAY_BODY_LIMIT?.trim() || '24mb' });
  const allowedOrigins = publicSiteOrigins();
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed'), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.OWNER_GATEWAY_PORT ?? 4100);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();

function publicSiteOrigins() {
  const values = (process.env.OWNER_GATEWAY_PUBLIC_SITE_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const gatewayUrl = process.env.OWNER_GATEWAY_PUBLIC_URL?.trim();
  if (gatewayUrl) {
    try {
      values.push(new URL(gatewayUrl).origin);
    } catch {
      // Runtime configuration reports the invalid public URL before the server starts.
    }
  }
  return new Set(values);
}
