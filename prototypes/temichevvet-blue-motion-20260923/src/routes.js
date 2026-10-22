import { routeTitles } from "./content.js";
export function pageAsset(path) {
  const route = path.replace(/\/$/, "") || "/";
  return Object.hasOwn(routeTitles, route)
    ? `${route === "/" ? "" : route}/index.html`
    : null;
}
