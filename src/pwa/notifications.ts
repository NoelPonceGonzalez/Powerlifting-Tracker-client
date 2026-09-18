import { useCallback, useEffect, useState } from 'react';
import { getServiceWorkerRegistration, isServiceWorkerSupported } from '@/src/pwa/serviceWorker';
import { apiDelete, apiGet, apiPost } from '@/src/lib/api';

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * Clave pública VAPID del backend. Si no está en el .env del cliente,
 * se pide a GET /api/notifications/vapid-public-key.
 */
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() || '';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** iOS solo permite notificaciones web si la app está añadida a la pantalla de inicio. */
export function isPushSupported(): boolean {
  return isNotificationSupported() && isServiceWorkerSupported() && typeof PushManager !== 'undefined';
}

function currentPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function resolveVapidKey(): Promise<string> {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  try {
    const data = await apiGet<{ publicKey?: string }>('/api/notifications/vapid-public-key');
    return data.publicKey?.trim() || '';
  } catch {
    return '';
  }
}

function vapidToBase64Url(key: ArrayBuffer | Uint8Array): string {
  const bytes = key instanceof Uint8Array ? key : new Uint8Array(key);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function subscriptionMatchesVapid(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return false;
  const have = vapidToBase64Url(current);
  const want = publicKey.replace(/=+$/g, '');
  return have === want;
}

export async function getWebPushEndpoint(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const registration = await getServiceWorkerRegistration();
  const sub = await registration?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/**
 * Suscribe el navegador a Web Push y manda la suscripción al backend.
 * Sin clave VAPID sigue valiendo el permiso para avisos locales.
 */
export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) return;
  const key = await resolveVapidKey();
  if (!key) return;
  const registration = await getServiceWorkerRegistration();
  if (!registration) return;

  const vapidStamp = 'pl-vapid-public';
  const lastKey = typeof localStorage !== 'undefined' ? localStorage.getItem(vapidStamp) : null;
  const existing = await registration.pushManager.getSubscription();
  if (existing && (lastKey !== key || !subscriptionMatchesVapid(existing, key))) {
    try {
      await existing.unsubscribe();
    } catch {
      /* ignore */
    }
  }
  const fresh = await registration.pushManager.getSubscription();
  const subscription =
    fresh ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));

  try {
    await apiPost('/api/notifications/web-push-subscription', subscription.toJSON());
    if (typeof localStorage !== 'undefined') localStorage.setItem(vapidStamp, key);
  } catch (err) {
    console.warn('[PWA] Suscripción push no registrada en el servidor:', err);
  }
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const registration = await getServiceWorkerRegistration();
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  try {
    await apiDelete('/api/notifications/web-push-subscription', { endpoint });
  } catch {
    /* best-effort */
  }
  try {
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
  return endpoint;
}

export async function showLocalNotification(
  title: string,
  body: string,
  data?: { url?: string; screen?: string; tab?: string; tag?: string }
): Promise<boolean> {
  if (currentPermission() !== 'granted') return false;
  const registration = await getServiceWorkerRegistration();
  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data?.tag || 'activity',
    data: { url: data?.url || '/', screen: data?.screen, tab: data?.tab },
  };
  if (registration) {
    await registration.showNotification(title, options);
    return true;
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

export interface UseWebNotificationsResult {
  permission: NotificationPermissionState;
  isSupported: boolean;
  /** Denegado a nivel de navegador: hay que cambiarlo en los ajustes del sitio. */
  isBlocked: boolean;
  requesting: boolean;
  /** Pide permiso y, si hay VAPID configurado, suscribe a push. Devuelve el estado final. */
  request: () => Promise<NotificationPermissionState>;
  /** Notificación de prueba para confirmar que llegan al dispositivo. */
  sendTestNotification: () => Promise<boolean>;
}

export function useWebNotifications(): UseWebNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermissionState>(() => currentPermission());
  const [requesting, setRequesting] = useState(false);

  // El permiso puede cambiarse desde los ajustes del navegador sin recargar la página.
  // Si ya había permiso, re-suscribe: hace falta cuando se rotan las claves VAPID.
  useEffect(() => {
    const sync = () => {
      const next = currentPermission();
      setPermission(next);
      if (next === 'granted') void subscribeToPush();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const request = useCallback(async (): Promise<NotificationPermissionState> => {
    if (!isNotificationSupported()) return 'unsupported';
    setRequesting(true);
    try {
      const result = (await Notification.requestPermission()) as NotificationPermissionState;
      setPermission(result);
      if (result === 'granted') await subscribeToPush();
      return result;
    } catch {
      const fallback = currentPermission();
      setPermission(fallback);
      return fallback;
    } finally {
      setRequesting(false);
    }
  }, []);

  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    return showLocalNotification(
      'Powerlifting Tracker',
      'Las notificaciones están activadas. Te avisaremos de tus entrenos y de la actividad de tus amigos.',
      { tag: 'test-notification' }
    );
  }, []);

  return {
    permission,
    isSupported: isNotificationSupported(),
    isBlocked: permission === 'denied',
    requesting,
    request,
    sendTestNotification,
  };
}
