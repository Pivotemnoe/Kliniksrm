export const preventionDiseaseOptions = [
  { value: 'RABIES', label: 'Бешенство' }, { value: 'CANINE_COMPLEX', label: 'Чума, гепатит, парвовирусный энтерит' },
  { value: 'PARAINFLUENZA', label: 'Парагрипп' }, { value: 'LEPTOSPIROSIS', label: 'Лептоспироз' },
  { value: 'DERMATOPHYTOSIS', label: 'Дерматофитозы' }, { value: 'FELINE_COMPLEX', label: 'Калицивироз, ринотрахеит, панлейкопения' }, { value: 'CHLAMYDIOSIS', label: 'Хламидиоз' },
];
export const reportStageOptions = [{ value: 'AUTO', label: 'По истории; без истории — первичная' }, { value: 'PRIMARY', label: 'Первичная' }, { value: 'REVACCINATION', label: 'Ревакцинация' }];
export type VaccinationReportDetails = { stage?: 'PRIMARY' | 'REVACCINATION'; diseases?: string[]; doseText?: string; administrationRoute?: string; manufacturer?: string; syringesAndNeedles?: string; usedDoses?: number; consumedDoses?: number };
export type PreventionProfile = { title: string; aliases: string[]; diseases: string[]; manufacturer?: string; source?: string; reviewVariant?: boolean };
export type PreventionSettings = { enabled: boolean; time: string; timezone: string; signatories: string[]; profiles: PreventionProfile[] };
export type PreventionReportRow = {
  id: string; animalId: string; title: string; vaccineName: string; vaccinatedAt: string; reportDetails?: VaccinationReportDetails | null;
  animal: { nickname: string; species: string | null; owner: { fullName: string; address?: string | null } };
  doseText: string; administrationRoute: string; manufacturer: string; usedDoses: number | null; consumedDoses: number | null;
};
export type PreventionReport = { id: string; month: string; revision: number; status: string; createdAt: string; sha256: string; snapshot?: {
  rows: PreventionReportRow[]; warnings: { vaccinationId?: string; animalId?: string; message: string }[];
  summary: { title: string; rows: { code: string; stage: string; title: string; count: number | null }[] }[];
  illness: { total: number; dogs: number; cats: number };
} };
