import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src-ui'),
    },
  },
  root: '.',
  build: {
    outDir: 'dist-ui',
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5173 } : undefined,
  },
});
