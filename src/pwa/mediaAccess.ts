import { useCallback, useEffect, useState } from 'react';

export type MediaPermissionState = 'unsupported' | 'prompt' | 'granted' | 'denied';

const CAMERA_OK_KEY = 'power_camera_ok';
const GALLERY_OK_KEY = 'power_gallery_ok';

export function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
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
  return queryName('camera' as PermissionName);
}

export function queryMicrophonePermission(): Promise<MediaPermissionState> {
  return queryName('microphone' as PermissionName);
}

let primedStoryStream: MediaStream | null = null;

function keepStream(stream: MediaStream): void {
  primedStoryStream?.getTracks().forEach(t => t.stop());
  primedStoryStream = stream;
  markCameraGranted();
}

/** Mismo clic que abre el compositor: iOS solo da cámara si el gesto es reciente. */
export async function primeStoryCamera(facing: 'user' | 'environment' = 'environment'): Promise<boolean> {
  if (!isCameraSupported()) return false;
  const tries: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: facing } }, audio: false },
    { video: true, audio: false },
  ];
  for (const cons of tries) {
    try {
      keepStream(await navigator.mediaDevices.getUserMedia(cons));
      return true;
    } catch {
      /* siguiente */
    }
  }
  return false;
}

export function consumePrimedStoryCamera(): MediaStream | null {
  const stream = primedStoryStream;
  primedStoryStream = null;
  return stream;
}

export function releasePrimedStoryCamera(): void {
  primedStoryStream?.getTracks().forEach(t => t.stop());
  primedStoryStream = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => releasePrimedStoryCamera());
}

/**
 * Pide cámara desde un clic. Eso es lo que hace salir el diálogo «Permitir».
 */
export async function requestCameraAccess(): Promise<MediaPermissionState> {
  if (!isCameraSupported()) return 'unsupported';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    stream.getTracks().forEach(t => t.stop());
    markCameraGranted();
    return 'granted';
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        videoOnly.getTracks().forEach(t => t.stop());
        markCameraGranted();
        return 'granted';
      } catch (inner) {
        const innerName = inner instanceof DOMException ? inner.name : '';
        if (innerName === 'NotAllowedError' || innerName === 'PermissionDeniedError') return 'denied';
        return 'unsupported';
      }
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied';
    return 'denied';
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
    isCameraSupported() ? (readFlag(CAMERA_OK_KEY) ? 'granted' : 'prompt') : 'unsupported'
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
