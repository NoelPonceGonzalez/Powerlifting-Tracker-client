import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Clock, Loader2, Search, UserPlus } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { apiGet } from '@/src/lib/api';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { useLongPress } from '@/src/lib/useLongPress';
import { cn } from '@/src/lib/utils';
import type { UserSearchResult } from '@/src/types';

type Person = { id: string; name: string; avatar?: string };

type Kind = 'friend' | 'sent' | 'incoming' | 'follow';

function kindOf(u: UserSearchResult, sentIds: Set<string>): Kind {
  if (u.friendshipStatus === 'following' || u.friendshipStatus === 'accepted') return 'friend';
  if (sentIds.has(u.id) || (u.friendshipStatus === 'pending' && u.friendshipDirection === 'outgoing')) {
    return 'sent';
  }
  if (u.friendshipStatus === 'pending' && u.friendshipDirection === 'incoming') return 'incoming';
  return 'follow';
}

function kindCopy(kind: Kind, follower: boolean): { title: string; hint: string } {
  if (kind === 'friend') return { title: 'Amigos', hint: 'Ya sois amigos' };
  if (kind === 'sent') return { title: 'Enviada', hint: 'Solicitud enviada · aún no ha aceptado' };
  if (kind === 'incoming') return { title: 'Pendiente', hint: 'Te ha pedido seguirte' };
  return { title: 'Seguir', hint: follower ? 'Te sigue' : 'Aún no le sigues' };
}

export function AddFriendsModal({
  open,
  onClose,
  myId,
  onSendRequest,
  onHoldPerson,
}: {
  open: boolean;
  onClose: () => void;
  myId: string;
  onSendRequest?: (userId: string) => Promise<void>;
  onHoldPerson?: (person: Person) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      setSearching(false);
      setSendingId(null);
    }
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (!open || !query) {
      setHits([]);
      setSearching(false);
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const results = await apiGet<UserSearchResult[]>('/api/social/search', { q: query });
        const list = Array.isArray(results) ? results : [];
        if (live) setHits(list.filter(u => u.id !== myId));
      } catch {
        if (live) setHits([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 240);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q, myId, open]);

  const markSent = (id: string) => {
    setSentIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setHits(prev =>
      prev.map(h =>
        h.id === id
          ? { ...h, friendshipStatus: 'pending', friendshipDirection: 'outgoing', canSendRequest: false }
          : h
      )
    );
  };

  const sendTo = async (person: Person) => {
    if (!onSendRequest || sentIds.has(person.id)) return;
    setSendingId(person.id);
    try {
      await onSendRequest(person.id);
      markSent(person.id);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message || '');
      if (/ya le enviaste|ya existe|pendiente/i.test(msg)) markSent(person.id);
    } finally {
      setSendingId(null);
    }
  };

  const needle = q.trim();

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      sheet
      title="Añadir amigos"
      subtitle="Busca por nombre"
    >
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Busca gente para seguir"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 w-full rounded-2xl bg-white pl-10 pr-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      {!needle ? (
        <p className="py-10 text-center text-sm text-slate-400">Escribe un nombre para buscar.</p>
      ) : searching && hits.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Buscando…</p>
      ) : hits.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Nadie con ese nombre.</p>
      ) : (
        <div className="space-y-1.5">
          {hits.map((u, i) => {
            const kind = kindOf(u, sentIds);
            const copy = kindCopy(kind, u.friendshipStatus === 'follower');
            return (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.035, duration: 0.22, ease: EASE_OUT }}
                className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2.5 shadow-sm dark:bg-slate-900/80"
              >
                <SearchPerson
                  person={{ id: u.id, name: u.name, avatar: u.avatar }}
                  kind={kind}
                  hint={copy.hint}
                  onHold={onHoldPerson}
                />
                {kind === 'follow' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    className="h-9 shrink-0 rounded-xl px-3 text-[12px]"
                    disabled={sendingId === u.id || !onSendRequest}
                    onClick={() => void sendTo({ id: u.id, name: u.name, avatar: u.avatar })}
                  >
                    {sendingId === u.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    Seguir
                  </Button>
                ) : (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
                      kind === 'friend' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
                      kind === 'sent' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
                      kind === 'incoming' && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    )}
                  >
                    {kind === 'friend' ? <Check size={12} /> : <Clock size={12} />}
                    {copy.title}
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </GlassModal>
  );
}

function SearchPerson({
  person,
  kind,
  hint,
  onHold,
}: {
  person: Person;
  kind: Kind;
  hint: string;
  onHold?: (person: Person) => void;
}) {
  const hold = useLongPress(() => onHold?.(person));
  return (
    <button
      type="button"
      className="min-w-0 flex-1 select-none text-left touch-manipulation"
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onContextMenu={hold.onContextMenu}
      onClick={e => {
        hold.suppressClick(e);
      }}
    >
      <span className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-[2px]',
            kind === 'friend' && 'bg-emerald-400/80',
            kind === 'sent' && 'bg-amber-400/90',
            kind === 'incoming' && 'bg-slate-300 dark:bg-slate-600',
            kind === 'follow' && 'bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600'
          )}
        >
          <Avatar src={person.avatar} name={person.name} className="h-full w-full rounded-full" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{person.name}</span>
          <span className="block truncate text-[12px] text-slate-400">{hint}</span>
        </span>
      </span>
    </button>
  );
}
