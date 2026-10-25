/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.VITE_SITE_URL || '').replace(/\/$/, '');
  return {
    // VITE_BASE_PATH permite instalar numa subpasta do cPanel (ex.: /v25/)
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      {
        // URL absoluto para as meta tags Open Graph (vazio se VITE_SITE_URL não estiver definido)
        name: 'v25-site-url',
        transformIndexHtml: (html: string) => html.replace(/%VITE_SITE_URL%/g, siteUrl),
      },
    ],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    // Desenvolvimento: encaminha /api e /uploads para a API PHP local (ex.: npm run api:dev)
    server: {
      proxy: {
        '/api': { target: env.V25_API_PROXY || 'http://127.0.0.1:8080', changeOrigin: false },
        '/uploads': { target: env.V25_API_PROXY || 'http://127.0.0.1:8080', changeOrigin: false },
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
