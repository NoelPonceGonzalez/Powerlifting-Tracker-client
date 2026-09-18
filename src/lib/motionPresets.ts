import type { Variants } from 'motion/react';

/**
 * Movimiento de la app: muelle pegajoso + squash-and-stretch (slime).
 * No es solo X/Y: se deforma con scaleX / scaleY y a veces el radio.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Cambio de pestaña: fade corto. El slime va en el contenido, no en el swap. */
export const VIEW_TRANSITION = { duration: 0.18, ease: EASE_OUT };

/** Entrada de pestaña (Inicio, Rutina, Social, Torneos): la raíz solo funde. */
export const PAGE_ENTER_ROOT: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { ...VIEW_TRANSITION, delayChildren: 0.04, staggerChildren: 0.055 },
  },
};

/** Bloques que suben al entrar en la pestaña. */
export const PAGE_ENTER_ITEM: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 28, mass: 0.7 },
  },
};

/** Overlay / velo. Las hojas usan STICKY. */
export const SCREEN_TRANSITION = { duration: 0.16, ease: EASE_OUT };

/** Interruptor / like: muelle corto. */
export const SPRING_SNAP = { type: 'spring' as const, stiffness: 480, damping: 34, mass: 0.65 };

/** Muelle slime: rebote que se pega un instante. */
export const STICKY = { type: 'spring' as const, stiffness: 220, damping: 16, mass: 0.92 };

/** Toque: se achata como una bola. */
export const SLIME_TAP = { scaleX: 1.07, scaleY: 0.88 };

/** Hoja que nace como blob y se abre. */
export const SLIME_SHEET_IN = {
  opacity: 0,
  y: 40,
  scaleX: 0.86,
  scaleY: 1.14,
  borderRadius: 44,
};

export const SLIME_SHEET_SHOW = {
  opacity: 1,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  borderRadius: 28,
};

export const SLIME_SHEET_OUT = {
  opacity: 0,
  y: 24,
  scaleX: 1.06,
  scaleY: 0.9,
  borderRadius: 36,
};

/** Pantalla a pantalla (cámara de historia): sube como blob y llena el móvil. */
export const SLIME_FULLSCREEN_IN = {
  opacity: 0,
  y: 64,
  scaleX: 0.9,
  scaleY: 1.08,
  borderRadius: 40,
};

export const SLIME_FULLSCREEN_SHOW = {
  opacity: 1,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  borderRadius: 0,
};

export const SLIME_FULLSCREEN_OUT = {
  opacity: 0,
  y: 48,
  scaleX: 1.05,
  scaleY: 0.92,
  borderRadius: 32,
};

