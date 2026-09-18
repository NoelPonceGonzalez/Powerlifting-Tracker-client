import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Clock, MapPin, X } from 'lucide-react';
import { SCREEN_TRANSITION, SLIME_SHEET_IN, SLIME_SHEET_OUT, SLIME_SHEET_SHOW, SLIME_TAP, STICKY } from '@/src/lib/motionPresets';
import { useEscapeClose } from '@/src/lib/useEscapeClose';

interface ComposeSheetProps {
  open: boolean;
  onClose: () => void;
  onPublish: () => void;
  onGymNow: () => void;
  onGymLater: () => void;
}

export function ComposeSheet({ open, onClose, onPublish, onGymNow, onGymLater }: ComposeSheetProps) {
  useEscapeClose(open, onClose);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={SCREEN_TRANSITION}
      className="fixed inset-0 z-[120000] flex min-h-[100dvh] items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <motion.div
        initial={SLIME_SHEET_IN}
        animate={SLIME_SHEET_SHOW}
        exit={SLIME_SHEET_OUT}
        transition={STICKY}
        className="relative w-full max-w-sm overflow-hidden rounded-t-[28px] border border-white/50 bg-white/75 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-slate-900/70"
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nuevo</p>
          <button
            type="button"
            onClick={onClose}
            className="app-icon-hit rounded-full text-slate-400 hover:bg-white/60 dark:hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 p-4">
          <motion.button
            type="button"
            onClick={onPublish}
            whileTap={SLIME_TAP}
            transition={STICKY}
            className="flex w-full origin-center items-center gap-3 rounded-2xl border border-white/50 bg-white/55 px-3 py-3 text-left dark:border-white/10 dark:bg-slate-800/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-white">Historia</span>
              <span className="mt-0.5 block text-[12px] text-slate-500">Foto o vídeo · se borra en 24 h</span>
            </span>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
              <Camera size={20} />
            </span>
          </motion.button>

          <div className="grid grid-cols-2 gap-2">
            <motion.button
              type="button"
              onClick={onGymNow}
              whileTap={SLIME_TAP}
              transition={STICKY}
              className="origin-center rounded-2xl border border-white/50 bg-white/45 px-3 py-3 text-left dark:border-white/10 dark:bg-slate-800/40"
            >
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                <MapPin size={16} />
              </span>
              <span className="block text-[13px] font-semibold text-slate-900 dark:text-white">Estoy en el gym</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">Aviso ahora</span>
            </motion.button>
            <motion.button
              type="button"
              onClick={onGymLater}
              whileTap={SLIME_TAP}
              transition={STICKY}
              className="origin-center rounded-2xl border border-white/50 bg-white/45 px-3 py-3 text-left dark:border-white/10 dark:bg-slate-800/40"
            >
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                <Clock size={16} />
              </span>
              <span className="block text-[13px] font-semibold text-slate-900 dark:text-white">Llego a las…</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">Gym y hora</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
