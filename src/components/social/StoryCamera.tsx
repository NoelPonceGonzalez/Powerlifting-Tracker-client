import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
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
  extractStoryThumbnails,
  formatStoryTime,
  needsStoryPrepare,
  probeVideoDuration,
  trimVideoFile,
} from '@/src/lib/storyVideo';
import { StoryTrimStrip } from '@/src/components/social/StoryTrimStrip';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import { consumePrimedStoryCamera } from '@/src/pwa/mediaAccess';
import { cn } from '@/src/lib/utils';

interface StoryCameraProps {
  open: boolean;
  onClose: () => void;
  onPublished?: (post: FeedPost) => void;
  /** Perfil: misma cámara y galería, solo foto; se encuadra aquí en círculo. */
  mode?: 'story' | 'avatar';
  onPickImage?: (file: File) => void;
}

const CLIP_PRESETS = [15, 30, 45, 60] as const;
const MIN_IMG = 72;
const MAX_IMG_MUL = 8;

type FrameXform = { x: number; y: number; w: number; h: number; rot: number; turns: number };
type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const EMPTY_FRAME: FrameXform = { x: 0, y: 0, w: 0, h: 0, rot: 0, turns: 0 };

function visOf(f: FrameXform) {
  return f.rot % 180 === 0 ? { visW: f.w, visH: f.h } : { visW: f.h, visH: f.w };
}

function fromVis(visW: number, visH: number, rot: number, x: number, y: number, turns: number): FrameXform {
  return rot % 180 === 0 ? { x, y, w: visW, h: visH, rot, turns } : { x, y, w: visH, h: visW, rot, turns };
}

function coverXform(fw: number, fh: number, nw: number, nh: number, turns: number): FrameXform {
  const rot = ((turns % 4) + 4) % 4 * 90;
  const swap = rot % 180 !== 0;
  const s = swap ? Math.max(fw / Math.max(1, nh), fh / Math.max(1, nw)) : Math.max(fw / Math.max(1, nw), fh / Math.max(1, nh));
  return { x: 0, y: 0, w: nw * s, h: nh * s, rot, turns };
}

function imageContained(f: FrameXform, fw: number, fh: number) {
  if (f.w <= 0 || f.h <= 0 || fw <= 0 || fh <= 0) return false;
  const { visW, visH } = visOf(f);
  const left = fw / 2 + f.x - visW / 2;
  const top = fh / 2 + f.y - visH / 2;
  return left >= -1 && top >= -1 && left + visW <= fw + 1 && top + visH <= fh + 1;
}

function handleCursor(h: HandleId) {
  if (h === 'n' || h === 's') return 'ns-resize';
  if (h === 'e' || h === 'w') return 'ew-resize';
  if (h === 'ne' || h === 'sw') return 'nesw-resize';
  return 'nwse-resize';
}

const CORNER_HANDLES: HandleId[] = ['nw', 'ne', 'se', 'sw'];
const EDGE_HANDLES: HandleId[] = ['n', 'e', 's', 'w'];

function CornerBracket({ corner }: { corner: HandleId }) {
  const bar = 'absolute rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)]';
  if (corner === 'nw') {
    return (
      <>
        <span className={cn(bar, 'left-0 top-0 h-[2.5px] w-5')} />
        <span className={cn(bar, 'left-0 top-0 h-5 w-[2.5px]')} />
      </>
    );
  }
  if (corner === 'ne') {
    return (
      <>
        <span className={cn(bar, 'right-0 top-0 h-[2.5px] w-5')} />
        <span className={cn(bar, 'right-0 top-0 h-5 w-[2.5px]')} />
      </>
    );
  }
  if (corner === 'se') {
    return (
      <>
        <span className={cn(bar, 'bottom-0 right-0 h-[2.5px] w-5')} />
        <span className={cn(bar, 'bottom-0 right-0 h-5 w-[2.5px]')} />
      </>
    );
  }
  return (
    <>
      <span className={cn(bar, 'bottom-0 left-0 h-[2.5px] w-5')} />
      <span className={cn(bar, 'bottom-0 left-0 h-5 w-[2.5px]')} />
    </>
  );
}

function PhotoHandles({
  frame,
  fw,
  fh,
  avatarOnly,
  onHandleDown,
  onHandleMove,
  onHandleUp,
}: {
  frame: FrameXform;
  fw: number;
  fh: number;
  avatarOnly: boolean;
  onHandleDown: (handle: HandleId, e: React.PointerEvent) => void;
  onHandleMove: (e: React.PointerEvent) => void;
  onHandleUp: (e: React.PointerEvent) => void;
}) {
  const dimMaskId = useId().replace(/:/g, '');
  const { visW, visH } = visOf(frame);
  const left = fw / 2 + frame.x - visW / 2;
  const top = fh / 2 + frame.y - visH / 2;
  const contained = imageContained(frame, fw, fh);
  const inset = contained ? 0 : 1;
  const boxL = contained ? left : inset;
  const boxT = contained ? top : inset;
  const boxW = contained ? visW : fw - inset * 2;
  const boxH = contained ? visH : fh - inset * 2;
  const points: Record<HandleId, { x: number; y: number }> = {
    nw: { x: boxL, y: boxT },
    n: { x: boxL + boxW / 2, y: boxT },
    ne: { x: boxL + boxW, y: boxT },
    e: { x: boxL + boxW, y: boxT + boxH / 2 },
    se: { x: boxL + boxW, y: boxT + boxH },
    s: { x: boxL + boxW / 2, y: boxT + boxH },
    sw: { x: boxL, y: boxT + boxH },
    w: { x: boxL, y: boxT + boxH / 2 },
  };
  const edgeHit = (id: HandleId) => {
    if (id === 'n') return { left: boxL, top: boxT - 14, width: boxW, height: 28 };
    if (id === 's') return { left: boxL, top: boxT + boxH - 14, width: boxW, height: 28 };
    if (id === 'e') return { left: boxL + boxW - 14, top: boxT, width: 28, height: boxH };
    return { left: boxL - 14, top: boxT, width: 28, height: boxH };
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {contained && boxW > 0 && boxH > 0 && (
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <mask id={dimMaskId}>
              <rect width="100%" height="100%" fill="white" />
              <rect x={boxL} y={boxT} width={boxW} height={boxH} fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.42)" mask={`url(#${dimMaskId})`} />
        </svg>
      )}
      <div
        className={cn(
          'absolute border border-white/35',
          avatarOnly ? 'border-dashed border-white/25' : 'border-solid'
        )}
        style={{ left: boxL, top: boxT, width: boxW, height: boxH }}
      />
      <div
        className="pointer-events-none absolute w-px bg-white/[0.08]"
        style={{ left: boxL + boxW * 0.333, top: boxT, height: boxH }}
      />
      <div
        className="pointer-events-none absolute w-px bg-white/[0.08]"
        style={{ left: boxL + boxW * 0.666, top: boxT, height: boxH }}
      />
      <div
        className="pointer-events-none absolute h-px bg-white/[0.08]"
        style={{ left: boxL, top: boxT + boxH * 0.333, width: boxW }}
      />
      <div
        className="pointer-events-none absolute h-px bg-white/[0.08]"
        style={{ left: boxL, top: boxT + boxH * 0.666, width: boxW }}
      />
      {CORNER_HANDLES.map(id => (
        <div
          key={id}
          data-frame-handle={id}
          role="presentation"
          className="pointer-events-auto absolute z-20 h-11 w-11"
          style={{
            left: points[id].x,
            top: points[id].y,
            transform: 'translate(-50%, -50%)',
            cursor: handleCursor(id),
            touchAction: 'none',
          }}
          onPointerDown={e => onHandleDown(id, e)}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="relative h-5 w-5">
            <CornerBracket corner={id} />
          </div>
        </div>
      ))}
      {EDGE_HANDLES.map(id => (
        <div
          key={id}
          data-frame-handle={id}
          role="presentation"
          className="pointer-events-auto absolute z-[15]"
          style={{ ...edgeHit(id), cursor: handleCursor(id), touchAction: 'none' }}
          onPointerDown={e => onHandleDown(id, e)}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
      ))}
    </div>
  );
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<number | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const startY = useRef<number | null>(null);
  const trimAbort = useRef({ cancelled: false });
  const previewUrlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const frameRef = useRef<FrameXform>(EMPTY_FRAME);
  const imgNatRef = useRef<{ w: number; h: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; w: number; h: number } | null>(null);
  const pan = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const resizeRef = useRef<{
    handle: HandleId;
    startX: number;
    startY: number;
    contained: boolean;
    fw: number;
    fh: number;
    x: number;
    y: number;
    visW: number;
    visH: number;
  } | null>(null);
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
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamReady(false);
  }, []);

  const startStream = useCallback(async (mode: 'user' | 'environment') => {
    setCamError(false);
    setCamDenied(false);
    const attach = async (stream: MediaStream) => {
      if (streamRef.current && streamRef.current !== stream) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      streamRef.current = stream;
      if (!videoRef.current) await new Promise(r => requestAnimationFrame(r));
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute('playsinline', 'true');
        await video.play().catch(() => {});
      }
      setCamReady(true);
      setCamError(false);
    };
    const primed = consumePrimedStoryCamera();
    if (primed) {
      await attach(primed);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError(true);
      return;
    }
    const tries: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: mode } }, audio: false },
      { video: { facingMode: mode }, audio: false },
      { video: true, audio: false },
    ];
    let denied = false;
    for (const cons of tries) {
      try {
        await attach(await navigator.mediaDevices.getUserMedia(cons));
        return;
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') denied = true;
      }
    }
    setCamDenied(denied);
    setCamError(true);
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
    const id = ++camGen.current;
    void startStream(facing);
    return () => {
      if (holdTimer.current != null) window.clearTimeout(holdTimer.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ignore */ }
      }
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
    if (stream.getAudioTracks().length === 0) {
      void navigator.mediaDevices?.getUserMedia({ audio: true, video: false }).then(mic => {
        mic.getAudioTracks().forEach(t => stream.addTrack(t));
      }).catch(() => {});
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
    if (avatarOnly) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      startRecording();
    }, 180);
  };

  const onShutterUp = () => {
    if (avatarOnly) {
      takePhoto();
      return;
    }
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
    imgNatRef.current = null;
    setFrame(EMPTY_FRAME);
    dropPreviewUrl();
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
      if (avatarOnly) {
        const framed = file.type.startsWith('image/') ? await exportFramedPhoto(file, true) : file;
        onPickImage?.(framed);
        onClose();
        return;
      }
      let toSend = file;
      if (file.type.startsWith('image/')) {
        toSend = await exportFramedPhoto(file, false);
      } else if (file.type.startsWith('video/') && duration != null && needsStoryPrepare(file, duration, trimStart, clipLen)) {
        toSend = await trimVideoFile(file, trimStart, trimStart + clipLen);
      }
      if (toSend.size > STORY_UPLOAD_MAX_BYTES) {
        throw new Error('Pesa más de lo que aguanta el servidor. Recorta a 1 min o menos.');
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
    void startStream(facing);
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

  useEffect(() => {
    if (!file || file.type.startsWith('video/')) return;
    const el = frameBoxRef.current;
    if (!el) return;
    const sync = () => {
      const fw = el.clientWidth;
      const fh = el.clientHeight;
      setBoxSize({ w: fw, h: fh });
      if (imgNatRef.current && frameRef.current.w === 0 && fw > 2 && fh > 2) {
        setFrame(coverXform(fw, fh, imgNatRef.current.w, imgNatRef.current.h, frameRef.current.turns));
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
    let { x, y, w, h, rot, turns } = frameRef.current;
    if (w <= 0 || h <= 0) {
      const filled = coverXform(vw, vh, img.width, img.height, turns);
      x = filled.x;
      y = filled.y;
      w = filled.w;
      h = filled.h;
      rot = filled.rot;
    }
    ctx.save();
    ctx.translate(W / 2 + x * (W / vw), H / 2 + y * (H / vh));
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -(w * W / vw) / 2, -(h * H / vh) / 2, w * (W / vw), h * (H / vh));
    ctx.restore();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!previewUrlRef.current) URL.revokeObjectURL(url);
    if (!blob) return source;
    return new File([blob], square ? 'perfil.jpg' : 'historia.jpg', { type: 'image/jpeg' });
  };

  const clampSize = (visW: number, visH: number, fw: number, fh: number) => ({
    visW: Math.min(fw * MAX_IMG_MUL, Math.max(MIN_IMG, visW)),
    visH: Math.min(fh * MAX_IMG_MUL, Math.max(MIN_IMG, visH)),
  });

  const onHandleDown = (handle: HandleId, e: React.PointerEvent) => {
    if (saving || fileRef.current?.type.startsWith('video/')) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const box = frameBoxRef.current;
    const fw = box?.clientWidth || boxSize.w;
    const fh = box?.clientHeight || boxSize.h;
    const { visW, visH } = visOf(frame);
    resizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      contained: imageContained(frame, fw, fh),
      fw,
      fh,
      x: frame.x,
      y: frame.y,
      visW,
      visH,
    };
    pan.current = null;
    pinch.current = null;
  };

  const onFramePointerDown = (e: React.PointerEvent) => {
    if (saving || fileRef.current?.type.startsWith('video/')) return;
    if ((e.target as HTMLElement).closest('[data-frame-handle]')) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, fx: frame.x, fy: frame.y };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const { visW, visH } = visOf(frame);
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), w: visW, h: visH };
      pan.current = null;
    }
  };

  const onFramePointerMove = (e: React.PointerEvent) => {
    const resize = resizeRef.current;
    if (resize) {
      const dx = e.clientX - resize.startX;
      const dy = e.clientY - resize.startY;
      const handle = resize.handle;
      if (resize.contained) {
        let left = resize.x - resize.visW / 2;
        let top = resize.y - resize.visH / 2;
        let right = resize.x + resize.visW / 2;
        let bottom = resize.y + resize.visH / 2;
        if (handle.includes('e')) right = Math.max(left + MIN_IMG, right + dx);
        if (handle.includes('w')) left = Math.min(right - MIN_IMG, left + dx);
        if (handle.includes('s')) bottom = Math.max(top + MIN_IMG, bottom + dy);
        if (handle.includes('n')) top = Math.min(bottom - MIN_IMG, top + dy);
        const next = clampSize(right - left, bottom - top, resize.fw, resize.fh);
        setFrame(fromVis(next.visW, next.visH, frameRef.current.rot, (left + right) / 2, (top + bottom) / 2, frameRef.current.turns));
      } else {
        let visW = resize.visW;
        let visH = resize.visH;
        const sx = visW / Math.max(1, resize.fw);
        const sy = visH / Math.max(1, resize.fh);
        if (handle.includes('e')) visW += dx * sx;
        if (handle.includes('w')) visW -= dx * sx;
        if (handle.includes('s')) visH += dy * sy;
        if (handle.includes('n')) visH -= dy * sy;
        const next = clampSize(visW, visH, resize.fw, resize.fh);
        setFrame(fromVis(next.visW, next.visH, frameRef.current.rot, resize.x, resize.y, frameRef.current.turns));
      }
      return;
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = d / Math.max(1, pinch.current.dist);
      const box = frameBoxRef.current;
      const fw = box?.clientWidth || boxSize.w || 1;
      const fh = box?.clientHeight || boxSize.h || 1;
      const next = clampSize(pinch.current.w * ratio, pinch.current.h * ratio, fw, fh);
      setFrame(f => fromVis(next.visW, next.visH, f.rot, f.x, f.y, f.turns));
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
    resizeRef.current = null;
  };

  const rotatePhoto = () => {
    setFrame(f => {
      const turns = f.turns + 1;
      const box = frameBoxRef.current;
      const nat = imgNatRef.current;
      if (!box || !nat || box.clientWidth < 2 || box.clientHeight < 2) {
        return { ...f, turns, rot: ((turns % 4) + 4) % 4 * 90 };
      }
      return coverXform(box.clientWidth, box.clientHeight, nat.w, nat.h, turns);
    });
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
      className={cn(
        'fixed inset-0 z-[140000] origin-bottom overflow-hidden text-white',
        file && !isVideo ? 'bg-transparent' : 'bg-black'
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
        accept={avatarOnly ? 'image/*' : 'image/*,video/*'}
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
          {!camReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-white/50" />
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
            onError={revivePreview}
          />
        ) : (
          <div
            className="absolute inset-0 touch-none"
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
              const next = clampSize(visW * ratio, visH * ratio, fw, fh);
              setFrame(fromVis(next.visW, next.visH, frame.rot, frame.x, frame.y, frame.turns));
            }}
          >
            <div className="absolute inset-0 bg-zinc-950" />
            <img
              src={previewUrl}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-[0.38] blur-[72px]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
            <div className="absolute inset-x-0 top-[max(3rem,calc(env(safe-area-inset-top)+2.25rem))] bottom-[max(7rem,calc(env(safe-area-inset-bottom)+6rem))] flex items-center justify-center px-2">
              <div
                className={cn(
                  'relative',
                  avatarOnly
                    ? 'aspect-square h-full max-h-full max-w-full'
                    : 'aspect-[9/16] h-full max-h-full max-w-full'
                )}
              >
                <div
                  ref={frameBoxRef}
                  className={cn(
                    'absolute inset-0 overflow-hidden bg-black/30 shadow-[0_24px_80px_rgba(0,0,0,0.55)]',
                    avatarOnly
                      ? 'rounded-full ring-2 ring-white/85 ring-offset-2 ring-offset-black/20'
                      : 'rounded-[20px] ring-1 ring-white/20'
                  )}
                >
                  <img
                    data-story-preview
                    src={previewUrl}
                    alt=""
                    draggable={false}
                    onLoad={onPreviewLoad}
                    onError={revivePreview}
                    className="absolute left-1/2 top-1/2 max-w-none select-none transition-transform duration-300 ease-out"
                    style={
                      frame.w > 0
                        ? {
                            width: frame.w,
                            height: frame.h,
                            transform: `translate(-50%, -50%) translate(${frame.x}px, ${frame.y}px) rotate(${frame.turns * 90}deg)`,
                          }
                        : {
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transform: 'translate(-50%, -50%)',
                          }
                    }
                  />
                </div>
                {frame.w > 0 && boxSize.w > 0 && (
                  <PhotoHandles
                    frame={frame}
                    fw={boxSize.w}
                    fh={boxSize.h}
                    avatarOnly={avatarOnly}
                    onHandleDown={onHandleDown}
                    onHandleMove={onFramePointerMove}
                    onHandleUp={onFramePointerUp}
                  />
                )}
              </div>
            </div>
          </div>
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
              {!isVideo && (
                <button
                  type="button"
                  onClick={rotatePhoto}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 backdrop-blur-md ring-1 ring-white/15"
                  aria-label="Girar imagen"
                >
                  <RotateCw size={18} />
                </button>
              )}
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
                  ? isVideo && duration != null && needsStoryPrepare(file, duration, trimStart, clipLen)
                    ? 'Recortando…'
                    : 'Subiendo…'
                  : avatarOnly
                    ? 'Mi foto'
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
            {avatarOnly
              ? 'Solo foto · luego la encuadras en círculo'
              : 'Foto o vídeo · máximo 1 min · un archivo más largo se recorta aquí'}
          </p>
        )}
        {file && !isVideo && !justPublished && (
          <p className="mt-3 text-center text-[11px] text-white/50">
            {avatarOnly
              ? 'Arrastra o pellizca para encuadrar · gira con ↻'
              : 'Arrastra para mover · pellizca para escalar · gira con ↻'}
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
