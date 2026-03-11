import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, SafeAreaView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

const extractHostFromUri = (value?: string | null): string | null => {
  if (!value) return null;
  const withoutProtocol = value.replace(/^https?:\/\//, '');
  const [host] = withoutProtocol.split(':');
  return host || null;
};

const getExpoHost = (): string | null => {
  const hostFromExpoConfig = extractHostFromUri((Constants.expoConfig as any)?.hostUri);
  if (hostFromExpoConfig) return hostFromExpoConfig;

  // Compat paths used by Expo Go manifests across SDKs.
  const hostFromManifest2 = extractHostFromUri((Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost);
  if (hostFromManifest2) return hostFromManifest2;

  const hostFromLegacyManifest = extractHostFromUri((Constants as any)?.manifest?.debuggerHost);
  if (hostFromLegacyManifest) return hostFromLegacyManifest;

  return null;
};

// Detectar URL según el entorno (prioridad: env -> host Expo -> fallback plataforma)
const getWebAppUrl = (): string => {
  // Si hay una URL configurada explícitamente, usarla
  const envUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim();
  if (envUrl) return envUrl;

  const expoHost = getExpoHost();
  
  // Si detectamos que estamos usando tunnel (URL contiene .exp.direct)
  // NO usar el host del túnel para el puerto 3000, porque el túnel solo expone Metro (8081)
  // En su lugar, usar localhost o la IP local según la plataforma
  if (expoHost && expoHost.includes('.exp.direct')) {
    // Estamos usando tunnel, pero el servidor Express necesita estar accesible localmente
    // En Android emulador, usar 10.0.2.2
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000';
    }
    // En iOS simulator o dispositivo físico con tunnel, necesitamos la IP local
    // Por ahora usamos localhost (funciona en simulator)
    return 'http://localhost:3000';
  }
  
  // Si no es tunnel, usar el host de Expo normalmente (modo LAN)
  // Esto funciona perfectamente cuando estás en la misma red WiFi
  if (expoHost && !expoHost.includes('.exp.direct')) {
    return `http://${expoHost}:3000`;
  }

  // Fallback por plataforma (si no se detecta host de Expo)
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000'; // Android emulador
  }

  return 'http://localhost:3000'; // iOS simulator o desarrollo local
};

const FALLBACK_WEB_URL = getWebAppUrl();

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');

  const webAppUrl = useMemo(() => {
    const url = FALLBACK_WEB_URL;
    console.log(`[EXPO] WebView URL configurada: ${url}`);
    console.log(`[EXPO] Platform: ${Platform.OS}`);
    return url;
  }, []);

  const handleOpenInBrowser = async () => {
    await Linking.openURL(webAppUrl);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar style="light" />
      <View
        style={{
          height: 52,
          backgroundColor: '#0f172a',
          borderBottomWidth: 1,
          borderBottomColor: '#1e293b',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>Elite 5/3/1</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => webViewRef.current?.reload()}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: '#1e293b',
            }}
          >
            <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '700' }}>Recargar</Text>
          </Pressable>
          <Pressable
            onPress={handleOpenInBrowser}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: '#4f46e5',
            }}
          >
            <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>Abrir URL</Text>
          </Pressable>
        </View>
      </View>

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
            No se pudo cargar la app web
          </Text>
          <Text style={{ textAlign: 'center', color: '#334155', marginBottom: 8, fontSize: 14, fontWeight: '600' }}>
            Pasos para solucionar:
          </Text>
          <View style={{ backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, marginBottom: 12, width: '100%' }}>
            <Text style={{ color: '#0f172a', marginBottom: 4, fontSize: 12, fontWeight: '600' }}>
              1. Abre una terminal en la carpeta "client"
            </Text>
            <Text style={{ color: '#6366f1', marginBottom: 8, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
              npx expo start
            </Text>
            {webAppUrl.includes('.exp.direct') ? (
              <>
                <Text style={{ color: '#f59e0b', marginBottom: 4, fontSize: 12, fontWeight: '600' }}>
                  ⚠️ Estás usando tunnel. El servidor también necesita túnel:
                </Text>
                <Text style={{ color: '#6366f1', marginBottom: 8, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                  npm run tunnel:server
                </Text>
                <Text style={{ color: '#64748b', marginBottom: 4, fontSize: 11 }}>
                  Luego crea .env con la URL de ngrok
                </Text>
              </>
            ) : (
              <Text style={{ color: '#0f172a', marginBottom: 4, fontSize: 12, fontWeight: '600' }}>
                2. Verifica que veas: "Server running on http://localhost:3000"
              </Text>
            )}
            <Text style={{ color: '#64748b', fontSize: 11 }}>
              URL esperada: {webAppUrl}
            </Text>
          </View>
          {errorDetails ? (
            <Text style={{ textAlign: 'center', color: '#ef4444', marginBottom: 16, fontSize: 11, backgroundColor: '#fee2e2', padding: 8, borderRadius: 6 }}>
              Error: {errorDetails}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12 }}>
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
          </View>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: webAppUrl }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          onLoadStart={() => {
            console.log(`[WEBVIEW] Cargando: ${webAppUrl}`);
          }}
          onLoadEnd={() => {
            console.log(`[WEBVIEW] Carga completada: ${webAppUrl}`);
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WEBVIEW] Error:', nativeEvent);
            setErrorDetails(nativeEvent.description || 'Error de conexión');
            setHasError(true);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WEBVIEW] HTTP Error:', nativeEvent.statusCode, nativeEvent.description);
            // No mostrar error para códigos menores a 500, pueden ser normales
            if (nativeEvent.statusCode >= 500) {
              setErrorDetails(`HTTP ${nativeEvent.statusCode}: ${nativeEvent.description || 'Error del servidor'}`);
              setHasError(true);
            }
          }}
          onMessage={(event) => {
            console.log('[WEBVIEW] Mensaje recibido:', event.nativeEvent.data);
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
                Cargando app web desde {webAppUrl}...
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
