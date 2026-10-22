import {displayPrice, normalizeCatalog, rub} from './catalog.js';

// Re-resolve IDs against the current public catalog. Never carry arbitrary URL
// text, stale/hidden entries, a claimed treatment total, or a partial long list.
export function priceSelectionBooking(catalog, selectedIds, now = Date.now()) {
  if (!catalog || !Array.isArray(selectedIds) || !selectedIds.length) return null;
  let publicCatalog;
  try { publicCatalog = normalizeCatalog(catalog, now); }
  catch { return null; }
  const selected = new Set(selectedIds);
  const items = publicCatalog.items.filter(item => selected.has(item.id));
  if (!items.length) return null;
  const minimum = items.reduce((sum,item)=>sum+item.minimumPrice,0);
  const maximum = items.reduce((sum,item)=>sum+item.maximumPrice,0);
  const total = minimum === maximum ? rub(minimum) : `${rub(minimum)} – ${rub(maximum)}`;
  const message = [
    'Хочу уточнить визит и стоимость выбранных услуг из прейскуранта:',
    ...items.map((item,index)=>`${index+1}. ${item.title} — ${displayPrice(item)}.`),
    `По прейскуранту: ${total}. Это не окончательная стоимость лечения. Состав услуг и время визита прошу согласовать.`,
  ].join('\n');
  if (message.length > 4000) return null;
  return {message, serviceIds:items.map(item=>item.id), count:items.length, minimum, maximum};
}
