import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve(__dirname, 'grooming'), publicDir: resolve(__dirname, 'public'), envDir: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || '/api'), 'import.meta.env.VITE_AUTH_MODE': JSON.stringify('protected'), 'import.meta.env.VITE_GROOMING_QA': JSON.stringify(process.env.VITE_GROOMING_QA || 'false'), 'import.meta.env.VITE_GROOMING_QA_TRANSPORT': JSON.stringify(process.env.VITE_GROOMING_QA_TRANSPORT || 'fake'), 'import.meta.env.VITE_GROOMING_STOREFRONT_URL': JSON.stringify(process.env.VITE_GROOMING_STOREFRONT_URL || '') },
  plugins: [react()], build: { outDir: resolve(__dirname, process.env.GROOMING_WEB_OUT_DIR || 'dist-grooming'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4241, strictPort: true, fs: { allow: [resolve(__dirname, '..', '..')] }, proxy: { '/api': process.env.GROOMING_DEV_API_URL || 'http://127.0.0.1:4242' } },
  preview: { host: '127.0.0.1', port: 4241, strictPort: true, proxy: { '/api': process.env.GROOMING_DEV_API_URL || 'http://127.0.0.1:4242' } },
});
