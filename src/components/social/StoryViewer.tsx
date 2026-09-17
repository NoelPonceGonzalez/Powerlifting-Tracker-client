import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { Eye, Heart, Loader2, Plus, Send, X } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { mediaUrl } from '@/src/lib/api';
import { addComment, markStoryViewed, toggleLike, type FeedAuthor, type StoryGroup } from '@/src/lib/feedApi';
import { useEscapeClose } from '@/src/lib/useEscapeClose';

const SOFT = { duration: 0.28, ease: EASE_OUT };
const FADE = { duration: 0.18, ease: EASE_OUT };

function hoursLeft(expiresAt: string | null): string {
  if (!expiresAt) return '24 h';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'ahora';
  const h = Math.max(1, Math.round(ms / 3600000));
  return `${h} h`;
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
}

export function StoryViewer({ groups, startGroup, onClose, onAddStory }: StoryViewerProps) {
  const [gi, setGi] = useState(startGroup);
  const [ii, setIi] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sentHint, setSentHint] = useState(false);
  const [insights, setInsights] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const skipTap = useRef(false);
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
  giRef.current = gi;
  iiRef.current = ii;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pullY = useTransform(y, v => Math.max(0, v) * 0.38);
  const scale = useTransform(y, [0, 420], [1, 0.72]);
  const radius = useTransform(y, [0, 70], [0, 28]);
  const veil = useTransform(y, [0, 240], [1, 0]);

  const group = groups[gi];
  const item = group?.items[ii];

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

  useEscapeClose(true, () => { void dismiss('down'); });

  const go = useCallback((nextDir: number) => {
    if (skipTap.current) {
      skipTap.current = false;
      return;
    }
    if (busy.current || leaving || insights) return;
    const next = neighborOf(groups, giRef.current, iiRef.current, nextDir);
    if (!next) {
      void dismiss(nextDir > 0 ? 'left' : 'right');
      return;
    }
    setGi(next.gi);
    setIi(next.ii);
    x.set(0);
    y.set(0);
  }, [dismiss, groups, insights, leaving, x, y]);

  useEffect(() => {
    if (!item) return;
    setLiked(!!item.likedByMe);
    setLikeCount(item.likeCount ?? 0);
    setComment('');
    setSentHint(false);
    setPaused(false);
    setInsights(false);
  }, [item?.id]);

  useEffect(() => {
    if (!item || item.mine) return;
    void markStoryViewed(item.id).catch(() => {});
  }, [item?.id, item?.mine]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || item?.mediaType !== 'video') return;
    if (paused || insights || leaving) video.pause();
    else void video.play().catch(() => {});
  }, [paused, insights, leaving, item?.id, item?.mediaType]);

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
    if (!item || item.mediaType === 'video' || paused || insights || leaving) return;
    const t = window.setTimeout(() => go(1), 5200);
    return () => window.clearTimeout(t);
  }, [item?.id, item?.mediaType, paused, insights, leaving, go]);

  const onLike = async () => {
    if (!item || item.mine) return;
    const next = !liked;
    setLiked(next);
    setLikeCount(c => Math.max(0, c + (next ? 1 : -1)));
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
    setSending(true);
    try {
      await addComment(item.id, text);
      setComment('');
      setSentHint(true);
      setPaused(false);
      window.setTimeout(() => setSentHint(false), 2200);
    } catch {
      /* reintentar */
    } finally {
      setSending(false);
    }
  };

  const clearHold = () => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onCardPointerDown = (e: React.PointerEvent) => {
    if (Date.now() - openedAt.current < 160) return;
    if (insights || leaving || busy.current) return;
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

  if (typeof document === 'undefined' || !group || !item) return null;

  const viewers = item.viewers ?? [];
  const likerIds = new Set((item.likers ?? []).map(u => u.id));
  const likers = item.likers ?? [];
  const src = mediaUrl(item.mediaKey);

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
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="absolute inset-0"
          >
            {item.mediaType === 'video' ? (
              <video
                ref={videoRef}
                src={src}
                autoPlay
                playsInline
                draggable={false}
                className="h-full w-full object-cover"
                onEnded={() => { if (!paused && !insights && !leaving) go(1); }}
              />
            ) : (
              <img
                src={src}
                alt={item.caption || ''}
                draggable={false}
                className="h-full w-full object-cover"
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex gap-1">
            {group.items.map((s, idx) => (
              <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full bg-white"
                  style={
                    idx < ii
                      ? { width: '100%' }
                      : idx === ii && !paused && !insights && !leaving && item.mediaType !== 'video'
                        ? { width: '100%', animation: 'story-bar 5.2s linear' }
                        : idx === ii
                          ? { width: '100%' }
                          : { width: '0%' }
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
                className="rounded-full bg-white/15 p-2 text-white"
                aria-label="Añadir otra historia"
              >
                <Plus size={18} />
              </button>
            )}
            <button
              type="button"
              data-chrome
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { void dismiss('down'); }}
              className="rounded-full p-2 text-white/80"
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
              className="flex items-center gap-2"
              onSubmit={event => {
                event.preventDefault();
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
                <Heart size={18} className={liked ? 'fill-rose-500 text-rose-500' : 'text-white'} />
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
              <Heart size={16} className={likeCount > 0 ? 'fill-rose-500 text-rose-500' : undefined} />
              {likeCount}
            </span>
          </button>
        )}
      </motion.div>

      {insights && item.mine && (
        <motion.div
          initial={{ y: 36, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SOFT}
          className="absolute inset-x-0 bottom-0 z-30 max-h-[62%] overflow-y-auto rounded-t-[28px] bg-slate-950/95 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {viewers.length} {viewers.length === 1 ? 'vista' : 'vistas'} · {likers.length} me gusta
            </p>
            <button type="button" data-chrome onClick={() => setInsights(false)} className="rounded-full p-2 text-white/70" aria-label="Cerrar vistas">
              <X size={20} />
            </button>
          </div>
          {viewers.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/50">Nadie la ha visto aún.</p>
          ) : (
            <div className="space-y-1">
              {viewers.map((person: FeedAuthor) => (
                <div key={person.id} className="flex items-center gap-3 rounded-xl px-1 py-2">
                  <Avatar src={person.avatar} name={person.name} className="h-10 w-10 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.name}</span>
                  {likerIds.has(person.id) && <Heart size={16} className="fill-rose-500 text-rose-500" />}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>,
    document.body
  );
}
