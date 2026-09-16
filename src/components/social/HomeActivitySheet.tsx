import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Dumbbell, GraduationCap, Heart, Loader2, MessageCircle, Trophy, UserCheck, Users, UserX, X } from 'lucide-react';
import { apiGet, apiPut } from '@/src/lib/api';
import { coachRequestCopy, coachRequestPerson, timeAgo, type ChatAsk, type ChatGroupInvite, type CoachRequest } from '@/src/lib/feedApi';
import type { FriendRequest } from '@/src/types';
import { Avatar } from '@/src/components/ui/Avatar';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedUserId: string | null;
  relatedUser: { name: string; avatar: string } | null;
  relatedData?: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

interface HomeActivitySheetProps {
  open: boolean;
  onClose: () => void;
  pendingRequests: FriendRequest[];
  chatAsks: ChatAsk[];
  groupInvites: ChatGroupInvite[];
  coachRequests: CoachRequest[];
  acceptRejectLoadingId: string | null;
  chatAskBusyId: string | null;
  groupInviteBusyId: string | null;
  coachRequestBusyId: string | null;
  onAcceptFriend: (id: string) => void;
  onRejectFriend: (id: string) => void;
  onAnswerChat: (id: string, decision: 'accept' | 'reject') => void;
  onAnswerGroup: (id: string, decision: 'accept' | 'reject') => void;
  onAnswerCoach: (id: string, decision: 'accept' | 'reject') => void;
  onOpenProfile: (userId: string) => void;
  onGoFriends: () => void;
  onOpenChat?: (peerId: string) => void;
  onGoChallenges?: () => void;
  onNotificationsRead?: () => void;
}

const REQUEST_TYPES = new Set(['friend_request', 'chat_request', 'group_invite', 'coach_request']);

function notifIcon(type: string) {
  if (type === 'post_like') return <Heart size={14} className="text-rose-500" fill="currentColor" />;
  if (type === 'post_comment' || type === 'post_comment_reply') return <MessageCircle size={14} className="text-indigo-500" />;
  if (type === 'chat_message') return <MessageCircle size={14} className="text-indigo-500" />;
  if (type === 'friend_request' || type === 'friend_accepted') return <UserCheck size={14} className="text-emerald-600" />;
  if (type === 'group_invite' || type === 'chat_request') return <Users size={14} className="text-indigo-500" />;
  if (type === 'coach_request' || type === 'coach_accepted') return <GraduationCap size={14} className="text-amber-600" />;
  if (type === 'new_rm') return <Dumbbell size={14} className="text-emerald-600" />;
  if (type === 'challenge_invite' || type === 'challenge_join' || type === 'challenge_winner') return <Trophy size={14} className="text-amber-600" />;
  return <Heart size={14} className="text-slate-400" />;
}

export const HomeActivitySheet: React.FC<HomeActivitySheetProps> = ({
  open,
  onClose,
  pendingRequests,
  chatAsks,
  groupInvites,
  coachRequests,
  acceptRejectLoadingId,
  chatAskBusyId,
  groupInviteBusyId,
  coachRequestBusyId,
  onAcceptFriend,
  onRejectFriend,
  onAnswerChat,
  onAnswerGroup,
  onAnswerCoach,
  onOpenProfile,
  onGoFriends,
  onOpenChat,
  onGoChallenges,
  onNotificationsRead,
}) => {
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingNotes(true);
    apiGet<AppNotification[]>('/api/notifications', { limit: '40' })
      .then(list => setNotes(Array.isArray(list) ? list : []))
      .catch(() => setNotes([]))
      .finally(() => setLoadingNotes(false));
    apiPut('/api/notifications/read-all', {})
      .then(() => onNotificationsRead?.())
      .catch(() => {});
  }, [open, onNotificationsRead]);

  const requestCount = pendingRequests.length + chatAsks.length + groupInvites.length + coachRequests.length;
  const recent = notes.filter(n => !REQUEST_TYPES.has(n.type));

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="home-activity"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100000] flex min-h-[100dvh] items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={e => e.stopPropagation()}
            className="relative z-10 max-h-[82vh] w-full max-w-sm overflow-y-auto rounded-t-[28px] border border-white/50 bg-white/70 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-slate-900/65"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/40 bg-white/40 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Actividad</p>
                <p className="text-[11px] text-slate-500">Seguimiento, likes, mensajes y lo último</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-3 py-4">
              <section className="space-y-2.5">
                <p className="px-1 text-xs font-medium text-slate-400">Solicitudes</p>
                {requestCount === 0 ? (
                  <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm text-slate-400 dark:bg-slate-800/40">
                    No tienes nada pendiente.
                  </p>
                ) : (
                  <>
                    {pendingRequests.map(req => (
                      <div key={req.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 dark:bg-slate-800/50">
                        <Avatar src={req.avatar} name={req.name} className="h-10 w-10 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{req.name}</p>
                          <p className="text-[11px] text-slate-400">Quiere ser tu amigo</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={acceptRejectLoadingId === req.id}
                            onClick={() => onRejectFriend(req.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-rose-500 dark:bg-slate-800"
                            aria-label="Rechazar"
                          >
                            {acceptRejectLoadingId === req.id ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                          </button>
                          <button
                            type="button"
                            disabled={acceptRejectLoadingId === req.id}
                            onClick={() => onAcceptFriend(req.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"
                            aria-label="Aceptar"
                          >
                            {acceptRejectLoadingId === req.id ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {chatAsks.map(ask => (
                      <div key={ask.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 dark:bg-slate-800/50">
                        <button type="button" onClick={() => onOpenProfile(ask.from.id)} className="shrink-0">
                          <Avatar src={ask.from.avatar || undefined} name={ask.from.name} className="h-10 w-10 rounded-full" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{ask.from.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{ask.preview || 'Quiere chatear'}</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={chatAskBusyId === ask.id}
                            onClick={() => onAnswerChat(ask.id, 'reject')}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-rose-500 dark:bg-slate-800"
                            aria-label="Rechazar"
                          >
                            {chatAskBusyId === ask.id ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                          </button>
                          <button
                            type="button"
                            disabled={chatAskBusyId === ask.id}
                            onClick={() => onAnswerChat(ask.id, 'accept')}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"
                            aria-label="Aceptar"
                          >
                            {chatAskBusyId === ask.id ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {groupInvites.map(inv => (
                      <div key={inv.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 dark:bg-slate-800/50">
                        <button type="button" onClick={() => onOpenProfile(inv.from.id)} className="shrink-0">
                          <Avatar src={inv.from.avatar || undefined} name={inv.from.name} className="h-10 w-10 rounded-full" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{inv.from.name}</p>
                          <p className="truncate text-[11px] text-slate-400">
                            {inv.kind === 'team' ? `Te invita al equipo «${inv.groupName}»` : `Te invita a «${inv.groupName}»`}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={groupInviteBusyId === inv.id}
                            onClick={() => onAnswerGroup(inv.id, 'reject')}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-rose-500 dark:bg-slate-800"
                            aria-label="Rechazar"
                          >
                            {groupInviteBusyId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                          </button>
                          <button
                            type="button"
                            disabled={groupInviteBusyId === inv.id}
                            onClick={() => onAnswerGroup(inv.id, 'accept')}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"
                            aria-label="Aceptar"
                          >
                            {groupInviteBusyId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {coachRequests.map(req => {
                      const person = coachRequestPerson(req);
                      return (
                      <div key={req.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 dark:bg-slate-800/50">
                        <button type="button" onClick={() => onOpenProfile(person.id)} className="shrink-0">
                          <Avatar src={person.avatar || undefined} name={person.name} className="h-10 w-10 rounded-full" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{person.name}</p>
                          <p className="text-[11px] text-slate-400">{coachRequestCopy(req)}</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={coachRequestBusyId === req.id}
                            onClick={() => onAnswerCoach(req.id, 'reject')}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-rose-500 dark:bg-slate-800"
                            aria-label="Rechazar"
                          >
                            {coachRequestBusyId === req.id ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                          </button>
                          <button
                            type="button"
                            disabled={coachRequestBusyId === req.id}
                            onClick={() => onAnswerCoach(req.id, 'accept')}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"
                            aria-label="Aceptar"
                          >
                            {coachRequestBusyId === req.id ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </>
                )}
              </section>

              <section className="space-y-2.5">
                <p className="px-1 text-xs font-medium text-slate-400">Reciente</p>
                {loadingNotes ? (
                  <div className="flex justify-center py-8 text-slate-400">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : recent.length === 0 ? (
                  <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm text-slate-400 dark:bg-slate-800/40">
                    Aún no hay likes, mensajes ni avisos.
                  </p>
                ) : (
                  recent.slice(0, 30).map(note => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        if (note.type === 'chat_message' && note.relatedUserId) {
                          onOpenChat?.(note.relatedUserId);
                          return;
                        }
                        if (note.type === 'challenge_invite' || note.type === 'challenge_join' || note.type === 'challenge_winner') {
                          onGoChallenges?.();
                          return;
                        }
                        if (note.relatedUserId) onOpenProfile(note.relatedUserId);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 text-left dark:bg-slate-800/50"
                    >
                      {note.relatedUser ? (
                        <Avatar src={note.relatedUser.avatar} name={note.relatedUser.name} className="h-10 w-10 rounded-full" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                          {notifIcon(note.type)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
                          {note.message || note.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(note.createdAt)}</span>
                      </span>
                      <span className="shrink-0">{notifIcon(note.type)}</span>
                    </button>
                  ))
                )}
              </section>

              <button
                type="button"
                onClick={onGoFriends}
                className="w-full rounded-2xl bg-white/70 py-3 text-sm font-medium text-indigo-600 dark:bg-slate-800/50 dark:text-indigo-300"
              >
                Ver amigos
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
