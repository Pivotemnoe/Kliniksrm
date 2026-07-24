import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { TelegramWebhookService } from './telegram-webhook.service';

@Controller('v1/webhooks/telegram')
export class TelegramWebhookController {
  constructor(private readonly telegramWebhookService: TelegramWebhookService) {}

  @Post()
  @HttpCode(200)
  handle(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: unknown) {
    return this.telegramWebhookService.handle(secret, update);
  }
}
