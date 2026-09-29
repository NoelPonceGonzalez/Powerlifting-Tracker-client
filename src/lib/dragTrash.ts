import { useSyncExternalStore } from 'react';

/**
 * Mientras se arrastra un ejercicio, la barra de abajo se encoge y su + pasa a papelera.
 * La fila avisa aquí; App pinta la barra.
 */
type DragTrashState = { active: boolean; armed: boolean };

let state: DragTrashState = { active: false, armed: false };
const listeners = new Set<() => void>();

export function setDragTrash(next: Partial<DragTrashState>) {
  const merged = { ...state, ...next };
  if (merged.active === state.active && merged.armed === state.armed) return;
  state = merged;
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useDragTrash(): DragTrashState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Un solo arrastre a la vez: si otro empieza, el anterior se cierra antes. */
let owner: (() => void) | null = null;

export function claimDrag(cancel: () => void) {
  if (owner && owner !== cancel) owner();
  owner = cancel;
}

export function releaseDrag(cancel: () => void) {
  if (owner === cancel) owner = null;
}

/** El + de la barra. `null` si la barra no está en pantalla. */
export function dragTrashElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('[data-drag-trash]');
}
