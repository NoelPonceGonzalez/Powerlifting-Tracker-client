/** 1 min tope. El servidor aguanta 80 MB en RAM; 40 MB deja margen para un minuto. */
export const STORY_VIDEO_MAX_SEC = 60;
export const STORY_VIDEO_MIN_SEC = 3;
/** Lo que se envía al servidor tras recortar (multer 80 MB). */
export const STORY_UPLOAD_MAX_BYTES = 40 * 1024 * 1024;
/** Tope al abrir de la galería: se recorta aquí; no hace falta bajar de 200 MB en Fotos. */
export const STORY_SOURCE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/**
 * Historia con el lado largo a 1280. Un 1080 a los mismos bits se ve más blando.
 * Un minuto pesa ~24 MB. Verla 1.000 veces son ~24 GB de salida de S3/EC2:
 * guardar 24 h es barato, cada reproducción es lo que se paga. El bitrate no sube.
 * docs/costes-almacenamiento.md
 */
export const STORY_OUT_W = 720;
export const STORY_OUT_H = 1280;

/**
 * Lienzo con la proporción de la pantalla de edición.
 * Una sola escala, como object-fit: cover: llena sin estirar y sin franjas.
 */
export function storyFrameSize(viewW: number, viewH: number, longEdge: number): { W: number; H: number; scale: number } {
  const vw = Math.max(1, viewW);
  const vh = Math.max(1, viewH);
  const edge = Math.max(2, longEdge);
  const raw = vh >= vw ? edge / vh : edge / vw;
  // Múltiplo de 16: el decodificador de hardware y el plano de vídeo de Chrome
  // rechazan anchos sueltos (p. ej. 606) y pasan a un camino que tira fotogramas.
  let W = Math.max(16, Math.round((vw * raw) / 16) * 16);
  let H = Math.max(16, Math.round((vh * raw) / 16) * 16);
  return { W, H, scale: Math.min(W / vw, H / vh) };
}
export const STORY_VIDEO_BITRATE = 3_200_000;
export const STORY_AUDIO_BITRATE = 64_000;
export const STORY_THUMB_COUNT = 10;

/** Lo que el servidor guarda tal cual (utils/mediaStorage.ts). */
const UPLOADABLE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

/** `MediaRecorder` devuelve `video/webm;codecs=vp9`: al servidor va el tipo base. */
export function cleanMediaMime(type?: string | null): string {
  return String(type || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function isUploadableMedia(type?: string | null): boolean {
  return UPLOADABLE_MIME.has(cleanMediaMime(type));
}

/** Mismo contenido con el tipo saneado, que es lo que mira multer al subirlo. */
export function withCleanMime(blob: Blob, name: string, fallback: string): File {
  const type = isUploadableMedia(blob.type) ? cleanMediaMime(blob.type) : fallback;
  return new File([blob], name, { type });
}

/** El texto se pinta igual en la vista previa y en el canvas: misma fuente y mismo ancho. */
export const STORY_TEXT_LINE = 1.18;

export const STORY_FONTS = [
  { id: 'classic', label: 'Clásica', family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', weight: 800 },
  { id: 'modern', label: 'Moderna', family: 'Arial, Helvetica, sans-serif', weight: 700 },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif', weight: 700 },
  { id: 'mono', label: 'Mono', family: 'ui-monospace, "SFMono-Regular", "Courier New", monospace', weight: 700 },
  { id: 'strong', label: 'Fuerte', family: 'Impact, "Arial Black", "Segoe UI", sans-serif', weight: 400 },
  { id: 'hand', label: 'Nota', family: '"Segoe Script", "Segoe Print", "Comic Sans MS", cursive', weight: 700 },
] as const;

export type StoryFontId = (typeof STORY_FONTS)[number]['id'];

/** Columna de color, de arriba a abajo, como en Instagram. */
export const STORY_TEXT_COLORS = [
  '#ffffff',
  '#000000',
  '#ff2d55',
  '#ff9500',
  '#ffcc00',
  '#34c759',
  '#00c7be',
  '#007aff',
  '#5856d6',
  '#af52de',
] as const;

export const STORY_TEXT_FONT = STORY_FONTS[0].family;
export const STORY_TEXT_WEIGHT = STORY_FONTS[0].weight;

export function storyFont(id?: string | null) {
  return STORY_FONTS.find(f => f.id === id) || STORY_FONTS[0];
}

/** Contorno fino para que se lea encima del vídeo, sin el borde gordo. */
export function storyStrokeColor(color?: string | null): string {
  const hex = (color || '#ffffff').replace('#', '');
  if (hex.length < 6) return 'rgba(0,0,0,0.65)';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) return 'rgba(0,0,0,0.65)';
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.9)';
}
/** Ancho máximo del bloque, en tanto por uno del encuadre. */
export const STORY_TEXT_MAX_W = 0.86;
export const STORY_TEXT_MIN_PX = 14;
export const STORY_TEXT_MAX_PX = 140;

export type StoryTextOverlay = {
  id: string;
  value: string;
  /** Centro del texto respecto al centro del encuadre, en px de pantalla. */
  x: number;
  y: number;
  /** Cuerpo de la letra en px de pantalla. */
  size: number;
  rot: number;
  font?: StoryFontId | string;
  color?: string;
};

export function storyTextFont(px: number, fontId?: string | null): string {
  const face = storyFont(fontId);
  return `${face.weight} ${px}px ${face.family}`;
}

export function storyRecorderOptions(mime?: string): MediaRecorderOptions {
  const opts: MediaRecorderOptions = {
    videoBitsPerSecond: STORY_VIDEO_BITRATE,
    audioBitsPerSecond: STORY_AUDIO_BITRATE,
  };
  if (mime) opts.mimeType = mime;
  return opts;
}

export function clampStoryTextSize(px: number): number {
  return Math.max(STORY_TEXT_MIN_PX, Math.min(STORY_TEXT_MAX_PX, px));
}

/** Textos con contenido; se pintan en el mismo orden que en la vista previa. */
export function storyTextsForExport(texts?: StoryTextOverlay[] | null): StoryTextOverlay[] {
  return (texts || []).filter(t => t.value.trim());
}

export function drawStoryTexts(
  ctx: CanvasRenderingContext2D,
  texts: StoryTextOverlay[] | null | undefined,
  W: number,
  H: number,
  viewW: number,
  viewH: number
): void {
  for (const text of storyTextsForExport(texts)) {
    drawStoryText(ctx, text, W, H, viewW, viewH);
  }
}

function splitLongWord(ctx: CanvasRenderingContext2D, word: string, maxW: number): string[] {
  if (ctx.measureText(word).width <= maxW) return [word];
  const parts: string[] = [];
  let cur = '';
  for (const ch of word) {
    if (cur && ctx.measureText(cur + ch).width > maxW) {
      parts.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Corta por palabras como haría el navegador con el mismo ancho. */
function wrapStoryText(ctx: CanvasRenderingContext2D, value: string, maxW: number): string[] {
  const out: string[] = [];
  for (const raw of value.split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean).flatMap(w => splitLongWord(ctx, w, maxW));
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`;
      if (ctx.measureText(next).width <= maxW) {
        line = next;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

/** Quema el texto encima del fotograma ya dibujado, en las mismas coordenadas que la vista previa. */
export function drawStoryText(
  ctx: CanvasRenderingContext2D,
  text: StoryTextOverlay,
  W: number,
  H: number,
  viewW: number,
  viewH: number
): void {
  const value = text.value.replace(/\s+$/, '');
  if (!value.trim()) return;
  const s = Math.min(W / Math.max(1, viewW), H / Math.max(1, viewH));
  const px = Math.max(8, text.size * s);
  const fill = text.color || '#ffffff';
  ctx.save();
  ctx.font = storyTextFont(px, text.font);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const lines = wrapStoryText(ctx, value, W * STORY_TEXT_MAX_W);
  const lh = px * STORY_TEXT_LINE;
  ctx.translate(W / 2 + text.x * s, H / 2 + text.y * s);
  ctx.rotate((text.rot * Math.PI) / 180);
  ctx.lineWidth = Math.max(1.25, px * 0.055);
  ctx.strokeStyle = storyStrokeColor(fill);
  ctx.fillStyle = fill;
  const top = -((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => {
    if (!line) return;
    ctx.strokeText(line, 0, top + i * lh);
    ctx.fillText(line, 0, top + i * lh);
  });
  ctx.restore();
}

export function formatStoryTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Peso que se muestra en la tira, estilo 5334kB / 12.4MB. */
export function formatStoryBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0kB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))}kB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)}MB`;
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

/**
 * El audio sale por Web Audio, no por `video.captureStream()`.
 * En Chrome, capturar el vídeo y a la vez pintarlo en un canvas deja
 * los fotogramas en negro: se oye el audio y el texto flota sobre negro.
 */
function pipeElementAudio(video: HTMLVideoElement, into: MediaStream, audio: AudioContext): () => void {
  const source = audio.createMediaElementSource(video);
  const dest = audio.createMediaStreamDestination();
  source.connect(dest);
  dest.stream.getAudioTracks().forEach(track => into.addTrack(track));
  return () => {
    try { source.disconnect(); } catch { /* ya cerrado */ }
    void audio.close();
  };
}

/**
 * Mismo 3,2 Mbps. H.264 High aprovecha esos bits mejor que Baseline
 * (MDN: avc1.640028 es High@L4.0). Si el móvil no lo tiene, se queda el mp4
 * que el navegador acelera por hardware.
 */
export function storyRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const types = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/**
 * Recorta en el dispositivo (re-encode). En iOS antiguo puede fallar:
 * el llamador muestra entonces que recorten en Fotos.
 */
export async function trimVideoFile(
  file: File,
  startSec: number,
  endSec: number,
  opts?: {
    rotationDeg?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    viewW?: number;
    viewH?: number;
    /** Sube el clip sin pista de audio. */
    mute?: boolean;
    texts?: StoryTextOverlay[] | null;
    signal?: AbortSignal;
  }
): Promise<File> {
  const from = Math.max(0, startSec);
  const to = Math.max(from + 0.4, endSec);
  const rotation = ((opts?.rotationDeg ?? 0) % 360 + 360) % 360;
  const framed = !!(opts?.w && opts.viewW && opts.viewH && opts.h);
  const overlays = storyTextsForExport(opts?.texts);
  const mute = !!opts?.mute;
  const bakeRotate = (rotation > 0.8 && rotation < 359.2) || framed || overlays.length > 0;
  const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioCtx = !mute && bakeRotate && AudioCtor ? new AudioCtor() : null;
  if (audioCtx) void audioCtx.resume();
  const url = URL.createObjectURL(file);
  const video = document.createElement('video') as CapturableVideo;
  video.muted = mute;
  video.volume = mute ? 0 : 1;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', 'true');
  // Fuera de pantalla, pero con tamaño: si opacity es 0 Chrome no decodifica fotogramas.
  // Tamaño real y fuera de la pantalla: a 8 px Chrome se salta fotogramas y el clip sale a tirones.
  video.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:854px;opacity:0.02;pointer-events:none;z-index:-1;transform:translateX(-120vw)';
  document.body.appendChild(video);
  video.src = url;
  let stopDraw: (() => void) | null = null;
  let releaseAudio: (() => void) | null = null;
  let rec: MediaRecorder | null = null;
  const signal = opts?.signal;
  const cancel = () => {
    if (signal?.aborted) throw new DOMException('La subida se ha cancelado.', 'AbortError');
  };
  const until = <T,>(work: Promise<T>): Promise<T> => {
    if (!signal) return work;
    return Promise.race([
      work,
      new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new DOMException('La subida se ha cancelado.', 'AbortError'));
        else signal.addEventListener('abort', () => reject(new DOMException('La subida se ha cancelado.', 'AbortError')), { once: true });
      }),
    ]);
  };

  try {
    await until(new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('No se ha podido abrir el vídeo para recortar.'));
    }));
    cancel();

    const capture = video.captureStream?.bind(video) ?? video.mozCaptureStream?.bind(video);
    const canPaint = typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
    if (typeof MediaRecorder === 'undefined' || (bakeRotate ? !canPaint : !capture)) {
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

    let stream: MediaStream | null = null;
    if (bakeRotate) {
      const viewW = opts?.viewW && opts.viewW > 8 ? opts.viewW : STORY_OUT_W;
      const viewH = opts?.viewH && opts.viewH > 8 ? opts.viewH : STORY_OUT_H;
      const framedOut = storyFrameSize(viewW, viewH, STORY_OUT_H);
      const W = framedOut.W;
      const H = framedOut.H;
      const s = framedOut.scale;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('No se ha podido girar el vídeo.');
      ctx.imageSmoothingEnabled = true;
      const srcLong = Math.max(video.videoWidth || 0, video.videoHeight || 0);
      const outLong = Math.max(W, H);
      // Al bajar de 4K, 'high' conserva detalle. Al ampliar, 'medium' no lo emborrona más.
      ctx.imageSmoothingQuality = srcLong > outLong * 1.15 ? 'high' : 'medium';
      const rad = (rotation * Math.PI) / 180;
      const textLayer = document.createElement('canvas');
      textLayer.width = W;
      textLayer.height = H;
      if (overlays.length) {
        const textCtx = textLayer.getContext('2d');
        if (textCtx) drawStoryTexts(textCtx, overlays, W, H, viewW, viewH);
      }
      const paint = () => {
        const vw = video.videoWidth || 1;
        const vh = video.videoHeight || 1;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (framed && opts) {
          ctx.translate(W / 2 + (opts.x || 0) * s, H / 2 + (opts.y || 0) * s);
          ctx.rotate(rad);
          const dw = (opts.w || vw) * s;
          const dh = (opts.h || vh) * s;
          ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
        } else {
          ctx.translate(W / 2, H / 2);
          ctx.rotate(rad);
          const cover = Math.max(W / vw, H / vh);
          const coverSwap = Math.max(W / vh, H / vw);
          const coverScale = Math.abs(Math.cos(rad)) * cover + Math.abs(Math.sin(rad)) * coverSwap;
          ctx.drawImage(video, -(vw * coverScale) / 2, -(vh * coverScale) / 2, vw * coverScale, vh * coverScale);
        }
        ctx.restore();
        if (overlays.length) ctx.drawImage(textLayer, 0, 0);
      };
      let drawing = true;
      let timer = 0;
      let frameCallback = 0;
      let lastPaint = -1;
      const visual = canvas.captureStream(0);
      const track = visual.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      const manual = typeof track?.requestFrame === 'function';
      let active: MediaStream = visual;
      if (!manual) {
        visual.getTracks().forEach(t => t.stop());
        active = canvas.captureStream(30);
      }
      const schedule = () => {
        const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number };
        if (v.requestVideoFrameCallback) frameCallback = v.requestVideoFrameCallback((now, meta) => pump(meta.mediaTime));
        else timer = window.setTimeout(() => pump(video.currentTime), 33);
      };
      const pump = (mediaTime: number) => {
        if (!drawing) return;
        if (mediaTime - lastPaint < 0.028) {
          schedule();
          return;
        }
        lastPaint = mediaTime;
        paint();
        if (manual) track?.requestFrame();
        schedule();
      };
      stopDraw = () => {
        drawing = false;
        if (timer) window.clearTimeout(timer);
        const v = video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void };
        if (frameCallback && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(frameCallback);
      };
      await video.play();
      await new Promise<void>(resolve => {
        const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => resolve());
        else window.setTimeout(resolve, 80);
      });
      video.pause();
      video.currentTime = from;
      await new Promise<void>(resolve => {
        if (Math.abs(video.currentTime - from) < 0.08) {
          resolve();
          return;
        }
        video.onseeked = () => resolve();
        window.setTimeout(resolve, 700);
      });
      paint();
      if (manual) track?.requestFrame();
      if (audioCtx) releaseAudio = pipeElementAudio(video, active, audioCtx);
      stream = active;
      pump(from);
    } else {
      if (!capture) {
        throw new Error(
          'Este móvil no puede recortar aquí. En Fotos/Galería recorta el vídeo a 1 min y elige ese clip.'
        );
      }
      const captured = capture(30);
      if (mute) {
        captured.getAudioTracks().forEach(t => {
          captured.removeTrack(t);
          t.stop();
        });
      }
      stream = captured;
    }

    if (!stream) throw new Error('No se ha podido preparar el vídeo.');
    const mime = storyRecorderMime();
    rec = new MediaRecorder(stream, storyRecorderOptions(mime));
    const chunks: Blob[] = [];
    rec.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const finished = new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
      rec.onerror = () => reject(new Error('No se ha podido recortar el vídeo.'));
    });

    cancel();
    rec.start();
    await video.play();

    const clipMs = (to - from) * 1000;
    await until(new Promise<void>(resolve => {
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
    }));
    cancel();

    video.pause();
    if (rec.state !== 'inactive') rec.stop();
    const blob = await finished;
    stopDraw?.();
    releaseAudio?.();
    releaseAudio = null;
    stream.getTracks().forEach(t => t.stop());
    if (blob.size > STORY_UPLOAD_MAX_BYTES) {
      throw new Error('El recorte sigue siendo muy pesado para el servidor. Elige un tramo más corto.');
    }
    const ext = (blob.type || rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
    return withCleanMime(blob, `historia.${ext}`, `video/${ext}`);
  } finally {
    stopDraw?.();
    releaseAudio?.();
    try {
      if (rec && rec.state !== 'inactive') rec.stop();
    } catch {
      /* ya parado */
    }
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

/** Lo que acabará pesando el clip: recorte + re-encode a 3,2 Mbps en 720p si hace falta. */
export function estimateClipBytes(file: File, duration: number, start: number, clipLen: number): number {
  const len = Math.max(0.4, Math.min(clipLen, STORY_VIDEO_MAX_SEC));
  const encoded = (STORY_VIDEO_BITRATE / 8) * len;
  if (needsStoryPrepare(file, duration, start, len)) return Math.round(encoded);
  return Math.round(file.size * (len / Math.max(0.4, duration)));
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
