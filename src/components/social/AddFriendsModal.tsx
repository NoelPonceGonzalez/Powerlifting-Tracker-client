import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Clock, Loader2, RefreshCw, Search, UserPlus } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { Button } from '@/src/components/ui/Button';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { apiGet } from '@/src/lib/api';
import {
  fetchFollowSuggestions,
  flattenFollowSuggestions,
  type FollowSuggestPack,
} from '@/src/lib/followSuggestions';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { useLongPress } from '@/src/lib/useLongPress';
import { cn } from '@/src/lib/utils';
import type { UserSearchResult } from '@/src/types';

type Person = { id: string; name: string; avatar?: string };

type Kind = 'friend' | 'following' | 'sent' | 'incoming' | 'follow';

function kindOf(u: UserSearchResult, sentIds: Set<string>): Kind {
  if (u.friendshipStatus === 'accepted') return 'friend';
  if (u.friendshipStatus === 'following') return 'following';
  if (sentIds.has(u.id) || (u.friendshipStatus === 'pending' && u.friendshipDirection === 'outgoing')) {
    return 'sent';
  }
  if (u.friendshipStatus === 'pending' && u.friendshipDirection === 'incoming') return 'incoming';
  return 'follow';
}

function kindCopy(kind: Kind, follower: boolean): { title: string; hint: string } {
  if (kind === 'friend') return { title: 'Amigos', hint: 'Ya sois amigos' };
  if (kind === 'following') return { title: 'Siguiendo', hint: 'Ya le sigues' };
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
  const [suggest, setSuggest] = useState<FollowSuggestPack>({ followBack: [], friends: [], discover: [] });
  const [searching, setSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());

  const loadSuggest = async () => {
    setSuggesting(true);
    setSuggestError(false);
    try {
      setSuggest(await fetchFollowSuggestions());
    } catch {
      setSuggest({ followBack: [], friends: [], discover: [] });
      setSuggestError(true);
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      setSearching(false);
      setSendingId(null);
      return;
    }
    void loadSuggest();
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
    const patch = (list: UserSearchResult[]) =>
      list.map(h =>
        h.id === id
          ? { ...h, friendshipStatus: 'pending' as const, friendshipDirection: 'outgoing' as const, canSendRequest: false }
          : h
      );
    setHits(prev => patch(prev));
    setSuggest(prev => ({
      followBack: patch(prev.followBack),
      friends: patch(prev.friends),
      discover: patch(prev.discover),
    }));
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
  const suggestedPeople = flattenFollowSuggestions(suggest);
  const hasSuggest = suggestedPeople.length > 0;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      center
      frost
      title="Añadir amigos"
      subtitle={needle ? 'Resultados de búsqueda' : 'Personas que puedes seguir'}
    >
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Busca gente para seguir"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-white/15 bg-white/10 pl-10 pr-4 text-sm text-white placeholder:text-white/45 backdrop-blur-md focus:outline-none"
        />
      </div>

      {needle ? (
        searching && hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/55">Buscando…</p>
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/55">Nadie con ese nombre.</p>
        ) : (
          <PeopleList
            people={hits}
            sentIds={sentIds}
            sendingId={sendingId}
            onSend={sendTo}
            onHold={onHoldPerson}
            onSendRequest={onSendRequest}
          />
        )
      ) : suggesting && !hasSuggest ? (
        <p className="py-10 text-center text-sm text-white/55">Cargando sugerencias…</p>
      ) : suggestError ? (
        <div className="py-10 text-center">
          <p className="text-sm text-white/55">No se pudieron cargar sugerencias.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadSuggest()} disabled={suggesting}>
            Reintentar
          </Button>
        </div>
      ) : !hasSuggest ? (
        <p className="py-10 text-center text-sm text-white/55">
          De momento no hay nadie nuevo. Busca por nombre arriba.
        </p>
      ) : (
        <SuggestBlock
          title="Para ti"
          hint="Gente que puedes seguir ahora"
          people={suggestedPeople}
          sentIds={sentIds}
          sendingId={sendingId}
          onSend={sendTo}
          onHold={onHoldPerson}
          onSendRequest={onSendRequest}
          onRefresh={() => void loadSuggest()}
          refreshing={suggesting}
        />
      )}
    </GlassModal>
  );
}

function SuggestBlock({
  title,
  hint,
  people,
  sentIds,
  sendingId,
  onSend,
  onHold,
  onSendRequest,
  onRefresh,
  refreshing,
}: {
  title: string;
  hint: string;
  people: UserSearchResult[];
  sentIds: Set<string>;
  sendingId: string | null;
  onSend: (person: Person) => void;
  onHold?: (person: Person) => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{title}</p>
          <p className="text-[11px] text-white/35">{hint}</p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 disabled:opacity-40"
            aria-label="Otras sugerencias"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
          </button>
        )}
      </div>
      <PeopleList
        people={people}
        sentIds={sentIds}
        sendingId={sendingId}
        onSend={onSend}
        onHold={onHold}
        onSendRequest={onSendRequest}
      />
    </section>
  );
}

function PeopleList({
  people,
  sentIds,
  sendingId,
  onSend,
  onHold,
  onSendRequest,
}: {
  people: UserSearchResult[];
  sentIds: Set<string>;
  sendingId: string | null;
  onSend: (person: Person) => void;
  onHold?: (person: Person) => void;
  onSendRequest?: (userId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-1">
      {people.map((u, i) => {
        const kind = kindOf(u, sentIds);
        const copy = kindCopy(kind, u.friendshipStatus === 'follower' || u.reason === 'followback');
        return (
          <motion.div
            key={u.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.035, duration: 0.22, ease: EASE_OUT }}
            className="flex items-center gap-3 rounded-2xl px-2 py-2"
          >
            <SearchPerson
              person={{ id: u.id, name: u.name, avatar: u.avatar }}
              kind={kind}
              hint={
                u.reason === 'friends' && kind === 'follow'
                  ? 'Lo siguen tus amigos'
                  : u.reason === 'discover' && kind === 'follow'
                    ? 'Gente nueva'
                    : copy.hint
              }
              onHold={onHold}
            />
            {u.blocked === 'them' ? (
              <span className="shrink-0 text-[11px] font-medium text-white/45">Te ha bloqueado</span>
            ) : u.blocked === 'you' ? (
              <span className="shrink-0 text-[11px] font-medium text-white/45">Bloqueado</span>
            ) : kind === 'follow' ? (
              <Button
                variant="primary"
                size="sm"
                className="h-9 shrink-0 rounded-full px-3 text-[12px]"
                disabled={sendingId === u.id || !onSendRequest}
                onClick={() => void onSend({ id: u.id, name: u.name, avatar: u.avatar })}
              >
                {sendingId === u.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Seguir
              </Button>
            ) : (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
                  (kind === 'friend' || kind === 'following') && 'bg-emerald-400/15 text-emerald-300',
                  kind === 'sent' && 'bg-amber-400/15 text-amber-300',
                  kind === 'incoming' && 'bg-white/10 text-white/60'
                )}
              >
                {kind === 'friend' || kind === 'following' ? <Check size={12} /> : <Clock size={12} />}
                {copy.title}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
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
            (kind === 'friend' || kind === 'following') && 'bg-emerald-400/80',
            kind === 'sent' && 'bg-amber-400/90',
            kind === 'incoming' && 'bg-slate-300 dark:bg-slate-600',
            kind === 'follow' && 'bg-gradient-to-tr from-amber-400 via-rose-500 to-fuchsia-600'
          )}
        >
          <span className="block h-10 w-10 overflow-hidden rounded-full bg-white">
            <Avatar name={person.name} avatar={person.avatar || null} size={40} />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-white">{person.name}</span>
          <span className="block truncate text-[12px] text-white/50">{hint}</span>
        </span>
      </span>
    </button>
  );
}
