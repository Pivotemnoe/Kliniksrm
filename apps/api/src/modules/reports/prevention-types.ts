export const preventionDiseases = ['RABIES', 'CANINE_COMPLEX', 'PARAINFLUENZA', 'LEPTOSPIROSIS', 'DERMATOPHYTOSIS', 'FELINE_COMPLEX', 'CHLAMYDIOSIS'] as const;
export type PreventionDisease = typeof preventionDiseases[number];
export type VaccinationReportDetails = {
  stage?: 'PRIMARY' | 'REVACCINATION'; diseases?: PreventionDisease[];
  doseText?: string; administrationRoute?: string; manufacturer?: string; syringesAndNeedles?: string;
  usedDoses?: number; consumedDoses?: number;
};
export type PreventionProfile = { title: string; aliases: string[]; diseases: PreventionDisease[]; manufacturer?: string; source?: string; reviewVariant?: boolean };
export type PreventionSettings = { enabled: boolean; time: string; timezone: string; signatories: string[]; profiles: PreventionProfile[] };
export const defaultPreventionProfiles: PreventionProfile[] = [
  { title: 'Рабифел', aliases: ['Рабифел', 'Рабифел (1 доза)'], diseases: ['RABIES'], manufacturer: 'ООО «Ветбиохим» (Россия)', source: 'https://vetbio.ru/catalog/pets/vaccine/' },
  { title: 'Рабикс', aliases: ['Рабикс', 'Рабикс (1 доза)'], diseases: ['RABIES'], manufacturer: 'ООО «Ветбиохим» (Россия)', source: 'https://vetbio.ru/catalog/pets/vaccine/' },
  { title: 'Дипентавак', aliases: ['Дипентавак', 'Дипентавак 1 доза', 'Дипентовак'], diseases: ['RABIES', 'CANINE_COMPLEX', 'LEPTOSPIROSIS'], manufacturer: 'Ветзвероцентр (Россия)', source: 'https://vzcfarm.ru/partners/documents/dipentavak/' },
  { title: 'Астерион DHPPiLR', aliases: ['Астерион DHPPiLR', 'Астерион DHPPI + RL', 'Астерион DHPPI RL'], diseases: ['RABIES', 'CANINE_COMPLEX', 'PARAINFLUENZA', 'LEPTOSPIROSIS'], manufacturer: 'ООО «Ветбиохим» (Россия)', source: 'https://vetbio.ru/catalog/pets/vaccine/' },
  { title: 'Астерион DHPPiL', aliases: ['Астерион DHPPiL', 'Астерион DHPPIL'], diseases: ['CANINE_COMPLEX', 'PARAINFLUENZA', 'LEPTOSPIROSIS'], manufacturer: 'ООО «Ветбиохим» (Россия)', source: 'https://vetbio.ru/upload/shop_3/2/8/1/item_281/property_143.pdf' },
  { title: 'Мультифел-4', aliases: ['Мультифел-4', 'Мультифел 4 (1 доза)'], diseases: ['FELINE_COMPLEX', 'CHLAMYDIOSIS'], manufacturer: 'ООО «Ветбиохим» (Россия)', source: 'https://www.vetpharm.am/wp-content/uploads/Multifel-4.pdf' },
  { title: 'Мультифел', aliases: ['Мультифел'], diseases: ['FELINE_COMPLEX'], manufacturer: 'ООО «Ветбиохим» (Россия)', reviewVariant: true, source: 'https://vetbio.ru/catalog/pets/vaccine/' },
];

export const diseaseTitles: Record<PreventionDisease, string> = {
  RABIES: 'бешенства', CANINE_COMPLEX: 'чумы, инфекционного гепатита, парвовирусного энтерита',
  PARAINFLUENZA: 'парагриппа', LEPTOSPIROSIS: 'лептоспироза', DERMATOPHYTOSIS: 'дерматофитозов',
  FELINE_COMPLEX: 'калицивироза, ринотрахеита, панлейкопении', CHLAMYDIOSIS: 'хламидиоза',
};
