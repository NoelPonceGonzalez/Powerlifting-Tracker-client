import { useEffect, useRef } from 'react';
import { animate, useMotionValue, useTransform } from 'motion/react';
import { STICKY } from '@/src/lib/motionPresets';

function rubber(d: number) {
  return Math.min(128, d * 0.4);
}

type Axis = 'x' | 'y';

function canScroll(el: HTMLElement, axis: Axis) {
  return axis === 'x'
    ? el.scrollWidth > el.clientWidth + 4
    : el.scrollHeight > el.clientHeight + 4;
}

function atStart(el: HTMLElement, axis: Axis) {
  return axis === 'x' ? el.scrollLeft <= 2 : el.scrollTop <= 2;
}

function atEnd(el: HTMLElement, axis: Axis) {
  return axis === 'x'
    ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
    : el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
}

function scrollerOf(el: HTMLElement, axis: Axis, from: 'self' | 'parent') {
  if (from === 'self') return el;
  const parent = el.closest<HTMLElement>('.app-scroll');
  return parent ?? el;
}

/**
 * Overscroll slime: al tope o al fondo la lista se deforma (scaleX / scaleY)
 * y el muelle la devuelve. Puede medir el scroll de un padre (.app-scroll)
 * y aplicar el chicle solo a este nodo.
 */
export function useSlimeOverscroll(
  enabled: boolean,
  axis: Axis = 'y',
  scrollFrom: 'self' | 'parent' = 'self',
  evenIfShort = false
) {
  const ref = useRef<HTMLDivElement>(null);
  const stretch = useMotionValue(0);
  const origin = useMotionValue(0);
  const last = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      stretch.set(0);
      return;
    }

    let startPos: number | null = null;
    let edge: 'start' | 'end' | 'both' | null = null;
    let wheelAcc = 0;
    let wheelTimer: number | null = null;

    const scroller = () => scrollerOf(el, axis, scrollFrom);

    const apply = (value: number, fromStart: boolean) => {
      last.current = value;
      stretch.set(value);
      origin.set(fromStart ? 0 : 1);
    };

    const release = () => {
      startPos = null;
      edge = null;
      wheelAcc = 0;
      if (wheelTimer != null) {
        window.clearTimeout(wheelTimer);
        wheelTimer = null;
      }
      if (Math.abs(last.current) < 2) {
        stretch.set(0);
        last.current = 0;
        return;
      }
      last.current = 0;
      void animate(stretch, 0, STICKY);
    };

    const client = (e: TouchEvent | PointerEvent) => {
      if ('touches' in e) {
        return axis === 'x' ? e.touches[0].clientX : e.touches[0].clientY;
      }
      return axis === 'x' ? e.clientX : e.clientY;
    };

    const onStart = (e: TouchEvent | PointerEvent) => {
      const box = scroller();
      if (!canScroll(box, axis)) {
        if (!evenIfShort) {
          startPos = null;
          edge = null;
          return;
        }
        startPos = client(e);
        edge = 'both';
        return;
      }
      const start = atStart(box, axis);
      const end = atEnd(box, axis);
      // En lista de página: el tope es pull-to-refresh; el pegajoso solo al fondo.
      if (scrollFrom === 'parent') {
        if (!end) {
          startPos = null;
          edge = null;
          return;
        }
        startPos = client(e);
        edge = 'end';
        return;
      }
      if (!start && !end) {
        startPos = null;
        edge = null;
        return;
      }
      startPos = client(e);
      edge = start && end ? 'both' : start ? 'start' : 'end';
    };

    const onMove = (e: TouchEvent | PointerEvent, prevent: boolean) => {
      if (startPos == null || !edge) return;
      const d = client(e) - startPos;
      if ((edge === 'start' || edge === 'both') && d > 0) {
        apply(rubber(d), true);
        if (prevent && d > 8) e.preventDefault();
        return;
      }
      if ((edge === 'end' || edge === 'both') && d < 0) {
        apply(-rubber(-d), false);
        if (prevent && d < -8) e.preventDefault();
        return;
      }
      last.current = 0;
      stretch.set(0);
    };

    const onTouchStart = (e: TouchEvent) => onStart(e);
    const onTouchMove = (e: TouchEvent) => onMove(e, true);
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      onStart(e);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || startPos == null) return;
      onMove(e, false);
    };

    const onWheel = (e: WheelEvent) => {
      const box = scroller();
      if (!canScroll(box, axis) && !evenIfShort) return;
      const delta = axis === 'x'
        ? (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0))
        : e.deltaY;
      if (!delta) return;
      const start = atStart(box, axis);
      const end = atEnd(box, axis);
      const pullStart = delta < 0;
      const pullEnd = delta > 0;
      if (scrollFrom === 'parent') {
        if (!(end && pullEnd)) return;
      } else if (!((start && pullStart) || (end && pullEnd))) {
        return;
      }
      e.preventDefault();
      wheelAcc += delta;
      apply(pullStart ? rubber(Math.abs(wheelAcc)) : -rubber(Math.abs(wheelAcc)), pullStart);
      if (wheelTimer != null) window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelAcc = 0;
        last.current = 0;
        void animate(stretch, 0, STICKY);
      }, 80);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', release);
    el.addEventListener('touchcancel', release);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', release);
      el.removeEventListener('touchcancel', release);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('wheel', onWheel);
      if (wheelTimer != null) window.clearTimeout(wheelTimer);
    };
  }, [enabled, axis, scrollFrom, evenIfShort, stretch, origin]);

  const scaleA = useTransform(stretch, v => 1 + v / 1500);
  const scaleB = useTransform(stretch, v => 1 - v / 1900);
  const originT = useTransform(origin, v => v);

  const slimeStyle =
    axis === 'x'
      ? { scaleX: scaleB, scaleY: scaleA, originX: originT }
      : { scaleX: scaleA, scaleY: scaleB, originY: originT };

  return { ref, slimeStyle };
}
