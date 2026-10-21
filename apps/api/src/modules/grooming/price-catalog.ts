import catalog from './price-catalog.json';

type Price = { min?: number; max?: number; kind?: string; percent?: number } | null;
export const groomingPriceCatalogVersion = catalog.version;
export const groomingRetiredCatalogKeys = [
  ...catalog.dogs.filter(breed => !breed.coatCare).map(breed => `dog:${breed.id}:dry`),
  'cat:clean:dry', 'cat:matted:dry',
];
const retiredKeys = new Set(groomingRetiredCatalogKeys);
export function groomingServiceRetired(service: { catalogKey?: string | null }) {
  return Boolean(service.catalogKey && retiredKeys.has(service.catalogKey));
}
export function groomingPriceFields(price: Price) {
  if (!price) return { price: 0, maximumPrice: null, priceType: 'QUOTE' };
  if (price.percent) return { price: price.percent, maximumPrice: null, priceType: 'PERCENT' };
  if (price.kind === 'upTo') return { price: 0, maximumPrice: price.max!, priceType: 'UP_TO' };
  return { price: price.min!, maximumPrice: price.max !== price.min ? price.max! : null, priceType: price.max !== price.min ? 'RANGE' : 'FIXED' };
}
const names = { dry: 'Стрижка без мытья', hygiene: 'Гигиенический уход', full: 'Полный комплекс' };
export function groomingPriceEntries() {
  const result: Array<{ catalogKey: string; title: string; price: number; maximumPrice: number | null; priceType: string; catalogData: Record<string, unknown> }> = [];
  for (const breed of catalog.dogs) for (const kind of ['dry', 'hygiene', 'full'] as const) {
    if (kind === 'dry' && !breed.coatCare) continue;
    const name = breed.coatCare && kind === 'dry' ? 'Вычёсывание без мытья' : breed.coatCare && kind === 'full' ? 'Мытьё и уход за шерстью' : names[kind];
    result.push({ catalogKey: `dog:${breed.id}:${kind}`, title: `${breed.name} · ${name}`, ...groomingPriceFields(breed[kind]), catalogData: { species: 'DOG', breedId: breed.catalogueId || breed.id, breedRowId: breed.id, breedName: breed.name, kind, serviceName: name, category: 'CARE', durationHint: breed.duration || '', note: breed.note || '' } });
  }
  for (const condition of ['clean', 'matted'] as const) for (const [kind, name] of [['wash', 'Стрижка и мытьё'], ['deshedWash', 'Экспресс-линька и мытьё']] as const) {
    const label = condition === 'clean' ? 'Без колтунов' : 'Есть колтуны';
    result.push({ catalogKey: `cat:${condition}:${kind}`, title: `Кошка · ${name} · ${label.toLowerCase()}`, ...groomingPriceFields(catalog.cats[condition][kind]), catalogData: { species: 'CAT', condition, serviceName: name, kind, category: 'CARE', durationHint: catalog.cats.duration } });
  }
  result.push({ catalogKey: 'cat:extra:deshed', title: 'Кошка · Экспресс-линька без мытья', ...groomingPriceFields(catalog.cats.deshed), catalogData: { species: 'CAT', category: 'CARE', serviceName: 'Экспресс-линька без мытья' } },
    { catalogKey: 'cat:extra:assistant', title: 'Кошка · Помощь сотрудника', ...groomingPriceFields(catalog.cats.assistant), catalogData: { species: 'CAT', category: 'SUPPLEMENT', serviceName: 'Помощь сотрудника при стрижке кошки', supplement: true } });
  for (const extra of catalog.extras) result.push({ catalogKey: `extra:${extra.id}`, title: extra.name, ...groomingPriceFields(extra.price), catalogData: { species: 'ANY', category: extra.supplement || extra.unit ? 'SUPPLEMENT' : 'EXTRA', serviceName: extra.name, unit: extra.unit || '', supplement: Boolean(extra.supplement), note: extra.note || '' } });
  return result;
}

const number = new Intl.NumberFormat('ru-RU');
export function groomingPriceLabel(service: { price: unknown; maximumPrice?: unknown; priceType?: string; catalogData?: unknown }) {
  const min = Number(service.price), max = Number(service.maximumPrice);
  const data = (service.catalogData || {}) as Record<string, unknown>;
  if (service.priceType === 'QUOTE') return 'Уточним перед записью';
  const prefix = data.supplement ? '+ ' : '';
  const suffix = data.unit === 'hour' ? ' / час' : '';
  if (service.priceType === 'PERCENT') return `${prefix}${number.format(min)}%`;
  if (service.priceType === 'UP_TO') return `${prefix}до ${number.format(max)} ₽${suffix}`;
  if (service.priceType === 'RANGE') return `${prefix}${number.format(min)}–${number.format(max)} ₽${suffix}`;
  return `${prefix}${number.format(min)} ₽${suffix}`;
}

export function groomingServiceBookable(service: { catalogKey?: string | null; priceType?: string; catalogData?: unknown }) {
  const data = (service.catalogData || {}) as Record<string, unknown>;
  return !groomingServiceRetired(service) && !['QUOTE', 'PERCENT'].includes(service.priceType || 'FIXED') && data.category !== 'SUPPLEMENT';
}
