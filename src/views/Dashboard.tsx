import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  animate as animateValue,
  AnimatePresence,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from 'motion/react';
import { Trophy, Dumbbell, MapPin, Plus } from 'lucide-react';
import { 
  Area,
  ComposedChart, 
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { HistoryEntry, LogEntry, RMData, TrainingMax, TrainingWeek, Challenge, GymCheckIn, User, RoutineProgressKind } from '@/src/types';
import { ProgressMiniProfile } from '@/src/components/social/ProgressMiniProfile';
import { ConnectionsOverlay } from '@/src/components/social/ConnectionsOverlay';
import { entryDateISO } from '@/src/lib/calendarWeekDate';
import { cn } from '@/src/lib/utils';
import {
  computeRoutineProgressTotal,
  firstKnownTmValues,
  progressValueFromHistoryEntry,
} from '@/src/lib/routineProgressTotal';
import { weekOfYearFromDate, getMesocycleWeekIndex, weekStartDateForWeekOfYear } from '@/src/lib/mesocycleWeek';
import { weekOfMonthMondayBased, weekCountInMonth, lastCalendarDayOfWeekIndexInMonth } from '@/src/lib/weekOfMonth';
import { TM_BASELINE_DATE_ISO } from '@/src/lib/historyTm';
import { EASE_OUT, VIEW_TRANSITION } from '@/src/lib/motionPresets';

/** Curva suave: los escalones se leían como bloques cuadrados. */
const RM_LINE_TYPE = 'monotone' as const;

/**
 * Entrada de Progreso: un único reloj para toda la pantalla. La raíz solo funde
 * (lleva `backdrop-blur`, y moverla obliga al móvil a recalcular el desenfoque en
 * cada frame) y son los bloques con `ENTER_ITEM` los que dan el movimiento.
 * Se repite al volver a la pestaña (ver `chartEnterKey`).
 */
const ENTER_ROOT: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { ...VIEW_TRANSITION, delayChildren: 0.04, staggerChildren: 0.055 },
  },
  exit: { opacity: 0, transition: VIEW_TRANSITION },
};

const ENTER_ITEM: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 28, mass: 0.7 },
  },
};

const PEEK_HEAD_H = 40;
const PEEK_ROW_H = 58;
const PEEK_MAX = 2;

type PeekRow = {
  key: string;
  kind: 'trophy' | 'pin';
  title: string;
  subtitle: string;
  badge?: string;
  people?: { key: string; avatar?: string; name: string }[];
  onClick: () => void;
};

function PeekColumn({
  title,
  kind,
  onHeaderClick,
  onEmptyClick,
  emptyLabel,
  rows,
}: {
  title: string;
  kind: 'trophy' | 'pin';
  onHeaderClick: () => void;
  onEmptyClick?: () => void;
  emptyLabel: string;
  rows: PeekRow[];
}) {
  return (
    <div
      className="overflow-y-auto overflow-x-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] [scrollbar-width:none] dark:bg-slate-900 dark:ring-white/[0.06] [&::-webkit-scrollbar]:hidden"
      style={{ maxHeight: PEEK_HEAD_H + PEEK_MAX * PEEK_ROW_H }}
    >
      <button
        type="button"
        onClick={onHeaderClick}
        className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-slate-100 bg-white px-2.5 text-left dark:border-slate-800 dark:bg-slate-900 sm:gap-2.5 sm:px-3"
        style={{ height: PEEK_HEAD_H }}
      >
        {kind === 'trophy' ? (
          <Trophy size={14} className="shrink-0 text-amber-500" />
        ) : (
          <MapPin size={14} className="shrink-0 text-emerald-500" />
        )}
        <span className="truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </span>
      </button>
      {rows.length === 0 ? (
        <button
          type="button"
          onClick={onEmptyClick ?? onHeaderClick}
          aria-label={emptyLabel}
          className="flex w-full items-center justify-center"
          style={{ height: PEEK_MAX * PEEK_ROW_H }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <Plus size={22} strokeWidth={2.25} />
          </span>
        </button>
      ) : (
      <AnimatePresence initial={false}>
        {rows.map(row => (
          <motion.button
            key={row.key}
            type="button"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: PEEK_ROW_H }}
            exit={{ opacity: 0, height: 0 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            onClick={row.onClick}
            className="flex w-full origin-center items-center gap-2 border-b border-slate-100 px-2.5 text-left last:border-0 dark:border-slate-800 sm:gap-2.5 sm:px-3"
          >
            {row.people && row.people.length > 0 ? (
              <span className="flex shrink-0 -space-x-1.5">
                {row.people.map(p => (
                  <Avatar
                    key={p.key}
                    src={p.avatar}
                    userId={p.key}
                    name={p.name}
                    className="h-6 w-6 rounded-full border-2 border-white dark:border-slate-900"
                  />
                ))}
              </span>
            ) : row.kind === 'trophy' ? (
              <Trophy size={15} className="shrink-0 text-amber-500" />
            ) : (
              <MapPin size={15} className="shrink-0 text-emerald-500" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                {row.title}
              </span>
              <span className="block truncate text-[10px] text-slate-400">{row.subtitle}</span>
            </span>
            {row.badge && (
              <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                {row.badge}
              </span>
            )}
          </motion.button>
        ))}
      </AnimatePresence>
      )}
    </div>
  );
}

type StatTone = 'positive' | 'negative' | 'neutral';
interface StatVariant {
  value: string;
  tone: StatTone;
}

interface TmCardConfig {
  color: string;
  bg: string;
  text: string;
}

/**
 * Configuración de color por ejercicio. Objetos constantes: devolver literales nuevos
 * en cada render rompería el `React.memo` de las tarjetas de progreso.
 */
const TM_CONFIG_MB: Record<string, TmCardConfig> = {
  banca: { color: '#ec4899', bg: 'bg-pink-100', text: 'text-pink-600' },
  sentadilla: { color: '#f472b6', bg: 'bg-pink-50', text: 'text-pink-500' },
  muerto: { color: '#db2777', bg: 'bg-pink-100', text: 'text-pink-700' },
  default: { color: '#f9a8d4', bg: 'bg-pink-50', text: 'text-pink-600' },
};
const TM_CONFIG_DEFAULT: Record<string, TmCardConfig> = {
  banca: { color: '#3b82f6', bg: 'bg-blue-50', text: 'text-blue-600' },
  sentadilla: { color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  muerto: { color: '#f43f5e', bg: 'bg-rose-50', text: 'text-rose-600' },
  default: { color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-600' },
};

function tmConfigFor(name: string, mbMode: boolean): TmCardConfig {
  const table = mbMode ? TM_CONFIG_MB : TM_CONFIG_DEFAULT;
  const lower = name.toLowerCase();
  if (lower.includes('banca')) return table.banca;
  if (lower.includes('sentadilla')) return table.sentadilla;
  if (lower.includes('muerto')) return table.muerto;
  return table.default;
}

const CHART_MARGIN = { top: 10, right: 10, left: 4, bottom: 0 } as const;

function padChartSeries(
  data: Array<Record<string, string | number | null | undefined>>,
  dataKey: string
): Array<Record<string, string | number | null | undefined>> {
  const known = data.filter(d => d[dataKey] != null);
  if (known.length >= 2) return data;
  if (known.length === 1) {
    const only = known[0];
    return [
      { ...only, date: 'Inicio' },
      { ...only, date: String(only.date ?? 'Ahora') },
    ];
  }
  return data;
}

function chartDomain(values: Array<number | null | undefined>): [number, number] {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return [0, 10];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const pad = span < 1 ? Math.max(8, max * 0.08 || 8) : span * 0.22;
  return [Math.max(0, min - pad), max + pad];
}

function unitForTm(tm: TrainingMax): string {
  return tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
}

/** Más suave que el snap de la app: frena al final. */
const COUNT_EASE = [0.16, 0.84, 0.12, 1] as const;

/** 20 kg acaba antes que 200: el tiempo crece con la marca, no es un reloj único. */
function countDurationSec(value: number): number {
  const mag = Math.abs(value);
  if (mag < 0.05) return 0.28;
  return Math.min(1.7, Math.max(0.4, 0.3 + mag / 230));
}

/** Cuenta hasta el valor. El MotionValue pinta el DOM y no repinta Progreso. */
const ModalCount = React.memo(function ModalCount({
  value,
  replayKey,
  delay = 0,
}: {
  value: number;
  replayKey: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const raw = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(raw, v => String(Math.round(v * 10) / 10));

  useEffect(() => {
    if (reduceMotion) {
      raw.set(value);
      return;
    }
    raw.set(0);
    const controls = animateValue(raw, value, {
      duration: countDurationSec(value),
      ease: COUNT_EASE,
      delay,
    });
    return () => controls.stop();
  }, [value, replayKey, raw, reduceMotion, delay]);

  return <motion.span className="tabular-nums">{text}</motion.span>;
});

/** Área a ancho de pantalla: en móvil se lee; sin rejilla ni eje Y. */
const LiftAreaChart = React.memo(function LiftAreaChart({
  data,
  color,
  dataKey,
  unit,
  isDark,
  animate = false,
}: {
  data: Array<Record<string, string | number | null | undefined>>;
  color: string;
  dataKey: string;
  unit: string;
  isDark: boolean;
  animate?: boolean;
}) {
  const series = useMemo(() => padChartSeries(data, dataKey), [data, dataKey]);
  const domain = useMemo(
    () => chartDomain(series.map(d => d[dataKey] as number | null)),
    [series, dataKey]
  );
  const ticks = useMemo(() => {
    const labels = series.map(d => String(d.date ?? '')).filter(Boolean);
    if (labels.length <= 2) return labels;
    return [labels[0], labels[labels.length - 1]];
  }, [series]);
  const gradId = `lift-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  const tickFill = isDark ? 'rgba(255,255,255,0.4)' : '#94a3b8';
  const lastIdx = series.reduce((acc, d, i) => (d[dataKey] != null ? i : acc), -1);

  return (
    <div className="h-44 w-full min-w-0 [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none sm:h-52">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={domain} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tick={{ fontSize: 10, fill: tickFill }}
            height={18}
          />
          <Tooltip
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
            content={({ active, payload, label }) => {
              const raw = payload?.[0]?.value;
              if (!active || raw == null) return null;
              const n = typeof raw === 'number' ? raw : Number(raw);
              if (!Number.isFinite(n)) return null;
              return (
                <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
                  {label}: {Math.round(n * 10) / 10} {unit}
                </div>
              );
            }}
          />
          <Area
            type={RM_LINE_TYPE}
            dataKey={dataKey}
            stroke="none"
            fill={`url(#${gradId})`}
            isAnimationActive={animate}
            animationDuration={900}
            animationBegin={180}
            animationEasing="ease-out"
            connectNulls
          />
          <Line
            type={RM_LINE_TYPE}
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2.5}
            dot={(props: { cx?: number; cy?: number; index?: number }) => {
              if (props.index !== lastIdx || props.cx == null || props.cy == null) return null;
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={4.5}
                  fill={color}
                  stroke={isDark ? '#0f172a' : '#fff'}
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 5, fill: color, stroke: isDark ? '#0f172a' : '#fff', strokeWidth: 2 }}
            isAnimationActive={animate}
            animationDuration={900}
            animationBegin={180}
            animationEasing="ease-out"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});

/** Último snapshot anterior al día 1 del mes; solo entradas con fecha ≥ inicio de rutina (sin baseline 1970). */
function lastParsedBeforeMonth<
  T extends { date: Date; order: number }
>(sorted: T[], year: number, month: number, routineStartMs: number): T | null {
  const start = new Date(year, month, 1).getTime();
  let best: T | null = null;
  for (const item of sorted) {
    if (item.date.getTime() < routineStartMs) continue;
    if (item.date.getTime() < start) {
      if (!best || item.order > best.order) best = item;
    }
  }
  return best;
}

function computeRoutineStartDate(createdAtIso: string | undefined, history: HistoryEntry[]): Date {
  const times: number[] = [];
  if (createdAtIso) {
    const t = Date.parse(createdAtIso);
    if (!Number.isNaN(t)) times.push(t);
  }
  for (const h of history) {
    const iso = entryDateISO(h);
    if (!iso || iso === TM_BASELINE_DATE_ISO || iso.startsWith('1970')) continue;
    const t = Date.parse(`${iso}T12:00:00`);
    if (!Number.isNaN(t)) times.push(t);
  }
  const ms = times.length ? Math.min(...times) : Date.now();
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthEntirelyBeforeRoutine(selectedYear: number, monthIndex0: number, rs: Date): boolean {
  if (selectedYear < rs.getFullYear()) return true;
  if (selectedYear > rs.getFullYear()) return false;
  return monthIndex0 < rs.getMonth();
}

function weekSlotEndsBeforeRoutine(
  selectedYear: number,
  monthIndex0: number,
  weekIndex1Based: number,
  rs: Date
): boolean {
  const last = lastCalendarDayOfWeekIndexInMonth(selectedYear, monthIndex0, weekIndex1Based);
  last.setHours(23, 59, 59, 999);
  return last.getTime() < rs.getTime();
}

function blockSlotEndsBeforeRoutine(planWeek: number, cy: number, rs: Date): boolean {
  const ws = weekStartDateForWeekOfYear(planWeek, cy);
  const we = new Date(ws);
  we.setDate(ws.getDate() + 6);
  we.setHours(23, 59, 59, 999);
  return we.getTime() < rs.getTime();
}

/** Evita verde/rojo por float cuando no hay cambio real. */
function isEffectivelyZeroDelta(delta: number, kind: RoutineProgressKind): boolean {
  if (!Number.isFinite(delta)) return true;
  if (kind === 'mixed') return Math.abs(delta) < 0.015;
  return Math.abs(delta) < 0.01;
}

/** Torneos de más a menos movimiento: más participantes; empate → más reciente. */
function sortChallengesByActivity(list: Challenge[]): Challenge[] {
  return [...list].sort((a, b) => {
    const byCount = b.participants.length - a.participants.length;
    if (byCount !== 0) return byCount;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

export interface DashboardProps {
  user: User;
  /** Historial de `save-period` solo de la rutina activa (progresión por rutina, no global). */
  history: HistoryEntry[];
  rms: RMData;
  /** TM de la rutina activa; al cambiar de rutina cambian gráficos y referencias. */
  trainingMaxes: TrainingMax[];
  /** GET de RM de la rutina activa; evita dejar Progreso en blanco al cambiar de plan. */
  trainingMaxesLoading?: boolean;
  /** Nombre de la rutina cuya progresión se muestra. */
  activeRoutineName?: string;
  /** Id. de rutina activa; al cambiar se resetean filtros de fecha al mes actual. */
  activeRoutineId?: string;
  /** ISO creación rutina (servidor); gráficos en 0 antes de esta fecha / primer snapshot real. */
  routineCreatedAt?: string;
  /** true = plantilla por mes (semanas del mes en el gráfico Semana); false = bloque de N semanas. */
  sameTemplateAllWeeks?: boolean;
  /** Duración del mesociclo cuando la rutina es por bloque. */
  cycleLength?: number;
  /** Semana civil 1–52 (ancla del bloque en modo Semana). */
  currentWeekOfYear?: number;
  /** Desde esta fecha/hora los % de mejora usan el último snapshot anterior como base (no modifica TM). */
  progressCheckpointAt?: string;
  /** TM snapshot al checkpoint ({ tmId: valor }). El baseline de % se toma directamente de aquí. */
  progressCheckpointTms?: Record<string, number>;
  /** Semanas y series registradas de la rutina activa: base de 1RM estimado, volumen y récords. */
  routineWeeks?: TrainingWeek[];
  routineLogs?: Record<string, LogEntry>;
  challenges: Challenge[];
  checkIns: GymCheckIn[];
  onUpdateUser?: (updates: Partial<User>) => void;
  onOpenProgram: () => void;
  onCreateRoutine?: () => void;
  onOpenSocial: (
    tab?: 'friends' | 'challenges' | 'checkins' | 'chat',
    options?: { openCheckInModal?: boolean; openCreateChallenge?: boolean; from?: 'dashboard'; friendsFilter?: 'all' | 'following' | 'followers' }
  ) => void;
  onSendFriendRequest?: (userId: string) => Promise<void>;
  onConnectionsOpenChange?: (open: boolean) => void;
  onJoinFriendCheckIn: (checkIn: GymCheckIn) => void;
  onOpenSettings?: () => void;
  friendCount?: number;
  socialRefreshTick?: number;
  /** false = no hay rutina (se pueden borrar todas). */
  hasRoutine?: boolean;
  /** Se incrementa al volver a Progreso desde otra pestaña; fuerza remount de gráficos y replay de animación. */
  chartEnterKey?: number;
  pageActive?: boolean;
}

type ProgressMode = 'week' | 'year';

const MONTH_LABELS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const ProgressModeSwitch = React.memo(function ProgressModeSwitch({
  mode,
  onChange
}: {
  mode: ProgressMode;
  onChange: (mode: ProgressMode) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100/90 dark:bg-slate-800/90 p-1 backdrop-blur-md border border-slate-200/70 dark:border-slate-700/70">
      <button
        type="button"
        onClick={() => onChange('week')}
        className={cn(
          "px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
          mode === 'week'
            ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
            : "text-slate-500 dark:text-slate-400"
        )}
      >
        Semana
      </button>
      <button
        type="button"
        onClick={() => onChange('year')}
        className={cn(
          "px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
          mode === 'year'
            ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
            : "text-slate-500 dark:text-slate-400"
        )}
      >
        Año
      </button>
    </div>
  );
});

const DashboardViewInner: React.FC<DashboardProps> = ({ 
  user,
  history, 
  rms, 
  trainingMaxes,
  trainingMaxesLoading = false,
  activeRoutineName = 'Rutina activa',
  activeRoutineId,
  routineCreatedAt: routineCreatedAtProp,
  sameTemplateAllWeeks: sameTemplateAllWeeksProp = true,
  cycleLength: cycleLengthProp = 4,
  currentWeekOfYear: cwoyProp = 1,
  routineWeeks,
  routineLogs,
  challenges,
  checkIns,
  onUpdateUser,
  onOpenProgram,
  onCreateRoutine,
  onOpenSocial,
  onSendFriendRequest,
  onConnectionsOpenChange,
  onJoinFriendCheckIn,
  onOpenSettings,
  friendCount = 0,
  socialRefreshTick = 0,
  hasRoutine: hasRoutineProp,
  chartEnterKey = 0,
  pageActive = true,
}) => {
  const hasRoutine = hasRoutineProp ?? Boolean(activeRoutineId);
  const mountedAt = useMemo(() => new Date(), []);
  const currentYear = mountedAt.getFullYear();
  const currentMonth = mountedAt.getMonth();

  /** Replay suave al volver a Progreso. No se parte de opacity 0: si no, los RM nuevos se quedan invisibles. */
  const enterControls = useAnimationControls();
  useEffect(() => {
    void enterControls.start('show');
  }, [chartEnterKey, enterControls]);

  const [selectedCheckIn, setSelectedCheckIn] = useState<GymCheckIn | null>(null);
  const [progressMode, setProgressMode] = useState<ProgressMode>(() => user.progressMode === 'year' ? 'year' : 'week');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [totalOpen, setTotalOpen] = useState(false);
  const [selectedTmId, setSelectedTmId] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState<'followers' | 'following' | null>(null);

  useEffect(() => {
    onConnectionsOpenChange?.(!!connectionsOpen);
    return () => onConnectionsOpenChange?.(false);
  }, [connectionsOpen, onConnectionsOpenChange]);

  useEffect(() => {
    if (pageActive) return;
    setSelectedCheckIn(null);
    setTotalOpen(false);
    setConnectionsOpen(null);
    setSelectedTmId(null);
  }, [pageActive]);

  useEffect(() => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
  }, []);

  useEffect(() => {
    if (user.progressMode === 'year') setProgressMode('year');
    else if (user.progressMode === 'month') setProgressMode('week');
  }, [user.progressMode]);

  useEffect(() => {
    if (activeRoutineId == null) return;
    const n = new Date();
    setSelectedYear(n.getFullYear());
    setSelectedMonth(n.getMonth());
  }, [activeRoutineId]);

  /** Persistencia: solo `month` | `year` en servidor. "Semana" → `month`; el aspecto (bloque vs semanas del mes) lo marca la rutina. */
  const handleProgressModeChange = useCallback((mode: ProgressMode) => {
    setProgressMode(mode);
    onUpdateUser?.({ progressMode: mode === 'week' ? 'month' : 'year' });
  }, [onUpdateUser]);

  const routineStart = useMemo(
    () => computeRoutineStartDate(routineCreatedAtProp, history),
    [routineCreatedAtProp, history]
  );
  const routineStartMs = routineStart.getTime();

  /** Alta de cada TM: el peso con el que se dio de alta, no 0. */
  const firstKnownTms = useMemo(
    () => firstKnownTmValues(history, trainingMaxes),
    [history, trainingMaxes]
  );

  /** El total solo suma RM de kilos. Reps y segundos no se mezclan. */
  const weightTms = useMemo(
    () => trainingMaxes.filter(tm => tm.mode === 'weight'),
    [trainingMaxes]
  );
  const canTotal = weightTms.length >= 2;
  const selectedTm = useMemo(
    () => trainingMaxes.find(tm => tm.id === selectedTmId) ?? null,
    [trainingMaxes, selectedTmId]
  );

  const routineProgressMeta = useMemo(
    () => computeRoutineProgressTotal(weightTms),
    [weightTms]
  );

  const { totalGain, totalGainPct } = useMemo(() => {
    if (weightTms.length === 0) return { totalGain: 0, totalGainPct: 0 };
    const currentTotal = routineProgressMeta.value;
    const tmsAtBirth = weightTms.map(tm => ({
      ...tm,
      value: firstKnownTms[tm.id] ?? tm.value,
    }));
    const base = computeRoutineProgressTotal(tmsAtBirth).value;
    const gain = currentTotal - base;
    if (isEffectivelyZeroDelta(gain, routineProgressMeta.kind)) {
      return { totalGain: 0, totalGainPct: 0 };
    }
    const pct = base > 0 ? Math.round((gain / base) * 100) : 0;
    return { totalGain: gain, totalGainPct: pct };
  }, [firstKnownTms, weightTms, routineProgressMeta]);

  const mainStatDisplay = useMemo(() => {
    const u = routineProgressMeta.unit;
    const flat = isEffectivelyZeroDelta(totalGain, routineProgressMeta.kind);
    const abs =
      routineProgressMeta.kind === 'mixed'
        ? Math.round(totalGain * 100) / 100
        : Math.round(totalGain);
    return {
      abs: {
        value: `${abs > 0 ? '+' : ''}${abs}${u ? ` ${u}` : ''}`.trim(),
        tone: (flat ? 'neutral' : totalGain > 0 ? 'positive' : 'negative') as StatTone,
      },
      pct: {
        value: `${totalGainPct > 0 ? '+' : ''}${totalGainPct}%`,
        tone: (totalGainPct === 0 ? 'neutral' : totalGainPct > 0 ? 'positive' : 'negative') as StatTone,
      },
    };
  }, [totalGain, totalGainPct, routineProgressMeta.kind, routineProgressMeta.unit]);

  /** Primer/último valor guardado de este TM en el historial de esta rutina (ids distintos por rutina). */
  const tmStatDisplay = useMemo(() => {
    const byId: Record<string, { abs: StatVariant; pct: StatVariant }> = {};
    const firstByTmId = new Map<string, number>();
    for (const h of history) {
      if (h.trainingMaxes == null) continue;
      for (const [tmId, val] of Object.entries(h.trainingMaxes)) {
        if (val != null && val > 0 && !firstByTmId.has(tmId)) firstByTmId.set(tmId, val);
      }
    }
    trainingMaxes.forEach(tm => {
      const unit = tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
      const firstVal = firstByTmId.get(tm.id);
      if (firstVal != null) {
        const gain = tm.value - firstVal;
        const kind =
          tm.mode === 'weight' ? ('weight' as RoutineProgressKind) : tm.mode === 'reps' ? 'reps' : 'seconds';
        const flat = isEffectivelyZeroDelta(gain, kind);
        const pct = flat ? 0 : firstVal > 0 ? Math.round((gain / firstVal) * 100) : 0;
        const disp = flat ? 0 : Math.round(gain * 100) / 100;
        byId[tm.id] = {
          abs: {
            value: `${disp > 0 ? '+' : ''}${disp} ${unit}`,
            tone: (flat ? 'neutral' : gain > 0 ? 'positive' : gain < 0 ? 'negative' : 'neutral') as StatTone,
          },
          pct: {
            value: `${pct > 0 ? '+' : ''}${pct}%`,
            tone: (flat ? 'neutral' : pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral') as StatTone,
          },
        };
      } else {
        byId[tm.id] = {
          abs: { value: `0 ${unit}`, tone: 'neutral' },
          pct: { value: '0%', tone: 'neutral' },
        };
      }
    });
    return byId;
  }, [history, trainingMaxes]);

  const joinedChallenges = useMemo(() => challenges.filter(c => c.participants.some(p => p.userId === user.id)), [challenges, user.id]);

  /** Torneos activos que un amigo creó y aún no te has unido (el API ya filtra por amistad) */
  const friendTournamentsToJoin = useMemo(() => {
    // `Date.now()` aquí dentro: tener un `Date` del render en las dependencias
    // invalidaba este memo (y toda su cadena) en cada repintado.
    const nowMs = Date.now();
    return challenges.filter(c => {
      const ended = c.status === 'finished' || new Date(c.endDate).getTime() <= nowMs;
      if (ended) return false;
      if (c.participants.some(p => p.userId === user.id)) return false;
      const creatorId = typeof c.createdBy === 'string' ? c.createdBy : c.createdBy?.id;
      if (creatorId && creatorId === user.id) return false;
      return true;
    });
  }, [challenges, user.id]);

  /**
   * Antes solo se veía uno y el resto quedaba detrás de «Ver todos», con un aviso que
   * mandaba a una sección («Comunidad») que ya no existe. Tres caben de sobra y hacen
   * que el apartado sirva para algo sin salir de Progreso.
   */
  const topJoinedChallenges = useMemo(
    () => sortChallengesByActivity(joinedChallenges),
    [joinedChallenges]
  );

  const todayCheckInGroups = useMemo(() => {
    const todayCheckIns = checkIns.filter(ci => {
      const checkInDate = new Date(ci.timestamp).toDateString();
      const todayDate = new Date().toDateString();
      return checkInDate === todayDate;
    });
    const groupedTodayCheckIns = todayCheckIns.reduce((acc, ci) => {
      const key = `${ci.gymName}__${ci.time}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(ci);
      return acc;
    }, {} as Record<string, GymCheckIn[]>);
    return Object.values(groupedTodayCheckIns)
      .sort((a, b) => Math.max(...b.map(x => x.timestamp)) - Math.max(...a.map(x => x.timestamp)));
  }, [checkIns]);

  const tournamentRows = useMemo<PeekRow[]>(() => {
    const invites = sortChallengesByActivity(friendTournamentsToJoin);
    const joined = topJoinedChallenges.filter(c => !invites.some(i => i.id === c.id));
    const rows: PeekRow[] = [];
    for (const c of invites) {
      rows.push({
        key: `invite-${c.id}`,
        kind: 'trophy',
        title: c.title,
        subtitle: 'Te invitan',
        badge: 'Unirse',
        onClick: () => onOpenSocial('challenges', { from: 'dashboard' }),
      });
    }
    for (const c of joined) {
      rows.push({
        key: `joined-${c.id}`,
        kind: 'trophy',
        title: c.title,
        subtitle: c.exercise || 'Torneo',
        onClick: () => onOpenSocial('challenges', { from: 'dashboard' }),
      });
    }
    return rows;
  }, [friendTournamentsToJoin, topJoinedChallenges, onOpenSocial]);

  const gymRows = useMemo<PeekRow[]>(() => {
    const rows: PeekRow[] = todayCheckInGroups.map(group => {
      const first = group[0];
      const hasMe = group.some(ci => ci.userId === user.id);
      const people = (hasMe
        ? [user, ...group.filter(ci => ci.userId !== user.id)]
        : group
      ).slice(0, 3).map((ci, idx) => ({
        key: `${(ci as { userId?: string; id?: string }).userId || (ci as { id?: string }).id || idx}`,
        avatar: (ci as { avatar?: string }).avatar,
        name: (ci as { name?: string; userName?: string }).name || (ci as { userName?: string }).userName || 'Atleta',
      }));
      return {
        key: `gym-${first.gymName}-${first.time}`,
        kind: 'pin' as const,
        title: group.length > 1 ? `${group.length} van al gym` : first.userName,
        subtitle: `${first.gymName} · ${first.time}`,
        people,
        onClick: () => {
          if (!hasMe) setSelectedCheckIn(first);
        },
      };
    });
    return rows;
  }, [todayCheckInGroups, user]);

  const getTMConfig = useCallback(
    (name: string) => tmConfigFor(name, !!user.mbMode),
    [user.mbMode]
  );

  const isDarkTheme = user.theme === 'dark';

  const cl = Math.max(1, cycleLengthProp);

  /** Día de hoy en la rutina activa: rellena Progreso cuando no hay torneos ni gym. */
  const todayPlan = useMemo(() => {
    const weeks = routineWeeks ?? [];
    if (!weeks.length) return null;
    const dow = (new Date().getDay() + 6) % 7;
    const week = sameTemplateAllWeeksProp
      ? weeks[0]
      : (weeks.find(w => w.number === cwoyProp)
        ?? weeks[Math.max(0, getMesocycleWeekIndex(cwoyProp, cl) - 1)]
        ?? weeks[0]);
    const day = week?.days?.[dow];
    if (!day) return null;
    const lifts = day.exercises.map(ex => ex.name).filter(Boolean);
    return {
      title: day.name || 'Hoy',
      rest: day.type === 'rest' || lifts.length === 0,
      lifts: lifts.slice(0, 3),
      more: Math.max(0, lifts.length - 3),
    };
  }, [routineWeeks, sameTemplateAllWeeksProp, cwoyProp, cl]);

  /** Modo rutina por bloque (N semanas): ventana de mesociclo según año — mismo número de semana civil que hoy en otros años (comparable); en el año actual, el ciclo que contiene la semana actual. */
  const blockCycleParams = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    const refYear = selectedYear;
    const refWeek = refYear === cy ? cwoyProp : Math.min(52, Math.max(1, cwoyProp));
    const mesoAtRef = getMesocycleWeekIndex(refWeek, cl);
    const cycleStartWeek = refWeek - (mesoAtRef - 1);
    return { cy, refYear, refWeek, cycleStartWeek, cwoyProp };
  }, [selectedYear, cwoyProp, cl]);

  const parsedHistory = useMemo(() => {
    const yearNow = new Date().getFullYear();
    const monthByText: Record<string, number> = {
      ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
      may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
      sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11
    };

    return [...history]
      .map((entry, idx) => {
        let date: Date;
        if (entry.dateISO && /^\d{4}-\d{2}-\d{2}$/.test(entry.dateISO)) {
          const [yy, mm, dd] = entry.dateISO.split('-').map(Number);
          date = new Date(yy, mm - 1, dd);
        } else {
          date = new Date(entry.date);
          if (entry.year && entry.week) {
            const base = new Date(entry.year, 0, 1 + (entry.week - 1) * 7);
            const dow = entry.dayOfWeek != null ? entry.dayOfWeek : 0;
            date = new Date(base);
            date.setDate(base.getDate() + dow);
          }
          if (Number.isNaN(date.getTime())) {
            const raw = (entry.date || '').toLowerCase().trim();
            const matchedMonth = Object.entries(monthByText).find(([key]) => raw.includes(key))?.[1];
            if (matchedMonth !== undefined) {
              date = new Date(entry.year ?? yearNow, matchedMonth, 1);
            } else {
              date = new Date(entry.year ?? yearNow, 0, Math.min(28, idx + 1));
            }
          }
        }
        const created = entry.createdAt ? Date.parse(entry.createdAt) : NaN;
        const isoOrder = Date.parse(entryDateISO(entry) + 'T12:00:00');
        const orderBase = !Number.isNaN(isoOrder)
          ? isoOrder
          : !Number.isNaN(created)
            ? created
            : date.getTime();
        const planWeek = entry.week ?? weekOfYearFromDate(date, date.getFullYear());
        const cl = Math.max(1, cycleLengthProp);
        return {
          source: entry,
          date,
          year: entry.year ?? date.getFullYear(),
          month: date.getMonth(),
          planWeek,
          weekOfMonth: weekOfMonthMondayBased(date),
          mesoSlot: getMesocycleWeekIndex(planWeek, cl),
          order: orderBase + idx * 0.001
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [history, cycleLengthProp]);

  const availableYears = useMemo(() => {
    const y0 = new Date().getFullYear();
    const years: number[] = [];
    for (let y = y0; y >= 2020; y--) years.push(y);
    return years;
  }, []);

  useEffect(() => {
    const n = new Date();
    if (!availableYears.includes(selectedYear)) setSelectedYear(n.getFullYear());
    if (selectedMonth < 0 || selectedMonth > 11) setSelectedMonth(n.getMonth());
  }, [availableYears, selectedMonth, selectedYear]);

  const chartContext = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth();
    const currentTotal = computeRoutineProgressTotal(weightTms).value;
    const rs = routineStart;

    if (progressMode === 'week') {
      /** Rutina “por mes”: semanas del mes civil (4–6). */
      if (sameTemplateAllWeeksProp) {
        const weeksInMonth = weekCountInMonth(selectedYear, selectedMonth);
        const currentWeekSlotInMonth =
          cy === selectedYear && cm === selectedMonth ? weekOfMonthMondayBased(now) : weeksInMonth;

        const monthData = parsedHistory.filter(
          item => item.year === selectedYear && item.month === selectedMonth
        );
        const latestByWeek = new Map<number, typeof monthData[number]>();
        monthData.forEach(item => {
          const w = item.weekOfMonth;
          const prev = latestByWeek.get(w);
          if (!prev || item.order >= prev.order) latestByWeek.set(w, item);
        });

        const lastBefore = lastParsedBeforeMonth(parsedHistory, selectedYear, selectedMonth, routineStartMs);
        let carryTotal: number | null = null;
        const isCurrentMonth = selectedYear === cy && selectedMonth === cm;
        if (lastBefore && weightTms.length > 0) {
          carryTotal = progressValueFromHistoryEntry(lastBefore.source, weightTms, {
            missingTmFallback: firstKnownTms,
          });
        }

        return Array.from({ length: weeksInMonth }, (_, i) => {
          const week = i + 1;
          const point = latestByWeek.get(week);
          const isCurrentSlot = isCurrentMonth && week === currentWeekSlotInMonth;
          if (point?.source) {
            carryTotal = progressValueFromHistoryEntry(point.source, weightTms, {
              missingTmFallback: firstKnownTms,
            });
          }
          if (isCurrentSlot) carryTotal = currentTotal;
          const isFuture = isCurrentMonth && week > currentWeekSlotInMonth;
          const preRoutine = weekSlotEndsBeforeRoutine(selectedYear, selectedMonth, week, rs);
          let total: number | null = isFuture || preRoutine ? null : carryTotal;
          return {
            key: `w${week}`,
            label: String(week),
            slotNum: week,
            source: point?.source,
            total
          };
        });
      }

      /** Rutina por bloque: N = cycleLength (p. ej. 8 semanas). */
      const { cy: cyNow, refYear, cycleStartWeek, cwoyProp: cwToday } = blockCycleParams;
      const cycleEntries = parsedHistory.filter(
        item =>
          item.year === refYear &&
          item.planWeek >= cycleStartWeek &&
          item.planWeek < cycleStartWeek + cl
      );
      const latestBySlot = new Map<number, typeof cycleEntries[number]>();
      cycleEntries.forEach(item => {
        const slot = item.planWeek - cycleStartWeek + 1;
        const prev = latestBySlot.get(slot);
        if (!prev || item.order >= prev.order) latestBySlot.set(slot, item);
      });

      const lastBeforeCycle = [...parsedHistory].reverse().find(item => {
        if (item.date.getTime() < routineStartMs) return false;
        return item.year < refYear || (item.year === refYear && item.planWeek < cycleStartWeek);
      });
      let carryTotalBlock: number | null = null;
      if (lastBeforeCycle && weightTms.length > 0) {
        carryTotalBlock = progressValueFromHistoryEntry(lastBeforeCycle.source, weightTms, {
          missingTmFallback: firstKnownTms,
        });
      }

      return Array.from({ length: cl }, (_, i) => {
        const slot = i + 1;
        const point = latestBySlot.get(slot);
        const pw = cycleStartWeek + slot - 1;
        const isCurrentSlot = refYear === cyNow && pw === cwToday;
        if (point?.source) {
          carryTotalBlock = progressValueFromHistoryEntry(point.source, weightTms, {
            missingTmFallback: firstKnownTms,
          });
        }
        if (isCurrentSlot) carryTotalBlock = currentTotal;
        const isFuture = refYear > cyNow || (refYear === cyNow && pw > cwToday);
        const preRoutine = blockSlotEndsBeforeRoutine(pw, refYear, rs);
        let total: number | null = isFuture || preRoutine ? null : carryTotalBlock;
        return {
          key: `b${slot}`,
          label: String(slot),
          slotNum: slot,
          source: point?.source,
          total
        };
      });
    }

    const yearData = parsedHistory.filter(item => item.year === selectedYear);
    const latestByMonth = new Map<number, typeof yearData[number]>();
    yearData.forEach(item => {
      const prev = latestByMonth.get(item.month);
      if (!prev || item.order >= prev.order) latestByMonth.set(item.month, item);
    });
    const isCurrentYear = selectedYear === cy;
    const lastBeforeYear = [...parsedHistory].reverse().find(item => {
      if (item.date.getTime() < routineStartMs) return false;
      return item.year < selectedYear;
    });
    let carryTotal: number | null = null;
    if (lastBeforeYear && weightTms.length > 0) {
      carryTotal = progressValueFromHistoryEntry(lastBeforeYear.source, weightTms, {
        missingTmFallback: firstKnownTms,
      });
    }
    return Array.from({ length: 12 }, (_, month) => {
      const point = latestByMonth.get(month);
      const isCurrentSlot = selectedYear === cy && month === cm;
      if (point?.source) {
        carryTotal = progressValueFromHistoryEntry(point.source, weightTms, {
          missingTmFallback: firstKnownTms,
        });
      }
      if (isCurrentSlot) carryTotal = currentTotal;
      const isFuture = isCurrentYear && month > cm;
      const preRoutine = monthEntirelyBeforeRoutine(selectedYear, month, rs);
      let total: number | null = isFuture || preRoutine ? null : carryTotal;
      return {
        key: `m${month}`,
        label: MONTH_LABELS_SHORT[month],
        monthNum: month,
        source: point?.source,
        total
      };
    });
  }, [
    parsedHistory,
    progressMode,
    selectedYear,
    selectedMonth,
    weightTms,
    sameTemplateAllWeeksProp,
    cl,
    blockCycleParams,
    routineStart,
    routineStartMs,
    firstKnownTms,
  ]);

  const tmChartDataById = useMemo(() => {
    const byId: Record<string, Array<{ date: string; value: number | null }>> = {};
    const cy = new Date().getFullYear();
    const cm = new Date().getMonth();
    const weeksInMonth = weekCountInMonth(selectedYear, selectedMonth);
    const currentWeekSlotInMonth =
      cy === selectedYear && cm === selectedMonth ? weekOfMonthMondayBased(new Date()) : weeksInMonth;

    trainingMaxes.forEach(tm => {
      let carryValue: number | null = null;

      if (progressMode === 'week') {
        if (sameTemplateAllWeeksProp) {
          const lastBefore = lastParsedBeforeMonth(parsedHistory, selectedYear, selectedMonth, routineStartMs);
          const vBefore = lastBefore?.source.trainingMaxes?.[tm.id];
          const useCurrent = selectedYear === cy && selectedMonth === cm;
          carryValue = vBefore != null ? vBefore : null;
        } else {
          const { refYear: refY, cycleStartWeek: csw } = blockCycleParams;
          const lastBefore = [...parsedHistory].reverse().find(item => {
            if (item.date.getTime() < routineStartMs) return false;
            return item.year < refY || (item.year === refY && item.planWeek < csw);
          });
          const vBefore = lastBefore?.source.trainingMaxes?.[tm.id];
          carryValue = vBefore != null ? vBefore : null;
        }
      } else {
        const lastBefore = [...parsedHistory].reverse().find(item => {
          if (item.date.getTime() < routineStartMs) return false;
          return item.year < selectedYear;
        });
        const vBefore = lastBefore?.source.trainingMaxes?.[tm.id];
        carryValue = vBefore != null ? vBefore : null;
      }

      byId[tm.id] = chartContext.map(point => {
        const slotNum = 'slotNum' in point ? (point as { slotNum?: number }).slotNum : null;
        const monthNum = 'monthNum' in point ? (point as { monthNum?: number }).monthNum : null;
        let isCurrentSlot: boolean;
        let isFuture: boolean;
        if (progressMode === 'week') {
          if (sameTemplateAllWeeksProp) {
            isCurrentSlot = selectedYear === cy && selectedMonth === cm && slotNum === currentWeekSlotInMonth;
            isFuture = (slotNum ?? 0) > currentWeekSlotInMonth;
          } else {
            const { refYear: refY, cycleStartWeek: csw, cy: cyNow, cwoyProp: cwToday } = blockCycleParams;
            const planWeek = csw + (slotNum ?? 0) - 1;
            isCurrentSlot = refY === cyNow && planWeek === cwToday;
            isFuture = refY > cyNow || (refY === cyNow && planWeek > cwToday);
          }
        } else {
          isCurrentSlot = selectedYear === cy && monthNum === cm;
          isFuture = selectedYear === cy && (monthNum ?? 0) > cm;
        }
        if (progressMode === 'week' && sameTemplateAllWeeksProp && slotNum != null) {
          if (weekSlotEndsBeforeRoutine(selectedYear, selectedMonth, slotNum, routineStart)) {
            return { date: point.label, value: null };
          }
        }
        if (progressMode === 'week' && !sameTemplateAllWeeksProp && slotNum != null) {
          const { refYear: refY, cycleStartWeek: csw } = blockCycleParams;
          const pw = csw + slotNum - 1;
          if (blockSlotEndsBeforeRoutine(pw, refY, routineStart)) {
            return { date: point.label, value: null };
          }
        }
        if (progressMode === 'year' && monthNum != null) {
          if (monthEntirelyBeforeRoutine(selectedYear, monthNum, routineStart)) {
            return { date: point.label, value: null };
          }
        }
        const rawValue = isCurrentSlot
          ? tm.value
          : (point.source?.trainingMaxes?.[tm.id] ?? null);
        if (rawValue != null) carryValue = rawValue;
        return { date: point.label, value: isFuture ? null : carryValue };
      });
    });
    return byId;
  }, [
    chartContext,
    trainingMaxes,
    progressMode,
    selectedYear,
    selectedMonth,
    parsedHistory,
    sameTemplateAllWeeksProp,
    blockCycleParams,
    routineStart,
    routineStartMs,
  ]);

  const mainChartData = useMemo(
    () => chartContext.map(p => ({ date: p.label, total: p.total })),
    [chartContext]
  );
  const totalStroke = user.mbMode
    ? isDarkTheme
      ? '#f9a8d4'
      : '#ec4899'
    : isDarkTheme
      ? '#818cf8'
      : '#6366f1';
  return (
    <motion.div 
      variants={ENTER_ROOT}
      initial={false}
      animate={enterControls}
      exit="exit"
      className="app-page mx-auto w-full max-w-6xl bg-[var(--app-bg)]"
    >
      <motion.header variants={ENTER_ITEM} initial={false} className="mb-3 max-[360px]:mb-2 sm:mb-4">
        <ProgressMiniProfile
          user={user}
          friendCount={friendCount}
          marcaCount={trainingMaxes.length}
          onOpenSettings={onOpenSettings}
          onUpdateUser={onUpdateUser}
          onOpenFriends={() => setConnectionsOpen('following')}
          onOpenFollowers={() => setConnectionsOpen('followers')}
          onOpenFollowing={() => setConnectionsOpen('following')}
          refreshTick={socialRefreshTick}
          aside={
            canTotal ? (
              <button
                type="button"
                onClick={() => setTotalOpen(true)}
                className="flex max-w-full shrink-0 items-baseline gap-1.5 text-left"
              >
                <span className="text-[13px] font-black text-indigo-600 dark:text-indigo-300">
                  <ModalCount value={Math.round(routineProgressMeta.value)} replayKey={`header-total-${chartEnterKey}`} />
                  <span className="ml-0.5 text-[10px] font-semibold">kg</span>
                </span>
                <span
                  className={cn(
                    'truncate text-[11px] font-semibold',
                    mainStatDisplay.abs.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                    mainStatDisplay.abs.tone === 'negative' && 'text-rose-500',
                    mainStatDisplay.abs.tone === 'neutral' && 'text-slate-400'
                  )}
                >
                  {mainStatDisplay.abs.value}
                </span>
              </button>
            ) : null
          }
        />
      </motion.header>

      {!hasRoutine ? (
        <div className="mb-6 sm:mb-8">
          <div className="relative overflow-hidden rounded-[28px] border border-white/50 bg-white/70 px-6 py-10 text-center shadow-xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/65">
            <div className="pointer-events-none absolute -left-14 -top-14 h-40 w-40 rounded-full bg-indigo-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-violet-400/15 blur-3xl" />
            <span className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
              <Dumbbell size={24} />
            </span>
            <h3 className="relative text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Para las estadísticas necesitas una rutina
            </h3>
            <p className="relative mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Sin plan no hay marcas, gráficos ni récords. Crea una rutina y empieza a registrar series.
            </p>
            <Button
              variant="primary"
              className="relative mx-auto mt-5 h-11 rounded-2xl"
              onClick={onCreateRoutine ?? onOpenProgram}
            >
              <Plus size={16} />
              Crear rutina
            </Button>
          </div>
        </div>
      ) : trainingMaxesLoading && trainingMaxes.length === 0 ? (
        <div className="mb-4 grid grid-cols-3 gap-2 sm:mb-5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-2xl bg-white shadow-sm dark:bg-slate-900"
            />
          ))}
        </div>
      ) : trainingMaxes.length === 0 ? (
        <div className="mb-6 sm:mb-8">
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-5 py-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Los RM de {activeRoutineName}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
              Esta rutina aún no tiene marcas. Añádelas en Rutina; en cuanto las pongas salen aquí.
            </p>
            <Button variant="primary" className="mx-auto mt-4 h-10 rounded-xl" onClick={onOpenProgram}>
              <Dumbbell size={15} />
              Ir a la rutina
            </Button>
          </div>
        </div>
      ) : (
      <>
      <motion.div variants={ENTER_ITEM} initial={false} className="mb-4 sm:mb-5">
        <div className="mb-2.5 flex flex-wrap items-center justify-end gap-1.5 max-[360px]:gap-1">
          <ProgressModeSwitch mode={progressMode} onChange={handleProgressModeChange} />
          {(progressMode === 'year' || progressMode === 'week') && (
            <>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 max-[360px]:h-7 max-[360px]:px-1.5 max-[360px]:text-[10px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              {progressMode === 'week' && sameTemplateAllWeeksProp && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 max-[360px]:h-7 max-[360px]:px-1.5 max-[360px]:text-[10px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {MONTH_LABELS_SHORT.map((month, idx) => (
                    <option key={month} value={idx}>{month}</option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
        <div className={cn(
          'grid gap-2',
          trainingMaxes.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'
        )}>
          {trainingMaxes.map((tm, index) => {
            const config = getTMConfig(tm.name);
            const unit = unitForTm(tm);
            const stat = tmStatDisplay[tm.id];
            return (
              <motion.button
                key={`${tm.id}-${chartEnterKey}`}
                type="button"
                onClick={() => setSelectedTmId(tm.id)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index, duration: 0.28, ease: EASE_OUT }}
                whileTap={{ scale: 0.97 }}
                className="relative min-w-0 overflow-hidden rounded-2xl bg-white px-2.5 pb-2.5 pt-3 text-left shadow-sm ring-1 ring-black/[0.04] dark:bg-slate-900 dark:ring-white/[0.06]"
              >
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 h-1"
                  style={{ background: config.color }}
                />
                <span
                  className="pointer-events-none absolute -right-5 -top-6 h-16 w-16 rounded-full opacity-40 blur-2xl"
                  style={{ background: config.color }}
                />
                <span className={cn('relative block truncate text-[11px] font-semibold', config.text)}>
                  {tm.name}
                </span>
                <span className="relative mt-1 block truncate text-[22px] font-black leading-none text-slate-900 dark:text-white">
                  <ModalCount
                    value={Math.round(tm.value * 10) / 10}
                    replayKey={`${tm.id}-${chartEnterKey}`}
                    delay={0.02 * index}
                  />
                  <span className="ml-0.5 text-[10px] font-semibold text-slate-400">{unit}</span>
                </span>
                {stat && (
                  <span className={cn(
                    'relative mt-1.5 block truncate text-[10px] font-semibold',
                    stat.abs.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                    stat.abs.tone === 'negative' && 'text-rose-500',
                    stat.abs.tone === 'neutral' && 'text-slate-400'
                  )}>
                    {stat.abs.value}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">Toca una marca para ver la gráfica</p>
      </motion.div>

      {todayPlan && (
        <motion.button
          variants={ENTER_ITEM}
          initial={false}
          type="button"
          onClick={onOpenProgram}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-white px-3.5 py-3 text-left shadow-sm ring-1 ring-black/[0.04] dark:bg-slate-900 dark:ring-white/[0.06] sm:mb-5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <Dumbbell size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hoy · {todayPlan.title}</span>
            {todayPlan.rest ? (
              <span className="mt-0.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">Día de descanso</span>
            ) : (
              <span className="mt-0.5 block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {todayPlan.lifts.join(' · ')}
                {todayPlan.more > 0 ? ` +${todayPlan.more}` : ''}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-indigo-600">Rutina</span>
        </motion.button>
      )}

      </>
      )}

      <motion.div
        variants={ENTER_ITEM}
        initial={false}
        className="mb-6 grid grid-cols-2 gap-2 max-[360px]:gap-1.5 max-[400px]:mb-5 sm:mb-8 sm:gap-3 md:mb-10"
      >
        <PeekColumn
          title="Torneos"
          kind="trophy"
          onHeaderClick={() => onOpenSocial('challenges', { from: 'dashboard' })}
          onEmptyClick={() => onOpenSocial('challenges', { openCreateChallenge: true, from: 'dashboard' })}
          emptyLabel="Crear torneo"
          rows={tournamentRows}
        />
        <PeekColumn
          title="Avisar que voy"
          kind="pin"
          onHeaderClick={() => onOpenSocial('checkins', { from: 'dashboard' })}
          onEmptyClick={() => onOpenSocial('checkins', { openCheckInModal: true, from: 'dashboard' })}
          emptyLabel="Avisar que voy"
          rows={gymRows}
        />
      </motion.div>

      <GlassModal
        open={!!selectedTm}
        onClose={() => setSelectedTmId(null)}
        title={selectedTm?.name}
        subtitle={selectedTm ? `Cómo ha cambiado en ${activeRoutineName}` : undefined}
        wide
        rise
      >
        {selectedTm && (
          <div className="space-y-3">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
              className="text-4xl font-black leading-none text-slate-900 dark:text-white"
            >
              <ModalCount value={Math.round(selectedTm.value * 10) / 10} replayKey={selectedTm.id} />
              <span className="ml-1 text-sm font-semibold text-slate-400">{unitForTm(selectedTm)}</span>
            </motion.p>
            {tmStatDisplay[selectedTm.id] && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.28, ease: EASE_OUT }}
                className="flex items-baseline gap-3 text-sm font-semibold"
              >
                <span className={cn(
                  tmStatDisplay[selectedTm.id].abs.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                  tmStatDisplay[selectedTm.id].abs.tone === 'negative' && 'text-rose-500',
                  tmStatDisplay[selectedTm.id].abs.tone === 'neutral' && 'text-slate-400'
                )}>
                  {tmStatDisplay[selectedTm.id].abs.value}
                </span>
                <span className={cn(
                  tmStatDisplay[selectedTm.id].pct.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                  tmStatDisplay[selectedTm.id].pct.tone === 'negative' && 'text-rose-500',
                  tmStatDisplay[selectedTm.id].pct.tone === 'neutral' && 'text-slate-400'
                )}>
                  {tmStatDisplay[selectedTm.id].pct.value}
                </span>
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.32, ease: EASE_OUT }}
            >
              <LiftAreaChart
                key={selectedTm.id}
                data={tmChartDataById[selectedTm.id] ?? [{ date: 'Inicio', value: selectedTm.value }]}
                color={getTMConfig(selectedTm.name).color}
                dataKey="value"
                unit={unitForTm(selectedTm)}
                isDark={isDarkTheme}
                animate
              />
            </motion.div>
          </div>
        )}
      </GlassModal>

      <GlassModal
        open={totalOpen && canTotal}
        onClose={() => setTotalOpen(false)}
        title="Total en kg"
        subtitle={`Suma de los RM de peso de ${activeRoutineName}`}
        rise
      >
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-black text-slate-900 dark:text-white"
            >
              <ModalCount value={Math.round(routineProgressMeta.value)} replayKey="total" />
              <span className="ml-1 text-sm font-semibold text-slate-400">kg</span>
            </motion.p>
            <div className="text-right text-sm font-semibold">
              <p className={cn(
                mainStatDisplay.abs.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                mainStatDisplay.abs.tone === 'negative' && 'text-rose-500',
                mainStatDisplay.abs.tone === 'neutral' && 'text-slate-400'
              )}>
                {mainStatDisplay.abs.value}
              </p>
              <p className={cn(
                mainStatDisplay.pct.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                mainStatDisplay.pct.tone === 'negative' && 'text-rose-500',
                mainStatDisplay.pct.tone === 'neutral' && 'text-slate-400'
              )}>
                {mainStatDisplay.pct.value}
              </p>
            </div>
          </div>
          <LiftAreaChart
            data={mainChartData}
            color={totalStroke}
            dataKey="total"
            unit="kg"
            isDark={isDarkTheme}
            animate
          />
          <ul className="space-y-1.5">
            {weightTms.map(tm => (
              <li key={tm.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-slate-600 dark:text-slate-300">{tm.name}</span>
                <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{Math.round(tm.value)} kg</span>
              </li>
            ))}
          </ul>
        </div>
      </GlassModal>

      <GlassModal
        open={!!selectedCheckIn}
        onClose={() => setSelectedCheckIn(null)}
        title="¿Vas a ir a la misma hora?"
        subtitle={selectedCheckIn ? `${selectedCheckIn.gymName} · ${selectedCheckIn.time}` : undefined}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setSelectedCheckIn(null)}>
              No
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                if (!selectedCheckIn) return;
                onJoinFriendCheckIn(selectedCheckIn);
                setSelectedCheckIn(null);
              }}
            >
              Sí
            </Button>
          </div>
        }
      >
        {selectedCheckIn && (
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Se enviará una notificación a {selectedCheckIn.userName} indicando que vas a
            las {selectedCheckIn.time} en {selectedCheckIn.gymName}.
          </p>
        )}
      </GlassModal>

      {connectionsOpen && (
        <ConnectionsOverlay
          myId={user.id}
          filter={connectionsOpen}
          onClose={() => setConnectionsOpen(null)}
          onSendRequest={onSendFriendRequest}
          onOpenChat={() => {
            setConnectionsOpen(null);
            onOpenSocial('chat');
          }}
        />
      )}

    </motion.div>
  );
};

/** Memoizado: App re-renderiza con cada refresco social/TM y aquí eso repinta gráficos. */
export const DashboardView = React.memo(DashboardViewInner);
