import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { Eye, Heart, Loader2, Plus, Search, Send, Trash2, X } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { mediaUrl } from '@/src/lib/api';
import { addComment, fetchStories, markStoryViewed, removePost, toggleLike, type FeedAuthor, type StoryGroup } from '@/src/lib/feedApi';
import { showAppError } from '@/src/lib/appNotice';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import { subscribeSocialRealtime } from '@/src/lib/socialRealtime';
import { StoryLikeHeart } from '@/src/components/social/StoryLikeHeart';

const SOFT = { duration: 0.28, ease: EASE_OUT };
const STORY_MS = 5200;

function hoursLeft(expiresAt: string | null): string {
  if (!expiresAt) return '24 h';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'ahora';
  const h = Math.max(1, Math.round(ms / 3600000));
  return `${h} h`;
}

function firstUnseenIndex(group?: StoryGroup, seen?: Set<string>) {
  if (!group) return 0;
  const idx = group.items.findIndex(s => !s.viewedByMe && !seen?.has(s.id));
  return idx >= 0 ? idx : 0;
}

function isSeen(item: { id: string; viewedByMe?: boolean }, seen: Set<string>) {
  return !!item.viewedByMe || seen.has(item.id);
}

function nextUnseen(
  groups: StoryGroup[],
  gi: number,
  ii: number,
  seen: Set<string>,
) {
  for (let g = gi; g < groups.length; g++) {
    const start = g === gi ? ii + 1 : 0;
    const group = groups[g];
    for (let i = start; i < group.items.length; i++) {
      if (!isSeen(group.items[i], seen)) {
        return { gi: g, ii: i, group, item: group.items[i] };
      }
    }
  }
  return null;
}

function neighborOf(groups: StoryGroup[], gi: number, ii: number, dir: number) {
  const group = groups[gi];
  if (!group) return null;
  const nextI = ii + dir;
  if (nextI >= 0 && nextI < group.items.length) {
    return { gi, ii: nextI, group, item: group.items[nextI] };
  }
  const nextG = gi + dir;
  const other = groups[nextG];
  if (!other) return null;
  const idx = dir > 0 ? 0 : Math.max(0, other.items.length - 1);
  return { gi: nextG, ii: idx, group: other, item: other.items[idx] };
}

interface StoryViewerProps {
  groups: StoryGroup[];
  startGroup: number;
  onClose: () => void;
  onAddStory?: () => void;
  onDeleted?: (postId: string) => void;
  onViewed?: (postId: string) => void;
}

export function StoryViewer({ groups, startGroup, onClose, onAddStory, onDeleted, onViewed }: StoryViewerProps) {
  const [gi, setGi] = useState(startGroup);
  const [ii, setIi] = useState(() => firstUnseenIndex(groups[startGroup]));
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBurst, setLikeBurst] = useState(0);
  const [likers, setLikers] = useState<FeedAuthor[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sentHint, setSentHint] = useState(false);
  const [insights, setInsights] = useState(false);
  const [insightsTab, setInsightsTab] = useState<'all' | 'likes'>('all');
  const [insightsQuery, setInsightsQuery] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [loadGen, setLoadGen] = useState(0);

  const skipTap = useRef(false);
  const viewedRef = useRef(new Set<string>());
  const busy = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const giRef = useRef(gi);
  const iiRef = useRef(ii);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const openedAt = useRef(Date.now());
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    t: number;
    axis: 'h' | 'v' | null;
  } | null>(null);
  const itemRef = useRef<StoryGroup['items'][number] | undefined>(undefined);
  const likeCountRef = useRef(0);
  const insightsRef = useRef(insights);
  const remainRef = useRef(STORY_MS);
  const stepping = useRef(false);
  giRef.current = gi;
  iiRef.current = ii;
  likeCountRef.current = likeCount;
  insightsRef.current = insights;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pullY = useTransform(y, v => Math.max(0, v) * 0.38);
  const scale = useTransform(y, [0, 420], [1, 0.72]);
  const radius = useTransform(y, [0, 70], [0, 28]);
  const veil = useTransform(y, [0, 240], [1, 0]);

  const group = groups[gi];
  const item = group?.items[ii];
  itemRef.current = item;
  const mediaReady = !!item && readyId === item.id;

  const resetCard = useCallback(() => {
    void animate(x, 0, SOFT);
    void animate(y, 0, SOFT);
  }, [x, y]);

  const dismiss = useCallback(async (way: 'down' | 'left' | 'right' = 'down') => {
    if (leaving || busy.current) return;
    busy.current = true;
    setLeaving(true);
    setPaused(true);
    if (way === 'left') await animate(x, -120, SOFT);
    else if (way === 'right') await animate(x, 120, SOFT);
    else await animate(y, Math.max(y.get(), 360), SOFT);
    onClose();
  }, [leaving, onClose, x, y]);

  const closeInsights = useCallback(() => {
    setInsights(false);
    setInsightsTab('all');
    setInsightsQuery('');
  }, []);

  useEscapeClose(true, () => {
    if (askDelete) {
      setAskDelete(false);
      return;
    }
    if (insightsRef.current) {
      closeInsights();
      return;
    }
    void dismiss('down');
  });

  const finishForward = useCallback(() => {
    if (stepping.current || busy.current || leaving) return;
    const next = neighborOf(groups, giRef.current, iiRef.current, 1);
    if (!next) {
      void dismiss('left');
      return;
    }
    stepping.current = true;
    setGi(next.gi);
    setIi(next.ii);
    x.set(0);
    y.set(0);
    window.setTimeout(() => { stepping.current = false; }, 220);
  }, [dismiss, groups, leaving, x, y]);

  const go = useCallback((nextDir: number) => {
    if (skipTap.current) {
      skipTap.current = false;
      return;
    }
    if (busy.current || leaving || insights || askDelete) return;
    if (nextDir > 0) {
      finishForward();
      return;
    }
    const next = neighborOf(groups, giRef.current, iiRef.current, nextDir);
    if (!next) {
      void dismiss('right');
      return;
    }
    setGi(next.gi);
    setIi(next.ii);
    x.set(0);
    y.set(0);
  }, [askDelete, dismiss, finishForward, groups, insights, leaving, x, y]);

  useEffect(() => {
    if (!item) return;
    setLiked(!!item.likedByMe);
    setLikeCount(item.likeCount ?? 0);
    setLikers(item.likers ?? []);
    setLikeBurst(0);
    setComment('');
    setSentHint(false);
    setPaused(false);
    setInsights(false);
    setInsightsTab('all');
    setInsightsQuery('');
    setAskDelete(false);
    setLoadGen(0);
    remainRef.current = STORY_MS;
    stepping.current = false;
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    if (viewedRef.current.has(item.id)) return;
    viewedRef.current.add(item.id);
    if (item.viewedByMe) return;
    void markStoryViewed(item.id)
      .then(() => onViewed?.(item.id))
      .catch(() => {});
  }, [item?.id, item?.viewedByMe, onViewed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || item?.mediaType !== 'video') return;
    if (paused || insights || leaving || askDelete) video.pause();
    else void video.play().catch(() => {});
  }, [paused, insights, leaving, askDelete, item?.id, item?.mediaType]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  useEffect(() => {
    if (!item || !mediaReady || item.mediaType === 'video' || leaving || askDelete || insights) return;
    if (paused) return;
    const started = Date.now();
    const left = Math.max(120, remainRef.current);
    const t = window.setTimeout(() => finishForward(), left);
    return () => {
      window.clearTimeout(t);
      remainRef.current = Math.max(0, remainRef.current - (Date.now() - started));
    };
  }, [askDelete, finishForward, insights, item?.id, item?.mediaType, leaving, mediaReady, paused]);

  useEffect(() => {
    if (!item || mediaReady || insights || askDelete || leaving) return;
    const retry = window.setTimeout(() => setLoadGen(g => (g === 0 ? 1 : g)), 3500);
    const giveUp = window.setTimeout(() => finishForward(), 9000);
    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(giveUp);
    };
  }, [askDelete, finishForward, insights, item?.id, leaving, loadGen, mediaReady]);

  useEffect(() => {
    const nxt = nextUnseen(groups, gi, ii, viewedRef.current) ?? neighborOf(groups, gi, ii, 1);
    if (!nxt || nxt.item.mediaType !== 'image') return;
    const preload = new Image();
    preload.src = mediaUrl(nxt.item.mediaKey);
  }, [gi, groups, ii, item?.id]);

  const playLikeLand = useCallback(() => {
    setLikeBurst(n => n + 1);
  }, []);

  useEffect(() => {
    return subscribeSocialRealtime(ev => {
      const cur = itemRef.current;
      if (!cur?.mine || ev.kind !== 'story_like' || ev.postId !== cur.id) return;
      const next = typeof ev.likeCount === 'number' ? ev.likeCount : likeCountRef.current + 1;
      if (next <= likeCountRef.current) return;
      playLikeLand();
      setLikeCount(next);
      likeCountRef.current = next;
      if (ev.fromId && ev.fromName) {
        setLikers(prev => (prev.some(p => p.id === ev.fromId) ? prev : [...prev, { id: ev.fromId, name: ev.fromName || '', avatar: null }]));
      }
      if (!insightsRef.current) {
        setPaused(true);
        window.setTimeout(() => {
          if (!insightsRef.current) setPaused(false);
        }, 900);
      }
      void fetchStories()
        .then(r => {
          const found = r.groups.flatMap(g => g.items).find(s => s.id === cur.id);
          if (!found) return;
          setLikeCount(found.likeCount ?? next);
          setLikers(found.likers ?? []);
        })
        .catch(() => {});
    });
  }, [playLikeLand]);

  useEffect(() => {
    if (!item?.mine) return;
    const id = window.setInterval(() => {
      void fetchStories()
        .then(r => {
          const found = r.groups.flatMap(g => g.items).find(s => s.id === item.id);
          if (!found) return;
          const next = found.likeCount ?? 0;
          if (next > likeCountRef.current) {
            playLikeLand();
            setLikeCount(next);
            likeCountRef.current = next;
            setLikers(found.likers ?? []);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(id);
  }, [item?.id, item?.mine, playLikeLand]);

  const onLike = async () => {
    if (!item || item.mine) return;
    const next = !liked;
    setLiked(next);
    setLikeCount(c => Math.max(0, c + (next ? 1 : -1)));
    if (next) {
      playLikeLand();
      setPaused(true);
      window.setTimeout(() => {
        if (!insightsRef.current) setPaused(false);
      }, 1000);
    }
    try {
      const res = await toggleLike(item.id);
      setLiked(res.likedByMe);
      setLikeCount(res.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount(c => Math.max(0, c + (next ? -1 : 1)));
    }
  };

  const onReply = async () => {
    const text = comment.trim();
    if (!item || item.mine || !text || sending) return;
    const postId = item.id;
    setSending(true);
    setComment('');
    setSentHint(true);
    setPaused(true);
    try {
      await addComment(postId, text);
      window.setTimeout(() => {
        setSentHint(false);
        setPaused(false);
      }, 1600);
    } catch (e) {
      setComment(text);
      setSentHint(false);
      showAppError('No se ha podido enviar el mensaje.', e);
    } finally {
      setSending(false);
    }
  };

  const onDeleteThis = async () => {
    if (!item?.mine || deleting) return;
    const id = item.id;
    const leftover = group.items.filter(s => s.id !== id).length;
    setDeleting(true);
    try {
      await removePost(id);
      setAskDelete(false);
      onDeleted?.(id);
      if (leftover === 0) onClose();
    } catch (e) {
      showAppError('No se ha podido borrar esta historia.', e);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!groups.length) {
      if (!leaving) onClose();
      return;
    }
    if (gi >= groups.length || !groups[gi]?.items.length) {
      if (!leaving) onClose();
      return;
    }
    if (ii >= groups[gi].items.length) setIi(groups[gi].items.length - 1);
  }, [gi, groups, ii, leaving, onClose]);

  const clearHold = () => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onCardPointerDown = (e: React.PointerEvent) => {
    if (Date.now() - openedAt.current < 160) return;
    if (insights || leaving || askDelete || busy.current) return;
    if ((e.target as HTMLElement).closest('[data-chrome],input,textarea,form')) return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), axis: null };
    holdTimer.current = window.setTimeout(() => setPaused(true), 160);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCardPointerMove = (e: React.PointerEvent) => {
    const start = pointer.current;
    if (!start || start.id !== e.pointerId || insights || leaving) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      start.axis = Math.abs(dy) > Math.abs(dx) * 1.05 ? 'v' : 'h';
      clearHold();
      setPaused(true);
    }
    if (start.axis === 'v') {
      y.set(Math.max(0, dy));
      x.set(0);
      return;
    }
    x.set(dx * 0.18);
    y.set(0);
  };

  const onCardPointerUp = (e: React.PointerEvent) => {
    const start = pointer.current;
    pointer.current = null;
    clearHold();
    if (!start || start.id !== e.pointerId) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = Math.max(1, Date.now() - start.t);
    const vx = dx / dt;
    const vy = dy / dt;

    if (!start.axis) {
      if (!comment.trim() && !insights) setPaused(false);
      const tapX = e.clientX;
      const mid = (typeof window === 'undefined' ? 400 : window.innerWidth) * 0.42;
      go(tapX < mid ? -1 : 1);
      return;
    }

    skipTap.current = true;
    window.setTimeout(() => { skipTap.current = false; }, 220);

    if (start.axis === 'v') {
      if (dy > 110 || vy > 0.75) {
        void dismiss('down');
        return;
      }
      if (!comment.trim() && !insights) setPaused(false);
      resetCard();
      return;
    }

    if (dx < -56 || vx < -0.7) {
      go(1);
      return;
    }
    if (dx > 56 || vx > 0.7) {
      go(-1);
      return;
    }
    if (!comment.trim() && !insights) setPaused(false);
    resetCard();
  };

  const viewers = item?.viewers ?? [];
  const likerIds = useMemo(() => new Set(likers.map(u => u.id)), [likers]);
  const insightPeople = useMemo(() => {
    const byId = new Map<string, FeedAuthor>();
    for (const person of viewers) byId.set(person.id, person);
    for (const person of likers) {
      if (!byId.has(person.id)) byId.set(person.id, person);
    }
    const q = insightsQuery.trim().toLowerCase();
    return Array.from(byId.values())
      .filter(person => (insightsTab === 'likes' ? likerIds.has(person.id) : true))
      .filter(person => !q || person.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aLike = likerIds.has(a.id) ? 0 : 1;
        const bLike = likerIds.has(b.id) ? 0 : 1;
        if (aLike !== bLike) return aLike - bLike;
        return a.name.localeCompare(b.name, 'es');
      });
  }, [insightsQuery, insightsTab, likerIds, likers, viewers]);

  if (typeof document === 'undefined' || !group || !item) return null;

  const srcBase = mediaUrl(item.mediaKey);
  const src = loadGen > 0 ? `${srcBase}${srcBase.includes('?') ? '&' : '?'}r=${loadGen}` : srcBase;
  const playing = mediaReady && !paused && !insights && !leaving && !askDelete;

  const markReady = (id: string, ok = true) => {
    if (!ok || id !== item.id) return;
    setReadyId(id);
  };

  return createPortal(
    <div className="fixed inset-0 z-[130000] overflow-hidden text-white">
      <motion.div className="absolute inset-0 bg-black" style={{ opacity: veil }} />

      <motion.div
        style={{ x, y: pullY, scale, borderRadius: radius }}
        className="absolute inset-0 origin-center touch-none select-none overflow-hidden bg-black"
        onPointerDown={onCardPointerDown}
        onPointerMove={onCardPointerMove}
        onPointerUp={onCardPointerUp}
        onPointerCancel={onCardPointerUp}
      >
        <div key={item.id} className="absolute inset-0 bg-black">
            {item.mediaType === 'video' ? (
              <video
                ref={videoRef}
                src={src}
                autoPlay
                playsInline
                muted={false}
                draggable={false}
                className="h-full w-full object-cover"
                onLoadedData={e => {
                  if (e.currentTarget.videoWidth > 0) markReady(item.id);
                }}
                onCanPlay={e => {
                  if (e.currentTarget.readyState >= 2) markReady(item.id);
                }}
                onEnded={() => { if (!paused && !insights && !leaving) finishForward(); }}
              />
            ) : (
              <img
                key={src}
                src={src}
                alt={item.caption || ''}
                draggable={false}
                decoding="async"
                className="h-full w-full object-cover"
                onLoad={e => {
                  const el = e.currentTarget;
                  if (el.naturalWidth < 1) return;
                  if (typeof el.decode === 'function') {
                    void el.decode().then(() => markReady(item.id)).catch(() => markReady(item.id));
                    return;
                  }
                  markReady(item.id);
                }}
                onError={() => {
                  if (loadGen < 2) setLoadGen(g => g + 1);
                }}
                ref={el => {
                  if (el?.complete && el.naturalWidth > 0) markReady(item.id);
                }}
              />
            )}
            {!mediaReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 size={28} className="animate-spin text-white/70" />
              </div>
            )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex gap-1">
            {group.items.map((s, idx) => (
              <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  key={`${s.id}-${idx === ii && mediaReady ? 'run' : 'wait'}`}
                  className="h-full bg-white"
                  onAnimationEnd={e => {
                    if (idx !== ii || e.animationName !== 'story-bar') return;
                    finishForward();
                  }}
                  style={
                    idx < ii
                      ? { width: '100%' }
                      : idx > ii || (idx === ii && !mediaReady)
                        ? { width: '0%' }
                        : item.mediaType === 'video'
                          ? { width: '100%' }
                          : {
                              width: '100%',
                              animation: `story-bar ${STORY_MS}ms linear forwards`,
                              animationPlayState: playing ? 'running' : 'paused',
                            }
                  }
                />
              </div>
            ))}
          </div>
          <style>{`@keyframes story-bar { from { width: 0% } to { width: 100% } }`}</style>
          <div className="pointer-events-auto flex items-center gap-3">
            <Avatar src={group.author.avatar} name={group.author.name} className="h-8 w-8 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{group.author.name}</p>
              <p className="text-[11px] text-white/70">
                {group.items.length > 1 ? `${ii + 1}/${group.items.length} · ` : ''}
                Se borra en {hoursLeft(item.expiresAt)}
              </p>
            </div>
            {item.mine && onAddStory && (
              <button
                type="button"
                data-chrome
                onPointerDown={e => e.stopPropagation()}
                onClick={() => onAddStory()}
                className="app-icon-hit rounded-full bg-white/15 text-white"
                aria-label="Añadir otra historia"
              >
                <Plus size={18} />
              </button>
            )}
            {item.mine && (
              <button
                type="button"
                data-chrome
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setAskDelete(true)}
                className="app-icon-hit rounded-full bg-white/15 text-white"
                aria-label="Borrar esta historia"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              type="button"
              data-chrome
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { void dismiss('down'); }}
              className="app-icon-hit rounded-full text-white/80"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {item.caption && (
          <p className="pointer-events-none absolute inset-x-0 bottom-24 z-10 px-5 text-sm">
            {item.caption}
          </p>
        )}

        {!item.mine && (
          <div
            data-chrome
            className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8"
            onPointerDown={e => e.stopPropagation()}
          >
            <form
              className="flex items-center gap-2 [touch-action:auto]"
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              onPointerCancel={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              onSubmit={event => {
                event.preventDefault();
                event.stopPropagation();
                void onReply();
              }}
            >
              <button
                type="button"
                data-chrome
                onClick={() => void onLike()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25"
                aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
              >
                <StoryLikeHeart size={18} filled={liked} burst={liked ? likeBurst : 0} className={liked ? '' : 'text-white'} />
              </button>
              <input
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 1000))}
                onFocus={() => setPaused(true)}
                onBlur={() => { if (!comment.trim()) setPaused(false); }}
                placeholder="Responde a la historia…"
                className="h-11 min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-4 text-sm text-white placeholder:text-white/50 focus:outline-none"
              />
              <button
                type="submit"
                data-chrome
                disabled={!comment.trim() || sending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 disabled:opacity-35"
                aria-label="Enviar respuesta"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
            {sentHint && (
              <p className="mt-2 text-center text-[11px] font-semibold text-white/80">
                Enviado al chat · respondió a la historia
              </p>
            )}
          </div>
        )}

        {item.mine && (
          <button
            type="button"
            data-chrome
            onPointerDown={e => e.stopPropagation()}
            onClick={() => { setInsights(true); setPaused(true); }}
            className="absolute inset-x-0 bottom-0 z-20 flex w-full items-center justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 text-[13px] font-semibold text-white"
          >
            <span className="inline-flex items-center gap-1.5">
              <Eye size={16} />
              {item.viewCount ?? viewers.length}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <StoryLikeHeart size={16} filled={likeCount > 0} burst={likeBurst} />
              {likeCount}
            </span>
          </button>
        )}
      </motion.div>

      {askDelete && item.mine && (
        <div
          data-chrome
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-6"
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="w-full max-w-xs rounded-2xl bg-slate-950/95 p-5 text-center shadow-xl">
            <p className="text-sm font-semibold">¿Borrar esta historia?</p>
            <p className="mt-1 text-xs text-white/60">Solo se quita esta. Las demás se quedan.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setAskDelete(false)}
                className="h-11 flex-1 rounded-full bg-white/15 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => { void onDeleteThis(); }}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 text-sm font-semibold"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}

      {insights && item.mine && (
        <div
          data-chrome
          className="absolute inset-0 z-30 flex flex-col justify-end"
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            type="button"
            data-chrome
            aria-label="Cerrar vistas"
            onClick={closeInsights}
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={SOFT}
            className="relative z-10 flex max-h-[min(78dvh,calc(100dvh-4.5rem))] flex-col overflow-hidden rounded-t-[28px] border border-white/15 bg-black/35 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] backdrop-blur-2xl"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/35" />
            <div className="shrink-0 border-b border-white/10 px-4 pb-3 pt-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {viewers.length} {viewers.length === 1 ? 'vista' : 'vistas'} · {likers.length} me gusta
                  </p>
                  {likers.length > 0 && (
                    <div className="mt-2 flex items-center">
                      <div className="flex -space-x-2">
                        {likers.slice(0, 5).map(person => (
                          <Avatar
                            key={person.id}
                            src={person.avatar}
                            name={person.name}
                            className="h-7 w-7 rounded-full ring-2 ring-white/20"
                          />
                        ))}
                      </div>
                      {likers.length > 5 && (
                        <span className="ml-2 text-[11px] font-semibold text-white/70">
                          +{likers.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  data-chrome
                  onClick={closeInsights}
                  className="rounded-full bg-white/10 p-2 text-white/80 backdrop-blur-md"
                  aria-label="Cerrar vistas"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  data-chrome
                  onClick={() => setInsightsTab('all')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${
                    insightsTab === 'all' ? 'bg-white text-slate-900' : 'bg-white/10 text-white/80'
                  }`}
                >
                  <Eye size={13} />
                  Vistas
                  <span className={insightsTab === 'all' ? 'text-slate-500' : 'text-white/50'}>{viewers.length}</span>
                </button>
                <button
                  type="button"
                  data-chrome
                  onClick={() => setInsightsTab('likes')}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${
                    insightsTab === 'likes' ? 'bg-white text-slate-900' : 'bg-white/10 text-white/80'
                  }`}
                >
                  <Heart size={13} className={insightsTab === 'likes' ? 'fill-rose-500 text-rose-500' : ''} />
                  Me gusta
                  <span className={insightsTab === 'likes' ? 'text-slate-500' : 'text-white/50'}>{likers.length}</span>
                </button>
              </div>
              {(viewers.length + likers.length >= 6) && (
                <label className="mt-3 flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 backdrop-blur-md">
                  <Search size={14} className="shrink-0 text-white/50" />
                  <input
                    value={insightsQuery}
                    onChange={e => setInsightsQuery(e.target.value.slice(0, 80))}
                    placeholder="Buscar persona…"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/45 focus:outline-none"
                  />
                  {insightsQuery && (
                    <button type="button" onClick={() => setInsightsQuery('')} className="text-white/50" aria-label="Limpiar búsqueda">
                      <X size={14} />
                    </button>
                  )}
                </label>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2 pb-[max(1rem,env(safe-area-inset-bottom))] [touch-action:pan-y]">
              {insightPeople.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/55">
                  {insightsQuery.trim()
                    ? 'Nadie coincide.'
                    : insightsTab === 'likes'
                      ? 'Aún no hay me gusta.'
                      : 'Nadie la ha visto aún.'}
                </p>
              ) : (
                <div className={viewers.length > 10 ? 'space-y-0.5' : 'space-y-1'}>
                  {insightPeople.map(person => (
                    <div
                      key={person.id}
                      className="flex items-center gap-3 rounded-2xl px-2 py-2"
                    >
                      <Avatar src={person.avatar} name={person.name} className="h-10 w-10 rounded-full" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.name}</span>
                      {likerIds.has(person.id) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-300">
                          <Heart size={12} className="fill-rose-500 text-rose-500" />
                          Le gusta
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>,
    document.body
  );
}
