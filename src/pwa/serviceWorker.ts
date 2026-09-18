/**
 * Registro del service worker (`public/sw.js`).
 * Sin él el navegador no ofrece instalar la app ni pueden llegar notificaciones push.
 */

import { SW_UPDATE_EVENT } from '@/src/pwa/swUpdate';

const SW_URL = '/sw.js';
/** Comprueba si hay build nuevo en Vercel (sesiones largas abiertas). */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

function notifyUpdateAvailable(): void {
  window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
}

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * En `npm run dev` el SW cachearía módulos de Vite y rompería el HMR, así que solo
 * se registra en build. Para probar la instalación en local: `npm run build && npm run preview`
 * (o VITE_ENABLE_SW_IN_DEV=true).
 */
function shouldRegister(): boolean {
  if (!isServiceWorkerSupported()) return false;
  return import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW_IN_DEV === 'true';
}

export function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!isServiceWorkerSupported()) return Promise.resolve(undefined);
  return navigator.serviceWorker.ready.catch(() => undefined);
}

export function registerServiceWorker(): void {
  if (!shouldRegister()) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });

      const signalIfWaiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateAvailable();
        }
      };

      // Al desplegar una versión nueva, avisar en la UI (el usuario pulsa «Actualizar»).
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            notifyUpdateAvailable();
          }
        });
      });

      signalIfWaiting();

      const checkForUpdates = () => {
        void registration.update().catch(() => undefined);
      };

      // Buscar actualizaciones al volver a la app (sesiones largas en móvil).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdates();
      });

      window.setInterval(checkForUpdates, UPDATE_CHECK_MS);
    } catch (err) {
      console.error('[PWA] No se pudo registrar el service worker:', err);
    }
  };

  // En la primera visita `clients.claim()` también dispara controllerchange: ahí no hay
  // nada que recargar, solo interesa cuando una versión nueva releva a la anterior.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  const reloadWhenSafe = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (document.visibilityState === 'hidden') {
      const onBack = () => {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', onBack);
        reloadWhenSafe();
      };
      document.addEventListener('visibilitychange', onBack);
      return;
    }
    reloadWhenSafe();
  });

  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register());
}
