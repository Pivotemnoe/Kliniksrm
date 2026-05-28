import { routes } from "../routes.js";
import { getState } from "./store.js";
import { renderLayout } from "../ui/layout.js";
import { notFoundPage } from "../pages/not-found.js";

function currentPath() {
  const hash = location.hash.replace(/^#/, "");
  return hash || "/dashboard";
}

function matchRoute(pattern, path) {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function render() {
  const path = currentPath();
  const state = getState();
  let matched = null;
  let params = {};

  for (const route of routes) {
    const next = matchRoute(route.path, path);
    if (next) {
      matched = route;
      params = next;
      break;
    }
  }

  const page = matched ? matched.view({ state, path, params }) : notFoundPage({ path });
  document.querySelector("#app").innerHTML = renderLayout(path, state, page);
  document.title = matched?.title || "CRM клиники";
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/dashboard";
  render();
}
