import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/tasks': process.env.API_PROXY_TARGET ?? `http://localhost:${process.env.PORT ?? 3000}` };

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: { proxy },
  preview: { proxy },
});
