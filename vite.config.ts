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
      port: 5173,
      // La UI corre en :5173 y la API en :3000; sin proxy el login pega a /health aquí y devuelve 404.
      proxy: {
        '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
        '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      },
    },
    preview: {
      host: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
        '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
  };
});
