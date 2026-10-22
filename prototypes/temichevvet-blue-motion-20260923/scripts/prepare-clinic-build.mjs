import { build } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const root = process.cwd();
await build({
  configFile: false,
  plugins: [react()],
  build: {
    ssr: "src/render.jsx",
    outDir: ".build/ssr",
    rollupOptions: { output: { entryFileNames: "render.mjs" } },
  },
});
const { renderPage, routeTitles } = await import(
  pathToFileURL(resolve(".build/ssr/render.mjs"))
);
const template = await readFile("dist/client/index.html", "utf8");
for (const [route, title] of Object.entries(routeTitles)) {
  const dir = join(root, "dist/client", route);
  await mkdir(dir, { recursive: true });
  const markup = template
    .replace("<!--app-->", renderPage(route))
    .replace(/<title>.*?<\/title>/, `<title>${title} — TemichevVET</title>`);
  await writeFile(join(dir, "index.html"), markup);
}
await writeFile('dist/client/404.html', template.replace('<!--app-->',renderPage('/not-found')).replace(/<title>.*?<\/title>/, '<title>Страница не найдена — TemichevVET</title>'));
await build({
  configFile: false,
  build: {
    ssr: "src/clinic-worker.js",
    outDir: "dist/server",
    rollupOptions: { output: { entryFileNames: "index.js" } },
  },
});
console.log(
  `Prerendered ${Object.keys(routeTitles).length} clinic routes and read-only catalog worker.`,
);
