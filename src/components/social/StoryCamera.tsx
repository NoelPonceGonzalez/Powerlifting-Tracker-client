import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Image as ImageIcon, Loader2, RefreshCw, X } from 'lucide-react';
import { SLIME_FULLSCREEN_IN, SLIME_FULLSCREEN_OUT, SLIME_FULLSCREEN_SHOW, STICKY } from '@/src/lib/motionPresets';
import { publishMedia, type FeedPost } from '@/src/lib/feedApi';
import {
  STORY_SOURCE_MAX_BYTES,
  STORY_UPLOAD_MAX_BYTES,
  STORY_VIDEO_BITRATE,
  STORY_VIDEO_MAX_SEC,
  STORY_VIDEO_MIN_SEC,
  extractStoryThumbnails,
  formatStoryTime,
  needsStoryPrepare,
  probeVideoDuration,
  trimVideoFile,
} from '@/src/lib/storyVideo';
import { StoryTrimStrip } from '@/src/components/social/StoryTrimStrip';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import { cn } from '@/src/lib/utils';

interface StoryCameraProps {
  open: boolean;
  onClose: () => void;
  onPublished: (post: FeedPost) => void;
}

const CLIP_PRESETS = [15, 30, 45, 60] as const;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const type of ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

export function StoryCamera({ open, onClose, onPublished }: StoryCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<number | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const startY = useRef<number | null>(null);
  const trimAbort = useRef({ cancelled: false });

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

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamReady(false);
  }, []);

  const startStream = useCallback(async (mode: 'user' | 'environment') => {
    stopStream();
    setCamError(false);
    setCamDenied(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError(true);
      return;
    }
    const attach = async (stream: MediaStream) => {
      streamRef.current = stream;
      const el = videoRef.current;
      if (el) {
        el.srcObject = stream;
        el.muted = true;
        await el.play().catch(() => {});
      }
      setCamReady(true);
    };
    const video = { facingMode: { ideal: mode }, width: { ideal: 1080 }, height: { ideal: 1920 } };
    try {
      await attach(await navigator.mediaDevices.getUserMedia({ video, audio: true }));
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCamDenied(true);
        setCamError(true);
        return;
      }
      try {
        await attach(await navigator.mediaDevices.getUserMedia({ video, audio: false }));
      } catch (inner) {
        const innerName = inner instanceof DOMException ? inner.name : '';
        setCamDenied(innerName === 'NotAllowedError' || innerName === 'PermissionDeniedError');
        setCamError(true);
      }
    }
  }, [stopStream]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || file || justPublished) return;
    void startStream(facing);
    return () => {
      if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
      stopStream();
    };
  }, [open, facing, startStream, stopStream, file, justPublished]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
  }, [open]);

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
    void extractStoryThumbnails(file, 10, token, (dataUrl, index) => {
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
    if (selected.size > STORY_SOURCE_MAX_BYTES) {
      setError('Ese archivo no se puede abrir aquí. Elige otro o un recorte más corto.');
      return;
    }
    setError(null);
    setJustPublished(false);
    if (!selected.type.startsWith('video/')) {
      setDuration(null);
      setFile(selected);
      stopStream();
      return;
    }
    setProbing(true);
    void probeVideoDuration(selected)
      .then(d => {
        const len = Math.min(STORY_VIDEO_MAX_SEC, d);
        setDuration(d);
        setTrimStart(0);
        setTrimEnd(Math.max(STORY_VIDEO_MIN_SEC, len));
        setThumbs([]);
        setPlayhead(0);
        setFile(selected);
        stopStream();
      })
      .catch(e => {
        setError(e?.message || 'No se ha podido leer el vídeo.');
      })
      .finally(() => setProbing(false));
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
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

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;
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
    rec.start();
    setRecording(true);
    setRecMs(0);
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    try { rec.stop(); } catch { /* ignore */ }
  };

  const onShutterDown = () => {
    if (file || saving || justPublished) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      startRecording();
    }, 180);
  };

  const onShutterUp = () => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      takePhoto();
      return;
    }
    if (recording) stopRecording();
  };

  const discard = () => {
    if (saving) return;
    setFile(null);
    setError(null);
    setDuration(null);
    setThumbs([]);
    setJustPublished(false);
    void startStream(facing);
  };

  const clipLen = Math.max(0, trimEnd - trimStart);

  const setClipPreset = (sec: number) => {
    if (duration == null) return;
    const next = Math.min(sec, duration, STORY_VIDEO_MAX_SEC);
    setTrimStart(s => {
      const start = Math.min(s, Math.max(0, duration - next));
      setTrimEnd(start + next);
      return start;
    });
  };

  const onTrimChange = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
  };

  const publish = async () => {
    if (!file || saving) return;
    setSaving(true);
    setError(null);
    try {
      let toSend = file;
      if (file.type.startsWith('video/') && duration != null && needsStoryPrepare(file, duration, trimStart, clipLen)) {
        toSend = await trimVideoFile(file, trimStart, trimStart + clipLen);
      }
      if (toSend.size > STORY_UPLOAD_MAX_BYTES) {
        throw new Error('Pesa más de lo que aguanta el servidor. Recorta a 1 min o menos.');
      }
      const post = await publishMedia(toSend, { kind: 'story' });
      onPublished(post);
      setSessionCount(n => n + 1);
      setJustPublished(true);
      setFile(null);
      setDuration(null);
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
    void startStream(facing);
  };

  const isVideo = !!file?.type.startsWith('video/');
  const recSec = Math.min(STORY_VIDEO_MAX_SEC, Math.floor(recMs / 1000));
  const tooLong = duration != null && duration > STORY_VIDEO_MAX_SEC + 0.15;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
    {open && (
    <motion.div
      initial={SLIME_FULLSCREEN_IN}
      animate={SLIME_FULLSCREEN_SHOW}
      exit={SLIME_FULLSCREEN_OUT}
      transition={STICKY}
      className="fixed inset-0 z-[140000] origin-bottom overflow-hidden bg-black text-white"
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
        accept="image/*,video/*"
        className="hidden"
        onChange={e => {
          acceptFile(e.target.files?.[0] ?? null);
          e.target.value = '';
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
          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 px-8 text-center">
              <p className="text-sm font-semibold">
                {camDenied ? 'La cámara está bloqueada' : 'No se ha podido abrir la cámara'}
              </p>
              <p className="text-xs text-white/50">
                {camDenied
                  ? 'Actívala en Ajustes → Aplicación, o elige una foto de la galería.'
                  : 'Toca la galería o tira hacia arriba para elegir una foto o un vídeo.'}
              </p>
              <button
                type="button"
                onClick={openGallery}
                className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Abrir galería
              </button>
            </div>
          )}
        </>
      )}

      {file && previewUrl && (
        isVideo ? (
          <video
            ref={previewRef}
            src={previewUrl}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-contain bg-black"
          />
        ) : (
          <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-contain bg-black" />
        )
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

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))]">
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
        className="absolute inset-x-0 bottom-0 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-8"
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
              <div className="rounded-[22px] border border-white/15 bg-black/45 px-3 py-2.5 backdrop-blur-xl">
                <p className="mb-2 text-[11px] font-semibold text-white/80">
                  {tooLong
                    ? `Dura ${formatStoryTime(duration)}. Arrastra las asas: solo se sube 1 min.`
                    : file.size > STORY_UPLOAD_MAX_BYTES
                      ? 'Pesa mucho: recorta aquí el tramo y se comprime al subir.'
                      : `Este clip cabe entero (${formatStoryTime(duration)}). Puedes acortarlo.`}
                </p>
                <StoryTrimStrip
                  duration={duration}
                  start={trimStart}
                  end={trimEnd}
                  thumbs={thumbs}
                  playhead={playhead}
                  onChange={onTrimChange}
                />
                {duration > STORY_VIDEO_MIN_SEC + 0.2 && (
                  <div className="mt-2 flex gap-1.5">
                    {CLIP_PRESETS.filter(s => s <= duration + 0.01 && s <= STORY_VIDEO_MAX_SEC).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setClipPreset(s)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-bold',
                          Math.abs(clipLen - s) < 0.2 ? 'bg-white text-slate-900' : 'bg-white/15 text-white/80'
                        )}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={saving || probing}
                onClick={() => void publish()}
                className="flex items-center gap-2.5 rounded-full bg-white py-2 pl-2 pr-4 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600 text-[11px] font-bold text-white">
                  {saving || probing ? <Loader2 size={16} className="animate-spin" /> : 'Yo'}
                </span>
                {saving
                  ? isVideo && duration != null && needsStoryPrepare(file, duration, trimStart, clipLen)
                    ? 'Recortando…'
                    : 'Subiendo…'
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
              onPointerCancel={onShutterUp}
              onContextMenu={e => e.preventDefault()}
              className={cn(
                'relative mb-1 h-[72px] w-[72px] rounded-full border-[4px] border-white bg-white/25',
                recording && 'scale-110 border-rose-500 bg-rose-500/30'
              )}
              aria-label="Disparar"
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
            Foto o vídeo · máximo 1 min · un archivo más largo se recorta aquí
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
