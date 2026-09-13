import { FilePurpose, Prisma } from '@prisma/client';

// Existing clinical states drive delivery. No separate owner-publication state.
export const ownerLaboratorySelect = {
  id: true, status: true, createdAt: true, completedAt: true,
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, title: true, code: true, status: true,
      resultValue: true, resultText: true, unit: true,
      referenceRange: true, completedAt: true,
    },
  },
} satisfies Prisma.LaboratoryOrderSelect;

type LaboratoryOrder = Prisma.LaboratoryOrderGetPayload<{ select: typeof ownerLaboratorySelect }>;

export function toOwnerLaboratoryOrder(order: LaboratoryOrder) {
  return {
    id: order.id, status: order.status, createdAt: order.createdAt, completedAt: order.completedAt,
    items: order.items.map((item) => {
      const ready = order.status !== 'CANCELLED' && item.status === 'COMPLETED';
      return {
        id: item.id, title: item.title, code: item.code,
        status: order.status === 'CANCELLED' ? 'CANCELLED' : item.status,
        unit: item.unit, referenceRange: item.referenceRange,
        resultValue: ready ? item.resultValue : null,
        resultText: ready ? item.resultText : null,
        completedAt: ready ? item.completedAt : null,
      };
    }),
  };
}

// These are clinical archive categories already available in the upload form.
export const ownerArchiveCategories = ['История лечения', 'Анализы', 'Заключения', 'Согласия', 'Выписки', 'Изображения'];

export function ownerGatewayFileWhere(ownerId: string): Prisma.FileObjectWhereInput {
  const visitOwner = { ownerId, animal: { ownerId }, status: { not: 'CANCELLED' as const } };
  return {
    purpose: { in: [FilePurpose.MEDICAL_DOCUMENT, FilePurpose.LABORATORY_RESULT] },
    deletedAt: null,
    visibility: { not: 'INTERNAL' },
    AND: [
      // Require an owner link, and reject contradictory links rather than using a permissive OR alone.
      { OR: [{ ownerId }, { animal: { ownerId } }, { visit: visitOwner }, { laboratoryOrder: { visit: visitOwner } }, { laboratoryOrderItem: { order: { visit: visitOwner } } }, { visitDocument: { visit: visitOwner } }] },
      { OR: [{ ownerId: null }, { ownerId }] },
      { OR: [{ animalId: null }, { animal: { ownerId } }] },
      { OR: [{ visitId: null }, { visit: visitOwner }] },
      { OR: [{ laboratoryOrderId: null }, { laboratoryOrder: { visit: visitOwner, status: { not: 'CANCELLED' } } }] },
      { OR: [{ laboratoryOrderItemId: null }, { laboratoryOrderItem: { status: 'COMPLETED', order: { visit: visitOwner, status: { not: 'CANCELLED' } } } }] },
      { OR: [{ visitDocumentId: null }, { visitDocument: { status: 'SIGNED', visit: visitOwner } }] },
      { OR: [
        { laboratoryOrderItem: { status: 'COMPLETED', order: { status: { not: 'CANCELLED' } } } },
        { laboratoryOrderItemId: null, laboratoryOrder: { status: 'COMPLETED' } },
        { laboratoryOrderId: null, laboratoryOrderItemId: null, visitDocument: { status: 'SIGNED' } },
        { laboratoryOrderId: null, laboratoryOrderItemId: null, visitDocumentId: null, visit: { status: 'COMPLETED' } },
        { laboratoryOrderId: null, laboratoryOrderItemId: null, visitDocumentId: null, visitId: null,
          archiveCategory: { in: ownerArchiveCategories } },
      ] },
    ],
  };
}

export function isOwnerDiagnosis(diagnosis: { diagnosisType: string | null; status: string | null }) {
  const type = diagnosis.diagnosisType?.trim().toLowerCase();
  const status = diagnosis.status?.trim().toLowerCase();
  return type !== 'дифференциальный' && type !== 'differential'
    && !['draft', 'cancelled', 'черновик', 'отменён', 'отменен'].includes(status ?? '');
}

export const ownerHospitalSelect = {
  id: true, status: true, startedAt: true, completedAt: true, updatedAt: true,
  animal: { select: { id: true, nickname: true, species: true } },
  employee: { select: { fullName: true } },
  sourceVisit: { select: { hospitalRecords: {
    where: { recordStatus: 'COMPLETED', cancelledAt: null },
    orderBy: { recordedAt: 'desc' },
    take: 100,
    select: { recordType: true, recordedAt: true, completedAt: true, temperatureC: true },
  } } },
} satisfies Prisma.HospitalStaySelect;

type HospitalStay = Prisma.HospitalStayGetPayload<{ select: typeof ownerHospitalSelect }>;

export function toOwnerHospitalStay(stay: HospitalStay) {
  const records = stay.sourceVisit.hospitalRecords;
  const temperature = records.find((record) => record.recordType === 'TEMPERATURE' && record.temperatureC !== null);
  const latestAt = records.reduce((latest, record) => {
    const date = record.completedAt ?? record.recordedAt;
    return date > latest ? date : latest;
  }, stay.updatedAt);
  return {
    id: stay.id, status: stay.status, startedAt: stay.startedAt, completedAt: stay.completedAt,
    updatedAt: latestAt, animal: stay.animal, employee: stay.employee,
    latestTemperature: temperature ? { value: temperature.temperatureC, measuredAt: temperature.recordedAt } : null,
    // A factual summary, not a copy of the shift journal or an inferred clinical condition.
    completedCare: ['MEDICATION', 'PROCEDURE', 'FEEDING', 'CARE'].map((type) => ({
      type, count: records.filter((record) => record.recordType === type).length,
    })),
    recordsLimited: records.length === 100,
  };
}
