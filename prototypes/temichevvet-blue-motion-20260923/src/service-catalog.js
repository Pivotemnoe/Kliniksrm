import { services } from "./content.js";
// Explicit public-category mapping, based on the read-only catalog. No private CRM.
const categories = {
  consultation: ["Общие услуги"],
  diagnostics: ["Цифровое рентгенографическое исследование (Rg), 1 снимок", "Визуальная диагностика"],
  laboratory: ["Биохимические исследования", "Исследование на инфекционные и инвазионные заболевания (ИХА)", "Другие общеклинические исследования", "Исследования системы крови", "Патоморфологические исследования"],
  surgery: ["ОПЕРАЦИИ ОБЩЕГО ПРОФИЛЯ", "АБДОМИНАЛЬНЫЕ ОПЕРАЦИИ", "ТРАВМАТОЛОГИЯ"],
  inpatient: ["СТАЦИОНАР"], dentistry: ["СТОМАТОЛОГИЧЕСКИЕ ПРОЦЕДУРЫ"], pharmacy: [],
};
export function serviceCatalogItems(items, direction) {
  if (!Object.hasOwn(categories, direction) || direction === "pharmacy") return [];
  return items.filter((item) => {
    const title = item.title.toLocaleLowerCase("ru").replaceAll("ё", "е");
    if (categories[direction].includes(item.category)) {
      return direction !== "consultation" || /прием|консультаци/.test(title);
    }
    if (!["Другие услуги", "Диагностика"].includes(item.category)) return false;
    const matcher = {
      consultation: /^(первичный прием|повторный прием|консультация)/,
      diagnostics: /^(узи|рентген|описание рентген|кардиограмма|экг|лампа вуда)/,
      laboratory: /анализ|исследование|микроскопия|цитология|лейкемия/,
      surgery: /^(кастрация|стерилизация)/,
    }[direction];
    return matcher?.test(title) || false;
  });
}

export function selectedServiceItems(items, selectedIds) {
  return items.filter((item) => selectedIds.includes(item.id));
}
export function getDirectionVisitContext(search = "") {
  const id = new URLSearchParams(search).get("direction");
  const service = services.find((s) => s.id === id);
  if (!service) return null;
  return {
    direction: id, title: "Выбранное направление", serviceTitle: service.title,
    purpose: ["surgery", "inpatient"].includes(id) ? id : ["diagnostics", "laboratory"].includes(id) ? "diagnostics" : "consultation",
    message: `Хочу уточнить запись по направлению «${service.title}». Подскажите, с чего начать и как подготовиться.`,
  };
}
