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
  species?: 'CAT' | 'DOG'; breedRowIds?: string[]; kind?: string; unlistedBreed?: string;
  weightKg?: string; age?: string; priceRequested?: boolean;
  condition?: 'clean' | 'matted'; extraKey?: string;
  awaiting?: 'PET' | 'BREED' | 'SERVICE' | 'CONDITION' | 'DETAILS';
};
export type GroomingPriceAnswer = {
  answer: string; question?: string; context: GroomingPriceContext;
  fingerprint: string; quoted: boolean; canSelfBook?: boolean;
};
type ServiceRow = { id: string; catalogKey: string | null; title: string; version: number; price: unknown; maximumPrice: unknown; priceType: string; catalogData: unknown };
const norm = (s: string) => s.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[‐‑–—-]/g, ' ').replace(/\s+/g, ' ').trim();
// "Той" is a breed qualifier, not an inflection: dropping it makes every
// "йорк терьер" enquiry also match the toy-terrier catalogue row.
const stem = (s: string) => {
  if (s === 'той') return s;
  const value = s.replace(/(?:ского|ской|ские|ский|ого|ому|ыми|ями|ами|иях|ях|ям|ов|ев|ая|яя|ое|ее|ые|ие|ий|ый|ой|ом|а|я|у|ю|е|ы|и)$/u, '').replace(/ь/g, '');
  return value.length >= 3 ? value : s;
};
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

const quantityText = (text: string) => norm(text).replace(/(^|[^а-я])скок(?:о|а)?(?=$|[^а-я])/gu, '$1сколько');
const explicitPriceQuestion = (text: string) => /цен|стоим|прайс|тариф|(?:^|[^а-я])по\s*чем(?=$|[^а-я])|обойдется|по\s+деньгам/u.test(text);
export function groomingNonPriceQuantityQuestion(text: string) {
  const t = quantityText(text);
  return !explicitPriceQuestion(t) && /сколько\s+(?:(?:примерно|обычно)\s+)?(?:по\s+)?(?:времени|час|минут|дней|суток|лет|месяц|недел)/u.test(t);
}
export function groomingPriceQuestion(text: string) {
  const t = norm(text);
  return explicitPriceQuestion(t) || /сколько/u.test(t) && !groomingNonPriceQuantityQuestion(t);
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
  if (typeof v.unlistedBreed === 'string' && /^[а-яёa-z][а-яёa-z ‐‑–—-]{1,79}$/iu.test(v.unlistedBreed)) result.unlistedBreed = v.unlistedBreed;
  if (typeof v.weightKg === 'string' && /^\d{1,3}(?:[.,]\d{1,2})?$/.test(v.weightKg) && Number(v.weightKg.replace(',', '.')) > 0) result.weightKg = v.weightKg;
  if (typeof v.age === 'string' && /^\d{1,2}(?:[.,]\d+)?\s*(?:лет|год(?:а)?|месяц(?:а|ев)?|мес\.?|недел[а-я]*)$/u.test(v.age)) result.age = v.age;
  if (v.priceRequested === true) result.priceRequested = true;
  if (typeof v.kind === 'string' && ['full', 'hygiene', 'dry', 'wash', 'washOnly', 'deshedWash', 'deshed'].includes(v.kind)) result.kind = v.kind;
  if (v.condition === 'clean' || v.condition === 'matted') result.condition = v.condition;
  if (typeof v.extraKey === 'string' && /^(?:extra|cat:extra):[a-z-]{1,60}$/.test(v.extraKey)) result.extraKey = v.extraKey;
  if (['PET', 'BREED', 'SERVICE', 'CONDITION', 'DETAILS'].includes(String(v.awaiting))) result.awaiting = v.awaiting as GroomingPriceContext['awaiting'];
  return result;
}

function breeds(rows: GroomingPriceRow[], input: string) {
  const unique = [...new Map(rows.filter(r => r.breedRowId).map(r => [r.breedRowId, r])).values()];
  const positive = input.replace(/(?:^|\s)не\s+(?:(?:этот|эта|тот|та)\s+)?[а-яa-z]+/gu, ' ');
  const tokens = words(positive), mixed = /метис|помесь|микс/u.test(positive);
  const exact = unique.filter(row => new RegExp(`(?:^|[^а-яa-z])${norm(row.breedName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^а-яa-z])`, 'u').test(positive));
  if (exact.length) return exact;
  const generic = new Set(['овчарка','ретривер','шпиц','пудель','колли','кокер','спаниель','болонка','терьер','мастиф','сеттер','шнауцер','борзая','метис'].map(stem));
  const requestedFamilies = tokens.filter(w => generic.has(w));
  const aliases: Record<string, RegExp> = {
    york: /(?:^|[^а-яa-z])(?:йорк[а-я]*|ерка?|ерку|york(?:ie|shire)?)(?=$|[^а-яa-z])/u,
    maltese: /мальтез[а-я]*|maltese/u, shihtzu: /ши\s*т[цс]у|шит[цс]у|shih\s*tzu/u,
    maltipoo: /маль?[тд]ипу|мальтипоо|maltipoo/u, chihuahua: /чихуа[а-я]*|чихуахуа|chihuahua/u,
    husky: /(?:^|[^а-яa-z])хаски|husky/u, samoyed: /самоед[а-я]*|samoyed/u,
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
      : required.every(w => matched.includes(w)) && (families.every(w => matched.includes(w)) || tokens.length === 1) && matched.length ? matched.length + (title.length === 1 ? 10 : 0) : 0;
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

// Keep the customer's actual description even when no catalogue row matches.
// These names identify a dog, never authorize a price or a substitute breed.
const unlistedDogs = /(?:^|[^а-яa-z])(?:помапу|помипу|помапоо|pomapoo|корги[а-я]*|corgi|кавапу|кокапу|лабрадудл[а-я]*|голдендудл[а-я]*|(?:кавказск|австралийск)[а-я]*\s+овчарк[а-я]*|бивер[а-я]*(?:[ -]+йорк[а-я]*)?)(?=$|[^а-яa-z])/u;
const catBreeds = /(?:^|[^а-яa-z])(?:мейн[ -]*кун[а-я]*|сфинкс[а-я]*|британ[а-я]*|шотланд[а-я]*|бенгал[а-я]*|персидск[а-я]*|рэгдолл[а-я]*|сиамск[а-я]*)(?=$|[^а-яa-z])/u;
const descriptionStop = new Set(words('здравствуйте здравствуй привет добрый день вечер утро спасибо сколько чем груминг стоимость сколько будет стоить стрижка возраст вес весит весом килограмм месяц месяцев год года лет неделя недель порода породы породу породы собачка собачки собачку собачке песик песика щенок щенка кошечка кошечки кошечку котик котика котейка котейку уход ухода комплексный комплексного примерно примерную примерная примерный другую другой другая да нет уже пока'));
function unlistedDescription(text: string, prior?: GroomingPriceContext) {
  const named = text.match(/(?:^|[^а-я])пород(?:а|ы|у|ой)\s*[:—-]?\s*([а-яa-z][а-яa-z -]{1,100})/u)?.[1];
  const known = text.match(unlistedDogs)?.[0].trim();
  if (known) return known;
  const bareAnswer = prior?.awaiting === 'BREED' && /^[а-яa-z -]{2,80}[.!?]*$/u.test(text);
  const describedDog = petSpecies(text) === 'DOG' || prior?.species === 'DOG' && /(?:для|у\s+меня|пород|а\s+(?:гигиен|стриж))/u.test(text);
  if (!named && !bareAnswer && !describedDog) return undefined;
  const phrase = (named ?? text).split(/[,;.!?\n]|\s+(?:и|а|возраст|вес|лет|месяц|нуж|хочу|можно|сколько|стоим)\S*/u)[0];
  const tokens = phrase.match(/[а-яa-z]+(?:-[а-яa-z]+)*/gu) ?? [];
  const candidate = tokens.filter(token => words(token).some(w => !breedFollowupWords.has(w) && !descriptionStop.has(w)));
  return candidate.length > 0 && candidate.length <= 4 ? candidate.join(' ').slice(0, 80) : undefined;
}

/** Facts are collected before choosing an answer, even in a greeting or a bare
 * breed message. A missing catalogue row is not missing customer information. */
export function groomingRequestContext(context: PetServiceContext, text: string, prior?: GroomingPriceContext): GroomingPriceContext {
  const t = norm(text), rows = context.groomingPrices ?? [], state = { ...(parseGroomingPriceContext(prior) ?? {}) };
  const toyPoodle = /(?:^|[^а-яa-z])(?:той\s*пудел[а-я]*|toy\s*poodle)(?=$|[^а-яa-z])/u.test(t)
    && !rows.some(r => /той\s*пудел|toy\s*poodle/u.test(norm(r.breedName)));
  const explicitSpecies = petSpecies(t), foundBreeds = explicitSpecies === 'CAT' || catBreeds.test(t) ? [] : toyPoodle ? [] : breeds(rows, t);
  const unknownBreed = toyPoodle ? 'той-пуделя' : !foundBreeds.length ? unlistedDescription(t, prior) : undefined;
  const species = explicitSpecies ?? (catBreeds.test(t) ? 'CAT' : foundBreeds.length || unlistedDogs.test(t) || toyPoodle ? 'DOG' : undefined);
  const otherPet = /друг(?:ой|ая|ого|ую)\s+(?:собак|собач|кошк|кошеч|питом)/u.test(t);
  const petChanged = otherPet || species && state.species && species !== state.species
    || foundBreeds.length && state.breedRowIds?.length && foundBreeds.map(r => r.breedRowId).join(',') !== state.breedRowIds.join(',')
    || unknownBreed && (state.breedRowIds?.length || state.unlistedBreed && state.unlistedBreed !== unknownBreed);
  if (petChanged) { delete state.breedRowIds; delete state.unlistedBreed; delete state.weightKg; delete state.age; delete state.condition; delete state.extraKey; delete state.awaiting; }
  if (species) state.species = species;
  if (unknownBreed && state.species !== 'CAT') { state.unlistedBreed = unknownBreed; delete state.breedRowIds; delete state.extraKey; }
  if (foundBreeds.length) { state.species = 'DOG'; state.breedRowIds = foundBreeds.map(r => r.breedRowId).slice(0, 8); delete state.unlistedBreed; delete state.extraKey; }
  const weight = t.match(/(?:^|[\s,;(])(?:вес(?:ит|ом)?\s*[:—-]?\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:кг|килограмм[а-я]*)(?=$|[^а-я])/u)?.[1];
  const weightBand = /\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s*кг|(?:до|более)\s+\d+(?:[.,]\d+)?\s*кг/u.test(t);
  if (weight && !weightBand && Number(weight.replace(',', '.')) > 0) state.weightKg = weight;
  if (state.weightKg && state.breedRowIds?.length && state.breedRowIds.every(id => id.startsWith('mixed-')) && foundBreeds.length !== 1) {
    state.breedRowIds = breeds(rows, `метис ${state.weightKg} кг`).map(row => row.breedRowId);
  }
  const age = t.match(/(?:^|[\s,;(])\d{1,2}(?:[.,]\d+)?\s*(?:лет|год(?:а)?|месяц(?:а|ев)?|мес\.?|недел[а-я]*)(?=$|[\s,.!?])/u)?.[0]?.trim();
  if (age) state.age = age;
  const hygiene = /гигиен/u.test(t), deshed = /вычес|вычеш|расчес|расчеш|линьк/u.test(t);
  const cut = /стриж|подстр|постри[гж]|стри(?:чь|гут|гу)/u.test(t), wash = /мыть|мытье|купан|купать/u.test(t), foundExtra = extra(t);
  const uncertain = /колтун/u.test(t) && /не\s+знаю|не\s+уверен|неясно|непонятно|или\s+нет/u.test(t);
  if (uncertain) delete state.condition;
  else if (/(?:без|нет|никаких|ни\s+одного)\s+колтун|колтун[а-я]*\s+нет/u.test(t) || state.awaiting === 'CONDITION' && /^(?:нет|нету)[.!\s]*$/u.test(t)) state.condition = 'clean';
  else if (/колтун/u.test(t) || state.awaiting === 'CONDITION' && /^(?:да|есть)[.!\s]*$/u.test(t)) state.condition = 'matted';
  if (state.species === 'DOG' && ['wash', 'deshedWash'].includes(state.kind ?? '')) state.kind = 'full';
  if (state.species === 'DOG' && state.kind === 'deshed') state.kind = 'dry';
  if (foundExtra) { state.extraKey = foundExtra; delete state.kind; }
  else if (hygiene || deshed || cut || wash || /комплекс|полный|полного/u.test(t)) {
    delete state.extraKey;
    if (hygiene) state.kind = 'hygiene';
    else if (deshed) state.kind = state.species === 'CAT' ? wash && !/без\s+(?:мыть|купан)/u.test(t) ? 'deshedWash' : 'deshed' : wash && !/без\s+(?:мыть|купан)/u.test(t) ? 'full' : 'dry';
    else if (wash && !cut && /без\s+стриж/u.test(t)) state.kind = 'washOnly';
    else if (cut || /комплекс|полный|полного/u.test(t)) state.kind = state.species === 'CAT' ? 'wash' : 'full';
    else if (wash) state.kind = 'washOnly';
  }
  if (groomingPriceQuestion(t)) state.priceRequested = true;
  // An answered clarification must never keep asking for the same field.
  if (state.awaiting === 'PET' && state.species || state.awaiting === 'BREED' && (state.breedRowIds?.length === 1 || state.unlistedBreed)
    || state.awaiting === 'SERVICE' && state.kind || state.awaiting === 'CONDITION' && state.condition || state.awaiting === 'DETAILS' && state.weightKg && state.age) delete state.awaiting;
  return state;
}

export function groomingMissingDetails(state: GroomingPriceContext) {
  const missing = [!state.weightKg && 'сколько весит собачка', !state.age && 'какой у неё возраст'].filter(Boolean);
  return missing.length ? `Подскажите, пожалуйста, ${missing.join(' и ')}?` : '';
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
  // An erroneous model PRICE or saved price context cannot turn time/age into money.
  if (groomingNonPriceQuantityQuestion(text)) return null;
  const t = norm(text), rows = context.groomingPrices, state = groomingRequestContext(context, text, prior);
  const requested = priceIntent || groomingPriceQuestion(t);
  const detailReply = Boolean(prior?.priceRequested && (/стриж|подстр|гигиен|комплекс|мыть|купан|вычес|линьк|пород|колтун|\d+\s*(?:кг|лет|мес|год)/u.test(t)
    || petSpecies(t) || breeds(rows, t).length || unlistedDogs.test(t) || prior.awaiting && !/^(?:спасибо|понятно|хорошо|до свидания)[.!\s]*$/u.test(t)));
  if (!requested && !detailReply) return null;
  if (/узи|рентген|вакцин|привив|стерилизац|кастрац|наркоз|ультразвук|санац/u.test(t)) return null;
  state.priceRequested = true;
  const cut = /стриж|подстр|постри[гж]|стри(?:чь|гут|гу)/u.test(t), hygiene = /гигиен/u.test(t), foundExtra = extra(t);
  const fingerprint = groomingPriceFingerprint(context);
  const result = (answer: string, question?: string, quoted = false): GroomingPriceAnswer => ({ answer, question, context: state, fingerprint, quoted });
  if (!context.available || !rows.length) return result('Сейчас точный прайс груминга недоступен. Стоимость уточнит администратор.');
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
      if (state.unlistedBreed) {
        const details = groomingMissingDetails(state);
        if (details) state.awaiting = 'DETAILS'; else delete state.awaiting;
        const service = state.kind === 'hygiene' ? 'гигиенического ухода' : state.kind === 'full' ? 'полного комплекса' : 'ухода';
        const known = [state.weightKg && `Вес — ${state.weightKg} кг`, state.age && `возраст — ${state.age}`].filter(Boolean).join(', ');
        return result(`Стоимость ${service} для породы «${state.unlistedBreed}» уточнит администратор.${known ? ` ${known}.` : ''}`, details || undefined);
      }
      if (!state.breedRowIds?.length) { state.awaiting = 'BREED'; return result('', 'Какой породы собака? Для метиса напишите примерный вес.'); }
      const breedRows = [...new Map(rows.filter(r => state.breedRowIds!.includes(r.breedRowId)).map(r => [r.breedRowId, r])).values()];
      if (!breedRows.length) { delete state.breedRowIds; state.awaiting = 'BREED'; return result('Для этой породы стоимость уточнит администратор.'); }
      if (breedRows.length > 1 && breedRows.every(r => r.breedRowId.startsWith('mixed-')) && !state.weightKg) { state.awaiting = 'BREED'; return result('', 'Сколько весит собачка? Это нужно, чтобы выбрать строку прайса для метиса.'); }
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
