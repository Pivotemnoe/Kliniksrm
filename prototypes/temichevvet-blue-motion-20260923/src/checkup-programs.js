// One reviewed public source is shared by the page and the clinic assistant.
import data from "../../../apps/owner-gateway/src/clinic-checkup-data.json" with { type: "json" };
export const checkupSpecies = data.species;
export const checkupLabs = data.labs;
export const standardCheckupItems = data.standardItems;
export const checkupProfiles = data.profiles;
const prices = data.prices;
export function checkupProgram(species, lab, program) {
  if (!Object.hasOwn(prices, species) || !Object.hasOwn(checkupLabs, lab) || !["standard", "expanded"].includes(program)) return null;
  const [regular, price] = prices[species][lab][program];
  return { species, lab, program, regular, price, title: program === "standard" ? "Стандартная" : "Расширенная" };
}
export function checkupVisitHref(species, lab, program) {
  return checkupProgram(species, lab, program) ? `/visit?checkup=${species}-${lab}-${program}` : "/visit";
}
export function getCheckupVisitContext(search = "") {
  const [species, lab, program, ...extra] = (new URLSearchParams(search).get("checkup") || "").split("-");
  const selected = !extra.length && checkupProgram(species, lab, program);
  if (!selected) return null;
  const animal = species === "cat" ? "кошки" : "собаки";
  const price = new Intl.NumberFormat("ru-RU").format(selected.price);
  return {
    title: "Выбранная программа", serviceTitle: `Диспансеризация ${animal} · ${selected.title.toLowerCase()}`,
    purpose: "diagnostics", href: "/offers#checkup-programs",
    message: `Хочу записать питомца на диспансеризацию: ${animal}, ${selected.title.toLowerCase()} программа, основные анализы ${lab === "clinic" ? "в клинике" : "в Инвитро"}. Стоимость по акции — ${price} ₽. Подскажите время и подготовку.`,
  };
}
