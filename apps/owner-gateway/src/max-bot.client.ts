import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { normalizeBaseUrl } from './security';

@Injectable()
export class MaxBotClient {
  async sendPortalButton(maxUserId: string, inviteToken: string) {
    const publicUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_PUBLIC_URL);

    if (!publicUrl) {
      throw new ServiceUnavailableException('Публичный адрес шлюза не настроен');
    }

    const activationUrl = `${publicUrl}/portal/activate?token=${encodeURIComponent(inviteToken)}`;
    await this.send(maxUserId, 'TemichevVet: MAX подключён. Откройте личный кабинет по кнопке ниже.', activationUrl);
  }

  async sendMessage(maxUserId: string, text: string) {
    const publicUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_PUBLIC_URL);
    await this.send(maxUserId, text, publicUrl ? `${publicUrl}/portal` : null);
  }

  private async send(maxUserId: string, text: string, portalUrl: string | null) {
    const botToken = process.env.MAX_BOT_TOKEN?.trim();
    if (!botToken) {
      throw new ServiceUnavailableException('Токен MAX не настроен');
    }

    const apiBaseUrl = normalizeBaseUrl(process.env.MAX_API_BASE_URL) || 'https://platform-api2.max.ru';
    const response = await fetch(`${apiBaseUrl}/messages?user_id=${encodeURIComponent(maxUserId)}`, {
      method: 'POST',
      headers: {
        Authorization: botToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        attachments: portalUrl ? [
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [[{ type: 'link', text: 'Открыть личный кабинет', url: portalUrl }]],
            },
          },
        ] : undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new BadGatewayException(`MAX API не подтвердил отправку: HTTP ${response.status}`);
    }
  }
}
