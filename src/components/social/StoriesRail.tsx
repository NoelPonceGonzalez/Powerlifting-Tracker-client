import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { fetchOwnProfile, fetchStories, type StoryGroup } from '@/src/lib/feedApi';
import { StoryViewer } from '@/src/components/social/StoryViewer';
import { cn } from '@/src/lib/utils';
import { isRealtimeOpen } from '@/src/lib/chatRealtime';

interface StoriesRailProps {
  myId: string;
  myAvatar?: string | null;
  myName?: string | null;
  refreshTick?: number;
  onAddStory: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  pageActive?: boolean;
}

function groupUnseen(group: StoryGroup) {
  return group.items.some(s => !s.viewedByMe);
}

function Bubble({
  name,
  avatar,
  avatarName,
  unseen,
  add,
  items = [],
  onClick,
  onAdd,
}: {
  name: string;
  avatar?: string | null;
  avatarName?: string | null;
  unseen: boolean;
  add?: boolean;
  items?: Array<{ viewedByMe?: boolean }>;
  onClick: () => void;
  onAdd?: () => void;
}) {
  const hasStory = items.length > 0;
  return (
    <button type="button" onClick={onClick} className="w-[4.6rem] shrink-0 text-center">
      <span
        className={cn(
          'mx-auto flex h-[4.35rem] w-[4.35rem] items-center justify-center rounded-full',
          hasStory ? 'p-[3px]' : 'p-0',
          hasStory && unseen && 'bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600',
          hasStory && !unseen && 'bg-slate-200 opacity-70 dark:bg-slate-700'
        )}
      >
        <span className="relative block h-full w-full rounded-full bg-[var(--app-bg)] p-[2px]">
          <Avatar src={avatar} name={avatarName || name} className="h-full w-full rounded-full" />
          {add && (
            <span
              role={onAdd ? 'button' : undefined}
              aria-label="Añadir otra historia"
              onClick={onAdd ? e => { e.stopPropagation(); onAdd(); } : undefined}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white ring-2 ring-[var(--app-bg)]"
            >
              <Plus size={14} strokeWidth={2.6} />
            </span>
          )}
        </span>
      </span>
      <span className="mt-1.5 block truncate px-0.5 text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-300">
        {name}
      </span>
    </button>
  );
}

function dropItem(list: StoryGroup[], postId: string) {
  return list
    .map(g => ({ ...g, items: g.items.filter(s => s.id !== postId) }))
    .filter(g => g.items.length > 0);
}

export function StoriesRail({ myId, myAvatar, myName, refreshTick = 0, onAddStory, leading, trailing, pageActive = true }: StoriesRailProps) {
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [watching, setWatching] = useState<StoryGroup[] | null>(null);
  const [myFace, setMyFace] = useState<string | null>(myAvatar ?? null);
  const [myLabel, setMyLabel] = useState(myName || '');

  useEffect(() => {
    if (myAvatar) setMyFace(myAvatar);
  }, [myAvatar]);

  useEffect(() => {
    if (myName) setMyLabel(myName);
  }, [myName]);

  const load = useCallback(async () => {
    try {
      const [r, me] = await Promise.all([
        fetchStories(),
        fetchOwnProfile().catch(() => null),
      ]);
      setGroups(Array.isArray(r.groups) ? r.groups : []);
      if (me?.avatar) setMyFace(me.avatar);
      if (me?.name) setMyLabel(me.name);
    } catch {
      /* se deja lo último visto */
    }
  }, []);

  useEffect(() => {
    if (!pageActive) return;
    void load();
  }, [load, refreshTick, pageActive]);

  useEffect(() => {
    if (!pageActive) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (isRealtimeOpen()) return;
      void load();
    };
    const id = window.setInterval(tick, 45000);
    return () => window.clearInterval(id);
  }, [load, pageActive]);

  const mineRaw = groups.find(g => g.author.id === myId);
  const mine = mineRaw
    ? { ...mineRaw, author: { ...mineRaw.author, avatar: myFace || mineRaw.author.avatar } }
    : undefined;
  const others = groups.filter(g => g.author.id !== myId && g.items.length > 0);
  const unseen = others.filter(groupUnseen);
  const seen = others.filter(g => !groupUnseen(g));
  const ordered = useMemo(() => {
    const rest = [...unseen, ...seen];
    return mine && mine.items.length > 0 ? [mine, ...rest] : rest;
  }, [mine, unseen, seen]);

  const openGroup = (authorId: string) => {
    if (authorId === myId && mine && mine.items.length > 0) {
      setWatching([mine]);
      setOpenAt(0);
      return;
    }
    const rest = [...unseen, ...seen];
    const idx = rest.findIndex(g => g.author.id === authorId);
    if (idx < 0) return;
    setWatching(rest.slice(idx));
    setOpenAt(0);
  };

  const closeViewer = () => {
    setOpenAt(null);
    setWatching(null);
    void load();
  };

  const viewerGroups = watching ?? ordered;

  return (
    <div className="-mx-1">
      <div className="relative">
        {(leading || trailing) && (
          <div className="relative z-30 flex items-center justify-between px-0.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              {leading}
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-visible">
              {trailing}
            </div>
          </div>
        )}
        <div className="app-h-scroll min-w-0 px-1 pb-1.5">
          <div className="flex w-max gap-3 pr-3">
            {mine && mine.items.length > 0 ? (
              <Bubble
                name="Tu historia"
                avatarName={myLabel || mine.author.name}
                avatar={myFace || mine.author.avatar}
                unseen={groupUnseen(mine)}
                add
                items={mine.items}
                onClick={() => openGroup(myId)}
                onAdd={onAddStory}
              />
            ) : (
              <Bubble name="Tu historia" avatarName={myLabel} avatar={myFace} unseen={false} add onClick={onAddStory} />
            )}
            {unseen.map(g => (
              <Bubble
                key={g.author.id}
                name={g.author.name.split(' ')[0]}
                avatar={g.author.avatar}
                unseen
                items={g.items}
                onClick={() => openGroup(g.author.id)}
              />
            ))}
            {seen.map(g => (
              <Bubble
                key={g.author.id}
                name={g.author.name.split(' ')[0]}
                avatar={g.author.avatar}
                unseen={false}
                items={g.items}
                onClick={() => openGroup(g.author.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {openAt != null && viewerGroups[openAt] && (
        <StoryViewer
          groups={viewerGroups}
          startGroup={openAt}
          onAddStory={() => {
            closeViewer();
            onAddStory();
          }}
          onClose={closeViewer}
          onDeleted={postId => {
            setGroups(prev => dropItem(prev, postId));
            setWatching(prev => (prev ? dropItem(prev, postId) : prev));
          }}
          onViewed={postId => {
            setGroups(prev =>
              prev.map(g => ({
                ...g,
                items: g.items.map(s => (s.id === postId ? { ...s, viewedByMe: true } : s)),
              }))
            );
          }}
        />
      )}
    </div>
  );
}
