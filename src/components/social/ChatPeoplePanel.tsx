import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronRight, Clock, Dumbbell, Heart, Loader2, MapPin, MessageCircle, Search, Trophy, UserCheck, UserPlus, X } from 'lucide-react';
import { CloseFriendButton } from '@/src/components/social/CloseFriendButton';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { SlimeScroll } from '@/src/components/ui/SlimeScroll';
import { apiGet, apiPut } from '@/src/lib/api';
import { timeAgo } from '@/src/lib/feedApi';
import { useStoryUpload } from '@/src/lib/storyUpload';
import { EASE_OUT } from '@/src/lib/motionPresets';
import { useLongPress } from '@/src/lib/useLongPress';
import { cn } from '@/src/lib/utils';
import type { ConnectionPerson, Friend, FriendRequest, FriendsFilter } from '@/src/types';
import type { AppNotification } from '@/src/components/social/HomeActivitySheet';
import { ListSkeleton, LoadingBlock } from '@/src/components/ui/Spinner';

interface ChatPeoplePanelProps {
  myId: string;
  pending: FriendRequest[];
  friends: Friend[];
  friendIds: string[];
  page: 'activity' | 'requests' | 'friends';
  friendsFilter?: FriendsFilter;
  onPageChange: (page: 'activity' | 'requests' | 'friends') => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSendRequest?: (userId: string) => Promise<void>;
  onOpenPerson?: (person: { id: string; name: string; avatar?: string }) => void;
  /** Hold: foto de perfil a pantalla, como una historia. */
  onHoldPerson?: (person: { id: string; name: string; avatar?: string }) => void;
  busyId?: string | null;
  refreshTick?: number;
}

const REQUEST_TYPES = new Set(['friend_request', 'chat_request', 'group_invite', 'coach_request']);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TEST_NOTE = /prueba|aviso de prueba|notificaciones ya llegan/i;

function isNewFollowerNote(note: AppNotification): boolean {
  if (note.type !== 'friend_accepted') return false;
  return (
    (note.relatedData as { kind?: string } | null)?.kind === 'new_follower' ||
    /ahora te sigue/i.test(`${note.title || ''} ${note.message || ''}`)
  );
}

function isLiveActivity(note: AppNotification): boolean {
  if (REQUEST_TYPES.has(note.type)) return false;
  const text = `${note.title || ''} ${note.message || ''}`;
  if (TEST_NOTE.test(text)) return false;
  const at = new Date(note.createdAt).getTime();
  if (!Number.isFinite(at) || Date.now() - at > WEEK_MS) return false;
  return true;
}

function activityIcon(type: string) {
  if (type === 'post_like') return <Heart size={12} className="fill-rose-500 text-rose-500" />;
  if (type === 'post_comment' || type === 'post_comment_reply') return <MessageCircle size={12} className="text-indigo-500" />;
  if (type === 'friend_accepted') return <UserCheck size={12} className="text-emerald-600" />;
  if (type === 'new_rm') return <Dumbbell size={12} className="text-emerald-600" />;
  if (type === 'challenge_invite' || type === 'challenge_join' || type === 'challenge_winner') {
    return <Trophy size={12} className="text-amber-600" />;
  }
  if (type === 'gym_checkin' || type === 'workout_reminder') return <MapPin size={12} className="text-emerald-600" />;
  return <Heart size={12} className="text-slate-400" />;
}

function activityText(note: AppNotification): string {
  const name = note.relatedUser?.name || 'Alguien';
  if (note.type === 'friend_accepted') {
    if ((note.relatedData as { kind?: string } | null)?.kind === 'new_follower' || /ahora te sigue/i.test(`${note.title || ''} ${note.message || ''}`)) {
      return `${name} ahora te sigue`;
    }
    return `${name} ha aceptado tu solicitud`;
  }
  if (note.type === 'post_like') {
    const msg = note.message || '';
    if (/historia/i.test(msg)) return `${name} ha dado like a tu historia`;
    return `${name} ha dado like a tu publicación`;
  }
  if (note.type === 'post_comment') return note.message || `${name} ha comentado tu historia`;
  if (note.type === 'post_comment_reply') return note.message || `${name} ha respondido a tu comentario`;
  if (note.type === 'chat_message') return note.message || `${name} te ha escrito`;
  if (note.type === 'coach_accepted') return note.message || `${name} ha confirmado el entrenamiento`;
  if (note.type === 'challenge_invite') return note.message || `${name} ha creado un torneo`;
  if (note.type === 'challenge_join') return note.message || `${name} se ha unido a tu torneo`;
  if (note.type === 'challenge_winner') return note.message || note.title || 'Torneo finalizado';
  if (note.type === 'new_rm') return note.message || `${name} ha batido su RM`;
  if (note.type === 'workout_reminder') return note.message || note.title || 'Hoy toca entrenar';
  if (note.type === 'gym_checkin') {
    const extra = note.message ? ` · ${note.message}` : '';
    return `${note.title || `${name} va a entrenar`}${extra}`;
  }
  return note.message || note.title;
}

export function ChatPeoplePanel({
  pending,
  friends,
  friendIds: _friendIds,
  page,
  friendsFilter = 'all',
  onPageChange,
  onAccept,
  onReject,
  onSendRequest,
  onOpenPerson,
  onHoldPerson,
  busyId,
  refreshTick = 0,
}: ChatPeoplePanelProps) {
  const [q, setQ] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connections, setConnections] = useState<{
    following: ConnectionPerson[];
    followers: ConnectionPerson[];
    all: ConnectionPerson[];
    sent: ConnectionPerson[];
  }>({ following: [], followers: [], all: [], sent: [] });
  const sentIds = useMemo(() => new Set(connections.sent.map(p => p.id)), [connections.sent]);
  const inbox = useMemo(() => pending.filter(r => !r.needsFollowBack), [pending]);
  const requestCount = inbox.length;

  useEffect(() => {
    setLoadingNotes(true);
    setLoadingConnections(true);
    apiGet<AppNotification[]>('/api/notifications', { limit: '40' })
      .then(list => setNotes(Array.isArray(list) ? list : []))
      .catch(() => setNotes([]))
      .finally(() => setLoadingNotes(false));
    apiPut('/api/notifications/read-all', {}).catch(() => {});
    apiGet<{
      following: ConnectionPerson[];
      followers: ConnectionPerson[];
      all: ConnectionPerson[];
      sent?: ConnectionPerson[];
    }>('/api/social/connections')
      .then(r => {
        if (r && Array.isArray(r.all)) {
          setConnections({
            following: r.following || [],
            followers: r.followers || [],
            all: r.all,
            sent: r.sent || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConnections(false));
  }, [refreshTick, pending.length]);

  useEffect(() => {
    setQ('');
  }, [page, friendsFilter]);

  const storyUpload = useStoryUpload();
  const recent = notes.filter(isLiveActivity);

  if (page === 'friends') {
    const isFollowers = friendsFilter === 'followers';
    const pool = isFollowers ? connections.followers : connections.following;
    const needle = q.trim().toLowerCase();
    const shown = needle ? pool.filter(p => p.name.toLowerCase().includes(needle)) : pool;

    return (
      <SlimeScroll embed evenIfShort scrollFrom="parent" contentClassName="space-y-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={isFollowers ? 'Busca en tus seguidores' : 'Busca en tus seguidos'}
            className="h-11 w-full rounded-2xl bg-white pl-10 pr-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {loadingConnections ? (
          <ListSkeleton rows={7} />
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {needle ? 'Nadie con ese nombre' : isFollowers ? 'Aún no tienes seguidores' : 'Aún no sigues a nadie'}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-4 px-0.5">
            {shown.map(person => (
              <div key={person.id} className="w-[4.6rem] text-center">
                <div className="relative mx-auto h-[4.1rem] w-[4.1rem]">
                  <HoldPerson
                    person={{ id: person.id, name: person.name, avatar: person.avatar }}
                    onHold={onHoldPerson}
                    onClick={() => onOpenPerson?.({ id: person.id, name: person.name, avatar: person.avatar })}
                    className="block h-full w-full"
                    aria-label={person.name}
                  >
                    <span className="flex h-full w-full items-center justify-center rounded-full ring-2 ring-slate-200 dark:ring-slate-700">
                      <Avatar src={person.avatar} userId={person.id} name={person.name} className="h-full w-full rounded-full" />
                    </span>
                  </HoldPerson>
                  <span className="absolute -bottom-1 -right-1">
                    <CloseFriendButton userId={person.id} className="bg-white shadow-sm dark:bg-slate-900" />
                  </span>
                </div>
                <span className="mt-2.5 block truncate text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-300">
                  {person.name.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>
        )}
      </SlimeScroll>
    );
  }

  if (page === 'requests') {
    return (
      <div className="min-h-[28rem]">
        {inbox.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No tienes más solicitudes</p>
          </div>
        ) : (
          <div className="rounded-3xl bg-white shadow-sm dark:bg-slate-900">
            <AnimatePresence initial={false}>
              {inbox.map((req, i) => (
                <motion.div
                  key={req.id}
                  layout
                  initial={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  className={
                    i > 0
                      ? 'flex items-center gap-3 overflow-hidden border-t border-slate-100 px-3.5 py-3 dark:border-slate-800'
                      : 'flex items-center gap-3 overflow-hidden px-3.5 py-3'
                  }
                >
                  <button
                    type="button"
                    onClick={() => onOpenPerson?.({ id: req.userId || req.id, name: req.name, avatar: req.avatar })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <Avatar src={req.avatar} userId={req.userId || req.id} name={req.name} className="h-11 w-11 rounded-full" />
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
                </motion.div>
              ))}
            </AnimatePresence>
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
          {inbox[0] ? (
            <Avatar src={inbox[0].avatar} userId={inbox[0].id} name={inbox[0].name} className="h-11 w-11 rounded-full" />
          ) : (
            <Heart size={18} className="text-slate-900 dark:text-slate-100" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            Solicitudes de seguimiento
          </span>
          <span className="text-[13px] text-slate-400">
            {requestCount === 0
              ? 'No tienes más solicitudes'
              : requestCount === 1
                ? 'Tienes 1 pendiente'
                : `Tienes ${requestCount} pendientes`}
          </span>
        </span>
        {requestCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
            {requestCount}
          </span>
        )}
        <ChevronRight size={18} className="shrink-0 text-slate-300" />
      </button>

      <section className="space-y-3">
        <div className="flex items-end justify-between px-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Esta semana</p>
          <p className="text-[11px] text-slate-400">Se borra a los 7 días</p>
        </div>
        {loadingNotes && storyUpload.notices.length === 0 ? (
          <LoadingBlock className="py-10" />
        ) : recent.length === 0 && storyUpload.notices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200/80 bg-transparent px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Sin avisos esta semana</p>
            <p className="mt-1 text-xs text-slate-400">Likes, follows y entrenos aparecerán aquí.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {storyUpload.notices.map(note => (
              <li key={note.id}>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-100/80 px-3 py-2.5 dark:bg-slate-800/55">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-900">
                    <Clock size={16} className="text-rose-500" />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="block text-[13px] leading-snug text-slate-700 dark:text-slate-200">{note.message}</span>
                    <span className="mt-1 block text-[11px] tabular-nums text-slate-400">{timeAgo(note.createdAt)}</span>
                  </span>
                </div>
              </li>
            ))}
            {recent.map(note => {
              const uid = note.relatedUserId;
              const followBack =
                !!uid &&
                isNewFollowerNote(note) &&
                !sentIds.has(uid) &&
                !connections.following.some(p => p.id === uid);
              return (
              <li key={note.id}>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-100/80 px-3 py-2.5 dark:bg-slate-800/55">
                  <button
                    type="button"
                    onClick={() => {
                      if (!uid) return;
                      onOpenPerson?.({
                        id: uid,
                        name: note.relatedUser?.name || 'Atleta',
                        avatar: note.relatedUser?.avatar,
                      });
                    }}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span className="relative mt-0.5 h-10 w-10 shrink-0">
                      {note.relatedUser ? (
                        <Avatar src={note.relatedUser.avatar} userId={note.relatedUserId} name={note.relatedUser.name} className="h-10 w-10 rounded-full" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-slate-900">
                          {activityIcon(note.type)}
                        </span>
                      )}
                      {note.relatedUser && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900">
                          {activityIcon(note.type)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className="block text-[13px] leading-snug text-slate-700 dark:text-slate-200">
                        {activityText(note)}
                      </span>
                      <span className="mt-1 block text-[11px] tabular-nums text-slate-400">{timeAgo(note.createdAt)}</span>
                    </span>
                  </button>
                  {followBack && (
                    <button
                      type="button"
                      disabled={sendingId === uid || !onSendRequest}
                      onClick={() => {
                        if (!uid || !onSendRequest) return;
                        const person = {
                          id: uid,
                          name: note.relatedUser?.name || 'Atleta',
                          avatar: note.relatedUser?.avatar,
                        };
                        setSendingId(uid);
                        void onSendRequest(uid)
                          .then(() => {
                            setConnections(prev => {
                              if (prev.sent.some(s => s.id === uid)) return prev;
                              return {
                                ...prev,
                                sent: [{ ...person, canSendRequest: false }, ...prev.sent],
                              };
                            });
                          })
                          .finally(() => setSendingId(null));
                      }}
                      className="mt-0.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                      {sendingId === uid ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      Seguir
                    </button>
                  )}
                  {uid && isNewFollowerNote(note) && !followBack && (
                    <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                      <Check size={12} />
                      {sentIds.has(uid) ? 'Enviada' : 'Siguiendo'}
                    </span>
                  )}
                </div>
              </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function HoldPerson({
  person,
  onHold,
  onClick,
  disabled,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  person: { id: string; name: string; avatar?: string };
  onHold?: (person: { id: string; name: string; avatar?: string }) => void;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  const hold = useLongPress(() => onHold?.(person));
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn('select-none touch-manipulation', className)}
      onPointerDown={onHold ? hold.onPointerDown : undefined}
      onPointerUp={onHold ? hold.onPointerUp : undefined}
      onPointerCancel={onHold ? hold.onPointerCancel : undefined}
      onPointerLeave={onHold ? hold.onPointerLeave : undefined}
      onContextMenu={onHold ? hold.onContextMenu : undefined}
      onClick={e => {
        if (hold.suppressClick(e)) return;
        onClick?.();
      }}
    >
      {children}
    </button>
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
