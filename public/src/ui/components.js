export function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function route(path, label, className = "") {
  return `<a class="${className}" href="#${path}">${h(label)}</a>`;
}

export function button(label, action, variant = "primary", attrs = "") {
  return `<button class="btn ${variant}" data-action="${h(action)}" ${attrs}>${h(label)}</button>`;
}

export function pageHeader(title, subtitle = "", actions = "") {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">CRM клиники</p>
        <h1>${h(title)}</h1>
        ${subtitle ? `<p>${h(subtitle)}</p>` : ""}
      </div>
      <div class="page-actions">${actions}</div>
    </header>
  `;
}

export function tabs(items, active) {
  return `<nav class="tabs">${items.map((item) => route(item.path, item.label, item.path === active ? "active" : "")).join("")}</nav>`;
}

export function metric(label, value, note = "") {
  return `<article class="metric"><span>${h(label)}</span><strong>${h(value)}</strong>${note ? `<em>${h(note)}</em>` : ""}</article>`;
}

export function badge(value, tone = "neutral") {
  return `<span class="badge ${tone}">${h(value)}</span>`;
}

export function emptyState(title, text = "") {
  return `<div class="empty"><strong>${h(title)}</strong>${text ? `<p>${h(text)}</p>` : ""}</div>`;
}

export function table(columns, rows, empty = "Ничего не найдено") {
  if (!rows.length) return emptyState(empty);
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${columns.map((column) => `<th>${h(column)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

export function searchBar(placeholder = "Поиск") {
  return `<label class="search"><span></span><input type="search" placeholder="${h(placeholder)}"></label>`;
}

export function panel(title, body, footer = "") {
  return `<section class="panel"><header>${h(title)}</header><div>${body}</div>${footer ? `<footer>${footer}</footer>` : ""}</section>`;
}

export function field(label, input) {
  return `<label class="field"><span>${h(label)}</span>${input}</label>`;
}

export function textInput(name, placeholder = "", required = false, value = "") {
  return `<input name="${h(name)}" placeholder="${h(placeholder)}" value="${h(value)}" ${required ? "required" : ""}>`;
}

export function selectInput(name, options, value = "") {
  return `
    <select name="${h(name)}">
      ${options.map((option) => `<option value="${h(option.value)}" ${option.value === value ? "selected" : ""}>${h(option.label)}</option>`).join("")}
    </select>
  `;
}
