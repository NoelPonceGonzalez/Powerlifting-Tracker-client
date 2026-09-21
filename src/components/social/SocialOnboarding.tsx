import React, { useEffect, useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { Button } from '@/src/components/ui/Button';
import { apiPost } from '@/src/lib/api';
import { fetchFollowSuggestions, flattenFollowSuggestions } from '@/src/lib/followSuggestions';
import { LoadingBlock } from '@/src/components/ui/Spinner';
import { cn } from '@/src/lib/utils';
import type { UserSearchResult } from '@/src/types';

const GOAL = 3;

export function SocialOnboarding({
  myId,
  onDone,
}: {
  myId: string;
  onDone: () => void;
}) {
  const [people, setPeople] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    void fetchFollowSuggestions()
      .then(pack => {
        if (!live) return;
        setPeople(flattenFollowSuggestions(pack).filter(u => u.id !== myId).slice(0, 12));
      })
      .catch(() => {
        if (live) setPeople([]);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [myId]);

  const follow = async (id: string) => {
    if (followed.has(id) || sendingId) return;
    setSendingId(id);
    try {
      await apiPost('/api/social/requests', { userId: id });
      setFollowed(prev => new Set(prev).add(id));
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message || '');
      if (/ya le enviaste|ya existe|pendiente|amigo|sigues/i.test(msg)) {
        setFollowed(prev => new Set(prev).add(id));
      }
    } finally {
      setSendingId(null);
    }
  };

  const count = followed.size;
  const ready = count >= GOAL;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-black text-slate-900 dark:text-white">Sigue a gente</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Elige {GOAL} para ver historias el primer día. Puedes saltarlo.
        </p>
        <p className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {count}/{GOAL} seguidos
        </p>
      </div>

      {loading ? (
        <LoadingBlock className="py-8" label="Buscando gente" />
      ) : people.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Ahora mismo no hay sugerencias. Entra y búscalas cuando quieras.
        </p>
      ) : (
        <div className="max-h-[min(22rem,50dvh)] space-y-1 overflow-y-auto">
          {people.map(u => {
            const done = followed.has(u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 rounded-2xl px-1 py-2">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="block h-11 w-11 overflow-hidden rounded-full bg-slate-100">
                    <Avatar name={u.name} avatar={u.avatar || null} size={44} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                      {u.name}
                    </span>
                    <span className="block truncate text-[12px] text-slate-400">
                      {u.reason === 'followback'
                        ? 'Te sigue'
                        : u.reason === 'friends'
                          ? 'Lo siguen tus amigos'
                          : 'Descubrir'}
                    </span>
                  </span>
                </span>
                <Button
                  variant={done ? 'outline' : 'primary'}
                  size="sm"
                  className={cn('h-9 shrink-0 rounded-full px-3 text-[12px]', done && 'text-emerald-600')}
                  disabled={done || sendingId === u.id}
                  onClick={() => void follow(u.id)}
                >
                  {sendingId === u.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : done ? (
                    <Check size={14} />
                  ) : (
                    <UserPlus size={14} />
                  )}
                  {done ? 'Siguiendo' : 'Seguir'}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <Button className="w-full rounded-2xl" onClick={onDone}>
          {ready ? 'Entrar' : people.length === 0 ? 'Entrar' : 'Entrar a la app'}
        </Button>
        {!ready && people.length > 0 && (
          <button type="button" onClick={onDone} className="w-full text-center text-sm font-semibold text-slate-400">
            Saltar
          </button>
        )}
      </div>
    </div>
  );
}
