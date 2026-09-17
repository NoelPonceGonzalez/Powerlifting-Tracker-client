import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Heart, Loader2, Search, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { SlimeScroll } from '@/src/components/ui/SlimeScroll';
import { apiGet, apiPut } from '@/src/lib/api';
import { timeAgo } from '@/src/lib/feedApi';
import type { Friend, FriendRequest, UserSearchResult } from '@/src/types';
import type { AppNotification } from '@/src/components/social/HomeActivitySheet';

interface ChatPeoplePanelProps {
  myId: string;
  pending: FriendRequest[];
  friends: Friend[];
  friendIds: string[];
  page: 'activity' | 'requests' | 'friends';
  onPageChange: (page: 'activity' | 'requests' | 'friends') => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onOpenPerson?: (person: { id: string; name: string; avatar?: string }) => void;
  busyId?: string | null;
  refreshTick?: number;
}

const REQUEST_TYPES = new Set(['friend_request', 'chat_request', 'group_invite', 'coach_request']);

function activityText(note: AppNotification): string {
  const name = note.relatedUser?.name || 'Alguien';
  if (note.type === 'friend_accepted') return `${name} ha empezado a seguirte`;
  if (note.type === 'post_like') {
    const msg = note.message || '';
    if (/historia/i.test(msg)) return `${name} ha dado like a tu historia`;
    return `${name} ha dado like a tu publicación`;
  }
  if (note.type === 'post_comment') return `${name} ha comentado tu historia`;
  if (note.type === 'challenge_invite') return note.message || `${name} ha creado un torneo`;
  if (note.type === 'gym_checkin') {
    const extra = note.message ? ` · ${note.message}` : '';
    return `${note.title || `${name} va a entrenar`}${extra}`;
  }
  return note.message || note.title;
}

export function ChatPeoplePanel({
  myId,
  pending,
  friends,
  friendIds,
  page,
  onPageChange,
  onAccept,
  onReject,
  onSendRequest,
  onOpenPerson,
  busyId,
  refreshTick = 0,
}: ChatPeoplePanelProps) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const known = useMemo(() => new Set(friendIds), [friendIds]);

  useEffect(() => {
    setLoadingNotes(true);
    apiGet<AppNotification[]>('/api/notifications', { limit: '40' })
      .then(list => setNotes(Array.isArray(list) ? list : []))
      .catch(() => setNotes([]))
      .finally(() => setLoadingNotes(false));
    apiPut('/api/notifications/read-all', {}).catch(() => {});
  }, [refreshTick]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits([]);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const results = await apiGet<UserSearchResult[]>('/api/social/search', { q: query });
        if (live) setHits(results.filter(u => u.id !== myId && !known.has(u.id)));
      } catch {
        if (live) setHits([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 140);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q, myId, known]);

  const recent = notes.filter(n => !REQUEST_TYPES.has(n.type));

  if (page === 'friends') {
    return (
      <SlimeScroll embed evenIfShort scrollFrom="parent" contentClassName="space-y-4">
        {friends.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Aún no tienes amigos</p>
            <p className="mt-1 text-xs text-slate-400">Cuando sigas a alguien, saldrá aquí. Tócalo para ver su perfil.</p>
          </div>
        ) : (
          <SlimeScroll axis="x" embed evenIfShort className="-mx-1 px-1" contentClassName="flex w-max gap-3 pb-1">
            {friends.map(friend => (
              <button
                key={friend.id}
                type="button"
                onClick={() => onOpenPerson?.({ id: friend.id, name: friend.name, avatar: friend.avatar })}
                className="w-[4.4rem] shrink-0 text-center"
              >
                <Avatar
                  src={friend.avatar}
                  name={friend.name}
                  className="mx-auto h-[4.1rem] w-[4.1rem] rounded-full ring-2 ring-indigo-100 dark:ring-indigo-500/30"
                />
                <span className="mt-1.5 block truncate text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-300">
                  {friend.name.split(' ')[0]}
                </span>
              </button>
            ))}
          </SlimeScroll>
        )}
      </SlimeScroll>
    );
  }

  if (page === 'requests') {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Busca gente para seguir"
            className="h-11 w-full rounded-2xl bg-white pl-10 pr-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {q.trim() ? (
          <section className="rounded-3xl bg-white shadow-sm dark:bg-slate-900">
            {searching && hits.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Buscando…</p>
            )}
            {!searching && hits.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">Nadie con ese nombre.</p>
            )}
            {hits.map((u, i) => {
              const incoming = u.friendshipStatus === 'pending' && u.friendshipDirection === 'incoming';
              const pendingOut = u.friendshipStatus === 'pending' && !incoming;
              const incomingReq = incoming
                ? pending.find(p => p.userId === u.id || p.id === u.id)
                : undefined;
              return (
                <div
                  key={u.id}
                  className={i > 0 ? 'flex items-center gap-3 border-t border-slate-100 px-3.5 py-3 dark:border-slate-800' : 'flex items-center gap-3 px-3.5 py-3'}
                >
                  <button
                    type="button"
                    onClick={() => onOpenPerson?.({ id: u.id, name: u.name, avatar: u.avatar })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <Avatar src={u.avatar} name={u.name} className="h-11 w-11 rounded-full" />
                      <span className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{u.name}</span>
                    </span>
                  </button>
                  {incoming && incomingReq ? (
                    <AcceptRow
                      busy={busyId === incomingReq.id}
                      onReject={() => onReject(incomingReq.id)}
                      onAccept={() => onAccept(incomingReq.id)}
                    />
                  ) : incoming ? (
                    <span className="text-[12px] font-semibold text-slate-400">Te ha pedido seguirte</span>
                  ) : (
                    <Button
                      variant={pendingOut ? 'outline' : 'primary'}
                      size="sm"
                      className="h-9 rounded-xl px-3 text-[12px]"
                      disabled={pendingOut || sendingId === u.id || !onSendRequest}
                      onClick={async () => {
                        if (!onSendRequest || pendingOut) return;
                        setSendingId(u.id);
                        try {
                          await onSendRequest(u.id);
                          setHits(prev =>
                            prev.map(h =>
                              h.id === u.id
                                ? { ...h, friendshipStatus: 'pending', friendshipDirection: 'outgoing' }
                                : h
                            )
                          );
                        } finally {
                          setSendingId(null);
                        }
                      }}
                    >
                      {sendingId === u.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      {pendingOut ? 'Enviada' : 'Seguir'}
                    </Button>
                  )}
                </div>
              );
            })}
          </section>
        ) : pending.length > 0 ? (
          <section className="rounded-3xl bg-white shadow-sm dark:bg-slate-900">
            {pending.map((req, i) => (
              <div
                key={req.id}
                className={i > 0 ? 'flex items-center gap-3 border-t border-slate-100 px-3.5 py-3 dark:border-slate-800' : 'flex items-center gap-3 px-3.5 py-3'}
              >
                <button
                  type="button"
                  onClick={() => onOpenPerson?.({ id: req.userId || req.id, name: req.name, avatar: req.avatar })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-3">
                    <Avatar src={req.avatar} name={req.name} className="h-11 w-11 rounded-full" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{req.name}</span>
                      <span className="text-[12px] text-slate-400">Quiere seguirte</span>
                    </span>
                  </span>
                </button>
                <AcceptRow
                  busy={busyId === req.id}
                  onReject={() => onReject(req.id)}
                  onAccept={() => onAccept(req.id)}
                />
              </div>
            ))}
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No tienes solicitudes</p>
            <p className="mt-1 text-xs text-slate-400">Busca arriba para seguir a alguien.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => onPageChange('requests')}
        className="flex w-full items-center gap-3 rounded-3xl bg-white px-3.5 py-3 text-left shadow-sm dark:bg-slate-900"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          {pending[0] ? (
            <Avatar src={pending[0].avatar} name={pending[0].name} className="h-11 w-11 rounded-full" />
          ) : (
            <Heart size={18} className="text-slate-900 dark:text-slate-100" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            Solicitudes de seguimiento
          </span>
          <span className="text-[13px] text-slate-400">
            {pending.length === 0
              ? 'No tienes solicitudes'
              : pending.length === 1
                ? 'Tienes 1 solicitud'
                : `Tienes ${pending.length} solicitudes`}
          </span>
        </span>
        {pending.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
            {pending.length}
          </span>
        )}
        <ChevronRight size={18} className="shrink-0 text-slate-300" />
      </button>

      <section>
        {loadingNotes ? (
          <div className="flex justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Aún no hay actividad</p>
            <p className="mt-1 text-xs text-slate-400">Aquí saldrá quién te sigue o da like a tu historia.</p>
          </div>
        ) : (
          <div className="rounded-3xl bg-white shadow-sm dark:bg-slate-900">
            {recent.map((note, i) => (
              <button
                key={note.id}
                type="button"
                onClick={() => {
                  if (!note.relatedUserId) return;
                  onOpenPerson?.({
                    id: note.relatedUserId,
                    name: note.relatedUser?.name || 'Atleta',
                    avatar: note.relatedUser?.avatar,
                  });
                }}
                className={i > 0
                  ? 'flex w-full items-center gap-3 border-t border-slate-100 px-3.5 py-3 text-left dark:border-slate-800'
                  : 'flex w-full items-center gap-3 px-3.5 py-3 text-left'}
              >
                {note.relatedUser ? (
                  <Avatar src={note.relatedUser.avatar} name={note.relatedUser.name} className="h-11 w-11 shrink-0 rounded-full" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <Heart size={16} className="text-slate-900 dark:text-slate-100" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug text-slate-800 dark:text-slate-100">
                    {activityText(note)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(note.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AcceptRow({
  busy,
  onReject,
  onAccept,
}: {
  busy: boolean;
  onReject: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={onReject}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Rechazar"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={18} />}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onAccept}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900"
        aria-label="Aceptar"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
      </button>
    </div>
  );
}
