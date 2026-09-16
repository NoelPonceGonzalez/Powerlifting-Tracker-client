import React, { useCallback, useEffect, useState } from 'react';
import { Film, Plus } from 'lucide-react';
import { mediaUrl } from '@/src/lib/api';
import { fetchStories, type FeedPost, type StoryGroup } from '@/src/lib/feedApi';
import { StoryViewer } from '@/src/components/social/StoryViewer';
import { cn } from '@/src/lib/utils';

interface StoriesRailProps {
  myId: string;
  refreshTick?: number;
  onAddStory: () => void;
}

function latestItem(group: StoryGroup): FeedPost | undefined {
  return group.items[group.items.length - 1];
}

function StoryTile({
  label,
  item,
  unseen,
  onClick,
}: {
  label: string;
  item: FeedPost;
  unseen: boolean;
  onClick: () => void;
}) {
  const src = mediaUrl(item.mediaKey);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative h-[6.5rem] w-[4.75rem] shrink-0 overflow-hidden rounded-2xl bg-slate-900 text-left',
        unseen && 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[var(--app-bg)]'
      )}
    >
      {item.mediaType === 'video' ? (
        <>
          <video src={src} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          <span className="absolute right-1.5 top-1.5 text-white/90">
            <Film size={12} />
          </span>
        </>
      ) : (
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-5 text-[11px] font-semibold leading-tight text-white">
        <span className="line-clamp-2">{label}</span>
      </span>
    </button>
  );
}

export function StoriesRail({ myId, refreshTick = 0, onAddStory }: StoriesRailProps) {
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [openAt, setOpenAt] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchStories()
      .then(r => setGroups(Array.isArray(r.groups) ? r.groups : []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const mine = groups.find(g => g.author.id === myId);
  const others = groups.filter(g => g.author.id !== myId);
  const hasAny = groups.some(g => g.items.length > 0);

  const openGroup = (authorId: string) => {
    const idx = groups.findIndex(g => g.author.id === authorId);
    if (idx >= 0) setOpenAt(idx);
  };

  return (
    <div className="mb-4 overflow-hidden rounded-[1.35rem] border border-white/40 bg-white/70 shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-slate-900/70">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Hoy</p>
          <p className="text-[11px] text-slate-400">Se borra a las 24 h</p>
        </div>
        <button
          type="button"
          onClick={onAddStory}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-indigo-600 px-3 text-[12px] font-semibold text-white"
        >
          <Plus size={14} strokeWidth={2.4} />
          Subir
        </button>
      </div>

      {hasAny ? (
        <div className="flex gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {mine && latestItem(mine) && (
            <StoryTile
              label="Tú"
              item={latestItem(mine)!}
              unseen={false}
              onClick={() => openGroup(myId)}
            />
          )}
          {others.map(g => {
            const item = latestItem(g);
            if (!item) return null;
            return (
              <StoryTile
                key={g.author.id}
                label={g.author.name.split(' ')[0]}
                item={item}
                unseen={g.items.some(s => !s.viewedByMe)}
                onClick={() => openGroup(g.author.id)}
              />
            );
          })}
        </div>
      ) : (
        <p className="px-3 pb-3 text-[12px] text-slate-400">Cuando alguien suba algo, aparece aquí el rato que dura.</p>
      )}

      {openAt != null && groups[openAt] && (
        <StoryViewer groups={groups} startGroup={openAt} onClose={() => setOpenAt(null)} />
      )}
    </div>
  );
}
