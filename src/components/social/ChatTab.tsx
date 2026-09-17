import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Bell, BellOff, Dumbbell, GraduationCap, Heart, Image as ImageIcon, Loader2, LogOut, MessageCircle, Paperclip, Pencil, Pin, Search, Send, Trash2, User, UserMinus, Users } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { Button } from '@/src/components/ui/Button';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { cn } from '@/src/lib/utils';
import { apiGet, mediaUrl } from '@/src/lib/api';
import { isRealtimeOpen, subscribeChatRealtime } from '@/src/lib/chatRealtime';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import { STICKY } from '@/src/lib/motionPresets';
import type { Friend, FriendRequest, UserSearchResult } from '@/src/types';
import { ChatPeoplePanel } from '@/src/components/social/ChatPeoplePanel';
import { StoriesRail } from '@/src/components/social/StoriesRail';
import {
  addChatGroupMembers,
  deleteChat,
  deleteGroupChat,
  fetchChatMessages,
  fetchChats,
  fetchGroupMessages,
  fetchOwnProfile,
  fetchProfile,
  removeChatGroupMember,
  renameChatGroup,
  sendChatMessage,
  sendChatTyping,
  sendGroupMessage,
  timeAgo,
  type ChatGroupCard,
  type ChatLine,
  type ChatThread,
  type FeedAuthor,
} from '@/src/lib/feedApi';

type PendingDelete =
  | { kind: 'dm'; peerId: string; name: string }
  | { kind: 'group'; groupId: string; name: string; team?: boolean };

interface ChatTabProps {
  myId: string;
  friends: Friend[];
  startWith?: string | null;
  pending?: FriendRequest[];
  /** Solicitudes por aceptar (follows, chats, grupos…). Se ve en el corazón. */
  acceptCount?: number;
  onOpened?: () => void;
  onOpenMini?: (person: FeedAuthor) => void;
  onAcceptRequest?: (id: string) => void;
  onRejectRequest?: (id: string) => void;
  onSendRequest?: (userId: string) => Promise<void>;
  requestBusyId?: string | null;
  onConversationChange?: (open: boolean) => void;
  onAddStory?: () => void;
  storyRefreshTick?: number;
  pageActive?: boolean;
}

type OpenChat =
  | { kind: 'dm'; peer: FeedAuthor }
  | { kind: 'group'; group: ChatGroupCard };

function threadKey(thread: ChatThread): string {
  return thread.kind === 'group' ? `g:${thread.group?.id}` : `d:${thread.peer?.id}`;
}

type ChatPref = { pinned?: boolean; muted?: boolean };

function prefsStore(myId: string) {
  return `pl-chat-prefs:${myId}`;
}

function readPrefs(myId: string): Record<string, ChatPref> {
  try {
    const raw = localStorage.getItem(prefsStore(myId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePrefs(myId: string, next: Record<string, ChatPref>) {
  localStorage.setItem(prefsStore(myId), JSON.stringify(next));
}

function hoursLeftLabel(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'caducó';
  const h = Math.max(1, Math.round(ms / 3600000));
  return `${h} h`;
}

function inboxPreview(text?: string): string {
  if (!text) return 'Aún no habéis hablado';
  if (/^e2e/i.test(text)) return 'Chat listo';
  return text;
}

function InboxRow({
  row,
  onOpen,
  highlighted,
  onLongPress,
  onDismiss,
  onPin,
  onMute,
  onProfile,
  onDelete,
}: {
  row: ChatThread;
  onOpen: () => void;
  highlighted?: boolean;
  onLongPress?: () => void;
  onDismiss?: () => void;
  onPin?: () => void;
  onMute?: () => void;
  onProfile?: () => void;
  onDelete?: () => void;
}) {
  const isGroup = row.kind === 'group' && row.group;
  const name = isGroup ? row.group!.name : row.peer?.name || 'Chat';
  const unread = row.unread > 0 && !row.muted;
  const preview = inboxPreview(row.lastText);
  const hold = useRef<number | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [pressing, setPressing] = useState(false);
  const [sure, setSure] = useState(false);

  useEffect(() => {
    if (!highlighted) setSure(false);
  }, [highlighted]);

  const clearHold = () => {
    if (hold.current != null) {
      window.clearTimeout(hold.current);
      hold.current = null;
    }
  };

  const startHold = () => {
    held.current = false;
    hold.current = window.setTimeout(() => {
      held.current = true;
      setPressing(false);
      onLongPress?.();
    }, 380);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        scaleX: pressing ? 1.055 : 1,
        scaleY: pressing ? 0.9 : 1,
        borderRadius: pressing || highlighted ? 22 : 0,
      }}
      exit={{ opacity: 0, height: 0 }}
      transition={STICKY}
      className={cn(
        'group origin-center border-b border-slate-100 last:border-0 dark:border-slate-800',
        unread && !highlighted && 'bg-indigo-50/70 dark:bg-indigo-950/25',
        highlighted && 'relative z-10 bg-white shadow-[0_10px_28px_-12px_rgba(15,23,42,0.28)] dark:bg-slate-800'
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          if (highlighted) {
            onDismiss?.();
            return;
          }
          onOpen();
        }}
        onPointerDown={e => {
          start.current = { x: e.clientX, y: e.clientY };
          setPressing(true);
          startHold();
        }}
        onPointerMove={e => {
          if (!start.current) return;
          const dx = e.clientX - start.current.x;
          const dy = e.clientY - start.current.y;
          if (dx * dx + dy * dy > 100) {
            clearHold();
            setPressing(false);
          }
        }}
        onPointerUp={() => {
          clearHold();
          setPressing(false);
        }}
        onPointerCancel={() => {
          clearHold();
          setPressing(false);
        }}
        onPointerLeave={() => {
          clearHold();
          setPressing(false);
        }}
        onContextMenu={e => {
          e.preventDefault();
        }}
        className="flex min-w-0 w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        {isGroup ? (
          <span className={cn(
            'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl',
            row.group?.kind === 'team'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
          )}>
            {row.group?.kind === 'team' ? <Dumbbell size={20} /> : <Users size={20} />}
          </span>
        ) : (
          <Face name={row.peer!.name} avatar={row.peer!.avatar} size={52} online={row.peer!.online} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn(
              'truncate text-[15px] text-slate-900 dark:text-slate-100',
              unread ? 'font-bold' : 'font-semibold'
            )}>
              {name}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {row.pinned && <Pin size={11} className="text-indigo-500" />}
              {row.muted && <BellOff size={11} className="text-slate-400" />}
              {row.lastAt && (
                <span className={cn(
                  'text-[11px]',
                  unread ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-slate-400'
                )}>
                  {timeAgo(row.lastAt)}
                </span>
              )}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {row.isCoach && <GraduationCap size={12} className="shrink-0 text-amber-500" />}
            {isGroup && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {row.group?.kind === 'team' ? 'Equipo' : 'Grupo'}
              </span>
            )}
            {row.waiting && (
              <span className="shrink-0 text-[10px] font-semibold text-amber-600">Esperando</span>
            )}
            <span className={cn(
              'min-w-0 truncate text-[13px]',
              unread ? 'font-medium text-slate-700 dark:text-slate-200' : 'text-slate-400'
            )}>
              {preview}
            </span>
            {unread && (
              <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">
                {row.unread}
              </span>
            )}
          </span>
        </span>
      </button>
      <AnimatePresence>
        {highlighted && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STICKY}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap justify-end gap-2 px-3.5 pb-2.5">
              {row.peer && (
                <button
                  type="button"
                  onClick={() => onProfile?.()}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                >
                  <User size={12} />
                  Perfil
                </button>
              )}
              <button
                type="button"
                onClick={() => onPin?.()}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
              >
                <Pin size={12} />
                {row.pinned ? 'Fijado' : 'Fijar'}
              </button>
              <button
                type="button"
                onClick={() => onMute?.()}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100"
              >
                {row.muted ? <Bell size={12} /> : <BellOff size={12} />}
                {row.muted ? 'Sonar' : 'Silenciar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!sure) {
                    setSure(true);
                    return;
                  }
                  onDelete?.();
                }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold',
                  sure
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
                )}
              >
                <Trash2 size={12} />
                {sure
                  ? '¿Seguro?'
                  : isGroup
                    ? (row.group?.kind === 'team' ? 'Salir' : 'Salir')
                    : 'Eliminar'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Face({
  name,
  avatar,
  size,
  online,
}: {
  name: string;
  avatar: string | null;
  size: number;
  online?: boolean;
}) {
  return (
    <span className="relative shrink-0">
      <Avatar name={name} avatar={avatar} size={size} />
      {online && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
      )}
    </span>
  );
}

export const ChatTab: React.FC<ChatTabProps> = ({
  myId,
  friends,
  startWith,
  pending = [],
  acceptCount,
  onOpened,
  onOpenMini,
  onAcceptRequest,
  onRejectRequest,
  onSendRequest,
  requestBusyId,
  onConversationChange,
  onAddStory,
  storyRefreshTick = 0,
  pageActive = true,
}) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [coach, setCoach] = useState<FeedAuthor | null>(null);
  const [athletes, setAthletes] = useState<FeedAuthor[]>([]);
  const [open, setOpen] = useState<OpenChat | null>(null);
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<FeedAuthor[]>([]);
  const [waitingPeer, setWaitingPeer] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, ChatPref>>(() => readPrefs(myId));
  const [peerOnline, setPeerOnline] = useState(false);
  const [typingLabel, setTypingLabel] = useState('');
  const [attach, setAttach] = useState<File | null>(null);
  const [inboxQ, setInboxQ] = useState('');
  const [groupPanel, setGroupPanel] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [addPick, setAddPick] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionRow, setActionRow] = useState<ChatThread | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peoplePage, setPeoplePage] = useState<'activity' | 'requests' | 'friends'>('activity');
  const heartBadge = Math.max(acceptCount ?? 0, pending.length);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyped = useRef(0);

  useEffect(() => {
    onConversationChange?.(!!open);
    return () => onConversationChange?.(false);
  }, [open, onConversationChange]);

  useEscapeClose(!!actionRow, () => setActionRow(null));
  useEscapeClose(peopleOpen && !open, () => {
    if (peoplePage === 'requests' || peoplePage === 'friends') setPeoplePage('activity');
    else setPeopleOpen(false);
  });

  useEffect(() => {
    setPrefs(readPrefs(myId));
  }, [myId]);

  const patchPref = (row: ChatThread, patch: ChatPref) => {
    const key = threadKey(row);
    setPrefs(prev => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      writePrefs(myId, next);
      return next;
    });
    setActionRow(prev => (prev && threadKey(prev) === key ? { ...prev, ...patch } : prev));
  };

  const people = useMemo(() => {
    const byId = new Map<string, FeedAuthor>();
    for (const friend of friends) {
      if (friend.id === myId) continue;
      byId.set(friend.id, { id: friend.id, name: friend.name, avatar: friend.avatar ?? null });
    }
    if (coach) byId.set(coach.id, coach);
    for (const athlete of athletes) byId.set(athlete.id, athlete);
    return [...byId.values()].sort((a, b) => {
      if (coach && a.id === coach.id) return -1;
      if (coach && b.id === coach.id) return 1;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [friends, coach, athletes, myId]);

  const friendIds = useMemo(() => new Set(people.map(p => p.id)), [people]);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const results = await apiGet<UserSearchResult[]>('/api/social/search', { q });
        setSearchHits(
          results
            .filter(u => u.id !== myId && !friendIds.has(u.id))
            .map(u => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }))
        );
      } catch {
        setSearchHits([]);
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchQ, myId, friendIds]);

  const loadInbox = useCallback(async () => {
    try {
      const [inbox, me] = await Promise.all([
        fetchChats(),
        fetchOwnProfile().catch(() => null),
      ]);
      setThreads(inbox.threads);
      setCoach(me?.coach ?? null);
      setAthletes(me?.athletes ?? []);
    } catch {
      /* se puede reintentar al volver a la pestaña */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pageActive) return;
    void loadInbox();
  }, [loadInbox, pageActive]);

  useEffect(() => {
    if (!pageActive) return;
    const id = window.setInterval(() => {
      if (isRealtimeOpen()) return;
      void loadInbox();
    }, 45000);
    return () => window.clearInterval(id);
  }, [loadInbox, pageActive]);

  const openDm = useCallback(async (author: FeedAuthor) => {
    setOpen({ kind: 'dm', peer: author });
    setActionRow(null);
    setPeopleOpen(false);
    setGroupPanel(false);
    setAttach(null);
    setTypingLabel('');
    try {
      const res = await fetchChatMessages(author.id);
      setMessages(res.messages);
      setWaitingPeer(!!res.waiting);
      setPeerOnline(!!res.online || !!author.online);
    } catch {
      setMessages([]);
      setWaitingPeer(false);
    }
  }, []);

  const openGroup = useCallback(async (group: ChatGroupCard) => {
    setOpen({ kind: 'group', group });
    setActionRow(null);
    setPeopleOpen(false);
    setGroupPanel(false);
    setAttach(null);
    setTypingLabel('');
    setGroupNameDraft(group.name);
    try {
      const res = await fetchGroupMessages(group.id);
      setOpen({ kind: 'group', group: res.group });
      setGroupNameDraft(res.group.name);
      setMessages(res.messages);
    } catch {
      setMessages([]);
    }
  }, []);

  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!startWith) {
      startedFor.current = null;
      return;
    }
    if (startedFor.current === startWith) return;
    startedFor.current = startWith;
    onOpened?.();
    const fromThread = threads.find(t => t.kind !== 'group' && t.peer?.id === startWith)?.peer;
    const fromFriends = friends.find(f => f.id === startWith);
    const author =
      fromThread ||
      (coach?.id === startWith ? coach : null) ||
      (fromFriends ? { id: fromFriends.id, name: fromFriends.name, avatar: fromFriends.avatar ?? null } : null);
    if (author) {
      void openDm(author);
      return;
    }
    void fetchProfile(startWith)
      .then(p => {
        void openDm({ id: p.id, name: p.name, avatar: p.avatar });
      })
      .catch(() => {});
  }, [startWith, threads, friends, coach, openDm, onOpened]);

  useEffect(() => {
    if (!open || !pageActive) return;
    const id = window.setInterval(async () => {
      if (isRealtimeOpen()) return;
      try {
        if (open.kind === 'dm') {
          const res = await fetchChatMessages(open.peer.id);
          setMessages(res.messages);
          setWaitingPeer(!!res.waiting);
          setPeerOnline(!!res.online);
        } else {
          const res = await fetchGroupMessages(open.group.id);
          setMessages(res.messages);
        }
      } catch {
        /* silencioso */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [open, pageActive]);

  useEffect(() => {
    return subscribeChatRealtime(event => {
      if (event.type === 'chat_message') {
        const line = event.message;
        setMessages(prev => {
          if (!open) return prev;
          const matches =
            (open.kind === 'dm' && event.peerId === open.peer.id) ||
            (open.kind === 'group' && event.groupId === open.group.id);
          if (!matches) return prev;
          if (prev.some(m => m.id === line.id)) return prev;
          return [...prev, line];
        });
        void loadInbox();
        return;
      }
      if (event.type === 'chat_typing') {
        const matches =
          (open?.kind === 'dm' && event.peerId === open.peer.id) ||
          (open?.kind === 'group' && event.groupId === open.group.id);
        if (!matches) return;
        setTypingLabel(event.fromName ? `${event.fromName} está escribiendo…` : 'Está escribiendo…');
        window.setTimeout(() => setTypingLabel(''), 3500);
      }
    });
  }, [open, loadInbox]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, open]);

  const rows = useMemo(() => {
    const list: ChatThread[] = threads
      .filter(t => !!t.lastAt)
      .map(t => {
        const kind = t.kind || (t.group ? 'group' : 'dm');
        const key = kind === 'group' ? `g:${t.group?.id}` : `d:${t.peer?.id}`;
        const pref = prefs[key] || {};
        return {
          ...t,
          kind,
          isCoach: t.isCoach || (!!coach && t.peer?.id === coach.id),
          waiting: !!t.waiting,
          pinned: !!pref.pinned,
          muted: !!pref.muted,
        };
      });
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.lastAt || '').localeCompare(a.lastAt || '');
    });
  }, [threads, coach, prefs]);

  const visibleRows = useMemo(() => {
    const q = inboxQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => {
      const name = row.kind === 'group' && row.group ? row.group.name : row.peer?.name || '';
      const preview = inboxPreview(row.lastText).toLowerCase();
      return name.toLowerCase().includes(q) || preview.includes(q);
    });
  }, [rows, inboxQ]);

  const searchPeople = useMemo(() => {
    const q = inboxQ.trim().toLowerCase();
    if (!q) return [];
    const inInbox = new Set(rows.filter(r => r.peer).map(r => r.peer!.id));
    return people.filter(p => !inInbox.has(p.id) && p.name.toLowerCase().includes(q));
  }, [inboxQ, people, rows]);

  const pingTyping = useCallback(() => {
    if (!open || waitingPeer) return;
    const now = Date.now();
    if (now - lastTyped.current < 1600) return;
    lastTyped.current = now;
    if (open.kind === 'dm') void sendChatTyping({ peerId: open.peer.id });
    else void sendChatTyping({ groupId: open.group.id });
  }, [open, waitingPeer]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!open || sending) return;
    if (!text && !attach) return;
    setSending(true);
    setDraft('');
    const file = attach;
    setAttach(null);
    try {
      if (open.kind === 'dm') {
        const created = await sendChatMessage(open.peer.id, text, file);
        setWaitingPeer(!!created.requested);
        setMessages(prev => {
          const withoutPreview = prev.filter(line => line.id !== 'preview');
          return [...withoutPreview, created];
        });
      } else {
        const created = await sendGroupMessage(open.group.id, text, file);
        setMessages(prev => [...prev, created]);
      }
      void loadInbox();
    } catch {
      setDraft(text);
      setAttach(file);
    } finally {
      setSending(false);
    }
  }, [draft, attach, open, sending, loadInbox]);


  const renameOpenGroup = async () => {
    if (open?.kind !== 'group') return;
    const name = groupNameDraft.trim();
    if (!name || name === open.group.name) return;
    try {
      const res = await renameChatGroup(open.group.id, name);
      setOpen({ kind: 'group', group: res.group });
      void loadInbox();
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido cambiar el nombre');
    }
  };

  const addPeopleToGroup = async () => {
    if (open?.kind !== 'group' || addPick.length < 1) return;
    try {
      const res = await addChatGroupMembers(open.group.id, addPick);
      setOpen({ kind: 'group', group: res.group });
      setAddPick([]);
      setSearchQ('');
      void loadInbox();
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido añadir');
    }
  };

  const askDeleteThread = (row: ChatThread) => {
    if (row.kind === 'group' && row.group) {
      setPendingDelete({ kind: 'group', groupId: row.group.id, name: row.group.name, team: row.group.kind === 'team' });
      return;
    }
    if (row.peer) setPendingDelete({ kind: 'dm', peerId: row.peer.id, name: row.peer.name });
  };

  const wipeThread = async (row: ChatThread) => {
    if (deleting) return;
    setDeleting(true);
    try {
      if (row.kind === 'group' && row.group) await deleteGroupChat(row.group.id);
      else if (row.peer) await deleteChat(row.peer.id);
      setActionRow(null);
      void loadInbox();
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido eliminar el chat');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      if (pendingDelete.kind === 'dm') await deleteChat(pendingDelete.peerId);
      else await deleteGroupChat(pendingDelete.groupId);
      const closed =
        (open?.kind === 'dm' && pendingDelete.kind === 'dm' && open.peer.id === pendingDelete.peerId) ||
        (open?.kind === 'group' && pendingDelete.kind === 'group' && open.group.id === pendingDelete.groupId);
      if (closed) {
        setOpen(null);
        setGroupPanel(false);
        setMessages([]);
      }
      setPendingDelete(null);
      void loadInbox();
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido eliminar el chat');
    } finally {
      setDeleting(false);
    }
  };

  const kickOrLeave = async (userId: string) => {
    if (open?.kind !== 'group') return;
    const leaving = userId === myId;
    if (!window.confirm(leaving ? (open.group.kind === 'team' ? '¿Salir del equipo?' : '¿Salir del grupo?') : '¿Echar a esta persona?')) return;
    try {
      await removeChatGroupMember(open.group.id, userId);
      if (leaving) {
        setOpen(null);
        setGroupPanel(false);
      } else {
        setOpen({
          kind: 'group',
          group: {
            ...open.group,
            members: open.group.members.filter(m => m.id !== userId),
          },
        });
      }
      void loadInbox();
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido hacer');
    }
  };

  const deleteModal = (
    <GlassModal
      open={!!pendingDelete}
      onClose={() => { if (!deleting) setPendingDelete(null); }}
      persist={deleting}
      rise
      title="Eliminar chat"
      subtitle={pendingDelete ? pendingDelete.name : undefined}
      footer={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            disabled={deleting}
            onClick={() => setPendingDelete(null)}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            className="flex-1 rounded-xl"
            disabled={deleting}
            onClick={() => void confirmDelete()}
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {pendingDelete?.kind === 'group'
          ? pendingDelete.team
            ? 'Sales del equipo y desaparece de tu lista. Los demás siguen.'
            : 'Sales del grupo y desaparece de tu lista. Los demás siguen.'
          : 'Se quita de tu lista. El otro no lo nota. Si te escribe, vuelve a salir.'}
      </p>
    </GlassModal>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (open) {
    const talkingToCoach = open.kind === 'dm' && coach?.id === open.peer.id;
    const title = open.kind === 'dm' ? open.peer.name : open.group.name;
    const subtitle =
      open.kind === 'dm'
        ? talkingToCoach
          ? peerOnline
            ? 'Tu entrenador · en línea'
            : 'Tu entrenador'
          : waitingPeer
            ? 'Esperando a que acepte'
            : peerOnline
              ? 'En línea'
              : 'Chat'
        : [
            `${open.group.members.length} en el ${open.group.kind === 'team' ? 'equipo' : 'grupo'}`,
            open.group.pending?.length ? `${open.group.pending.length} pendiente${open.group.pending.length === 1 ? '' : 's'}` : '',
          ].filter(Boolean).join(' · ');
    const iCreatedGroup = open.kind === 'group' && open.group.createdBy === myId;
    const alreadyInGroup = new Set(
      open.kind === 'group' ? [...open.group.members.map(m => m.id), ...(open.group.pending || []).map(m => m.id)] : []
    );

    const conversation = (
      <div className="flex min-h-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-3 border-b border-white/40 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70">
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          {open.kind === 'dm' ? (
            <button
              type="button"
              onClick={() => onOpenMini?.(open.peer)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Face name={open.peer.name} avatar={open.peer.avatar} size={40} online={peerOnline} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-900 dark:text-slate-100">{title}</span>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">{subtitle}</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setGroupPanel(v => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                open.group.kind === 'team'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
              )}>
                {open.group.kind === 'team' ? <Dumbbell size={18} /> : <Users size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-900 dark:text-slate-100">{title}</span>
                <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {subtitle}
                </span>
              </span>
              <Pencil size={14} className="shrink-0 text-slate-400" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (open.kind === 'dm') {
                setPendingDelete({ kind: 'dm', peerId: open.peer.id, name: open.peer.name });
              } else {
                setPendingDelete({ kind: 'group', groupId: open.group.id, name: open.group.name, team: open.group.kind === 'team' });
              }
            }}
            className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
            aria-label="Eliminar chat"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {open.kind === 'group' && groupPanel && (
          <div className="max-h-72 space-y-3 overflow-y-auto border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex gap-2">
              <input
                value={groupNameDraft}
                onChange={e => setGroupNameDraft(e.target.value.slice(0, 40))}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => void renameOpenGroup()}
                className="rounded-xl bg-indigo-600 px-3 text-[11px] font-black uppercase text-white"
              >
                Nombre
              </button>
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              {open.group.kind === 'team' ? 'En el equipo' : 'En el grupo'}
            </p>
            <div className="space-y-1">
              {open.group.members.map(member => (
                <div key={member.id} className="flex items-center gap-2">
                  <Face name={member.name} avatar={member.avatar} size={32} online={member.online} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                    {member.name}
                    {member.id === myId ? ' (tú)' : ''}
                  </span>
                  {member.id !== myId && iCreatedGroup && (
                    <button
                      type="button"
                      onClick={() => void kickOrLeave(member.id)}
                      className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                      aria-label="Echar"
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Añadir gente</p>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {[...people, ...searchHits]
                .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
                .filter(p => !alreadyInGroup.has(p.id))
                .map(person => {
                  const on = addPick.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => setAddPick(prev => (on ? prev.filter(id => id !== person.id) : [...prev, person.id]))}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left',
                        on ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      <Avatar name={person.name} avatar={person.avatar} size={28} />
                      <span className="truncate text-sm font-bold">{person.name}</span>
                    </button>
                  );
                })}
            </div>
            <button
              type="button"
              disabled={addPick.length < 1}
              onClick={() => void addPeopleToGroup()}
              className="w-full rounded-xl bg-indigo-600 py-2 text-[11px] font-black uppercase text-white disabled:opacity-40"
            >
              Añadir
            </button>
            <button
              type="button"
              onClick={() => void kickOrLeave(myId)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 py-2 text-[11px] font-black uppercase text-rose-600"
            >
              <LogOut size={13} />
              {open.group.kind === 'team' ? 'Salir del equipo' : 'Salir del grupo'}
            </button>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/80 px-3 py-4 dark:bg-slate-950/40">
          {open.kind === 'dm' && waitingPeer && (
            <p className="mx-3 rounded-2xl bg-amber-50 px-4 py-3 text-center text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Aún no os seguís los dos. Le ha llegado una solicitud de chat. Hasta que acepte, no podéis hablar.
            </p>
          )}
          {messages.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              {talkingToCoach
                ? 'Pregúntale por la sesión o envíale cómo te ha ido.'
                : open.kind === 'group'
                  ? open.group.kind === 'team'
                    ? 'Primer mensaje del equipo.'
                    : 'Primer mensaje del grupo.'
                  : waitingPeer
                    ? 'Cuando acepte verá este mensaje.'
                    : friends.some(f => f.id === open.peer.id)
                      ? 'Escribe el primer mensaje.'
                      : 'Escribe el primer mensaje. Si no te sigue, se le mandará una solicitud.'}
            </p>
          )}
          {messages.map(line => (
            <div key={line.id} className={cn('flex', line.mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
                  line.mine
                    ? 'rounded-br-md bg-indigo-600 text-white'
                    : 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                )}
              >
                {!line.mine && open.kind === 'group' && line.author && (
                  <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wider text-indigo-500">
                    {line.author.name}
                  </span>
                )}
                {line.storyReply?.mediaKey && (
                  <div className={cn(
                    'mb-1.5 flex overflow-hidden rounded-xl',
                    line.mine ? 'bg-black/20' : 'bg-slate-100 dark:bg-slate-900'
                  )}>
                    {line.storyReply.mediaType === 'video' ? (
                      <video
                        src={mediaUrl(line.storyReply.mediaKey)}
                        muted
                        playsInline
                        className="h-16 w-12 shrink-0 object-cover"
                      />
                    ) : (
                      <img
                        src={mediaUrl(line.storyReply.mediaKey)}
                        alt=""
                        className="h-16 w-12 shrink-0 object-cover"
                      />
                    )}
                    <span className="min-w-0 px-2 py-1.5">
                      <span className={cn(
                        'block text-[10px] font-black uppercase tracking-wider',
                        line.mine ? 'text-white/70' : 'text-indigo-500'
                      )}>
                        {line.mine ? 'Respondiste a la historia' : 'Respondió a tu historia'}
                      </span>
                      {line.storyReply.caption && (
                        <span className={cn(
                          'mt-0.5 block truncate text-[11px]',
                          line.mine ? 'text-white/80' : 'text-slate-500'
                        )}>
                          {line.storyReply.caption}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {line.mediaKey && line.mediaType === 'image' && (
                  <a href={mediaUrl(line.mediaKey)} target="_blank" rel="noreferrer" className="mb-1 block">
                    <img
                      src={mediaUrl(line.mediaKey)}
                      alt=""
                      className="max-h-56 max-w-full rounded-xl object-cover"
                    />
                  </a>
                )}
                {line.mediaKey && line.mediaType === 'video' && (
                  <video
                    src={mediaUrl(line.mediaKey)}
                    controls
                    playsInline
                    className="mb-1 max-h-56 max-w-full rounded-xl"
                  />
                )}
                {line.mediaExpired && !line.mediaKey && (
                  <p className={cn('mb-1 text-[11px]', line.mine ? 'text-white/75' : 'text-slate-400')}>
                    Foto o vídeo caducado
                  </p>
                )}
                {line.text}
                <span className={cn('mt-1 block text-[10px]', line.mine ? 'text-white/70' : 'text-slate-400')}>
                  {timeAgo(line.createdAt)}
                  {line.mediaKey && line.mediaExpiresAt ? ` · ${hoursLeftLabel(line.mediaExpiresAt)}` : ''}
                </span>
              </div>
            </div>
          ))}
          {typingLabel && (
            <p className="px-3 text-[11px] font-bold italic text-slate-400">{typingLabel}</p>
          )}
          <div ref={bottomRef} />
        </div>

        {attach && (
          <div className="flex items-center gap-2 border-t border-slate-100 px-3 pt-2 text-xs text-slate-500 dark:border-slate-800">
            {attach.type.startsWith('video/') ? <ImageIcon size={14} /> : <ImageIcon size={14} />}
            <span className="min-w-0 flex-1 truncate">{attach.name} · se borra en 24 h</span>
            <button type="button" onClick={() => setAttach(null)} className="text-rose-500">
              Quitar
            </button>
          </div>
        )}
        <form
          className="flex items-end gap-2 border-t border-white/40 bg-white/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70"
          onSubmit={event => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0] || null;
              setAttach(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={waitingPeer}
            onClick={() => fileRef.current?.click()}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 disabled:opacity-30 dark:border-slate-700"
            aria-label="Foto o vídeo · 24 h"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            value={draft}
            onChange={e => {
              setDraft(e.target.value);
              pingTyping();
            }}
            rows={1}
            placeholder={
              talkingToCoach
                ? 'Mensaje para tu entrenador…'
                : waitingPeer
                  ? 'Puedes actualizar la solicitud…'
                  : 'Mensaje…'
            }
            className="max-h-28 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.92 }}
            disabled={(!draft.trim() && !attach) || sending}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white disabled:opacity-40"
            aria-label="Enviar"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </motion.button>
        </form>
      </div>
    );

    if (typeof document === 'undefined') {
      return (
        <>
          {conversation}
          {deleteModal}
        </>
      );
    }
    return (
      <>
        {createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50 dark:bg-slate-950">{conversation}</div>,
          document.body
        )}
        {deleteModal}
      </>
    );
  }

  return (
    <>
    <div className="space-y-5">
      {peopleOpen ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (peoplePage === 'requests' || peoplePage === 'friends') setPeoplePage('activity');
              else setPeopleOpen(false);
            }}
            className="flex min-w-0 items-center gap-2 rounded-full py-1 text-slate-500"
            aria-label={
              peoplePage === 'requests' || peoplePage === 'friends' ? 'Volver a actividad' : 'Volver a chats'
            }
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {peoplePage === 'requests' ? 'Solicitudes' : peoplePage === 'friends' ? 'Amigos' : 'Actividad'}
            </span>
          </button>
          {peoplePage === 'activity' && (
            <button
              type="button"
              onClick={() => setPeoplePage('friends')}
              className="ml-auto text-sm font-semibold text-indigo-600 dark:text-indigo-400"
            >
              Amigos
              {friends.length > 0 && (
                <span className="ml-1 tabular-nums text-slate-400">{friends.length}</span>
              )}
            </button>
          )}
        </div>
      ) : (
        <StoriesRail
          myId={myId}
          refreshTick={storyRefreshTick}
          pageActive={pageActive}
          onAddStory={() => onAddStory?.()}
          trailing={
            <button
              type="button"
              onClick={() => {
                setPeoplePage('activity');
                setPeopleOpen(true);
              }}
              className="relative mt-2 shrink-0 overflow-visible p-1.5 pr-2 pt-2 text-slate-900 dark:text-slate-100"
              aria-label={heartBadge > 0 ? `Actividad, ${heartBadge} por aceptar` : 'Actividad'}
            >
              <Heart size={18} strokeWidth={2} />
              {heartBadge > 0 && (
                <span className="absolute right-0 top-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
                  {heartBadge > 9 ? '9+' : heartBadge}
                </span>
              )}
            </button>
          }
        />
      )}
      {!peopleOpen && (
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Chats</p>
      )}

      {peopleOpen ? (
        <ChatPeoplePanel
          myId={myId}
          pending={pending}
          friends={friends}
          friendIds={friends.map(f => f.id)}
          page={peoplePage}
          onPageChange={setPeoplePage}
          onAccept={id => onAcceptRequest?.(id)}
          onReject={id => onRejectRequest?.(id)}
          onSendRequest={onSendRequest}
          onOpenPerson={person => onOpenMini?.({ id: person.id, name: person.name, avatar: person.avatar ?? null })}
          busyId={requestBusyId}
          refreshTick={storyRefreshTick}
        />
      ) : (
      <>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={inboxQ}
          onChange={e => setInboxQ(e.target.value)}
          placeholder="Busca chats o a quien sigues"
          className="h-11 w-full rounded-2xl bg-white pl-10 pr-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {visibleRows.length === 0 && searchPeople.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <MessageCircle size={26} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {inboxQ.trim() ? 'Nadie con ese nombre' : 'Aún no hay chats'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {inboxQ.trim() ? 'Prueba otro nombre.' : 'El corazón es la actividad: solicitudes, follows y likes.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {visibleRows.length > 0 && (
            <section>
              <div className="rounded-3xl bg-white shadow-sm dark:bg-slate-900">
                <AnimatePresence initial={false}>
                  {visibleRows.map(row => (
                    <InboxRow
                      key={threadKey(row)}
                      row={row}
                      highlighted={!!actionRow && threadKey(actionRow) === threadKey(row)}
                      onLongPress={() => setActionRow(row)}
                      onDismiss={() => setActionRow(null)}
                      onPin={() => {
                        patchPref(row, { pinned: !row.pinned });
                        setActionRow(null);
                      }}
                      onMute={() => {
                        patchPref(row, { muted: !row.muted });
                        setActionRow(null);
                      }}
                      onProfile={row.peer ? () => {
                        setActionRow(null);
                        onOpenMini?.(row.peer!);
                      } : undefined}
                      onDelete={() => void wipeThread(row)}
                      onOpen={() => {
                        if (row.kind === 'group' && row.group) void openGroup(row.group);
                        else if (row.peer) void openDm(row.peer);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
          {searchPeople.length > 0 && (
            <section>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Personas</p>
              <div className="rounded-3xl bg-white shadow-sm dark:bg-slate-900">
                {searchPeople.map(person => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => void openDm(person)}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left last:border-0 dark:border-slate-800"
                  >
                    <Face name={person.name} avatar={person.avatar} size={52} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{person.name}</span>
                      <span className="text-[13px] text-slate-400">Escribir</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </>
      )}
    </div>
    {deleteModal}
    </>
  );
};
