import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, SafeAreaView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * URL o origen donde la WebView carga el HTML/JS de la app.
 * - Si EXPO_PUBLIC_WEB_APP_URL está definida, la usa (desarrollo o túnel).
 * - Si __DEV__: usa el servidor local (en desarrollo los assets no están en el APK).
 * - Si no: usa la web empaquetada en el APK (file://android_asset/webapp/) para builds de producción.
 */
const getWebAppSource = (): { uri: string; baseUrl?: string } => {
  const envUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim();
  if (envUrl) {
    return { uri: envUrl };
  }
  // Desarrollo (Expo Go, expo run:android): cargar desde servidor (los assets no están en el APK)
  if (__DEV__) {
    return { uri: Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000' };
  }
  // APK de producción (EAS build): cargar web empaquetada
  if (Platform.OS === 'android') {
    return {
      uri: 'file:///android_asset/webapp/index.html',
      baseUrl: 'file:///android_asset/webapp/',
    };
  }
  return { uri: 'http://localhost:3000' };
};

const WEB_APP_SOURCE = getWebAppSource();

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const [pendingRegistrationToken, setPendingRegistrationToken] = useState<string | null>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [pendingNotificationOpen, setPendingNotificationOpen] = useState<{ screen: string; tab: string } | null>(null);

  const webAppSource = useMemo(() => WEB_APP_SOURCE, []);
  const webAppUrl = webAppSource.uri ?? '';

  const extractRegistrationToken = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      const token = parsed.searchParams.get('token');
      return token && token.trim().length > 0 ? token.trim() : null;
    } catch {
      // Fallback para links custom mal formateados: scheme://...?...token=...
      const match = url.match(/[?&]token=([^&]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    }
  };

  // Deep links de registro: powerliftingtracker://complete-registration?token=...
  useEffect(() => {
    let mounted = true;
    const handleUrl = (url: string) => {
      const token = extractRegistrationToken(url);
      if (token && mounted) setPendingRegistrationToken(token);
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    }).catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Obtener token de push nativo (solo en development build / producción; Expo Go no soporta push desde SDK 53)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const Constants = await import('expo-constants').then(m => m.default);
        if (Constants.executionEnvironment === 'storeClient') return; // Expo Go: push no soportado desde SDK 53

        const Notifications = await import('expo-notifications');
        const Device = await import('expo-device');

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'General',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#4f46e5',
          });
        }

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
        if (token && !cancelled) {
          pushTokenRef.current = token;
          setPushToken(token);
        }
      } catch (e) {
        if (__DEV__) console.warn('[PUSH] Token no obtenido:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const injectRegistrationToken = (token: string): boolean => {
    if (!webViewRef.current) return false;
    webViewRef.current.injectJavaScript(
      `window.__REGISTRATION_TOKEN__="${token.replace(/"/g, '\\"')}";window.dispatchEvent(new Event('registrationTokenReady'));true;`
    );
    return true;
  };

  // Inyectar token cuando la WebView está lista. No se limpia hasta que el cliente confirme consumo.
  useEffect(() => {
    if (!pendingRegistrationToken || !isWebViewReady) return;
    injectRegistrationToken(pendingRegistrationToken);
  }, [pendingRegistrationToken, isWebViewReady]);

  // Al pulsar una notificación: abrir Social > Actividad (app en background o cerrada)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        const Constants = await import('expo-constants').then(m => m.default);
        if (Constants.executionEnvironment === 'storeClient') return;

        const Notifications = await import('expo-notifications');

        const goToActivity = (data: Record<string, any> | undefined) => {
          const screen = data?.screen || 'social';
          const tab = data?.tab || 'checkins';
          setPendingNotificationOpen({ screen, tab });
        };

        // App abierta desde notificación (estado cerrado)
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last?.notification?.request?.content?.data) {
          goToActivity(last.notification.request.content.data as Record<string, any>);
        }

        // Usuario pulsa notificación (app en background)
        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification?.request?.content?.data as Record<string, any> | undefined;
          goToActivity(data);
        });
      } catch (e) {
        if (__DEV__) console.warn('[PUSH] Error listener:', e);
      }
    })();
    return () => sub?.remove();
  }, []);

  const injectNotificationOpen = React.useCallback(() => {
    if (!pendingNotificationOpen || !webViewRef.current) return;
    const { screen, tab } = pendingNotificationOpen;
    const payload = JSON.stringify(pendingNotificationOpen);
    webViewRef.current.injectJavaScript(
      `window.__PENDING_NOTIFICATION_OPEN__=${payload};window.dispatchEvent(new CustomEvent('notificationOpened',{detail:window.__PENDING_NOTIFICATION_OPEN__}));true;`
    );
    setPendingNotificationOpen(null);
    if (__DEV__) console.log('[PUSH] Navegación a', screen, tab);
  }, [pendingNotificationOpen]);

  useEffect(() => {
    if (pendingNotificationOpen && isWebViewReady && webViewRef.current) {
      injectNotificationOpen();
    }
  }, [pendingNotificationOpen, isWebViewReady, injectNotificationOpen]);

  // Inyectar token de push cuando esté disponible Y la WebView esté lista (arregla race: token async, onLoadEnd antes)
  const injectPushToken = React.useCallback(() => {
    const token = pushTokenRef.current || pushToken;
    if (!token || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(
      `window.__EXPO_PUSH_TOKEN__="${token.replace(/"/g, '\\"')}";window.dispatchEvent(new Event('expoPushTokenReady'));true;`
    );
    if (__DEV__) console.log('[PUSH] Token inyectado en WebView');
  }, [pushToken]);
  useEffect(() => {
    if ((pushToken || pushTokenRef.current) && isWebViewReady && webViewRef.current) {
      injectPushToken();
    }
  }, [pushToken, isWebViewReady, injectPushToken]);

  const handleOpenInBrowser = async () => {
    if (webAppUrl.startsWith('file://')) {
      // La app usa web empaquetada; no hay URL externa para abrir
      return;
    }
    await Linking.openURL(webAppUrl);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar style="light" />
      {hasError ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            backgroundColor: '#f8fafc',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#0f172a' }}>
            No se pudo cargar la app
          </Text>
          <Text style={{ textAlign: 'center', color: '#334155', marginBottom: 8, fontSize: 14, fontWeight: '600' }}>
            {webAppUrl.startsWith('file://')
              ? 'Pulsa Reintentar. Si el error persiste, desinstala y vuelve a instalar la app.'
              : 'Pasos para solucionar:'}
          </Text>
          {!webAppUrl.startsWith('file://') && (
            <View style={{ backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 12, width: '100%' }}>
              <Text style={{ color: '#0f172a', marginBottom: 4, fontSize: 12, fontWeight: '600' }}>
                1. Abre una terminal en la carpeta "client"
              </Text>
              <Text style={{ color: '#6366f1', marginBottom: 8, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                npm run dev
              </Text>
              <Text style={{ color: '#64748b', marginBottom: 4, fontSize: 11 }}>
                Eso inicia el servidor (API + app) y luego Expo. No uses "npm run dev" desde la carpeta "server".
              </Text>
              {webAppUrl.includes('.exp.direct') ? (
                <Text style={{ color: '#f59e0b', marginTop: 4, fontSize: 11 }}>
                  Con tunnel: npm run start:tunnel
                </Text>
              ) : (
                <Text style={{ color: '#0f172a', marginTop: 4, fontSize: 12, fontWeight: '600' }}>
                  2. Comprueba que aparezca: "Server running on http://localhost:3000"
                </Text>
              )}
              <Text style={{ color: '#64748b', fontSize: 11 }}>
                URL esperada: {webAppUrl}
              </Text>
            </View>
          )}
          {errorDetails ? (
            <Text style={{ textAlign: 'center', color: '#ef4444', marginBottom: 16, fontSize: 11, backgroundColor: '#fee2e2', padding: 8, borderRadius: 6 }}>
              Error: {errorDetails}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => {
                setHasError(false);
                setErrorDetails('');
                webViewRef.current?.reload();
              }}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: '#4f46e5',
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Reintentar</Text>
            </Pressable>
            {!webAppUrl.startsWith('file://') && (
              <Pressable
                onPress={handleOpenInBrowser}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: '#64748b',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>Abrir en navegador</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={webAppSource}
          originWhitelist={['*', 'file://', 'file://*']}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={webAppUrl.startsWith('file://')}
          allowFileAccessFromFileURLs={webAppUrl.startsWith('file://')}
          allowUniversalAccessFromFileURLs={webAppUrl.startsWith('file://')}
          mixedContentMode="always"
          injectedJavaScriptBeforeContentLoaded={
            webAppUrl.startsWith('file://')
              ? `window.__API_BASE__="${process.env.EXPO_PUBLIC_API_URL || 'http://3.231.3.49:3000'}";`
              : undefined
          }
          onLoadStart={() => {
            console.log(`[WEBVIEW] Cargando: ${webAppSource.uri}`);
            setIsWebViewReady(false);
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WEBVIEW] Error:', nativeEvent);
            setErrorDetails(nativeEvent.description || 'Error de conexión');
            setHasError(true);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            const { statusCode, description } = nativeEvent;
            // 404 = servidor API-only (carpeta server/) o ruta inexistente → no sirve la SPA
            // 500+ = error del servidor
            if (statusCode === 404) {
              setErrorDetails(
                '404 Not Found. Arranca el servidor desde la carpeta "client" con: npm run dev'
              );
              setHasError(true);
            } else if (statusCode >= 500) {
              setErrorDetails(`HTTP ${statusCode}: ${description || 'Error del servidor'}`);
              setHasError(true);
            }
          }}
          onLoadEnd={() => {
            console.log('[WEBVIEW] Carga completada');
            setIsWebViewReady(true);
            if (pendingRegistrationToken) {
              injectRegistrationToken(pendingRegistrationToken);
            }
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'user_logged_in' && data.userId && (pushTokenRef.current || pushToken)) {
                injectPushToken();
              } else if (data.type === 'registration_token_consumed') {
                setPendingRegistrationToken(null);
              }
            } catch {
              // Ignorar mensajes no-JSON
            }
          }}
          startInLoadingState
          renderLoading={() => (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f8fafc',
              }}
            >
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text style={{ marginTop: 12, color: '#64748b', fontSize: 14 }}>
                {webAppUrl.startsWith('file://') ? 'Cargando Tracker...' : `Cargando desde ${webAppUrl}...`}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
