import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { apiPut } from '@/src/lib/api';

/** Registra el token de push y lo envía al backend cuando el usuario está logueado */
export function usePushNotifications(userId: string | null) {
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    // Solo en dispositivos nativos (no web)
    if (Platform.OS === 'web') return;

    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const Device = await import('expo-device');
        const Constants = await import('expo-constants').then(m => m.default);

        if (typeof Notifications.setNotificationHandler === 'function') {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldPlaySound: true,
              shouldSetBadge: true,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
        }

        if (!Device.isDevice) return;

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: projectId || undefined,
        });
        const token = tokenData?.data;
        if (!token || cancelled) return;
        if (sentRef.current === token) return;

        await apiPut('/api/notifications/push-token', { token });
        sentRef.current = token;
      } catch {
        // Silenciar (Expo Go en SDK 53+ no soporta push; requiere development build)
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);
}
