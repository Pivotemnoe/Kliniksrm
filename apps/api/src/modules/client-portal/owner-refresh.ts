import { Prisma } from '@prisma/client';

type Change = { action: string; entityType: string; entityId?: string | null; actorId?: string | null; metadata?: Prisma.InputJsonValue };
const entityTypes = new Set(['Owner', 'Animal', 'AnimalWeightRecord', 'Vaccination', 'Visit', 'VisitDiagnosis', 'VisitDocument', 'LaboratoryOrder', 'LaboratoryOrderItem', 'HospitalStay', 'HospitalRecord', 'HospitalTreatmentPlan', 'Bill', 'BillItem', 'Payment', 'Appointment', 'OnlineAppointmentRequest', 'FileObject']);

export async function queueOwnerRefreshForChange(db: Prisma.TransactionClient, change: Change) {
  // Sync completion itself is audited as an Owner event; do not create a feedback loop.
  if (!entityTypes.has(change.entityType) || change.action.startsWith('client_portal.') || !change.entityId) return;
  const metadata: Prisma.InputJsonObject = change.metadata && typeof change.metadata === 'object' && !Array.isArray(change.metadata)
    ? change.metadata as Prisma.InputJsonObject : {};
  const ownerId = await resolveOwnerId(db, change, metadata);
  if (ownerId) {
    const access = await db.clientPortalAccess.findUnique({ where: { ownerId }, select: { status: true } });
    if (access && ['INVITED', 'ENABLED'].includes(access.status)) await queue(db, ownerId, change.actorId ?? null);
  }
  if (change.action === 'owner.merge' && typeof metadata.sourceOwnerId === 'string') {
    // The old owner no longer exists in CRM; their gateway session must not keep a stale snapshot.
    await queue(db, metadata.sourceOwnerId, change.actorId ?? null, true);
  }
}

export async function queueOwnerAccessRevocation(db: Prisma.TransactionClient, ownerId: string, actorId: string | null) {
  // This outbox entry can be written inside the owner-merge transaction. Its action is immutable.
  await db.backgroundJob.create({ data: {
    queueName: 'owner-gateway-snapshot', jobName: 'sync-owner-snapshot', status: 'PENDING',
    payload: { ownerId, actorId, visitId: null, visitStatus: null, attempts: 0, nextAttemptAt: new Date().toISOString(), revokeAccess: true },
  } });
}

async function queue(db: Prisma.TransactionClient, ownerId: string, actorId: string | null, revokeAccess = false) {
  if (revokeAccess) return queueOwnerAccessRevocation(db, ownerId, actorId);
  const payload = { ownerId, actorId, visitId: null, visitStatus: null, attempts: 0, nextAttemptAt: new Date().toISOString(), revokeAccess };
  const where: Prisma.BackgroundJobWhereInput = {
    queueName: 'owner-gateway-snapshot', jobName: 'sync-owner-snapshot', status: 'PENDING',
    payload: { path: ['ownerId'], equals: ownerId },
  };
  // A RUNNING snapshot may already have been captured, so it must not absorb a later change.
  const existing = await db.backgroundJob.findFirst({ where, select: { id: true } });
  if (existing) {
    const updated = await db.backgroundJob.updateMany({ where: { ...where, id: existing.id }, data: { payload, error: null } });
    if (updated.count) return;
  }
  await db.backgroundJob.create({ data: { queueName: 'owner-gateway-snapshot', jobName: 'sync-owner-snapshot', status: 'PENDING', payload } });
}

async function resolveOwnerId(db: Prisma.TransactionClient, change: Change, metadata: Prisma.InputJsonObject) {
  if (change.entityType === 'Owner') return change.entityId;
  if (typeof metadata.ownerId === 'string') return metadata.ownerId;
  if (typeof metadata.visitId === 'string') return (await db.visit.findUnique({ where: { id: metadata.visitId }, select: { ownerId: true } }))?.ownerId;
  if (typeof metadata.billId === 'string') return (await db.bill.findUnique({ where: { id: metadata.billId }, select: { ownerId: true } }))?.ownerId;
  if (typeof metadata.animalId === 'string') return (await db.animal.findUnique({ where: { id: metadata.animalId }, select: { ownerId: true } }))?.ownerId;
  const where = { id: change.entityId! };
  const visitSelect = { visit: { select: { ownerId: true } } } as const;
  switch (change.entityType) {
    case 'Animal': return (await db.animal.findUnique({ where, select: { ownerId: true } }))?.ownerId;
    case 'Visit': return (await db.visit.findUnique({ where, select: { ownerId: true } }))?.ownerId;
    case 'Bill': return (await db.bill.findUnique({ where, select: { ownerId: true } }))?.ownerId;
    case 'Appointment': return (await db.appointment.findUnique({ where, select: { ownerId: true } }))?.ownerId;
    case 'HospitalStay': return (await db.hospitalStay.findUnique({ where, select: { ownerId: true } }))?.ownerId;
    case 'OnlineAppointmentRequest': return (await db.onlineAppointmentRequest.findUnique({ where, select: { ownerId: true } }))?.ownerId;
    case 'LaboratoryOrder': return (await db.laboratoryOrder.findUnique({ where, select: visitSelect }))?.visit.ownerId;
    case 'HospitalRecord': return (await db.hospitalRecord.findUnique({ where, select: visitSelect }))?.visit.ownerId;
    case 'HospitalTreatmentPlan': return (await db.hospitalTreatmentPlan.findUnique({ where, select: visitSelect }))?.visit.ownerId;
    case 'VisitDiagnosis': return (await db.visitDiagnosis.findUnique({ where, select: visitSelect }))?.visit.ownerId;
    case 'VisitDocument': return (await db.visitDocument.findUnique({ where, select: visitSelect }))?.visit.ownerId;
    case 'LaboratoryOrderItem': return (await db.laboratoryOrderItem.findUnique({ where, select: { order: { select: visitSelect } } }))?.order.visit.ownerId;
    case 'BillItem': return (await db.billItem.findUnique({ where, select: { bill: { select: { ownerId: true } } } }))?.bill.ownerId;
    case 'Payment': return (await db.payment.findUnique({ where, select: { bill: { select: { ownerId: true } } } }))?.bill.ownerId;
    case 'Vaccination': return (await db.vaccination.findUnique({ where, select: { animal: { select: { ownerId: true } } } }))?.animal.ownerId;
    case 'AnimalWeightRecord': return (await db.animalWeightRecord.findUnique({ where, select: { animal: { select: { ownerId: true } } } }))?.animal.ownerId;
    case 'FileObject': {
      const file = await db.fileObject.findUnique({ where, select: { ownerId: true, ...visitSelect, animal: { select: { ownerId: true } }, laboratoryOrder: { select: visitSelect } } });
      return file?.ownerId ?? file?.animal?.ownerId ?? file?.visit?.ownerId ?? file?.laboratoryOrder?.visit.ownerId;
    }
  }
}
