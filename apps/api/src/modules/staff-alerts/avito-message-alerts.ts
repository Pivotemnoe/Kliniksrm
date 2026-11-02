import type { Prisma } from '@prisma/client';
import type { AuthEmployee } from '../auth/auth.types';

type AlertDatabase = Pick<Prisma.TransactionClient, 'organization' | 'avitoIntegration' | 'avitoConversation'>;
const directions: Record<string, string> = { CLINIC: 'Клиника', GROOMING: 'Груминг', HOTEL: 'Зоогостиница', UNASSIGNED: 'Без направления' };

/** Read local saved messages only. Bot replies and syncs do not acknowledge an employee's alert. */
export async function avitoMessageAlerts(db: AlertDatabase, actor: AuthEmployee) {
  const allowed = actor.roles.some(role => role === 'director' || role === 'administrator')
    && (actor.permissions.includes('*') || actor.permissions.includes('avito.read'));
  if (!allowed) return [];
  const organization = await db.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!organization) return [];
  const integration = await db.avitoIntegration.findFirst({
    where: { installation: { organizationId: organization.id, moduleKey: 'avito-administrator', enabled: true } },
    select: { id: true, installation: { select: { enabledAt: true } } },
  });
  const since = integration?.installation.enabledAt;
  if (!integration || !since) return [];
  // The activation boundary excludes imported archive messages. Attachments are
  // customer activity too; Avito system events must never become staff alerts.
  const incoming = { direction: 'IN', type: { not: 'system' }, occurredAt: { gte: since } };
  const conversations = await db.avitoConversation.findMany({
    where: { integrationId: integration.id, integration: { installation: { enabled: true } }, messages: { some: incoming } },
    select: {
      id: true, customerName: true, listingTitle: true, direction: true, needsAttention: true,
      messages: { where: incoming, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 1,
        select: { id: true, text: true, type: true, occurredAt: true } },
    },
  });
  return conversations.flatMap(conversation => {
    const message = conversation.messages[0];
    if (!message) return [];
    const direction = directions[conversation.direction] ? conversation.direction : 'UNASSIGNED';
    const preview = message.text.replace(/\s+/g, ' ').trim().slice(0, 180)
      || ({ image: 'Фотография', voice: 'Голосовое сообщение', video: 'Видео', file: 'Файл' }[message.type] ?? 'Вложение');
    return [{
      key: `avito:${conversation.id}`, kind: 'AVITO_MESSAGE' as const,
      title: `Авито: ${conversation.customerName || 'сообщение клиента'}`,
      description: `${directions[direction]}${conversation.listingTitle ? ` · ${conversation.listingTitle}` : ''} · ${preview}${conversation.needsAttention ? ' · Требуется сотрудник' : ''}`,
      href: `/avito?tab=inbox&direction=${direction}&conversation=${encodeURIComponent(conversation.id)}`,
      count: 1, severity: conversation.needsAttention ? 'warning' as const : 'info' as const,
      occurredAt: message.occurredAt,
      // A stable message ID: outgoing answers, polling and contact updates cannot
      // recreate an already read alert; each new incoming message can.
      version: message.id,
    }];
  });
}
