/* Service worker de Powerlifting Tracker.
 * Sin dependencias: se sirve tal cual desde /sw.js.
 * Cambia CACHE_VERSION al tocar este archivo para invalidar las cachés antiguas. */

const CACHE_VERSION = 'v3';
const SHELL_CACHE = `pl-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `pl-assets-${CACHE_VERSION}`;

/** Mínimo para que la app arranque sin red tras la primera visita. */
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

/** Rutas que nunca se cachean aquí: van autenticadas y el plan se guarda en IndexedDB. */
function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname === '/health';
}

/**
 * Módulos servidos por Vite en desarrollo (`/src/…`, `/@vite/…`, dependencias pre-empaquetadas).
 * No llevan hash en el nombre: si se cachearan, el navegador seguiría ejecutando código viejo
 * después de cada cambio y parecería que la app no guarda.
 */
function isDevModule(url) {
  return (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/')
  );
}

/** Solo se cachea lo que es inmutable o parte del arranque. */
function isCacheableStatic(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('pl-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => undefined);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/** Navegación: red primero (para ver siempre la última versión) y caché como red de seguridad offline. */
async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', preloaded.clone()).catch(() => undefined);
      return preloaded;
    }
    const fresh = await fetch(event.request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put('/index.html', fresh.clone()).catch(() => undefined);
    return fresh;
  } catch {
    const cached = (await caches.match('/index.html')) || (await caches.match('/'));
    if (cached) return cached;
    return new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Assets con hash en el nombre (/assets/*): inmutables, caché primero. */
async function handleHashedAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(ASSET_CACHE);
    cache.put(request, fresh.clone()).catch(() => undefined);
  }
  return fresh;
}

/** Resto de estáticos (iconos, manifest): sirve caché y refresca en segundo plano. */
async function handleStatic(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) {
        caches.open(ASSET_CACHE).then((c) => c.put(request, res.clone()).catch(() => undefined));
      }
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;
  if (isDevModule(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleHashedAsset(request));
    return;
  }

  if (isCacheableStatic(url)) {
    event.respondWith(handleStatic(request));
  }
});

/** Push del servidor (Web Push / VAPID). El payload esperado es JSON. */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((c) => c.visibilityState === 'visible')) {
        return;
      }
      let payload = {};
      if (event.data) {
        try {
          payload = event.data.json();
        } catch {
          payload = { body: event.data.text() };
        }
      }
      const title = payload.title || 'Powerlifting Tracker';
      const tag = payload.tag || payload.type || 'activity';
      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: payload.icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag,
        renotify: true,
        data: {
          url: payload.url || '/',
          screen: payload.screen,
          tab: payload.tab,
        },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'NOTIFICATION_OPENED',
            screen: data.screen,
            tab: data.tab,
            url: target,
          });
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
