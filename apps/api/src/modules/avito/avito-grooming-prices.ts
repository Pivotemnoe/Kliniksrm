import { createHash } from 'node:crypto';
import { groomingPriceLabel, groomingServiceRetired } from '../grooming/price-catalog';
import { petSpecies } from './avito-service-query';
import type { PetServiceContext } from './avito-pet-services';

export type GroomingPriceRow = {
  id: string; key: string; title: string; version: number; label: string;
  priceType: string; price: string; maximumPrice: string | null;
  species: 'CAT' | 'DOG' | 'ANY'; category: string; kind: string;
  breedRowId: string; breedName: string; serviceName: string; condition: string; note: string;
};
export type GroomingPriceContext = {
  species?: 'CAT' | 'DOG'; breedRowIds?: string[]; kind?: string;
  condition?: 'clean' | 'matted'; extraKey?: string;
  awaiting?: 'PET' | 'BREED' | 'SERVICE' | 'CONDITION';
};
export type GroomingPriceAnswer = {
  answer: string; question?: string; context: GroomingPriceContext;
  fingerprint: string; quoted: boolean; canSelfBook?: boolean;
};
type ServiceRow = { id: string; catalogKey: string | null; title: string; version: number; price: unknown; maximumPrice: unknown; priceType: string; catalogData: unknown };
const norm = (s: string) => s.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[‐‑–—-]/g, ' ').replace(/\s+/g, ' ').trim();
// "Той" is a breed qualifier, not an inflection: dropping it makes every
// "йорк терьер" enquiry also match the toy-terrier catalogue row.
const stem = (s: string) => s === 'той' ? s : s.replace(/(?:ского|ской|ские|ский|ого|ому|ыми|ями|ами|иях|ях|ям|ов|ев|ая|яя|ое|ее|ые|ие|ий|ый|ой|ом|а|я|у|ю|е|ы|и)$/u, '').replace(/ь/g, '');
const words = (s: string) => norm(s).match(/[а-яa-z]+/gu)?.map(stem).filter(w => w.length >= 3) ?? [];
const breedFollowupWords = new Set(words('сколько стоит стоить стоимость цена прайс тариф почем обойдется будет получится подскажите скажите пожалуйста примерно примерно это этот эта эту все весь такой такая так же тоже еще теперь только для меня мой моя моей моего наш наша нашей нашего собака собаке собаки пес питомец питомца ему ей его нее для полный комплекс гигиена гигиенический уход стрижка подстричь вычесать вычесывание расчесать экспресс линька мытье мыть мытьем купание купать без нет надо нужно хочу интересует узнать вместе отдельно здесь тут авито сайт сайте онлайн адрес где находитесь находиться находится как добраться рубль рублей рубли'));

/** These are current module rows, including QUOTE/range/unit semantics. No +300 or totals are calculated. */
export function groomingPriceRows(services: ServiceRow[]): GroomingPriceRow[] {
  return services.filter(s => s.catalogKey && !groomingServiceRetired(s)).flatMap(s => {
    const d = s.catalogData && typeof s.catalogData === 'object' && !Array.isArray(s.catalogData) ? s.catalogData as Record<string, unknown> : {};
    if (!['CAT', 'DOG', 'ANY'].includes(String(d.species)) || !['FIXED', 'RANGE', 'QUOTE', 'UP_TO', 'PERCENT'].includes(s.priceType)) return [];
    if (s.price == null || !/^\d+(?:\.\d+)?$/.test(String(s.price))) return [];
    const min = Number(s.price), max = s.maximumPrice == null ? null : Number(s.maximumPrice);
    if (!Number.isFinite(min) || min < 0 || max !== null && (!Number.isFinite(max) || max < min) || ['RANGE', 'UP_TO'].includes(s.priceType) && max === null) return [];
    const text = (k: string) => typeof d[k] === 'string' ? String(d[k]).slice(0, 500) : '';
    return [{ id: s.id, key: s.catalogKey!, title: s.title, version: s.version, label: groomingPriceLabel(s), priceType: s.priceType,
      price: String(s.price), maximumPrice: s.maximumPrice == null ? null : String(s.maximumPrice), species: d.species as GroomingPriceRow['species'],
      category: text('category'), kind: text('kind'), breedRowId: text('breedRowId'), breedName: text('breedName'), serviceName: text('serviceName'), condition: text('condition'), note: text('note') }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function groomingPriceFingerprint(context: PetServiceContext) {
  return createHash('sha256').update(JSON.stringify({ available: context.available, selfBooking: context.selfBookingEnabled, siteUrl: context.siteUrl, address: context.address, rows: context.groomingPrices ?? [] })).digest('hex');
}

export function groomingPriceQuestion(text: string) {
  const t = norm(text);
  return /цен|стоим|прайс|тариф|(?:^|[^а-я])по\s*чем(?=$|[^а-я])|обойдется|(?:^|[^а-я])скок(?:о|а)?(?=$|[^а-я])/u.test(t)
    || /сколько/u.test(t) && !/сколько\s+(?:времени|час|минут|дней|суток|лет|месяц|недел)/u.test(t);
}

export function withGroomingPricePrefix(prefix: string | undefined, text: string | null) {
  if (!prefix || !text) return text;
  const body = text.split('\n').filter(line => !line.startsWith('Стоимость груминга зависит от выбранной услуги, питомца и состояния шерсти.')).join('\n').trim();
  return `${prefix}\n\n${body}`;
}

export function parseGroomingPriceContext(value: unknown): GroomingPriceContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>, result: GroomingPriceContext = {};
  if (v.species === 'DOG' || v.species === 'CAT') result.species = v.species;
  if (Array.isArray(v.breedRowIds)) result.breedRowIds = v.breedRowIds.filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s)).slice(0, 8);
  if (typeof v.kind === 'string' && ['full', 'hygiene', 'dry', 'wash', 'washOnly', 'deshedWash', 'deshed'].includes(v.kind)) result.kind = v.kind;
  if (v.condition === 'clean' || v.condition === 'matted') result.condition = v.condition;
  if (typeof v.extraKey === 'string' && /^(?:extra|cat:extra):[a-z-]{1,60}$/.test(v.extraKey)) result.extraKey = v.extraKey;
  if (['PET', 'BREED', 'SERVICE', 'CONDITION'].includes(String(v.awaiting))) result.awaiting = v.awaiting as GroomingPriceContext['awaiting'];
  return result;
}

function breeds(rows: GroomingPriceRow[], input: string) {
  const unique = [...new Map(rows.filter(r => r.breedRowId).map(r => [r.breedRowId, r])).values()];
  const positive = input.replace(/(?:^|\s)не\s+(?:(?:этот|эта|тот|та)\s+)?[а-яa-z]+/gu, ' ');
  const tokens = words(positive), mixed = /метис|помесь|микс/u.test(positive);
  const generic = new Set(['овчарка','ретривер','шпиц','пудель','колли','кокер','спаниель','болонка','терьер','мастиф','сеттер','шнауцер','борзая','метис'].map(stem));
  const requestedFamilies = tokens.filter(w => generic.has(w));
  const aliases: Record<string, RegExp> = {
    york: /(?:^|[^а-я])йорк[а-я]*(?=$|[^а-я])/u, maltese: /мальтез[а-я]*/u, shihtzu: /ши\s*тцу/u,
    westie: /вестик[а-я]*|вести(?=$|[^а-я])/u, newfoundland: /ньюфаунд[а-я]*|водолаз[а-я]*/u,
    'german-shepherd': /немецк[а-я]*\s+овчарк[а-я]*/u,
  };
  const scored = unique.map(row => {
    const title = words(row.breedName);
    const matched = title.filter(w => tokens.some(token => w === token || token.length >= 4 && w.length >= 4 && (w.startsWith(token) || token.startsWith(w))));
    const required = title.filter(w => !generic.has(w));
    const families = title.filter(w => generic.has(w));
    const alias = !mixed && aliases[row.breedRowId]?.test(positive);
    const excluded = mixed && !row.breedRowId.startsWith('mixed-') || row.breedRowId === 'york' && /бивер/u.test(positive)
      || !alias && requestedFamilies.length > 0 && families.length > 0 && !families.some(w => requestedFamilies.includes(w));
    const score = excluded ? 0 : alias ? 100
      : required.every(w => matched.includes(w)) && matched.length ? matched.length + (title.length === 1 ? 10 : 0) : 0;
    return { row, score, families, family: !excluded && matched.some(w => generic.has(w)) };
  });
  let selected = scored.filter(s => s.score > 0).map(s => s.row);
  // A shared family word is useful for clarification, never for treating an
  // unlisted Caucasian/Australian shepherd as the listed German shepherd.
  if (!selected.length) { const family = scored.filter(s => s.family).map(s => s.row); selected = family.length > 1 ? family : []; }
  else for (const family of requestedFamilies) {
    if (selected.some(row => words(row.breedName).includes(family))) continue;
    for (const candidate of scored.filter(s => s.family && s.families.includes(family))) if (!selected.some(r => r.breedRowId === candidate.row.breedRowId)) selected.push(candidate.row);
  }
  if (mixed && selected.length > 1) {
    const weight = input.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*кг/u)?.[1];
    if (weight) {
      const n = Number(weight.replace(',', '.'));
      selected = selected.filter(r => {
        const range = norm(r.breedName).match(/(\d+)\s+(\d+)\s*кг/u);
        if (range) return n >= Number(range[1]) && n <= Number(range[2]);
        const bound = norm(r.breedName).match(/(до|более)\s+(\d+)\s*кг/u);
        return !bound || (bound[1] === 'до' ? n <= Number(bound[2]) : n > Number(bound[2]));
      });
    }
  }
  return selected;
}

function extra(input: string) {
  if (/когт|маникюр/u.test(input)) return 'extra:claws';
  if (/подшерст/u.test(input)) return 'extra:undercoat';
  if (/(?:удал|разоб|вычес).{0,20}колтун/u.test(input)) return 'extra:mats';
  if (/выставк/u.test(input)) return 'extra:show';
  if (/ассистент|помощ.{0,20}сотрудник/u.test(input)) return 'cat:extra:assistant';
  if (/(?:чист|почист).{0,20}уш/u.test(input)) return 'extra:ear-clean';
  if (/паст|гигиен.{0,20}полост.{0,12}рта|(?:чист|почист).{0,20}зуб/u.test(input)) return 'extra:teeth';
  if (/блеск.{0,10}тату/u.test(input)) return 'extra:glitter';
  if (/стразы.{0,12}уш/u.test(input)) return 'extra:ear-stones';
  if (/под\s+хвост/u.test(input)) return 'extra:tail';
  if (/стриж.{0,12}морд/u.test(input)) return 'extra:muzzle';
  if (/стриж.{0,12}пах/u.test(input)) return 'extra:groin';
  if (/стриж.{0,12}уш/u.test(input)) return 'extra:ear-cut';
  return undefined;
}

/** A strict, catalogue-backed selector. Unknown breed/service and ambiguous rows never become a guessed minimum. */
export function groomingPriceAnswer(context: PetServiceContext, text: string, prior?: GroomingPriceContext, priceIntent = false): GroomingPriceAnswer | null {
  if (context.direction !== 'GROOMING' || context.groomingPrices === undefined) return null;
  const t = norm(text), rows = context.groomingPrices, state = { ...(parseGroomingPriceContext(prior) ?? {}) };
  const requested = priceIntent || groomingPriceQuestion(t), foundBreeds = breeds(rows, t), foundExtra = extra(t);
  const species = petSpecies(t), hygiene = /гигиен/u.test(t), deshed = /вычес|вычеш|расчес|расчеш|линьк/u.test(t);
  const cut = /стриж|подстр|постри[гж]|стри(?:чь|гут|гу)/u.test(t), wash = /мыть|мытье|купан|купать/u.test(t);
  const uncertainCondition = /колтун/u.test(t) && /не\s+знаю|не\s+уверен|неясно|непонятно|или\s+нет/u.test(t);
  const condition = uncertainCondition ? undefined : /(?:без|нет|никаких|ни\s+одного)\s+колтун|колтун[а-я]*\s+нет/u.test(t) ? 'clean' : /колтун/u.test(t) ? 'matted'
    : state.awaiting === 'CONDITION' && /^(?:нет|нету)[.!\s]*$/u.test(t) ? 'clean'
    : state.awaiting === 'CONDITION' && /^(?:да|есть)[.!\s]*$/u.test(t) ? 'matted' : undefined;
  const serviceMention = foundExtra || hygiene || deshed || cut || wash || /комплекс|полный|полного/u.test(t);
  if (!requested && !(prior && (foundBreeds.length || serviceMention || species || condition))) return null;
  if (/узи|рентген|вакцин|привив|стерилизац|кастрац|наркоз|ультразвук|санац/u.test(t)) return null;
  const fingerprint = groomingPriceFingerprint(context);
  const result = (answer: string, question?: string, quoted = false): GroomingPriceAnswer => ({ answer, question, context: state, fingerprint, quoted });
  if (!context.available || !rows.length) return result('Сейчас точный прайс груминга недоступен. Стоимость уточнит администратор.');
  if (species && species !== state.species) { state.species = species; delete state.breedRowIds; delete state.condition; }
  // Reuse a known breed for short service/price follow-ups only. An unmatched
  // pet description (e.g. "а для корги?") must not inherit the previous dog's price.
  if (state.species === 'DOG' && state.breedRowIds?.length && !foundBreeds.length && !foundExtra && (requested || serviceMention || species)
    && words(t).some(w => !breedFollowupWords.has(w) && !rows.some(r => words(r.serviceName).includes(w)))) delete state.breedRowIds;
  if (foundBreeds.length) { state.species = 'DOG'; state.breedRowIds = foundBreeds.map(r => r.breedRowId).slice(0, 8); delete state.extraKey; }
  if (uncertainCondition) delete state.condition;
  if (condition) state.condition = condition;
  if (state.species === 'DOG' && state.kind === 'wash') state.kind = 'full';
  if (state.species === 'DOG' && state.kind === 'deshed') state.kind = 'dry';
  if (state.species === 'DOG' && state.kind === 'deshedWash') state.kind = 'full';
  if (foundExtra) { state.extraKey = foundExtra; delete state.kind; }
  else if (serviceMention) {
    delete state.extraKey;
    if (hygiene) state.kind = 'hygiene';
    else if (deshed) state.kind = state.species === 'CAT' ? wash && !/без\s+(?:мыть|купан)/u.test(t) ? 'deshedWash' : 'deshed' : wash && !/без\s+(?:мыть|купан)/u.test(t) ? 'full' : 'dry';
    else if (wash && !cut && /без\s+стриж/u.test(t)) state.kind = 'washOnly';
    else if (cut || /комплекс|полный|полного/u.test(t)) state.kind = state.species === 'CAT' ? 'wash' : 'full';
    else if (wash) state.kind = 'washOnly';
  }
  if (cut && /без\s+(?:мыть|купан)|сух[а-я]*\s+стриж/u.test(t) && foundExtra !== 'extra:claws' && !hygiene) {
    delete state.awaiting;
    return result('Стрижки собак и кошек выполняем только с мытьём. Гигиенический уход и вычёсывание могут быть без мытья.');
  }
  if (/тримминг|окрас|покрас|озон/u.test(t)) { delete state.awaiting; return result('Для этой услуги стоимость нужно уточнить у администратора.'); }
  let candidates: GroomingPriceRow[] = [];
  if (state.extraKey) candidates = rows.filter(r => r.key === state.extraKey);
  else {
    if (!state.species) { state.awaiting = 'PET'; return result('', 'Кого планируете привести — кошку или собаку? Если собаку, напишите породу.'); }
    if (state.species === 'DOG') {
      if (!state.breedRowIds?.length) { state.awaiting = 'BREED'; return result('', 'Какой породы собака? Для метиса напишите примерный вес.'); }
      const breedRows = [...new Map(rows.filter(r => state.breedRowIds!.includes(r.breedRowId)).map(r => [r.breedRowId, r])).values()];
      if (!breedRows.length) { delete state.breedRowIds; state.awaiting = 'BREED'; return result('Для этой породы стоимость уточнит администратор.'); }
      if (breedRows.length > 1) { state.awaiting = 'BREED'; return result('', breedRows.length > 5 ? 'Напишите, пожалуйста, полное название породы.' : `Уточните, пожалуйста, вариант: ${breedRows.map(r => r.breedName).join(', ')}.`); }
      candidates = rows.filter(r => r.breedRowId === breedRows[0].breedRowId);
      if (!state.kind) { state.awaiting = 'SERVICE'; return result('', `Какая услуга нужна для ${breedRows[0].breedName}: ${[...new Set(candidates.map(r => r.serviceName))].join(' или ')}?`); }
      candidates = candidates.filter(r => r.kind === state.kind || state.kind === 'washOnly' && r.kind === 'full' && /мытье/u.test(norm(r.serviceName)));
    } else {
      if (!state.kind) { state.awaiting = 'SERVICE'; return result('', 'Для кошки нужна стрижка с мытьём или экспресс-линька?'); }
      const kind = state.kind === 'full' ? 'wash' : state.kind === 'dry' ? 'deshed' : state.kind;
      candidates = rows.filter(r => r.species === 'CAT' && (kind === 'deshed' ? r.key === 'cat:extra:deshed' : r.kind === kind));
      if (candidates.some(r => r.condition) && !state.condition) { state.awaiting = 'CONDITION'; return result('', 'У кошки есть колтуны?'); }
      if (state.condition) candidates = candidates.filter(r => !r.condition || r.condition === state.condition);
    }
  }
  delete state.awaiting;
  if (candidates.length !== 1) return result('Точную стоимость по этому запросу нужно уточнить у администратора.');
  const row = candidates[0];
  if (row.priceType === 'QUOTE') return result(`${row.title}: точную стоимость уточнит администратор груминга. Можно продолжить здесь, в Авито.`);
  return { ...result(`${row.title} — ${row.label}.${row.note ? ` ${row.note}.` : ''}`, undefined, true), canSelfBook: row.category !== 'SUPPLEMENT' && row.priceType !== 'PERCENT' };
}
