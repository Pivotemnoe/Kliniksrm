// Administrative synonyms only. They select existing CRM rows, never invent a tariff.
export type ClinicServiceFamily = 'VACCINE' | 'DENTAL' | 'XRAY' | 'ULTRASOUND' | 'SURGERY' | 'CHECKUP' | 'VISIT';
const normalized = (text: string) => text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
export function clinicServiceFamily(text: string): ClinicServiceFamily | null {
  const value = normalized(text);
  if (/санац.{0,15}ротов|чист[а-я]*\s+зуб|зуб[а-я]*\s+(?:по)?чист/u.test(value)) return 'DENTAL';
  if (/вакцин|привив/u.test(value)) return 'VACCINE';
  if (/рентген|снимок/u.test(value)) return 'XRAY';
  if (/(?:^|\s)узи(?=$|\s|[,.?!])|ультразвуков.{0,10}исследован/u.test(value)) return 'ULTRASOUND';
  if (/стерилизац|кастрац/u.test(value)) return 'SURGERY';
  if (/диспансеризац/u.test(value)) return 'CHECKUP';
  if (/прием|осмотр/u.test(value)) return 'VISIT';
  return null;
}
export function petSpecies(text: string): 'CAT' | 'DOG' | null {
  const value = normalized(text);
  const cat = /(?:^|[^а-я])(?:кошк[а-я]*|кота?|коту|котом|котен[а-я]*|котят[а-я]*)(?=$|[^а-я])/u.test(value);
  const dog = /(?:^|[^а-я])(?:собак[а-я]*|щен[а-я]*|пес|пса)(?=$|[^а-я])/u.test(value);
  return cat === dog ? null : cat ? 'CAT' : 'DOG';
}
export function canonicalClinicQuery(text: string) {
  return normalized(text)
    .replace(/(?:чист[а-я]*\s+зуб[а-я]*|зуб[а-я]*\s+(?:по)?чист[а-я]*)/gu, 'санация ротовой полости')
    .replace(/привив[а-я]*/gu, 'вакцинация').replace(/снимок/gu, 'рентген')
    .replace(/осмотр[а-я]*/gu, 'прием');
}
export function tariffInFamily(title: string, family: ClinicServiceFamily) {
  const value = normalized(title);
  if (family === 'ULTRASOUND') return /^(?:узи(?:\s|$)|ультразвуковое исследование)/u.test(value);
  if (family === 'DENTAL') return /санац.{0,15}ротов|чист[а-я]*\s+зуб/u.test(value);
  if (family === 'VISIT') return /^(?:(?:первичн|повторн)[а-я]*\s+)?прием/u.test(value);
  return clinicServiceFamily(title) === family;
}
