import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { 
  Search, 
  UserCheck, 
  UserX, 
  UserMinus,
  UserPlus,
  Trophy,
  MapPin,
  Clock, 
  Plus,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Copy,
  Dumbbell,
  Loader2,
  X,
  Pencil,
  Trash2,
  AlertCircle,
  GraduationCap,
  Users,
  Lock,
  Repeat,
  Timer,
  Check,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Scale,
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { FriendRequest, Friend, Challenge, GymCheckIn, User, UserSearchResult, ChallengeType, TrainingWeek, BodyWeightScoringMode } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { apiGet, apiPut } from '@/src/lib/api';
import { PAGE_ENTER_ITEM, PAGE_ENTER_ROOT, VIEW_TRANSITION } from '@/src/lib/motionPresets';
import { useLongPress } from '@/src/lib/useLongPress';
import { usePageEnter } from '@/src/lib/usePageEnter';
import { equitySummary, suggestBodyWeightScoring } from '@/src/lib/challengeEquity';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { CoverSkeleton, LoadingBlock } from '@/src/components/ui/Spinner';
import { AudienceToggle } from '@/src/components/social/AudienceToggle';
import type { Audience } from '@/src/lib/privacyApi';
import { SlimeScroll } from '@/src/components/ui/SlimeScroll';
import { useIncrementSignal } from '@/src/lib/useIncrementSignal';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import {
  answerChatRequest,
  answerCoachRequest,
  answerGroupInvite,
  fetchChatRequests,
  fetchCoachRequests,
  fetchGroupInvites,
  fetchProfile,
  fetchStories,
  coachRequestCopy,
  coachRequestPerson,
  type ChatAsk,
  type ChatGroupInvite,
  type CoachRequest,
} from '@/src/lib/feedApi';
import { TmHistoryModal } from '@/src/components/social/TmHistoryModal';
import { InstagramCover } from '@/src/components/social/ProgressMiniProfile';
import { CloseFriendButton } from '@/src/components/social/CloseFriendButton';
import { unblockUser } from '@/src/lib/privacyApi';
import { ChatTab } from '@/src/components/social/ChatTab';
import { HomeActivitySheet } from '@/src/components/social/HomeActivitySheet';
import { ProfileScreen } from '@/src/components/social/ProfileScreen';
import { ProfilePhotoViewer } from '@/src/components/social/ProfilePhotoViewer';
import { Avatar as FeedAvatar } from '@/src/components/social/MediaPost';
import { usePullToRefresh } from '@/src/lib/usePullToRefresh';
import { normalizeSocialTab, type SocialTab } from '@/src/lib/socialTab';

export type { SocialTab };

const TAB_LABELS: Record<SocialTab, string> = {
  friends: 'Amigos',
  challenges: 'Torneos',
  checkins: 'Gym',
  chat: 'Social',
};

interface SocialViewProps {
  user: User;
  friendsList: Friend[];
  requests: FriendRequest[];
  challenges: Challenge[];
  checkIns: GymCheckIn[];
  initialTab?: SocialTab;
  openFriendsFilter?: 'all' | 'following' | 'followers';
  /** Se incrementa desde el dashboard para abrir el modal de check-in en Actividad. */
  openCheckInModalSignal?: number;
  openCreateChallengeSignal?: number;
  onAddStory?: () => void;
  storyRefreshTick?: number;
  /** Check-ins, torneos y actividad in-app (likes, follows, RMs). */
  socialRefreshTick?: number;
  checkInIntent?: 'now' | 'later' | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSendFriendRequest?: (userId: string) => Promise<void>;
  onCreateChallenge: (data: {
    title: string;
    description?: string;
    type: ChallengeType;
    exercise: string;
    exercises?: string[];
    endDate: string;
    usePointsSystem?: boolean;
    bodyWeightScoring?: BodyWeightScoringMode;
    isPrivate?: boolean;
    closeFriendsOnly?: boolean;
    password?: string;
  }) => Promise<void> | void;
  onJoinChallenge: (
    id: string,
    payload: { value?: number; lifts?: { exercise: string; value: number }[]; password?: string }
  ) => Promise<void> | void;
  onDeleteChallenge?: (id: string) => Promise<void> | void;
  onCheckIn: (gymName: string, time: string, audience?: Audience) => void;
  onCheckInUpdate?: (checkInId: string, gymName: string, time: string, audience?: Audience) => void;
  onCheckInDelete?: (checkInId: string) => void;
  onRefreshChallenges?: () => void;
  onCopyFriendRoutine?: (payload: {
    name: string;
    /** Nombre del amigo para el sufijo: "Rutina X (Nombre)" */
    friendName: string;
    weeks: TrainingWeek[];
    cycleLength?: number;
    sameTemplateAllWeeks?: boolean;
    weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
    skippedWeeks?: number[];
    friendTrainingMaxes?: { name: string; mode: string; linkedExercise?: string }[];
  }) => void | Promise<void>;
  /** La pestaña Perfil vive fuera de Social: el avatar de la cabecera lleva allí. */
  onGoToProfile?: () => void;
  onGoToDashboard?: () => void;
  socialBackTo?: 'profile' | 'dashboard' | 'chat';
  /** Cada toque de la nav fuerza la pestaña (Social/Torneos). */
  socialNavTick?: number;
  /** Ha abierto la lista de solicitudes: se quita la marca de la nav. */
  onSeeRequests?: () => void;
  /** Rutinas del usuario local (para detectar si ya copió la del amigo por nombre). */
  myRoutines?: { id: string; name: string }[];
  /** Ejercicios de la rutina activa: atajo para crear el torneo sobre algo que ya entrenas. */
  myExercises?: string[];
  activeRoutineId?: string;
  /** Activar la rutina ya copiada del amigo y abrir Programa (no volver a copiar). */
  onGoToCopiedRoutine?: (routineId: string) => void;
  onUnfriend?: (friendId: string) => Promise<void>;
  onChatConversationChange?: (open: boolean) => void;
  onPullRefresh?: () => void | Promise<void>;
  /** false si Social está montada pero oculta: no hay que sondear. */
  pageActive?: boolean;
}

const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
  max_reps: 'Repeticiones',
  weight: 'Fuerza (puntos justos)',
  seconds: 'Segundos',
};

const CHALLENGE_TYPE_UNIT: Record<ChallengeType, string> = {
  max_reps: 'reps',
  weight: 'kg',
  seconds: 'seg',
};

const CHALLENGE_TYPE_OPTIONS: { value: ChallengeType; label: string }[] = [
  { value: 'max_reps', label: 'Repeticiones' },
  { value: 'weight', label: 'Fuerza (kg)' },
  { value: 'seconds', label: 'Segundos' },
];

const CREATE_WIZARD_STEPS = [
  { label: 'Datos', blurb: 'Nombre y cómo se gana.', icon: Trophy },
  { label: 'Ejercicios', blurb: 'Qué movimiento se mide.', icon: Dumbbell },
  { label: 'Reglas', blurb: 'Fecha, puntos y si es privado.', icon: SlidersHorizontal },
  { label: 'Listo', blurb: 'Revisa y lánzalo.', icon: Check },
] as const;

const CREATE_TYPE_UI: Record<ChallengeType, { short: string; hint: string; icon: typeof Repeat }> = {
  max_reps: { short: 'Reps', hint: 'Más repeticiones', icon: Repeat },
  weight: { short: 'Fuerza', hint: 'Más kilos', icon: Dumbbell },
  seconds: { short: 'Tiempo', hint: 'Más segundos', icon: Timer },
};

const ES_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ES_WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIsoDate(iso: string) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function todayIsoDate() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return toIsoDate(d);
}

function shiftIsoDate(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function monthIsoDate() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() + 1);
  return toIsoDate(d);
}

function formatCountdown(endIso: string, nowMs: number) {
  const left = new Date(endIso).getTime() - nowMs;
  if (!Number.isFinite(left) || left <= 0) return 'Terminado';
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function peopleCountLabel(n: number) {
  if (n <= 0) return 'Nadie aún';
  if (n === 1) return '1 persona';
  return `${n} personas`;
}

function ChallengeTrophyIcon({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={cn(
      'flex shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-950/50 dark:text-amber-400',
      size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
    )}>
      <Trophy size={size === 'sm' ? 16 : 20} strokeWidth={2.1} />
    </span>
  );
}

/** +2 = has subido 2 puestos desde que te metiste. Al entrar no cuenta. */
function rankMovement(initialRank: number | undefined, currentRank: number): number | null {
  if (initialRank == null || initialRank <= 0 || currentRank <= 0) return null;
  return initialRank - currentRank;
}

function RankMoveBadge({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
      up
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-400'
        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/45 dark:text-rose-400'
    )}>
      {up ? <ChevronUp size={12} strokeWidth={2.6} /> : <ChevronDown size={12} strokeWidth={2.6} />}
      {up ? `+${delta}` : delta}
    </span>
  );
}

function standingMarkLabel(challenge: Challenge, p: Challenge['participants'][number]): string {
  const unit = CHALLENGE_TYPE_UNIT[challenge.type as ChallengeType] || '';
  if (!(p.value > 0)) return 'Sin marca';
  if (challenge.usePointsSystem !== false) return `${p.value} ${unit} · ${Math.round(p.score)} pts`;
  return `${p.value} ${unit}`;
}

function useHoldAction(enabled: boolean, onHold: () => void) {
  const timerRef = useRef<number | null>(null);
  const heldRef = useRef(false);

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || e.button === 2) return;
    heldRef.current = false;
    stop();
    timerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      try { navigator.vibrate?.(10); } catch { /* ignore */ }
      onHold();
    }, 460);
  }, [enabled, onHold, stop]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!heldRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    heldRef.current = false;
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    onHold();
  }, [enabled, onHold]);

  return {
    onPointerDown,
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onClickCapture,
    onContextMenu,
  };
}

function ChallengeListCard({
  challenge,
  userId,
  onOpen,
  onAskDelete,
  children,
}: {
  challenge: Challenge;
  userId: string;
  onOpen: () => void;
  onAskDelete?: () => void;
  children: React.ReactNode;
}) {
  const canDelete = Boolean(onAskDelete && sameUserId(challenge.createdBy?.id, userId));
  const hold = useHoldAction(canDelete, () => onAskDelete?.());
  return (
    <Card
      padding="sm"
      rounded="md"
      variant="white"
      className="cursor-pointer select-none"
      onClick={onOpen}
      {...hold}
    >
      {children}
    </Card>
  );
}

function ChallengeDetailBody({
  challenge,
  userId,
  countdownNow,
  rulesOpen,
  onToggleRules,
  onAskDelete,
}: {
  challenge: Challenge;
  userId: string;
  countdownNow: number;
  rulesOpen: boolean;
  onToggleRules: () => void;
  onAskDelete: () => void;
}) {
  const isCreator = sameUserId(challenge.createdBy?.id, userId);
  const hold = useHoldAction(isCreator, onAskDelete);
  const ranking = sortChallengeRanking(challenge.participants, challenge.usePointsSystem);

  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2.5 dark:bg-slate-800/45"
        {...hold}
      >
        <ChallengeTrophyIcon size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            <Users size={13} className="shrink-0 text-slate-400" />
            {peopleCountLabel(challenge.participants.length)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Calendar size={12} className="shrink-0" />
            {formatCountdown(challenge.endDate, countdownNow)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Cómo se puntúa"
          aria-expanded={rulesOpen}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggleRules}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-black leading-none',
            rulesOpen
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
          )}
        >
          !
        </button>
      </div>

      {rulesOpen && (
        <p className="rounded-2xl bg-indigo-50/80 px-3 py-2.5 text-[12px] leading-snug text-indigo-800 dark:bg-indigo-950/45 dark:text-indigo-200">
          {bodyWeightScoringSummary(
            challenge.type as ChallengeType,
            challenge.usePointsSystem !== false,
            challenge.bodyWeightScoring
          )}
        </p>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Clasificación
        </p>
        <div className="space-y-2">
          {ranking.map((p, idx) => {
            const rank = idx + 1;
            const isMe = sameUserId(p.userId, userId);
            const extraLifts = p.lifts && p.lifts.length > 1
              ? p.lifts.map((l) => `${l.exercise} ${l.value}`).join(' · ')
              : '';
            return (
              <div
                key={p.userId}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5',
                  rank === 1
                    ? 'bg-amber-50 dark:bg-amber-950/35'
                    : isMe
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/35'
                      : 'bg-white/55 dark:bg-slate-800/40'
                )}
              >
                <span className={cn(
                  'w-6 shrink-0 text-center text-base font-black tabular-nums',
                  rank === 1 ? 'text-amber-500' :
                  rank === 2 ? 'text-slate-400' :
                  rank === 3 ? 'text-amber-700 dark:text-amber-500' :
                  'text-slate-400'
                )}>
                  {rank}
                </span>
                <Avatar src={p.avatar} userId={p.userId} name={p.name} className="h-9 w-9 shrink-0 rounded-full border border-white/80 dark:border-slate-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {p.name}{isMe ? ' (tú)' : ''}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {standingMarkLabel(challenge, p)}
                    {extraLifts ? ` · ${extraLifts}` : ''}
                  </p>
                </div>
                <RankMoveBadge delta={rankMovement(p.initialRank, rank)} />
              </div>
            );
          })}
          {ranking.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400 dark:border-slate-700">
              Nadie se ha unido todavía.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function useNowTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function scoringChoices(type: ChallengeType) {
  if (type === 'weight') {
    return [
      { id: 'points', points: true, mode: 'heavier_more' as const, title: 'Puntos justos', hint: 'Se ajusta por tu peso y género. No gana siempre el más grande.' },
      { id: 'raw', points: false, mode: 'neutral' as const, title: 'Solo kilos', hint: 'Gana quien ponga más kg, sin ajustar.' },
    ];
  }
  return [
    { id: 'heavy', points: true, mode: 'heavier_more' as const, title: 'Compensa si pesas más', hint: 'Tu marca vale un poco más. Así no gana siempre el más ligero.' },
    { id: 'light', points: true, mode: 'lighter_more' as const, title: 'Compensa si pesas menos', hint: 'Si eres ligero, tu marca vale un poco más.' },
    { id: 'raw', points: false, mode: 'neutral' as const, title: 'Solo la marca', hint: 'Gana el número más alto. El peso no cuenta.' },
  ];
}

function endDatePresets() {
  return [
    { id: '7d' as const, label: '7 días', iso: shiftIsoDate(7) },
    { id: '14d' as const, label: '14 días', iso: shiftIsoDate(14) },
    { id: '1m' as const, label: '1 mes', iso: monthIsoDate() },
  ];
}

function EndDatePresets({
  value,
  onPick,
  onCustom,
}: {
  value: string;
  onPick: (iso: string) => void;
  onCustom: () => void;
}) {
  const presets = endDatePresets();
  const presetMatch = presets.some((p) => p.iso === value);
  const customOn = Boolean(value) && !presetMatch;
  const selected = parseIsoDate(value);

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.iso)}
            className={cn(
              'min-h-11 rounded-xl px-2 py-2.5 text-[12px] font-bold',
              value === p.iso
                ? 'bg-indigo-600 text-white'
                : 'bg-white/80 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300'
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onCustom}
          className={cn(
            'min-h-11 rounded-xl px-2 py-2.5 text-[12px] font-bold',
            customOn
              ? 'bg-indigo-600 text-white'
              : 'bg-white/80 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300'
          )}
        >
          Personalizado
        </button>
      </div>
      {selected && (
        <p className="mt-2 text-center text-[12px] font-semibold text-indigo-600 dark:text-indigo-300">
          Cierra el {selected.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long' })}
        </p>
      )}
    </div>
  );
}

function EndDateCalendar({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const today = todayIsoDate();
  const selected = parseIsoDate(value);
  const now = new Date();
  const [cursor, setCursor] = useState(() => {
    const base = selected ?? now;
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  useEffect(() => {
    if (!selected) return;
    setCursor({ y: selected.getFullYear(), m: selected.getMonth() });
  }, [value]);

  const first = new Date(cursor.y, cursor.m, 1);
  const pad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array<number | null>(pad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const prevDisabled = cursor.y < now.getFullYear() || (cursor.y === now.getFullYear() && cursor.m <= now.getMonth());

  return (
    <div>
      <div className="flex items-center justify-between px-0.5 pb-1">
        <button
          type="button"
          disabled={prevDisabled}
          onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}
          className="app-icon-hit rounded-full text-slate-500 disabled:opacity-30 dark:text-slate-300"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-[13px] font-bold capitalize text-slate-800 dark:text-slate-100">
          {ES_MONTHS[cursor.m]} {cursor.y}
        </p>
        <button
          type="button"
          onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
          className="app-icon-hit rounded-full text-slate-500 dark:text-slate-300"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {ES_WEEK.map((d) => (
          <span key={d} className="py-1 text-[10px] font-black tracking-wide text-slate-400">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`e-${i}`} className="h-10" />;
          const iso = toIsoDate(new Date(cursor.y, cursor.m, day));
          const disabled = iso < today;
          const isSel = iso === value;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              className={cn(
                'mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold',
                disabled && 'text-slate-300 dark:text-slate-600',
                isSel && 'bg-indigo-600 text-white shadow-md shadow-indigo-200/70 dark:shadow-indigo-950/40',
                !isSel && !disabled && 'text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-white/5',
                isToday && !isSel && 'ring-1 ring-indigo-300 dark:ring-indigo-500/50'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="mt-2 text-center text-[12px] font-semibold text-indigo-600 dark:text-indigo-300">
          Cierra el {selected.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long' })}
        </p>
      )}
    </div>
  );
}

function challengeExercises(c: Pick<Challenge, 'exercise' | 'exercises'>): string[] {
  if (c.exercises && c.exercises.length > 0) return c.exercises;
  return (c.exercise || '').split(/\s*[·|,]\s*/).map((s) => s.trim()).filter(Boolean);
}

function bodyWeightScoringSummary(
  type: ChallengeType,
  usePoints: boolean,
  mode: BodyWeightScoringMode | undefined
): string {
  if (!usePoints) return 'Gana quien tenga el número más alto. No se mira el peso.';
  return equitySummary(type, mode ?? 'heavier_more');
}

function extractUserId(value?: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const o = value as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  const s = String(value);
  const dumped = s.match(/ObjectId\('([a-f0-9]{24})'\)/);
  if (dumped) return dumped[1];
  return s;
}

function sameUserId(a?: unknown, b?: unknown) {
  const left = extractUserId(a);
  const right = extractUserId(b);
  return Boolean(left && right && left === right);
}

function sortChallengeRanking<T extends { score: number; value: number }>(
  participants: T[],
  usePointsSystem: boolean | undefined
): T[] {
  const normalized = usePointsSystem !== false;
  return [...participants].sort((a, b) => {
    if (!normalized) return b.value - a.value;
    return b.score - a.score;
  });
}

export const SocialView: React.FC<SocialViewProps> = ({ 
  user,
  friendsList,
  requests, 
  challenges, 
  checkIns,
  initialTab = 'chat',
  openFriendsFilter = 'all',
  onAccept, 
  onReject,
  onSendFriendRequest,
  onCreateChallenge,
  onJoinChallenge,
  onDeleteChallenge,
  onCheckIn,
  onCheckInUpdate,
  onCheckInDelete,
  onRefreshChallenges,
  onCopyFriendRoutine,
  myRoutines,
  myExercises,
  activeRoutineId,
  onGoToCopiedRoutine,
  onUnfriend,
  onGoToProfile,
  onGoToDashboard,
  socialBackTo = 'dashboard',
  socialNavTick = 0,
  onSeeRequests,
  onChatConversationChange,
  openCheckInModalSignal = 0,
  openCreateChallengeSignal = 0,
  onAddStory,
  storyRefreshTick = 0,
  socialRefreshTick = 0,
  checkInIntent = null,
  onPullRefresh,
  pageActive = true,
}) => {
  const [search, setSearch] = useState('');
  const [challengeSearch, setChallengeSearch] = useState('');
  const [activeTab, setActiveTab] = useState<SocialTab>(() => normalizeSocialTab(initialTab));
  const pageEnter = usePageEnter(pageActive, activeTab);
  const prevInitialTabPropRef = useRef(initialTab);
  const [challengeSubTab, setChallengeSubTab] = useState<'active' | 'finished' | 'progress'>('active');
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [acceptRejectLoadingId, setAcceptRejectLoadingId] = useState<string | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCreateChallengeModal, setShowCreateChallengeModal] = useState(false);
  const [deleteChallenge, setDeleteChallenge] = useState<Challenge | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const countdownNow = useNowTick(1000);
  const [showJoinChallengeModal, setShowJoinChallengeModal] = useState<Challenge | null>(null);
  const [selectedChallengeDetail, setSelectedChallengeDetail] = useState<Challenge | null>(null);
  const [challengeRulesOpen, setChallengeRulesOpen] = useState(false);
  const [showFriendModal, setShowFriendModal] = useState<Friend | null>(null);
  const [unfriendConfirmFriend, setUnfriendConfirmFriend] = useState<Friend | null>(null);
  const [friendRoutine, setFriendRoutine] = useState<{
    name: string;
    weeks: TrainingWeek[];
    cycleLength?: number;
    sameTemplateAllWeeks?: boolean;
    weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
    skippedWeeks?: number[];
  } | null>(null);
  const [friendRoutineLoading, setFriendRoutineLoading] = useState(false);
  const [openFriendTm, setOpenFriendTm] = useState<{ id?: string; name: string; value: number; mode: string } | null>(null);
  /** Perfil abierto a pantalla completa (amigo, resultado de búsqueda o entrenador). */
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [photoPerson, setPhotoPerson] = useState<{ id: string; name: string; avatar?: string | null } | null>(null);
  const [friendProfile, setFriendProfile] = useState<{
    name: string;
    avatar: string;
    bio?: string;
    username?: string | null;
    postCount?: number;
    followerCount?: number;
    followingCount?: number;
    coach?: { id: string; name: string; avatar: string | null } | null;
    athleteCount?: number;
    trainingMaxes: { id?: string; name: string; value: number; mode: string }[];
    trainingMaxesAll?: { name: string; mode: string; linkedExercise?: string }[];
    friendshipStatus?: string;
    friendshipDirection?: string | null;
    canSendRequest?: boolean;
    blocked?: 'you' | 'them' | null;
  } | null>(null);
  const [friendRequestBusy, setFriendRequestBusy] = useState(false);
  const [copyingFriendRoutine, setCopyingFriendRoutine] = useState(false);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [gymName, setGymName] = useState('');
  const [gymTime, setGymTime] = useState('');
  const [editingCheckIn, setEditingCheckIn] = useState<GymCheckIn | null>(null);
  const [localCheckInIntent, setLocalCheckInIntent] = useState<'now' | 'later' | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const socialRootRef = useRef<HTMLDivElement>(null);
  const runPullRefresh = useCallback(async () => {
    const started = Date.now();
    await Promise.all([
      Promise.resolve(onPullRefresh?.()),
      fetchStories().catch(() => undefined),
    ]);
    const wait = 480 - (Date.now() - started);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  }, [onPullRefresh]);
  const { pull: pagePull, busy: pageRefreshing } = usePullToRefresh(
    socialRootRef,
    !chatOpen && !viewingProfileId && !photoPerson,
    runPullRefresh
  );

  // Búsqueda de usuarios para añadir (el API excluye amigos ya aceptados)
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  /** Evita que una respuesta lenta de una letra anterior pise la búsqueda actual. */
  const searchRequestIdRef = useRef(0);

  // Form crear torneo
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createType, setCreateType] = useState<ChallengeType>('max_reps');
  const [createExerciseDraft, setCreateExerciseDraft] = useState('');
  const [createExercises, setCreateExercises] = useState<string[]>([]);
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createCloseOnly, setCreateCloseOnly] = useState(false);
  const [gymAudience, setGymAudience] = useState<Audience>('all');
  const [createPassword, setCreatePassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [createEndDate, setCreateEndDate] = useState('');
  const [createCalOpen, setCreateCalOpen] = useState(false);
  const [createCalDraft, setCreateCalDraft] = useState('');
  /** true = IPF GL / puntos por peso y género; false = solo la mejor marca (kg, reps o s). */
  const [createUsePointsSystem, setCreateUsePointsSystem] = useState(true);
  const [createBodyWeightScoring, setCreateBodyWeightScoring] = useState<BodyWeightScoringMode>('heavier_more');
  const [createEquityOpen, setCreateEquityOpen] = useState(false);
  const [createEquityTouched, setCreateEquityTouched] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Form unirse a torneo
  const [joinValue, setJoinValue] = useState('');
  const [joinLifts, setJoinLifts] = useState<Record<string, string>>({});
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinSubmitting, setJoinSubmitting] = useState(false);

  const pendingRequests = requests.filter(r => r.status === 'pending' && !r.needsFollowBack);
  const [justAccepted, setJustAccepted] = useState<FriendRequest[]>([]);

  /** Quién te ha pedido ser su entrenador: se acepta o se rechaza desde Actividad. */
  const [coachRequests, setCoachRequests] = useState<CoachRequest[]>([]);
  const [coachRequestBusyId, setCoachRequestBusyId] = useState<string | null>(null);
  const [groupInvites, setGroupInvites] = useState<ChatGroupInvite[]>([]);
  const [groupInviteBusyId, setGroupInviteBusyId] = useState<string | null>(null);
  const [chatAsks, setChatAsks] = useState<ChatAsk[]>([]);
  const [chatAskBusyId, setChatAskBusyId] = useState<string | null>(null);
  const [chatPeerId, setChatPeerId] = useState<string | null>(null);
  const [showHomeActivity, setShowHomeActivity] = useState(false);
  const [friendsFromChat, setFriendsFromChat] = useState(false);
  const [friendsFromProfile, setFriendsFromProfile] = useState(false);
  const [friendsPageTick, setFriendsPageTick] = useState(0);
  const [friendsFilter, setFriendsFilter] = useState<'all' | 'following' | 'followers'>('all');
  const activityBadge = pendingRequests.length + coachRequests.length + groupInvites.length + chatAsks.length;
  const markHomeNotifsRead = useCallback(() => {}, []);

  const loadCoachRequests = useCallback(() => {
    fetchCoachRequests()
      .then(r => setCoachRequests(r.requests))
      .catch(() => setCoachRequests([]));
  }, []);

  const loadGroupInvites = useCallback(() => {
    fetchGroupInvites()
      .then(r => setGroupInvites(r.invites))
      .catch(() => setGroupInvites([]));
  }, []);

  const loadChatAsks = useCallback(() => {
    fetchChatRequests()
      .then(r => setChatAsks(r.requests))
      .catch(() => setChatAsks([]));
  }, []);

  useEffect(() => {
    if (!pageActive) return;
    loadCoachRequests();
    loadGroupInvites();
    loadChatAsks();
  }, [loadCoachRequests, loadGroupInvites, loadChatAsks, user.id, pageActive]);

  const answerCoach = useCallback(async (id: string, decision: 'accept' | 'reject') => {
    setCoachRequestBusyId(id);
    try {
      await answerCoachRequest(id, decision);
      setCoachRequests(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo responder a la solicitud.');
    } finally {
      setCoachRequestBusyId(null);
    }
  }, []);

  const answerGroup = useCallback(async (id: string, decision: 'accept' | 'reject') => {
    setGroupInviteBusyId(id);
    try {
      await answerGroupInvite(id, decision);
      setGroupInvites(prev => prev.filter(r => r.id !== id));
      if (decision === 'accept') setActiveTab('chat');
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo responder a la invitación.');
    } finally {
      setGroupInviteBusyId(null);
    }
  }, []);

  const answerChatAsk = useCallback(async (id: string, decision: 'accept' | 'reject') => {
    setChatAskBusyId(id);
    try {
      const res = await answerChatRequest(id, decision);
      setChatAsks(prev => prev.filter(r => r.id !== id));
      if (decision === 'accept' && res.peerId) {
        setChatPeerId(res.peerId);
        setActiveTab('chat');
      }
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo responder al chat.');
    } finally {
      setChatAskBusyId(null);
    }
  }, []);

  /** Nav de abajo: Social/Torneos siempre gana, aunque hayas abierto Amigos o Gym por dentro. */
  useEffect(() => {
    const tab = normalizeSocialTab(initialTab);
    if (tab === 'friends') {
      setActiveTab('chat');
      setFriendsFilter(openFriendsFilter === 'followers' ? 'followers' : 'following');
      setFriendsFromProfile(socialBackTo === 'dashboard' || socialBackTo === 'profile');
      setFriendsPageTick(t => t + 1);
    } else {
      setActiveTab(tab);
      setFriendsFromProfile(false);
    }
    prevInitialTabPropRef.current = initialTab;
  }, [initialTab, openFriendsFilter, socialNavTick, socialBackTo]);

  /** Al cambiar de pestaña por la barra, se cierran hojas sueltas. El check-in pedido en el mismo tick se reabre después. */
  const lastNavTick = useRef(socialNavTick);
  useEffect(() => {
    if (lastNavTick.current === socialNavTick) return;
    lastNavTick.current = socialNavTick;
    setShowCreateChallengeModal(false);
    setShowJoinChallengeModal(null);
    setSelectedChallengeDetail(null);
    setShowFriendModal(null);
    setUnfriendConfirmFriend(null);
    setFriendRoutine(null);
    setFriendProfile(null);
    setShowHomeActivity(false);
    setFriendsFromChat(false);
    setViewingProfileId(null);
    setShowCheckInModal(false);
    setEditingCheckIn(null);
    setChatPeerId(null);
    setChatOpen(false);
  }, [socialNavTick]);

  useEscapeClose(!!unfriendConfirmFriend, () => setUnfriendConfirmFriend(null));
  useEscapeClose(!!viewingProfileId, () => setViewingProfileId(null));
  useEscapeClose(!!showFriendModal && !unfriendConfirmFriend && !viewingProfileId, () => {
    setShowFriendModal(null);
    setFriendRoutine(null);
    setFriendProfile(null);
  });
  useEscapeClose(!!selectedChallengeDetail && !showJoinChallengeModal && !deleteChallenge, () => setSelectedChallengeDetail(null));
  useEscapeClose(showHomeActivity, () => setShowHomeActivity(false));

  useEffect(() => {
    setSelectedChallengeDetail((cur) => {
      if (!cur) return cur;
      return challenges.find((c) => c.id === cur.id) ?? cur;
    });
  }, [challenges]);

  useEffect(() => {
    setChallengeRulesOpen(false);
  }, [selectedChallengeDetail?.id]);

  useEffect(() => {
    if (createEquityTouched) return;
    setCreateBodyWeightScoring(suggestBodyWeightScoring(createType, createExercises[0] || createExerciseDraft));
  }, [createType, createExercises, createExerciseDraft, createEquityTouched]);

  // Marcar notificaciones como leídas al ver la pestaña Actividad
  useEffect(() => {
    if (activeTab === 'checkins') {
      apiPut('/api/notifications/read-all', {}).catch(() => {});
    }
  }, [activeTab]);

  useIncrementSignal('checkin-modal', openCheckInModalSignal, () => {
    setActiveTab('checkins');
    setEditingCheckIn(null);
    setGymName('');
    setLocalCheckInIntent(checkInIntent ?? 'later');
    if (checkInIntent === 'now') {
      const d = new Date();
      setGymTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    } else {
      setGymTime('');
    }
    setGymAudience('all');
    setShowCheckInModal(true);
  });

  const openCreateModal = useCallback(() => {
    setCreateStep(0);
    setCreateError('');
    setCreateCalOpen(false);
    setCreateCloseOnly(false);
    setShowCreateChallengeModal(true);
  }, []);

  useIncrementSignal('create-challenge-modal', openCreateChallengeSignal, () => {
    setActiveTab('challenges');
    openCreateModal();
  });

  // Búsqueda desde la 1.ª letra (sin mínimo de 2); debounce corto para que responda al instante
  useEffect(() => {
    const q = search.trim();
    if (!q.length) {
      searchRequestIdRef.current += 1;
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const results = await apiGet<UserSearchResult[]>('/api/social/search', { q });
        if (requestId !== searchRequestIdRef.current) return;
        setSearchResults(results);
      } catch {
        if (requestId !== searchRequestIdRef.current) return;
        setSearchResults([]);
      } finally {
        if (requestId === searchRequestIdRef.current) setSearchLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [search]);

  const searchResultsVisible = useMemo(
    () => searchResults.filter(r => r.id !== user.id),
    [searchResults, user.id]
  );

  const now = new Date();
  const activeChallenges = challenges.filter(c => (c.status || (new Date(c.endDate) > now)) && new Date(c.endDate) > now);
  /** Finalizados: solo torneos a los que te uniste o que tú creaste. */
  const finishedChallenges = challenges.filter(c => {
    const ended = (c.status === 'finished') || new Date(c.endDate) <= now;
    if (!ended) return false;
    const isParticipant = c.participants.some(p => sameUserId(p.userId, user.id));
    const isCreator = sameUserId(c.createdBy?.id, user.id);
    return isParticipant || isCreator;
  });
  const displayedChallenges =
    challengeSubTab === 'active' ? activeChallenges : challengeSubTab === 'finished' ? finishedChallenges : [];

  const challengeSearchLower = challengeSearch.toLowerCase();
  const filteredChallenges = challengeSearchLower
    ? displayedChallenges.filter(
        c =>
          c.title.toLowerCase().includes(challengeSearchLower) ||
          (c.exercise || '').toLowerCase().includes(challengeSearchLower) ||
          (c.exercises || []).some(ex => ex.toLowerCase().includes(challengeSearchLower)) ||
          (c.description || '').toLowerCase().includes(challengeSearchLower)
      )
    : displayedChallenges;

  /** El input superior es búsqueda global (API); no filtrar aquí la lista de amigos o desaparece "Mis Amigos" al escribir. */
  const friendsToDisplay = friendsList;

  const openJoinModal = useCallback((challenge: Challenge) => {
    setShowJoinChallengeModal(challenge);
    setJoinValue('');
    setJoinPassword('');
    setJoinError('');
    const lifts: Record<string, string> = {};
    const mine = challenge.participants.find(p => sameUserId(p.userId, user.id));
    for (const ex of challengeExercises(challenge)) {
      const prev = mine?.lifts?.find(l => l.exercise.toLowerCase() === ex.toLowerCase());
      lifts[ex] = prev != null ? String(prev.value) : '';
    }
    if (mine && challengeExercises(challenge).length <= 1) {
      setJoinValue(String(mine.value || ''));
    }
    setJoinLifts(lifts);
  }, [user.id]);

  const openFriendModal = useCallback(async (friend: Friend) => {
    setShowFriendModal(friend);
    setFriendRoutine(null);
    setFriendProfile(null);
    setOpenFriendTm(null);
    setFriendRoutineLoading(true);
    try {
      const [routineRaw, profile, cover] = await Promise.all([
        apiGet<{
          name: string;
          weeks: TrainingWeek[];
          baseTemplate?: TrainingWeek[];
          versions?: { effectiveFromWeek: number; weeks: TrainingWeek[] }[];
          logs?: unknown;
          sameTemplateAllWeeks?: boolean;
          weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
          cycleLength?: number;
          skippedWeeks?: number[];
        } | null>(`/api/social/friends/${friend.id}/routine`),
        apiGet<{
          name: string;
          avatar: string;
          bio?: string;
          coach?: { id: string; name: string; avatar: string | null } | null;
          athleteCount?: number;
          trainingMaxes: { id?: string; name: string; value: number; mode: string }[];
          trainingMaxesAll?: { name: string; mode: string; linkedExercise?: string }[];
        }>(`/api/social/friends/${friend.id}/profile?includeAllTms=1`).catch((e: unknown) => {
          const msg = String((e as { message?: string })?.message || '');
          if (/te ha bloqueado|has bloqueado/i.test(msg)) return null;
          return {
            name: friend.name,
            avatar: friend.avatar || '',
            bio: '',
            trainingMaxes: [] as { id?: string; name: string; value: number; mode: string }[],
          };
        }),
        fetchProfile(friend.id).catch((e: unknown) => {
          const msg = String((e as { message?: string })?.message || '');
          if (/te ha bloqueado/i.test(msg)) return { blocked: 'them' as const };
          if (/has bloqueado/i.test(msg)) return { blocked: 'you' as const };
          return null;
        }),
      ]);
      if (routineRaw) {
        const { expandRoutineFromApi } = await import('@/src/lib/planMaterialize');
        const expanded = expandRoutineFromApi({
          id: friend.id,
          name: routineRaw.name,
          weeks: routineRaw.weeks,
          versions: routineRaw.versions,
          baseTemplate: routineRaw.baseTemplate,
          logs: routineRaw.logs,
          sameTemplateAllWeeks: routineRaw.sameTemplateAllWeeks,
          cycleLength: routineRaw.cycleLength,
          skippedWeeks: routineRaw.skippedWeeks,
          weekTypeOverrides: routineRaw.weekTypeOverrides,
        });
        setFriendRoutine({
          name: expanded.name,
          weeks: expanded.weeks,
          cycleLength: expanded.cycleLength,
          sameTemplateAllWeeks: expanded.sameTemplateAllWeeks,
          weekTypeOverrides: expanded.weekTypeOverrides,
          skippedWeeks: expanded.skippedWeeks,
        });
      } else {
        setFriendRoutine(null);
      }
      const blocked =
        cover && 'blocked' in cover && (cover.blocked === 'you' || cover.blocked === 'them')
          ? cover.blocked
          : null;
      if (blocked) {
        setFriendProfile({
          name: friend.name,
          avatar: friend.avatar || '',
          trainingMaxes: [],
          blocked,
        });
        return;
      }
      if (!profile) {
        setFriendProfile({ name: friend.name, avatar: friend.avatar || '', trainingMaxes: [] });
        return;
      }
      setFriendProfile({
        ...profile,
        bio: cover && 'bio' in cover ? cover.bio ?? profile.bio ?? '' : profile.bio ?? '',
        username: cover && 'username' in cover ? cover.username : undefined,
        postCount: cover && 'postCount' in cover ? cover.postCount ?? 0 : 0,
        followerCount: cover && 'followerCount' in cover ? cover.followerCount ?? 0 : 0,
        followingCount: cover && 'followingCount' in cover ? cover.followingCount ?? 0 : 0,
        friendshipStatus: cover && 'friendshipStatus' in cover ? cover.friendshipStatus : undefined,
        friendshipDirection: cover && 'friendshipDirection' in cover ? cover.friendshipDirection : null,
        canSendRequest: cover && 'canSendRequest' in cover ? cover.canSendRequest : undefined,
      });
    } catch {
      setFriendRoutine(null);
      setFriendProfile({ name: friend.name, avatar: friend.avatar || '', trainingMaxes: [] });
    } finally {
      setFriendRoutineLoading(false);
    }
  }, []);

  const closeFriendSheet = useCallback(() => {
    setShowFriendModal(null);
    setFriendRoutine(null);
    setFriendProfile(null);
    setOpenFriendTm(null);
  }, []);

  const goToFriendsPage = useCallback((filter: 'all' | 'following' | 'followers' = 'following') => {
    closeFriendSheet();
    setViewingProfileId(null);
    setShowHomeActivity(false);
    setChatPeerId(null);
    setFriendsFromChat(false);
    setFriendsFromProfile(false);
    setFriendsFilter(filter === 'followers' ? 'followers' : 'following');
    setActiveTab('chat');
    setFriendsPageTick(t => t + 1);
  }, [closeFriendSheet]);

  const handleCopyAndActivate = useCallback(async () => {
    if (!friendRoutine || !onCopyFriendRoutine) return;
    setCopyingFriendRoutine(true);
    try {
      await onCopyFriendRoutine({
        name: friendRoutine.name,
        friendName: (friendProfile?.name || showFriendModal?.name || 'Amigo').trim(),
        weeks: friendRoutine.weeks,
        cycleLength: friendRoutine.cycleLength,
        sameTemplateAllWeeks: friendRoutine.sameTemplateAllWeeks,
        weekTypeOverrides: friendRoutine.weekTypeOverrides,
        skippedWeeks: [],
        friendTrainingMaxes: friendProfile?.trainingMaxesAll?.length
          ? friendProfile.trainingMaxesAll
          : undefined,
      });
      setShowFriendModal(null);
      setFriendRoutine(null);
    } finally {
      setCopyingFriendRoutine(false);
    }
  }, [friendRoutine, onCopyFriendRoutine, friendProfile?.trainingMaxesAll, friendProfile?.name, showFriendModal?.name]);

  /** Misma regla que al copiar: `${nombreRutina} (${nombreAmigo})`. */
  const copiedRoutineFromFriend = useMemo(() => {
    if (!friendRoutine || !myRoutines?.length) return null;
    const friendSuffix = (friendProfile?.name || showFriendModal?.name || 'Amigo').trim() || 'Amigo';
    const expectedName = `${friendRoutine.name} (${friendSuffix})`;
    return myRoutines.find((r) => r.name === expectedName) ?? null;
  }, [friendRoutine, friendProfile?.name, showFriendModal?.name, myRoutines]);

  useEffect(() => {
    if (activeTab !== 'friends') setJustAccepted([]);
  }, [activeTab]);

  const handleRequestAction = useCallback(async (id: string, action: (id: string) => void | Promise<void>) => {
    setAcceptRejectLoadingId(id);
    setFriendActionError(null);
    try {
      await action(id);
    } catch (e: any) {
      setFriendActionError(e?.message || 'No se pudo completar la acción. Inténtalo de nuevo.');
    } finally {
      setAcceptRejectLoadingId(null);
    }
  }, []);

  const addCreateExercise = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setCreateExercises((prev) => {
      if (prev.some((e) => e.toLowerCase() === clean.toLowerCase())) return prev;
      if (prev.length >= 8) return prev;
      return [...prev, clean];
    });
    setCreateExerciseDraft('');
  };

  const createExerciseHits = useMemo(() => {
    const q = createExerciseDraft.trim().toLowerCase();
    if (!q) return [];
    return (myExercises || [])
      .filter((ex) => ex.toLowerCase().includes(q) && !createExercises.some((e) => e.toLowerCase() === ex.toLowerCase()))
      .slice(0, 5);
  }, [createExerciseDraft, createExercises, myExercises]);

  const createCanNext =
    createStep === 0
      ? createTitle.trim().length > 0
      : createStep === 1
        ? createExercises.length > 0 || createExerciseDraft.trim().length > 0
        : createStep === 2
          ? Boolean(createEndDate) && (!createPrivate || createPassword.trim().length >= 4)
          : true;

  const goCreateNext = () => {
    if (createStep === 1 && createExerciseDraft.trim()) addCreateExercise(createExerciseDraft);
    if (createStep === 2 && createPrivate && createPassword.trim().length < 4) {
      setCreateError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    setCreateError('');
    setCreateStep((s) => Math.min(3, s + 1));
  };

  const handleCreateSubmit = async () => {
    const extras = createExerciseDraft.trim() ? [createExerciseDraft.trim()] : [];
    const exercises = [...createExercises, ...extras].filter(
      (e, i, arr) => arr.findIndex((x) => x.toLowerCase() === e.toLowerCase()) === i
    );
    if (!createTitle.trim() || exercises.length === 0 || !createEndDate) return;
    if (createPrivate && createPassword.trim().length < 4) {
      setCreateError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    setCreateError('');
    setCreateSubmitting(true);
    try {
      await onCreateChallenge({
        title: createTitle.trim(),
        description: createDesc.trim() || undefined,
        type: createType,
        exercise: exercises.join(' · '),
        exercises,
        endDate: createEndDate,
        usePointsSystem: createUsePointsSystem,
        bodyWeightScoring: createBodyWeightScoring,
        isPrivate: createPrivate,
        closeFriendsOnly: createCloseOnly,
        password: createPrivate ? createPassword.trim() : undefined,
      });
      setShowCreateChallengeModal(false);
      setCreateTitle('');
      setCreateDesc('');
      setCreateExercises([]);
      setCreateExerciseDraft('');
      setCreatePrivate(false);
      setCreateCloseOnly(false);
      setCreatePassword('');
      setCreateEndDate('');
      setCreateUsePointsSystem(true);
      setCreateBodyWeightScoring(suggestBodyWeightScoring(createType, exercises[0] || ''));
      setCreateEquityOpen(false);
      setCreateEquityTouched(false);
      setCreateStep(0);
      onRefreshChallenges?.();
    } catch (e: any) {
      setCreateError(e?.message || 'No se pudo crear el torneo.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleJoinSubmit = async () => {
    if (!showJoinChallengeModal) return;
    const names = challengeExercises(showJoinChallengeModal);
    const lifts = names.map((exercise) => ({
      exercise,
      value: parseFloat(names.length > 1 ? joinLifts[exercise] : joinValue || joinLifts[exercise]),
    }));
    if (lifts.some((l) => !Number.isFinite(l.value) || l.value < 0)) return;
    const alreadyIn = showJoinChallengeModal.participants.some((p) => sameUserId(p.userId, user.id));
    if (showJoinChallengeModal.isPrivate && !alreadyIn && !joinPassword.trim()) {
      setJoinError('Este torneo es privado. Escribe la contraseña.');
      return;
    }
    setJoinError('');
    setJoinSubmitting(true);
    try {
      await onJoinChallenge(showJoinChallengeModal.id, {
        value: lifts[0]?.value,
        lifts,
        password: showJoinChallengeModal.isPrivate ? joinPassword : undefined,
      });
      setShowJoinChallengeModal(null);
      setJoinValue('');
      setJoinPassword('');
      onRefreshChallenges?.();
    } catch (e: any) {
      setJoinError(e?.message || 'No se pudo guardar la marca.');
    } finally {
      setJoinSubmitting(false);
    }
  };

  return (
    <motion.div 
      ref={socialRootRef}
      variants={PAGE_ENTER_ROOT}
      initial={false}
      animate={pageEnter}
      className="app-page mx-auto max-w-5xl origin-top text-slate-900 dark:text-slate-100"
    >
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ height: pageRefreshing ? 44 : pagePull }}
        aria-hidden={!pageRefreshing && pagePull < 8}
      >
        {(pagePull > 6 || pageRefreshing) && (
          <Loader2
            size={22}
            className={cn('text-indigo-500', pageRefreshing && 'animate-spin')}
            style={
              pageRefreshing
                ? undefined
                : { transform: `rotate(${Math.min(360, pagePull * 4)}deg)` }
            }
          />
        )}
      </div>
      <motion.header variants={PAGE_ENTER_ITEM} initial={false} className={cn('space-y-4', activeTab === 'chat' ? 'mb-0' : 'mb-5')}>
        {activeTab !== 'chat' && (
        <div className="flex items-center gap-3">
          {activeTab !== 'challenges' ? (
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'friends' && friendsFromChat) {
                  setFriendsFromChat(false);
                  setActiveTab('chat');
                  return;
                }
                if (socialBackTo === 'chat') {
                  setActiveTab('chat');
                  return;
                }
                if (socialBackTo === 'profile') {
                  onGoToProfile?.();
                  return;
                }
                onGoToDashboard?.();
              }}
              className="app-icon-hit rounded-full text-slate-500"
              aria-label={
                activeTab === 'friends' && friendsFromChat
                  ? 'Volver al chat'
                  : socialBackTo === 'chat'
                    ? 'Volver a social'
                    : socialBackTo === 'profile'
                      ? 'Volver al perfil'
                      : 'Volver al perfil'
              }
            >
              <ArrowRight className="rotate-180" size={16} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {TAB_LABELS[activeTab]}
            </h1>
          </div>
          {activeTab === 'challenges' && (
            <button
              type="button"
              onClick={openCreateModal}
              className="ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 text-sm font-semibold text-white"
            >
              <Plus size={15} />
              Crear
            </button>
          )}
        </div>
        )}

        {activeTab === 'friends' && (
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="tracker-friend-search"
            name="tracker-friend-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar atletas, amigos, entrenadores…"
            className="h-11 w-full rounded-2xl border border-slate-200/80 bg-slate-100/70 pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {search.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {searchLoading && searchResultsVisible.length === 0 ? (
                <LoadingBlock className="py-6" />
              ) : searchResultsVisible.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-400">Nadie con ese nombre.</p>
              ) : (
                searchResultsVisible.map(u => (
                  <SearchHitRow
                    key={u.id}
                    user={u}
                    onOpen={() => {
                      void openFriendModal({ id: u.id, name: u.name, avatar: u.avatar });
                      setSearch('');
                    }}
                    onHold={() => {
                      setSearch('');
                      setPhotoPerson({ id: u.id, name: u.name, avatar: u.avatar });
                    }}
                  />
                ))
              )}
            </motion.div>
          )}
        </div>
        )}
      </motion.header>

      <motion.div variants={PAGE_ENTER_ITEM} initial={false}>
        <div className={activeTab === 'chat' ? undefined : 'hidden'} aria-hidden={activeTab !== 'chat'}>
            <ChatTab
              myId={user.id}
              myAvatar={user.avatar}
              myName={user.name}
              friends={friendsList}
              startWith={chatPeerId}
              pending={pendingRequests}
              acceptCount={activityBadge}
              onOpened={() => setChatPeerId(null)}
              onOpenMini={person => openFriendModal({ id: person.id, name: person.name, avatar: person.avatar ?? undefined })}
              onOpenFullProfile={person => setPhotoPerson(person)}
              onAcceptRequest={id => void handleRequestAction(id, onAccept)}
              onRejectRequest={id => void handleRequestAction(id, onReject)}
              onSendRequest={onSendFriendRequest}
              requestBusyId={acceptRejectLoadingId}
              onConversationChange={open => {
                setChatOpen(open);
                onChatConversationChange?.(open);
              }}
              onAddStory={onAddStory}
              storyRefreshTick={storyRefreshTick + socialRefreshTick + socialNavTick}
              onSeeRequests={onSeeRequests}
              pageActive={pageActive && activeTab === 'chat'}
              openFriendsTick={friendsPageTick}
              openFriendsFilter={friendsFilter}
              homeTick={socialNavTick}
              onLeaveFriends={
                friendsFromProfile
                  ? () => {
                      setFriendsFromProfile(false);
                      onGoToDashboard?.();
                    }
                  : undefined
              }
            />
        </div>

        <div className={cn('space-y-8', activeTab !== 'friends' && 'hidden')} aria-hidden={activeTab !== 'friends'}>
            {friendActionError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/40"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
                <p className="flex-1 text-sm font-medium text-rose-700 dark:text-rose-300">{friendActionError}</p>
                <button
                  type="button"
                  onClick={() => setFriendActionError(null)}
                  className="text-rose-400 hover:text-rose-600"
                  aria-label="Cerrar aviso"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}

            {(pendingRequests.length > 0 || justAccepted.length > 0 || groupInvites.length > 0 || chatAsks.length > 0) && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight dark:text-slate-100">Solicitudes pendientes</h2>
                  <span className="bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 px-2 py-0.5 rounded-full text-xs font-bold">
                    {pendingRequests.length + justAccepted.length + groupInvites.length + chatAsks.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {justAccepted.map(req => (
                    <Card key={req.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar src={req.avatar} userId={req.userId || req.id} name={req.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-slate-100">{req.name}</h3>
                          <p className="text-xs text-slate-500">Aceptado · envíale solicitud de amistad</p>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!onSendFriendRequest || !req.userId || acceptRejectLoadingId === req.userId}
                        onClick={() => {
                          if (!req.userId || !onSendFriendRequest) return;
                          void handleRequestAction(req.userId, async uid => {
                            await onSendFriendRequest(uid);
                            setJustAccepted(prev => prev.filter(r => (r.userId || r.id) !== uid));
                          });
                        }}
                        className="rounded-full px-3"
                      >
                        {acceptRejectLoadingId === req.userId ? <Loader2 size={16} className="animate-spin" /> : 'Enviar solicitud'}
                      </Button>
                    </Card>
                  ))}
                  {pendingRequests.map(req => (
                    <Card key={req.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar src={req.avatar} userId={req.userId || req.id} name={req.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-slate-100">{req.name}</h3>
                          <p className="text-xs text-slate-500">Quiere ser tu amigo</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          disabled={acceptRejectLoadingId === req.id}
                          onClick={() => handleRequestAction(req.id, onReject)}
                          className="w-10 h-10 p-0 rounded-full border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          {acceptRejectLoadingId === req.id ? <Loader2 size={18} className="animate-spin" /> : <UserX size={18} />}
                        </Button>
                        <Button 
                          variant="primary" 
                          size="sm" 
                          disabled={acceptRejectLoadingId === req.id}
                          onClick={() => {
                            const uid = req.userId || req.id;
                            setJustAccepted(prev => {
                              if (prev.some(r => r.userId === uid || r.id === uid)) return prev;
                              return [
                                ...prev,
                                {
                                  ...req,
                                  id: `followback-${uid}`,
                                  userId: uid,
                                  status: 'pending',
                                  needsFollowBack: true,
                                },
                              ];
                            });
                            handleRequestAction(req.id, onAccept);
                          }}
                          className="w-10 h-10 p-0 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100"
                        >
                          {acceptRejectLoadingId === req.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                        </Button>
                      </div>
                    </Card>
                  ))}
                  {chatAsks.map(ask => (
                    <Card key={ask.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0">
                        <Avatar src={ask.from.avatar || undefined} userId={ask.from.id} name={ask.from.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{ask.from.name}</h3>
                          <p className="text-xs text-slate-500 truncate">{ask.preview || 'Quiere chatear contigo'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={chatAskBusyId === ask.id}
                          onClick={() => void answerChatAsk(ask.id, 'reject')}
                          className="w-10 h-10 p-0 rounded-full border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <UserX size={18} />}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={chatAskBusyId === ask.id}
                          onClick={() => void answerChatAsk(ask.id, 'accept')}
                          className="w-10 h-10 p-0 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100"
                        >
                          {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                        </Button>
                      </div>
                    </Card>
                  ))}
                  {groupInvites.map(inv => (
                    <Card key={inv.id} padding="md" rounded="xl" className="flex items-center justify-between">
                      <div className="flex items-center gap-4 min-w-0">
                        <Avatar src={inv.from.avatar || undefined} userId={inv.from.id} name={inv.from.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{inv.from.name}</h3>
                          <p className="text-xs text-slate-500">Te invita a «{inv.groupName}»</p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={groupInviteBusyId === inv.id}
                          onClick={() => void answerGroup(inv.id, 'reject')}
                          className="w-10 h-10 p-0 rounded-full border-rose-100 text-rose-500 hover:bg-rose-50"
                        >
                          {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <UserX size={18} />}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={groupInviteBusyId === inv.id}
                          onClick={() => void answerGroup(inv.id, 'accept')}
                          className="w-10 h-10 p-0 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100"
                        >
                          {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight dark:text-slate-100">Mis amigos</h2>
                <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">
                  {friendsToDisplay.length}
                </span>
              </div>
              {friendsToDisplay.length === 0 ? (
                <Card padding="lg" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                  <p className="text-slate-400 font-medium">Aún no tienes amigos. Busca atletas arriba.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {friendsToDisplay.map(f => (
                    <Card 
                      key={f.id} 
                      padding="md" 
                      rounded="xl" 
                      className="flex items-center gap-4 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                      onClick={() => void openFriendModal(f)}
                    >
                      <Avatar src={f.avatar} userId={f.id} name={f.name} className="w-12 h-12 rounded-full border-2 border-slate-100 dark:border-slate-700" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100">{f.name}</h3>
                        
                      </div>
                      <ArrowRight size={18} className="text-slate-400 flex-shrink-0" />
                    </Card>
                  ))}
                </div>
              )}
            </section>
        </div>

        <div className={cn('space-y-6', activeTab !== 'challenges' && 'hidden')} aria-hidden={activeTab !== 'challenges'}>
            <div className="flex rounded-2xl border border-slate-200/70 bg-slate-100/90 p-1 dark:border-slate-700/70 dark:bg-slate-800/90">
                {([
                  { id: 'active' as const, label: 'Activos' },
                  { id: 'finished' as const, label: 'Finalizados' },
                  { id: 'progress' as const, label: 'Progreso' },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setChallengeSubTab(tab.id)}
                    className={cn(
                      'flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold transition-colors sm:py-2.5',
                      challengeSubTab === tab.id
                        ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
            </div>

            {challengeSubTab !== 'progress' && (
            <Input 
              placeholder="Buscar por título o ejercicio"
              value={challengeSearch}
              onChange={(e) => setChallengeSearch(e.target.value)}
              icon={<Search size={16} />}
              className="h-11 rounded-2xl border-slate-200/80 bg-white py-0 shadow-none dark:border-white/10 dark:bg-slate-900"
            />
            )}

            {challengeSubTab === 'progress' && (
              <>
                <Card padding="sm" rounded="md" variant="white">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Así vas en cada torneo</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Tu puesto en cada torneo. Pulsa uno para ver la clasificación y las marcas.
                  </p>
                </Card>

                {activeChallenges.length === 0 ? (
                  <Card padding="lg" rounded="md" variant="white" className="border-dashed text-center">
                    <div className="mx-auto mb-3 flex justify-center">
                      <ChallengeTrophyIcon />
                    </div>
                    <p className="text-sm text-slate-500">
                      No hay torneos activos. Crea uno o espera a que un amigo lo haga.
                    </p>
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      <Plus size={14} />
                      Crear torneo
                    </button>
                  </Card>
                ) : (
                  <SlimeScroll embed scrollFrom="parent" contentClassName="space-y-3">
                    {activeChallenges.map(challenge => {
                      const ranking = sortChallengeRanking(challenge.participants, challenge.usePointsSystem);
                      const myIdx = ranking.findIndex(p => sameUserId(p.userId, user.id));
                      const isParticipant = myIdx >= 0;
                      const people = peopleCountLabel(challenge.participants.length);
                      const myMove = isParticipant ? rankMovement(ranking[myIdx]?.initialRank, myIdx + 1) : null;

                      return (
                        <ChallengeListCard
                          key={challenge.id}
                          challenge={challenge}
                          userId={user.id}
                          onOpen={() => setSelectedChallengeDetail(challenge)}
                          onAskDelete={() => setDeleteChallenge(challenge)}
                        >
                          <div className="flex items-center gap-3">
                            <ChallengeTrophyIcon />
                            <div className="min-w-0 flex-1">
                              <h3 className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                                {challenge.isPrivate && <Lock size={13} className="shrink-0 text-slate-400" />}
                                <span className="truncate">{challenge.title}</span>
                              </h3>
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {challenge.exercise}
                                <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                                {people}
                              </p>
                            </div>
                            {isParticipant ? (
                              <div className="shrink-0 text-right">
                                <p className="text-lg font-black tabular-nums leading-none text-slate-900 dark:text-slate-100">
                                  #{myIdx + 1}
                                </p>
                                <div className="mt-1 flex justify-end">
                                  <RankMoveBadge delta={myMove} />
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openJoinModal(challenge); }}
                                className="shrink-0 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                              >
                                Unirse
                              </button>
                            )}
                          </div>
                        </ChallengeListCard>
                      );
                    })}
                  </SlimeScroll>
                )}
              </>
            )}

            {challengeSubTab !== 'progress' && (
            <SlimeScroll embed scrollFrom="parent" contentClassName="space-y-3">
              {filteredChallenges.map(challenge => {
                const isFinished = challengeSubTab === 'finished' || new Date(challenge.endDate).getTime() <= countdownNow;
                const isJoined = challenge.participants.some((p) => sameUserId(p.userId, user.id));
                const left = formatCountdown(challenge.endDate, countdownNow);
                const people = peopleCountLabel(challenge.participants.length);

                return (
                  <ChallengeListCard
                    key={challenge.id}
                    challenge={challenge}
                    userId={user.id}
                    onOpen={() => setSelectedChallengeDetail(challenge)}
                    onAskDelete={() => setDeleteChallenge(challenge)}
                  >
                    <div className="flex items-center gap-3">
                      <ChallengeTrophyIcon />
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                          {challenge.isPrivate && <Lock size={13} className="shrink-0 text-slate-400" />}
                          <span className="truncate">{challenge.title}</span>
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {challenge.exercise}
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                          {people}
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                          {left}
                        </p>
                      </div>
                      {!isFinished && !isJoined && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openJoinModal(challenge); }}
                          className="shrink-0 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white"
                        >
                          Unirse
                        </button>
                      )}
                    </div>
                  </ChallengeListCard>
                );
              })}
            </SlimeScroll>
            )}

            {challengeSubTab !== 'progress' && filteredChallenges.length === 0 && (
              <Card padding="lg" rounded="md" variant="white" className="border-dashed text-center">
                <div className="mx-auto mb-3 flex justify-center">
                  <ChallengeTrophyIcon />
                </div>
                <p className="text-sm text-slate-500">
                  {challengeSubTab === 'active'
                    ? 'No hay torneos activos. Crea uno o espera a que un amigo lo haga.'
                    : 'No hay torneos finalizados.'}
                </p>
                {challengeSubTab === 'active' && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white"
                  >
                    <Plus size={14} />
                    Crear torneo
                  </button>
                )}
              </Card>
            )}
        </div>

        <div className={cn('space-y-4', activeTab !== 'checkins' && 'hidden')} aria-hidden={activeTab !== 'checkins'}>
            {chatAsks.length > 0 && (
              <section className="space-y-3 pb-2">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Quieren chatear
                </h2>
                {chatAsks.map(ask => (
                  <Card
                    key={ask.id}
                    padding="md"
                    rounded="2xl"
                    className="flex items-center justify-between gap-3 border-l-4 border-l-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20"
                  >
                    <button
                      type="button"
                      onClick={() => void openFriendModal({ id: ask.from.id, name: ask.from.name, avatar: ask.from.avatar ?? undefined })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <FeedAvatar name={ask.from.name} avatar={ask.from.avatar} userId={ask.from.id} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {ask.from.name}
                        </span>
                        <span className="block truncate text-[11px] font-medium text-slate-500">
                          {ask.preview || 'Quiere hablar contigo'}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={chatAskBusyId === ask.id}
                        onClick={() => void answerChatAsk(ask.id, 'reject')}
                        className="h-10 w-10 rounded-full border-rose-100 p-0 text-rose-500 hover:bg-rose-50"
                        aria-label="Rechazar"
                      >
                        {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={chatAskBusyId === ask.id}
                        onClick={() => void answerChatAsk(ask.id, 'accept')}
                        className="h-10 w-10 rounded-full bg-emerald-500 p-0 shadow-emerald-100 hover:bg-emerald-600"
                        aria-label="Aceptar"
                      >
                        {chatAskBusyId === ask.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                      </Button>
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {groupInvites.length > 0 && (
              <section className="space-y-3 pb-2">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  Te invitan a un grupo o equipo
                </h2>
                {groupInvites.map(inv => (
                  <Card
                    key={inv.id}
                    padding="md"
                    rounded="2xl"
                    className="flex items-center justify-between gap-3 border-l-4 border-l-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20"
                  >
                    <button
                      type="button"
                      onClick={() => void openFriendModal({ id: inv.from.id, name: inv.from.name, avatar: inv.from.avatar ?? undefined })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <FeedAvatar name={inv.from.name} avatar={inv.from.avatar} userId={inv.from.id} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {inv.from.name}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                          <Users size={12} />
                          {inv.kind === 'team' ? 'equipo' : 'grupo'} «{inv.groupName}»
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={groupInviteBusyId === inv.id}
                        onClick={() => void answerGroup(inv.id, 'reject')}
                        className="h-10 w-10 rounded-full border-rose-100 p-0 text-rose-500 hover:bg-rose-50"
                        aria-label="Rechazar"
                      >
                        {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={groupInviteBusyId === inv.id}
                        onClick={() => void answerGroup(inv.id, 'accept')}
                        className="h-10 w-10 rounded-full bg-emerald-500 p-0 shadow-emerald-100 hover:bg-emerald-600"
                        aria-label="Aceptar"
                      >
                        {groupInviteBusyId === inv.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                      </Button>
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {coachRequests.length > 0 && (
              <section className="space-y-3 pb-2">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  Entrenador
                </h2>
                {coachRequests.map(req => {
                  const person = coachRequestPerson(req);
                  return (
                  <Card
                    key={req.id}
                    padding="md"
                    rounded="2xl"
                    className="flex items-center justify-between gap-3 border-l-4 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20"
                  >
                    <button
                      type="button"
                      onClick={() => void openFriendModal({ id: person.id, name: person.name, avatar: person.avatar ?? undefined })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <FeedAvatar name={person.name} avatar={person.avatar} userId={person.id} size={42} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                          {person.name}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                          <GraduationCap size={12} />
                          {coachRequestCopy(req).toLowerCase()}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={coachRequestBusyId === req.id}
                        onClick={() => answerCoach(req.id, 'reject')}
                        className="h-10 w-10 rounded-full border-rose-100 p-0 text-rose-500 hover:bg-rose-50"
                        aria-label="Rechazar"
                      >
                        {coachRequestBusyId === req.id ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={coachRequestBusyId === req.id}
                        onClick={() => answerCoach(req.id, 'accept')}
                        className="h-10 w-10 rounded-full bg-emerald-500 p-0 shadow-emerald-100 hover:bg-emerald-600"
                        aria-label="Aceptar"
                      >
                        {coachRequestBusyId === req.id ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                      </Button>
                    </div>
                  </Card>
                  );
                })}
              </section>
            )}

            <h2 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-100">Quién va al gym</h2>
            
            {(() => {
              const todayStr = new Date().toDateString();
              const myCheckInToday = checkIns.find(ci => ci.userId === user.id && new Date(ci.timestamp).toDateString() === todayStr);
              const othersCheckIns = checkIns.filter(ci => ci.id !== myCheckInToday?.id).sort((a, b) => b.timestamp - a.timestamp);
              return (
                <div className="space-y-4">
                  {myCheckInToday && onCheckInUpdate && onCheckInDelete && (
                    <Card padding="md" rounded="2xl" className="flex items-center justify-between border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <Avatar src={user.avatar || myCheckInToday.avatar} userId={user.id} name={user.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-slate-100 dark:border-slate-700 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                            <span className="text-emerald-600 dark:text-emerald-400">Mi hora</span>
                          </p>
                          <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{myCheckInToday.gymName}</span>
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{myCheckInToday.time}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => { setEditingCheckIn(myCheckInToday); setGymName(myCheckInToday.gymName); setGymTime(myCheckInToday.time); }}
                          className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                          title="Editar"
                          aria-label="Editar hora"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => onCheckInDelete(myCheckInToday.id)}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                          title="Quitar"
                          aria-label="Quitar check-in"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </Card>
                  )}
                  {othersCheckIns.length === 0 && !myCheckInToday ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200/90 bg-slate-50/60 py-8 text-center dark:border-slate-600/70 dark:bg-slate-800/25">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100/90 dark:bg-indigo-950/55">
                        <Plus className="text-indigo-600 dark:text-indigo-400" size={20} strokeWidth={2.25} />
                      </div>
                      <p className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Nadie ha avisado que va al gym hoy
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCheckIn(null);
                          setGymName('');
                          setGymTime('');
                          setLocalCheckInIntent('later');
                          setGymAudience('all');
                          setShowCheckInModal(true);
                        }}
                        className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/90 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 active:scale-[0.98] dark:border-indigo-500/35 dark:bg-indigo-950/35 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-900/40"
                      >
                        <Plus
                          size={14}
                          strokeWidth={2.5}
                          className="text-indigo-500 transition-transform group-hover:scale-110 dark:text-indigo-300"
                        />
                        <span>Avisar mi hora</span>
                      </button>
                    </div>
                  ) : (
                    othersCheckIns.map(checkIn => {
                      const alreadyJoined = myCheckInToday && myCheckInToday.gymName === checkIn.gymName && myCheckInToday.time === checkIn.time;
                      return (
                        <Card key={checkIn.id} padding="md" rounded="2xl" className="flex items-center justify-between border-l-4 border-l-indigo-600">
                          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                            <Avatar src={checkIn.avatar} userId={checkIn.userId} name={checkIn.userName} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-slate-100 dark:border-slate-700 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                                <span className="text-indigo-600 dark:text-indigo-400">{checkIn.userName}</span> va a entrenar
                              </p>
                              <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                                <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                  <MapPin size={10} className="flex-shrink-0" />
                                  <span className="truncate">{checkIn.gymName}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                  <Clock size={10} className="flex-shrink-0" />
                                  <span>{checkIn.time}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {alreadyJoined ? (
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex-shrink-0">Tú</span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-indigo-200 text-indigo-600 flex-shrink-0"
                              disabled={checkInSaving}
                              onClick={async () => { setCheckInSaving(true); try { await onCheckIn(checkIn.gymName, checkIn.time); } finally { setCheckInSaving(false); } }}
                            >
                              {checkInSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : <MapPin size={14} className="mr-1" />}
                              Me uno
                            </Button>
                          )}
                        </Card>
                      );
                    })
                  )}
                </div>
              );
            })()}
        </div>
      </motion.div>

      <GlassModal
        open={showCheckInModal || !!editingCheckIn}
        onClose={() => { setShowCheckInModal(false); setEditingCheckIn(null); setGymName(''); setGymTime(''); }}
        title={editingCheckIn ? 'Cambiar aviso' : (localCheckInIntent ?? checkInIntent) === 'now' ? 'Estoy en el gym' : 'Avisar a tus amigos'}
        subtitle={(localCheckInIntent ?? checkInIntent) === 'now' ? 'Tus amigos verán que estás entrenando ahora.' : 'Diles el gym y a qué hora llegas.'}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setShowCheckInModal(false); setEditingCheckIn(null); setGymName(''); setGymTime(''); }}>Cancelar</Button>
            {editingCheckIn && onCheckInDelete && (
              <Button
                variant="outline"
                className="flex-1 border-rose-200 text-rose-600"
                onClick={() => {
                  onCheckInDelete(editingCheckIn.id);
                  setShowCheckInModal(false);
                  setEditingCheckIn(null);
                  setGymName('');
                  setGymTime('');
                }}
              >
                Quitar
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1"
              disabled={!gymName.trim() || !gymTime || checkInSaving}
              onClick={async () => {
                setCheckInSaving(true);
                try {
                  if (editingCheckIn && onCheckInUpdate) {
                    await onCheckInUpdate(editingCheckIn.id, gymName.trim(), gymTime, gymAudience);
                    setEditingCheckIn(null);
                  } else {
                    await onCheckIn(gymName.trim(), gymTime, gymAudience);
                    setShowCheckInModal(false);
                  }
                  setGymName('');
                  setGymTime('');
                } finally {
                  setCheckInSaving(false);
                }
              }}
            >
              {checkInSaving ? <><Loader2 size={14} className="mr-1 animate-spin" /> Guardando…</> : 'Confirmar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <AudienceToggle value={gymAudience} onChange={setGymAudience} />
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Gimnasio</label>
            <Input placeholder="Basic Fit, McFit…" value={gymName} onChange={(e) => setGymName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Hora</label>
            <Input type="time" value={gymTime} onChange={(e) => setGymTime(e.target.value)} />
          </div>
        </div>
      </GlassModal>

      <GlassModal
        open={showCreateChallengeModal && !createCalOpen}
        onClose={() => {
          setShowCreateChallengeModal(false);
          setCreateCalOpen(false);
          setCreateStep(0);
          setCreateError('');
        }}
        title="Crear torneo"
        subtitle={CREATE_WIZARD_STEPS[createStep]?.blurb}
        wide
        persist={createSubmitting}
        footer={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              className="flex-1 py-2.5 shadow-none"
              onClick={() => {
                if (createStep > 0) {
                  setCreateError('');
                  setCreateStep((s) => s - 1);
                } else {
                  setShowCreateChallengeModal(false);
                  setCreateStep(0);
                }
              }}
            >
              {createStep > 0 ? <><ArrowLeft size={15} /> Atrás</> : 'Cancelar'}
            </Button>
            {createStep < 3 ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1 py-2.5"
                disabled={!createCanNext}
                onClick={goCreateNext}
              >
                Siguiente
                <ArrowRight size={15} />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1 py-2.5"
                disabled={createSubmitting}
                onClick={() => void handleCreateSubmit()}
              >
                {createSubmitting ? <><Loader2 size={15} className="animate-spin" /> Creando…</> : 'Crear'}
              </Button>
            )}
          </div>
        }
      >
        <div className="mb-2.5 flex items-center">
          {CREATE_WIZARD_STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = i < createStep;
            const current = i === createStep;
            return (
              <React.Fragment key={step.label}>
                {i > 0 && (
                  <span
                    className={cn(
                      'mb-3.5 h-0.5 w-3 shrink-0 rounded-full sm:w-5',
                      i <= createStep ? 'bg-indigo-400' : 'bg-slate-200 dark:bg-slate-700'
                    )}
                  />
                )}
                <button
                  type="button"
                  disabled={i >= createStep}
                  onClick={() => {
                    setCreateError('');
                    setCreateStep(i);
                  }}
                  className={cn(
                    'flex min-w-0 flex-1 flex-col items-center gap-0.5 disabled:cursor-default',
                    done && 'cursor-pointer'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                      current && 'bg-indigo-600 text-white shadow-md shadow-indigo-300/50 dark:shadow-indigo-900/50',
                      done && 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-300',
                      !done && !current && 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    )}
                  >
                    {done ? <Check size={13} strokeWidth={2.5} /> : <Icon size={13} />}
                  </span>
                  <span
                    className={cn(
                      'max-w-full truncate text-[8px] font-bold uppercase tracking-wide sm:text-[9px]',
                      current ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-500'
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={createStep}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={VIEW_TRANSITION}
          >
            {createStep === 0 && (
              <div className="space-y-2.5">
                <Input
                  label="Título"
                  placeholder="Dominadas de marzo"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="h-11 rounded-2xl border-white/50 bg-white/70 py-0 shadow-none dark:border-white/10 dark:bg-slate-800/70"
                />
                <Input
                  label="Descripción"
                  placeholder="Opcional"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="h-11 rounded-2xl border-white/50 bg-white/70 py-0 shadow-none dark:border-white/10 dark:bg-slate-800/70"
                />
                <div>
                  <p className="mb-1.5 ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Tipo</p>
                  <div className="grid grid-cols-3 gap-2">
                    {CHALLENGE_TYPE_OPTIONS.map((opt) => {
                      const ui = CREATE_TYPE_UI[opt.value];
                      const Icon = ui.icon;
                      const selected = createType === opt.value;
                      const value = opt.value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setCreateType(value)}
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-2xl border px-1.5 py-2.5 text-center transition-colors',
                            selected
                              ? 'border-indigo-400/80 bg-indigo-600 text-white shadow-lg shadow-indigo-300/40 dark:border-indigo-400/50 dark:shadow-indigo-950/40'
                              : 'border-white/50 bg-white/60 text-slate-700 dark:border-white/10 dark:bg-slate-800/55 dark:text-slate-200'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-xl',
                              selected ? 'bg-white/20' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
                            )}
                          >
                            <Icon size={16} />
                          </span>
                          <span className="text-xs font-bold">{ui.short}</span>
                          <span className={cn('text-[10px] leading-tight', selected ? 'text-indigo-100' : 'text-slate-400')}>
                            {ui.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {createStep === 1 && (
              <div className="space-y-2.5">
                <div className="rounded-2xl border border-white/50 bg-gradient-to-b from-indigo-50/80 to-white/40 p-2.5 dark:border-white/10 dark:from-indigo-950/40 dark:to-slate-900/40">
                  <div className="flex items-end gap-2">
                    <Input
                      label="Ejercicio"
                      placeholder="Buscar o escribir…"
                      value={createExerciseDraft}
                      onChange={(e) => setCreateExerciseDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCreateExercise(createExerciseDraft);
                        }
                      }}
                      icon={<Search size={16} />}
                      className="h-11 rounded-2xl border-white/60 bg-white/80 py-0 shadow-none dark:border-white/10 dark:bg-slate-800/70"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="mb-0.5 h-11 shrink-0 px-3.5"
                      onClick={() => addCreateExercise(createExerciseDraft)}
                    >
                      Añadir
                    </Button>
                  </div>
                  {createExerciseHits.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {createExerciseHits.map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => addCreateExercise(ex)}
                          className="flex w-full items-center justify-between rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-white dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {ex}
                          <Plus size={14} className="text-indigo-500" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    'min-h-[4.25rem] rounded-2xl border border-dashed p-2.5',
                    createExercises.length
                      ? 'border-indigo-200/80 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-950/30'
                      : 'border-slate-200/80 bg-white/40 dark:border-white/10 dark:bg-slate-800/30'
                  )}
                >
                  {createExercises.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {createExercises.map((ex) => (
                        <span
                          key={ex}
                          className="inline-flex items-center gap-1 rounded-full border border-indigo-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/50 dark:text-indigo-300"
                        >
                          {ex}
                          <button
                            type="button"
                            aria-label={`Quitar ${ex}`}
                            onClick={() => setCreateExercises((prev) => prev.filter((e) => e !== ex))}
                            className="rounded-full p-0.5 hover:bg-indigo-100 dark:hover:bg-white/10"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-[3.25rem] items-center justify-center gap-2 text-[11px] font-medium text-slate-400">
                      <Dumbbell size={14} className="text-indigo-400" />
                      Añade al menos uno
                    </div>
                  )}
                </div>
              </div>
            )}

            {createStep === 2 && (
              <div className="space-y-3">
                <section>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400">
                    <Scale size={12} />
                    Cómo se gana
                  </p>
                  <div className="space-y-1.5">
                    {scoringChoices(createType).map((choice) => {
                      const raw = !createUsePointsSystem || (createType !== 'weight' && createBodyWeightScoring === 'neutral');
                      const selected = !choice.points
                        ? raw
                        : createType === 'weight'
                          ? createUsePointsSystem
                          : !raw && createBodyWeightScoring === choice.mode;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() => {
                            setCreateEquityTouched(true);
                            setCreateUsePointsSystem(choice.points);
                            setCreateBodyWeightScoring(choice.mode);
                          }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors',
                            selected
                              ? 'border-indigo-500 bg-indigo-50/90 dark:border-indigo-400 dark:bg-indigo-950/50'
                              : 'border-white/50 bg-white/60 dark:border-white/10 dark:bg-slate-800/50'
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                              selected
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-300 dark:border-slate-500'
                            )}
                          >
                            {selected && <Check size={11} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-100">{choice.title}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{choice.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="rounded-2xl border border-white/50 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-slate-800/50">
                  <button
                    type="button"
                    onClick={() => setCreatePrivate((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className="flex items-start gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                        <Lock size={15} />
                      </span>
                      <span>
                        <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-100">
                          Privado con contraseña
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          Solo entra quien tenga la clave.
                        </span>
                      </span>
                    </span>
                    <span className={cn(
                      'relative h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors',
                      createPrivate ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600'
                    )}>
                      <span className={cn(
                        'block h-5 w-5 rounded-full bg-white transition-transform',
                        createPrivate ? 'translate-x-4' : 'translate-x-0'
                      )} />
                    </span>
                  </button>
                  {createPrivate && (
                    <Input
                      type="password"
                      placeholder="Mínimo 4 caracteres"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      className="mt-2 h-10 rounded-xl border-white/50 bg-white/80 py-0 shadow-none dark:border-white/10 dark:bg-slate-800/70"
                    />
                  )}
                </div>

                <div className="rounded-2xl border border-white/50 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-slate-800/50">
                  <AudienceToggle
                    value={createCloseOnly ? 'close' : 'all'}
                    onChange={next => setCreateCloseOnly(next === 'close')}
                  />
                </div>

                <section>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400">
                    <Calendar size={12} />
                    Hasta cuándo
                  </p>
                  <div className="rounded-2xl border border-white/50 bg-white/70 p-2.5 dark:border-white/10 dark:bg-slate-800/50">
                    <EndDatePresets
                      value={createEndDate}
                      onPick={setCreateEndDate}
                      onCustom={() => {
                        setCreateCalDraft(createEndDate || shiftIsoDate(7));
                        setCreateCalOpen(true);
                      }}
                    />
                  </div>
                </section>
                {createError && <p className="text-[12px] font-medium text-rose-500">{createError}</p>}
              </div>
            )}

            {createStep === 3 && (
              <div>
                <div className="overflow-hidden rounded-2xl border border-white/50 bg-white/65 dark:border-white/10 dark:bg-slate-800/50">
                  <div className="flex items-start gap-2.5 bg-gradient-to-br from-indigo-500/15 to-transparent px-3.5 py-3 dark:from-indigo-500/20">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-950/50 dark:text-amber-400">
                      <Trophy size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{createTitle || '—'}</p>
                      {createDesc.trim() && (
                        <p className="mt-0.5 text-xs text-slate-500">{createDesc.trim()}</p>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100/80 dark:divide-white/10">
                    <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {React.createElement(CREATE_TYPE_UI[createType].icon, { size: 14 })}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                          {CREATE_TYPE_UI[createType].short}
                          <span className="mx-1.5 font-normal text-slate-300 dark:text-slate-600">·</span>
                          {CHALLENGE_TYPE_OPTIONS.find((o) => o.value === createType)?.label}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                          {createUsePointsSystem
                            ? equitySummary(createType, createBodyWeightScoring)
                            : 'Gana la marca más alta, sin ajustar por peso.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                        <Dumbbell size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Ejercicios</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(createExercises.length ? createExercises : createExerciseDraft.trim() ? [createExerciseDraft.trim()] : []).length
                            ? (createExercises.length ? createExercises : [createExerciseDraft.trim()]).map((ex) => (
                              <span
                                key={ex}
                                className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                              >
                                {ex}
                              </span>
                            ))
                            : <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ninguno</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                        <Calendar size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                          {createEndDate ? new Date(`${createEndDate}T12:00:00`).toLocaleDateString('es-ES') : 'Sin fecha'}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                          {createCloseOnly
                            ? 'Solo mejores amigos'
                            : createPrivate
                              ? <><Lock size={11} /> Privado con contraseña</>
                              : <><Users size={11} /> Abierto a tus amigos</>}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {createError && <p className="mt-2 text-[12px] font-medium text-rose-500">{createError}</p>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </GlassModal>

      <GlassModal
        open={createCalOpen}
        onClose={() => setCreateCalOpen(false)}
        title="Fecha de fin"
        subtitle="Elige el día y pulsa Aceptar"
        wide
        footer={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              className="flex-1 py-2.5 shadow-none"
              onClick={() => setCreateCalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1 py-2.5"
              disabled={!createCalDraft}
              onClick={() => {
                if (!createCalDraft) return;
                setCreateEndDate(createCalDraft);
                setCreateCalOpen(false);
              }}
            >
              Aceptar
            </Button>
          </div>
        }
      >
        <EndDateCalendar value={createCalDraft} onChange={setCreateCalDraft} />
      </GlassModal>

      <GlassModal
        open={!!deleteChallenge}
        onClose={() => { if (!deleteSubmitting) setDeleteChallenge(null); }}
        title="Borrar torneo"
        subtitle={deleteChallenge?.title}
        persist={deleteSubmitting}
        footer={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={deleteSubmitting}
              onClick={() => setDeleteChallenge(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              className="flex-1"
              disabled={deleteSubmitting}
              onClick={() => {
                if (!deleteChallenge) return;
                setDeleteSubmitting(true);
                void Promise.resolve(onDeleteChallenge?.(deleteChallenge.id))
                  .then(() => {
                    setSelectedChallengeDetail((cur) => (cur?.id === deleteChallenge.id ? null : cur));
                    setDeleteChallenge(null);
                  })
                  .catch((e: any) => {
                    setCreateError(e?.message || 'No se pudo borrar.');
                  })
                  .finally(() => setDeleteSubmitting(false));
              }}
            >
              {deleteSubmitting ? 'Borrando…' : 'Borrar'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Se elimina para todos. Esta acción no se puede deshacer.
        </p>
      </GlassModal>

      <GlassModal
        open={!!selectedChallengeDetail}
        onClose={() => setSelectedChallengeDetail(null)}
        wide
        title={selectedChallengeDetail?.title}
        subtitle={
          selectedChallengeDetail
            ? `${selectedChallengeDetail.isPrivate ? 'Privado · ' : ''}${selectedChallengeDetail.exercise} · ${CREATE_TYPE_UI[selectedChallengeDetail.type as ChallengeType].short}`
            : undefined
        }
        footer={
          selectedChallengeDetail && new Date(selectedChallengeDetail.endDate) > now ? (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => {
                const challenge = selectedChallengeDetail;
                setSelectedChallengeDetail(null);
                openJoinModal(challenge);
              }}
            >
              {selectedChallengeDetail.participants.some((p) => sameUserId(p.userId, user.id))
                ? 'Actualizar marca'
                : 'Unirse'}
            </Button>
          ) : undefined
        }
      >
        {selectedChallengeDetail && (
          <ChallengeDetailBody
            challenge={selectedChallengeDetail}
            userId={user.id}
            countdownNow={countdownNow}
            rulesOpen={challengeRulesOpen}
            onToggleRules={() => setChallengeRulesOpen((v) => !v)}
            onAskDelete={() => setDeleteChallenge(selectedChallengeDetail)}
          />
        )}
      </GlassModal>

      <GlassModal
        open={!!showJoinChallengeModal}
        onClose={() => setShowJoinChallengeModal(null)}
        title={showJoinChallengeModal?.title}
        subtitle={
          showJoinChallengeModal
            ? `${showJoinChallengeModal.exercise} · ${CHALLENGE_TYPE_UNIT[showJoinChallengeModal.type as ChallengeType]}`
            : undefined
        }
      >
        {showJoinChallengeModal && (
          <div className="space-y-3">
            {challengeExercises(showJoinChallengeModal).length > 1 ? (
              challengeExercises(showJoinChallengeModal).map((ex) => (
                <div key={ex}>
                  <label className="mb-1 block text-[11px] text-slate-400">{ex}</label>
                  <Input
                    type="number"
                    placeholder={`Marca en ${CHALLENGE_TYPE_UNIT[showJoinChallengeModal.type as ChallengeType]}`}
                    value={joinLifts[ex] || ''}
                    onChange={(e) => setJoinLifts((prev) => ({ ...prev, [ex]: e.target.value }))}
                    min="0"
                    step={showJoinChallengeModal.type === 'weight' ? 0.5 : 1}
                    className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
                  />
                </div>
              ))
            ) : (
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Marca</label>
                <Input
                  type="number"
                  placeholder={`Ej: 8 ${CHALLENGE_TYPE_UNIT[showJoinChallengeModal.type as ChallengeType]}`}
                  value={joinValue}
                  onChange={(e) => setJoinValue(e.target.value)}
                  min="0"
                  step={showJoinChallengeModal.type === 'weight' ? 0.5 : 1}
                  className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
                />
              </div>
            )}
            {showJoinChallengeModal.isPrivate &&
              !showJoinChallengeModal.participants.some((p) => sameUserId(p.userId, user.id)) && (
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Contraseña</label>
                  <Input
                    type="password"
                    placeholder="Te la tiene que pasar quien lo creó"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    className="h-10 rounded-xl border-white/50 bg-white/60 shadow-none dark:border-white/10 dark:bg-slate-800/60"
                  />
                </div>
              )}
            {joinError && <p className="text-[12px] font-medium text-rose-500">{joinError}</p>}
            <button
              type="button"
              disabled={joinSubmitting}
              onClick={handleJoinSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 py-2.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
            >
              {joinSubmitting ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        )}
      </GlassModal>

      {/* Friend Detail Modal */}
      {viewingProfileId && viewingProfileId !== user.id && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[80] flex flex-col bg-[var(--app-bg)]">
          <div className="app-page mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
            <ProfileScreen
              userId={viewingProfileId}
              liveAvatar={viewingProfileId === user.id ? user.avatar : undefined}
              onBack={() => setViewingProfileId(null)}
              onOpenProfile={id => setViewingProfileId(id)}
              onSendFriendRequest={
                onSendFriendRequest ? async () => { await onSendFriendRequest(viewingProfileId); } : undefined
              }
              onAcceptFriend={async () => {
                const req = pendingRequests.find(r => r.userId === viewingProfileId || r.id === viewingProfileId);
                if (req) await handleRequestAction(req.id, onAccept);
              }}
              onRejectFriend={async () => {
                const req = pendingRequests.find(r => r.userId === viewingProfileId || r.id === viewingProfileId);
                if (req) await handleRequestAction(req.id, onReject);
              }}
              onOpenChat={peerId => {
                setViewingProfileId(null);
                setShowFriendModal(null);
                setFriendRoutine(null);
                setFriendProfile(null);
                setChatPeerId(peerId);
                setActiveTab('chat');
              }}
              onOpenFriends={goToFriendsPage}
            />
          </div>
        </div>,
        document.body
      )}

      {photoPerson && (
        <ProfilePhotoViewer person={photoPerson} onClose={() => setPhotoPerson(null)} />
      )}

      <GlassModal
        open={!!showFriendModal && !viewingProfileId}
        onClose={closeFriendSheet}
        center
        title={friendProfile?.name || showFriendModal?.name || 'Perfil'}
        titleExtra={
          showFriendModal ? (
            <button
              type="button"
              onClick={() => {
                const id = showFriendModal.id;
                setShowFriendModal(null);
                setViewingProfileId(id);
              }}
              className="shrink-0 text-[12px] font-semibold text-indigo-600 dark:text-indigo-300"
            >
              Ver perfil completo
            </button>
          ) : undefined
        }
        subtitle={
          friendProfile?.coach
            ? `Entrena con ${friendProfile.coach.name}`
            : friendProfile?.athleteCount
              ? `Entrenador de ${friendProfile.athleteCount}`
              : undefined
        }
        footer={
          showFriendModal ? (
            <div className="space-y-2">
              <div className="flex gap-2">
              {!friendProfile?.blocked &&
                (friendProfile?.friendshipStatus === 'accepted' ||
                  friendProfile?.friendshipStatus === 'following') && (
                  <CloseFriendButton
                    userId={showFriendModal.id}
                    name={friendProfile.name || showFriendModal.name}
                    avatar={friendProfile.avatar || showFriendModal.avatar}
                  />
                )}
              {friendProfile?.blocked === 'them' ? (
                <p className="flex-1 py-2 text-center text-sm font-medium text-slate-500">Te ha bloqueado</p>
              ) : friendProfile?.blocked === 'you' ? (
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  disabled={friendRequestBusy}
                  onClick={async () => {
                    setFriendRequestBusy(true);
                    try {
                      await unblockUser(showFriendModal.id);
                      void openFriendModal(showFriendModal);
                    } finally {
                      setFriendRequestBusy(false);
                    }
                  }}
                >
                  Desbloquear
                </Button>
              ) : friendProfile?.friendshipStatus === 'pending' && friendProfile?.friendshipDirection === 'incoming' ? (
                <div className="flex flex-1 gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl"
                    disabled={friendRequestBusy}
                    onClick={async () => {
                      const req = pendingRequests.find(r => r.userId === showFriendModal.id);
                      if (!req) return;
                      setFriendRequestBusy(true);
                      try {
                        await handleRequestAction(req.id, onReject);
                        setFriendProfile(prev =>
                          prev
                            ? { ...prev, friendshipStatus: 'none', friendshipDirection: null, canSendRequest: true }
                            : prev
                        );
                      } finally {
                        setFriendRequestBusy(false);
                      }
                    }}
                  >
                    Rechazar
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 rounded-xl"
                    disabled={friendRequestBusy}
                    onClick={async () => {
                      const req = pendingRequests.find(r => r.userId === showFriendModal.id);
                      if (!req) return;
                      setFriendRequestBusy(true);
                      try {
                        await handleRequestAction(req.id, onAccept);
                        const fresh = await fetchProfile(showFriendModal.id).catch(() => null);
                        setFriendProfile(prev =>
                          prev
                            ? {
                                ...prev,
                                friendshipStatus: fresh?.friendshipStatus ?? 'follower',
                                friendshipDirection: fresh?.friendshipDirection ?? 'incoming',
                                canSendRequest: fresh?.canSendRequest ?? true,
                                followerCount: fresh?.followerCount ?? prev.followerCount,
                                followingCount: fresh?.followingCount ?? prev.followingCount,
                              }
                            : prev
                        );
                      } finally {
                        setFriendRequestBusy(false);
                      }
                    }}
                  >
                    {friendRequestBusy ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                    Aceptar
                  </Button>
                </div>
              ) : friendProfile?.canSendRequest || friendProfile?.friendshipStatus === 'follower' ? (
                <Button
                  variant="primary"
                  className="flex-1 rounded-xl"
                  disabled={friendRequestBusy || !onSendFriendRequest}
                  onClick={async () => {
                    if (!onSendFriendRequest) return;
                    setFriendRequestBusy(true);
                    try {
                      await onSendFriendRequest(showFriendModal.id);
                      setFriendProfile(prev =>
                        prev
                          ? { ...prev, canSendRequest: false, friendshipStatus: 'pending', friendshipDirection: 'outgoing' }
                          : prev
                      );
                    } catch (e: any) {
                      setFriendActionError(e?.message || 'No se pudo enviar la solicitud.');
                    } finally {
                      setFriendRequestBusy(false);
                    }
                  }}
                >
                  {friendRequestBusy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  Enviar solicitud
                </Button>
              ) : friendProfile?.friendshipStatus === 'pending' || friendProfile?.friendshipStatus === 'following' ? (
                <>
                  {friendProfile?.friendshipStatus === 'following' && onUnfriend && (
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      aria-label="Dejar de ser amigo"
                      onClick={() => setUnfriendConfirmFriend(showFriendModal)}
                    >
                      <UserMinus size={16} />
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1 rounded-xl" disabled>
                    {friendProfile?.friendshipStatus === 'following' ? 'Siguiendo' : 'Solicitud enviada'}
                  </Button>
                </>
              ) : (
                <>
              {onUnfriend && (
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setUnfriendConfirmFriend(showFriendModal)}
                >
                  <UserMinus size={16} />
                </Button>
              )}
              <Button
                variant="primary"
                className="flex-1 rounded-xl"
                onClick={() => {
                  const id = showFriendModal.id;
                  closeFriendSheet();
                  setChatPeerId(id);
                  setActiveTab('chat');
                }}
              >
                Escribir
              </Button>
                </>
              )}
            </div>
            </div>
          ) : undefined
        }
      >
        {showFriendModal && (
          <div>
              <div className="mb-5">
                {!friendProfile ? (
                  <CoverSkeleton />
                ) : (
                <InstagramCover
                  name={friendProfile.name || showFriendModal.name}
                  username={friendProfile.username}
                  userId={showFriendModal.id}
                  avatar={friendProfile.avatar || showFriendModal.avatar}
                  marcas={friendProfile.trainingMaxes?.length ?? 0}
                  followers={friendProfile.followerCount ?? 0}
                  following={friendProfile.followingCount ?? 0}
                  bio={friendProfile.bio || ''}
                  onFollowersClick={() => goToFriendsPage('followers')}
                  onFollowingClick={() => goToFriendsPage('following')}
                />
                )}
                {friendProfile?.coach && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                    <GraduationCap size={13} />
                    Entrena con {friendProfile.coach.name}
                  </p>
                )}
                {!!friendProfile?.athleteCount && friendProfile.athleteCount > 0 && (
                  <p className="mt-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    Entrenador de {friendProfile.athleteCount}{' '}
                    {friendProfile.athleteCount === 1 ? 'persona' : 'personas'}
                  </p>
                )}
              </div>

              {friendProfile && friendProfile.trainingMaxes && friendProfile.trainingMaxes.length > 0 && (
              <div className="border-t border-white/40 pt-4 pb-4 dark:border-white/10">
                <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Marcas</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {friendProfile.trainingMaxes.map((tm, i) => (
                      <button
                        key={tm.id || `${tm.name}-${i}`}
                        type="button"
                        onClick={() => setOpenFriendTm(tm)}
                        className="rounded-2xl bg-white/70 px-2.5 py-2.5 text-left shadow-sm ring-1 ring-black/[0.04] dark:bg-white/5 dark:ring-white/[0.06]"
                      >
                        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tm.name}</p>
                        <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {tm.value}
                          <span className="ml-0.5 text-[11px] font-medium text-slate-400">
                            {tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's'}
                          </span>
                        </p>
                      </button>
                    ))}
                  </div>
              </div>
              )}

              {friendRoutine && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Rutina activa</h4>
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600">
                      <div className="flex items-center gap-2 mb-3">
                        <Dumbbell size={18} className="text-indigo-600 dark:text-indigo-400" />
                        <span className="font-bold text-slate-900 dark:text-slate-100">{friendRoutine.name}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {friendRoutine.weeks?.length || 0} semanas · {friendRoutine.weeks?.flatMap(w => w.days).filter(d => d.type === 'workout').length || 0} días de entrenamiento
                      </p>
                      {friendRoutine.weeks?.[0] && (
                        <div className="mt-3 space-y-2">
                          {friendRoutine.weeks[0].days.filter(d => d.type === 'workout').slice(0, 3).map(day => (
                            <div key={day.id} className="text-xs">
                              <span className="font-medium text-slate-700 dark:text-slate-300">{day.name}:</span>
                              <span className="text-slate-500 dark:text-slate-400 ml-2">
                                {day.exercises.map(e => e.name).join(', ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {copiedRoutineFromFriend && onGoToCopiedRoutine ? (
                      <div className="space-y-3">
                        {activeRoutineId === copiedRoutineFromFriend.id ? (
                          <>
                            <p className="text-xs text-center text-slate-500 dark:text-slate-400 leading-relaxed px-1">
                              Ya tienes esta rutina copiada y es la que tienes <span className="font-semibold text-slate-700 dark:text-slate-300">activa</span> ahora.
                            </p>
                            <Button
                              variant="primary"
                              className="w-full rounded-xl"
                              onClick={() => onGoToCopiedRoutine(copiedRoutineFromFriend.id)}
                            >
                              <ArrowRight size={18} className="mr-2 shrink-0" />
                              Ir a Programa (Rutinas)
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            className="w-full rounded-xl"
                            onClick={() => onGoToCopiedRoutine(copiedRoutineFromFriend.id)}
                          >
                            <ArrowRight size={18} className="mr-2 shrink-0" />
                            Activar esta rutina
                          </Button>
                        )}
                      </div>
                    ) : onCopyFriendRoutine ? (
                      <Button 
                        variant="primary" 
                        className="w-full rounded-xl"
                        onClick={() => void handleCopyAndActivate()}
                        disabled={copyingFriendRoutine}
                      >
                        {copyingFriendRoutine ? (
                          <>
                            <Loader2 size={18} className="mr-2 animate-spin shrink-0" />
                            Copiando rutina…
                          </>
                        ) : (
                          <>
                            <Copy size={18} className="mr-2 shrink-0" />
                            Copiar y activar en Rutinas
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
              </div>
              )}
          </div>
        )}
      </GlassModal>

      {openFriendTm && showFriendModal && (
        <TmHistoryModal
          userId={showFriendModal.id}
          tm={openFriendTm}
          onClose={() => setOpenFriendTm(null)}
        />
      )}

      <GlassModal
        open={!!unfriendConfirmFriend}
        onClose={() => setUnfriendConfirmFriend(null)}
        center
        zIndexClass="z-[100050]"
        title="¿Dejar de ser amigo?"
        subtitle={unfriendConfirmFriend?.name}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setUnfriendConfirmFriend(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1 rounded-xl"
              onClick={async () => {
                if (!unfriendConfirmFriend) return;
                try {
                  await onUnfriend?.(unfriendConfirmFriend.id);
                } catch (e: any) {
                  setFriendActionError(e?.message || 'No se pudo eliminar la amistad.');
                }
                setUnfriendConfirmFriend(null);
                closeFriendSheet();
              }}
            >
              Dejar de ser amigo
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Dejáis de ser amigos. Podéis volver a enviaros solicitud cuando queráis.
        </p>
      </GlassModal>

      <HomeActivitySheet
        open={showHomeActivity}
        refreshTick={storyRefreshTick + socialRefreshTick + socialNavTick}
        onClose={() => setShowHomeActivity(false)}
        pendingRequests={pendingRequests}
        chatAsks={chatAsks}
        groupInvites={groupInvites}
        coachRequests={coachRequests}
        acceptRejectLoadingId={acceptRejectLoadingId}
        chatAskBusyId={chatAskBusyId}
        groupInviteBusyId={groupInviteBusyId}
        coachRequestBusyId={coachRequestBusyId}
        onAcceptFriend={id => void handleRequestAction(id, onAccept)}
        onRejectFriend={id => void handleRequestAction(id, onReject)}
        onSendFriendRequest={onSendFriendRequest}
        onAnswerChat={(id, decision) => {
          void answerChatAsk(id, decision);
          if (decision === 'accept') setShowHomeActivity(false);
        }}
        onAnswerGroup={(id, decision) => {
          void answerGroup(id, decision);
          if (decision === 'accept') setShowHomeActivity(false);
        }}
        onAnswerCoach={(id, decision) => void answerCoach(id, decision)}
        onOpenProfile={id => {
          setShowHomeActivity(false);
          const friend = friendsList.find(f => f.id === id);
          void openFriendModal(friend || { id, name: 'Atleta' });
        }}
        onOpenChat={peerId => {
          setShowHomeActivity(false);
          setChatPeerId(peerId);
          setActiveTab('chat');
        }}
        onGoChallenges={() => {
          setShowHomeActivity(false);
          setActiveTab('challenges');
        }}
        onGoGym={() => {
          setShowHomeActivity(false);
          setActiveTab('checkins');
        }}
        onNotificationsRead={markHomeNotifsRead}
      />
    </motion.div>
  );
};

function searchHitLabel(u: UserSearchResult): string {
  if (u.friendshipStatus === 'accepted' || u.friendshipStatus === 'following') return 'Siguiendo';
  if (u.friendshipStatus === 'pending') return 'Solicitud enviada';
  if (u.friendshipStatus === 'follower') return 'Te sigue';
  return 'Ver perfil';
}

function SearchHitRow({
  user: u,
  onOpen,
  onHold,
}: {
  user: UserSearchResult;
  onOpen: () => void;
  onHold: () => void;
}) {
  const hold = useLongPress(onHold);
  const following = u.friendshipStatus === 'accepted' || u.friendshipStatus === 'following';
  return (
    <button
      type="button"
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onContextMenu={hold.onContextMenu}
      onClick={e => {
        if (hold.suppressClick(e)) return;
        onOpen();
      }}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <FeedAvatar name={u.name} avatar={u.avatar ?? null} userId={u.id} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{u.name}</span>
        <span className="block text-[11px] text-slate-400">{searchHitLabel(u)}</span>
      </span>
      {following && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Check size={12} />
          Siguiendo
        </span>
      )}
    </button>
  );
}
