import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { GraduationCap, ImagePlus, Loader2, MessageCircle } from 'lucide-react';
import { MediaPost } from '@/src/components/social/MediaPost';
import { PublishModal } from '@/src/components/social/PublishModal';
import { fetchFeed, fetchOwnProfile, type FeedAuthor, type FeedPost } from '@/src/lib/feedApi';
import { useIncrementSignal } from '@/src/lib/useIncrementSignal';

interface FeedTabProps {
  myName?: string;
  myAvatar?: string | null;
  onOpenAuthor?: (authorId: string) => void;
  onOpenChat?: (peerId: string) => void;
  openPublishSignal?: number;
}

export const FeedTab: React.FC<FeedTabProps> = ({ onOpenAuthor, onOpenChat, openPublishSignal = 0 }) => {
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

  useIncrementSignal('publish', openPublishSignal, () => setComposing(true));

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

  return (
    <div className="space-y-5">
      {coach && (
        <button
          type="button"
          onClick={() => onOpenChat?.(coach.id)}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/50 bg-white/70 px-4 py-3.5 text-left shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/55"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <GraduationCap size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Tu entrenador</span>
            <span className="block truncate text-xs text-slate-400">Habla con {coach.name.split(' ')[0]} sobre la sesión</span>
          </span>
          <MessageCircle size={18} className="text-amber-600 dark:text-amber-300" />
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-10 text-slate-400">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-500">{error}</p>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/55">
          <ImagePlus size={26} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Aún no hay publicaciones</p>
          <p className="mt-1 text-xs text-slate-400">Cuando alguien publique, saldrá aquí. El + de abajo es para subir la tuya.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <motion.div key={post.id} layout>
              <MediaPost
                post={post}
                onChanged={next => setPosts(prev => prev.map(p => (p.id === next.id ? next : p)))}
                onDeleted={id => setPosts(prev => prev.filter(p => p.id !== id))}
                onOpenAuthor={onOpenAuthor}
              />
            </motion.div>
          ))}
          {cursor && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full py-3 text-center text-sm font-medium text-slate-400"
            >
              {loadingMore ? 'Cargando…' : 'Ver más'}
            </button>
          )}
        </div>
      )}

      {composing && (
        <PublishModal onClose={() => setComposing(false)} onPublished={handlePublished} />
      )}
    </div>
  );
};
