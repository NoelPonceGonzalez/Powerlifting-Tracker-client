import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  animate as animateValue,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from 'motion/react';
import { Trophy, TrendingUp, Dumbbell, ChevronRight, MapPin, Clock, Bell } from 'lucide-react';
import { 
  ComposedChart, 
  Area, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { HistoryEntry, LogEntry, RMData, TrainingMax, TrainingWeek, Challenge, GymCheckIn, User, RoutineProgressKind } from '@/src/types';
import { StrengthInsights } from '@/src/components/StrengthInsights';
import { computeSessionStats } from '@/src/lib/sessionStats';
import { entryDateISO } from '@/src/lib/calendarWeekDate';
import { cn } from '@/src/lib/utils';
import {
  computeRoutineProgressTotal,
  progressValueFromHistoryEntry,
} from '@/src/lib/routineProgressTotal';
import { weekOfYearFromDate, getMesocycleWeekIndex, weekStartDateForWeekOfYear } from '@/src/lib/mesocycleWeek';
import { weekOfMonthMondayBased, weekCountInMonth, lastCalendarDayOfWeekIndexInMonth } from '@/src/lib/weekOfMonth';
import { TM_BASELINE_DATE_ISO } from '@/src/lib/historyTm';
import { EASE_OUT, VIEW_TRANSITION } from '@/src/lib/motionPresets';

/**
 * Alternancia valor absoluto ↔ porcentaje cada 3 s.
 * Vive fuera de React y se consume solo en el texto que parpadea: si el estado
 * estuviera en DashboardView, cada tick repintaría también todos los gráficos.
 */
/** Props estáticas de Recharts: como literales inline cambiaban de identidad en cada render. */
const CHART_MARGIN = { top: 12, right: 10, left: 0, bottom: 2 } as const;
const Y_AXIS_DOMAIN = ['dataMin - 8', 'dataMax + 8'] as const;
const X_TICK_DARK = { fontSize: 11, fill: 'rgba(255,255,255,0.45)' } as const;
const X_TICK_LIGHT = { fontSize: 11, fill: '#94a3b8' } as const;
const Y_TICK_DARK = { fontSize: 10, fill: 'rgba(255,255,255,0.32)' } as const;
const Y_TICK_LIGHT = { fontSize: 10, fill: '#94a3b8' } as const;
const GRID_STROKE_DARK = 'rgba(255,255,255,0.06)';
const GRID_STROKE_LIGHT = 'rgba(148,163,184,0.14)';
const TOOLTIP_STYLE_DARK = {
  backgroundColor: 'rgba(15,23,42,0.96)',
  borderRadius: '14px',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  padding: '10px 12px',
  fontSize: 13,
  boxShadow: '0 12px 32px -12px rgba(0,0,0,0.55)',
} as const;
const TOOLTIP_STYLE_LIGHT = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  borderRadius: '14px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 14px 28px -16px rgba(15,23,42,0.25)',
  padding: '10px 12px',
  fontSize: 13,
} as const;

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

/** Entrada de la gráfica; la cortina que la descubre va aparte (`CHART_CURTAIN`). */
const CHART_ENTER_INITIAL = { opacity: 0, y: 8 };
const CHART_ENTER_ANIMATE = { opacity: 1, y: 0 };
const CHART_ENTER_EXIT = { opacity: 0, y: -6 };
const CHART_ENTER_TRANSITION = { duration: 0.3, ease: EASE_OUT };

/**
 * La línea parece dibujarse sola: una cortina del color de la tarjeta se retira hacia
 * la derecha. Es `scaleX`, que la GPU compone sola; recortar con `clip-path` repintaría
 * la gráfica entera en cada frame y en móvil se nota.
 */

/**
 * Cifra que sube hasta su valor. El MotionValue se pinta directo en el DOM: contar
 * con `useState` repintaría el dashboard entero en cada frame.
 */
const CountUpNumber = React.memo(function CountUpNumber({
  value,
  decimals = 0,
  replayKey = 0,
}: {
  value: number;
  decimals?: number;
  replayKey?: number;
}) {
  const reduceMotion = useReducedMotion();
  const raw = useMotionValue(reduceMotion ? value : 0);
  const factor = 10 ** decimals;
  const text = useTransform(raw, v => String(Math.round(v * factor) / factor));
  const lastReplayKey = useRef(replayKey);

  useEffect(() => {
    if (reduceMotion) {
      raw.set(value);
      return;
    }
    // Solo se reinicia a 0 al entrar en la pestaña; un cambio de marca interpola desde el valor actual.
    if (lastReplayKey.current !== replayKey) {
      lastReplayKey.current = replayKey;
      raw.set(0);
    }
    const controls = animateValue(raw, value, { duration: 0.9, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, replayKey, raw, reduceMotion]);

  // `tabular-nums`: sin ancho fijo por dígito, la cifra al contar zarandearía lo que tiene al lado.
  return <motion.span className="tabular-nums">{text}</motion.span>;
});

const PERCENT_TOGGLE_MS = 3000;
let percentToggleValue = false;
let percentToggleTimer: ReturnType<typeof setInterval> | null = null;
const percentToggleListeners = new Set<() => void>();

function subscribePercentToggle(onChange: () => void): () => void {
  percentToggleListeners.add(onChange);
  if (percentToggleTimer == null) {
    percentToggleTimer = setInterval(() => {
      percentToggleValue = !percentToggleValue;
      percentToggleListeners.forEach((l) => l());
    }, PERCENT_TOGGLE_MS);
  }
  return () => {
    percentToggleListeners.delete(onChange);
    if (percentToggleListeners.size === 0 && percentToggleTimer != null) {
      clearInterval(percentToggleTimer);
      percentToggleTimer = null;
      percentToggleValue = false;
    }
  };
}

const getPercentToggle = () => percentToggleValue;

type StatTone = 'positive' | 'negative' | 'neutral';
interface StatVariant {
  value: string;
  tone: StatTone;
}

/** Texto que alterna entre absoluto y %. Se suscribe él solo al temporizador. */
const AlternatingStat = React.memo(function AlternatingStat({
  abs,
  pct,
  className,
  prefix,
}: {
  abs: StatVariant;
  pct: StatVariant;
  className: string;
  prefix?: string;
}) {
  const showPercent = useSyncExternalStore(subscribePercentToggle, getPercentToggle, getPercentToggle);
  const current = showPercent ? pct : abs;
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={showPercent ? 'pct' : 'abs'}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className={cn(
          className,
          current.tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          current.tone === 'negative' && 'text-rose-600 dark:text-rose-400',
          current.tone === 'neutral' && 'text-slate-500 dark:text-slate-400'
        )}
      >
        {prefix}{current.value}
      </motion.span>
    </AnimatePresence>
  );
});

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

/**
 * Tarjeta de progreso de un TM. Memoizada: el dashboard se repinta con check-ins,
 * torneos y refrescos que no afectan a estos gráficos.
 */
/** Con un solo punto (o todos iguales) la curva es una raya plana que parece un fallo. */
function isFlatSeries(values: Array<number | null | undefined>): boolean {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v));
  return nums.length < 2 || new Set(nums).size < 2;
}

/**
 * Sin histórico la gráfica sería un punto suelto, así que se añade un arranque en 0:
 * se ve la subida hasta la marca actual en vez de un hueco vacío.
 */
function withZeroStart<K extends string>(
  data: Array<{ date: string } & Record<K, number | null>>,
  key: K
): Array<{ date: string } & Record<K, number | null>> {
  if (!isFlatSeries(data.map(p => p[key]))) return data;
  const first = data.find(p => p[key] != null);
  if (!first) return data;
  return [{ date: 'Inicio', [key]: 0 } as { date: string } & Record<K, number | null>, ...data];
}

const TmProgressCard = React.memo(function TmProgressCard({
  tm,
  config,
  chartData,
  stat,
  isDark,
  chartKey,
}: {
  tm: TrainingMax;
  config: TmCardConfig;
  chartData: { date: string; value: number | null }[];
  stat?: { abs: StatVariant; pct: StatVariant };
  isDark: boolean;
  chartKey: string;
}) {
  const unit = tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
  const gradId = `grad-${tm.id.replace(/[^a-z0-9]/gi, '')}`;
  const itemStyle = useMemo(() => ({ color: config.color }), [config.color]);
  const activeDot = useMemo(
    () => ({ r: 5, fill: config.color, stroke: isDark ? '#1e293b' : '#fff', strokeWidth: 2 }),
    [config.color, isDark]
  );
  const formatter = useCallback(
    (value: number | null): [string, string] => [value == null ? '—' : `${Math.round(value)} ${unit}`, ''],
    [unit]
  );
  const renderDot = useCallback(
    (dotProps: { cx?: number; cy?: number; payload?: { value?: number | null } }) => {
      const v = dotProps.payload?.value;
      if (v == null || Number.isNaN(v)) return null;
      const { cx, cy } = dotProps;
      if (cx == null || cy == null) return null;
      return <circle cx={cx} cy={cy} r={3} fill={config.color} stroke="none" />;
    },
    [config.color]
  );

  return (
    // Sin `initial`/`animate` propios: hereda el escalonado de la raíz para que todo entre al mismo ritmo.
    <motion.div variants={ENTER_ITEM}>
      <Card padding="md" rounded="xl" className="group hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 dark:border-slate-700/60 border border-slate-100 overflow-hidden">
        <div className="flex justify-between items-center mb-2">
          <div className={cn("p-3 rounded-2xl", config.bg, "dark:bg-opacity-50")}>
            <Dumbbell size={20} className={config.text} />
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              <CountUpNumber value={tm.value} />
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">{unit}</span>
            </div>
            {stat ? (
              <AlternatingStat abs={stat.abs} pct={stat.pct} className="text-xs font-bold block mt-0.5" />
            ) : null}
          </div>
        </div>
        <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">{tm.name}</h3>
        <AnimatePresence mode="wait">
          <motion.div
            key={chartKey}
            initial={CHART_ENTER_INITIAL}
            animate={CHART_ENTER_ANIMATE}
            exit={CHART_ENTER_EXIT}
            transition={CHART_ENTER_TRANSITION}
            // Recharts 3 hace focusable el gráfico: sin esto queda un recuadro de foco al tocarlo.
            className="relative h-[156px] max-[360px]:h-[140px] sm:h-[176px] md:h-[196px] w-full -mx-1 sm:-mx-2 outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onPointerMoveCapture={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ touchAction: 'pan-x pan-y', WebkitTapHighlightColor: 'transparent', outline: 'none' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={withZeroStart(chartData, 'value')} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={config.color} stopOpacity={0.42}/>
                    <stop offset="100%" stopColor={config.color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={isDark ? GRID_STROKE_DARK : GRID_STROKE_LIGHT} />
                <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={22} axisLine={false} tickLine={false} tick={isDark ? X_TICK_DARK : X_TICK_LIGHT} />
                <YAxis
                  width={32}
                  axisLine={false}
                  tickLine={false}
                  tick={isDark ? Y_TICK_DARK : Y_TICK_LIGHT}
                  domain={Y_AXIS_DOMAIN as unknown as [string, string]}
                />
                <Tooltip
                  cursor={false}
                  separator=""
                  contentStyle={isDark ? TOOLTIP_STYLE_DARK : TOOLTIP_STYLE_LIGHT}
                  itemStyle={itemStyle}
                  formatter={formatter}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fillOpacity={1}
                  fill={`url(#${gradId})`}
                  // El área solo pinta el degradado bajo la línea: sin esto el tooltip
                  // repetiría el valor una vez por serie.
                  tooltipType="none"
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={config.color}
                  strokeWidth={2.25}
                  dot={renderDot}
                  activeDot={activeDot}
                  fill="none"
                  isAnimationActive={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </Card>
    </motion.div>
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

/** Torneo a destacar en el dashboard: más participantes; empate → más reciente. */
function pickFeaturedChallenge(list: Challenge[]): Challenge | undefined {
  if (list.length === 0) return undefined;
  return [...list].sort((a, b) => {
    const byCount = b.participants.length - a.participants.length;
    if (byCount !== 0) return byCount;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  })[0];
}

export interface DashboardProps {
  user: User;
  /** Historial de `save-period` solo de la rutina activa (progresión por rutina, no global). */
  history: HistoryEntry[];
  rms: RMData;
  /** TM de la rutina activa; al cambiar de rutina cambian gráficos y referencias. */
  trainingMaxes: TrainingMax[];
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
  onOpenSocial: (tab?: 'friends' | 'challenges' | 'checkins', options?: { openCheckInModal?: boolean }) => void;
  onJoinFriendCheckIn: (checkIn: GymCheckIn) => void;
  /** Se incrementa al volver a Progreso desde otra pestaña; fuerza remount de gráficos y replay de animación. */
  chartEnterKey?: number;
}

type ProgressMode = 'week' | 'year';

const MONTH_LABELS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatRoutineAggregate(
  value: number | null,
  kind: RoutineProgressKind,
  unit: string
): string {
  if (value == null) return '—';
  const v = kind === 'mixed' ? Math.round(value * 100) / 100 : Math.round(value);
  if (!unit) return String(v);
  return `${v} ${unit}`;
}

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
  onOpenSocial,
  onJoinFriendCheckIn,
  progressCheckpointAt,
  progressCheckpointTms,
  chartEnterKey = 0,
}) => {
  const mountedAt = useMemo(() => new Date(), []);
  const currentYear = mountedAt.getFullYear();
  const currentMonth = mountedAt.getMonth();

  const sessionStats = useMemo(
    () => computeSessionStats(routineWeeks, routineLogs, currentYear),
    [routineWeeks, routineLogs, currentYear]
  );

  /** Replay de la entrada escalonada cada vez que se vuelve a Progreso (sin remontar la vista). */
  const enterControls = useAnimationControls();
  useEffect(() => {
    enterControls.set('hidden');
    void enterControls.start('show');
  }, [chartEnterKey, enterControls]);

  const [selectedCheckIn, setSelectedCheckIn] = useState<GymCheckIn | null>(null);
  const [progressMode, setProgressMode] = useState<ProgressMode>(() => user.progressMode === 'year' ? 'year' : 'week');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);

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
  /** Snapshot de referencia para % de mejora (checkpoint) o el primero del historial. */
  const baselineEntryForGains = useMemo(() => {
    if (!history.length) return undefined;
    return history[0];
  }, [history]);

  const routineStart = useMemo(
    () => computeRoutineStartDate(routineCreatedAtProp, history),
    [routineCreatedAtProp, history]
  );
  const routineStartMs = routineStart.getTime();

  /** Cómo se agrega el progreso de esta rutina (kg / reps / s / índice mixto). */
  const routineProgressMeta = useMemo(
    () => computeRoutineProgressTotal(trainingMaxes),
    [trainingMaxes]
  );

  const displayRoutineProgress = routineProgressMeta.value;

  /**
   * Ganancia: checkpoint TMs (si existe) o primer historial vs TM vivos.
   * progressCheckpointTms es bullet-proof: se guarda al pulsar la bandera y no depende del historial.
   */
  const { totalGain, totalGainPct } = useMemo(() => {
    const currentTotal = routineProgressMeta.value;
    const kind = routineProgressMeta.kind;
    let base: number;
    if (progressCheckpointTms && Object.keys(progressCheckpointTms).length > 0) {
      const tmsAtCp = trainingMaxes.map((tm) => ({
        ...tm,
        value: progressCheckpointTms[tm.id] ?? tm.value,
      }));
      base = computeRoutineProgressTotal(tmsAtCp).value;
    } else if (baselineEntryForGains) {
      base = progressValueFromHistoryEntry(baselineEntryForGains, trainingMaxes);
    } else {
      return { totalGain: 0, totalGainPct: 0 };
    }
    const gain = currentTotal - base;
    if (isEffectivelyZeroDelta(gain, kind)) {
      return { totalGain: 0, totalGainPct: 0 };
    }
    const pct = base > 0 ? Math.round((gain / base) * 100) : 0;
    return { totalGain: gain, totalGainPct: pct };
  }, [baselineEntryForGains, trainingMaxes, routineProgressMeta.value, routineProgressMeta.kind, progressCheckpointTms]);

  /** Variación del agregado de la rutina (misma unidad que `routineProgressMeta`), en ambas variantes. */
  const mainStatDisplay = useMemo(() => {
    const u = routineProgressMeta.unit;
    const flat = isEffectivelyZeroDelta(totalGain, routineProgressMeta.kind);
    const abs =
      routineProgressMeta.kind === 'mixed'
        ? Math.round(totalGain * 100) / 100
        : Math.round(totalGain);
    return {
      abs: {
        value: `${abs > 0 ? '+' : ''}${abs} ${u}`.trim(),
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
    const hasCpTms = progressCheckpointTms && Object.keys(progressCheckpointTms).length > 0;
    // Un solo recorrido del historial en vez de un `find` por cada TM.
    const firstByTmId = new Map<string, number>();
    if (!hasCpTms) {
      for (const h of history) {
        if (h.trainingMaxes == null) continue;
        for (const [tmId, val] of Object.entries(h.trainingMaxes)) {
          if (val != null && !firstByTmId.has(tmId)) firstByTmId.set(tmId, val);
        }
      }
    }
    trainingMaxes.forEach(tm => {
      const unit = tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
      const firstVal = hasCpTms ? progressCheckpointTms![tm.id] : firstByTmId.get(tm.id);
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
  }, [history, trainingMaxes, progressCheckpointTms]);

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
      const creatorId = c.createdBy?.id;
      if (!creatorId || creatorId === user.id) return false;
      return true;
    });
  }, [challenges, user.id]);

  const featuredFriendTournament = useMemo(
    () => pickFeaturedChallenge(friendTournamentsToJoin),
    [friendTournamentsToJoin]
  );

  const featuredJoinedChallenge = useMemo(
    () => pickFeaturedChallenge(joinedChallenges),
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

  const getTMConfig = useCallback(
    (name: string) => tmConfigFor(name, !!user.mbMode),
    [user.mbMode]
  );

  const isDarkTheme = user.theme === 'dark';
  const routineMainStroke = user.mbMode
    ? isDarkTheme
      ? '#f9a8d4'
      : '#ec4899'
    : isDarkTheme
      ? '#818cf8'
      : '#6366f1';
  const routineMainGradTop = routineMainStroke;
  const mainTooltipItemStyle = useMemo(() => ({ color: routineMainStroke }), [routineMainStroke]);
  const mainActiveDot = useMemo(
    () => ({ r: 5, fill: routineMainStroke, stroke: isDarkTheme ? '#1e293b' : '#fff', strokeWidth: 2 }),
    [routineMainStroke, isDarkTheme]
  );
  const mainTooltipFormatter = useCallback(
    (value: number | null): [string, string] => [
      formatRoutineAggregate(value, routineProgressMeta.kind, routineProgressMeta.unit),
      '',
    ],
    [routineProgressMeta.kind, routineProgressMeta.unit]
  );
  const mainLineDot = useCallback(
    (dotProps: { cx?: number; cy?: number; payload?: { total?: number | null } }) => {
      const v = dotProps.payload?.total;
      if (v == null || Number.isNaN(v)) return null;
      const { cx, cy } = dotProps;
      if (cx == null || cy == null) return null;
      return <circle cx={cx} cy={cy} r={3} fill={routineMainStroke} stroke="none" />;
    },
    [routineMainStroke]
  );

  const cl = Math.max(1, cycleLengthProp);

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
    const currentTotal = computeRoutineProgressTotal(trainingMaxes).value;
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
        if (lastBefore && trainingMaxes.length > 0) {
          carryTotal = progressValueFromHistoryEntry(lastBefore.source, trainingMaxes);
        } else if (trainingMaxes.length > 0) {
          carryTotal = 0;
        }

        return Array.from({ length: weeksInMonth }, (_, i) => {
          const week = i + 1;
          const point = latestByWeek.get(week);
          const isCurrentSlot = isCurrentMonth && week === currentWeekSlotInMonth;
          if (point?.source) carryTotal = progressValueFromHistoryEntry(point.source, trainingMaxes);
          if (isCurrentSlot) carryTotal = currentTotal;
          const isFuture = isCurrentMonth && week > currentWeekSlotInMonth;
          const preRoutine = weekSlotEndsBeforeRoutine(selectedYear, selectedMonth, week, rs);
          let total: number | null = isFuture ? null : preRoutine ? 0 : carryTotal;
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
      if (lastBeforeCycle && trainingMaxes.length > 0) {
        carryTotalBlock = progressValueFromHistoryEntry(lastBeforeCycle.source, trainingMaxes);
      } else if (trainingMaxes.length > 0) {
        carryTotalBlock = 0;
      }

      return Array.from({ length: cl }, (_, i) => {
        const slot = i + 1;
        const point = latestBySlot.get(slot);
        const pw = cycleStartWeek + slot - 1;
        const isCurrentSlot = refYear === cyNow && pw === cwToday;
        if (point?.source) carryTotalBlock = progressValueFromHistoryEntry(point.source, trainingMaxes);
        if (isCurrentSlot) carryTotalBlock = currentTotal;
        const isFuture = refYear > cyNow || (refYear === cyNow && pw > cwToday);
        const preRoutine = blockSlotEndsBeforeRoutine(pw, refYear, rs);
        let total: number | null = isFuture ? null : preRoutine ? 0 : carryTotalBlock;
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
    if (lastBeforeYear && trainingMaxes.length > 0) {
      carryTotal = progressValueFromHistoryEntry(lastBeforeYear.source, trainingMaxes);
    } else if (trainingMaxes.length > 0) {
      carryTotal = 0;
    }
    return Array.from({ length: 12 }, (_, month) => {
      const point = latestByMonth.get(month);
      const isCurrentSlot = selectedYear === cy && month === cm;
      if (point?.source) carryTotal = progressValueFromHistoryEntry(point.source, trainingMaxes);
      if (isCurrentSlot) carryTotal = currentTotal;
      const isFuture = isCurrentYear && month > cm;
      const preRoutine = monthEntirelyBeforeRoutine(selectedYear, month, rs);
      let total: number | null = isFuture ? null : preRoutine ? 0 : carryTotal;
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
    trainingMaxes,
    sameTemplateAllWeeksProp,
    cl,
    blockCycleParams,
    routineStart,
    routineStartMs,
  ]);

  const mainChartData = useMemo(() => chartContext.map(p => ({ date: p.label, total: p.total })), [chartContext]);
  const mainChartDisplayData = useMemo(() => withZeroStart(mainChartData, 'total'), [mainChartData]);

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
          carryValue = vBefore != null ? vBefore : useCurrent ? tm.value : 0;
        } else {
          const { refYear: refY, cycleStartWeek: csw } = blockCycleParams;
          const lastBefore = [...parsedHistory].reverse().find(item => {
            if (item.date.getTime() < routineStartMs) return false;
            return item.year < refY || (item.year === refY && item.planWeek < csw);
          });
          const vBefore = lastBefore?.source.trainingMaxes?.[tm.id];
          carryValue = vBefore != null ? vBefore : tm.value;
        }
      } else {
        const lastBefore = [...parsedHistory].reverse().find(item => {
          if (item.date.getTime() < routineStartMs) return false;
          return item.year < selectedYear;
        });
        const vBefore = lastBefore?.source.trainingMaxes?.[tm.id];
        carryValue = vBefore != null ? vBefore : (selectedYear === cy ? tm.value : 0);
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
            return { date: point.label, value: 0 };
          }
        }
        if (progressMode === 'week' && !sameTemplateAllWeeksProp && slotNum != null) {
          const { refYear: refY, cycleStartWeek: csw } = blockCycleParams;
          const pw = csw + slotNum - 1;
          if (blockSlotEndsBeforeRoutine(pw, refY, routineStart)) {
            return { date: point.label, value: 0 };
          }
        }
        if (progressMode === 'year' && monthNum != null) {
          if (monthEntirelyBeforeRoutine(selectedYear, monthNum, routineStart)) {
            return { date: point.label, value: 0 };
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

  return (
    <motion.div 
      variants={ENTER_ROOT}
      initial="hidden"
      animate={enterControls}
      exit="exit"
      className="max-w-5xl mx-auto mt-2 max-[400px]:mt-2 sm:mt-4 md:mt-8 mb-6 sm:mb-10 md:mb-12 px-3 max-[360px]:px-2 sm:px-5 md:px-6 py-5 max-[360px]:py-4 sm:py-8 md:py-10 pb-32 max-[360px]:pb-28 sm:pb-40 md:pb-44 rounded-2xl max-[400px]:rounded-xl sm:rounded-[2rem] bg-[var(--app-bg)]"
    >
      <motion.header variants={ENTER_ITEM} className="mb-3 max-[400px]:mb-2 flex items-center justify-between gap-2 max-[360px]:gap-1">
        <div className="flex items-center gap-2 max-[360px]:gap-1.5 min-w-0">
          <Avatar 
            src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}`}
            name={user.name}
            className="w-10 max-[360px]:w-9 h-10 max-[360px]:h-9 sm:w-12 sm:h-12 rounded-full border-2 border-slate-100 dark:border-slate-700 shadow-lg flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 dark:text-white truncate">Hola, {(user.name || 'Atleta').split(' ')[0]}</p>
            <p className="text-xs text-slate-500">Tus marcas y quién entrena hoy</p>
          </div>
        </div>
        <ProgressModeSwitch mode={progressMode} onChange={handleProgressModeChange} />
      </motion.header>

      {(progressMode === 'year' || progressMode === 'week') && (
        <motion.div variants={ENTER_ITEM} className="mb-4 max-[400px]:mb-3 flex justify-end gap-1.5 max-[360px]:gap-1 flex-wrap">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-7 max-[360px]:h-6 sm:h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 max-[360px]:px-1.5 text-[11px] max-[360px]:text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
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
              className="h-7 max-[360px]:h-6 sm:h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 max-[360px]:px-1.5 text-[11px] max-[360px]:text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {MONTH_LABELS_SHORT.map((month, idx) => (
                <option key={month} value={idx}>{month}</option>
              ))}
            </select>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-[360px]:gap-2 sm:gap-4 md:gap-6 mb-6 max-[400px]:mb-5 sm:mb-8 md:mb-10">
        {/* Main Stat Card - Progreso total */}
        <motion.div variants={ENTER_ITEM} className="md:col-span-3">
        <Card padding="md" rounded="xl" className="relative overflow-hidden border border-slate-100 dark:border-slate-700/60 group hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 p-4 max-[360px]:p-3">
          <div className="flex justify-between items-center mb-2 max-[360px]:mb-1.5">
            <div className={cn("p-2.5 max-[360px]:p-2 rounded-xl max-[360px]:rounded-lg sm:rounded-2xl", "bg-indigo-50 dark:bg-indigo-950/50")}>
              <TrendingUp size={18} className="max-[360px]:size-4 sm:size-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-right">
              <div
                className="text-xl max-[360px]:text-lg sm:text-2xl font-black text-slate-900 dark:text-white"
                title={`${routineProgressMeta.label}: ${routineProgressMeta.description}`}
              >
                <CountUpNumber
                  value={displayRoutineProgress}
                  decimals={routineProgressMeta.kind === 'mixed' ? 2 : 0}
                  replayKey={chartEnterKey}
                />
                {routineProgressMeta.unit ? (
                  <span className="text-[10px] max-[360px]:text-[9px] sm:text-xs text-slate-400 dark:text-slate-500 ml-1">
                    {routineProgressMeta.unit}
                  </span>
                ) : null}
              </div>
              <AlternatingStat
                abs={mainStatDisplay.abs}
                pct={mainStatDisplay.pct}
                prefix="En esta rutina: "
                className="text-xs sm:text-sm font-bold block mt-0.5"
              />
            </div>
          </div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5 text-sm sm:text-base">
            Cómo vas
          </h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3 truncate" title={activeRoutineName}>
            {activeRoutineName}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeRoutineName}-${progressMode}-${sameTemplateAllWeeksProp}-${cl}-${selectedYear}-${selectedMonth}-${cwoyProp}-${chartEnterKey}`}
              initial={CHART_ENTER_INITIAL}
              animate={CHART_ENTER_ANIMATE}
              exit={CHART_ENTER_EXIT}
              transition={CHART_ENTER_TRANSITION}
              className="relative h-[168px] max-[360px]:h-[148px] sm:h-[188px] md:h-[210px] w-full -mx-1 sm:-mx-2 outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onPointerMoveCapture={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                style={{ touchAction: 'pan-x pan-y', WebkitTapHighlightColor: 'transparent', outline: 'none' }}
              >
                <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mainChartDisplayData} margin={CHART_MARGIN}>
                  <defs>
                    <linearGradient id="colorTotalLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={routineMainGradTop} stopOpacity={0.4}/>
                      <stop offset="100%" stopColor={routineMainGradTop} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTotalDark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={routineMainGradTop} stopOpacity={0.36}/>
                      <stop offset="100%" stopColor={routineMainGradTop} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={isDarkTheme ? GRID_STROKE_DARK : GRID_STROKE_LIGHT} />
                  <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={22} axisLine={false} tickLine={false} tick={isDarkTheme ? X_TICK_DARK : X_TICK_LIGHT} />
                  <YAxis
                    width={32}
                    axisLine={false}
                    tickLine={false}
                    tick={isDarkTheme ? Y_TICK_DARK : Y_TICK_LIGHT}
                    domain={Y_AXIS_DOMAIN as unknown as [string, string]}
                  />
                  <Tooltip 
                    cursor={false}
                    separator=""
                    contentStyle={isDarkTheme ? TOOLTIP_STYLE_DARK : TOOLTIP_STYLE_LIGHT}
                    itemStyle={mainTooltipItemStyle}
                    formatter={mainTooltipFormatter}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="none"
                    fillOpacity={1}
                    fill={`url(#colorTotal${user.theme === 'dark' ? 'Dark' : 'Light'})`}
                    tooltipType="none"
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={routineMainStroke}
                    strokeWidth={2.25}
                    dot={mainLineDot}
                    activeDot={mainActiveDot}
                    fill="none"
                    isAnimationActive={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </motion.div>
          </AnimatePresence>
        </Card>
        </motion.div>

        {/* Individual Progress Cards - TODOS los TMs */}
        {trainingMaxes.map(tm => (
          <TmProgressCard
            key={`${tm.id}-${chartEnterKey}`}
            tm={tm}
            config={getTMConfig(tm.name)}
            chartData={tmChartDataById[tm.id] ?? [{ date: 'Inicio', value: tm.value }]}
            stat={tmStatDisplay[tm.id]}
            isDark={isDarkTheme}
            chartKey={`${tm.id}-${activeRoutineName}-${progressMode}-${sameTemplateAllWeeksProp}-${cl}-${selectedYear}-${selectedMonth}-${cwoyProp}-${chartEnterKey}`}
          />
        ))}
      </div>

      {/* Métricas calculadas desde las series registradas (no desde los TM) */}
      <motion.div variants={ENTER_ITEM} className="mb-6 max-[400px]:mb-5 sm:mb-8 md:mb-10">
        <StrengthInsights stats={sessionStats} isDark={isDarkTheme} enterKey={chartEnterKey} />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-[400px]:gap-3 sm:gap-6 md:gap-8 mb-6 max-[400px]:mb-5 sm:mb-8 md:mb-10">
        {/* Joined Challenges Section */}
        <motion.section variants={ENTER_ITEM}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Trophy size={18} className="text-amber-500 flex-shrink-0" />
              Torneos
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenSocial('challenges')} className="text-indigo-600 text-xs font-bold">
              Ver todos
            </Button>
          </div>

          {featuredFriendTournament && (
            <Card padding="md" rounded="2xl" className="mb-4 border-amber-200/80 dark:border-amber-700/50 bg-amber-50/40 dark:bg-amber-950/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300 mb-2">
                Tus amigos — únete
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                Destacamos el torneo con más participantes (si empatan, el más reciente). El resto en Comunidad.
              </p>
              <button
                type="button"
                onClick={() => onOpenSocial('challenges')}
                className="w-full text-left flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-white/80 dark:bg-slate-950/80 border border-amber-100 dark:border-amber-900/40 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm">{featuredFriendTournament.title}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Por {featuredFriendTournament.createdBy?.name ?? 'Amigo'} · {featuredFriendTournament.exercise}
                  </p>
                  <p className="text-[10px] text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                    {featuredFriendTournament.participants.length} {featuredFriendTournament.participants.length === 1 ? 'persona unida' : 'personas unidas'}
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 flex-shrink-0">Unirse</span>
              </button>
            </Card>
          )}
          
          <div className="space-y-4">
            {featuredJoinedChallenge ? (
              (() => {
                const challenge = featuredJoinedChallenge;
                const usePts = challenge.usePointsSystem !== false;
                const sorted = [...challenge.participants].sort((a, b) => {
                  if (!usePts) return b.value - a.value;
                  return b.score - a.score;
                });
                const myRank = sorted.findIndex(p => p.userId === user.id) + 1;
                return (
                  <Card key={challenge.id} padding="md" rounded="2xl" className="hover:border-indigo-200 dark:hover:border-indigo-700/50 transition-colors cursor-pointer" onClick={() => onOpenSocial('challenges')}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex -space-x-2 flex-shrink-0">
                          {sorted.slice(0, 4).map((p) => (
                            <Avatar key={p.userId} src={p.avatar} name={p.name} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900" />
                          ))}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{challenge.title}</h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{challenge.exercise}</p>
                          {joinedChallenges.length > 1 && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Tu torneo con más movimiento · Ver más en Comunidad</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-xs font-black text-slate-400 dark:text-slate-500">Puesto</span>
                          <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">#{myRank}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">de {challenge.participants.length} atletas</p>
                      </div>
                    </div>
                  </Card>
                );
              })()
            ) : !featuredFriendTournament ? (
              <Card padding="md" className="text-center border-dashed border-2 border-slate-200 dark:border-slate-600 bg-transparent">
                <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">No te has unido a ningún torneo aún</p>
                <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => onOpenSocial('challenges')}>Explorar</Button>
              </Card>
            ) : null}
          </div>
        </motion.section>

        {/* Today's Gym Check-ins */}
        <motion.section variants={ENTER_ITEM}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Bell size={18} className="text-slate-600 dark:text-slate-300 flex-shrink-0" />
              Hoy en el gym
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenSocial('checkins')} className="text-indigo-600 text-xs font-bold">
              Ver feed
            </Button>
          </div>

          <div className="space-y-4">
            {todayCheckInGroups.length === 0 ? (
              <Card padding="md" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                <p className="text-slate-400 text-sm font-medium">Nadie ha avisado hoy todavía</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 rounded-xl"
                  onClick={() => onOpenSocial('checkins', { openCheckInModal: true })}
                >
                  Avisar yo
                </Button>
              </Card>
            ) : (
              todayCheckInGroups.map(group => {
                const representative = group[0];
                const hasMe = group.some(ci => ci.userId === user.id);
                const others = group.filter(ci => ci.userId !== user.id);
                const avatars = hasMe ? [user, ...others] : group;
                return (
                <div key={`${representative.gymName}-${representative.time}`} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {avatars.slice(0, 3).map((ci, idx) => (
                        <Avatar
                          key={`${(ci as any).userId || (ci as any).id || idx}-${idx}`}
                          src={(ci as any).avatar}
                          name={(ci as any).name || (ci as any).userName}
                          className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-900 flex-shrink-0"
                        />
                      ))}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {group.length > 1 ? `${group.length} atletas` : representative.userName}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest">{representative.gymName}</span>
                        <span className="text-[10px] font-medium text-slate-400">• {representative.time}</span>
                      </div>
                    </div>
                  </div>
                  {hasMe ? (
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Tú</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-indigo-200 text-indigo-600"
                      onClick={() => setSelectedCheckIn(representative)}
                    >
                      <MapPin size={16} className="mr-1" />
                      Me uno
                    </Button>
                  )}
                </div>
              )})
            )}
          </div>
        </motion.section>
      </div>

      {selectedCheckIn && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 min-h-[100dvh]" style={{ zIndex: 100000 }}>
          <div
            className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            onClick={() => setSelectedCheckIn(null)}
          />
          <Card padding="lg" rounded="2xl" className="relative w-full max-w-sm z-10">
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-2">Vas a ir a la misma hora?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Se enviará una notificación a {selectedCheckIn.userName} indicando que vas a
              las {selectedCheckIn.time} en {selectedCheckIn.gymName}.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedCheckIn(null)}>
                No
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  onJoinFriendCheckIn(selectedCheckIn);
                  setSelectedCheckIn(null);
                }}
              >
                Si
              </Button>
            </div>
          </Card>
        </div>,
        document.body
      )}

    </motion.div>
  );
};

/** Memoizado: App re-renderiza con cada refresco social/TM y aquí eso repinta gráficos. */
export const DashboardView = React.memo(DashboardViewInner);
