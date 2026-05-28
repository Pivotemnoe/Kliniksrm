import { money } from "../core/format.js";
import { badge, button, emptyState, h, pageHeader, panel, route, table, tabs } from "../ui/components.js";

const officeTabs = [
  ["schedule", "График сотрудников"],
  ["logs", "События"],
  ["costs", "Расходы"],
  ["wages", "Зарплатные профили"],
  ["voip", "Телефония"],
  ["laboratories", "Лаборатории"],
  ["hospital", "Стационар"],
  ["rooms", "Кабинеты"],
  ["cashboxes", "Онлайн-кассы"],
  ["warehouses", "Склады"],
  ["profile", "Профиль"]
];

export function settingsPage({ state, params, path }) {
  const section = params.section;
  if (section === "organization") return organizationSettings(state, params, path);
  if (section === "office") return officeSettings(state, params, path);
  if (section === "employees") return employeesSettings(state, params, path);
  if (section === "documents") return documentsSettings(state, params, path);
  return emptyState("Раздел настроек не найден");
}

function organizationSettings(state, params, path) {
  const tab = params.tab || "profile";
  const body = {
    profile: panel("Профиль организации", `<div class="form-grid"><input value="Ветеринарный центр"><input value="Айболит"><input value="aibolit@example.local"><input placeholder="Логотип"></div>`, button("Сохранить", "noop")),
    details: panel("Реквизиты", `<div class="form-grid"><input placeholder="Юридическое название"><input placeholder="ИНН"><input placeholder="КПП"><input placeholder="ФИО подписанта"><input placeholder="В лице"><input placeholder="Почтовый адрес"><input placeholder="Юридический адрес"><input placeholder="Название банка"><input placeholder="БИК"><input placeholder="Расчётный счёт"><input placeholder="Корреспондентский счёт"></div>`, button("Сохранить", "noop")),
    tariffs: `
      ${tabs([
        { path: "/settings/organization/tariffs", label: "Баланс" },
        { path: "/settings/organization/tariffs/history", label: "История операций" }
      ], path)}
      ${path.endsWith("/history")
        ? table(["Операция", "Дата", "Сумма"], [["Списание абонентской платы", "сегодня", "-186 ₽"], ["Списание платы за SMS", "сегодня", "-13 ₽"]])
        : panel("Тарифы и платежи", `<div class="metrics"><article class="metric"><span>Баланс</span><strong>${money(state.user.balance)}</strong><em>примерно 189 дней</em></article><article class="metric"><span>Тариф</span><strong>9 сотрудников</strong><em>активировано 9 из 9</em></article><article class="metric"><span>Хранилище</span><strong>266 / 9000 МБ</strong><em>лимит данных</em></article></div><div class="table-wrap"><table><tbody><tr><td>SMS</td><td>подключено</td><td>13 ₽ за штуку</td></tr><tr><td>Max</td><td>не подключено</td><td>400 ₽ в день</td></tr><tr><td>Telegram</td><td>не подключено</td><td>400 ₽ в день</td></tr><tr><td>Онлайн-касса</td><td>не подключено</td><td>10 ₽ в день</td></tr></tbody></table></div>`, `${button("Пополнить", "noop")} ${button("Изменить тариф", "noop", "secondary")}`)}
    `
  }[tab] || emptyState("Вкладка не найдена");
  return `
    ${pageHeader("Организация", "Профиль, реквизиты, тарифы и платежи")}
    ${tabs([
      { path: "/settings/organization/profile", label: "Профиль" },
      { path: "/settings/organization/details", label: "Реквизиты" },
      { path: "/settings/organization/tariffs", label: "Тарифы и платежи" }
    ], path)}
    ${body}
  `;
}

function officeSettings(state, params, path) {
  const tab = params.tab || "schedule";
  const nav = officeTabs.map(([key, label]) => ({ path: `/settings/office/${key}`, label }));
  const body = {
    schedule: `
      ${button("Копировать график", "noop", "secondary")}
      ${table(["Сотрудник", "18 мая", "19 мая", "20 мая", "21 мая", "22 мая", "23 мая", "24 мая"], state.employees.map((employee) => [h(employee.name), "09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "—", "—"]))}
    `,
    logs: table(["Сотрудник", "Событие", "Дата"], state.logs.map((log) => [h(state.employees.find((employee) => employee.id === log.employeeId)?.name || "—"), h(log.event), h(log.date)])),
    costs: panel("Расходы", `${button("Добавить в расходы", "open-cost-modal", "secondary")}${table(["Название", "Организация", "Категория", "Дата", "Сумма"], state.expenses.map((item) => [h(item.title), h(item.organization), h(item.category), h(item.date), h(money(item.total))]))}`),
    wages: panel("Зарплатные профили", `${button("Добавить профиль", "open-wage-modal", "secondary")}${table(["Название", "Количество сотрудников"], state.wageProfiles.map((item) => [h(item.title), h(item.employees)]))}`),
    voip: panel("Телефония", table(["Провайдер", "Статус", "Что даёт"], state.office.voip.map((provider, index) => [h(provider), index === 0 ? "можно подключить" : "недоступно", "история звонков, записи разговоров, карточка владельца при входящем звонке"]))),
    laboratories: panel("Лаборатории", table(["Лаборатория", "Описание"], state.office.laboratories.map((name) => [h(name), name === "Внутренняя" ? "собственная лаборатория и анализы" : "внешняя интеграция"]))),
    hospital: panel("Стационар", `${button("Добавить бокс", "open-hospital-box-modal", "secondary")}${table(["Бокс"], state.hospitalBoxes.map((box) => [h(box.title)]))}`),
    rooms: panel("Кабинеты", `${button("Добавить кабинет", "open-room-modal", "secondary")}${table(["Кабинет"], state.rooms.map((room) => [h(room.name)]))}`),
    cashboxes: panel("Онлайн-кассы", `${button("Добавить кассу", "open-cashbox-modal", "secondary")}${table(["Статус", "Название"], state.office.cashboxes.map((item) => [badge(item.status), h(item.title)]))}<p class="muted">Поддерживается АТОЛ, ФФД 1.2, Честный знак, рецептурные препараты и эквайринг.</p>`),
    warehouses: panel("Склады", `${button("Добавить склад", "open-warehouse-modal", "secondary")}${table(["Склад", "Количество сотрудников"], state.warehouses.map((item) => [h(item.title), h(`${item.employees} сотрудников`)]))}`),
    profile: `
      ${tabs([
        { path: "/settings/office/profile", label: "Профиль" },
        { path: "/settings/office/profile/schedule", label: "Режим работы" }
      ], path)}
      ${path.endsWith("/schedule")
        ? panel("Режим работы филиала", `<div class="form-grid"><input value="${h(state.office.schedule.mode)}"><input value="Ночной режим: ${state.office.schedule.nightMode ? "включен" : "выключен"}"><input value="${h(state.office.schedule.nightStart)}"><input value="${h(state.office.schedule.nightEnd)}"></div>`, button("Сохранить", "noop"))
        : panel("Профиль филиала", `<div class="form-grid"><input value="${h(state.office.name)}"><input value="${h(state.office.phonePrimary)}"><input value="${h(state.office.expiryNotice)}"><input value="${h(state.office.timezone)}"><input value="${h(state.office.address)}"><input value="Онлайн-запись: ${state.office.onlineBookingEnabled ? "включена" : "нужно настроить сотрудников"}"></div>`, button("Сохранить", "noop"))}
    `
  }[tab] || emptyState("Вкладка не найдена");
  return `
    ${pageHeader("Филиал", "Рабочие графики, расходы, помещения, кассы и склады")}
    ${tabs(nav, path)}
    ${body}
  `;
}

function employeesSettings(state, params = {}, path = "") {
  const employee = params.tab ? state.employees.find((item) => item.id === params.tab.replace("id:", "")) : null;
  if (employee) {
    const subtab = params.subtab || "profile";
    const pageTab = ["stock", "settings"].includes(subtab) ? "access" : subtab;
    const body = {
      profile: panel("Профиль сотрудника", `<div class="form-grid"><input value="${h(employee.name)}"><input value="${h(employee.position)}"><input value="${h(employee.status)}"><input value="${h(employee.defaultSection)}"><input value="${h(employee.visitDuration)}"><input value="${h(employee.modules.join(", "))}"></div>`, button("Сохранить", "noop")),
      access: `
        ${tabs([{ path: `/settings/employees/${employee.id}/access`, label: "Общее" }, { path: `/settings/employees/${employee.id}/stock`, label: "Склад" }, { path: `/settings/employees/${employee.id}/settings`, label: "Настройки" }], path)}
        ${table(["Доступ"], (state.employeeAccess[subtab === "stock" ? "stock" : subtab === "settings" ? "settings" : "common"] || []).map((item) => [badge("вкл", "ok") + h(item)]))}
      `,
      logs: table(["Событие", "Дата"], state.logs.filter((log) => log.employeeId === employee.id).map((log) => [h(log.event), h(log.date)]))
    }[pageTab] || emptyState("Вкладка не найдена");
    return `
      ${pageHeader(employee.name, "Профиль, доступы и события сотрудника", button("Сохранить", "noop"))}
      ${tabs([
        { path: `/settings/employees/${employee.id}/profile`, label: "Профиль" },
        { path: `/settings/employees/${employee.id}/access`, label: "Настройка системы" },
        { path: `/settings/employees/${employee.id}/logs`, label: "События" }
      ], `/settings/employees/${employee.id}/${subtab === "stock" || subtab === "settings" ? "access" : subtab}`)}
      ${body}
    `;
  }
  return `
    ${pageHeader("Сотрудники", "Пользователи, роли, доступы и графики", button("Добавить сотрудника", "open-employee-modal"))}
    ${table(["Статус", "ФИО", "Должность", "Раздел по умолчанию"], state.employees.map((employee) => [badge(employee.status, employee.status === "Активный" ? "ok" : "warn"), route(`/settings/employees/${employee.id}/profile`, employee.name), h(employee.position), h(employee.defaultSection)]))}
  `;
}

function documentsSettings(state, params, path) {
  const tab = params.tab || "text";
  const rows = state.templates.filter((tpl) => {
    if (tab === "notification") return tpl.type === "Уведомление";
    if (tab === "interview") return tpl.type === "Составной";
    return tpl.type !== "Уведомление";
  });
  return `
    ${pageHeader("Шаблоны", "Текстовые блоки, составные документы и уведомления", button("Добавить шаблон", "open-template-modal"))}
    ${tabs([
      { path: "/settings/documents/text", label: "Текстовые" },
      { path: "/settings/documents/interview", label: "Составные" },
      { path: "/settings/documents/notification", label: "Уведомлений" }
    ], path)}
    ${tab === "notification" ? panel("Переменные уведомлений", state.notificationVariables.map((item) => badge(item)).join("")) : ""}
    ${table(["Название", "Категория", "Тип", "Дата"], rows.map((tpl) => [h(tpl.title), h(tpl.target), h(tpl.type), h(tpl.updated)]))}
  `;
}
