import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Image as ImageIcon, Loader2, RefreshCw, RotateCw, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { AudienceToggle } from '@/src/components/social/AudienceToggle';
import type { Audience } from '@/src/lib/privacyApi';
import { SLIME_FULLSCREEN_IN, SLIME_FULLSCREEN_OUT, SLIME_FULLSCREEN_SHOW, STICKY } from '@/src/lib/motionPresets';
import { publishMedia, type FeedPost } from '@/src/lib/feedApi';
import {
  STORY_SOURCE_MAX_BYTES,
  STORY_UPLOAD_MAX_BYTES,
  STORY_FONTS,
  STORY_TEXT_COLORS,
  STORY_VIDEO_BITRATE,
  STORY_TEXT_LINE,
  STORY_TEXT_MAX_W,
  STORY_VIDEO_MAX_SEC,
  STORY_VIDEO_MIN_SEC,
  clampStoryTextSize,
  cleanMediaMime,
  drawStoryTexts,
  estimateClipBytes,
  extractStoryThumbnails,
  formatStoryBytes,
  formatStoryTime,
  isUploadableMedia,
  needsStoryPrepare,
  storyFrameSize,
  probeVideoDuration,
  storyFont,
  storyRecorderMime,
  storyRecorderOptions,
  storyStrokeColor,
  storyTextsForExport,
  trimVideoFile,
  withCleanMime,
  type StoryTextOverlay,
} from '@/src/lib/storyVideo';
import { StoryTrimStrip, type TrimEdge } from '@/src/components/social/StoryTrimStrip';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import {
  FILE_INPUT_VISUAL,
  GALLERY_MEDIA_ACCEPT,
  GALLERY_PHOTOS_ACCEPT,
  applyCameraZoom,
  cameraZoomRange,
  getCameraStream,
  markCameraGranted,
  type CameraZoomRange,
  markGalleryReady,
  cameraBlockedHint,
  cameraFallbackHint,
  cameraNeedsUserGesture,
  cameraOsHint,
  cameraPromptExhausted,
  isSecureCameraContext,
  readCameraPermission,
} from '@/src/pwa/mediaAccess';
import { beginStoryUpload, isStoryUploading } from '@/src/lib/storyUpload';
import { cn } from '@/src/lib/utils';

interface StoryCameraProps {
  open: boolean;
  onClose: () => void;
  onPublished?: (post: FeedPost) => void;
  /** Perfil: solo foto. Chat: foto o vídeo y se entrega al hilo. */
  mode?: 'story' | 'avatar' | 'chat';
  onPickImage?: (file: File) => void;
}

const MIN_IMG = 72;
const MAX_IMG_MUL = 8;
const MAX_STORY_TEXTS = 8;
const TEXT_TAP_PX = 8;

type FrameXform = { x: number; y: number; w: number; h: number; rot: number; turns: number; tilt: number };
const EMPTY_FRAME: FrameXform = { x: 0, y: 0, w: 0, h: 0, rot: 0, turns: 0, tilt: 0 };

/** El número va a la izquierda de la x: 1x, 1.5x. */
function zoomLabel(z: number) {
  const shown = z < 10 ? Math.round(z * 10) / 10 : Math.round(z);
  const num = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
  return `${num}x`;
}

function frameAngle(f: FrameXform) {
  return ((f.turns % 4) + 4) % 4 * 90 + (f.tilt || 0);
}

function visOf(f: FrameXform) {
  return f.rot % 180 === 0 ? { visW: f.w, visH: f.h } : { visW: f.h, visH: f.w };
}

function fromVis(
  visW: number,
  visH: number,
  rot: number,
  x: number,
  y: number,
  turns: number,
  tilt = 0
): FrameXform {
  return rot % 180 === 0
    ? { x, y, w: visW, h: visH, rot, turns, tilt }
    : { x, y, w: visH, h: visW, rot, turns, tilt };
}

function coverXform(fw: number, fh: number, nw: number, nh: number, turns: number, tilt = 0): FrameXform {
  const rot = ((turns % 4) + 4) % 4 * 90;
  const swap = rot % 180 !== 0;
  const s = swap ? Math.max(fw / Math.max(1, nh), fh / Math.max(1, nw)) : Math.max(fw / Math.max(1, nw), fh / Math.max(1, nh));
  return { x: 0, y: 0, w: nw * s, h: nh * s, rot, turns, tilt };
}

function clampUniform(visW: number, visH: number, fw: number, fh: number) {
  const a = visW / Math.max(1, visH);
  const min = MIN_IMG;
  const max = Math.max(fw, fh) * MAX_IMG_MUL;
  let w = visW;
  let h = visH;
  if (w < min) {
    w = min;
    h = w / a;
  }
  if (h < min) {
    h = min;
    w = h * a;
  }
  if (w > max) {
    w = max;
    h = w / a;
  }
  if (h > max) {
    h = max;
    w = h * a;
  }
  return { visW: w, visH: h };
}

function frameDirty(f: FrameXform, fw: number, fh: number, nw: number, nh: number) {
  const base = coverXform(fw, fh, nw, nh, 0, 0);
  return (
    Math.abs(f.x) > 1.5 ||
    Math.abs(f.y) > 1.5 ||
    Math.abs(f.tilt || 0) > 0.8 ||
    ((f.turns % 4) + 4) % 4 !== 0 ||
    Math.abs(f.w - base.w) > 3 ||
    Math.abs(f.h - base.h) > 3
  );
}

function mediaLayerStyle(frame: FrameXform): React.CSSProperties {
  if (frame.w <= 0) {
    return {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'translate(-50%, -50%)',
    };
  }
  return {
    width: frame.w,
    height: frame.h,
    transform: `translate(-50%, -50%) translate(${frame.x}px, ${frame.y}px) rotate(${frameAngle(frame)}deg)`,
  };
}

/** Mismo tipo de letra y mismo borde que el canvas del publicado: lo que se ve es lo que sube. */
function storyTextStyle(size: number, fontId?: string | null, color?: string | null): React.CSSProperties {
  const face = storyFont(fontId);
  const fill = color || '#ffffff';
  return {
    fontFamily: face.family,
    fontWeight: face.weight,
    fontSize: size,
    lineHeight: STORY_TEXT_LINE,
    color: fill,
    WebkitTextStrokeWidth: Math.max(1, size * 0.055),
    WebkitTextStrokeColor: storyStrokeColor(fill),
    paintOrder: 'stroke fill',
  };
}

function newStoryTextId() {
  return `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Tamaño al crear el texto: cabe en el móvil, sin ocupar la historia. */
function storyTextStartPx(boxW: number, boxH: number) {
  const short = Math.min(boxW > 8 ? boxW : 390, boxH > 8 ? boxH : 700);
  return clampStoryTextSize(Math.round(short * 0.068));
}

/** Cada Aa se apila un poco más abajo para no tapar el anterior. */
function nextTextOrigin(existing: StoryTextOverlay[]) {
  const n = existing.length;
  return { x: (n % 3 - 1) * 16, y: Math.min(140, n * 36) };
}

function keepFile(file: File) {
  const type = cleanMediaMime(file.type) || 'image/jpeg';
  return new File([file], file.name || 'historia.jpg', { type, lastModified: file.lastModified });
}

export function StoryCamera({ open, onClose, onPublished, mode = 'story', onPickImage }: StoryCameraProps) {
  const avatarOnly = mode === 'avatar';
  const chatMode = mode === 'chat';
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zoomRef = useRef(1);
  const zoomRangeRef = useRef<CameraZoomRange | null>(null);
  const zoomLoopRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<number | null>(null);
  const micWait = useRef<Promise<void> | null>(null);
  const holdArmed = useRef(false);
  const ignoreCancelUntil = useRef(0);
  const galleryRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const wantLive = useRef(false);
  const startY = useRef<number | null>(null);
  const trimAbort = useRef({ cancelled: false });
  const previewUrlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const frameRef = useRef<FrameXform>(EMPTY_FRAME);
  const imgNatRef = useRef<{ w: number; h: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  /** Dos dedos: distancia, punto medio y encuadre de partida. Un dedo en táctil no mueve la foto. */
  const pinch = useRef<{
    dist: number;
    midX: number;
    midY: number;
    fx: number;
    fy: number;
    w: number;
    h: number;
    angle: number;
    tilt: number;
  } | null>(null);
  const pan = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  /** Cada texto lleva sus propios dedos: un dedo lo mueve, dos dedos mueven la foto. */
  const textPointers = useRef(new Map<number, { x: number; y: number }>());
  const textPan = useRef<{
    id: string;
    x: number;
    y: number;
    tx: number;
    ty: number;
    tw: number;
    th: number;
    moved: number;
  } | null>(null);
  const textPinch = useRef<{ dist: number; size: number; angle: number; rot: number } | null>(null);
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const gestureSurfaceRef = useRef<HTMLDivElement | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const textsRef = useRef<StoryTextOverlay[]>([]);
  const holdingRef = useRef<string | null>(null);
  const camGen = useRef(0);
  const trimRef = useRef({ start: 0, end: STORY_VIDEO_MAX_SEC });
  /** Dedo en la tira: la vista previa se queda quieta en el fotograma que se está eligiendo. */
  const scrubbing = useRef(false);

  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [camReady, setCamReady] = useState(false);
  const [zoomUi, setZoomUi] = useState(1);
  const [hwZoom, setHwZoom] = useState(false);
  const [camDenied, setCamDenied] = useState(false);
  /** Safari necesita que el getUserMedia salga de un toque: pedimos confirmación. */
  const [needTap, setNeedTap] = useState(false);
  /** Sin vista en vivo: se ofrece la cámara del móvil, que no pide permiso web. */
  const [chooser, setChooser] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  /** 'still' = ha vuelto de ajustes y el permiso sigue en No. */
  const [recheck, setRecheck] = useState<'idle' | 'still'>('idle');
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pull, setPull] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(STORY_VIDEO_MAX_SEC);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [probing, setProbing] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [audience, setAudience] = useState<Audience>('all');
  const [frame, setFrame] = useState<FrameXform>(EMPTY_FRAME);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const boxSizeRef = useRef({ w: 0, h: 0 });
  /** Vídeo sin volumen: se quita la pista de audio al subirlo. */
  const [muted, setMuted] = useState(false);
  const [texts, setTexts] = useState<StoryTextOverlay[]>([]);
  /** Distinto de null mientras se escribe: el teclado tapa la historia. */
  const [textDraft, setTextDraft] = useState<{ id: string; value: string; font: string; color: string } | null>(null);
  /** Texto pillado: la barra de audiencia se cambia por la papelera. */
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [binningId, setBinningId] = useState<string | null>(null);
  frameRef.current = frame;
  textsRef.current = texts;
  holdingRef.current = holdingId;
  fileRef.current = file;
  trimRef.current = { start: trimStart, end: trimEnd };

  const stopStream = useCallback(() => {
    camGen.current += 1;
    if (zoomLoopRef.current) cancelAnimationFrame(zoomLoopRef.current);
    zoomLoopRef.current = 0;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    zoomRangeRef.current = null;
    zoomRef.current = 1;
    setHwZoom(false);
    setZoomUi(1);
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamReady(false);
  }, []);

  const setZoomLevel = useCallback((n: number) => {
    const range = zoomRangeRef.current;
    const min = range?.min ?? 1;
    const max = range?.max ?? 3;
    const next = Math.min(max, Math.max(min, n));
    zoomRef.current = next;
    setZoomUi(next);
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !range) return;
    void applyCameraZoom(track, next).catch(() => undefined);
  }, []);

  const startStream = useCallback(async (mode: 'user' | 'environment') => {
    const gen = ++camGen.current;
    setNeedTap(false);
    setChooser(false);
    setShowHelp(false);
    setCamDenied(false);
    setCamReady(false);
    const stale = () => camGen.current !== gen;
    const drop = (stream: MediaStream) => stream.getTracks().forEach(t => t.stop());
    const waitVideo = async () => {
      for (let i = 0; i < 20 && !videoRef.current && !stale(); i++) {
        await new Promise(r => requestAnimationFrame(r));
      }
      return videoRef.current;
    };
    const attach = async (stream: MediaStream) => {
      if (stale() || !stream.getVideoTracks().some(t => t.readyState === 'live')) {
        drop(stream);
        return false;
      }
      if (streamRef.current && streamRef.current !== stream) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = stream;
      const video = await waitVideo();
      if (stale()) {
        drop(stream);
        if (streamRef.current === stream) streamRef.current = null;
        return false;
      }
      if (video) {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.srcObject = stream;
        try {
          if (video.readyState < 1) {
            await new Promise<void>(resolve => {
              const done = () => {
                video.removeEventListener('loadedmetadata', done);
                resolve();
              };
              video.addEventListener('loadedmetadata', done);
              window.setTimeout(done, 800);
            });
          }
          await video.play();
        } catch {
          await video.play().catch(() => undefined);
        }
      }
      if (stale()) {
        drop(stream);
        if (streamRef.current === stream) streamRef.current = null;
        return false;
      }
      markCameraGranted();
      const track = stream.getVideoTracks()[0];
      const range = track ? cameraZoomRange(track) : null;
      zoomRangeRef.current = range;
      setHwZoom(!!range);
      const widest = range?.min ?? 1;
      zoomRef.current = widest;
      setZoomUi(widest);
      if (track && range) void applyCameraZoom(track, widest).catch(() => undefined);
      setCamReady(true);
      setCamDenied(false);
      return true;
    };
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    try {
      if (stale()) return;
      if (await attach(await getCameraStream(mode))) return;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
      if (!stale()) {
        setCamDenied(denied);
        setChooser(true);
      }
      return;
    }
    if (!stale()) {
      setCamDenied(false);
      setChooser(true);
    }
  }, []);

  /**
   * Tras tocar los ajustes del sitio: releer el permiso y abrir solo si ya se puede.
   * Con el permiso en No, volver a llamar a getUserMedia no saca ningún diálogo y
   * cuenta como otro descarte, que es lo que acaba bloqueando el origen.
   */
  const recheckAndStart = useCallback(async () => {
    const state = await readCameraPermission();
    if (state === 'denied' || state === 'unsupported') {
      setRecheck('still');
      return;
    }
    setRecheck('idle');
    await startStream(facing);
  }, [facing, startStream]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open && avatarOnly) setFacing('user');
    if (open) setAudience('all');
  }, [open, avatarOnly]);

  useLayoutEffect(() => {
    if (!open || file || justPublished) {
      wantLive.current = false;
      setNeedTap(false);
      return;
    }
    wantLive.current = true;
    let cancelled = false;
    setNeedTap(false);
    setChooser(false);
    setShowHelp(false);
    setCamDenied(false);
    void readCameraPermission().then(state => {
      if (cancelled || !wantLive.current) return;
      if (state === 'granted') {
        void startStream(facing);
        return;
      }
      // Denegado o sin contexto seguro: nunca insistimos, damos la cámara del móvil.
      if (state === 'denied' || state === 'unsupported') {
        setCamDenied(state === 'denied');
        setChooser(true);
        return;
      }
      // Safari exige que getUserMedia salga de un toque; Chrome puede preguntar ya.
      // Si ya se han perdido dos avisos, no pedimos solos: el tercero lo bloquearía.
      if (cameraNeedsUserGesture() || cameraPromptExhausted()) setNeedTap(true);
      else void startStream(facing);
    });
    return () => {
      cancelled = true;
      wantLive.current = false;
      if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
      const id = camGen.current;
      window.setTimeout(() => {
        if (!wantLive.current && camGen.current === id) stopStream();
      }, 600);
    };
  }, [open, facing, startStream, stopStream, file, justPublished]);

  useEffect(() => {
    const el = videoRef.current;
    if (!open || !camReady || file || justPublished || !el) return;
    const gap = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    let pinch: { dist: number; zoom: number } | null = null;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: gap(e.touches), zoom: zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return;
      e.preventDefault();
      const ratio = gap(e.touches) / pinch.dist;
      setZoomLevel(pinch.zoom * ratio);
    };
    const onEnd = () => {
      pinch = null;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [open, camReady, file, justPublished, setZoomLevel]);

  const dropPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const holdPreview = useCallback((next: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(next);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    imgNatRef.current = null;
    setFrame(EMPTY_FRAME);
  }, []);

  const revivePreview = useCallback(() => {
    const current = fileRef.current;
    if (!current) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  useEffect(() => {
    if (open) return;
    setNeedTap(false);
    setChooser(false);
    setShowHelp(false);
    setRecheck('idle');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      if (fileRef.current) {
        revivePreview();
        return;
      }
      if (justPublished) return;
      // En la pantalla de opciones ya sabemos que la vista en vivo no va: no insistas.
      if (chooser || needTap) return;
      const live = streamRef.current?.getVideoTracks().some(t => t.readyState === 'live');
      if (!live) void startStream(facing);
      else if (videoRef.current && videoRef.current.paused) {
        void videoRef.current.play().catch(() => { void startStream(facing); });
      }
    };
    let hideTimer: number | null = null;
    const park = () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (!fileRef.current) stopStream();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hideTimer = window.setTimeout(park, 1200);
        return;
      }
      if (hideTimer != null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
      resume();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', resume);
    return () => {
      if (hideTimer != null) window.clearTimeout(hideTimer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', resume);
    };
  }, [open, facing, startStream, stopStream, justPublished, revivePreview, chooser, needTap]);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setError(null);
    setSaving(false);
    setRecording(false);
    setRecMs(0);
    setPull(0);
    setDuration(null);
    setTrimStart(0);
    setTrimEnd(STORY_VIDEO_MAX_SEC);
    setThumbs([]);
    setPlayhead(0);
    setProbing(false);
    setJustPublished(false);
    imgNatRef.current = null;
    setFrame(EMPTY_FRAME);
    setBoxSize({ w: 0, h: 0 });
    setMuted(false);
    setTexts([]);
    setTextDraft(null);
    setHoldingId(null);
    setOverTrash(false);
    setBinningId(null);
    dropPreviewUrl();
  }, [open, dropPreviewUrl]);

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const ms = Date.now() - t0;
      setRecMs(ms);
      if (ms >= STORY_VIDEO_MAX_SEC * 1000) {
        const rec = recorderRef.current;
        if (rec && rec.state !== 'inactive') {
          try { rec.stop(); } catch { /* ignore */ }
        }
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [recording]);

  /** Con sonido el navegador puede negar la reproducción: se cae a silencio para no congelar la vista. */
  const playPreview = useCallback((v: HTMLVideoElement) => {
    v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, []);

  /** El icono de volumen manda en la vista previa, así se oye lo que se va a subir. */
  useEffect(() => {
    const v = previewRef.current;
    if (!v || !file?.type.startsWith('video/')) return;
    v.muted = muted;
    if (v.paused && !scrubbing.current) playPreview(v);
  }, [muted, file, previewUrl, playPreview]);

  /**
   * El bucle de la vista previa lee el recorte de una ref: si dependiera de trimStart/trimEnd
   * se volvería a montar en cada movimiento del dedo y cada uno provocaba un `currentTime`
   * nuevo, que es lo que hacía que la tira fuese a tirones.
   */
  useEffect(() => {
    const v = previewRef.current;
    if (!v || !file?.type.startsWith('video/') || duration == null) return;
    const onTime = () => {
      if (scrubbing.current) return;
      setPlayhead(v.currentTime);
      const { start, end } = trimRef.current;
      if (v.currentTime >= Math.min(duration, end) - 0.04) v.currentTime = start;
    };
    const kick = () => {
      const { start, end } = trimRef.current;
      if (v.currentTime < start || v.currentTime >= Math.min(duration, end)) v.currentTime = start;
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadeddata', kick);
    kick();
    playPreview(v);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadeddata', kick);
    };
  }, [file, previewUrl, duration, playPreview]);

  useEffect(() => {
    if (!file?.type.startsWith('video/')) {
      setThumbs([]);
      return;
    }
    trimAbort.current.cancelled = false;
    const token = { cancelled: false };
    trimAbort.current = token;
    setThumbs([]);
    void extractStoryThumbnails(file, 14, token, (dataUrl, index) => {
      setThumbs(prev => {
        const next = prev.slice();
        next[index] = dataUrl;
        return next;
      });
    }).catch(() => {});
    return () => {
      token.cancelled = true;
    };
  }, [file]);

  useEscapeClose(open && !saving, () => {
    // Escribiendo, Escape solo cierra el teclado: no se pierde la historia.
    if (textDraft != null) {
      setTextDraft(null);
      return;
    }
    onClose();
  });

  const openGallery = () => {
    galleryRef.current?.click();
  };

  const openSystemCamera = () => {
    captureRef.current?.click();
  };

  /** Si cancela el selector, no reintentes la vista en vivo cuando ya sabemos que no va. */
  const afterPickerCancel = () => {
    if (fileRef.current || chooser || needTap) return;
    void startStream(facing);
  };

  const acceptFile = (selected: File | null) => {
    if (!selected) return;
    markGalleryReady();
    if (avatarOnly && !selected.type.startsWith('image/')) {
      setError('Para el perfil solo vale una foto.');
      return;
    }
    if (selected.size > STORY_SOURCE_MAX_BYTES) {
      setError('Ese archivo no se puede abrir aquí. Elige otro o un recorte más corto.');
      return;
    }
    setError(null);
    setJustPublished(false);
    setFrame(EMPTY_FRAME);
    setMuted(false);
    setTexts([]);
    setTextDraft(null);
    setHoldingId(null);
    setOverTrash(false);
    setBinningId(null);
    imgNatRef.current = null;
    const kept = keepFile(selected);
    if (!kept.type.startsWith('video/')) {
      setDuration(null);
      setFile(kept);
      holdPreview(kept);
      stopStream();
      return;
    }
    setProbing(true);
    void probeVideoDuration(kept)
      .then(d => {
        const len = Math.min(STORY_VIDEO_MAX_SEC, d);
        setDuration(d);
        setTrimStart(0);
        setTrimEnd(Math.max(STORY_VIDEO_MIN_SEC, len));
        setThumbs([]);
        setPlayhead(0);
        setFile(kept);
        holdPreview(kept);
        stopStream();
      })
      .catch(e => {
        setError(e?.message || 'No se ha podido leer el vídeo.');
      })
      .finally(() => setProbing(false));
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError('La cámara aún no está lista. Espera un segundo o pulsa para reintentar.');
      void startStream(facing);
      return;
    }
    const canvas = document.createElement('canvas');
    const z = zoomRangeRef.current ? 1 : Math.max(1, zoomRef.current);
    const sw = video.videoWidth / z;
    const sh = video.videoHeight / z;
    const sx = (video.videoWidth - sw) / 2;
    const sy = (video.videoHeight - sh) / 2;
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      acceptFile(new File([blob], 'historia.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  const ensureMic = () => {
    const stream = streamRef.current;
    if (!stream) {
      micWait.current = Promise.resolve();
      return micWait.current;
    }
    if (stream.getAudioTracks().some(t => t.readyState === 'live')) {
      micWait.current = Promise.resolve();
      return micWait.current;
    }
    micWait.current = navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then(mic => {
        if (streamRef.current !== stream) {
          mic.getTracks().forEach(t => t.stop());
          return;
        }
        mic.getAudioTracks().forEach(t => {
          if (!stream.getAudioTracks().some(x => x.id === t.id)) stream.addTrack(t);
        });
      })
      .catch(() => undefined);
    return micWait.current;
  };

  const startRecording = () => {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('Este móvil no puede grabar aquí. Elige un vídeo de la galería.');
      return;
    }
    const softwareZoom = !zoomRangeRef.current && zoomRef.current > 1.04 && video.videoWidth > 0;
    let recordStream = stream;
    if (softwareZoom && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const draw = () => {
          const z = Math.max(1, zoomRef.current);
          const sw = video.videoWidth / z;
          const sh = video.videoHeight / z;
          const sx = (video.videoWidth - sw) / 2;
          const sy = (video.videoHeight - sh) / 2;
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          zoomLoopRef.current = requestAnimationFrame(draw);
        };
        draw();
        try {
          const painted = canvas.captureStream(30);
          stream.getAudioTracks().forEach(t => {
            if (t.readyState === 'live') painted.addTrack(t);
          });
          recordStream = painted;
        } catch {
          if (zoomLoopRef.current) cancelAnimationFrame(zoomLoopRef.current);
          zoomLoopRef.current = 0;
          recordStream = stream;
        }
      }
    }
    const mime = storyRecorderMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(recordStream, storyRecorderOptions(mime));
    } catch {
      if (zoomLoopRef.current) cancelAnimationFrame(zoomLoopRef.current);
      zoomLoopRef.current = 0;
      if (recordStream === stream) {
        setError('No se ha podido grabar. Prueba de nuevo o elige un vídeo de la galería.');
        return;
      }
      try {
        rec = new MediaRecorder(stream, storyRecorderOptions(mime));
      } catch {
        setError('No se ha podido grabar. Prueba de nuevo o elige un vídeo de la galería.');
        return;
      }
    }
    chunksRef.current = [];
    rec.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      if (zoomLoopRef.current) cancelAnimationFrame(zoomLoopRef.current);
      zoomLoopRef.current = 0;
      const type = rec.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      acceptFile(withCleanMime(blob, `historia.${ext}`, `video/${ext}`));
      setRecording(false);
    };
    recorderRef.current = rec;
    try {
      rec.start();
    } catch {
      if (zoomLoopRef.current) cancelAnimationFrame(zoomLoopRef.current);
      zoomLoopRef.current = 0;
      setError('No se ha podido grabar. Prueba de nuevo o elige un vídeo de la galería.');
      return;
    }
    ignoreCancelUntil.current = Date.now() + 450;
    setRecording(true);
    setRecMs(0);
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    try { rec.stop(); } catch { /* ignore */ }
  };

  const onShutterDown = (e: React.PointerEvent) => {
    if (file || saving || justPublished) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* iOS antiguo */
    }
    if (avatarOnly) return;
    holdArmed.current = true;
    void ensureMic();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      if (!holdArmed.current) return;
      const ready = micWait.current ?? Promise.resolve();
      void Promise.race([ready, new Promise<void>(r => window.setTimeout(r, 140))]).then(() => {
        if (!holdArmed.current) return;
        startRecording();
      });
    }, 200);
  };

  const finishShutter = () => {
    if (avatarOnly) {
      takePhoto();
      return;
    }
    holdArmed.current = false;
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      takePhoto();
      return;
    }
    if (recording || recorderRef.current?.state === 'recording') stopRecording();
  };

  const onShutterUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    finishShutter();
  };

  const onShutterCancel = () => {
    if (Date.now() < ignoreCancelUntil.current) return;
    if (holdTimer.current != null) return;
    if (recording) return;
    holdArmed.current = false;
  };

  const discard = () => {
    if (saving) return;
    setFile(null);
    setError(null);
    setDuration(null);
    setThumbs([]);
    setJustPublished(false);
    imgNatRef.current = null;
    setFrame(EMPTY_FRAME);
    setMuted(false);
    setTexts([]);
    setTextDraft(null);
    setHoldingId(null);
    setOverTrash(false);
    setBinningId(null);
    dropPreviewUrl();
    void startStream(facing);
  };

  const clipLen = Math.max(0, trimEnd - trimStart);

  const onTrimDragStart = useCallback(() => {
    scrubbing.current = true;
    previewRef.current?.pause();
  }, []);

  /** Mientras se arrastra se busca el fotograma del asa, y solo si el vídeo no está ya buscando. */
  const onTrimChange = useCallback((start: number, end: number, edge: TrimEdge) => {
    setTrimStart(start);
    setTrimEnd(end);
    const v = previewRef.current;
    if (!v || !scrubbing.current) return;
    const at = edge === 'end' ? end : start;
    setPlayhead(at);
    if (!v.seeking && Math.abs(v.currentTime - at) > 0.05) v.currentTime = at;
  }, []);

  const onTrimCommit = useCallback((start: number) => {
    scrubbing.current = false;
    const v = previewRef.current;
    if (!v) return;
    v.currentTime = start;
    setPlayhead(start);
    playPreview(v);
  }, [playPreview]);

  const publish = async () => {
    if (!file || saving) return;
    if (!avatarOnly && !chatMode && isStoryUploading()) {
      setError('Espera a que termine de subirse la historia anterior.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (avatarOnly) {
        const framed = file.type.startsWith('image/') ? await exportFramedPhoto(file, true) : file;
        onPickImage?.(framed);
        onClose();
        return;
      }
      const source = file;
      const f = { ...frameRef.current };
      const box = frameBoxRef.current;
      const nat = imgNatRef.current;
      const fw = box?.clientWidth || boxSize.w || 1;
      const fh = box?.clientHeight || boxSize.h || 1;
      const moved = !!(nat && frameDirty(f, fw, fh, nat.w, nat.h));
      const overlays = storyTextsForExport(texts);
      const clip = { start: trimStart, len: clipLen, duration, muted, audience, isImage: source.type.startsWith('image/'), isVideo: source.type.startsWith('video/') };
      const prepare = async (signal: AbortSignal) => {
        let toSend = source;
        if (clip.isImage) {
          toSend = await exportFramedPhoto(source, false, { frame: f, texts: overlays, viewW: fw, viewH: fh });
        } else if (clip.isVideo && clip.duration != null) {
          if (
            moved ||
            clip.muted ||
            overlays.length > 0 ||
            !isUploadableMedia(source.type) ||
            needsStoryPrepare(source, clip.duration, clip.start, clip.len)
          ) {
            toSend = await trimVideoFile(source, clip.start, clip.start + clip.len, {
              rotationDeg: frameAngle(f),
              x: f.x,
              y: f.y,
              w: f.w,
              h: f.h,
              viewW: fw,
              viewH: fh,
              mute: clip.muted,
              texts: overlays,
              signal,
            });
          }
        }
        if (signal.aborted) throw new DOMException('La subida se ha cancelado.', 'AbortError');
        if (toSend.size > STORY_UPLOAD_MAX_BYTES) {
          throw new Error('Pesa más de lo que aguanta el servidor. Recorta a 1 min o menos.');
        }
        if (!isUploadableMedia(toSend.type)) {
          throw new Error('Ese formato no se puede subir. Elige el vídeo desde la galería y recórtalo aquí.');
        }
        return toSend;
      };
      if (chatMode) {
        const toSend = await prepare(new AbortController().signal);
        onPickImage?.(toSend);
        onClose();
        return;
      }
      const started = beginStoryUpload(async signal => {
        const toSend = await prepare(signal);
        const post = await publishMedia(toSend, { kind: 'story', audience: clip.audience, signal });
        onPublished?.(post);
      });
      if (!started) {
        setError('Espera a que termine de subirse la historia anterior.');
        return;
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se ha podido subir');
    } finally {
      setSaving(false);
    }
  };

  const onPreviewLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    imgNatRef.current = { w: nw, h: nh };
    if (frameRef.current.w > 0) return;
    const box = frameBoxRef.current;
    if (box && box.clientWidth > 2) {
      setFrame(coverXform(box.clientWidth, box.clientHeight, nw, nh, 0));
    }
  };

  const onVideoMeta = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (!v.videoWidth || !v.videoHeight) return;
    imgNatRef.current = { w: v.videoWidth, h: v.videoHeight };
    if (frameRef.current.w > 0) return;
    const box = frameBoxRef.current;
    if (box && box.clientWidth > 2) {
      setFrame(coverXform(box.clientWidth, box.clientHeight, v.videoWidth, v.videoHeight, 0));
    }
  };

  useEffect(() => {
    if (!file) return;
    const el = frameBoxRef.current;
    if (!el) return;
    const sync = () => {
      const fw = el.clientWidth;
      const fh = el.clientHeight;
      const prev = boxSizeRef.current;
      if (
        prev.w > 2 &&
        prev.h > 2 &&
        fw > 2 &&
        fh > 2 &&
        frameRef.current.w > 0 &&
        (Math.abs(fw - prev.w) > 1 || Math.abs(fh - prev.h) > 1)
      ) {
        const s = fw / prev.w;
        const f = frameRef.current;
        setFrame({ ...f, x: f.x * s, y: f.y * s, w: f.w * s, h: f.h * s });
        setTexts(
          textsRef.current.map(t => ({
            ...t,
            x: t.x * s,
            y: t.y * s,
            size: clampStoryTextSize(t.size * s),
          }))
        );
      } else if (imgNatRef.current && frameRef.current.w === 0 && fw > 2 && fh > 2) {
        setFrame(coverXform(fw, fh, imgNatRef.current.w, imgNatRef.current.h, frameRef.current.turns, frameRef.current.tilt));
      }
      boxSizeRef.current = { w: fw, h: fh };
      setBoxSize({ w: fw, h: fh });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [file, previewUrl]);

  /**
   * Chrome (Android) y WebKit (iPhone): el pellizco del navegador se come el gesto
   * si touchmove/gesturestart van en pasivo. touch-action:none no basta en Safari.
   */
  useEffect(() => {
    const el = gestureSurfaceRef.current;
    if (!el || !file) return;
    const stop = (ev: Event) => ev.preventDefault();
    el.addEventListener('touchmove', stop, { passive: false });
    el.addEventListener('gesturestart', stop);
    el.addEventListener('gesturechange', stop);
    return () => {
      el.removeEventListener('touchmove', stop);
      el.removeEventListener('gesturestart', stop);
      el.removeEventListener('gesturechange', stop);
    };
  }, [file, previewUrl]);

  const exportFramedPhoto = async (
    source: File,
    square: boolean,
    shot?: { frame: FrameXform; texts: StoryTextOverlay[]; viewW: number; viewH: number }
  ) => {
    const url = shot ? URL.createObjectURL(source) : (previewUrlRef.current || URL.createObjectURL(source));
    const img = new Image();
    img.src = url;
    await img.decode();
    const box = frameBoxRef.current;
    const vw = shot?.viewW || box?.clientWidth || (typeof window === 'undefined' ? 390 : window.innerWidth);
    const vh = shot?.viewH || box?.clientHeight || (typeof window === 'undefined' ? 844 : window.innerHeight);
    const framedOut = square
      ? { W: 1080, H: 1080, scale: 1080 / Math.max(1, Math.min(vw, vh)) }
      : storyFrameSize(vw, vh, 1920);
    const W = framedOut.W;
    const H = framedOut.H;
    const place = framedOut.scale;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return source;
    const cover = Math.max(W / img.width, H / img.height);
    ctx.filter = 'blur(48px)';
    ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, W, H);
    let { x, y, w, h, rot, turns, tilt } = shot?.frame || frameRef.current;
    if (w <= 0 || h <= 0) {
      const filled = coverXform(vw, vh, img.width, img.height, turns, tilt);
      x = filled.x;
      y = filled.y;
      w = filled.w;
      h = filled.h;
      rot = filled.rot;
      tilt = filled.tilt;
    }
    ctx.save();
    ctx.translate(W / 2 + x * place, H / 2 + y * place);
    ctx.rotate(((rot + (tilt || 0)) * Math.PI) / 180);
    ctx.drawImage(img, -(w * place) / 2, -(h * place) / 2, w * place, h * place);
    ctx.restore();
    if (!square) drawStoryTexts(ctx, shot?.texts || texts, W, H, vw, vh);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (shot || !previewUrlRef.current) URL.revokeObjectURL(url);
    if (!blob) return source;
    return new File([blob], square ? 'perfil.jpg' : 'historia.jpg', { type: 'image/jpeg' });
  };

  const beginMediaPinch = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const { visW, visH } = visOf(frameRef.current);
    pinch.current = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      fx: frameRef.current.x,
      fy: frameRef.current.y,
      w: visW || 1,
      h: visH || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      tilt: frameRef.current.tilt || 0,
    };
    pan.current = null;
  };

  const startTextPinch = (id: string) => {
    const pts = [...textPointers.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const live = textsRef.current.find(t => t.id === id);
    if (!live) return;
    textPinch.current = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      size: live.size,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      rot: live.rot,
    };
    textPan.current = null;
    setOverTrash(false);
  };

  const onFramePointerDown = (e: React.PointerEvent) => {
    if (saving) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Texto pulsado: el otro dedo cambia el tamaño del texto, no de la foto.
    const heldId = holdingRef.current;
    if (heldId) {
      textPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (textPointers.current.size >= 2) startTextPinch(heldId);
      return;
    }
    const type = e.pointerType || 'touch';
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type });
    if (pointers.current.size >= 2) {
      beginMediaPinch();
      return;
    }
    // Chrome: en táctil un dedo no desplaza la foto (eso es el texto). El ratón sí.
    pinch.current = null;
    if (type === 'touch') {
      pan.current = null;
      return;
    }
    pan.current = { x: e.clientX, y: e.clientY, fx: frame.x, fy: frame.y };
  };

  const onFramePointerMove = (e: React.PointerEvent) => {
    if (textPointers.current.has(e.pointerId) && !pointers.current.has(e.pointerId)) {
      onTextPointerMove(e);
      return;
    }
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      type: prev?.type || e.pointerType || 'touch',
    });
    const zoom = pinch.current;
    if (zoom && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = d / zoom.dist;
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) - zoom.angle) * (180 / Math.PI);
      const box = frameBoxRef.current;
      const fw = box?.clientWidth || boxSize.w || 1;
      const fh = box?.clientHeight || boxSize.h || 1;
      const next = clampUniform(zoom.w * ratio, zoom.h * ratio, fw, fh);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      setFrame(f =>
        fromVis(
          next.visW,
          next.visH,
          f.rot,
          zoom.fx + (midX - zoom.midX),
          zoom.fy + (midY - zoom.midY),
          f.turns,
          zoom.tilt + deg
        )
      );
      return;
    }
    const start = pan.current;
    if (!start || (prev?.type || e.pointerType) === 'touch') return;
    setFrame(f => ({
      ...f,
      x: start.fx + (e.clientX - start.x),
      y: start.fy + (e.clientY - start.y),
    }));
  };

  const onFramePointerUp = (e: React.PointerEvent) => {
    if (textPointers.current.has(e.pointerId) && !pointers.current.has(e.pointerId)) {
      onTextPointerUp(e);
      return;
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size >= 2) beginMediaPinch();
    else pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
    else if ([...pointers.current.values()].every(p => p.type === 'touch')) pan.current = null;
  };

  const patchText = (id: string, patch: Partial<StoryTextOverlay>) => {
    setTexts(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)));
  };

  const pointerOverTrash = (clientX: number, clientY: number) => {
    const el = trashRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const pad = 36;
    return clientX >= r.left - pad && clientX <= r.right + pad && clientY >= r.top - pad && clientY <= r.bottom + pad;
  };

  /** Fuera de la papelera el texto no se sale; hacia abajo se deja llegar a la papelera. */
  const clampText = (x: number, y: number, tw: number, th: number, towardTrash: boolean) => {
    const box = frameBoxRef.current;
    const bw = box?.clientWidth || boxSize.w || 0;
    const bh = box?.clientHeight || boxSize.h || 0;
    if (!bw || !bh) return { x, y };
    const lx = Math.max(16, (bw - tw) / 2 + tw * 0.28);
    const ly = Math.max(16, (bh - th) / 2 + th * 0.2);
    return {
      x: Math.max(-lx, Math.min(lx, x)),
      y: Math.max(-ly, Math.min(towardTrash ? ly + 220 : ly, y)),
    };
  };

  const dropTextInTrash = (id: string) => {
    textPointers.current.clear();
    textPan.current = null;
    textPinch.current = null;
    setOverTrash(true);
    setHoldingId(null);
    setBinningId(id);
    window.setTimeout(() => {
      setTexts(ts => ts.filter(t => t.id !== id));
      setBinningId(null);
      setOverTrash(false);
    }, 240);
  };

  const releaseTextHold = () => {
    textPointers.current.clear();
    textPan.current = null;
    textPinch.current = null;
    setHoldingId(null);
    setOverTrash(false);
  };

  /** Aa siempre abre un texto nuevo. Un toque en uno ya escrito lo edita. */
  const openTextEditor = (id?: string) => {
    if (saving) return;
    releaseTextHold();
    if (id) {
      const current = textsRef.current.find(t => t.id === id);
      if (!current) return;
      setTextDraft({ id, value: current.value, font: current.font || 'classic', color: current.color || '#ffffff' });
      return;
    }
    if (textsRef.current.length >= MAX_STORY_TEXTS) return;
    setTextDraft({ id: newStoryTextId(), value: '', font: 'classic', color: '#ffffff' });
  };

  const commitTextDraft = () => {
    if (!textDraft) return;
    const value = textDraft.value.replace(/\s+$/, '');
    const { id } = textDraft;
    setTextDraft(null);
    if (!value.trim()) {
      setTexts(ts => ts.filter(t => t.id !== id));
      return;
    }
    const base = boxSize.w || frameBoxRef.current?.clientWidth || 360;
    setTexts(ts => {
      const i = ts.findIndex(t => t.id === id);
      if (i >= 0) {
        const next = ts.slice();
        next[i] = { ...next[i], value, font: textDraft.font, color: textDraft.color };
        return next;
      }
      const origin = nextTextOrigin(ts);
      return [
        ...ts,
        {
          id,
          value,
          x: origin.x,
          y: origin.y,
          size: storyTextStartPx(base, boxSize.h || frameBoxRef.current?.clientHeight || 700),
          rot: 0,
          font: textDraft.font,
          color: textDraft.color,
        },
      ];
    });
  };

  /** Un dedo mueve el texto. Si sigue pulsado, el pellizco cambia su tamaño. */
  const onTextPointerDown = (e: React.PointerEvent, item: StoryTextOverlay) => {
    if (saving || binningId) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    textPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (textPointers.current.size === 1) {
      textPan.current = {
        id: item.id,
        x: e.clientX,
        y: e.clientY,
        tx: item.x,
        ty: item.y,
        tw: el.offsetWidth,
        th: el.offsetHeight,
        moved: 0,
      };
      textPinch.current = null;
      setHoldingId(item.id);
      setOverTrash(false);
      return;
    }
    if (textPointers.current.size >= 2) startTextPinch(item.id);
  };

  const onTextPointerMove = (e: React.PointerEvent) => {
    // El primer dedo quedó en el texto y el segundo en la foto: el encuadre manda.
    if (pointers.current.has(e.pointerId) && !textPointers.current.has(e.pointerId)) {
      onFramePointerMove(e);
      return;
    }
    if (!textPointers.current.has(e.pointerId)) return;
    e.stopPropagation();
    textPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const zoom = textPinch.current;
    const held = holdingRef.current;
    if (zoom && textPointers.current.size >= 2 && held) {
      const [a, b] = [...textPointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) - zoom.angle) * (180 / Math.PI);
      patchText(held, { size: clampStoryTextSize(zoom.size * (d / zoom.dist)), rot: zoom.rot + deg });
      return;
    }
    const start = textPan.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start.moved = Math.max(start.moved, Math.hypot(dx, dy));
    const trash = pointerOverTrash(e.clientX, e.clientY);
    setOverTrash(trash);
    const next = clampText(start.tx + dx, start.ty + dy, start.tw, start.th, true);
    patchText(start.id, { x: next.x, y: next.y });
  };

  const onTextPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pointers.current.has(e.pointerId) && !textPointers.current.has(e.pointerId)) {
      onFramePointerUp(e);
      return;
    }
    textPointers.current.delete(e.pointerId);
    if (textPointers.current.size < 2) textPinch.current = null;
    if (textPointers.current.size > 0) {
      const id = holdingRef.current;
      const live = id ? textsRef.current.find(t => t.id === id) : undefined;
      const [only] = [...textPointers.current.values()];
      if (id && live && only) {
        textPan.current = {
          id,
          x: only.x,
          y: only.y,
          tx: live.x,
          ty: live.y,
          tw: 0,
          th: 0,
          moved: TEXT_TAP_PX + 1,
        };
      }
      return;
    }
    const start = textPan.current;
    const id = start?.id || holdingRef.current;
    const tap = !!start && start.moved < TEXT_TAP_PX;
    const trash = pointerOverTrash(e.clientX, e.clientY);
    textPan.current = null;
    if (id && trash && !tap) {
      dropTextInTrash(id);
      return;
    }
    if (id && !tap) {
      const live = textsRef.current.find(t => t.id === id);
      if (live) {
        const snapped = clampText(live.x, live.y, start?.tw || 0, start?.th || 0, false);
        patchText(id, snapped);
      }
    }
    setHoldingId(null);
    setOverTrash(false);
    if (tap && id) openTextEditor(id);
  };

  const rotateMedia = () => {
    setFrame(f => {
      const turns = f.turns + 1;
      const box = frameBoxRef.current;
      const nat = imgNatRef.current;
      if (!box || !nat || box.clientWidth < 2) {
        return { ...f, turns, rot: ((turns % 4) + 4) % 4 * 90 };
      }
      return { ...coverXform(box.clientWidth, box.clientHeight, nat.w, nat.h, turns, f.tilt), x: f.x, y: f.y };
    });
  };

  const resetEdit = () => {
    if (duration != null) {
      const len = Math.min(STORY_VIDEO_MAX_SEC, duration);
      setTrimStart(0);
      setTrimEnd(Math.max(STORY_VIDEO_MIN_SEC, len));
    }
    const box = frameBoxRef.current;
    const nat = imgNatRef.current;
    if (box && nat && box.clientWidth > 2) {
      setFrame(coverXform(box.clientWidth, box.clientHeight, nat.w, nat.h, 0, 0));
      return;
    }
    setFrame(EMPTY_FRAME);
  };

  useEffect(() => {
    if (!file) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') revivePreview();
    };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(() => {
      const img = document.querySelector<HTMLImageElement>('[data-story-preview]');
      if (img && img.naturalWidth === 0) revivePreview();
    }, 8000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(id);
    };
  }, [file, revivePreview]);

  const isVideo = !!file?.type.startsWith('video/');
  const recSec = Math.min(STORY_VIDEO_MAX_SEC, Math.floor(recMs / 1000));
  const editTextSize = storyTextStartPx(boxSize.w, boxSize.h);
  const overlaysReady = storyTextsForExport(texts);
  /** Girar, silenciar o poner texto obliga a volver a codificar: el peso ya no es el del original. */
  const reencodes = Math.abs(frameAngle(frame)) > 0.8 || muted || overlaysReady.length > 0;
  const grabbingText = holdingId != null || binningId != null;
  const clipEstimate =
    isVideo && file && duration != null
      ? reencodes
        ? Math.round((STORY_VIDEO_BITRATE / 8) * Math.max(0.4, clipLen))
        : estimateClipBytes(file, duration, trimStart, clipLen)
      : 0;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
    {open && (
    <motion.div
      initial={SLIME_FULLSCREEN_IN}
      animate={SLIME_FULLSCREEN_SHOW}
      exit={SLIME_FULLSCREEN_OUT}
      transition={STICKY}
      className={cn(
        'fixed inset-0 z-[140000] origin-bottom overflow-hidden text-white',
        'bg-black'
      )}
      onTouchStart={e => {
        if (file || justPublished) return;
        startY.current = e.touches[0].clientY;
      }}
      onTouchMove={e => {
        if (file || justPublished || startY.current == null) return;
        const dy = startY.current - e.touches[0].clientY;
        setPull(Math.max(0, Math.min(120, dy)));
      }}
      onTouchEnd={() => {
        if (!file && !justPublished && pull > 70) openGallery();
        setPull(0);
        startY.current = null;
      }}
    >
      <input
        ref={galleryRef}
        type="file"
        accept={avatarOnly ? GALLERY_PHOTOS_ACCEPT : GALLERY_MEDIA_ACCEPT}
        className={FILE_INPUT_VISUAL}
        onChange={e => {
          const picked = e.target.files?.[0] ?? null;
          acceptFile(picked);
          e.target.value = '';
          if (!picked) afterPickerCancel();
        }}
      />
      <input
        ref={captureRef}
        type="file"
        accept={avatarOnly ? GALLERY_PHOTOS_ACCEPT : GALLERY_MEDIA_ACCEPT}
        capture={facing === 'user' ? 'user' : 'environment'}
        className={FILE_INPUT_VISUAL}
        onChange={e => {
          const picked = e.target.files?.[0] ?? null;
          acceptFile(picked);
          e.target.value = '';
          if (!picked) afterPickerCancel();
        }}
      />
      {!file && !justPublished && (
        <>
          <div className="absolute inset-0 overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              controls={false}
              disablePictureInPicture
              disableRemotePlayback
              className="h-full w-full object-cover object-center"
              style={{
                transform: hwZoom
                  ? facing === 'user' ? 'scaleX(-1)' : undefined
                  : facing === 'user'
                    ? `scaleX(-1) scale(${zoomUi})`
                    : `scale(${zoomUi})`,
              }}
            />
          </div>
          {camReady && (
            <div className="absolute right-3 top-1/2 z-20 -translate-y-1/2">
              <span className="rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white ring-1 ring-white/20">
                {zoomLabel(zoomUi)}
              </span>
            </div>
          )}
          {needTap && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
              <p className="text-lg font-bold text-white">
                {avatarOnly ? 'Tu foto de perfil' : chatMode ? 'Enviar foto o vídeo' : 'Tu historia'}
              </p>
              <p className="max-w-xs text-sm leading-relaxed text-white/70">
                {cameraPromptExhausted()
                  ? 'El aviso de permiso se ha cerrado ya dos veces. Si lo cierras otra vez sin darle a Permitir, el navegador dejará de preguntar durante una semana, así que solo se pide cuando tú lo digas.'
                  : 'Se abre aquí dentro, sin salir de la app. El móvil te pedirá permiso una sola vez.'}
              </p>
              <button
                type="button"
                onClick={() => void startStream(facing)}
                className="w-full max-w-xs rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900"
              >
                Abrir cámara aquí
              </button>
              <button
                type="button"
                onClick={openSystemCamera}
                className="text-sm font-semibold text-white/65 underline-offset-2 hover:underline"
              >
                Prefiero la app de Cámara del móvil
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="text-sm font-semibold text-white/65 underline-offset-2 hover:underline"
              >
                Elegir de la galería
              </button>
            </div>
          )}
          {chooser && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 px-8 text-center">
              <p className="text-lg font-bold text-white">
                {avatarOnly ? 'Tu foto de perfil' : chatMode ? 'Enviar foto o vídeo' : 'Tu historia'}
              </p>
              <p className="max-w-xs text-sm leading-relaxed text-white/70">
                {!isSecureCameraContext()
                  ? 'Aquí no se puede abrir la cámara dentro de la app. Se abrirá la app de Cámara del móvil y volverás con la foto.'
                  : 'Se abrirá la app de Cámara del móvil y volverás aquí con la foto para encuadrarla.'}
              </p>
              <button
                type="button"
                onClick={openSystemCamera}
                className="w-full max-w-xs rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900"
              >
                {avatarOnly ? 'Hacer una foto' : 'Abrir la app de Cámara'}
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="w-full max-w-xs rounded-full bg-white/15 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/30"
              >
                Elegir de la galería
              </button>
              {camDenied && isSecureCameraContext() && (
                <button
                  type="button"
                  onClick={() => setShowHelp(v => !v)}
                  className="mt-1 text-xs font-semibold text-white/55 underline-offset-2 hover:underline"
                >
                  Quiero la cámara dentro de la app
                </button>
              )}
              {showHelp && (
                <div className="max-w-xs space-y-2.5">
                  <p className="text-xs leading-relaxed text-white/60">{cameraBlockedHint()}</p>
                  {cameraFallbackHint() && (
                    <p className="text-xs leading-relaxed text-white/50">{cameraFallbackHint()}</p>
                  )}
                  {cameraOsHint() && (
                    <p className="text-xs leading-relaxed text-white/50">{cameraOsHint()}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void recheckAndStart()}
                    className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/30"
                  >
                    {recheck === 'still' ? 'Sigue bloqueada, comprobar otra vez' : 'Ya está, comprobar'}
                  </button>
                </div>
              )}
            </div>
          )}
          {!needTap && !chooser && !camReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-white/50" />
            </div>
          )}
        </>
      )}

      {file && previewUrl && (
          <div
            ref={gestureSurfaceRef}
            className="absolute inset-0 touch-none overscroll-none bg-black"
            style={{ touchAction: 'none' }}
            onPointerDown={onFramePointerDown}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerUp}
            onPointerCancel={onFramePointerUp}
            onWheel={e => {
              e.preventDefault();
              const box = frameBoxRef.current;
              const fw = box?.clientWidth || boxSize.w || 1;
              const fh = box?.clientHeight || boxSize.h || 1;
              const ratio = e.deltaY > 0 ? 0.94 : 1.06;
              const { visW, visH } = visOf(frame);
              const next = clampUniform(visW * ratio, visH * ratio, fw, fh);
              setFrame(fromVis(next.visW, next.visH, frame.rot, frame.x, frame.y, frame.turns, frame.tilt));
            }}
          >
            {!avatarOnly && !isVideo && (
              <img
                src={previewUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-[0.28] blur-[80px]"
              />
            )}
            <div
              className={cn(
                'absolute overflow-hidden',
                avatarOnly
                  ? 'left-1/2 top-1/2 aspect-square w-[min(78vw,70dvh,20rem)] max-h-[min(78vw,70dvh,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/85 ring-offset-2 ring-offset-black/30'
                  : 'inset-0'
              )}
            >
              <div ref={frameBoxRef} className="absolute inset-0">
                {isVideo ? (
                  <video
                    ref={previewRef}
                    src={previewUrl}
                    playsInline
                    onLoadedMetadata={onVideoMeta}
                    onError={revivePreview}
                    className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                    style={mediaLayerStyle(frame)}
                  />
                ) : (
                  <img
                    data-story-preview
                    src={previewUrl}
                    alt=""
                    draggable={false}
                    onLoad={onPreviewLoad}
                    onError={revivePreview}
                    className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                    style={mediaLayerStyle(frame)}
                  />
                )}
                {texts.map((item, i) => {
                  if (textDraft?.id === item.id) return null;
                  const held = holdingId === item.id;
                  const binning = binningId === item.id;
                  const shrink = (held && overTrash) || binning;
                  return (
                    <div
                      key={item.id}
                      onPointerDown={e => onTextPointerDown(e, item)}
                      onPointerMove={onTextPointerMove}
                      onPointerUp={onTextPointerUp}
                      onPointerCancel={onTextPointerUp}
                      onWheel={e => {
                        e.stopPropagation();
                        e.preventDefault();
                        const ratio = e.deltaY > 0 ? 0.94 : 1.06;
                        patchText(item.id, { size: clampStoryTextSize(item.size * ratio) });
                      }}
                      className="absolute left-1/2 top-1/2 w-max cursor-grab touch-none select-none px-4 py-3"
                      style={{
                        pointerEvents: holdingId && !held ? 'none' : undefined,
                        zIndex: binning ? 40 : held ? 30 : 10 + i,
                        transform: `translate(-50%, -50%) translate(${item.x}px, ${item.y}px) rotate(${item.rot}deg) scale(${binning ? 0.08 : held && overTrash ? 0.42 : 1})`,
                        outline: held && !shrink ? '2px solid rgba(255,255,255,0.92)' : undefined,
                        outlineOffset: 6,
                        borderRadius: 10,
                        opacity: binning ? 0 : 1,
                        transition: shrink
                          ? 'transform 180ms ease, opacity 180ms ease'
                          : undefined,
                      }}
                    >
                      <p
                        className="whitespace-pre-wrap break-words text-center"
                        style={{
                          ...storyTextStyle(item.size, item.font, item.color),
                          maxWidth: boxSize.w ? boxSize.w * STORY_TEXT_MAX_W : `${STORY_TEXT_MAX_W * 100}%`,
                        }}
                      >
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
      )}

      {textDraft != null && (
        <div className="absolute inset-0 z-40 flex flex-col bg-gradient-to-b from-black/55 via-black/35 to-black/70">
          <div className="flex items-center justify-between px-3 pt-[max(10px,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => setTextDraft(null)}
              className="rounded-full px-3 py-2 text-[15px] font-semibold text-white/90"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={commitTextDraft}
              className="rounded-full bg-white px-5 py-2 text-[15px] font-semibold text-slate-900 shadow-lg shadow-black/20"
            >
              Listo
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center px-5 pr-16">
            <textarea
              autoFocus
              rows={3}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="sentences"
              value={textDraft.value}
              onChange={e => setTextDraft(d => (d ? { ...d, value: e.target.value.slice(0, 220) } : d))}
              placeholder="Escribe algo"
              className="w-full resize-none bg-transparent text-center outline-none placeholder:text-white/40"
              style={{
                ...storyTextStyle(editTextSize, textDraft.font, textDraft.color),
                caretColor: textDraft.color,
                WebkitTextStrokeWidth: 0,
                textShadow: '0 2px 18px rgba(0,0,0,0.65)',
                maxWidth: boxSize.w ? boxSize.w * STORY_TEXT_MAX_W : undefined,
              }}
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 rounded-full bg-black/40 px-1.5 py-3 shadow-lg shadow-black/30 backdrop-blur-md">
              {STORY_TEXT_COLORS.map(color => {
                const on = textDraft.color.toLowerCase() === color;
                return (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Color ${color}`}
                    aria-pressed={on}
                    onClick={() => setTextDraft(d => (d ? { ...d, color } : d))}
                    className="h-6 w-6 shrink-0 rounded-full transition-transform"
                    style={{
                      background: color,
                      transform: on ? 'scale(1.18)' : undefined,
                      boxShadow: on
                        ? '0 0 0 2px #fff'
                        : color === '#ffffff' || color === '#000000'
                          ? 'inset 0 0 0 1px rgba(255,255,255,0.55)'
                          : 'inset 0 0 0 1px rgba(0,0,0,0.15)',
                    }}
                  />
                );
              })}
            </div>
          </div>
          <div className="px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="flex gap-1.5 overflow-x-auto rounded-full bg-black/45 p-1.5 shadow-lg shadow-black/25 backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {STORY_FONTS.map(face => {
                const on = textDraft.font === face.id;
                return (
                  <button
                    key={face.id}
                    type="button"
                    onClick={() => setTextDraft(d => (d ? { ...d, font: face.id } : d))}
                    className={
                      on
                        ? 'shrink-0 rounded-full bg-white px-4 py-2 text-[16px] leading-none text-slate-900'
                        : 'shrink-0 rounded-full px-4 py-2 text-[16px] leading-none text-white/90'
                    }
                    style={{ fontFamily: face.family, fontWeight: face.weight }}
                  >
                    {face.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          'absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))]',
          (textDraft != null || grabbingText) && 'hidden'
        )}
      >
        <button
          type="button"
          onClick={() => (file ? discard() : onClose())}
          className="app-icon-hit rounded-full bg-black/35"
          aria-label={file ? 'Descartar' : 'Cerrar'}
        >
          <X size={20} />
        </button>
        {recording && (
          <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold tabular-nums">
            {recSec} / {STORY_VIDEO_MAX_SEC} s
          </span>
        )}
        {isVideo && duration != null && !recording && (
          <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold tabular-nums">
            {formatStoryTime(trimStart)}–{formatStoryTime(trimEnd)} · {Math.round(clipLen)} s
          </span>
        )}
        {!file && !justPublished && !chooser && !needTap && (
          <button
            type="button"
            onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
            className="app-icon-hit rounded-full bg-black/35"
            aria-label="Cambiar cámara"
          >
            <RefreshCw size={18} />
          </button>
        )}
        {file && !avatarOnly && (
          <div className="flex items-center gap-2">
            {isVideo && (
              <button
                type="button"
                onClick={() => setMuted(m => !m)}
                className={cn(
                  'app-icon-hit rounded-full',
                  muted ? 'bg-white text-slate-900' : 'bg-black/35'
                )}
                aria-label={muted ? 'Subirla con sonido' : 'Subirla sin sonido'}
                aria-pressed={muted}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => openTextEditor()}
              className="app-icon-hit rounded-full bg-black/35"
              aria-label="Añadir texto"
            >
              <span className="text-[15px] font-black leading-none tracking-tight">Aa</span>
            </button>
          </div>
        )}
      </div>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-30 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-8',
          (textDraft != null || grabbingText) && 'hidden'
        )}
        style={{ transform: pull ? `translateY(${-pull * 0.35}px)` : undefined }}
      >
        {file ? (
          <div className="space-y-3">
            {isVideo && duration != null && (
              <StoryTrimStrip
                duration={duration}
                start={trimStart}
                end={trimEnd}
                thumbs={thumbs}
                playhead={playhead}
                sizeLabel={formatStoryBytes(clipEstimate)}
                onChange={onTrimChange}
                onDragStart={onTrimDragStart}
                onCommit={onTrimCommit}
              />
            )}
            {!avatarOnly && !chatMode && (
              <AudienceToggle value={audience} onChange={setAudience} tone="dark" />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={rotateMedia}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/35 backdrop-blur-md ring-1 ring-white/15"
                aria-label="Girar"
              >
                <RotateCw size={18} />
              </button>
              <button
                type="button"
                onClick={resetEdit}
                className="rounded-full bg-black/35 px-3 py-2 text-[12px] font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur-md"
              >
                Restablecer
              </button>
              <button
                type="button"
                disabled={saving || probing}
                onClick={() => void publish()}
                className="ml-auto flex items-center gap-2.5 rounded-full bg-white py-2 pl-2 pr-4 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600 text-[11px] font-bold text-white">
                  {saving || probing ? <Loader2 size={16} className="animate-spin" /> : 'Yo'}
                </span>
                {saving
                  ? isVideo && duration != null && (reencodes || needsStoryPrepare(file, duration, trimStart, clipLen))
                    ? 'Recortando…'
                    : 'Subiendo…'
                  : avatarOnly
                    ? 'Mi foto'
                    : chatMode
                      ? 'Enviar'
                      : 'Tu historia'}
              </button>
            </div>
          </div>
        ) : chooser || needTap ? null : (
          <div className="flex items-end justify-between">
            <button
              type="button"
              onClick={openGallery}
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border-2 border-white/80 bg-white/10"
              aria-label="Galería"
            >
              <ImageIcon size={20} />
            </button>
            <button
              type="button"
              onPointerDown={onShutterDown}
              onPointerUp={onShutterUp}
              onPointerCancel={onShutterCancel}
              onTouchStart={e => e.stopPropagation()}
              onContextMenu={e => e.preventDefault()}
              className={cn(
                'relative mb-1 h-[72px] w-[72px] touch-none select-none rounded-full border-[4px] border-white bg-white/25',
                recording && 'scale-110 border-rose-500 bg-rose-500/30'
              )}
              style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
              aria-label={avatarOnly ? 'Hacer foto' : 'Toca foto · mantén pulsado para vídeo'}
            >
              {recording && (
                <span
                  className="absolute inset-[-6px] rounded-full border-2 border-rose-400"
                  style={{
                    clipPath: `inset(0 ${100 - (recMs / (STORY_VIDEO_MAX_SEC * 1000)) * 100}% 0 0)`,
                  }}
                />
              )}
            </button>
            <span className="w-12" />
          </div>
        )}
        {!file && !justPublished && !chooser && !needTap && (
          <p className="mt-3 text-center text-[11px] text-white/55">
            {avatarOnly
              ? 'Pellizca para el zoom · luego la encuadras en círculo'
              : chatMode
                ? 'Pellizca para el zoom · toca para foto · mantén para vídeo'
                : 'Pellizca para el zoom · toca para foto · mantén para vídeo · 1 min'}
          </p>
        )}
        {file && !justPublished && (
          <p className="mt-3 text-center text-[11px] text-white/50">
            {isVideo
              ? 'Un dedo en el texto lo mueve · dos en la foto mueven la foto · suéltalo en la papelera para quitarlo'
              : 'Un dedo en el texto lo mueve · dos en la foto mueven la foto · suéltalo en la papelera para quitarlo'}
          </p>
        )}
        {error && <p className="mt-2 text-center text-xs font-semibold text-rose-300">{error}</p>}
      </div>

      {grabbingText && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center pb-[max(28px,env(safe-area-inset-bottom))] pt-10">
          <div
            ref={trashRef}
            className={cn(
              'flex items-center justify-center rounded-full text-white transition-all duration-150',
              overTrash || binningId
                ? 'h-16 w-16 scale-125 bg-rose-500 shadow-[0_0_0_8px_rgba(244,63,94,0.28)]'
                : 'h-14 w-14 bg-black/55 ring-1 ring-white/30'
            )}
          >
            <Trash2 size={overTrash || binningId ? 26 : 22} />
          </div>
        </div>
      )}
    </motion.div>
    )}
    </AnimatePresence>,
    document.body
  );
}
