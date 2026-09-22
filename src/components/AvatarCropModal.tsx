import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { Button } from '@/src/components/ui/Button';
import {
  AVATAR_CROP_MAX_SCALE,
  AVATAR_CROP_MIN_SCALE,
  coverFit,
  exportFramedAvatar,
} from '@/src/lib/avatarCrop';

interface AvatarCropModalProps {
  image: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

export function AvatarCropModal({ image, onCancel, onConfirm }: AvatarCropModalProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [box, setBox] = useState(280);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef(pos);
  const scaleRef = useRef(scale);
  posRef.current = pos;
  scaleRef.current = scale;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const maskId = useId().replace(/:/g, '');

  useEffect(() => {
    setPos({ x: 0, y: 0 });
    setScale(1);
    setNat({ w: 0, h: 0 });
  }, [image]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || !image) return;
    const sync = () => setBox(el.clientWidth || 280);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [image]);

  const applyScale = useCallback((next: number) => {
    setScale(Math.max(AVATAR_CROP_MIN_SCALE, Math.min(AVATAR_CROP_MAX_SCALE, next)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, fx: posRef.current.x, fy: posRef.current.y };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: scaleRef.current };
      pan.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      applyScale(pinch.current.scale * (d / Math.max(1, pinch.current.dist)));
      return;
    }
    const start = pan.current;
    if (!start) return;
    setPos({
      x: start.fx + (e.clientX - start.x),
      y: start.fy + (e.clientY - start.y),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
  };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || img.naturalWidth < 1) return;
    const dataUrl = exportFramedAvatar(img, scale, pos, box);
    if (dataUrl) onConfirm(dataUrl);
  };

  return (
    <GlassModal
      open={!!image}
      onClose={onCancel}
      center
      title="Mi foto"
      subtitle="El círculo es tu foto. Arrastra o pellizca para encuadrar."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1 rounded-xl" onClick={confirm}>
            Mi foto
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          ref={areaRef}
          className="relative mx-auto aspect-square w-full overflow-hidden rounded-[24px] bg-black touch-none"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={e => {
            e.preventDefault();
            e.stopPropagation();
            applyScale(scaleRef.current * (e.deltaY > 0 ? 0.92 : 1.08));
          }}
        >
          {image && (
            <>
              <img
                src={image}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
              />
              <div className="pointer-events-none absolute inset-0 bg-black/20" />
              <img
                ref={imgRef}
                src={image}
                alt=""
                draggable={false}
                onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: nat.w && box ? nat.w * coverFit(nat.w, nat.h, box) * scale : '100%',
                  height: nat.h && box ? nat.h * coverFit(nat.w, nat.h, box) * scale : '100%',
                  objectFit: 'cover',
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                }}
              />
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                  <mask id={maskId}>
                    <rect width="100%" height="100%" fill="white" />
                    <circle cx="50%" cy="50%" r="50%" fill="black" />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask={`url(#${maskId})`} />
                <circle cx="50%" cy="50%" r="49%" fill="none" stroke="white" strokeWidth="3" />
              </svg>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => applyScale(scale - 0.12)}
            className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800"
            aria-label="Alejar"
          >
            <ZoomOut size={18} />
          </button>
          <input
            type="range"
            min={AVATAR_CROP_MIN_SCALE}
            max={AVATAR_CROP_MAX_SCALE}
            step={0.05}
            value={scale}
            onChange={e => applyScale(parseFloat(e.target.value))}
            className="flex-1 accent-indigo-600"
          />
          <button
            type="button"
            onClick={() => applyScale(scale + 0.12)}
            className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800"
            aria-label="Acercar"
          >
            <ZoomIn size={18} />
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
