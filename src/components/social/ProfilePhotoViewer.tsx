import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { X } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { userAvatarSrc } from '@/src/lib/avatar';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { useEscapeClose } from '@/src/lib/useEscapeClose';

const SOFT = { duration: 0.28, ease: EASE_OUT };

export interface ProfilePhotoPerson {
  id: string;
  name: string;
  avatar?: string | null;
}

/**
 * Misma entrada que una historia: foto a pantalla, bajar para cerrar, tap para salir.
 * Sin barra de tiempo ni likes: es la foto de perfil, no un story.
 */
export function ProfilePhotoViewer({
  person,
  onClose,
}: {
  person: ProfilePhotoPerson;
  onClose: () => void;
}) {
  const src = userAvatarSrc(person.avatar, person.id);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);
  const pointer = useRef<{ id: number; x: number; y: number; t: number; axis: 'h' | 'v' | null } | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pullY = useTransform(y, v => Math.max(0, v) * 0.38);
  const scale = useTransform(y, [0, 420], [1, 0.72]);
  const radius = useTransform(y, [0, 70], [0, 28]);
  const veil = useTransform(y, [0, 240], [1, 0]);

  const dismiss = useCallback(async (way: 'down' | 'left' | 'right' = 'down') => {
    if (leaving || busy.current) return;
    busy.current = true;
    setLeaving(true);
    if (way === 'left') await animate(x, -160, SOFT);
    else if (way === 'right') await animate(x, 160, SOFT);
    else await animate(y, Math.max(y.get(), 360), SOFT);
    onClose();
  }, [leaving, onClose, x, y]);

  useEscapeClose(true, () => { void dismiss('down'); });

  const reset = () => {
    void animate(x, 0, SOFT);
    void animate(y, 0, SOFT);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), axis: null };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const start = pointer.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      start.axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h';
    }
    if (start.axis === 'v') y.set(Math.max(0, dy));
    if (start.axis === 'h') x.set(dx * 0.35);
  };

  const onUp = (e: React.PointerEvent) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = Math.max(1, Date.now() - start.t);
    const vx = dx / dt;
    const vy = dy / dt;

    if (!start.axis) {
      void dismiss('down');
      return;
    }
    if (start.axis === 'v' && (dy > 110 || vy > 0.75)) {
      void dismiss('down');
      return;
    }
    if (start.axis === 'h' && (Math.abs(dx) > 80 || Math.abs(vx) > 0.7)) {
      void dismiss(dx < 0 ? 'left' : 'right');
      return;
    }
    reset();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[130000] overflow-hidden text-white">
      <motion.div className="absolute inset-0 bg-black" style={{ opacity: veil }} />
      <motion.div
        style={{ x, y: pullY, scale, borderRadius: radius }}
        className="absolute inset-0 origin-center touch-none select-none overflow-hidden bg-black"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {src ? (
          <>
            <img
              src={src}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl"
            />
            <img
              src={src}
              alt={person.name}
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <span className="flex h-48 w-48 items-center justify-center rounded-full bg-indigo-500 text-7xl font-black text-white">
              {(person.name || '?').trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center gap-3">
            <Avatar src={person.avatar} userId={person.id} name={person.name} className="h-8 w-8 rounded-full" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{person.name}</p>
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { void dismiss('down'); }}
              className="app-icon-hit rounded-full text-white/80"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
