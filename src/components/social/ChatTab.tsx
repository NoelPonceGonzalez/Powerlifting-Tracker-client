import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, GraduationCap, Image as ImageIcon, Loader2, LogOut, MessageCircle, Paperclip, Pencil, Plus, Search, Send, UserMinus, Users, X } from 'lucide-react';
import { Avatar } from '@/src/components/social/MediaPost';
import { cn } from '@/src/lib/utils';
import { apiGet, mediaUrl } from '@/src/lib/api';
import { isRealtimeOpen, subscribeChatRealtime } from '@/src/lib/chatRealtime';
import { useIncrementSignal } from '@/src/lib/useIncrementSignal';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import type { Friend, UserSearchResult } from '@/src/types';
import {
  addChatGroupMembers,
  createChatGroup,
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

interface ChatTabProps {
  myId: string;
  friends: Friend[];
  startWith?: string | null;
  onOpened?: () => void;
  onOpenProfile?: (userId: string) => void;
  onConversationChange?: (open: boolean) => void;
  writeSignal?: number;
}

type OpenChat =
  | { kind: 'dm'; peer: FeedAuthor }
  | { kind: 'group'; group: ChatGroupCard };

type Composer = 'closed' | 'menu' | 'dm' | 'group';

function threadKey(thread: ChatThread): string {
  return thread.kind === 'group' ? `g:${thread.group?.id}` : `d:${thread.peer?.id}`;
}

function InboxRow({
  row,
  onOpen,
}: {
  row: ChatThread;
  onOpen: () => void;
}) {
  const isGroup = row.kind === 'group' && row.group;
  const name = isGroup ? row.group!.name : row.peer?.name || 'Chat';
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm dark:bg-slate-900',
        row.isCoach && 'ring-1 ring-amber-200/80 dark:ring-amber-800/50'
      )}
    >
      {isGroup ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Users size={18} />
        </span>
      ) : (
        <Face name={row.peer!.name} avatar={row.peer!.avatar} size={48} online={row.peer!.online} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{name}</span>
          {row.isCoach && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              <GraduationCap size={11} />
              Entrenador
            </span>
          )}
          {isGroup && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Grupo
            </span>
          )}
          {row.waiting && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Esperando
            </span>
          )}
        </span>
        <span className="mt-1 block truncate text-[13px] text-slate-400">{row.lastText || 'Aún no habéis hablado'}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {row.lastAt && <span className="text-[11px] text-slate-400">{timeAgo(row.lastAt)}</span>}
        {row.unread > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">
            {row.unread}
          </span>
        )}
      </span>
    </motion.button>
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

export const ChatTab: React.FC<ChatTabProps> = ({ myId, friends, startWith, onOpened, onOpenProfile, onConversationChange, writeSignal = 0 }) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [coach, setCoach] = useState<FeedAuthor | null>(null);
  const [athletes, setAthletes] = useState<FeedAuthor[]>([]);
  const [open, setOpen] = useState<OpenChat | null>(null);
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [composer, setComposer] = useState<Composer>('closed');
  const [groupName, setGroupName] = useState('');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [inviteExtras, setInviteExtras] = useState<FeedAuthor[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<FeedAuthor[]>([]);
  const [creating, setCreating] = useState(false);
  const [waitingPeer, setWaitingPeer] = useState(false);
  const [dmSearchQ, setDmSearchQ] = useState('');
  const [peerOnline, setPeerOnline] = useState(false);
  const [typingLabel, setTypingLabel] = useState('');
  const [attach, setAttach] = useState<File | null>(null);
  const [inboxQ, setInboxQ] = useState('');
  const [groupPanel, setGroupPanel] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [addPick, setAddPick] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyped = useRef(0);

  useEffect(() => {
    onConversationChange?.(!!open);
    return () => onConversationChange?.(false);
  }, [open, onConversationChange]);

  const closeComposer = useCallback(() => {
    setComposer('closed');
    setGroupName('');
    setPickedIds([]);
    setInviteExtras([]);
    setSearchQ('');
    setDmSearchQ('');
  }, []);

  useIncrementSignal('chat-write', writeSignal, () => setComposer('dm'));
  useEscapeClose(composer !== 'closed', closeComposer);

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

  const visiblePeople = useMemo(() => {
    const q = dmSearchQ.trim().toLowerCase();
    if (!q) return people;
    return people.filter(p => p.name.toLowerCase().includes(q));
  }, [people, dmSearchQ]);

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
    void loadInbox();
    const id = window.setInterval(() => {
      void loadInbox();
    }, isRealtimeOpen() ? 20000 : 8000);
    return () => window.clearInterval(id);
  }, [loadInbox]);

  const openDm = useCallback(async (author: FeedAuthor) => {
    setOpen({ kind: 'dm', peer: author });
    setComposer('closed');
    setDmSearchQ('');
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
    setComposer('closed');
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
    if (!open) return;
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
  }, [open]);

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
    const list: ChatThread[] = threads.map(t => ({
      ...t,
      kind: t.kind || (t.group ? 'group' : 'dm'),
      isCoach: t.isCoach || (!!coach && t.peer?.id === coach.id),
      waiting: !!t.waiting,
    }));
    const seenDm = new Set(list.filter(t => t.kind !== 'group').map(t => t.peer?.id));
    if (coach && !seenDm.has(coach.id)) {
      list.unshift({
        kind: 'dm',
        peer: coach,
        lastText: 'Habla de la sesión, las marcas o el plan',
        lastAt: '',
        unread: 0,
        isCoach: true,
      });
      seenDm.add(coach.id);
    }
    for (const person of people) {
      if (seenDm.has(person.id)) continue;
      list.push({
        kind: 'dm',
        peer: person,
        lastText: 'Aún no habéis hablado',
        lastAt: '',
        unread: 0,
        isCoach: coach?.id === person.id,
      });
    }
    return list.sort((a, b) => {
      if (a.isCoach && !b.isCoach) return -1;
      if (!a.isCoach && b.isCoach) return 1;
      return (b.lastAt || '').localeCompare(a.lastAt || '');
    });
  }, [threads, people, coach]);

  const visibleRows = useMemo(() => {
    const q = inboxQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => {
      const name = row.kind === 'group' && row.group ? row.group.name : row.peer?.name || '';
      return name.toLowerCase().includes(q);
    });
  }, [rows, inboxQ]);
  const conversationRows = visibleRows.filter(row => !!row.lastAt);
  const contactRows = visibleRows.filter(row => !row.lastAt);

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

  const createGroup = useCallback(async () => {
    const name = groupName.trim();
    if (!name || pickedIds.length < 1 || creating) return;
    setCreating(true);
    try {
      const created = await createChatGroup(name, pickedIds);
      setGroupName('');
      setPickedIds([]);
      setInviteExtras([]);
      setSearchQ('');
      setComposer('closed');
      void loadInbox();
      if (created.group) void openGroup(created.group);
    } finally {
      setCreating(false);
    }
  }, [groupName, pickedIds, creating, loadInbox, openGroup]);

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

  const kickOrLeave = async (userId: string) => {
    if (open?.kind !== 'group') return;
    const leaving = userId === myId;
    if (!window.confirm(leaving ? '¿Salir del grupo?' : '¿Echar a esta persona?')) return;
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

  const togglePick = (person: FeedAuthor, viaInvite?: boolean) => {
    setPickedIds(prev => (prev.includes(person.id) ? prev.filter(x => x !== person.id) : [...prev, person.id]));
    if (viaInvite) {
      setInviteExtras(prev =>
        prev.some(p => p.id === person.id) ? prev.filter(p => p.id !== person.id) : [...prev, person]
      );
    } else {
      setInviteExtras(prev => prev.filter(p => p.id !== person.id));
    }
  };

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
            `${open.group.members.length} en el grupo`,
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
              onClick={() => onOpenProfile?.(open.peer.id)}
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
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                <Users size={18} />
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
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">En el grupo</p>
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
              {[...people, ...searchHits, ...inviteExtras]
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
              Salir del grupo
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
                  ? 'Primer mensaje del grupo.'
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
                {line.text}
                <span className={cn('mt-1 block text-[10px]', line.mine ? 'text-white/70' : 'text-slate-400')}>
                  {timeAgo(line.createdAt)}
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
            <span className="min-w-0 flex-1 truncate">{attach.name}</span>
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
            aria-label="Foto o vídeo"
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

    if (typeof document === 'undefined') return conversation;
    return createPortal(
      <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50 dark:bg-slate-950">{conversation}</div>,
      document.body
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={inboxQ}
          onChange={e => setInboxQ(e.target.value)}
          placeholder="Buscar un chat"
          className="h-11 w-full rounded-2xl bg-white pl-10 pr-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {composer !== 'closed' && (
          <motion.div
            key="chat-composer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100000] flex items-end justify-center p-0 min-h-[100dvh] sm:items-center sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeComposer}
              className="fixed inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="relative z-10 w-full max-w-sm max-h-[78vh] overflow-y-auto rounded-t-[28px] border border-white/50 bg-white/70 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-slate-900/65"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/40 bg-white/40 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {composer === 'group' ? 'Nuevo grupo' : 'Nuevo mensaje'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {composer === 'group'
                      ? 'Elige un nombre y a quién entra'
                      : 'Busca a quien sigues o te sigue y selecciona'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeComposer}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-3 py-2">
                {composer === 'dm' && (
                  <div>
                    <input
                      value={dmSearchQ}
                      onChange={e => setDmSearchQ(e.target.value)}
                      placeholder="Busca a quien sigues o te sigue…"
                      className="mb-1 h-10 w-full rounded-xl border border-white/50 bg-white/60 px-3 text-sm text-slate-900 shadow-none outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
                    />
                    <div className="space-y-0.5">
                      {visiblePeople.map(person => (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => void openDm(person)}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/60 dark:hover:bg-white/5"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Avatar name={person.name} avatar={person.avatar} size={36} />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                {person.name}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {coach?.id === person.id ? 'Entrenador' : 'Te sigue o le sigues'}
                              </span>
                            </span>
                          </span>
                        </button>
                      ))}
                      {dmSearchQ.trim() && visiblePeople.length === 0 && (
                        <p className="px-2 py-6 text-center text-sm text-slate-400">Nadie con ese nombre entre quien sigues.</p>
                      )}
                      {!dmSearchQ.trim() && people.length === 0 && (
                        <p className="px-2 py-6 text-center text-sm text-slate-400">Aún no sigues a nadie. Añade amigos para escribirles.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setComposer('group')}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 py-2.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
                    >
                      <Users size={15} />
                      Crear un grupo
                    </button>
                  </div>
                )}

                {composer === 'group' && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setComposer('dm')}
                      className="text-[11px] font-medium text-slate-500"
                    >
                      ← Volver a un chat
                    </button>
                    <input
                      value={groupName}
                      onChange={e => setGroupName(e.target.value.slice(0, 40))}
                      placeholder="Nombre del grupo"
                      className="h-10 w-full rounded-xl border border-white/50 bg-white/60 px-3 text-sm font-medium text-slate-900 shadow-none outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
                    />
                    <p className="px-1 text-[11px] text-slate-400">Amigos — entran ya</p>
                    <div className="max-h-40 space-y-0.5 overflow-y-auto">
                      {people.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-400">Aún no tienes amigos. Búscalos abajo.</p>
                      ) : (
                        people.map(person => {
                          const on = pickedIds.includes(person.id);
                          return (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => togglePick(person)}
                              className={cn(
                                'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left',
                                on ? 'bg-white/60 dark:bg-white/5' : 'hover:bg-white/40 dark:hover:bg-white/5'
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <Avatar name={person.name} avatar={person.avatar} size={36} />
                                <span className="min-w-0">
                                  <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                    {person.name}
                                  </span>
                                  <span className="text-[11px] text-slate-400">Entra al crear</span>
                                </span>
                              </span>
                              <span className={cn('text-[13px] font-semibold', on ? 'text-indigo-600' : 'text-slate-300')}>
                                {on ? 'Sí' : ''}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <p className="px-1 text-[11px] text-slate-400">Si no sois amigos — solo invitación</p>
                    <input
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      placeholder="Buscar a alguien…"
                      className="h-10 w-full rounded-xl border border-white/50 bg-white/60 px-3 text-sm text-slate-900 shadow-none outline-none dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-100"
                    />
                    <div className="max-h-36 space-y-0.5 overflow-y-auto">
                      {(searchHits.length ? searchHits : inviteExtras).map(person => {
                        const on = pickedIds.includes(person.id);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => togglePick(person, true)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left',
                              on ? 'bg-white/60 dark:bg-white/5' : 'hover:bg-white/40 dark:hover:bg-white/5'
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <Avatar name={person.name} avatar={person.avatar} size={36} />
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                  {person.name}
                                </span>
                                <span className="text-[11px] text-slate-400">Tiene que aceptar</span>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                      {searchQ.trim().length >= 2 && searchHits.length === 0 && (
                        <p className="px-2 py-3 text-sm text-slate-400">Nadie con ese nombre.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!groupName.trim() || pickedIds.length < 1 || creating}
                      onClick={() => void createGroup()}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 py-2.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                    >
                      <Plus size={15} />
                      {creating ? 'Creando…' : 'Crear grupo'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
          <MessageCircle size={26} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {inboxQ.trim() ? 'Nadie con ese nombre' : 'Aún no hay chats'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {inboxQ.trim() ? 'Prueba otro nombre.' : 'Pulsa + para buscar a alguien y mandarle un mensaje.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {conversationRows.length > 0 && (
            <section className="space-y-2.5">
              {contactRows.length > 0 && (
                <p className="px-1 text-xs font-medium text-slate-400">Conversaciones</p>
              )}
              <AnimatePresence initial={false}>
                {conversationRows.map(row => (
                  <InboxRow
                    key={threadKey(row)}
                    row={row}
                    onOpen={() => {
                      if (row.kind === 'group' && row.group) void openGroup(row.group);
                      else if (row.peer) void openDm(row.peer);
                    }}
                  />
                ))}
              </AnimatePresence>
            </section>
          )}
          {contactRows.length > 0 && (
            <section className="space-y-2.5">
              {conversationRows.length > 0 && (
                <p className="px-1 text-xs font-medium text-slate-400">Contactos</p>
              )}
              <AnimatePresence initial={false}>
                {contactRows.map(row => (
                  <InboxRow
                    key={threadKey(row)}
                    row={row}
                    onOpen={() => {
                      if (row.kind === 'group' && row.group) void openGroup(row.group);
                      else if (row.peer) void openDm(row.peer);
                    }}
                  />
                ))}
              </AnimatePresence>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
