import React, { useMemo, useRef } from 'react';
import { STORY_VIDEO_MAX_SEC, STORY_VIDEO_MIN_SEC, formatStoryTime } from '@/src/lib/storyVideo';
import { cn } from '@/src/lib/utils';

type DragKind = 'start' | 'end' | 'window';

interface StoryTrimStripProps {
  duration: number;
  start: number;
  end: number;
  thumbs: string[];
  playhead?: number;
  sizeLabel?: string;
  onChange: (start: number, end: number) => void;
}

function clampWindow(start: number, end: number, duration: number): { start: number; end: number } {
  let a = Math.max(0, start);
  let b = Math.min(duration, end);
  if (b - a < STORY_VIDEO_MIN_SEC) {
    if (a + STORY_VIDEO_MIN_SEC <= duration) b = a + STORY_VIDEO_MIN_SEC;
    else {
      b = duration;
      a = Math.max(0, b - STORY_VIDEO_MIN_SEC);
    }
  }
  if (b - a > STORY_VIDEO_MAX_SEC) {
    b = a + STORY_VIDEO_MAX_SEC;
    if (b > duration) {
      b = duration;
      a = Math.max(0, b - STORY_VIDEO_MAX_SEC);
    }
  }
  return { start: a, end: b };
}

export function StoryTrimStrip({ duration, start, end, thumbs, playhead, sizeLabel, onChange }: StoryTrimStripProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: DragKind; grab: number; len: number; start: number; end: number } | null>(null);

  const leftPct = duration > 0 ? (start / duration) * 100 : 0;
  const widthPct = duration > 0 ? ((end - start) / duration) * 100 : 0;
  const headPct =
    playhead != null && duration > 0 ? Math.min(100, Math.max(0, (playhead / duration) * 100)) : null;

  const slots = useMemo(() => {
    const n = Math.max(thumbs.length, 10);
    return Array.from({ length: n }, (_, i) => thumbs[i] || '');
  }, [thumbs]);

  const timeAt = (clientX: number) => {
    const el = barRef.current;
    if (!el || duration <= 0) return 0;
    const r = el.getBoundingClientRect();
    const t = (clientX - r.left) / Math.max(1, r.width);
    return Math.min(duration, Math.max(0, t * duration));
  };

  const begin = (kind: DragKind, clientX: number) => {
    drag.current = { kind, grab: timeAt(clientX) - start, len: end - start, start, end };
  };

  const move = (clientX: number) => {
    if (!drag.current) return;
    const t = timeAt(clientX);
    const { kind, grab, len, start: s0, end: e0 } = drag.current;
    if (kind === 'start') {
      const next = clampWindow(t, e0, duration);
      drag.current.start = next.start;
      drag.current.end = next.end;
      drag.current.len = next.end - next.start;
      onChange(next.start, next.end);
      return;
    }
    if (kind === 'end') {
      const next = clampWindow(s0, t, duration);
      drag.current.start = next.start;
      drag.current.end = next.end;
      drag.current.len = next.end - next.start;
      onChange(next.start, next.end);
      return;
    }
    const nextStart = Math.min(Math.max(0, t - grab), Math.max(0, duration - len));
    const next = clampWindow(nextStart, nextStart + len, duration);
    onChange(next.start, next.end);
  };

  const stop = () => {
    drag.current = null;
  };

  return (
    <div className="space-y-2">
      <div
        className="relative"
        onPointerMove={e => {
          if (e.buttons) move(e.clientX);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div
          ref={barRef}
          className="relative h-[4.5rem] touch-none select-none overflow-hidden rounded-lg bg-zinc-900"
        >
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
          className="absolute -top-1 bottom-0"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(widthPct, 8)}%`,
          }}
          onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect();
            const edge = 28;
            const kind: DragKind =
              e.clientX <= r.left + edge ? 'start' : e.clientX >= r.right - edge ? 'end' : 'window';
            begin(kind, e.clientX);
            move(e.clientX);
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-1 bottom-0 border-y-[3px] border-white" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-white" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-white" />
          <Handle side="start" />
          <Handle side="end" />
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

function Handle({ side }: { side: 'start' | 'end' }) {
  return (
    <div
      className={cn(
        'absolute top-0 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center',
        side === 'start' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'
      )}
    >
      <span className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)] ring-2 ring-black/20" />
    </div>
  );
}
