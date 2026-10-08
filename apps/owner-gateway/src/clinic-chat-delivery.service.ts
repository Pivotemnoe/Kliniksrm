import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MaxBotClient } from './max-bot.client';
@Injectable()
export class ClinicChatDeliveryService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(ClinicChatDeliveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly max: MaxBotClient) {}
  onApplicationBootstrap() {
    if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true' || !process.env.MAX_BOT_TOKEN?.trim()) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => this.logger.warn('Не удалось обработать очередь MAX')), 1000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      // Interrupted send is ambiguous. Do not blindly send it again.
      const stale = await this.prisma.clinicChatMessage.findMany({ where: { deliveryStatus: 'SENDING', attemptedAt: { lt: new Date(Date.now() - 60_000) } }, take: 50 });
      for (const item of stale) await this.finish(item.id, item.conversationId, 'UNKNOWN');
      const item = await this.prisma.$transaction(async tx => {
        const lock = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(20261008, 2) AS acquired`;
        if (!lock[0].acquired) return null;
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT m."id" FROM "ClinicChatMessage" m JOIN "ClinicConversation" c ON c."id" = m."conversationId" WHERE m."deliveryStatus" = 'PENDING' AND c."maxConsent" = true AND c."maxUserId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ClinicChatMessage" r WHERE r."conversationId" = m."conversationId" AND r."attemptedAt" > NOW() - INTERVAL '1 second') ORDER BY m."createdAt", m."sequence" LIMIT 1 FOR UPDATE OF m SKIP LOCKED`;
        if (!rows.length) return null;
        return tx.clinicChatMessage.update({ where: { id: rows[0].id }, data: { deliveryStatus: 'SENDING', attemptedAt: new Date() }, include: { conversation: true } });
      });
      if (!item) return;
      try {
        const receipt = await this.max.sendMessage(item.conversation.maxUserId!, item.text);
        await this.finish(item.id, item.conversationId, 'SENT', receipt?.messageId);
      } catch (error) {
        // Only explicit rejection means the message definitely was not delivered.
        const status = typeof error === 'object' && error && 'maxRejected' in error && error.maxRejected ? 'FAILED' : 'UNKNOWN';
        await this.finish(item.id, item.conversationId, status);
      }
    } finally { this.running = false; }
  }
  private async finish(id: string, conversationId: string, status: string, messageId?: string) {
    await this.prisma.$transaction(async tx => {
      const changed = await tx.clinicChatMessage.updateMany({ where: { id, deliveryStatus: 'SENDING' }, data: { deliveryStatus: status, providerMessageId: messageId } });
      if (!changed.count) return;
      await tx.clinicConversation.update({ where: { id: conversationId }, data: { sequence: { increment: 1 }, ...(status !== 'SENT' ? { needsAttention: true } : {}) } });
    });
  }
}
