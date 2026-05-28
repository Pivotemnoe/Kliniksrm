import { button, emptyState, h, pageHeader, panel, tabs } from "../ui/components.js";

export function profilePage({ state, params, path }) {
  const tab = params.tab || "profile";
  const body = {
    profile: panel("Мой профиль", `<div class="form-grid"><input value="${h(state.user.name)}"><input value="${h(state.user.role)}"><input value="+7 (928) 843-87-74"><input value="user@example.local"></div>`, button("Сохранить", "noop")),
    schedule: panel("График работы", "Личный график сотрудника по филиалам и кабинетам."),
    salary: panel("Заработная плата", emptyState("Расчёты не сформированы"))
  }[tab] || emptyState("Вкладка не найдена");
  return `
    ${pageHeader("Мой профиль", "Личные данные, график и зарплата")}
    ${tabs([
      { path: "/profile/profile", label: "Профиль" },
      { path: "/profile/schedule", label: "График работы" },
      { path: "/profile/salary", label: "Заработная плата" }
    ], path === "/profile" ? "/profile/profile" : path)}
    ${body}
  `;
}

export function assistantPage() {
  return `
    ${pageHeader("Помощник", "Место под внутреннего AI-ассистента клиники")}
    ${panel("Сценарии", `
      <ul class="plain-list">
        <li>поиск по базе владельцев и пациентов;</li>
        <li>подготовка черновика рекомендаций после приёма;</li>
        <li>подсказки по складу и просроченным препаратам;</li>
        <li>объяснение финансовых и операционных показателей.</li>
      </ul>
    `)}
  `;
}
