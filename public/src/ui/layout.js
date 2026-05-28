import { h, route } from "./components.js";

const primary = [
  ["/news", "Новости", "NE"],
  ["/dashboard", "Сводка", "DA"],
  ["/timetable", "Расписание", "TI"],
  ["/queue", "Очередь", "QU"],
  ["/tasks", "Задачи", "TA"],
  ["/owners", "Владельцы", "OW"],
  ["/animals", "Пациенты", "AN"],
  ["/bills", "Счета", "BI"],
  ["/shop", "Продажи", "SH"],
  ["/hospital", "Стационар", "HO"]
];

const stock = [
  ["/stock/goods", "Товары"],
  ["/stock/services", "Услуги"],
  ["/stock/supplies", "Учёт"],
  ["/stock/supplies/invoices", "Накладные"]
];

const settings = [
  ["/settings/organization/profile", "Организация"],
  ["/settings/office/schedule", "Филиал"],
  ["/settings/employees", "Сотрудники"],
  ["/settings/documents/text", "Шаблоны"]
];

function active(path, itemPath) {
  return path === itemPath || path.startsWith(`${itemPath}/`) || (itemPath === "/queue" && path.startsWith("/queue"));
}

function navLink(path, item) {
  const [itemPath, label, icon] = item;
  return `<a class="nav-link ${active(path, itemPath) ? "active" : ""}" href="#${itemPath}"><span>${h(icon || label.slice(0, 2))}</span><b>${h(label)}</b></a>`;
}

function group(path, title, items, prefix) {
  const open = path.startsWith(prefix);
  return `
    <section class="nav-group ${open ? "open" : ""}">
      <button type="button"><span>${h(title.slice(0, 2).toUpperCase())}</span><b>${h(title)}</b></button>
      <div>${items.map((item) => route(item[0], item[1], active(path, item[0]) ? "active" : "")).join("")}</div>
    </section>
  `;
}

export function renderLayout(path, state, content) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard"><strong>VC</strong><span>Clinic CRM</span></a>
        <nav>
          ${primary.map((item) => navLink(path, item)).join("")}
          ${group(path, "Склад", stock, "/stock")}
          ${group(path, "Настройки", settings, "/settings")}
        </nav>
        <footer>
          ${navLink(path, ["/assistant", "Помощник", "AI"])}
          ${navLink(path, ["/profile", "Профиль", "PR"])}
        </footer>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <label class="global-search"><span></span><input placeholder="Поиск по CRM"></label>
          <div class="top-actions">
            ${route("/online-requests", "Онлайн-запись")}
            ${route("/settings/organization/tariffs/balance", `${h(state.user.balance.toLocaleString("ru-RU"))} ₽`, "wallet")}
            <a href="#/profile" class="profile-chip"><span>${h(state.user.name.slice(0, 1))}</span><b>${h(state.user.name)}</b><em>${h(state.user.clinic)}</em></a>
          </div>
        </header>
        <section class="content">${content}</section>
      </main>
    </div>
  `;
}
