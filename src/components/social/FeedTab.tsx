import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, GraduationCap, ImagePlus, Loader2, MessageCircle } from 'lucide-react';
import { Avatar, MediaPost } from '@/src/components/social/MediaPost';
import { PublishModal } from '@/src/components/social/PublishModal';
import { fetchFeed, fetchOwnProfile, type FeedAuthor, type FeedPost } from '@/src/lib/feedApi';

interface FeedTabProps {
  myName?: string;
  myAvatar?: string | null;
  onOpenAuthor?: (authorId: string) => void;
  onOpenChat?: (peerId: string) => void;
  openPublishSignal?: number;
}

export const FeedTab: React.FC<FeedTabProps> = ({ myName = 'Tú', myAvatar = null, onOpenAuthor, onOpenChat, openPublishSignal = 0 }) => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [coach, setCoach] = useState<FeedAuthor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feed, me] = await Promise.all([
        fetchFeed(),
        fetchOwnProfile().catch(() => null),
      ]);
      setPosts(feed.posts.filter(post => post.kind !== 'story'));
      setCursor(feed.nextCursor);
      setCoach(me?.coach ?? null);
    } catch (e: any) {
      setError(e?.message || 'No se han podido cargar las publicaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (openPublishSignal > 0) setComposing(true);
  }, [openPublishSignal]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const feed = await fetchFeed(cursor);
      setPosts(prev => [...prev, ...feed.posts.filter(post => post.kind !== 'story')]);
      setCursor(feed.nextCursor);
    } catch {
      /* se puede reintentar pulsando otra vez */
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const handlePublished = useCallback((post: FeedPost) => {
    if (post.kind === 'story') return;
    setPosts(prev => [post, ...prev]);
  }, []);

  const firstName = myName.split(' ')[0];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setComposing(true)}
        className="flex w-full items-center gap-3 rounded-[28px] border border-slate-200/80 bg-white p-3 pr-3 text-left shadow-sm transition-colors hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800"
      >
        <Avatar name={myName} avatar={myAvatar} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">¿Qué has entrenado?</span>
          <span className="block truncate text-xs text-slate-400">¿Qué has entrenado hoy, {firstName}?</span>
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
          <Camera size={18} />
        </span>
      </button>

      {coach && (
        <button
          type="button"
          onClick={() => onOpenChat?.(coach.id)}
          className="flex w-full items-center gap-3 rounded-[28px] bg-gradient-to-r from-amber-50 to-white px-4 py-3 text-left ring-1 ring-amber-200/80 dark:from-amber-950/30 dark:to-slate-900 dark:ring-amber-900/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <GraduationCap size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-slate-900 dark:text-slate-100">Tu entrenador</span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">Habla con {coach.name.split(' ')[0]} sobre la sesión</span>
          </span>
          <MessageCircle size={18} className="text-amber-700 dark:text-amber-300" />
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-10 text-slate-400">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-500">{error}</p>
      ) : posts.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-700">
          <ImagePlus size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Aún no hay publicaciones</p>
          <p className="mt-1 text-xs text-slate-400">Publica una foto o un vídeo del entreno. También verás lo de tus amigos.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 6) * 0.05, type: 'spring', stiffness: 240, damping: 26 }}
            >
              <MediaPost
                post={post}
                onChanged={updated => setPosts(prev => prev.map(p => (p.id === updated.id ? updated : p)))}
                onDeleted={id => setPosts(prev => prev.filter(p => p.id !== id))}
                onOpenAuthor={onOpenAuthor}
              />
            </motion.div>
          ))}
          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-2xl border border-slate-200 py-3 text-xs font-black uppercase tracking-wider text-slate-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
            >
              {loadingMore ? 'Cargando…' : 'Ver más'}
            </button>
          )}
        </div>
      )}

      {composing && (
        <PublishModal
          onClose={() => setComposing(false)}
          onPublished={handlePublished}
        />
      )}
    </div>
  );
};
