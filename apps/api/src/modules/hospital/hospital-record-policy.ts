const plannedDispositionStatuses = new Set(['COMPLETED', 'SKIPPED']);

const lateDispositionAllowedFields = new Set([
  'recordStatus',
  'completedAt',
  'temperatureC',
]);

export function isPlannedDispositionTransition(
  currentStatus: string,
  nextStatus: string | undefined,
) {
  return currentStatus === 'PLANNED'
    && nextStatus !== undefined
    && plannedDispositionStatuses.has(nextStatus);
}

export function findUnsafeLateDispositionFields(input: object) {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field)
    .filter((field) => !lateDispositionAllowedFields.has(field));
}
