<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Elite 5/3/1 - Web + Expo

Este proyecto mantiene la app original web (Vite + Express) y ahora incluye un contenedor Expo para abrir exactamente esa misma interfaz en móvil.

## Requisitos

- Node.js
- Expo Go en el móvil (o emulador Android/iOS)

## 🚀 Inicio Rápido

### Opción 1: Usando Expo directamente (Recomendado) ⭐

```bash
cd client
npm install
npm run expo:cli start
# O también puedes usar:
npm run expo:start
```

**✅ Ahora `npm run expo:cli start` inicia automáticamente:**
- Servidor web en puerto 3000 (si no está corriendo)
- Expo en modo LAN

Todo en una sola terminal, sin necesidad de comandos separados. El servidor se inicia automáticamente si no está corriendo.

**Nota:** Si prefieres usar `npx expo start` directamente, primero asegúrate de que el servidor esté corriendo con `npm run dev:server` en otra terminal.

### Opción 2: Usando npm start

```bash
cd client
npm install
npm start
```

Esto también inicia ambos procesos usando `concurrently`.

### Opción 2: Comandos separados

Si prefieres tener control sobre cada proceso:

**Terminal 1 - Servidor Web:**
```bash
cd client
npm run dev
```
Deberías ver: `✅ Server running on http://localhost:3000`

**Terminal 2 - Expo:**
```bash
cd client
npm run expo:start
```

**✅ Esto funciona perfectamente cuando:**
- Estás en la misma red WiFi que tu dispositivo/emulador
- Es la forma más rápida y estable
- No necesitas configuración adicional

**📱 Para dispositivos físicos en la misma red:**
La app detecta automáticamente la IP de tu PC. Si no funciona, crea `.env` con:
```
EXPO_PUBLIC_WEB_APP_URL=http://TU_IP_LOCAL:3000
```
(Obtén tu IP con: `npm run get-ip`)

## 📱 Configuración por Plataforma

### Android Emulador
No necesitas configuración adicional. La app detecta automáticamente `http://10.0.2.2:3000`

### iOS Simulator
No necesitas configuración adicional. La app detecta automáticamente `http://localhost:3000`

### Dispositivo Físico - Modo LAN (Recomendado)
1. Obtén tu IP local:
   ```bash
   npm run get-ip
   ```
2. Crea un archivo `.env` en `client` con:
   ```
   EXPO_PUBLIC_WEB_APP_URL=http://TU_IP_LOCAL:3000
   ```
   Ejemplo: `EXPO_PUBLIC_WEB_APP_URL=http://192.168.1.100:3000`
3. Inicia Expo en modo LAN:
   ```bash
   npm run expo:start
   ```

### Dispositivo Físico - Modo Tunnel
Si necesitas usar `--tunnel` (por ejemplo, estás fuera de la misma red WiFi):

1. **Terminal 1** - Servidor web:
   ```bash
   npm run dev
   ```

2. **Terminal 2** - Túnel para el servidor (puerto 3000):
   ```bash
   npm run tunnel:server
   ```
   Esto iniciará ngrok y te mostrará una URL tipo `https://xxxx.ngrok.app`
   
3. **Terminal 3** - Expo con tunnel:
   ```bash
   npm run expo:tunnel
   ```

4. Crea un archivo `.env` con la URL de ngrok:
   ```
   EXPO_PUBLIC_WEB_APP_URL=https://xxxx.ngrok.app
   ```

5. Reinicia la app Expo

**Nota:** Necesitas tener ngrok instalado. Instálalo desde https://ngrok.com/download o con `npm install -g ngrok`

## ⚠️ Solución de Problemas

### Error: "ERR_CONNECTION_TIMED_OUT"
1. ✅ Verifica que el servidor web esté corriendo (`npm run dev`)
2. ✅ Verifica que veas el mensaje "Server running on http://localhost:3000"
3. ✅ Si usas dispositivo físico, asegúrate de usar la IP correcta (no `localhost`)
4. ✅ Verifica que tu firewall permita conexiones en el puerto 3000

### Error: "No se pudo cargar la app web"
- El servidor web debe estar corriendo ANTES de abrir la app Expo
- Asegúrate de que ambos procesos estén activos simultáneamente

## Scripts principales

- `npm start` o `npx expo start` - ⭐ **Inicia todo** (servidor web + Expo) en un solo comando
- `npm run start:tunnel` - Inicia servidor web + Expo con túnel
- `npm run dev` - Solo servidor web (Express + Vite) en puerto 3000
- `npm run expo:start` - Solo Expo en modo LAN
- `npm run expo:tunnel` - Solo Expo con túnel
- `npm run expo:android` - Abre Expo directamente en Android
- `npm run expo:ios` - Abre Expo directamente en iOS
- `npm run get-ip` - Muestra tu IP local para dispositivos físicos
