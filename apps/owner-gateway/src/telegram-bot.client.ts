import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { normalizeBaseUrl } from './security';

@Injectable()
export class TelegramBotClient {
  async sendPortalButton(chatId: string, inviteToken: string) {
    const publicUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_PUBLIC_URL);
    if (!publicUrl) {
      throw new ServiceUnavailableException('Публичный адрес шлюза не настроен');
    }

    await this.send(chatId, 'TemichevVet: Telegram подключён. Откройте личный кабинет по кнопке ниже.', `${publicUrl}/portal/activate?token=${encodeURIComponent(inviteToken)}`);
  }

  async sendMessage(chatId: string, text: string) {
    const publicUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_PUBLIC_URL);
    await this.send(chatId, text, publicUrl ? `${publicUrl}/portal` : null);
  }

  private async send(chatId: string, text: string, portalUrl: string | null) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!botToken) {
      throw new ServiceUnavailableException('Токен Telegram не настроен');
    }

    const apiBaseUrl = normalizeBaseUrl(process.env.TELEGRAM_API_BASE_URL) || 'https://api.telegram.org';
    const response = await fetch(`${apiBaseUrl}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: portalUrl
          ? { inline_keyboard: [[{ text: 'Открыть личный кабинет', url: portalUrl }]] }
          : undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new BadGatewayException(`Telegram API не подтвердил отправку: HTTP ${response.status}`);
    }
  }
}
