import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // La PWA se sirve siempre desde la raíz del dominio: el manifest, el service
    // worker y start_url necesitan rutas absolutas para que el navegador ofrezca instalar.
    base: '/',
    envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true,
      // 5173 es el puerto por defecto de Vite y lo ocupan otros proyectos de la máquina.
      // `strictPort` evita que arranque en otro sin avisar y acabes mirando otra app.
      port: 5180,
      strictPort: true,
      // La UI corre en :5180 y la API en :3000; sin proxy el login pega a /health aquí y devuelve 404.
      // SSE no puede tener timeout: si el proxy cierra el stream, Vite llena la consola de ECONNRESET.
      proxy: {
        '/api/sse': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
        },
        '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      },
    },
    preview: {
      host: true,
      proxy: {
        '/api/sse': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
        },
        '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
  };
});
