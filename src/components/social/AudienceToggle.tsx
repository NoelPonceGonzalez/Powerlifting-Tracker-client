import React from 'react';
import { motion } from 'motion/react';
import { Handshake, Users } from 'lucide-react';
import { SPRING_SNAP } from '@/src/lib/motionPresets';
import type { Audience } from '@/src/lib/privacyApi';
import { cn } from '@/src/lib/utils';

export function AudienceToggle({
  value,
  onChange,
  tone = 'light',
}: {
  value: Audience;
  onChange: (next: Audience) => void;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div
      className={cn(
        'flex rounded-full p-0.5',
        dark ? 'bg-black/35 ring-1 ring-white/15 backdrop-blur-md' : 'bg-slate-100 dark:bg-slate-800'
      )}
    >
      {([
        { id: 'all' as const, label: 'Todos', Icon: Users },
        { id: 'close' as const, label: 'Mejores amigos', Icon: Handshake },
      ]).map(opt => {
        const on = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-semibold',
              on
                ? dark
                  ? 'text-slate-900'
                  : 'text-slate-900 dark:text-white'
                : dark
                  ? 'text-white/65'
                  : 'text-slate-500'
            )}
          >
            {on && (
              <motion.span
                layout
                className={cn(
                  'absolute inset-0 rounded-full',
                  dark ? 'bg-white' : 'bg-white shadow-sm dark:bg-slate-700'
                )}
                transition={SPRING_SNAP}
              />
            )}
            <opt.Icon size={14} className="relative" />
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
