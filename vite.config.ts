import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

/** Quita crossorigin de scripts/links en producción para que carguen bien desde file:// en WebView */
function stripCrossOrigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html: string) {
      return html
        .replace(/\s+crossorigin="[^"]*"/g, '')
        .replace(/\s+crossorigin/g, '');
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === 'production' ? './' : '/',
    envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
    plugins: [react(), tailwindcss(), stripCrossOrigin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'react-native': 'react-native-web',
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
