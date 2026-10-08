import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ClinicAssistantOpenAiClient, ClinicAssistantTurn } from './clinic-assistant-openai.client';
import { clinicIntentReply, clinicSafetyIntent } from './clinic-chat-policy';
import { autoBookingReply, nextBookingDraft } from './clinic-booking-dialog';
import { PublicClinicCatalogService } from './public-clinic-catalog.service';
import { clinicPriceReply } from './clinic-price-reply';

@Injectable()
export class ClinicAssistantRunnerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly model: ClinicAssistantOpenAiClient, private readonly catalog: PublicClinicCatalogService = new PublicClinicCatalogService(prisma)) {}
  onApplicationBootstrap() {
    if (!this.enabled()) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), 1000);
    this.timer.unref(); void this.runOnce().catch(() => undefined);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private enabled() { return process.env.CLINIC_ASSISTANT_ENABLED === 'true' && process.env.CLINIC_ASSISTANT_MODEL_ENABLED === 'true'; }

  async runOnce() {
    if (!this.enabled() || this.running) return;
    this.running = true;
    try {
      // A crashed or ambiguous paid request is handed off, never replayed for a fee.
      const stale = await this.prisma.clinicAssistantRun.findMany({ where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 30_000) } }, select: { id: true }, take: 20 });
      for (const row of stale) await this.finish(row.id, undefined, 'UNCERTAIN');
      const job = await this.claim();
      if (!job) return;
      if (job.errorCode) { await this.finish(job.id, undefined, job.errorCode); return; }
      try { await this.finish(job.id, await this.model.classify(job.turns!, job.prepared!)); }
      catch (error) { await this.finish(job.id, undefined, safeCode(error)); }
    } finally { this.running = false; }
  }

  private async claim() {
    return this.prisma.$transaction(async tx => {
      // A shared reserve across workers prevents races through daily/monthly caps.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261008, 7)`;
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT r."id" FROM "ClinicAssistantRun" r JOIN "ClinicChatMessage" m ON m."id" = r."messageId"
        WHERE r."status" = 'PENDING' AND NOT EXISTS (
          SELECT 1 FROM "ClinicAssistantRun" older JOIN "ClinicChatMessage" om ON om."id" = older."messageId"
          WHERE om."conversationId" = m."conversationId" AND om."sequence" < m."sequence" AND older."status" IN ('PENDING','RUNNING')
        ) ORDER BY r."createdAt", r."id" LIMIT 1 FOR UPDATE OF r SKIP LOCKED`;
      if (!rows.length) return null;
      const run = await tx.clinicAssistantRun.findUniqueOrThrow({ where: { id: rows[0].id }, include: { message: { include: { conversation: true } } } });
      if (run.message.conversation.mode !== 'ASSISTANT') {
        await tx.clinicAssistantRun.update({ where: { id: run.id }, data: { status: 'SKIPPED', finishedAt: new Date() } });
        return null;
      }
      const history = await tx.clinicChatMessage.findMany({ where: { conversationId: run.message.conversationId, sequence: { lte: run.message.sequence } }, orderBy: { sequence: 'desc' }, take: 6 });
      const turns: ClinicAssistantTurn[] = history.reverse().map(x => ({ role: x.author === 'OWNER' ? 'user' : 'assistant', text: x.text }));
      let prepared: ReturnType<ClinicAssistantOpenAiClient['prepare']>;
      let errorCode: string | undefined;
      try { prepared = this.model.prepare(turns); }
      catch (error) { errorCode = safeCode(error); }
      const now = new Date();
      if (!errorCode) {
        const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const totals = await tx.$queryRaw<{ day: bigint; month: bigint }[]>`SELECT
          COALESCE(SUM(COALESCE("chargedMicroUsd","reservedMicroUsd")) FILTER (WHERE "startedAt" >= ${day}),0)::bigint AS "day",
          COALESCE(SUM(COALESCE("chargedMicroUsd","reservedMicroUsd")),0)::bigint AS "month"
          FROM "ClinicAssistantRun" WHERE "startedAt" >= ${month}`;
        if (Number(totals[0].day) + prepared!.reservedMicroUsd > limit('CLINIC_ASSISTANT_MODEL_DAILY_MICRO_USD', 1_000_000)
          || Number(totals[0].month) + prepared!.reservedMicroUsd > limit('CLINIC_ASSISTANT_MODEL_MONTHLY_MICRO_USD', 10_000_000)) errorCode = 'BUDGET';
      }
      await tx.clinicAssistantRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: now,
        reservedMicroUsd: errorCode ? 0 : prepared!.reservedMicroUsd, model: errorCode ? null : prepared!.model } });
      return { id: run.id, turns, prepared: prepared!, errorCode };
    });
  }

  private async finish(id: string, response?: Awaited<ReturnType<ClinicAssistantOpenAiClient['classify']>>, errorCode?: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClinicAssistantRun" WHERE "id" = ${id} FOR UPDATE`;
      const run = await tx.clinicAssistantRun.findUniqueOrThrow({ where: { id }, include: { message: true } });
      if (run.status !== 'RUNNING') return;
      await tx.$queryRaw`SELECT "id" FROM "ClinicConversation" WHERE "id" = ${run.message.conversationId} FOR UPDATE`;
      const row = await tx.clinicConversation.findUniqueOrThrow({ where: { id: run.message.conversationId } });
      const skipped = row.mode !== 'ASSISTANT';
      const intent = errorCode ? 'OTHER' : clinicSafetyIntent(run.message.text) || response!.result.intent;
      await tx.clinicAssistantRun.update({ where: { id }, data: { status: skipped ? 'SKIPPED' : errorCode ? 'FAILED' : 'DONE', errorCode: errorCode || null,
        intent: response ? intent : undefined, chargedMicroUsd: response?.actualMicroUsd, inputTokens: response?.tokens?.input, outputTokens: response?.tokens?.output, finishedAt: new Date() } });
      if (skipped) return;
      let reply = clinicIntentReply(intent, {
        address: process.env.CLINIC_ASSISTANT_APPROVED_ADDRESS, hours: process.env.CLINIC_ASSISTANT_APPROVED_HOURS, phone: process.env.CLINIC_ASSISTANT_APPROVED_PHONE,
      });
      if (intent === 'PRICE') {
        let snapshot: unknown;
        try { snapshot = await this.catalog.get(); } catch {}
        reply = clinicPriceReply(run.message.text, snapshot);
      }
      if (reply.intake && run.message.channel === 'MAX') reply = { human: true, text: 'Напишите имя, телефон для связи, кличку питомца, причину и удобное время. Администратор уточнит заявку и подтвердит время.' };
      const draft = !errorCode && intent === 'BOOKING' && run.message.channel === 'SITE_CHAT' && process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED === 'true'
        ? nextBookingDraft(row.bookingDraft, run.message.sequence, run.message.text, response!.result) : null;
      if (draft && row.ownerId) reply = autoBookingReply();
      else if (draft && /повторн/i.test(draft.serviceQuery || '')) reply = { human: false, intake: true, text: 'Этот питомец был на приёме у нас в течение последнего месяца? Укажите ответ в заявке ниже. Если прошло больше месяца, приём считается первичным. Время подтвердит администратор.' };
      const updated = await tx.clinicConversation.update({ where: { id: row.id }, data: { sequence: { increment: 1 }, ...(draft ? { bookingDraft: draft } : {}), ...(reply.human ? { mode: 'HUMAN', needsAttention: true } : {}) } });
      const channel = row.maxUserId && row.maxConsent ? 'MAX' : 'SITE_CHAT';
      await tx.clinicChatMessage.create({ data: { conversationId: row.id, sequence: updated.sequence, author: 'ASSISTANT', channel, clientKey: `reply:${run.message.clientKey}`, text: reply.text, deliveryStatus: channel === 'MAX' ? 'PENDING' : 'AVAILABLE' } });
    });
  }
}
function limit(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  // Invalid limits close the paid path instead of silently widening it.
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000 ? value : 0;
}
function safeCode(error: unknown) {
  const code = (error as { code?: string })?.code;
  return ['DISABLED','CONFIGURATION','INPUT','UNAVAILABLE','REJECTED','INVALID_RESULT'].includes(code || '') ? code! : 'UNAVAILABLE';
}
