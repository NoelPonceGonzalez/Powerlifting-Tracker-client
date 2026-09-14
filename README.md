# Powerlifting Tracker — Web (PWA)

Versión web instalable de la app de `Powerlifting-APP/client`. La interfaz y la lógica son
exactamente las mismas (mismo `src`, mismo backend); lo que se añade aquí es la capa PWA:

- Al entrar desde el navegador aparece un aviso para **instalar la app**.
- En **Configuración → Aplicación** hay un botón de instalar y otro para **activar las notificaciones**.
- Funciona sin conexión (service worker) y se abre a pantalla completa desde el icono.

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:5173 (API en http://localhost:3000)
```

El backend es el mismo de siempre: `Powerlifting-APP/server`. En desarrollo la app llama a
`http://localhost:3000`; en producción usa el mismo origen y `vercel.json` reenvía `/api/*` y
`/health` al servidor.

### Probar la instalación en local

El service worker no se registra con `npm run dev` (rompería el HMR), así que:

```bash
npm run build
npm run preview    # http://localhost:4173
```

Chrome ofrece instalar en `localhost` y en cualquier dominio HTTPS. Desde el móvil necesitas
HTTPS: despliega en Vercel o usa un túnel (ngrok, cloudflared) apuntando al puerto 4173.

## Cómo funciona la capa PWA

| Archivo | Qué hace |
| --- | --- |
| `public/manifest.webmanifest` | Nombre, iconos, colores y `display: standalone`. |
| `public/sw.js` | Caché de la app (nunca de `/api` ni `/health`), push y clic en notificación. |
| `src/pwa/serviceWorker.ts` | Registra el SW y aplica actualizaciones automáticamente. |
| `src/pwa/installPrompt.ts` | Captura `beforeinstallprompt` y expone `useInstallPrompt()`. |
| `src/pwa/notifications.ts` | Permiso de notificaciones y suscripción Web Push opcional. |
| `src/components/InstallPrompt.tsx` | Aviso de instalación al entrar (con pasos manuales en iOS). |
| `src/components/PwaSettingsSection.tsx` | Sección «Aplicación» de Configuración. |

`beforeinstallprompt` se captura en `main.tsx` antes de montar React porque el navegador lo
dispara una sola vez y puede llegar durante la carga inicial.

### iOS

Safari no dispara `beforeinstallprompt`: el aviso muestra los pasos manuales
(Compartir → Añadir a pantalla de inicio). Además, iOS solo permite notificaciones web cuando
la app ya está instalada en la pantalla de inicio, así que el botón de activar aparece
deshabilitado hasta entonces.

### Notificaciones push del servidor

El permiso habilita las notificaciones locales de inmediato. Para recibir push con la app
cerrada hace falta que el backend exponga Web Push (VAPID): define `VITE_VAPID_PUBLIC_KEY` y la
app se suscribirá y enviará la suscripción a `POST /api/notifications/web-push-subscription`.
Mientras tanto el backend sigue usando tokens de Expo para el APK.

## Iconos

`public/icons/` se genera con `powershell -ExecutionPolicy Bypass -File scripts/generate-pwa-icons.ps1`
(el icono original de Expo es 163×110 y Chrome exige PNG cuadrados de 192 y 512 para instalar).

## Despliegue

Vercel detecta Vite automáticamente (`npm run build` → `dist`). `vercel.json` ya incluye los
rewrites de la API y las cabeceras para que `sw.js` y el manifest no se queden cacheados.
