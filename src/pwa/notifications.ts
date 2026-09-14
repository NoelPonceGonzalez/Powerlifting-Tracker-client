import { useCallback, useEffect, useState } from 'react';
import { getServiceWorkerRegistration, isServiceWorkerSupported } from '@/src/pwa/serviceWorker';
import { apiPost } from '@/src/lib/api';

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * Clave pública VAPID del backend. Sin ella solo hay notificaciones locales
 * (con la app abierta o en segundo plano); no se suscribe a push del servidor.
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

/**
 * Suscribe el navegador a Web Push y manda la suscripción al backend.
 * Es opcional: si no hay clave VAPID configurada no se hace nada.
 */
async function subscribeToPush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !isPushSupported()) return;
  const registration = await getServiceWorkerRegistration();
  if (!registration) return;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }));

  try {
    await apiPost('/api/notifications/web-push-subscription', subscription.toJSON());
  } catch (err) {
    // El backend actual usa tokens de Expo; si aún no expone el endpoint, el permiso
    // sigue sirviendo para las notificaciones locales de la app.
    console.warn('[PWA] Suscripción push no registrada en el servidor:', err);
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
  useEffect(() => {
    const sync = () => setPermission(currentPermission());
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
    if (currentPermission() !== 'granted') return false;
    const body = 'Las notificaciones están activadas. Te avisaremos de tus entrenos y de la actividad de tus amigos.';
    const registration = await getServiceWorkerRegistration();
    if (registration) {
      // En Android e iOS instalado solo funciona a través del service worker.
      await registration.showNotification('Powerlifting Tracker', {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'test-notification',
      });
      return true;
    }
    try {
      new Notification('Powerlifting Tracker', { body, icon: '/icons/icon-192.png' });
      return true;
    } catch {
      return false;
    }
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
