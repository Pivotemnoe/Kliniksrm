import { BadRequestException } from '@nestjs/common';
import { petSpecies } from './avito-service-query';

export type ClinicProgrammePrice = { species: 'CAT' | 'DOG'; programme: 'STANDARD' | 'EXTENDED'; laboratory: 'CLINIC' | 'INVITRO'; regularPrice: number; discountedPrice: number };
export type ClinicProgrammeTable = { source: 'OWNER_CONFIRMED_TABLE'; title: string; confirmedAt: string; discountAvailableToAll: boolean; references: string[]; prices: ClinicProgrammePrice[] };
export function parseProgrammeTable(raw: unknown): ClinicProgrammeTable | undefined {
  if (raw === undefined) return undefined;
  const x = raw as ClinicProgrammeTable;
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).sort().join(',') !== 'confirmedAt,discountAvailableToAll,prices,references,source,title'
    || x.source !== 'OWNER_CONFIRMED_TABLE' || typeof x.title !== 'string' || !x.title.trim() || x.title.length > 160
    || typeof x.confirmedAt !== 'string' || !Number.isFinite(Date.parse(x.confirmedAt)) || typeof x.discountAvailableToAll !== 'boolean'
    || !Array.isArray(x.references) || x.references.length < 1 || x.references.length > 10 || !x.references.every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)
    || !Array.isArray(x.prices) || x.prices.length < 1 || x.prices.length > 32) throw new BadRequestException('Проверьте утверждённую таблицу программ клиники');
  for (const row of x.prices) if (!row || Object.keys(row).sort().join(',') !== 'discountedPrice,laboratory,programme,regularPrice,species'
    || !['CAT','DOG'].includes(row.species) || !['STANDARD','EXTENDED'].includes(row.programme) || !['CLINIC','INVITRO'].includes(row.laboratory)
    || ![row.regularPrice,row.discountedPrice].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10000000)
    || row.discountedPrice > row.regularPrice) throw new BadRequestException('Обычная цена и цена со скидкой должны быть указаны отдельно');
  if (new Set(x.prices.map(r => `${r.species}:${r.programme}:${r.laboratory}`)).size !== x.prices.length) throw new BadRequestException('В таблице есть повторяющиеся варианты программы');
  return JSON.parse(JSON.stringify(x));
}
const money = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;
export function programmePriceText(row: ClinicProgrammePrice, all: boolean) {
  return `обычная цена ${money(row.regularPrice)}, ${all ? 'сейчас со скидкой для всех' : 'по условиям скидки'} ${money(row.discountedPrice)}`;
}
export function programmeTableSummary(table: ClinicProgrammeTable) {
  return table.prices.map(row => `${row.species === 'CAT' ? 'Кошка' : 'Собака'}, ${row.programme === 'STANDARD' ? 'стандартная' : 'расширенная'}, ${row.laboratory === 'CLINIC' ? 'в клинике' : 'с «Инвитро»'}: ${programmePriceText(row,table.discountAvailableToAll)}.`).join('\n');
}
export function programmePriceAnswer(text: string, table: ClinicProgrammeTable, knownSpecies?: 'CAT' | 'DOG') {
  const species = petSpecies(text) ?? knownSpecies;
  if (!species) return { text: 'Для кошки или собаки нужна диспансеризация? Есть стандартная и расширенная программы.', reason: 'PROGRAMME_PRICE_CLARIFY', handoff: false };
  const value = text.toLocaleLowerCase('ru-RU');
  const standard = /стандартн/u.test(value) && !/не\s+стандартн/u.test(value);
  const extended = /расширенн/u.test(value) && !/не\s+расширенн/u.test(value);
  const programme = standard && extended ? null : extended ? 'EXTENDED' : 'STANDARD';
  const laboratory = /без\s+(?:инвитро|invitro)|не\s+(?:в\s+)?инвитро|на\s+месте/u.test(value) ? 'CLINIC' : /инвитро|invitro/u.test(value) ? 'INVITRO' : /в\s+клинике/u.test(value) ? 'CLINIC' : null;
  const rows = table.prices.filter(row => row.species === species && (!programme || row.programme === programme) && (!laboratory || row.laboratory === laboratory));
  if (!rows.length) return { text: 'Для этого варианта программы цена в утверждённой таблице не указана.', reason: 'PROGRAMME_PRICE_NOT_FOUND', handoff: true };
  const subject = `${programme === null ? 'Диспансеризация' : programme === 'STANDARD' ? 'Стандартная диспансеризация' : 'Расширенная диспансеризация'} ${species === 'CAT' ? 'кошки' : 'собаки'}`;
  const lines = rows.map(row => `${programme === null ? `${row.programme === 'STANDARD' ? 'Стандартная' : 'Расширенная'}, ` : ''}${row.laboratory === 'CLINIC' ? 'В клинике' : 'С отправкой анализов в «Инвитро»'}: ${programmePriceText(row,table.discountAvailableToAll)}.`);
  return { text: `${subject}.\n${lines.join('\n')}${programme === 'STANDARD' && !/стандартн/u.test(value) ? '\nЕсть и расширенная программа. Подсказать её состав и стоимость?' : ''}`, reason: 'OWNER_APPROVED_PROGRAMME_PRICE', handoff: false };
}
