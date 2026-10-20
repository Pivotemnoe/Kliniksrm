import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { AvitoAssistantModel, validateAvitoModelInput } from './avito-assistant.model';
import { ClinicAssistantModelError } from './clinic-assistant-openai.client';
import { validateAvitoCopyInput } from './avito-copy.contract';

@Injectable()
export class AvitoAssistantService {
  constructor(private readonly prisma: PrismaService, private readonly model: AvitoAssistantModel) {}
  async classify(raw: unknown) {
    const input = validateAvitoModelInput(raw); const prepared = this.model.prepare(input);
    return this.run(input, prepared, () => this.model.classify(input, prepared));
  }
  async copy(raw: unknown) {
    const parsed = validateAvitoCopyInput(raw);
    const input = { ...parsed, clientKey: createHash('sha256').update(`AD_COPY:${parsed.clientKey}`).digest('hex') };
    const prepared = this.model.prepareCopy(input);
    return this.run(input, prepared, () => this.model.copy(input, prepared));
  }
  private async run(input: { clientKey: string; direction: string }, prepared: ReturnType<AvitoAssistantModel['prepare']>, generate: () => Promise<{ result: object; chargedMicroUsd: number }>) {
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const claim = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, 91)`;
      const prior = await tx.avitoAssistantRun.findUnique({ where: { clientKey: input.clientKey } });
      if (prior) {
        if (prior.inputHash !== hash) throw new ConflictException('Идентификатор запроса уже использован');
        if (prior.status === 'DONE') return { result: prior.result };
        throw new ServiceUnavailableException('Запрос уже был начат; платный вызов не повторяется');
      }
      const now = new Date(); const local = new Date(now.getTime() + 3 * 3600000).toISOString();
      const day = new Date(`${local.slice(0, 10)}T00:00:00+03:00`); const month = new Date(`${local.slice(0, 7)}-01T00:00:00+03:00`);
      const totals = await tx.$queryRaw<{ day: bigint; month: bigint }[]>`SELECT
        COALESCE(SUM(COALESCE("chargedMicroUsd","reservedMicroUsd")) FILTER (WHERE "createdAt" >= ${day}),0)::bigint AS "day",
        COALESCE(SUM(COALESCE("chargedMicroUsd","reservedMicroUsd")),0)::bigint AS "month" FROM "AvitoAssistantRun" WHERE "createdAt" >= ${month}`;
      if (Number(totals[0].day) + prepared.reservedMicroUsd > limit('AVITO_ASSISTANT_MODEL_DAILY_MICRO_USD', 1000000)
        || Number(totals[0].month) + prepared.reservedMicroUsd > limit('AVITO_ASSISTANT_MODEL_MONTHLY_MICRO_USD', 10000000)) throw new ServiceUnavailableException('Лимит ИИ Авито исчерпан');
      const run = await tx.avitoAssistantRun.create({ data: { clientKey: input.clientKey, inputHash: hash, direction: input.direction, model: prepared.model, status: 'RUNNING', reservedMicroUsd: prepared.reservedMicroUsd } });
      return { id: run.id };
    });
    if ('result' in claim) return claim.result;
    let response: { result: object; chargedMicroUsd: number };
    try { response = await generate(); }
    catch (error) {
      const errorCode = error instanceof ClinicAssistantModelError ? error.code : 'MODEL_UNAVAILABLE';
      await this.prisma.avitoAssistantRun.update({ where: { id: claim.id }, data: { status: 'FAILED', errorCode, finishedAt: new Date() } });
      throw new ServiceUnavailableException('ИИ Авито сейчас недоступен. Платный вызов автоматически не повторяется.');
    }
    await this.prisma.avitoAssistantRun.update({ where: { id: claim.id }, data: { status: 'DONE', result: JSON.parse(JSON.stringify(response.result)), chargedMicroUsd: response.chargedMicroUsd, finishedAt: new Date() } });
    return response.result;
  }
}
function limit(key: string, fallback: number) { const value = Number(process.env[key]); return process.env[key] !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= 1000000000 ? value : fallback; }
