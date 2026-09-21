import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Handshake } from 'lucide-react';
import { EASE_OUT, SPRING_SNAP } from '@/src/lib/motionPresets';
import { useCloseFriends } from '@/src/lib/useCloseFriends';
import { cn } from '@/src/lib/utils';

export function CloseFriendButton({
  userId,
  name,
  avatar,
  className,
  labeled,
}: {
  userId: string;
  name?: string;
  avatar?: string | null;
  className?: string;
  labeled?: boolean;
}) {
  const { isClose, toggle } = useCloseFriends();
  const on = isClose(userId);
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState<'add' | 'remove' | null>(null);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    const next = !on;
    setPulse(next ? 'add' : 'remove');
    setBusy(true);
    try {
      await toggle(userId, next, name ? { id: userId, name, avatar } : undefined);
    } catch {
      setPulse(null);
    } finally {
      setBusy(false);
      window.setTimeout(() => setPulse(null), 280);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? 'Quitar de mejores amigos' : 'Añadir a mejores amigos'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center touch-manipulation disabled:opacity-50',
        labeled
          ? 'min-h-11 w-full gap-2 rounded-2xl px-3 text-left'
          : 'h-11 w-11 rounded-full',
        on
          ? labeled
            ? 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300'
            : 'bg-emerald-500/15 text-emerald-500 dark:bg-emerald-400/15 dark:text-emerald-300'
          : labeled
            ? 'bg-slate-50 text-slate-700 dark:bg-slate-800/70 dark:text-slate-100'
            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
        className
      )}
    >
      <motion.span
        key={`${on}-${pulse || 'idle'}`}
        initial={
          reduce
            ? { opacity: 1, scale: 1 }
            : pulse === 'add'
              ? { scale: 0.78, opacity: 0.5 }
              : pulse === 'remove'
                ? { scale: 1, opacity: 1 }
                : { scale: 1 }
        }
        animate={
          reduce
            ? { opacity: 1, scale: 1 }
            : pulse === 'add'
              ? { scale: 1, opacity: 1 }
              : pulse === 'remove'
                ? { scale: 0.86, opacity: 0.55 }
                : { scale: 1, opacity: 1 }
        }
        transition={pulse === 'add' ? SPRING_SNAP : { duration: 0.18, ease: EASE_OUT }}
        className="flex"
      >
        <Handshake size={18} strokeWidth={on ? 2.4 : 2} />
      </motion.span>
      {labeled && (
        <span className="min-w-0 flex-1 text-sm font-semibold">
          {on ? 'En mejores amigos' : 'Añadir a mejores amigos'}
        </span>
      )}
    </button>
  );
}
