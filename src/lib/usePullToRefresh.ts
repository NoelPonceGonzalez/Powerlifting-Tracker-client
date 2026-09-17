import { useEffect, useRef, useState, type RefObject } from 'react';

const THRESHOLD = 56;

/**
 * Pull-to-refresh on the nearest `.app-scroll` ancestor.
 * Only starts when that scroller is at the top, so it does not fight normal scroll.
 */
export function usePullToRefresh(
  hostRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onRefresh: () => Promise<void> | void
) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const pullPx = useRef(0);
  const busyRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) {
      startY.current = null;
      pulling.current = false;
      pullPx.current = 0;
      setPull(0);
      return;
    }

    const root = hostRef.current?.closest('.app-scroll') as HTMLElement | null;
    if (!root) return;

    const finish = () => {
      const should = pulling.current && pullPx.current >= THRESHOLD && !busyRef.current;
      startY.current = null;
      pulling.current = false;
      pullPx.current = 0;
      setPull(0);
      if (!should) return;
      busyRef.current = true;
      setBusy(true);
      void Promise.resolve(onRefreshRef.current()).finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
    };

    const onStart = (e: TouchEvent) => {
      if (busyRef.current) return;
      if (root.scrollTop > 4) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      pulling.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busyRef.current) return;
      if (root.scrollTop > 4) {
        startY.current = null;
        pulling.current = false;
        pullPx.current = 0;
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        pulling.current = false;
        pullPx.current = 0;
        setPull(0);
        return;
      }
      pulling.current = true;
      const next = Math.min(96, dy * 0.55);
      pullPx.current = next;
      setPull(next);
      if (dy > 8) e.preventDefault();
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', finish);
    root.addEventListener('touchcancel', finish);
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', finish);
      root.removeEventListener('touchcancel', finish);
    };
  }, [enabled, hostRef]);

  return { pull, busy };
}
