import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { MODAL_RISE, SCREEN_TRANSITION, SLIME_SHEET_IN, SLIME_SHEET_OUT, SLIME_SHEET_SHOW, STICKY } from '@/src/lib/motionPresets';
import { Dumbbell, GraduationCap, Heart, Loader2, MapPin, MessageCircle, Trophy, UserCheck, Users, UserX, X } from 'lucide-react';
import { apiGet, apiPut } from '@/src/lib/api';
import { useStoryUpload } from '@/src/lib/storyUpload';
import { coachRequestCopy, coachRequestPerson, timeAgo, type ChatAsk, type ChatGroupInvite, type CoachRequest } from '@/src/lib/feedApi';
import type { FriendRequest } from '@/src/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { LoadingBlock } from '@/src/components/ui/Spinner';

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
  refreshTick?: number;
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
  onSendFriendRequest?: (userId: string) => Promise<void> | void;
  onAnswerChat: (id: string, decision: 'accept' | 'reject') => void;
  onAnswerGroup: (id: string, decision: 'accept' | 'reject') => void;
  onAnswerCoach: (id: string, decision: 'accept' | 'reject') => void;
  onOpenProfile: (userId: string) => void;
  onOpenChat?: (peerId: string) => void;
  onGoChallenges?: () => void;
  onGoGym?: () => void;
  onNotificationsRead?: () => void;
}

const REQUEST_TYPES = new Set(['friend_request', 'chat_request', 'group_invite', 'coach_request']);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TEST_NOTE = /prueba|aviso de prueba|notificaciones ya llegan/i;

function isLiveActivityNote(note: AppNotification): boolean {
  if (REQUEST_TYPES.has(note.type)) return false;
  const text = `${note.title || ''} ${note.message || ''}`;
  if (TEST_NOTE.test(text)) return false;
  const at = new Date(note.createdAt).getTime();
  return Number.isFinite(at) && Date.now() - at <= WEEK_MS;
}

function notifIcon(type: string) {
  if (type === 'post_like') return <Heart size={14} className="text-rose-500" fill="currentColor" />;
  if (type === 'post_comment' || type === 'post_comment_reply') return <MessageCircle size={14} className="text-indigo-500" />;
  if (type === 'chat_message') return <MessageCircle size={14} className="text-indigo-500" />;
  if (type === 'friend_request' || type === 'friend_accepted') return <UserCheck size={14} className="text-emerald-600" />;
  if (type === 'group_invite' || type === 'chat_request') return <Users size={14} className="text-indigo-500" />;
  if (type === 'coach_request' || type === 'coach_accepted') return <GraduationCap size={14} className="text-amber-600" />;
  if (type === 'new_rm') return <Dumbbell size={14} className="text-emerald-600" />;
  if (type === 'challenge_invite' || type === 'challenge_join' || type === 'challenge_winner' || type === 'challenge_ending' || type === 'sbd_update') return <Trophy size={14} className="text-amber-600" />;
  if (type === 'gym_checkin') return <MapPin size={14} className="text-emerald-600" />;
  return <Heart size={14} className="text-slate-400" />;
}

export const HomeActivitySheet: React.FC<HomeActivitySheetProps> = ({
  open,
  refreshTick = 0,
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
  onSendFriendRequest,
  onAnswerChat,
  onAnswerGroup,
  onAnswerCoach,
  onOpenProfile,
  onOpenChat,
  onGoChallenges,
  onGoGym,
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
  }, [open, refreshTick, onNotificationsRead]);

  const storyUpload = useStoryUpload();
  const inbox = pendingRequests.filter(r => !r.needsFollowBack);
  const requestCount = inbox.length + chatAsks.length + groupInvites.length + coachRequests.length;
  const recent = notes.filter(isLiveActivityNote);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="home-activity"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SCREEN_TRANSITION}
          className="fixed inset-0 z-[100000] flex min-h-[100dvh] items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SCREEN_TRANSITION}
            onClick={onClose}
            className="fixed inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
          />
          <motion.div
            initial={SLIME_SHEET_IN}
            animate={SLIME_SHEET_SHOW}
            exit={SLIME_SHEET_OUT}
            transition={STICKY}
            onClick={e => e.stopPropagation()}
            className="relative z-10 max-h-[82vh] w-full max-w-sm overflow-y-auto rounded-t-[28px] border border-white/50 bg-white/70 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-slate-900/65"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/40 bg-white/40 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Actividad</p>
                <p className="text-[11px] text-slate-500">Seguimiento, likes, mensajes y lo último</p>
              </div>
              <button type="button" onClick={onClose} className="app-icon-hit rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <motion.div
              initial={MODAL_RISE.initial}
              animate={MODAL_RISE.animate}
              transition={MODAL_RISE.transition}
              className="space-y-5 px-3 py-4"
            >
              <section className="space-y-2.5">
                <p className="px-1 text-xs font-medium text-slate-400">Solicitudes</p>
                {requestCount === 0 ? (
                  <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm text-slate-400 dark:bg-slate-800/40">
                    No tienes nada pendiente.
                  </p>
                ) : (
                  <>
                    {inbox.map(req => (
                      <div key={req.id} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 dark:bg-slate-800/50">
                        <Avatar src={req.avatar} userId={req.userId || req.id} name={req.name} className="h-10 w-10 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{req.name}</p>
                          <p className="text-[11px] text-slate-400">
                            Quiere seguirte
                          </p>
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
                          <Avatar src={ask.from.avatar || undefined} userId={ask.from.id} name={ask.from.name} className="h-10 w-10 rounded-full" />
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
                          <Avatar src={inv.from.avatar || undefined} userId={inv.from.id} name={inv.from.name} className="h-10 w-10 rounded-full" />
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
                          <Avatar src={person.avatar || undefined} userId={person.id} name={person.name} className="h-10 w-10 rounded-full" />
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
                {loadingNotes && storyUpload.notices.length === 0 ? (
                  <LoadingBlock className="py-8" />
                ) : recent.length === 0 && storyUpload.notices.length === 0 ? (
                  <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm text-slate-400 dark:bg-slate-800/40">
                    Aún no hay likes, mensajes ni avisos.
                  </p>
                ) : (
                  <>
                  {storyUpload.notices.map(note => (
                    <div key={note.id} className="flex w-full items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 text-left dark:bg-slate-800/50">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Loader2 size={14} className="text-rose-500" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">{note.message}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(note.createdAt)}</span>
                      </span>
                    </div>
                  ))}
                  {recent.slice(0, 30).map(note => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        if (note.type === 'chat_message' && note.relatedUserId) {
                          onOpenChat?.(note.relatedUserId);
                          return;
                        }
                        if (note.type === 'challenge_invite' || note.type === 'challenge_join' || note.type === 'challenge_winner' || note.type === 'challenge_ending' || note.type === 'sbd_update') {
                          onGoChallenges?.();
                          return;
                        }
                        if (note.type === 'gym_checkin') {
                          onGoGym?.();
                          return;
                        }
                        if (note.relatedUserId) onOpenProfile(note.relatedUserId);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 text-left dark:bg-slate-800/50"
                    >
                      {note.relatedUser ? (
                        <Avatar src={note.relatedUser.avatar} userId={note.relatedUserId} name={note.relatedUser.name} className="h-10 w-10 rounded-full" />
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
                  ))}
                  </>
                )}
              </section>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
