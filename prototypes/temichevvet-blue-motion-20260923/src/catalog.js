export const PUBLIC_CATALOG =
  "https://clinic.temichevvet.ru/v1/public/clinic/catalog";
export function normalizeCatalog(data, now = Date.now()) {
  if (
    data?.status !== "ready" ||
    data.currency !== "RUB" ||
    !Array.isArray(data.items)
  )
    throw new Error("unavailable");
  const date = Date.parse(data.updatedAt);
  if (!Number.isFinite(date) || now - date > 86400000 || date - now > 300000)
    throw new Error("stale");
  const seen = new Set();
  const items = data.items
    .filter((item) => {
      const p = item.priceType === "RANGE" ? item.minimumPrice : item.price;
      if (
        !item.id ||
        seen.has(item.id) ||
        typeof item.title !== "string" ||
        !item.title.trim() ||
        typeof item.category !== "string"
      )
        return false;
      if (
        !["FIXED", "RANGE"].includes(item.priceType) ||
        typeof p !== "number" ||
        !Number.isFinite(p) ||
        p <= 0
      )
        return false;
      if (
        item.priceType === "RANGE" &&
        (!Number.isFinite(item.maximumPrice) || item.maximumPrice < p)
      )
        return false;
      if (
        /(?:внутренн|служебн|тестов|техническ)/i.test(
          item.category + " " + item.title,
        )
      )
        return false;
      seen.add(item.id);
      return true;
    })
    .map((item) =>
      item.priceType === "FIXED"
        ? { ...item, minimumPrice: item.price, maximumPrice: item.price }
        : item,
    );
  return { ...data, items };
}
export const rub = (n) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
export function displayPrice(item) {
  if (item.priceType === "FIXED") return rub(item.price);
  return item.maximumPrice > item.minimumPrice
    ? `${rub(item.minimumPrice)} – ${rub(item.maximumPrice)}`
    : `от ${rub(item.minimumPrice)}`;
}
export function filterCatalog(items, query, category) {
  const words = query
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .split(/\s+/)
    .filter(Boolean);
  return items.filter(
    (i) =>
      (!category || i.category === category) &&
      words.every((w) => {
        const text = (i.title + " " + i.category)
          .toLocaleLowerCase("ru")
          .replaceAll("ё", "е");
        // The clinical abbreviation is a word, not the fragment in «инфузия».
        if (w === "узи") return /(?:^|[^\p{L}\p{N}])узи(?:$|[^\p{L}\p{N}])/u.test(text);
        return text.includes(w);
      }),
  ).sort((a, b) => a.category.localeCompare(b.category, "ru") || a.title.localeCompare(b.title, "ru", { numeric: true }));
}
