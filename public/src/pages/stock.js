import { date, money } from "../core/format.js";
import { badge, button, h, pageHeader, panel, searchBar, table, tabs } from "../ui/components.js";

export function stockPage({ state, params, path }) {
  const section = params.section || "goods";
  const tab = params.tab;
  const title = section === "supplies" && tab === "invoices" ? "Накладные" : { goods: "Товары", services: "Услуги", supplies: "Учёт" }[section] || "Склад";
  const content = {
    goods: table(["Товар", "Группа", "Цена", "Остаток", "Минимум"], state.goods.map((item) => [
      h(item.title), h(item.group), h(money(item.price)), badge(`${item.stock} шт`, item.stock <= item.min ? "warn" : "ok"), h(`${item.min} шт`)
    ])),
    services: table(["Услуга", "Группа", "Цена", "Тип цены", "Расходные товары"], state.services.map((item) => [
      h(item.title),
      h(item.group),
      h(money(item.price)),
      h(item.priceType),
      h(item.goods?.length ? `${item.goods.length} поз.` : "нет")
    ])),
    supplies: tab === "invoices"
      ? table(["Номер", "Поставщик", "Дата", "Сумма"], state.supplyInvoices.map((invoice) => [
        h(invoice.number), h(invoice.supplier), h(date(invoice.date)), h(money(invoice.total))
      ]))
      : table(["Склад", "Поставка", "Поставщик", "Накладная", "Дата", "Годен до", "Сумма", "Остаток"], state.supplies.map((item) => [
        h(item.warehouse), h(item.title), h(item.supplier), h(item.invoice), h(date(item.date)), h(item.expires), h(money(item.total)), h(`${item.rest} шт`)
      ]))
  }[section];
  const action = section === "goods" ? "open-good-modal" : section === "services" ? "open-service-modal" : "open-supply-modal";
  return `
    ${pageHeader(`Склад · ${title}`, "Номенклатура, услуги, поставки и остатки", button(section === "supplies" ? "Добавить на склад" : `Добавить ${section === "goods" ? "товар" : "услугу"}`, action))}
    ${tabs([
      { path: "/stock/goods", label: "Товары" },
      { path: "/stock/services", label: "Услуги" },
      { path: "/stock/supplies", label: "Учёт" },
      { path: "/stock/supplies/invoices", label: "Накладные" }
    ], path)}
    <div class="toolbar">${searchBar()}</div>
    ${section === "goods" ? panel("Карточка товара", `<div class="kv"><span>НДС</span><b>Без НДС</b><span>GTIN</span><b>сканируется</b><span>Цена</span><b>фиксированная или наценка</b><span>Единицы</span><b>хранение / списание / упаковка</b><span>Уведомления</span><b>минимальный остаток и срок годности</b></div>`) : ""}
    ${section === "supplies" ? panel("Новая поставка", `<div class="kv"><span>Импорт</span><b>файл поставки</b><span>Шапка</span><b>склад, поставщик, номер накладной, дата</b><span>Строка товара</span><b>товар, срок годности, количество, закупочная цена, скидка</b><span>Детально</span><b>стеллаж, полка, серия</b></div>`, button("Печать ценников", "noop", "secondary")) : ""}
    ${content}
  `;
}
