import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Heart, MessageCircle, Send, Trash2 } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { cn } from '@/src/lib/utils';
import { mediaUrl } from '@/src/lib/api';
import { avatarInitial, resolveAvatarUrl } from '@/src/lib/avatar';
import { EASE_OUT } from '@/src/lib/motionPresets';
import {
  addComment,
  fetchComments,
  removeComment,
  removePost,
  timeAgo,
  toggleLike,
  type FeedComment,
  type FeedPost,
} from '@/src/lib/feedApi';

export function Avatar({ name, avatar, size = 40 }: { name: string; avatar: string | null; size?: number }) {
  const src = resolveAvatarUrl(avatar);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-indigo-100 font-black text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {avatarInitial(name)}
    </div>
  );
}

/** Margen entre los dos toques del «doble toque para dar like». */
const DOUBLE_TAP_MS = 300;

interface MediaPostProps {
  post: FeedPost;
  onChanged: (post: FeedPost) => void;
  onDeleted: (postId: string) => void;
  onOpenAuthor?: (authorId: string) => void;
  /** Al abrir una foto desde el perfil, los comentarios ya salen desplegados. */
  autoOpenComments?: boolean;
}

export const MediaPost: React.FC<MediaPostProps> = ({
  post,
  onChanged,
  onDeleted,
  onOpenAuthor,
  autoOpenComments = false,
}) => {
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [showComments, setShowComments] = useState(autoOpenComments);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleLike = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    // Optimista: el corazón responde al instante y se corrige si el servidor dice otra cosa.
    onChanged({
      ...post,
      likedByMe: !post.likedByMe,
      likeCount: post.likeCount + (post.likedByMe ? -1 : 1),
    });
    try {
      const res = await toggleLike(post.id);
      onChanged({ ...post, likedByMe: res.likedByMe, likeCount: res.likeCount });
    } catch {
      onChanged(post);
    } finally {
      setBusy(false);
    }
  }, [busy, post, onChanged]);

  /**
   * Doble toque en la foto: como en Instagram, siempre da like y nunca lo quita, para
   * que un toque de más no deshaga lo que acabas de hacer. `dblclick` no es fiable en
   * móvil, así que se miden dos toques seguidos.
   */
  const lastTapAtRef = useRef(0);
  const [burstId, setBurstId] = useState<number | null>(null);

  const handleMediaTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapAtRef.current < DOUBLE_TAP_MS) {
      lastTapAtRef.current = 0;
      setBurstId(now);
      if (!post.likedByMe) void handleLike();
      return;
    }
    lastTapAtRef.current = now;
  }, [post.likedByMe, handleLike]);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetchComments(post.id);
      setComments(res.comments);
    } catch {
      setComments([]);
    }
  }, [post.id]);

  const openComments = useCallback(() => {
    setShowComments(v => !v);
    if (!comments) void loadComments();
  }, [comments, loadComments]);

  useEffect(() => {
    if (autoOpenComments && !comments) void loadComments();
  }, [autoOpenComments, comments, loadComments]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const created = await addComment(post.id, text);
      setComments(prev => [...(prev ?? []), created]);
      setDraft('');
      onChanged({ ...post, commentCount: post.commentCount + 1 });
    } catch {
      /* el comentario se queda escrito para reintentar */
    } finally {
      setSending(false);
    }
  }, [draft, sending, post, onChanged]);

  const deleteComment = useCallback(
    async (commentId: string) => {
      setComments(prev => (prev ?? []).filter(c => c.id !== commentId));
      onChanged({ ...post, commentCount: Math.max(0, post.commentCount - 1) });
      await removeComment(commentId).catch(() => {});
    },
    [post, onChanged]
  );

  const deletePost = useCallback(async () => {
    if (!window.confirm('¿Borrar esta publicación?')) return;
    onDeleted(post.id);
    await removePost(post.id).catch(() => {});
  }, [post.id, onDeleted]);

  return (
    <Card padding="none" rounded="md" className="overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenAuthor?.(post.author.id)}
          className="flex items-center gap-3 text-left"
        >
          <Avatar name={post.author.name} avatar={post.author.avatar} />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{post.author.name}</p>
            <p className="text-[11px] text-slate-400">{timeAgo(post.createdAt)}</p>
          </div>
        </button>
        {post.mine && (
          <button
            type="button"
            onClick={deletePost}
            className="ml-auto rounded-lg p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
            aria-label="Borrar publicación"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className="relative bg-slate-950">
        {post.mediaType === 'video' ? (
          <video
            src={mediaUrl(post.mediaKey)}
            controls
            playsInline
            preload="metadata"
            className="max-h-[70vh] w-full object-contain"
          />
        ) : (
          <img
            src={mediaUrl(post.mediaKey)}
            alt={post.caption || 'Publicación'}
            loading="lazy"
            onClick={handleMediaTap}
            // `manipulation`: sin esto el móvil interpreta el doble toque como zoom.
            style={{ touchAction: 'manipulation' }}
            className="max-h-[70vh] w-full cursor-pointer select-none object-contain"
          />
        )}

        <AnimatePresence>
          {burstId !== null && (
            <motion.div
              key={burstId}
              aria-hidden
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.15, 1, 1.3] }}
              transition={{ duration: 0.85, times: [0, 0.18, 0.6, 1], ease: EASE_OUT }}
              onAnimationComplete={() => setBurstId(null)}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <Heart size={96} className="text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.55)]" fill="currentColor" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-4">
          <motion.button
            type="button"
            onClick={handleLike}
            whileTap={{ scale: 0.85 }}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm font-bold transition-colors',
              post.likedByMe ? 'text-rose-500' : 'text-slate-500 hover:text-rose-500 dark:text-slate-400'
            )}
          >
            <motion.span
              key={post.likedByMe ? 'liked' : 'unliked'}
              initial={post.likedByMe ? { scale: 0.6 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 14 }}
              className="inline-flex"
            >
              <Heart size={20} fill={post.likedByMe ? 'currentColor' : 'none'} />
            </motion.span>
            {post.likeCount > 0 && post.likeCount}
          </motion.button>
          <motion.button
            type="button"
            onClick={openComments}
            whileTap={{ scale: 0.85 }}
            className="inline-flex min-h-11 min-w-11 items-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-indigo-600 dark:text-slate-400"
          >
            <MessageCircle size={20} />
            {post.commentCount > 0 && post.commentCount}
          </motion.button>
        </div>

        {post.caption && (
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{post.author.name} </span>
            {post.caption}
          </p>
        )}

        <AnimatePresence initial={false}>
        {showComments && (
          <motion.div
            key="comments"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mt-3 space-y-3 overflow-hidden border-t border-slate-100 pt-3 dark:border-slate-700/60"
          >
            {comments === null ? (
              <p className="text-xs text-slate-400">Cargando comentarios…</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-slate-400">Sé el primero en comentar.</p>
            ) : (
              comments.map(c => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2"
                >
                  <Avatar name={c.author.name} avatar={c.author.avatar} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 dark:text-slate-200">
                      <span className="font-black text-slate-900 dark:text-slate-100">{c.author.name} </span>
                      {c.text}
                    </p>
                    <p className="text-[10px] text-slate-400">{timeAgo(c.createdAt)}</p>
                  </div>
                  {(c.mine || post.mine) && (
                    <button
                      type="button"
                      onClick={() => deleteComment(c.id)}
                      className="rounded p-1 text-slate-300 hover:text-rose-500"
                      aria-label="Borrar comentario"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </motion.div>
              ))
            )}

            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') send();
                }}
                placeholder="Felicítalo, anima, pregunta…"
                className="h-10 flex-1 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              <motion.button
                type="button"
                onClick={send}
                whileTap={{ scale: 0.9 }}
                disabled={!draft.trim() || sending}
                className="rounded-xl bg-indigo-600 p-2.5 text-white transition-opacity disabled:opacity-40"
                aria-label="Enviar comentario"
              >
                <Send size={16} />
              </motion.button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </Card>
  );
};
