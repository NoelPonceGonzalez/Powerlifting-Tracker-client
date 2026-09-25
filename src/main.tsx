import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { API_URL } from './config';
import { InstallPrompt } from '@/src/components/InstallPrompt';
import { UpdatePrompt } from '@/src/components/UpdatePrompt';
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

function isPhoneEmbed(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('phone') === '1';
  } catch {
    return false;
  }
}

function lockPhoneViewport() {
  try {
    if (!isPhoneEmbed()) return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', 'width=390, initial-scale=1, maximum-scale=1, viewport-fit=cover');
    document.documentElement.classList.add('phone-preview');
  } catch {
    /* incógnito */
  }
}

lockPhoneViewport();

function wantsMobilePreviewShell(): boolean {
  try {
    if (isPhoneEmbed() || window.parent !== window) return false;
    if (localStorage.getItem('pl-mobile-frame') !== '1') return false;
    if (window.matchMedia?.('(display-mode: standalone)').matches) return false;
    if (window.matchMedia?.('(display-mode: fullscreen)').matches) return false;
    return (window.navigator as Navigator & { standalone?: boolean }).standalone !== true;
  } catch {
    return false;
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
      <UpdatePrompt />
    </>
  );
}

if (wantsMobilePreviewShell()) {
  const host = document.createElement('div');
  host.id = 'mobile-preview-host';
  const bezel = document.createElement('div');
  bezel.className = 'mobile-preview-bezel';
  const frame = document.createElement('iframe');
  frame.title = 'Versión móvil';
  const embed = new URL(window.location.href);
  embed.searchParams.set('phone', '1');
  frame.src = embed.toString();
  bezel.appendChild(frame);
  host.appendChild(bezel);
  document.body.appendChild(host);
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
