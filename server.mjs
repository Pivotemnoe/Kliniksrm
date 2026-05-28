import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("./public/", import.meta.url).pathname;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const file = clean === "/" ? "index.html" : clean.replace(/^[/\\]/, "");
  return join(root, file);
}

createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url || "/");
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch {
    const data = await readFile(join(root, "index.html"));
    res.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-store" });
    res.end(data);
  }
}).listen(port, host, () => {
  console.log(`CRM prototype: http://${host}:${port}`);
});
