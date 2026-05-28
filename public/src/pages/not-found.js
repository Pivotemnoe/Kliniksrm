import { emptyState, pageHeader, route } from "../ui/components.js";

export function notFoundPage({ path }) {
  return `
    ${pageHeader("Страница не найдена", path)}
    ${emptyState("Такого раздела в дереве пока нет")}
    <p>${route("/dashboard", "Вернуться на сводку")}</p>
  `;
}
