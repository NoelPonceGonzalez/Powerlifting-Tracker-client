import React from 'react';
import { mediaUrl } from '@/src/lib/api';
import { timeAgo, type ChatLine } from '@/src/lib/feedApi';
import { cn } from '@/src/lib/utils';

export function StoryReplyCard({ line, authorName }: { line: ChatLine; authorName?: string }) {
  const reply = line.storyReply;
  if (!reply) return null;

  const showPhoto = !!reply.mediaKey && reply.available !== false;
  const src = showPhoto ? mediaUrl(reply.mediaKey) : '';

  return (
    <div className={cn('flex w-full', line.mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[78%] flex-col', line.mine ? 'items-end' : 'items-start')}>
        {authorName && (
          <span className="mb-1 px-1 text-[10px] font-medium text-slate-400">{authorName}</span>
        )}

        {showPhoto && (
          <div className="mb-1.5 w-[108px] overflow-hidden rounded-[20px] bg-slate-200 shadow-sm ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10">
            <div className="aspect-[9/16] w-full">
              {reply.mediaType === 'video' ? (
                <video
                  src={src}
                  muted
                  playsInline
                  loop
                  autoPlay
                  className="h-full w-full object-cover"
                />
              ) : (
                <img src={src} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          </div>
        )}

        {(line.text || !showPhoto) && (
          <div
            className={cn(
              'max-w-full rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
              line.mine
                ? 'rounded-br-md bg-indigo-600 text-white'
                : 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'
            )}
          >
            {!showPhoto && (
              <span
                className={cn(
                  'mb-0.5 block text-[11px] font-medium',
                  line.mine ? 'text-white/70' : 'text-slate-400'
                )}
              >
                Respondió a tu historia
              </span>
            )}
            {line.text}
          </div>
        )}

        <span className="mt-1 px-1 text-[10px] text-slate-400">{timeAgo(line.createdAt)}</span>
      </div>
    </div>
  );
}
