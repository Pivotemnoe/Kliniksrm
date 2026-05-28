import { date, money } from "../core/format.js";
import { byId } from "../core/store.js";
import { badge, button, emptyState, h, pageHeader, panel, route, searchBar, table } from "../ui/components.js";

export function billsPage({ state }) {
  return `
    ${pageHeader("Счета", "Оплаты, депозиты, долги и фискализация")}
    <div class="toolbar">${searchBar()}${button("Фильтры", "noop", "secondary")}</div>
    ${panel("Фильтры", `<div class="form-grid"><select><option>приём</option><option>продажа</option></select><select><option>Оплачен</option><option>Не оплачен</option></select><select><option>Тип оплаты</option><option>Наличный</option><option>Безналичный</option></select><input placeholder="Дата"></div>`)}
    ${table(["Статус", "Владелец", "Пациент", "Дата", "Тип оплаты", "Сумма"], state.bills.map((bill) => [
      badge(bill.status, bill.status === "Оплачен" ? "ok" : "warn"),
      route(`/owners/${bill.ownerId}/balance`, byId(state.owners, bill.ownerId)?.name || "—"),
      h(byId(state.animals, bill.animalId)?.name || "—"),
      h(date(bill.date)),
      h(bill.method),
      h(money(bill.total))
    ]))}
    ${panel("Карточка счёта", `
      <div class="kv"><span>Тип</span><b>приём или продажа</b><span>Статус</span><b>полностью / частично / не оплачен</b><span>Платежи</span><b>наличный, безналичный, депозит, аванс</b><span>Документы</span><b>печать товарной накладной и чеков</b></div>
    `)}
  `;
}

export function shopPage({ state }) {
  return `
    ${pageHeader("Продажи", "Розничные продажи без приёма и быстрые списания", button("Добавить продажу", "open-sale-modal"))}
    <div class="toolbar">${searchBar()}</div>
    ${state.sales.length ? table(["Статус", "Номер", "Продавец", "Дата", "Сумма"], state.sales.map((sale) => [
      badge(sale.status, sale.status === "Оплачен" ? "ok" : "warn"),
      h(sale.title),
      h(byId(state.employees, sale.sellerId)?.name || "—"),
      h(date(sale.date)),
      h(money(sale.total))
    ])) : emptyState("Продаж нет")}
    ${panel("Создание продажи", `<div class="kv"><span>Важно</span><b>в Vet.AF открытие /shop/create сразу заводит пустую продажу</b><span>Позиции</span><b>товар, количество, скидка, сумма</b><span>Сотрудники</span><b>можно выбрать исполнителей продажи</b><span>После оплаты</span><b>счёт появляется в общем списке счетов</b></div>`)}
  `;
}
