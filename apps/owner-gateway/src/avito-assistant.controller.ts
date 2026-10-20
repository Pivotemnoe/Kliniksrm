import { Body, Controller, Headers, Post, ServiceUnavailableException } from '@nestjs/common';
import { assertSecret } from './security';
import { AvitoAssistantService } from './avito-assistant.service';

@Controller('internal/v1/avito')
export class AvitoAssistantController {
  constructor(private readonly assistant: AvitoAssistantService) {}
  @Post('intent')
  classify(@Headers('x-owner-gateway-secret') secret: string | undefined, @Body() body: unknown) {
    assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет синхронизации не настроен');
    if (process.env.AVITO_ASSISTANT_MODEL_ENABLED !== 'true') throw new ServiceUnavailableException('ИИ Авито ещё не включён');
    return this.assistant.classify(body);
  }
  @Post('copy')
  copy(@Headers('x-owner-gateway-secret') secret: string | undefined, @Body() body: unknown) {
    assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет синхронизации не настроен');
    if (process.env.AVITO_ASSISTANT_MODEL_ENABLED !== 'true') throw new ServiceUnavailableException('ИИ Авито ещё не включён');
    return this.assistant.copy(body);
  }
}
