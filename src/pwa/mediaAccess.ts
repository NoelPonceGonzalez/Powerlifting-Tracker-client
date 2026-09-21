import { useCallback, useEffect, useState } from 'react';
import { isAndroid, isIOS, isStandalone } from '@/src/pwa/installPrompt';

export type MediaPermissionState = 'unsupported' | 'prompt' | 'granted' | 'denied';

const CAMERA_OK_KEY = 'power_camera_ok';
const GALLERY_OK_KEY = 'power_gallery_ok';

/** iOS antiguo / WebView: mediaDevices a veces no existe aunque el gesto sí vale. */
export function ensureMediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    webkitGetUserMedia?: (c: MediaStreamConstraints, ok: (s: MediaStream) => void, err: (e: Error) => void) => void;
    mozGetUserMedia?: (c: MediaStreamConstraints, ok: (s: MediaStream) => void, err: (e: Error) => void) => void;
  };
  if (!nav.mediaDevices) {
    (nav as unknown as { mediaDevices: MediaDevices }).mediaDevices = {} as MediaDevices;
  }
  if (!nav.mediaDevices.getUserMedia) {
    const legacy = nav.webkitGetUserMedia || nav.mozGetUserMedia;
    if (!legacy) return null;
    nav.mediaDevices.getUserMedia = (constraints: MediaStreamConstraints) =>
      new Promise((resolve, reject) => legacy.call(nav, constraints, resolve, reject));
  }
  return nav.mediaDevices;
}

/**
 * getUserMedia solo existe en contexto seguro (HTTPS o localhost). Servido por IP de la
 * red local en http:// el navegador ni siquiera pregunta: hay que ir a la cámara nativa.
 */
export function isSecureCameraContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function isCameraSupported(): boolean {
  return isSecureCameraContext() && !!ensureMediaDevices()?.getUserMedia;
}

export function isGallerySupported(): boolean {
  return typeof document !== 'undefined';
}

/** iOS PWA: `video/*` solo no enseña clips; hay que listar mp4/mov. Perfil = solo foto. */
export const GALLERY_PHOTOS_ACCEPT = 'image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif';
export const GALLERY_MEDIA_ACCEPT =
  'video/mp4,video/quicktime,video/x-m4v,video/webm,.mp4,.mov,.m4v,image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif';
/** No uses `hidden`/`display:none`: en iOS el picker de vídeo a veces no abre. */
export const FILE_INPUT_VISUAL =
  'pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0';

function readFlag(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* quota / private */
  }
}

export function markCameraGranted(): void {
  writeFlag(CAMERA_OK_KEY, true);
}

export function isCameraMarkedGranted(): boolean {
  return readFlag(CAMERA_OK_KEY);
}

/** APK con WebView: no hay barra de direcciones y los permisos son los de la app nativa. */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
}

/**
 * Solo se enseña si el usuario abre «no me deja». Los permisos de una PWA instalada los
 * sigue gestionando el navegador que la instaló (WebAPK en Android), no el sistema.
 */
export function cameraBlockedHint(): string {
  if (isNativeShell()) {
    return 'Ajustes del móvil → Aplicaciones → esta app → Permisos → Cámara → Permitir. Luego vuelve a entrar.';
  }
  if (isIOS()) {
    return isStandalone()
      ? 'Ajustes del iPhone → Power → Cámara. Actívala y vuelve a entrar.'
      : 'Ajustes → Safari → Cámara → Preguntar o Permitir, y recarga.';
  }
  if (isAndroid()) {
    return isStandalone()
      ? 'Mantén pulsado el icono de la app → Información de la app → Permisos → Cámara → Permitir. Si no aparece, ábrela en Chrome, toca el candado de la barra y pon Cámara en Permitir.'
      : 'Toca el candado junto a la dirección → Permisos → Cámara → Permitir (o Restablecer permisos) y recarga.';
  }
  return 'Toca el candado junto a la dirección del navegador, pon Cámara en Permitir y recarga.';
}

/** En iPhone instalado la cámara nativa (capture) suele ir mejor que la vista en vivo. */
export function preferNativeCameraOnDevice(): boolean {
  return isIOS() && isStandalone();
}

/** WebKit solo abre el diálogo si getUserMedia sale de un toque; Chrome pregunta igual. */
export function cameraNeedsUserGesture(): boolean {
  return isIOS();
}

/**
 * Estado real del permiso sin tocar la cámara. Chrome (también en la PWA instalada) lo
 * expone por Permissions API; Safari no, y ahí devolvemos 'prompt' para poder preguntar.
 */
export async function readCameraPermission(): Promise<MediaPermissionState> {
  if (typeof navigator === 'undefined') return 'unsupported';
  if (!isCameraSupported()) return 'unsupported';
  const perms = navigator.permissions;
  if (!perms?.query) return 'prompt';
  try {
    const status = await perms.query({ name: 'camera' as PermissionName });
    if (status.state === 'granted') {
      markCameraGranted();
      return 'granted';
    }
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export function markGalleryReady(): void {
  writeFlag(GALLERY_OK_KEY, true);
}

export function isGalleryMarkedReady(): boolean {
  return readFlag(GALLERY_OK_KEY);
}

async function queryName(name: PermissionName): Promise<MediaPermissionState> {
  if (!isCameraSupported()) return 'unsupported';
  if (!navigator.permissions?.query) return readFlag(CAMERA_OK_KEY) ? 'granted' : 'prompt';
  try {
    const status = await navigator.permissions.query({ name });
    if (status.state === 'granted') {
      markCameraGranted();
      return 'granted';
    }
    if (status.state === 'denied') return 'denied';
    return readFlag(CAMERA_OK_KEY) ? 'granted' : 'prompt';
  } catch {
    return readFlag(CAMERA_OK_KEY) ? 'granted' : 'prompt';
  }
}

export function queryCameraPermission(): Promise<MediaPermissionState> {
  return readCameraPermission();
}

export function queryMicrophonePermission(): Promise<MediaPermissionState> {
  return queryName('microphone' as PermissionName);
}

/**
 * MDN / WebKit: facingMode como string (ideal). Sin width/height: iOS falla el prompt.
 * No uses `exact`: si no hay esa cámara, ni siquiera pregunta.
 */
export async function getCameraStream(facing: 'user' | 'environment' = 'environment'): Promise<MediaStream> {
  const devices = ensureMediaDevices();
  if (!devices?.getUserMedia) {
    throw new DOMException('No hay cámara en este navegador.', 'NotFoundError');
  }
  const tries: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: facing } },
    { audio: false, video: { facingMode: { ideal: facing } } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const cons of tries) {
    try {
      return await devices.getUserMedia(cons);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new DOMException('No se ha podido abrir la cámara.', 'NotAllowedError');
}

function isDenied(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : '';
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
}

/**
 * Pide cámara desde un clic. Eso es lo que hace salir el diálogo «Permitir».
 */
export async function requestCameraAccess(): Promise<MediaPermissionState> {
  if (!isCameraSupported()) return 'unsupported';
  try {
    const stream = await getCameraStream('environment');
    stream.getTracks().forEach(t => t.stop());
    markCameraGranted();
    return 'granted';
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unsupported';
    // Cerrar el diálogo sin decidir no es un bloqueo: manda el estado real, no el error.
    const state = await readCameraPermission();
    if (state === 'granted' || state === 'denied') return state;
    return isDenied(err) ? 'denied' : 'prompt';
  }
}

/** Selector nativo de fotos/vídeos. En la web no hay un permiso persistente aparte. */
export function openGalleryPicker(accept = GALLERY_MEDIA_ACCEPT): Promise<File | null> {
  return new Promise(resolve => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    const finish = (file: File | null) => {
      input.remove();
      if (file) markGalleryReady();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export interface UseMediaAccessResult {
  camera: MediaPermissionState;
  galleryReady: boolean;
  requestingCamera: boolean;
  requestCamera: () => Promise<MediaPermissionState>;
  enableGallery: () => void;
}

export function useMediaAccess(): UseMediaAccessResult {
  const [camera, setCamera] = useState<MediaPermissionState>(() =>
    isCameraSupported() ? 'prompt' : 'unsupported'
  );
  const [galleryReady, setGalleryReady] = useState(() => isGalleryMarkedReady());
  const [requestingCamera, setRequestingCamera] = useState(false);

  const refreshCamera = useCallback(() => {
    void queryCameraPermission().then(setCamera);
  }, []);

  useEffect(() => {
    refreshCamera();
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshCamera();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refreshCamera);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', refreshCamera);
    };
  }, [refreshCamera]);

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    void navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then(s => {
        status = s;
        const apply = () => {
          if (s.state === 'granted') markCameraGranted();
          setCamera(s.state === 'granted' || s.state === 'denied' || s.state === 'prompt' ? s.state : 'prompt');
        };
        apply();
        s.addEventListener('change', apply);
      })
      .catch(() => undefined);
    return () => {
      /* PermissionStatus.onchange no se puede quitar de forma portable en todos los motores */
      void status;
    };
  }, []);

  const requestCamera = useCallback(async () => {
    setRequestingCamera(true);
    try {
      const next = await requestCameraAccess();
      setCamera(next);
      return next;
    } finally {
      setRequestingCamera(false);
    }
  }, []);

  const enableGallery = useCallback(() => {
    markGalleryReady();
    setGalleryReady(true);
  }, []);

  return {
    camera,
    galleryReady,
    requestingCamera,
    requestCamera,
    enableGallery,
  };
}
