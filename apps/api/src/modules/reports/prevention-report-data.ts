import { clinicLocalInstant, clinicLocalParts } from '../../common/clinic-calendar';
import { defaultPreventionProfiles, diseaseTitles, PreventionDisease, PreventionProfile, PreventionSettings, preventionDiseases, VaccinationReportDetails } from './prevention-types';

export type PreventionVaccination = {
  id: string; animalId: string; title: string; vaccinatedAt: string; vaccineSeries?: string | null;
  productTitle?: string | null; reportDetails?: unknown;
  animal: { nickname: string; species: string | null; breed?: string | null; sex?: string; birthDate?: string | null; microchip?: string | null; owner: { fullName: string; address?: string | null } };
};
export type PreventionCase = { animalId: string; species: string | null; diagnoses: { title: string; diagnosisType: string | null; status?: string | null }[] };

export function preventionSettings(value: unknown, timezone = 'Europe/Moscow'): PreventionSettings {
  const data = object(value);
  return {
    enabled: data.enabled !== false, time: typeof data.time === 'string' ? data.time : '09:00',
    timezone: typeof data.timezone === 'string' ? data.timezone : timezone,
    signatories: Array.isArray(data.signatories) ? data.signatories as string[] : ['Темичев К.В.', 'Казарина Е.В.'],
    profiles: Array.isArray(data.profiles) ? data.profiles as PreventionProfile[] : defaultPreventionProfiles,
  };
}

export function preventionMonthRange(month: string, timezone: string) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error('Месяц должен быть в формате ГГГГ-ММ');
  const [year, m] = month.split('-').map(Number);
  const start = clinicLocalInstant(new Date(Date.UTC(year, m - 1, 1)), 0, 0, timezone);
  const end = clinicLocalInstant(new Date(Date.UTC(year, m, 1)), 0, 0, timezone);
  return { start, end, from: `${month}-01`, to: new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10) };
}

export function previousPreventionMonth(now: Date, timezone: string) {
  const p = clinicLocalParts(now, timezone);
  return new Date(Date.UTC(p.year, p.month - 2, 1)).toISOString().slice(0, 7);
}

export function normalizeVaccineTitle(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\(?\s*\d+(?:[.,]\d+)?\s*доз[аы]?\s*\)?/g, '').replace(/[^\p{L}\p{N}+]/gu, '');
}

export function buildPreventionSnapshot(input: { month: string; timezone: string; clinic: { name: string; legalName: string; address: string; phone: string }; settings: PreventionSettings; vaccinations: PreventionVaccination[]; history: PreventionVaccination[]; cases: PreventionCase[]; generatedAt: string }) {
  const range = preventionMonthRange(input.month, input.timezone);
  const warnings: { vaccinationId?: string; animalId?: string; message: string }[] = [];
  if (!input.clinic.address.trim()) warnings.push({ message: 'Не указан адрес клиники' });
  if (!input.settings.signatories.length) warnings.push({ message: 'Не указаны подписанты актов' });
  const describe = (row: PreventionVaccination) => {
    const details = object(row.reportDetails) as VaccinationReportDetails;
    const profile = input.settings.profiles.find(p => [p.title, ...p.aliases].some(alias => normalizeVaccineTitle(alias) === normalizeVaccineTitle(row.productTitle || row.title)));
    const explicit = Array.isArray(details.diseases) ? details.diseases.filter(code => preventionDiseases.includes(code)) : [];
    return { details, profile, diseases: explicit?.length ? explicit : profile?.diseases ?? [] };
  };
  const history = [...input.history, ...input.vaccinations].map(row => ({ ...row, ...describe(row) }));
  const rows = input.vaccinations.map(row => {
    const { details, profile, diseases } = describe(row);
    const species = preventionSpecies(row.animal.species);
    const stages = Object.fromEntries(diseases.map(code => [code, details.stage ?? (history.some(old => old.id !== row.id && old.animalId === row.animalId && old.vaccinatedAt < row.vaccinatedAt && old.diseases.includes(code)) ? 'REVACCINATION' : 'PRIMARY')])) as Partial<Record<PreventionDisease, string>>;
    const issue = (message: string) => warnings.push({ vaccinationId: row.id, animalId: row.animalId, message });
    if (!species) issue('Не указан или не распознан вид животного');
    if (!diseases.length) issue('Не определены инфекции в составе вакцины');
    if (profile?.reviewVariant && !details.diseases?.length) issue('Уточните вариант вакцины и наличие компонента хламидиоза');
    if (!row.vaccineSeries?.trim()) issue('Не указана серия вакцины');
    if (!details.syringesAndNeedles?.trim()) issue('Не указаны сведения об использованных шприцах и иглах');
    if (!details.doseText?.trim()) issue('Не указана фактически введённая доза');
    if (!details.administrationRoute?.trim()) issue('Не указан фактический способ введения');
    if (!(details.manufacturer?.trim() || profile?.manufacturer)) issue('Не указан производитель вакцины');
    if (!(Number(details.usedDoses) > 0)) issue('Не указано число использованных доз');
    if (!(Number(details.consumedDoses) > 0)) issue('Не указан расход доз');
    if (details.usedDoses && details.consumedDoses && details.consumedDoses < details.usedDoses) issue('Расход доз меньше числа введённых доз');
    if (!row.animal.owner.address?.trim()) issue('Не указан адрес владельца для реестра');
    return { ...row, species, diseases, stages, vaccineName: profile?.title ?? row.title,
      doseText: details.doseText?.trim() || '', administrationRoute: details.administrationRoute?.trim() || '',
      manufacturer: details.manufacturer?.trim() || profile?.manufacturer || '',
      syringesAndNeedles: details.syringesAndNeedles?.trim() || '',
      usedDoses: details.usedDoses ?? null, consumedDoses: details.consumedDoses ?? null,
      variantNeedsReview: Boolean(profile?.reviewVariant && !details.diseases?.length),
    };
  });
  const definitions: [string, string, PreventionDisease[]][] = [
    ['DOG', 'А) Собаки', ['RABIES', 'CANINE_COMPLEX', 'PARAINFLUENZA', 'LEPTOSPIROSIS', 'DERMATOPHYTOSIS']],
    ['CAT', 'Б) Кошки', ['FELINE_COMPLEX', 'CHLAMYDIOSIS', 'RABIES', 'DERMATOPHYTOSIS']],
    ['FERRET', 'В) Хорьки', ['RABIES']],
  ];
  const summary = definitions.map(([species, title, codes]) => ({ species, title, rows: codes.flatMap(code => (species === 'FERRET' ? ['REVACCINATION'] : ['PRIMARY', 'REVACCINATION']).map(stage => ({
    code, stage, title: `${stage === 'PRIMARY' ? 'Вакцинация' : 'Ревакцинация'} против ${diseaseTitles[code]}`,
    count: rows.some(row => (!row.species || row.species === species) && (!row.diseases.length || (code === 'CHLAMYDIOSIS' && row.variantNeedsReview))) ? null
      : new Set(rows.filter(row => row.species === species && row.diseases.includes(code) && row.stages[code] === stage).map(row => row.animalId)).size,
  }))) }));
  const diseased = input.cases.flatMap(row => {
    const diagnoses = row.diagnoses.filter(d => ['Клинический', 'Окончательный'].includes(d.diagnosisType ?? '') && !/исключ|отмен|не\s*подтвержд/i.test(d.status ?? '') && !/клинически\s*здоров|^здоров|профилакти|вакцинац|исключить|подозрени/i.test(d.title));
    return diagnoses.length ? [{ ...row, diagnoses, species: preventionSpecies(row.species) }] : [];
  });
  const illness = {
    total: new Set(diseased.map(row => row.animalId)).size,
    dogs: new Set(diseased.filter(row => row.species === 'DOG').map(row => row.animalId)).size,
    cats: new Set(diseased.filter(row => row.species === 'CAT').map(row => row.animalId)).size,
    conditions: [
      ['CAT', 'Калицивироз', 'кали[цч]ивир'], ['CAT', 'Панлейкопения', 'панлейкопени'],
      ['DOG', 'Сальмонеллёз', 'сальмонел'], ['DOG', 'Парвовирусный энтерит', 'парвовир'], ['DOG', 'Бабезиоз', 'бабези|пироплазм'],
    ].map(([species, title, pattern]) => ({ species, title, count: new Set(diseased.filter(row => row.species === species && row.diagnoses.some(d => new RegExp(pattern, 'i').test(d.title))).map(row => row.animalId)).size })),
  };
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = JSON.stringify([row.species, row.vaccineName, row.doseText, row.administrationRoute, row.manufacturer, row.syringesAndNeedles]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const acts = [...groups.values()].map(group => ({ species: group[0].species, vaccineName: group[0].vaccineName,
    diseases: [...new Set(group.flatMap(row => row.diseases))], doseText: group[0].doseText,
    administrationRoute: group[0].administrationRoute, syringesAndNeedles: group[0].syringesAndNeedles, manufacturer: group[0].manufacturer,
    heads: new Set(group.map(row => row.animalId)).size,
    usedDoses: group.every(row => row.usedDoses !== null) ? group.reduce((sum, row) => sum + Number(row.usedDoses), 0) : null,
    consumedDoses: group.every(row => row.consumedDoses !== null) ? group.reduce((sum, row) => sum + Number(row.consumedDoses), 0) : null,
  }));
  return { schemaVersion: 1, month: input.month, timezone: input.timezone, range: { from: range.from, to: range.to }, generatedAt: input.generatedAt,
    clinic: input.clinic, signatories: input.settings.signatories, summary, illness, rows, acts, warnings,
    status: warnings.length ? 'NEEDS_REVIEW' : 'READY', stagePolicy: 'HISTORY_OR_PRIMARY',
  };
}
export type PreventionSnapshot = ReturnType<typeof buildPreventionSnapshot>;
export function preventionSpecies(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (['dog', 'dogs', 'собака', 'собаки', 'пес', 'пёс'].includes(normalized ?? '')) return 'DOG';
  if (['cat', 'cats', 'кошка', 'кошки', 'кот'].includes(normalized ?? '')) return 'CAT';
  if (['ferret', 'хорек', 'хорёк', 'хорьки'].includes(normalized ?? '')) return 'FERRET';
  return null;
}
function object(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
