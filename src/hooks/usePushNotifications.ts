import { useEffect, useRef, useCallback } from 'react';
import { apiPut } from '@/src/lib/api';

/** En WebView el token lo inyecta la app nativa; no usamos Expo directamente desde aquí. */
const isWebOrWebView = typeof window !== 'undefined';

/** Registra el token de push en el backend para que lleguen notificaciones aunque la app esté cerrada.
 * Requiere development/production build (EAS Build); no funciona en Expo Go. */
export function usePushNotifications(userId: string | null) {
  const sentRef = useRef<string | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const registerToken = useCallback(async (token: string) => {
    if (!token || !userIdRef.current) return;
    if (token === sentRef.current) return;
    try {
      await apiPut('/api/notifications/push-token', { token });
      sentRef.current = token;
    } catch (e) {
      sentRef.current = null;
    }
  }, []);

  const tryRegister = useCallback(() => {
    const t = (typeof window !== 'undefined' && (window as any).__EXPO_PUSH_TOKEN__) as string | undefined;
    if (t) registerToken(t);
  }, [registerToken]);

  useEffect(() => {
    if (!userId) return;

    tryRegister();
    const onTokenReady = () => tryRegister();
    if (typeof window !== 'undefined') {
      window.addEventListener('expoPushTokenReady', onTokenReady);
      return () => window.removeEventListener('expoPushTokenReady', onTokenReady);
    }
  }, [userId, tryRegister]);

  // Reintentar cada 2s, 5s y 12s por si el token se inyecta tarde tras el login
  useEffect(() => {
    if (!userId) return;
    const t1 = setTimeout(tryRegister, 2000);
    const t2 = setTimeout(tryRegister, 5000);
    const t3 = setTimeout(tryRegister, 12000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [userId, tryRegister]);

  // Solo en contexto nativo directo (sin WebView): obtener token con Expo
  useEffect(() => {
    if (!userId || isWebOrWebView) return;

    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const Device = await import('expo-device');
        const Constants = await import('expo-constants').then(m => m.default);

        if (!Device.isDevice) return;
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted' || cancelled) return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: projectId || undefined });
        const token = tokenData?.data;
        if (token && !cancelled) await registerToken(token);
      } catch {
        // Expo Go no soporta push; requiere development build (eas build)
      }
    })();

    return () => { cancelled = true; };
  }, [userId, registerToken]);
}
