import { BadRequestException } from '@nestjs/common';
import { VisitType } from '@prisma/client';

export const VISIT_DIAGNOSIS_TYPES = [
  'Предварительный',
  'Дифференциальный',
  'Клинический',
  'Окончательный',
] as const;

export const VISIT_DIAGNOSIS_STATUSES = [
  'Под вопросом',
  'Подтверждён',
  'Исключён',
  'На лечении',
  'В ремиссии',
  'Завершён',
] as const;

type VisitForDiagnosisCompletion = {
  visitType: VisitType | null;
};

type DiagnosisForCompletion = {
  diagnosisType: string | null;
};

export function assertPrimaryVisitDiagnosesReady(
  visit: VisitForDiagnosisCompletion,
  diagnoses: DiagnosisForCompletion[],
) {
  if (visit.visitType !== VisitType.PRIMARY) {
    return;
  }

  if (!diagnoses.length) {
    throw new BadRequestException('Вы не указали ни одного диагноза');
  }

  if (diagnoses.some((diagnosis) => !diagnosis.diagnosisType?.trim())) {
    throw new BadRequestException('Укажите тип для каждого диагноза');
  }
}
