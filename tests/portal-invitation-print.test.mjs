import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('печатное приглашение персональное, компактное и содержит три разных QR-сценария', async () => {
  const page = await read('apps/web/src/features/owners/OwnerCommunicationTab.tsx');

  assert.match(page, /@page \{ size: A5 portrait;/);
  assert.match(page, /Уважаемый\(ая\).*input\.ownerName/s);
  assert.match(page, /Открыть в браузере/);
  assert.match(page, /Подключить Telegram/);
  assert.match(page, /Подключить MAX/);
  assert.match(page, /Распечатать А5 — 3 QR-кода/);
  assert.match(page, /https:\/\/temichevvet\.ru/);
  assert.doesNotMatch(page, /owner\.phone|owner\.address/);
});

test('один универсальный токен выдаёт ссылки для браузера, Telegram и MAX', async () => {
  const gateway = await read('apps/owner-gateway/src/internal-sync.service.ts');
  const maxWebhook = await read('apps/owner-gateway/src/max-webhook.service.ts');
  const telegramWebhook = await read('apps/owner-gateway/src/telegram-webhook.service.ts');
  const apiClient = await read('apps/api/src/modules/notifications/providers/owner-gateway.client.ts');

  assert.match(gateway, /channel: PortalInviteChannel\.WEB/);
  assert.match(gateway, /deliveryUrls: buildDeliveryUrls/);
  assert.match(gateway, /PortalInviteChannel\.TELEGRAM/);
  assert.match(gateway, /PortalInviteChannel\.MAX/);
  assert.match(maxWebhook, /invitation\.channel !== PortalInviteChannel\.WEB/);
  assert.match(telegramWebhook, /invitation\.channel !== PortalInviteChannel\.WEB/);
  assert.match(apiClient, /normalizeDeliveryUrls/);
  assert.match(apiClient, /buildCompatibleDeliveryUrls/);
  assert.match(apiClient, /TELEGRAM_BOT_USERNAME/);
  assert.match(apiClient, /MAX_BOT_NAME/);
  assert.match(apiClient, /portal\/activate\?token=/);
});

test('CRM дополняет старый ответ шлюза до полного печатного комплекта', async () => {
  const compose = await read('docker-compose.yml');
  const exampleEnv = await read('.env.example');

  assert.match(compose, /TELEGRAM_BOT_USERNAME: \$\{TELEGRAM_BOT_USERNAME:-TemichevVetCabinetBot\}/);
  assert.match(compose, /MAX_BOT_NAME: \$\{MAX_BOT_NAME:-id230210303969_2_bot\}/);
  assert.match(exampleEnv, /TELEGRAM_BOT_USERNAME=TemichevVetCabinetBot/);
  assert.match(exampleEnv, /MAX_BOT_NAME=id230210303969_2_bot/);
});

test('личный кабинет рекламирует отдельный сервис для владельцев животных', async () => {
  const publicPortal = await read('apps/owner-gateway/public/app.js');
  const localPortal = await read('apps/web/src/features/clientPortal/ClientPortalPage.tsx');

  for (const portal of [publicPortal, localPortal]) {
    assert.match(portal, /паспорт питомца/);
    assert.match(portal, /Напоминания/);
    assert.match(portal, /href="https:\/\/temichevvet\.ru\/pet"/);
    assert.match(portal, /Не заменяет официальный ветпаспорт/);
    assert.match(portal, /Данные клиники автоматически сюда не переносятся/);
  }
  assert.match(publicPortal, /href="https:\/\/temichevvet\.ru"/);
});

test('разделы мобильного личного кабинета собраны в одну сетку без горизонтальной прокрутки', async () => {
  const publicPortal = await read('apps/owner-gateway/public/app.js');
  const portalStyles = await read('apps/owner-gateway/public/app.css');
  const serviceWorker = await read('apps/owner-gateway/public/sw.js');

  assert.match(publicPortal, /<nav class="portal-menu" aria-label="Разделы кабинета">/);
  assert.match(publicPortal, /role="tablist"/);
  assert.match(portalStyles, /\.tabs \{ display: grid;/);
  assert.match(portalStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(portalStyles, /@media \(max-width: 360px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(portalStyles, /\.tabs[^}]*overflow-x:\s*auto/s);
  assert.match(serviceWorker, /temichevvet-owner-shell-v14/);
  assert.match(serviceWorker, /20260913-owner-settings/);
});
