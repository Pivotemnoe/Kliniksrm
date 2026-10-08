// Synthetic local owner gateway. No real MAX/Telegram token or messages.
import 'reflect-metadata';
Object.assign(process.env, {
  OWNER_GATEWAY_DATABASE_URL: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_gateway_qa',
  NODE_ENV: 'test', CLINIC_ASSISTANT_ENABLED: 'true', OWNER_GATEWAY_COOKIE_SECURE: 'false',
  CLINIC_ASSISTANT_MODEL_ENABLED: 'false',
  CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED: 'true',
  OWNER_GATEWAY_PUBLIC_URL: 'http://127.0.0.1:4312', OWNER_GATEWAY_SYNC_SECRET: 'synthetic-qa-gateway-secret-only-20261008',
  MAX_WEBHOOK_SECRET: 'synthetic-qa-max-webhook-secret-only', MAX_BOT_TOKEN: '', TELEGRAM_BOT_TOKEN: '', MAX_BOT_USERNAME: 'synthetic_qa_only_bot',
  OWNER_GATEWAY_VAPID_SUBJECT: '', OWNER_GATEWAY_VAPID_PUBLIC_KEY: '', OWNER_GATEWAY_VAPID_PRIVATE_KEY: '',
  CLINIC_ASSISTANT_APPROVED_ADDRESS: 'Адрес тестовой клиники: Тестовая улица, 1.',
  CLINIC_ASSISTANT_APPROVED_HOURS: 'Тестовый режим работы: 09:00–18:00.',
  CLINIC_ASSISTANT_APPROVED_PHONE: '+7 999 000-00-01 (тестовый номер)',
});
const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../apps/owner-gateway/dist/app.module.js');
const { setGatewaySecurityHeaders } = await import('../apps/owner-gateway/dist/security-headers.js');
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
app.enableCors({ origin: 'http://127.0.0.1:4310', credentials: true });
app.use((_request, response, next) => { setGatewaySecurityHeaders(response); next(); });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
await app.listen(4312, '127.0.0.1');
console.log('Synthetic clinic chat gateway ready at http://127.0.0.1:4312');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
