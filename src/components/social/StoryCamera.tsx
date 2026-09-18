import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Image as ImageIcon, Loader2, RefreshCw, RotateCw, X } from 'lucide-react';
import { SLIME_FULLSCREEN_IN, SLIME_FULLSCREEN_OUT, SLIME_FULLSCREEN_SHOW, STICKY } from '@/src/lib/motionPresets';
import { publishMedia, type FeedPost } from '@/src/lib/feedApi';
import {
  STORY_SOURCE_MAX_BYTES,
  STORY_UPLOAD_MAX_BYTES,
  STORY_VIDEO_BITRATE,
  STORY_VIDEO_MAX_SEC,
  STORY_VIDEO_MIN_SEC,
  estimateClipBytes,
  extractStoryThumbnails,
  formatStoryBytes,
  formatStoryTime,
  needsStoryPrepare,
  probeVideoDuration,
  trimVideoFile,
} from '@/src/lib/storyVideo';
import { StoryTrimStrip } from '@/src/components/social/StoryTrimStrip';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import {
  consumePrimedStoryCamera,
  FILE_INPUT_VISUAL,
  GALLERY_MEDIA_ACCEPT,
  GALLERY_PHOTOS_ACCEPT,
  markCameraGranted,
  markGalleryReady,
  queryCameraPermission,
} from '@/src/pwa/mediaAccess';
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

type FrameXform = { x: number; y: number; w: number; h: number; rot: number; turns: number; tilt: number };
const EMPTY_FRAME: FrameXform = { x: 0, y: 0, w: 0, h: 0, rot: 0, turns: 0, tilt: 0 };

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

function keepFile(file: File) {
  return new File([file], file.name || 'historia.jpg', { type: file.type || 'image/jpeg', lastModified: file.lastModified });
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const type of ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

export function StoryCamera({ open, onClose, onPublished, mode = 'story', onPickImage }: StoryCameraProps) {
  const avatarOnly = mode === 'avatar';
  const chatMode = mode === 'chat';
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<number | null>(null);
  const micWait = useRef<Promise<void> | null>(null);
  const holdArmed = useRef(false);
  const ignoreCancelUntil = useRef(0);
  const galleryRef = useRef<HTMLInputElement>(null);
  const startY = useRef<number | null>(null);
  const trimAbort = useRef({ cancelled: false });
  const previewUrlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const frameRef = useRef<FrameXform>(EMPTY_FRAME);
  const imgNatRef = useRef<{ w: number; h: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; w: number; h: number; angle: number; tilt: number } | null>(null);
  const pan = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const camGen = useRef(0);

  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState(false);
  const [camDenied, setCamDenied] = useState(false);
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
  const [sessionCount, setSessionCount] = useState(0);
  const [justPublished, setJustPublished] = useState(false);
  const [frame, setFrame] = useState<FrameXform>(EMPTY_FRAME);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  frameRef.current = frame;
  fileRef.current = file;

  const stopStream = useCallback(() => {
    camGen.current += 1;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamReady(false);
  }, []);

  const startStream = useCallback(async (mode: 'user' | 'environment', fromGesture = false) => {
    const gen = ++camGen.current;
    setCamError(false);
    setCamDenied(false);
    setCamReady(false);
    const stale = () => camGen.current !== gen;
    const drop = (stream: MediaStream) => stream.getTracks().forEach(t => t.stop());
    const attach = async (stream: MediaStream) => {
      if (stale()) {
        drop(stream);
        return false;
      }
      if (streamRef.current && streamRef.current !== stream) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = stream;
      if (!videoRef.current) await new Promise(r => requestAnimationFrame(r));
      if (stale()) {
        drop(stream);
        if (streamRef.current === stream) streamRef.current = null;
        return false;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        await video.play().catch(() => {});
      }
      if (stale()) {
        drop(stream);
        if (streamRef.current === stream) streamRef.current = null;
        return false;
      }
      markCameraGranted();
      setCamReady(true);
      setCamError(false);
      setCamDenied(false);
      return true;
    };
    const primed = consumePrimedStoryCamera();
    if (primed) {
      if (await attach(primed)) return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if (!stale()) setCamError(true);
      return;
    }
    if (!fromGesture) {
      const perm = await queryCameraPermission();
      if (stale()) return;
      if (perm !== 'granted') {
        setCamDenied(false);
        setCamError(true);
        return;
      }
    }
    const tries: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: mode } }, audio: false },
      { video: { facingMode: mode }, audio: false },
      { video: true, audio: false },
    ];
    let denied = false;
    for (const cons of tries) {
      try {
        if (stale()) return;
        if (await attach(await navigator.mediaDevices.getUserMedia(cons))) return;
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') denied = true;
      }
    }
    if (!stale()) {
      setCamDenied(denied && fromGesture);
      setCamError(true);
    }
  }, []);

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
  }, [open, avatarOnly]);

  useEffect(() => {
    if (!open || file || justPublished) return;
    void startStream(facing);
    return () => {
      if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
      const id = camGen.current;
      window.setTimeout(() => {
        if (camGen.current === id) stopStream();
      }, 160);
    };
  }, [open, facing, startStream, stopStream, file, justPublished]);

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
    if (!open) return;
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      if (fileRef.current) {
        revivePreview();
        return;
      }
      if (justPublished) return;
      const live = streamRef.current?.getVideoTracks().some(t => t.readyState === 'live');
      if (!live) void startStream(facing);
      else if (videoRef.current && videoRef.current.paused) {
        void videoRef.current.play().catch(() => { void startStream(facing); });
      }
    };
    const park = () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (!fileRef.current) stopStream();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') park();
      else resume();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pagehide', park);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pagehide', park);
    };
  }, [open, facing, startStream, stopStream, justPublished, revivePreview]);

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
    setSessionCount(0);
    setJustPublished(false);
    imgNatRef.current = null;
    setFrame(EMPTY_FRAME);
    setBoxSize({ w: 0, h: 0 });
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

  useEffect(() => {
    const v = previewRef.current;
    if (!v || !file?.type.startsWith('video/') || duration == null) return;
    const end = Math.min(duration, trimEnd);
    const onTime = () => {
      setPlayhead(v.currentTime);
      if (v.currentTime >= end - 0.04) {
        v.currentTime = trimStart;
      }
    };
    const kick = () => {
      if (v.currentTime < trimStart || v.currentTime >= end) v.currentTime = trimStart;
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadeddata', kick);
    kick();
    void v.play().catch(() => {});
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadeddata', kick);
    };
  }, [file, previewUrl, trimStart, trimEnd, duration]);

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

  useEscapeClose(open && !saving, onClose);

  const openGallery = () => {
    galleryRef.current?.click();
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
      void startStream(facing, true);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
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
    if (!stream) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('Este móvil no puede grabar aquí. Elige un vídeo de la galería.');
      return;
    }
    const mime = pickRecorderMime();
    const rec = mime
      ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: STORY_VIDEO_BITRATE })
      : new MediaRecorder(stream, { videoBitsPerSecond: STORY_VIDEO_BITRATE });
    chunksRef.current = [];
    rec.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      acceptFile(new File([blob], `historia.${ext}`, { type }));
      setRecording(false);
    };
    recorderRef.current = rec;
    try {
      rec.start();
    } catch {
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
    dropPreviewUrl();
    void startStream(facing, true);
  };

  const clipLen = Math.max(0, trimEnd - trimStart);

  const onTrimChange = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
  };

  const publish = async () => {
    if (!file || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (avatarOnly) {
        const framed = file.type.startsWith('image/') ? await exportFramedPhoto(file, true) : file;
        onPickImage?.(framed);
        onClose();
        return;
      }
      let toSend = file;
      if (file.type.startsWith('image/')) {
        toSend = await exportFramedPhoto(file, false);
      } else if (file.type.startsWith('video/') && duration != null) {
        const f = frameRef.current;
        const box = frameBoxRef.current;
        const nat = imgNatRef.current;
        const fw = box?.clientWidth || boxSize.w || 1;
        const fh = box?.clientHeight || boxSize.h || 1;
        const moved = !!(nat && frameDirty(f, fw, fh, nat.w, nat.h));
        if (moved || needsStoryPrepare(file, duration, trimStart, clipLen)) {
          toSend = await trimVideoFile(file, trimStart, trimStart + clipLen, {
            rotationDeg: frameAngle(f),
            x: f.x,
            y: f.y,
            w: f.w,
            h: f.h,
            viewW: fw,
            viewH: fh,
          });
        }
      }
      if (toSend.size > STORY_UPLOAD_MAX_BYTES) {
        throw new Error('Pesa más de lo que aguanta el servidor. Recorta a 1 min o menos.');
      }
      if (chatMode) {
        onPickImage?.(toSend);
        onClose();
        return;
      }
      const post = await publishMedia(toSend, { kind: 'story' });
      onPublished?.(post);
      setSessionCount(n => n + 1);
      setJustPublished(true);
      setFile(null);
      setDuration(null);
      dropPreviewUrl();
    } catch (e: any) {
      setError(e?.message || 'No se ha podido subir');
    } finally {
      setSaving(false);
    }
  };

  const addAnother = () => {
    setJustPublished(false);
    setFile(null);
    setError(null);
    setDuration(null);
    imgNatRef.current = null;
    setFrame(EMPTY_FRAME);
    dropPreviewUrl();
    void startStream(facing, true);
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
      setBoxSize({ w: fw, h: fh });
      if (imgNatRef.current && frameRef.current.w === 0 && fw > 2 && fh > 2) {
        setFrame(coverXform(fw, fh, imgNatRef.current.w, imgNatRef.current.h, frameRef.current.turns, frameRef.current.tilt));
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [file, previewUrl]);

  const exportFramedPhoto = async (source: File, square: boolean) => {
    const url = previewUrlRef.current || URL.createObjectURL(source);
    const img = new Image();
    img.src = url;
    await img.decode();
    const box = frameBoxRef.current;
    const vw = box?.clientWidth || (typeof window === 'undefined' ? 390 : window.innerWidth);
    const vh = box?.clientHeight || (typeof window === 'undefined' ? 844 : window.innerHeight);
    const W = 1080;
    const H = square ? 1080 : 1920;
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
    let { x, y, w, h, rot, turns, tilt } = frameRef.current;
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
    ctx.translate(W / 2 + x * (W / vw), H / 2 + y * (H / vh));
    ctx.rotate(((rot + (tilt || 0)) * Math.PI) / 180);
    ctx.drawImage(img, -(w * W / vw) / 2, -(h * H / vh) / 2, w * (W / vw), h * (H / vh));
    ctx.restore();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!previewUrlRef.current) URL.revokeObjectURL(url);
    if (!blob) return source;
    return new File([blob], square ? 'perfil.jpg' : 'historia.jpg', { type: 'image/jpeg' });
  };

  const onFramePointerDown = (e: React.PointerEvent) => {
    if (saving) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, fx: frame.x, fy: frame.y };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const { visW, visH } = visOf(frame);
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        w: visW || 1,
        h: visH || 1,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        tilt: frame.tilt || 0,
      };
      pan.current = null;
    }
  };

  const onFramePointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = d / Math.max(1, pinch.current.dist);
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) - pinch.current.angle) * (180 / Math.PI);
      const tilt = pinch.current.tilt + deg;
      const box = frameBoxRef.current;
      const fw = box?.clientWidth || boxSize.w || 1;
      const fh = box?.clientHeight || boxSize.h || 1;
      const next = clampUniform(pinch.current.w * ratio, pinch.current.h * ratio, fw, fh);
      setFrame(f => fromVis(next.visW, next.visH, f.rot, f.x, f.y, f.turns, tilt));
      return;
    }
    const start = pan.current;
    if (!start) return;
    setFrame(f => ({
      ...f,
      x: start.fx + (e.clientX - start.x),
      y: start.fy + (e.clientY - start.y),
    }));
  };

  const onFramePointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
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
  const clipEstimate =
    isVideo && file && duration != null
      ? Math.abs(frameAngle(frame)) > 0.8
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
          if (!picked && !fileRef.current) void startStream(facing);
        }}
      />
      {!file && !justPublished && (
        <>
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={cn(
              'absolute inset-0 h-full w-full object-cover',
              facing === 'user' && 'scale-x-[-1]'
            )}
          />
          {!camReady && !camError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-white/50" />
            </div>
          )}
          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-sm font-semibold text-white/80">
                {camDenied
                  ? 'La cámara está bloqueada. Actívala en los ajustes del sitio (candado o «Sitio») y pulsa de nuevo.'
                  : 'Necesitamos la cámara. Pulsa Permitir cuando te lo pida el móvil.'}
              </p>
              <button
                type="button"
                onClick={() => void startStream(facing, true)}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                {camDenied ? 'Reintentar' : 'Permitir cámara'}
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30"
              >
                Elegir de la galería
              </button>
            </div>
          )}
        </>
      )}

      {file && previewUrl && (
          <div
            className="absolute inset-0 touch-none bg-black"
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
                  ? 'left-1/2 top-1/2 aspect-square w-[min(78vw,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/85 ring-offset-2 ring-offset-black/30'
                  : 'inset-0'
              )}
            >
              <div ref={frameBoxRef} className="absolute inset-0">
                {isVideo ? (
                  <video
                    ref={previewRef}
                    src={previewUrl}
                    muted
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
              </div>
            </div>
          </div>
      )}

      {justPublished && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 px-8 text-center">
          <p className="text-lg font-black">Historia subida</p>
          <p className="text-sm text-white/65">
            {sessionCount > 1
              ? `Llevas ${sessionCount} hoy. Cada una es un tramo de hasta 1 min y se borra a las 24 h.`
              : `Se borra en 24 h. Puedes añadir otra: el + de tu círculo o aquí.`}
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))]">
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
        {!file && !justPublished && (
          <button
            type="button"
            onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
            className="app-icon-hit rounded-full bg-black/35"
            aria-label="Cambiar cámara"
          >
            <RefreshCw size={18} />
          </button>
        )}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-30 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-8"
        style={{ transform: pull ? `translateY(${-pull * 0.35}px)` : undefined }}
      >
        {justPublished ? (
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={addAnother}
              className="w-full rounded-full bg-white py-3 text-sm font-semibold text-slate-900"
            >
              Añadir otra
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-white/70"
            >
              Listo
            </button>
          </div>
        ) : file ? (
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
              />
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
                  ? isVideo && duration != null && (Math.abs(frameAngle(frame)) > 0.8 || needsStoryPrepare(file, duration, trimStart, clipLen))
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
        ) : (
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
        {!file && !justPublished && (
          <p className="mt-3 text-center text-[11px] text-white/55">
            {avatarOnly
              ? 'Solo foto · luego la encuadras en círculo'
              : chatMode
                ? 'Toca para foto · mantén pulsado para vídeo · se borra en 24 h'
                : 'Toca para foto · mantén pulsado para vídeo · máximo 1 min'}
          </p>
        )}
        {file && !justPublished && (
          <p className="mt-3 text-center text-[11px] text-white/50">
            {isVideo
              ? 'Arrastra para mover · pellizca para tamaño · dos dedos o ↻ para girar · tira abajo para el tiempo'
              : 'Arrastra para mover · pellizca para tamaño · dos dedos o ↻ para girar'}
          </p>
        )}
        {error && <p className="mt-2 text-center text-xs font-semibold text-rose-300">{error}</p>}
      </div>
    </motion.div>
    )}
    </AnimatePresence>,
    document.body
  );
}
