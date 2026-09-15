import { useEffect, useRef } from 'react';

/** Sobrevive a remounts: si no, el modal se volvería a abrir al cambiar de pestaña. */
const lastByKey = new Map<string, number>();

/**
 * Solo dispara cuando el número sube. Un remount no cuenta como subida.
 * Si el contador vuelve a 0 (cambio de cuenta), se resetea sin abrir nada.
 */
export function useIncrementSignal(key: string, signal: number | undefined, onIncrement: () => void) {
  const cb = useRef(onIncrement);
  cb.current = onIncrement;

  useEffect(() => {
    const next = signal ?? 0;
    const last = lastByKey.get(key) ?? 0;
    if (next < last) {
      lastByKey.set(key, next);
      return;
    }
    if (next > last) {
      lastByKey.set(key, next);
      cb.current();
    }
  }, [key, signal]);
}
