// Local composition only. The helper neither infers diagnoses nor prescribes treatment.
export type DoctorDraftSource = { label: string; value: string };
export type DoctorDraftContext = {
  nickname: string;
  exam?: { purpose?: string | null; anamnesis?: string | null; examination?: string | null } | null;
  diagnoses: { title: string; diagnosisType?: string | null }[];
  treatmentPlan?: string | null;
};
export function buildDoctorAssistantDraft(context: DoctorDraftContext) {
  const sources: DoctorDraftSource[] = [];
  const missing: string[] = [];
  const add = (label: string, value?: string | null) => { const text = value?.trim(); if (text) sources.push({ label, value: text }); else missing.push(label); };
  add('Пациент', context.nickname);
  add('Причина обращения', context.exam?.purpose || context.exam?.anamnesis);
  add('Осмотр', context.exam?.examination);
  const diagnoses = context.diagnoses.filter(x => x.title.trim()).map(x => `${x.diagnosisType?.trim() ? `${x.diagnosisType.trim()}: ` : ''}${x.title.trim()}`).join('\n');
  add('Диагнозы, указанные врачом', diagnoses);
  add('Назначения, указанные врачом', context.treatmentPlan);
  return { sources, missing, text: sources.map(x => `${x.label}: ${x.value}`).join('\n\n'), fingerprint: JSON.stringify(context) };
}
export function appendDoctorDraft(existing: string | null | undefined, draft: string, maximum = 6000) {
  const current = existing?.trim() || ''; const text = draft.trim();
  if (!text) throw new Error('Черновик пуст');
  const result = [current, text].filter(Boolean).join('\n\n');
  if (result.length > maximum) throw new Error(`Рекомендации длиннее ${maximum} символов. Сократите черновик перед принятием.`);
  return result;
}
