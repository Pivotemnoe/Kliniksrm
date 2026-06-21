import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SESSION_COOKIE_NAME } from './modules/auth/session-cookie';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:3000';

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: appUrl.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TemichevVet CRM API')
    .setDescription('Backend API для CRM ветеринарной клиники.')
    .setVersion('0.1.0')
    .addCookieAuth(SESSION_COOKIE_NAME)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
