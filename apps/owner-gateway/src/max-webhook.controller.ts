import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { MaxWebhookService } from './max-webhook.service';

@Controller('v1/webhooks/max')
export class MaxWebhookController {
  constructor(private readonly maxWebhookService: MaxWebhookService) {}

  @Post()
  @HttpCode(200)
  handle(@Headers('x-max-bot-api-secret') secret: string | undefined, @Body() update: unknown) {
    return this.maxWebhookService.handle(secret, update);
  }
}
