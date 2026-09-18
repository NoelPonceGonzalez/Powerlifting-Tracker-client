import { useCallback, useEffect, useRef } from 'react';

/**
 * Hold en táctil o ratón. El clic corto no se dispara si ya se ha lanzado el hold,
 * para que no se mezclen «seguir» y «abrir perfil».
 */
export function useLongPress(onHold: () => void, ms = 480) {
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;
  const held = useRef(false);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => () => clear(), [clear]);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      held.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        held.current = true;
        onHoldRef.current();
      }, ms);
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    suppressClick: (e: React.SyntheticEvent) => {
      if (!held.current) return false;
      e.preventDefault();
      e.stopPropagation();
      held.current = false;
      return true;
    },
  };
}
