import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORY_VIDEO_MAX_SEC, STORY_VIDEO_MIN_SEC, formatStoryTime } from '@/src/lib/storyVideo';
import { cn } from '@/src/lib/utils';

export type TrimEdge = 'start' | 'end' | 'window';

interface StoryTrimStripProps {
  duration: number;
  start: number;
  end: number;
  thumbs: string[];
  playhead?: number;
  sizeLabel?: string;
  onChange: (start: number, end: number, edge: TrimEdge) => void;
  /** Al empezar a arrastrar: el llamador pausa la vista previa para que no dé tirones. */
  onDragStart?: () => void;
  onCommit?: (start: number, end: number) => void;
}

/** Margen de agarre de cada asa. Con menos, en el móvil se coge la ventana sin querer. */
const HANDLE_HIT_PX = 24;

function clampWindow(start: number, end: number, duration: number): { start: number; end: number } {
  const maxLen = Math.min(STORY_VIDEO_MAX_SEC, duration);
  const minLen = Math.min(STORY_VIDEO_MIN_SEC, duration);
  let a = Math.min(Math.max(0, start), duration);
  let b = Math.min(Math.max(a, end), duration);
  if (b - a < minLen) {
    if (a + minLen <= duration) b = a + minLen;
    else {
      b = duration;
      a = Math.max(0, b - minLen);
    }
  }
  if (b - a > maxLen) b = a + maxLen;
  return { start: a, end: b };
}

/** Los fotogramas llegan de uno en uno: aparte para no repintarlos al arrastrar. */
const TrimThumbs = React.memo(function TrimThumbs({ thumbs }: { thumbs: string[] }) {
  const slots = useMemo(() => {
    const n = Math.max(thumbs.length, 10);
    return Array.from({ length: n }, (_, i) => thumbs[i] || '');
  }, [thumbs]);

  return (
    <div className="absolute inset-0 flex">
      {slots.map((src, i) => (
        <div key={i} className="relative min-w-0 flex-1 overflow-hidden">
          {src ? (
            <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-gradient-to-b from-zinc-700 to-zinc-950" />
          )}
          {i < slots.length - 1 && <span className="absolute inset-y-0 right-0 w-px bg-black/40" />}
        </div>
      ))}
    </div>
  );
});

export function StoryTrimStrip({
  duration,
  start,
  end,
  thumbs,
  playhead,
  sizeLabel,
  onChange,
  onDragStart,
  onCommit,
}: StoryTrimStripProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: TrimEdge;
    pointerId: number;
    grab: number;
    len: number;
    anchorStart: number;
    anchorEnd: number;
    last: { start: number; end: number };
  } | null>(null);
  /** El puntero manda muchos más eventos que fotogramas pinta la pantalla. */
  const pendingX = useRef<number | null>(null);
  const raf = useRef(0);
  const [activeEdge, setActiveEdge] = useState<TrimEdge | null>(null);

  const leftPct = duration > 0 ? (start / duration) * 100 : 0;
  const widthPct = duration > 0 ? ((end - start) / duration) * 100 : 0;
  const headPct =
    playhead != null && duration > 0 ? Math.min(100, Math.max(0, (playhead / duration) * 100)) : null;

  const timeAt = useCallback(
    (clientX: number) => {
      const el = barRef.current;
      if (!el || duration <= 0) return 0;
      const r = el.getBoundingClientRect();
      const t = (clientX - r.left) / Math.max(1, r.width);
      return Math.min(duration, Math.max(0, t * duration));
    },
    [duration]
  );

  const apply = useCallback(
    (clientX: number) => {
      const d = drag.current;
      if (!d || duration <= 0) return;
      // `grab` es la distancia dedo → asa al empezar: así el asa no salta al primer toque.
      const t = timeAt(clientX) - d.grab;
      let next: { start: number; end: number };

      if (d.kind === 'start') {
        const minStart = Math.max(0, d.anchorEnd - STORY_VIDEO_MAX_SEC);
        const maxStart = Math.max(minStart, d.anchorEnd - STORY_VIDEO_MIN_SEC);
        next = clampWindow(Math.min(Math.max(t, minStart), maxStart), d.anchorEnd, duration);
      } else if (d.kind === 'end') {
        const minEnd = Math.min(duration, d.anchorStart + STORY_VIDEO_MIN_SEC);
        const maxEnd = Math.min(duration, d.anchorStart + STORY_VIDEO_MAX_SEC);
        next = clampWindow(d.anchorStart, Math.max(minEnd, Math.min(t, maxEnd)), duration);
      } else {
        const nextStart = Math.min(Math.max(0, t), Math.max(0, duration - d.len));
        next = clampWindow(nextStart, nextStart + d.len, duration);
      }

      if (Math.abs(next.start - d.last.start) < 0.01 && Math.abs(next.end - d.last.end) < 0.01) return;
      d.last = next;
      onChange(next.start, next.end, d.kind);
    },
    [duration, onChange, timeAt]
  );

  const flush = useCallback(() => {
    raf.current = 0;
    const x = pendingX.current;
    pendingX.current = null;
    if (x != null) apply(x);
  }, [apply]);

  const schedule = useCallback(
    (clientX: number) => {
      pendingX.current = clientX;
      if (raf.current) return;
      raf.current = requestAnimationFrame(flush);
    },
    [flush]
  );

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    []
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = barRef.current;
    if (!el || duration <= 0) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const startPx = (leftPct / 100) * r.width;
    const endPx = ((leftPct + widthPct) / 100) * r.width;

    // Con la ventana en el mínimo las dos asas quedan juntas: manda la más cercana al dedo.
    const dStart = Math.abs(x - startPx);
    const dEnd = Math.abs(x - endPx);
    let kind: TrimEdge;
    if (Math.min(dStart, dEnd) <= HANDLE_HIT_PX) kind = dStart <= dEnd ? 'start' : 'end';
    else if (x > startPx && x < endPx) kind = 'window';
    else return;

    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind,
      pointerId: e.pointerId,
      grab: timeAt(e.clientX) - (kind === 'end' ? end : start),
      len: end - start,
      anchorStart: start,
      anchorEnd: end,
      last: { start, end },
    };
    setActiveEdge(kind);
    onDragStart?.();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    schedule(e.clientX);
  };

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    const x = pendingX.current;
    pendingX.current = null;
    if (x != null) apply(x);
    const last = drag.current?.last ?? { start, end };
    drag.current = null;
    setActiveEdge(null);
    onCommit?.(last.start, last.end);
  };

  return (
    <div className="space-y-2">
      <div
        className="relative touch-none select-none py-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div ref={barRef} className="relative h-[4.5rem] overflow-hidden rounded-lg bg-zinc-900">
          <TrimThumbs thumbs={thumbs} />

          <div className="absolute inset-y-0 left-0 bg-black/60" style={{ width: `${leftPct}%` }} />
          <div
            className="absolute inset-y-0 right-0 bg-black/60"
            style={{ width: `${Math.max(0, 100 - leftPct - widthPct)}%` }}
          />

          {headPct != null && (
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90"
              style={{ left: `${headPct}%` }}
            />
          )}
        </div>

        <div
          className="pointer-events-none absolute inset-y-1"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          <div className="absolute inset-0 rounded-[4px] border-y-[3px] border-white" />
          <div className="absolute inset-y-0 left-0 w-[3px] bg-white" />
          <div className="absolute inset-y-0 right-0 w-[3px] bg-white" />
          <Handle side="start" active={activeEdge === 'start'} />
          <Handle side="end" active={activeEdge === 'end'} />
        </div>
      </div>

      <div className="flex items-center justify-between px-0.5 text-[12px] font-semibold tabular-nums text-white/80">
        <span>
          {formatStoryTime(end - start)}
          {sizeLabel ? ` · ${sizeLabel}` : ''}
        </span>
        <span className="text-[11px] font-medium text-white/45">
          {formatStoryTime(start)}–{formatStoryTime(end)}
        </span>
      </div>
    </div>
  );
}

function Handle({ side, active }: { side: 'start' | 'end'; active: boolean }) {
  return (
    <div
      className={cn(
        'absolute top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center',
        side === 'start' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'
      )}
    >
      <span
        className={cn(
          'rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)] ring-2 ring-black/20 transition-transform duration-100',
          active ? 'h-[22px] w-[22px] scale-110' : 'h-[18px] w-[18px]'
        )}
      />
    </div>
  );
}
