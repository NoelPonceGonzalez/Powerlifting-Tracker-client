import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Loader2, Send, X } from 'lucide-react';
import { mediaUrl } from '@/src/lib/api';
import { addComment, markStoryViewed, toggleLike, type StoryGroup } from '@/src/lib/feedApi';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import { cn } from '@/src/lib/utils';

function hoursLeft(expiresAt: string | null): string {
  if (!expiresAt) return '24 h';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'ahora';
  const h = Math.max(1, Math.round(ms / 3600000));
  return `${h} h`;
}

interface StoryViewerProps {
  groups: StoryGroup[];
  startGroup: number;
  onClose: () => void;
}

export function StoryViewer({ groups, startGroup, onClose }: StoryViewerProps) {
  const [gi, setGi] = useState(startGroup);
  const [ii, setIi] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sentHint, setSentHint] = useState(false);
  const group = groups[gi];
  const item = group?.items[ii];

  useEscapeClose(true, onClose);

  useEffect(() => {
    if (!item) return;
    setLiked(!!item.likedByMe);
    setLikeCount(item.likeCount ?? 0);
    setComment('');
    setSentHint(false);
    setPaused(false);
  }, [item?.id]);

  useEffect(() => {
    if (!item || item.mine) return;
    void markStoryViewed(item.id).catch(() => {});
  }, [item?.id, item?.mine]);

  useEffect(() => {
    if (!item || item.mediaType === 'video' || paused) return;
    const t = window.setTimeout(() => go(1), 5200);
    return () => window.clearTimeout(t);
  }, [item?.id, item?.mediaType, paused, gi, ii]);

  const go = (dir: number) => {
    if (!group) return;
    const nextI = ii + dir;
    if (nextI >= 0 && nextI < group.items.length) {
      setIi(nextI);
      return;
    }
    const nextG = gi + dir;
    if (nextG >= 0 && nextG < groups.length) {
      setGi(nextG);
      setIi(dir > 0 ? 0 : Math.max(0, (groups[nextG]?.items.length ?? 1) - 1));
      return;
    }
    if (dir > 0) onClose();
  };

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
      /* el input se queda para reintentar */
    } finally {
      setSending(false);
    }
  };

  if (typeof document === 'undefined' || !group || !item) return null;

  return createPortal(
    <div className="fixed inset-0 z-[130000] flex flex-col bg-black text-white">
      <div className="shrink-0 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex gap-1">
          {group.items.map((s, idx) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full bg-white"
                style={{ width: idx < ii ? '100%' : idx === ii ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{group.author.name}</p>
            <p className="text-[11px] text-white/60">Se borra en {hoursLeft(item.expiresAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/80" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <button type="button" className="absolute inset-y-0 left-0 z-[5] w-1/3" onClick={() => go(-1)} aria-label="Anterior" />
        <button type="button" className="absolute inset-y-0 right-0 z-[5] w-1/3" onClick={() => go(1)} aria-label="Siguiente" />
        <div className="flex h-full items-center justify-center px-2">
          {item.mediaType === 'video' ? (
            <video
              src={mediaUrl(item.mediaKey)}
              autoPlay
              playsInline
              className="max-h-full max-w-full object-contain"
              onEnded={() => { if (!paused) go(1); }}
            />
          ) : (
            <img src={mediaUrl(item.mediaKey)} alt={item.caption || ''} className="max-h-full max-w-full object-contain" />
          )}
        </div>
      </div>

      {item.caption && (
        <p className="shrink-0 bg-gradient-to-t from-black/80 to-transparent px-5 pt-3 text-sm">
          {item.caption}
        </p>
      )}

      {!item.mine && (
        <div className="relative z-20 shrink-0 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <form
            className="flex items-center gap-2"
            onSubmit={event => {
              event.preventDefault();
              void onReply();
            }}
          >
            <button
              type="button"
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
          {liked && likeCount > 0 && (
            <p className="sr-only">{likeCount} me gusta</p>
          )}
        </div>
      )}

      {item.mine && (
        <p className={cn(
          'shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[11px] text-white/55',
          !item.caption && 'pt-3'
        )}>
          {likeCount > 0 ? `${likeCount} me gusta` : 'Tu historia'}
          {item.viewCount ? ` · ${item.viewCount} ${item.viewCount === 1 ? 'vista' : 'vistas'}` : ''}
        </p>
      )}
    </div>,
    document.body
  );
}
