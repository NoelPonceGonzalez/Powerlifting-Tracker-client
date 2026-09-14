/**
 * Movimiento corto y barato: solo opacity / translate pequeño.
 * Misma curva en toda la app. Nada de cortinas, stagger largo ni scale en pantallas con gráficos.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Cambio de pestaña: fade, sin desplazar el layout. */
export const VIEW_TRANSITION = { duration: 0.18, ease: EASE_OUT };

/** Sub-pantalla o modal ligero. */
export const SCREEN_TRANSITION = { duration: 0.16, ease: EASE_OUT };

/** Interruptor / like: muelle corto. */
export const SPRING_SNAP = { type: 'spring' as const, stiffness: 480, damping: 34, mass: 0.65 };
