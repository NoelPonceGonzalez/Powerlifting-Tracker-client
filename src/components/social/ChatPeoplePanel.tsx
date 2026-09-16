import React, { useEffect, useMemo, useState } from 'react';
import { Check, Heart, Loader2, Search, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { apiGet } from '@/src/lib/api';
import type { FriendRequest, UserSearchResult } from '@/src/types';

interface ChatPeoplePanelProps {
  myId: string;
  pending: FriendRequest[];
  friendIds: string[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onOpenPerson?: (person: { id: string; name: string; avatar?: string }) => void;
  busyId?: string | null;
}

export function ChatPeoplePanel({
  myId,
  pending,
  friendIds,
  onAccept,
  onReject,
  onSendRequest,
  onOpenPerson,
  busyId,
}: ChatPeoplePanelProps) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const known = useMemo(() => new Set(friendIds), [friendIds]);

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

  return (
    <div className="space-y-5">
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
        <section>
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Solicitudes · {pending.length}
          </p>
          <div className="rounded-3xl bg-white shadow-sm dark:bg-slate-900">
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
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <Heart size={26} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nadie te ha pedido seguirte</p>
          <p className="mt-1 text-xs text-slate-400">Busca arriba y envía una solicitud.</p>
        </div>
      )}
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
        className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
        aria-label="Rechazar"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={16} />}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onAccept}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
        aria-label="Aceptar"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}
      </button>
    </div>
  );
}
