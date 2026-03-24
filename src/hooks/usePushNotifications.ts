import { useEffect, useRef, useCallback } from 'react';
import { apiPut } from '@/src/lib/api';

/** Registra el token Expo Push en el backend (necesario para recibir avisos con la app cerrada). */
export function usePushNotifications(userId: string | null) {
  /** Último token enviado con éxito para el usuario actual (evita spam; se invalida al cambiar de cuenta). */
  const lastSentKeyRef = useRef<string | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const registerToken = useCallback(async (token: string) => {
    const uid = userIdRef.current;
    if (!token?.trim() || !uid) return;
    const key = `${uid}::${token.trim()}`;
    if (key === lastSentKeyRef.current) return;
    try {
      await apiPut('/api/notifications/push-token', { token: token.trim() });
      lastSentKeyRef.current = key;
    } catch {
      lastSentKeyRef.current = null;
    }
  }, []);

  const tryRegister = useCallback(() => {
    const t = (typeof window !== 'undefined' && (window as unknown as { __EXPO_PUSH_TOKEN__?: string }).__EXPO_PUSH_TOKEN__) as
      | string
      | undefined;
    if (t) void registerToken(t);
  }, [registerToken]);

  // Al cambiar de usuario, permitir volver a registrar el mismo dispositivo para la nueva cuenta
  useEffect(() => {
    lastSentKeyRef.current = null;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    tryRegister();
    const onTokenReady = () => tryRegister();
    if (typeof window !== 'undefined') {
      window.addEventListener('expoPushTokenReady', onTokenReady);
      return () => window.removeEventListener('expoPushTokenReady', onTokenReady);
    }
  }, [userId, tryRegister]);

  // Si el token ya estaba inyectado antes del login, registrar en cuanto exista sesión
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const w = window as unknown as { __EXPO_PUSH_TOKEN__?: string };
    if (w.__EXPO_PUSH_TOKEN__) {
      queueMicrotask(() => tryRegister());
    }
  }, [userId, tryRegister]);

  // Reintentos: el bridge nativo puede inyectar el token después del primer render
  useEffect(() => {
    if (!userId) return;
    const delays = [400, 1200, 3000, 8000, 20000, 45000];
    const timers = delays.map((ms) => setTimeout(tryRegister, ms));
    return () => timers.forEach(clearTimeout);
  }, [userId, tryRegister]);

  // Al volver a primer plano (app móvil), reintentar por si el token llegó en background
  useEffect(() => {
    if (!userId || typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') tryRegister();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId, tryRegister]);

  // El token Expo lo obtiene solo la capa nativa (client/App.tsx) e inyecta __EXPO_PUSH_TOKEN__
  // en la WebView. No importar expo-notifications aquí: en el navegador fallaría y en WebView es redundante.
}
