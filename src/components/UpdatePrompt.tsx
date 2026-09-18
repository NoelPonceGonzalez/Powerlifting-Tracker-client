import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { useServiceWorkerUpdate } from '@/src/pwa/swUpdate';

/**
 * Aviso cuando hay una versión nueva desplegada. El service worker ya la descargó en segundo
 * plano; el usuario elige cuándo recargar (sin cerrar la app ni quitarla de segundo plano).
 */
export const UpdatePrompt: React.FC = () => {
  const { updateAvailable, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();

  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          role="dialog"
          aria-label="Nueva versión disponible"
          className="fixed inset-x-2 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-[70] mx-auto max-w-md sm:inset-x-3"
        >
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-white/95 px-3 py-2.5 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-emerald-400/25 dark:bg-slate-950/95 dark:shadow-black/60 sm:rounded-3xl sm:p-4">
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white sm:size-11 sm:rounded-2xl">
                <RefreshCw size={18} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1 basis-[8rem]">
                <h2 className="truncate text-[13px] font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 sm:text-base">
                  Nueva versión disponible
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400 sm:text-xs">
                  Ya está descargada. Pulsa actualizar para cargarla sin salir de la app.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={dismissUpdate}
                  className="rounded-xl px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:px-3"
                >
                  Más tarde
                </button>
                <button
                  type="button"
                  onClick={applyUpdate}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-white sm:rounded-2xl sm:px-4 sm:py-3 sm:text-xs"
                >
                  <RefreshCw size={14} />
                  Actualizar
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
