import { useCallback, useEffect, useState } from 'react';

export type MediaPermissionState = 'unsupported' | 'prompt' | 'granted' | 'denied';

export function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export function isGallerySupported(): boolean {
  return typeof document !== 'undefined';
}

async function queryName(name: PermissionName): Promise<MediaPermissionState> {
  if (!isCameraSupported()) return 'unsupported';
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state;
    }
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export function queryCameraPermission(): Promise<MediaPermissionState> {
  return queryName('camera' as PermissionName);
}

export function queryMicrophonePermission(): Promise<MediaPermissionState> {
  return queryName('microphone' as PermissionName);
}

/**
 * Pide cámara (y micrófono si se puede). Hay que llamarlo desde un clic.
 * Corta el stream al instante: solo sirve para dejar el permiso concedido.
 */
export async function requestCameraAccess(): Promise<MediaPermissionState> {
  if (!isCameraSupported()) return 'unsupported';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: true,
    });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        videoOnly.getTracks().forEach((t) => t.stop());
        return 'granted';
      } catch (inner) {
        const innerName = inner instanceof DOMException ? inner.name : '';
        if (innerName === 'NotAllowedError' || innerName === 'PermissionDeniedError') return 'denied';
        return 'unsupported';
      }
    }
    return 'denied';
  }
}

/** Abre el selector nativo de fotos/vídeos. La galería no tiene permiso persistente en web. */
export function openGalleryPicker(accept = 'image/*,video/*'): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    const finish = (file: File | null) => {
      input.remove();
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
  openGallery: () => Promise<File | null>;
}

export function useMediaAccess(): UseMediaAccessResult {
  const [camera, setCamera] = useState<MediaPermissionState>(() =>
    isCameraSupported() ? 'prompt' : 'unsupported'
  );
  const [requestingCamera, setRequestingCamera] = useState(false);

  useEffect(() => {
    void queryCameraPermission().then(setCamera);
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

  return {
    camera,
    galleryReady: isGallerySupported(),
    requestingCamera,
    requestCamera,
    openGallery: openGalleryPicker,
  };
}
