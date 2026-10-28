import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve(__dirname, 'staff'), base: '/staff/', publicDir: resolve(__dirname, 'public/staff'), envDir: false,
  resolve: { alias: { '/src': resolve(__dirname, 'src') } },
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api'), 'import.meta.env.VITE_AUTH_MODE': JSON.stringify('protected') },
  plugins: [react()], build: { outDir: resolve(__dirname, 'dist-staff'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4251, strictPort: true, fs: { allow: [resolve(__dirname, '..', '..')] }, proxy: { '/api': process.env.STAFF_APP_DEV_API_URL || 'http://127.0.0.1:4252' } },
  preview: { host: '127.0.0.1', port: 4251, strictPort: true, proxy: { '/api': process.env.STAFF_APP_DEV_API_URL || 'http://127.0.0.1:4252' } },
});
