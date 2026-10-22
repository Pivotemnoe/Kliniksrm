import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { priceResponse } from "./src/price-api.js";
import { inquiryResponse } from "./src/inquiry-api.js";
import { pageAsset } from "./src/routes.js";
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function clinicApi() {
  const attach = (server) => {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split("?")[0] === "/api/inquiries") {
        const config = loadEnv(server.config.mode, process.cwd(), "");
        let body = "",
          size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384) {
            res.writeHead(413);
            res.end();
            return;
          }
          body += chunk;
        }
        const origin = `http://${req.headers.host}`;
        const response = await inquiryResponse(
          new Request(origin + "/api/inquiries", {
            method: req.method,
            headers: req.headers,
            ...(!["GET", "HEAD"].includes(req.method) ? { body } : {}),
          }),
          {
            INQUIRIES_ENABLED: config.VITE_INQUIRIES_ENABLED,
            PRIVACY_URL: config.VITE_SITE_PRIVACY_URL,
          },
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      if (req.url?.split("?")[0] !== "/api/prices") return next();
      const response = await priceResponse(
        new Request("http://127.0.0.1/api/prices", { method: req.method }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    });
  };
  return {
    name: "clinic-public-api",
    configureServer: attach,
    configurePreviewServer(server) {
      attach(server);
      server.middlewares.use(async (req, res, next) => {
        const [path, query] = (req.url || "/").split("?");
        const asset = pageAsset(path);
        if (asset) req.url = asset + (query ? "?" + query : "");
        else if (req.headers.accept?.includes('text/html') && !path.includes('.')) {
          res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
          res.end(await readFile(resolve('dist/client/404.html'),'utf8'));return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), clinicApi()],
});
