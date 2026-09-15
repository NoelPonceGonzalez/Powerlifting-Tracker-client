import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { Button } from '@/src/components/ui/Button';
import {
  AVATAR_CROP_BOX,
  AVATAR_CROP_MAX_SCALE,
  AVATAR_CROP_MIN_SCALE,
  clampCoverPos,
  coverFit,
  exportCoverCrop,
  touchDistance,
} from '@/src/lib/avatarCrop';

interface AvatarCropModalProps {
  image: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

export function AvatarCropModal({ image, onCancel, onConfirm }: AvatarCropModalProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef(pos);
  const scaleRef = useRef(scale);
  posRef.current = pos;
  scaleRef.current = scale;
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);

  useEffect(() => {
    setPos({ x: 0, y: 0 });
    setScale(1);
    setNatural({ w: 0, h: 0 });
  }, [image]);

  useLayoutEffect(() => {
    if (!image || natural.w < 1) return;
    setPos((prev) => clampCoverPos(natural.w, natural.h, scale, prev));
  }, [image, scale, natural.w, natural.h]);

  const applyScale = useCallback((next: number) => {
    const clamped = Math.max(AVATAR_CROP_MIN_SCALE, Math.min(AVATAR_CROP_MAX_SCALE, next));
    setScale(clamped);
  }, []);

  useEffect(() => {
    if (!image) return;
    const el = areaRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          startDist: touchDistance(e.touches[0], e.touches[1]),
          startScale: scaleRef.current,
        };
        dragRef.current = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        if (!pinchRef.current) {
          pinchRef.current = {
            startDist: touchDistance(e.touches[0], e.touches[1]),
            startScale: scaleRef.current,
          };
        }
        const d = touchDistance(e.touches[0], e.touches[1]);
        applyScale(pinchRef.current.startScale * (d / Math.max(pinchRef.current.startDist, 1)));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [image, applyScale]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && (e as unknown as { isPrimary?: boolean }).isPrimary === false) return;
    areaRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    if (pinchRef.current) return;
    const next = {
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    };
    const img = imgRef.current;
    const nw = img?.naturalWidth ?? natural.w;
    const nh = img?.naturalHeight ?? natural.h;
    setPos(nw && nh ? clampCoverPos(nw, nh, scaleRef.current, next) : next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    if (areaRef.current?.hasPointerCapture?.(e.pointerId)) {
      areaRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const layout =
    image && natural.w > 0 && natural.h > 0 ? coverFit(natural.w, natural.h, scale, pos) : null;

  const confirm = () => {
    const img = imgRef.current;
    if (!img || img.naturalWidth < 1) return;
    const dataUrl = exportCoverCrop(img, scale, pos);
    if (dataUrl) onConfirm(dataUrl);
  };

  return (
    <GlassModal
      open={!!image}
      onClose={onCancel}
      title="Encuadrar foto"
      subtitle="Arrastra la imagen. Pellizca o usa la barra para acercar."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1 rounded-xl" onClick={confirm}>
            Usar foto
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          ref={areaRef}
          className="relative mx-auto overflow-hidden rounded-full bg-slate-900 touch-none"
          style={{ width: AVATAR_CROP_BOX, height: AVATAR_CROP_BOX, touchAction: 'none', maxWidth: '100%' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => {
            e.preventDefault();
            applyScale(scaleRef.current + (e.deltaY > 0 ? -0.12 : 0.12));
          }}
        >
          {image && (
            <img
              ref={imgRef}
              src={image}
              alt=""
              draggable={false}
              className="absolute select-none"
              onLoad={(e) => {
                const t = e.currentTarget;
                setNatural({ w: t.naturalWidth, h: t.naturalHeight });
              }}
              style={
                layout
                  ? {
                      left: layout.drawX,
                      top: layout.drawY,
                      width: layout.effectiveW,
                      height: layout.effectiveH,
                    }
                  : { visibility: 'hidden' }
              }
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-[18px] ring-black/45" />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => applyScale(scale - 0.15)}
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
            onChange={(e) => applyScale(parseFloat(e.target.value))}
            className="flex-1 accent-indigo-600"
          />
          <button
            type="button"
            onClick={() => applyScale(scale + 0.15)}
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
