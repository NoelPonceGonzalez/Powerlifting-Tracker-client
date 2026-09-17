/** 1 min tope. El servidor aguanta 80 MB en RAM; 40 MB deja margen para un minuto. */
export const STORY_VIDEO_MAX_SEC = 60;
export const STORY_VIDEO_MIN_SEC = 3;
/** Lo que se envía al servidor tras recortar (multer 80 MB). */
export const STORY_UPLOAD_MAX_BYTES = 40 * 1024 * 1024;
/** Tope al abrir de la galería: se recorta aquí; no hace falta bajar de 200 MB en Fotos. */
export const STORY_SOURCE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const STORY_VIDEO_BITRATE = 3_500_000;
export const STORY_THUMB_COUNT = 10;

export function formatStoryTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      video.src = '';
      if (!Number.isFinite(d) || d <= 0) {
        reject(new Error('No se ha podido leer la duración del vídeo.'));
        return;
      }
      resolve(d);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Ese archivo no se puede abrir como vídeo.'));
    };
    video.src = url;
  });
}

type CapturableVideo = HTMLVideoElement & {
  captureStream?: (frameRequestRate?: number) => MediaStream;
  mozCaptureStream?: (frameRequestRate?: number) => MediaStream;
};

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const type of ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/**
 * Recorta en el dispositivo (re-encode). En iOS antiguo puede fallar:
 * el llamador muestra entonces que recorten en Fotos.
 */
export async function trimVideoFile(file: File, startSec: number, endSec: number): Promise<File> {
  const from = Math.max(0, startSec);
  const to = Math.max(from + 0.4, endSec);
  const url = URL.createObjectURL(file);
  const video = document.createElement('video') as CapturableVideo;
  video.muted = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('No se ha podido abrir el vídeo para recortar.'));
    });

    const capture = video.captureStream?.bind(video) ?? video.mozCaptureStream?.bind(video);
    if (!capture || typeof MediaRecorder === 'undefined') {
      throw new Error(
        'Este móvil no puede recortar aquí. En Fotos/Galería recorta el vídeo a 1 min y elige ese clip.'
      );
    }

    video.currentTime = from;
    await new Promise<void>(resolve => {
      if (Math.abs(video.currentTime - from) < 0.2) {
        resolve();
        return;
      }
      video.onseeked = () => resolve();
    });

    const stream = capture(30);
    const mime = pickRecorderMime();
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: STORY_VIDEO_BITRATE })
      : new MediaRecorder(stream, { videoBitsPerSecond: STORY_VIDEO_BITRATE });
    const chunks: Blob[] = [];
    rec.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const finished = new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
      rec.onerror = () => reject(new Error('No se ha podido recortar el vídeo.'));
    });

    rec.start(80);
    await video.play();

    const clipMs = (to - from) * 1000;
    await new Promise<void>(resolve => {
      const hard = window.setTimeout(() => resolve(), clipMs + 350);
      const tick = () => {
        if (video.currentTime >= to - 0.04 || video.ended) {
          window.clearTimeout(hard);
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });

    video.pause();
    if (rec.state !== 'inactive') rec.stop();
    stream.getTracks().forEach(t => t.stop());
    const blob = await finished;
    if (blob.size > STORY_UPLOAD_MAX_BYTES) {
      throw new Error('El recorte sigue siendo muy pesado para el servidor. Elige un tramo más corto.');
    }
    const ext = (blob.type || rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
    return new File([blob], `historia.${ext}`, { type: blob.type || `video/${ext}` });
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
    video.remove();
  }
}

export function needsStoryTrim(duration: number, start: number, length: number): boolean {
  if (duration > STORY_VIDEO_MAX_SEC + 0.15) return true;
  if (start > 0.12) return true;
  return length + 0.15 < duration;
}

export function needsStoryPrepare(file: File, duration: number, start: number, length: number): boolean {
  return needsStoryTrim(duration, start, length) || file.size > STORY_UPLOAD_MAX_BYTES;
}

function waitSeek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    try {
      video.currentTime = time;
    } catch {
      done();
      return;
    }
    window.setTimeout(done, 900);
  });
}

/**
 * Fotogramas para la tira de recorte. Si el móvil no deja buscar, se devuelve vacío
 * y la UI pinta un degradado.
 */
export async function extractStoryThumbnails(
  file: File,
  count = STORY_THUMB_COUNT,
  signal?: { cancelled: boolean },
  onFrame?: (dataUrl: string, index: number) => void
): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  const thumbs: string[] = [];
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('No se han podido leer los fotogramas.'));
      window.setTimeout(() => resolve(), 4000);
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth) return thumbs;
    const w = 72;
    const h = Math.max(96, Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth)));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return thumbs;
    const n = Math.max(2, Math.min(count, Math.ceil(duration)));
    for (let i = 0; i < n; i++) {
      if (signal?.cancelled) break;
      const t = Math.min(duration - 0.05, ((i + 0.5) / n) * duration);
      await waitSeek(video, Math.max(0, t));
      if (signal?.cancelled) break;
      ctx.drawImage(video, 0, 0, w, h);
      const data = canvas.toDataURL('image/jpeg', 0.62);
      thumbs.push(data);
      onFrame?.(data, i);
    }
    return thumbs;
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
    video.remove();
  }
}
