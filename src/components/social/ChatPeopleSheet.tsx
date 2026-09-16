import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { apiGet } from '@/src/lib/api';
import { fetchProfile, saveBio, type PublicProfile } from '@/src/lib/feedApi';
import type { Friend, FriendRequest, UserSearchResult } from '@/src/types';

interface ChatPeopleSheetProps {
  open: boolean;
  onClose: () => void;
  me: { id: string; name: string; avatar?: string };
  friends: Friend[];
  pending: FriendRequest[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onOpenFriend: (friend: Friend) => void;
  onOpenChat: (userId: string) => void;
  busyId?: string | null;
}

export function ChatPeopleSheet({
  open,
  onClose,
  me,
  friends,
  pending,
  onAccept,
  onReject,
  onSendRequest,
  onOpenFriend,
  onOpenChat,
  busyId,
}: ChatPeopleSheetProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [bio, setBio] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const bioHydrated = useRef(false);

  useEffect(() => {
    if (!open) {
      setProfile(null);
      bioHydrated.current = false;
      return;
    }
    let live = true;
    fetchProfile(me.id)
      .then(p => {
        if (!live) return;
        setProfile(prev =>
          prev
            ? {
                ...prev,
                followerCount: p.followerCount,
                followingCount: p.followingCount,
                friendCount: p.friendCount,
              }
            : p
        );
        if (!bioHydrated.current) {
          setBio(p.bio || '');
          bioHydrated.current = true;
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, me.id, friends.length, pending.length]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      return;
    }
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
        if (live) setHits(results.filter(u => u.id !== me.id));
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
  }, [q, open, me.id]);

  const friendIds = useMemo(() => new Set(friends.map(f => f.id)), [friends]);
  const visibleHits = hits.filter(u => !friendIds.has(u.id));

  const commitBio = async () => {
    const next = bio.trim().slice(0, 160);
    setSavingBio(true);
    try {
      await saveBio(next);
      setProfile(prev => (prev ? { ...prev, bio: next } : prev));
      setBio(next);
    } catch {
      /* el texto queda; se puede reintentar */
    } finally {
      setSavingBio(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      rise
      sheet
      title="Tú y amigos"
      subtitle="Perfil, solicitudes y a quién sigues"
      wide
    >
      <div className="space-y-5">
        <section className="rounded-2xl bg-white/70 px-3.5 py-3.5 shadow-sm dark:bg-white/5">
          <div className="flex items-center gap-3">
            <Avatar src={profile?.avatar || me.avatar} name={profile?.name || me.name} className="h-14 w-14 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                {profile?.name || me.name}
              </p>
              <div className="mt-1 flex gap-3 text-[12px] text-slate-500">
                <span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{profile?.followingCount ?? friends.length}</span>
                  {' '}siguiendo
                </span>
                <span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{profile?.followerCount ?? friends.length}</span>
                  {' '}seguidores
                </span>
              </div>
            </div>
          </div>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value.slice(0, 160))}
            onBlur={() => {
              if ((profile?.bio || '') !== bio.trim()) void commitBio();
            }}
            rows={2}
            placeholder="Un mini texto sobre ti…"
            className="mt-3 w-full resize-none rounded-xl border border-white/50 bg-white/60 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-400">
            <span>{savingBio ? 'Guardando…' : 'Se guarda al salir del texto'}</span>
            <span>{bio.length}/160</span>
          </div>
        </section>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar atletas…"
            className="h-11 w-full rounded-2xl border border-white/50 bg-white/60 pl-10 pr-3 text-sm text-slate-800 outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
          />
        </div>

        {q.trim() ? (
          <section className="space-y-1">
            {searching && visibleHits.length === 0 && (
              <p className="px-1 py-3 text-center text-sm text-slate-400">Buscando…</p>
            )}
            {!searching && visibleHits.length === 0 && (
              <p className="px-1 py-3 text-center text-sm text-slate-400">Nadie con ese nombre.</p>
            )}
            {visibleHits.map(u => {
              const incoming = u.friendshipStatus === 'pending' && u.friendshipDirection === 'incoming';
              const pendingOut = u.friendshipStatus === 'pending' && !incoming;
              const incomingReq = incoming
                ? pending.find(p => p.userId === u.id || p.id === u.id)
                : undefined;
              return (
                <div key={u.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <Avatar src={u.avatar} name={u.name} className="h-10 w-10 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {u.name}
                  </span>
                  {incoming && incomingReq ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busyId === incomingReq.id}
                        onClick={() => onReject(incomingReq.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        aria-label="Rechazar"
                      >
                        {busyId === incomingReq.id ? <Loader2 size={15} className="animate-spin" /> : <X size={16} />}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === incomingReq.id}
                        onClick={() => onAccept(incomingReq.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
                        aria-label="Aceptar"
                      >
                        {busyId === incomingReq.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
                      </button>
                    </div>
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
        ) : (
        <>
        {pending.length > 0 && (
          <section>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Solicitudes · {pending.length}
            </p>
            <div className="space-y-1">
              {pending.map(req => (
                <div key={req.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <Avatar src={req.avatar} name={req.name} className="h-10 w-10 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {req.name}
                  </span>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => onReject(req.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    aria-label="Rechazar"
                  >
                    {busyId === req.id ? <Loader2 size={15} className="animate-spin" /> : <X size={16} />}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => onAccept(req.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
                    aria-label="Aceptar"
                  >
                    {busyId === req.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Amigos · {friends.length}
          </p>
          {friends.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-slate-400">Busca arriba y envía una solicitud.</p>
          ) : (
            <div className="space-y-0.5">
              {friends.map(friend => (
                <div key={friend.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFriend(friend);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/50 dark:hover:bg-white/5"
                  >
                    <Avatar src={friend.avatar} name={friend.name} className="h-10 w-10 rounded-full" />
                    <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{friend.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChat(friend.id);
                      onClose();
                    }}
                    className="rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-indigo-600"
                  >
                    Chat
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        )}
      </div>
    </GlassModal>
  );
}
