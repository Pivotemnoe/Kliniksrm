import { date, dateTime, money, todayIso } from "../core/format.js";
import { byId } from "../core/store.js";
import { badge, button, emptyState, h, metric, pageHeader, panel, route, searchBar, table, tabs } from "../ui/components.js";

export function newsPage({ state }) {
  return `
    ${pageHeader("Новости", "Внутренние объявления, релизы и инструкции")}
    <div class="list-grid">
      ${state.news.map((item) => `
        <a class="news-card" href="#/news/${item.id}">
          <time>${h(item.date)}</time>
          <strong>${h(item.title)}</strong>
          <p>${h(item.text)}</p>
          <span>${item.tags.map((tag) => badge(tag)).join("")}</span>
        </a>
      `).join("")}
    </div>
  `;
}

export function newsDetailPage({ state, params }) {
  const item = byId(state.news, params.id);
  if (!item) return emptyState("Новость не найдена");
  return `
    ${pageHeader(item.title, item.date)}
    ${panel("Содержание", `<p>${h(item.text)}</p><p>${item.tags.map((tag) => badge(tag)).join("")}</p>`)}
  `;
}

export function dashboardPage({ state, path }) {
  const tab = path.endsWith("/reports") ? "reports" : "graphs";
  const stockValue = state.goods.reduce((sum, item) => sum + item.price * item.stock, 0);
  return `
    ${pageHeader("Сводка", "Операционная панель по клинике", button("Применить", "noop", "secondary"))}
    ${tabs([{ path: "/dashboard", label: "Графики" }, { path: "/dashboard/reports", label: "Отчёты" }], tab === "reports" ? "/dashboard/reports" : "/dashboard")}
    <section class="metrics">
      ${metric("Выручка за день", money(state.bills.reduce((sum, bill) => sum + bill.total, 0)), "по счетам")}
      ${metric("Записи в очереди", state.queue.length, "активные")}
      ${metric("Пациентов", state.animals.length, "в базе")}
      ${metric("Склад", money(stockValue), "остаток")}
    </section>
    <section class="grid-2">
      ${panel("Состояние пациентов", table(["Статус", "Количество"], [["Здоров", "1"], ["Улучшение", "1"]]))}
      ${panel("Финансы", `<div class="kv"><span>Наличные</span><b>${money(0)}</b><span>Безналичные</span><b>${money(1500)}</b></div>`)}
      ${panel("Календарь задач", state.tasks.length ? table(["Задача", "Срок"], state.tasks.map((task) => [h(task.title), h(date(task.due))])) : emptyState("Нет задач"))}
      ${panel("Поставки товаров", table(["Товар", "Количество"], state.supplies.map((supply) => [h(supply.title), h(`${supply.qty} шт`)])))}
      ${panel("Отчёты", table(["Раздел", "Отчёты"], [
        ["Владельцы", "Депозиты, должники, программа лояльности"],
        ["Пациенты", "Вакцинации, идентифицированные животные, профилактическая иммунизация"],
        ["Продажи", "Общие продажи, продажи по владельцу, продажи по сотруднику"],
        ["Склад", "Товары на складе"],
        ["Филиал", "Кассовые операции, расходы, реклама, рецепты"]
      ]))}
    </section>
  `;
}

export function timetablePage({ state, params }) {
  const selected = params.date || todayIso();
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date(selected);
    d.setDate(d.getDate() - 7 + i);
    const iso = d.toISOString().slice(0, 10);
    return route(`/timetable/${iso}`, `${String(d.getDate()).padStart(2, "0")}`, iso === selected ? "active" : "");
  }).join("");
  return `
    ${pageHeader("Расписание", "Планирование приёмов по дате и сотрудникам", button("Записать на приём", "open-appointment-modal"))}
    <div class="calendar-line">${days}</div>
    ${state.timetable.length ? table(["Время", "Врач", "Клиент", "Пациент"], state.timetable.map((item) => [h(item.time), h(item.employee), h(item.owner), h(item.animal)])) : emptyState("График работы не настроен", "Для записи по времени нужен график сотрудника. Для живой очереди используйте раздел Очередь.")}
  `;
}

export function queuePage({ state, params, path }) {
  const status = params.status || "await";
  const statusMap = { await: "В очереди", active: "На приёме", done: "Завершены" };
  const rows = state.queue.filter((item) => item.status === status).map((item) => {
    const owner = item.ownerId ? byId(state.owners, item.ownerId)?.name : item.ownerName;
    const animal = item.animalId ? byId(state.animals, item.animalId)?.name : "первичный";
    return [h(owner), h(animal), h(item.room || "—"), h(item.wait || "0 мин"), h(item.comment || "—")];
  });
  return `
    ${pageHeader("Электронная очередь", "Живой поток обращений без привязки к расписанию", button("Добавить в очередь", "open-queue-modal"))}
    ${tabs([
      { path: "/queue/await", label: "В очереди" },
      { path: "/queue/active", label: "На приёме" },
      { path: "/queue/done", label: "Завершены" }
    ], `/queue/${status}`)}
    <div class="toolbar">${searchBar()}<span class="counter">${h(statusMap[status])}: ${rows.length}</span></div>
    ${table(["Владелец", "Пациент", "Кабинет", "Ожидание", "Комментарий"], rows)}
  `;
}

export function tasksPage({ state, params }) {
  const status = params.status || "await";
  const items = state.tasks.filter((task) => status === "archive" ? task.status === "Архивная" : task.status !== "Архивная");
  return `
    ${pageHeader("Календарь задач", "Контрольные звонки, напоминания и внутренние задачи", button("Добавить задачу", "open-task-modal"))}
    ${tabs([{ path: "/tasks/await", label: "Текущие" }, { path: "/tasks/archive", label: "Архивные" }], `/tasks/${status}`)}
    <div class="toolbar"><select><option>Мои записи</option><option>Все записи</option></select></div>
    ${table(["Статус", "Задача", "Пациент", "Сотрудник / Должность", "Дата"], items.map((task) => [
      badge(task.status),
      h(task.title),
      h(byId(state.animals, task.animalId)?.name || "—"),
      h(byId(state.employees, task.employeeId)?.position || "—"),
      h(date(task.due))
    ]))}
  `;
}

export function onlineRequestsPage({ state, params }) {
  const status = params.status || "active";
  return `
    ${pageHeader("Онлайн-запись", "Заявки с сайта, личного кабинета и QR-ссылки")}
    ${tabs([{ path: "/online-requests/active", label: "Текущая" }, { path: "/online-requests/archive", label: "Архивная" }], `/online-requests/${status}`)}
    ${state.onlineRequests.length ? table(["Клиент", "Пациент", "Желаемое время"], []) : emptyState("Ничего не найдено")}
  `;
}

export function hospitalPage({ state }) {
  const rows = state.hospitalPatients.map((item) => {
    const animal = byId(state.animals, item.animalId);
    const owner = animal ? byId(state.owners, animal.ownerId) : null;
    const box = byId(state.hospitalBoxes, item.boxId);
    return [
      route(`/animals/${animal?.id}/visits`, animal?.name || "Пациент"),
      h(animal?.kind || "—"),
      h(box?.title || "—"),
      h(item.from),
      h(owner?.name || "—"),
      item.todayAssignments.length ? h(item.todayAssignments.join(", ")) : "Нет назначений на текущий день"
    ];
  });
  return `
    ${pageHeader("Стационар", "Назначения, койки, наблюдение и ежедневные отметки")}
    <div class="toolbar">${searchBar()}<input type="date" value="${todayIso()}"></div>
    ${table(["Пациент", "Вид", "Бокс", "С даты", "Владелец", "Назначения"], rows)}
  `;
}
