import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { SCREEN_TRANSITION } from '@/src/lib/motionPresets';
import { cn } from '@/src/lib/utils';
import { useEscapeClose } from '@/src/lib/useEscapeClose';

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Más ancho: log de series, importar plan. */
  wide?: boolean;
  className?: string;
  /** Evita que el overlay cierre (p. ej. guardando). */
  persist?: boolean;
  zIndexClass?: string;
  /** Sheet con muelle: gráficos de Progreso. */
  rise?: boolean;
  /** Más alto: listas de Chat (amigos, nuevo mensaje). */
  sheet?: boolean;
}

/**
 * Overlay + panel de cristal: sheet abajo en móvil, tarjeta centrada en desktop.
 * Misma receta en toda la app (actividad, chat, torneos, series).
 */
export function GlassModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
  className,
  persist = false,
  zIndexClass = 'z-[100000]',
  rise = false,
  sheet = false,
}: GlassModalProps) {
  useEscapeClose(open && !persist, onClose);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="glass-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SCREEN_TRANSITION}
          className={cn(
            'fixed inset-0 flex min-h-[100dvh] items-end justify-center p-0 sm:items-center sm:p-4',
            zIndexClass
          )}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SCREEN_TRANSITION}
            onClick={persist ? undefined : onClose}
            className="fixed inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
          />
          <motion.div
            initial={{ opacity: 0, y: rise ? 48 : 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={rise
              ? { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }
              : SCREEN_TRANSITION
            }
            onClick={e => e.stopPropagation()}
            className={cn(
              'relative z-10 flex w-full flex-col overflow-hidden rounded-t-[28px] border border-white/50 bg-white/70 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-slate-900/65',
              sheet ? 'min-h-[72dvh] max-h-[92dvh] max-w-lg' : 'max-h-[88dvh]',
              !sheet && (wide ? 'max-w-lg sm:max-w-xl' : 'max-w-sm'),
              className
            )}
          >
            {(title || subtitle) && (
              <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/40 bg-white/40 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40">
                <div className="min-w-0">
                  {title && (
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                  )}
                  {subtitle && <p className="truncate text-[11px] text-slate-500">{subtitle}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={persist}
                  className="rounded-full p-2 text-slate-400 hover:bg-white/60 disabled:opacity-40 dark:hover:bg-white/10"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 [touch-action:pan-y]">
              {children}
            </div>
            {footer && (
              <div className="shrink-0 border-t border-white/40 bg-white/50 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/50">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
