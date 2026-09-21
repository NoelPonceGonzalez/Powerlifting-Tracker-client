import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function Spinner({ size = 22, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-indigo-500', className)} aria-hidden />;
}

export function LoadingBlock({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-slate-400', className)}
    >
      <Spinner size={24} />
      {label ? <p className="text-sm font-medium text-slate-400">{label}</p> : <span className="sr-only">Cargando</span>}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm dark:bg-slate-900" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-3 px-3.5 py-3',
            i > 0 && 'border-t border-slate-100 dark:border-slate-800'
          )}
        >
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 max-w-[55%] animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-2.5 w-20 max-w-[35%] animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StoryBubblesSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex w-max gap-3 pr-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[4.6rem] shrink-0 text-center">
          <div className="mx-auto h-[4.35rem] w-[4.35rem] animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="mx-auto mt-2 h-2 w-10 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

export function CoverSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="flex items-center gap-5">
        <div className="h-[84px] w-[84px] shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="flex flex-1 justify-around">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-2 text-center">
              <div className="mx-auto h-4 w-8 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mx-auto h-2.5 w-12 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3.5 w-36 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
