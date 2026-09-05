export function validatePublicCatalog(data, now = Date.now()) {
  if (!data || data.status !== 'ready' || data.currency !== 'RUB' || !Array.isArray(data.items)) return null;
  const updated = Date.parse(data.updatedAt);
  if (!Number.isFinite(updated) || now - updated > 86400000 || updated > now + 300000) return null;
  if (data.items.length > 5000) return null;
  const money = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 9999999999.99;
  if (data.items.some(s => typeof s.id !== 'string' || typeof s.title !== 'string' || typeof s.category !== 'string'
    || !['FIXED', 'RANGE', 'ON_REQUEST'].includes(s.priceType)
    || (s.priceType === 'FIXED' && !money(s.price))
    || (s.priceType === 'RANGE' && (!money(s.minimumPrice) || !money(s.maximumPrice) || s.maximumPrice < s.minimumPrice)))) return null;
  return data;
}
const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 });
export function formatPrice(s) {
  if (s.priceType === 'FIXED') return rub.format(s.price);
  if (s.priceType === 'RANGE') return `${rub.format(s.minimumPrice)} – ${rub.format(s.maximumPrice)}`;
  return 'Уточните в клинике';
}
