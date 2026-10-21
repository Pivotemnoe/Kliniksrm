import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const visualPreview = process.env.VITE_GROOMING_VISUAL_PREVIEW === "1";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    proxy: {
      "/v1/public/grooming": { target: process.env.GROOMING_DEV_API_URL || "http://127.0.0.1:4194", changeOrigin: true },
      "/v1/public/pet-hotel/catalog": { target: process.env.GROOMING_DEV_API_URL || "http://127.0.0.1:4194", changeOrigin: true },
    },
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), ...(visualPreview ? [{
    name: "local-visual-preview-catalogue",
    generateBundle() {
      this.emitFile({type:"asset",fileName:"visual-preview-catalog.json",source:readFileSync(new URL("./fixtures/visual-preview-catalog.json",import.meta.url),"utf8")});
    },
  }] : [])],
});
