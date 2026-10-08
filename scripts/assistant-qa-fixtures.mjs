// Synthetic fixtures only. Explicit localhost QA URL; never imports .env.
import { PrismaClient } from '@prisma/client';
const qaUrl = 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_qa';
const db = new PrismaClient({ datasources: { db: { url: qaUrl } } });
try {
  const owner = await db.owner.upsert({ where: { id: 'aaaaaaaa-0010-4000-8000-000000000001' }, create: { id: 'aaaaaaaa-0010-4000-8000-000000000001', fullName: 'QA браузерный владелец', phone: '+79990000088' }, update: {} });
  const animal = await db.animal.upsert({ where: { id: 'aaaaaaaa-0010-4000-8000-000000000002' }, create: { id: 'aaaaaaaa-0010-4000-8000-000000000002', ownerId: owner.id, nickname: 'QA Рыжик', species: 'Кошка' }, update: {} });
  const visit = await db.visit.upsert({ where: { id: 'aaaaaaaa-0010-4000-8000-000000000003' }, create: { id: 'aaaaaaaa-0010-4000-8000-000000000003', ownerId: owner.id, animalId: animal.id,
    exam: { create: { purpose: 'QA: плановый осмотр', examination: 'QA: введённый врачом результат осмотра' } },
    recommendation: { create: { treatmentPlan: 'QA: контрольный осмотр по согласованной дате. Лекарства не назначались.', careNotes: 'QA: исходная рекомендация врача, сохранить.' } },
  }, update: {} });
  // Keep the latest browser fixture visible; retire earlier synthetic scenarios.
  await db.onlineAppointmentRequest.updateMany({ where: { ownerName: { not: 'QA браузерный владелец' }, OR: [{ status: { in: ['NEW', 'IN_REVIEW'] } }, { conversationNeedsAttention: true }] }, data: { status: 'ARCHIVED', conversationNeedsAttention: false } });
  console.log(JSON.stringify({ ownerId: owner.id, animalId: animal.id, visitId: visit.id }));
} finally { await db.$disconnect(); }
