import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const apiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), grooming: resolve(__dirname, 'grooming/index.html') } } },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': apiProxyTarget,
      ...(process.env.VITE_DEV_CHAT_PROXY_TARGET ? { '/assistant-chat-api': { target: process.env.VITE_DEV_CHAT_PROXY_TARGET, rewrite: (path: string) => path.replace(/^\/assistant-chat-api/, '/v1/public/assistant') } } : {}),
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
});
