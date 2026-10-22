import { renderToString } from "react-dom/server";
import { App } from "./App";
export { routeTitles } from "./content";
export function renderPage(path) {
  return renderToString(<App initialPath={path} />);
}
