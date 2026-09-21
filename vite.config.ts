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
      // La UI corre en :5180. Por defecto la API es local (:3000). POWER_API_PROXY=http://IP:3000
      // engancha el cliente local al EC2 sin CORS (mismo origen).
      // SSE no puede tener timeout: si el proxy cierra el stream, Vite llena la consola de ECONNRESET.
      proxy: (() => {
        const target = process.env.POWER_API_PROXY || 'http://127.0.0.1:3000';
        return {
          '/api/sse': {
            target,
            changeOrigin: true,
            timeout: 0,
            proxyTimeout: 0,
          },
          '/api': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
          '/health': { target, changeOrigin: true },
        };
      })(),
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
