import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { API_URL } from './config';
import { InstallPrompt } from '@/src/components/InstallPrompt';
import { initInstallPrompt } from '@/src/pwa/installPrompt';
import { registerServiceWorker } from '@/src/pwa/serviceWorker';

// WebView (APK) inyecta __API_BASE__ antes; si queda vacío o la cadena "null" (origin file://), usar URL del bundle.
// En HTTPS (Vercel) no inyectar un `http://…`: mixed content. api.ts usará el mismo origen + rewrites.
if (typeof window !== 'undefined') {
  const w = (window as any).__API_BASE__;
  const bad = w == null || String(w).trim() === '' || String(w) === 'null';
  if (API_URL && bad) {
    let skipHttpOnHttps = false;
    try {
      skipHttpOnHttps =
        window.location.protocol === 'https:' && new URL(API_URL).protocol === 'http:';
    } catch {
      skipHttpOnHttps = false;
    }
    if (!skipHttpOnHttps) {
      (window as any).__API_BASE__ = API_URL;
    }
  }
}

// Antes de montar React: `beforeinstallprompt` puede dispararse durante la carga inicial.
initInstallPrompt();
registerServiceWorker();

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'NOTIFICATION_OPENED') return;
    window.dispatchEvent(
      new CustomEvent('notificationOpened', {
        detail: { screen: data.screen, tab: data.tab },
      })
    );
  });
}

function Root() {
  return (
    <>
      <App />
      {/* Fuera de App para que el aviso también aparezca en la pantalla de login */}
      <InstallPrompt />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
