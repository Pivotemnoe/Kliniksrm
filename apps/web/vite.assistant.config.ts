import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/assistant/',
  publicDir: false,
  plugins: [react()],
  define: { 'import.meta.env.VITE_CLINIC_CHAT_API_BASE': JSON.stringify('/v1/public/assistant') },
  build: {
    outDir: fileURLToPath(new URL('../owner-gateway/public/assistant', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('assistant.html', import.meta.url)) },
  },
});
