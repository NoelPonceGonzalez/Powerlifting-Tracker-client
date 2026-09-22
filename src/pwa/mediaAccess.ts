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
  resetCameraPrompts();
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
 *
 * Android instalada: el permiso NO está en «Información de la app → Permisos» (el WebAPK
 * no declara Cámara). Al pulsar largo el icono, junto a «Información de la app» aparece
 * «Configuración del sitio», que es la que lo gestiona.
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
      ? 'Mantén pulsado el icono de la app y entra en «Configuración del sitio» (o «Site settings»), NO en «Información de la app»: ahí tienes Cámara → Permitir. En «Información de la app» no aparece Cámara porque el permiso lo guarda Chrome, no el sistema.'
      : 'Toca el candado junto a la dirección → Permisos → Cámara → Permitir. Si ahí no sale, Chrome → ⋮ → Configuración → Configuración de sitios web → Cámara, busca esta web en «Bloqueados» y ponla en Permitir.';
  }
  return 'Toca el candado junto a la dirección del navegador, pon Cámara en Permitir y recarga.';
}

/**
 * Segunda vía para la app instalada: no todos los launchers traen «Configuración del
 * sitio» en el menú del icono. El permiso es del origen y lo comparten la app instalada
 * y el navegador, así que permitirlo en Chrome lo arregla también aquí dentro.
 */
export function cameraFallbackHint(): string | null {
  if (isNativeShell() || isIOS() || !isStandalone()) return null;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return `Si ese menú no te aparece: abre ${host || 'esta misma web'} en Chrome, toca el candado de la barra → Permisos → Cámara → Permitir. Es el mismo permiso para la web y para la app instalada, así que con eso ya funciona aquí dentro.`;
}

/**
 * El navegador también necesita el permiso de cámara del sistema. Si Chrome no lo tiene,
 * ninguna web puede abrirla y el diálogo de la web no sirve de nada.
 */
export function cameraOsHint(): string | null {
  if (isNativeShell() || isIOS()) return null;
  if (isAndroid()) {
    return 'Comprueba también: Ajustes de Android → Aplicaciones → Chrome → Permisos → Cámara → Permitir.';
  }
  return null;
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

function isDenied(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : '';
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
}

/** Si falla antes de esto, el diálogo no se ha mostrado: nadie decide tan rápido. */
const PROMPT_MIN_MS = 250;

/**
 * Chrome mete el origen en cuarentena al tercer descarte, y entonces no hay vuelta atrás
 * desde la web. Llevamos la cuenta nosotros y dejamos de pedir antes de llegar, así que
 * el bloqueo de una semana no se puede provocar desde la app.
 */
const CAMERA_LOST_KEY = 'power_camera_lost';
const MAX_LOST_PROMPTS = 2;

function readCount(key: string): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = Number(localStorage.getItem(key));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}

function noteCameraPromptLost(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CAMERA_LOST_KEY, String(readCount(CAMERA_LOST_KEY) + 1));
  } catch {
    /* quota / private */
  }
}

function resetCameraPrompts(): void {
  try {
    localStorage?.removeItem(CAMERA_LOST_KEY);
  } catch {
    /* quota / private */
  }
}

/** true = no volvemos a pedir solos: un descarte más y Chrome lo bloquearía. */
export function cameraPromptExhausted(): boolean {
  return readCount(CAMERA_LOST_KEY) >= MAX_LOST_PROMPTS;
}

/** Queda un intento antes del bloqueo: hay que avisarlo antes de pedirlo. */
export function cameraPromptIsLastChance(): boolean {
  return readCount(CAMERA_LOST_KEY) === MAX_LOST_PROMPTS - 1;
}

/**
 * El sensor del móvil es 4:3. Pedir 9:16 (720×1280) obliga a Chrome y a Safari a
 * recortar y ampliar (`resizeMode: crop-and-scale`): eso es el zoom de más.
 * `resizeMode: none` pide el sensor entero; Safari a veces lo ignora, por eso el
 * tamaño pedido ya es 4:3 y, si falla, se reintenta sin él.
 *
 * MDN / WebKit: facingMode como string. Sin width/height iOS a veces no enseña el aviso.
 * No uses `exact`: si no hay esa cámara, ni siquiera pregunta.
 *
 * Safari no implementa el zoom de la pista (`getCapabilities().zoom` viene vacío).
 * El pellizco en pantalla lo hace la vista; aquí solo se abre la cámara lo más abierta.
 *
 * Los reintentos son SOLO para cuando la cámara pedida no encaja (iOS, tablets con una
 * sola cámara). Si el fallo es de permiso hay que parar en seco: cada getUserMedia
 * rechazado cuenta como descarte y a los 3 Chrome mete el origen en cuarentena una
 * semana, y entonces ya no vuelve a preguntar ni pulsando Activar.
 */
export async function getCameraStream(facing: 'user' | 'environment' = 'environment'): Promise<MediaStream> {
  const devices = ensureMediaDevices();
  if (!devices?.getUserMedia) {
    throw new DOMException('No hay cámara en este navegador.', 'NotFoundError');
  }
  const wide = {
    facingMode: facing,
    width: { ideal: 1280 },
    height: { ideal: 960 },
    aspectRatio: { ideal: 4 / 3 },
    resizeMode: 'none',
  } as MediaTrackConstraints;
  const tries: MediaStreamConstraints[] = [
    { audio: false, video: wide },
    { audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } } },
    { audio: false, video: { facingMode: { ideal: facing } } },
    { audio: false, video: true },
  ];
  let last: unknown;
  const startedAt = Date.now();
  for (const cons of tries) {
    try {
      const stream = await devices.getUserMedia(cons);
      resetCameraPrompts();
      return stream;
    } catch (err) {
      last = err;
      if (isDenied(err)) {
        // Solo cuenta si el diálogo estuvo delante: lo que Chrome suma son descartes.
        if (Date.now() - startedAt >= PROMPT_MIN_MS) noteCameraPromptLost();
        break;
      }
    }
  }
  throw last instanceof Error ? last : new DOMException('No se ha podido abrir la cámara.', 'NotAllowedError');
}

export interface CameraZoomRange {
  min: number;
  max: number;
  step: number;
}

/**
 * Zoom óptico/digital de la pista. Chrome Android lo trae; Safari en iPhone no
 * (la capacidad no aparece). Si devuelve null, el zoom se hace en la vista.
 */
export function cameraZoomRange(track: MediaStreamTrack): CameraZoomRange | null {
  try {
    const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
      zoom?: { min?: number; max?: number; step?: number };
    };
    const zoom = caps?.zoom;
    if (!zoom || typeof zoom.min !== 'number' || typeof zoom.max !== 'number' || !(zoom.max > zoom.min)) {
      return null;
    }
    return {
      min: zoom.min,
      max: zoom.max,
      step: zoom.step && zoom.step > 0 ? zoom.step : 0.1,
    };
  } catch {
    return null;
  }
}

export async function applyCameraZoom(track: MediaStreamTrack, zoom: number): Promise<void> {
  const withZoom = { advanced: [{ zoom }] } as unknown as MediaTrackConstraints;
  try {
    await track.applyConstraints(withZoom);
  } catch {
    await track.applyConstraints({ zoom } as unknown as MediaTrackConstraints);
  }
}

/**
 * Por qué no hay cámara:
 * - `user`: ha dicho No o ha cerrado el diálogo. Se puede volver a pedir.
 * - `silent`: el diálogo no llegó a salir (bloqueo recordado o cuarentena de Chrome).
 *   Desde la web no hay forma de reabrirlo: solo ajustes del sitio.
 * - `os`: la cámara no se puede abrir (el navegador no tiene permiso del sistema,
 *   o la está usando otra app).
 */
export type CameraDenialKind = 'none' | 'user' | 'silent' | 'os';

export interface CameraAttempt {
  state: MediaPermissionState;
  denial: CameraDenialKind;
}

/**
 * Pide cámara desde un clic. Eso es lo que hace salir el diálogo «Permitir».
 * Una sola petición por pulsación: insistir es lo que provoca el bloqueo permanente.
 */
export async function requestCameraAccess(): Promise<CameraAttempt> {
  if (!isCameraSupported()) return { state: 'unsupported', denial: 'none' };
  const startedAt = Date.now();
  try {
    const stream = await getCameraStream('environment');
    stream.getTracks().forEach(t => t.stop());
    markCameraGranted();
    return { state: 'granted', denial: 'none' };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    const elapsed = Date.now() - startedAt;
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return { state: 'unsupported', denial: 'none' };
    }
    // La cámara existe pero el sistema no la suelta: permiso del navegador u otra app.
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      return { state: 'denied', denial: 'os' };
    }
    // Cerrar el diálogo sin decidir no es un bloqueo: manda el estado real, no el error.
    const state = await readCameraPermission();
    if (state === 'granted') return { state, denial: 'none' };
    if (!isDenied(err)) return { state, denial: 'none' };
    // Sin diálogo visible el permiso ya estaba decidido antes de pulsar.
    if (elapsed < PROMPT_MIN_MS) return { state: 'denied', denial: 'silent' };
    return { state, denial: 'user' };
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
  /** Por qué no hay cámara, para no mandar a ajustes a quien solo cerró el diálogo. */
  cameraDenial: CameraDenialKind;
  galleryReady: boolean;
  requestingCamera: boolean;
  requestCamera: () => Promise<CameraAttempt>;
  /** Relee el permiso sin tocar la cámara (tras cambiarlo en ajustes del sitio). */
  recheckCamera: () => Promise<MediaPermissionState>;
  enableGallery: () => void;
}

export function useMediaAccess(): UseMediaAccessResult {
  const [camera, setCamera] = useState<MediaPermissionState>(() =>
    isCameraSupported() ? 'prompt' : 'unsupported'
  );
  const [cameraDenial, setCameraDenial] = useState<CameraDenialKind>('none');
  const [galleryReady, setGalleryReady] = useState(() => isGalleryMarkedReady());
  const [requestingCamera, setRequestingCamera] = useState(false);

  const refreshCamera = useCallback(() => {
    void queryCameraPermission().then(next => {
      setCamera(next);
      if (next === 'granted') setCameraDenial('none');
    });
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
          if (s.state === 'granted') {
            markCameraGranted();
            setCameraDenial('none');
          }
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
      const attempt = await requestCameraAccess();
      setCamera(attempt.state);
      setCameraDenial(attempt.denial);
      return attempt;
    } finally {
      setRequestingCamera(false);
    }
  }, []);

  const recheckCamera = useCallback(async () => {
    const next = await queryCameraPermission();
    setCamera(next);
    if (next !== 'denied') setCameraDenial('none');
    return next;
  }, []);

  const enableGallery = useCallback(() => {
    markGalleryReady();
    setGalleryReady(true);
  }, []);

  return {
    camera,
    cameraDenial,
    galleryReady,
    requestingCamera,
    requestCamera,
    recheckCamera,
    enableGallery,
  };
}
