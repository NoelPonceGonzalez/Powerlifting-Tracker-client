import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import * as XLSX from 'xlsx';
import { LayoutDashboard, Dumbbell, Users, Settings } from 'lucide-react';

// Views
import { LoginView } from '@/src/views/Login';
import { DashboardView } from '@/src/views/Dashboard';
import { TrainingPlanView } from '@/src/views/TrainingPlan';
import { RoutineManagerView } from '@/src/views/RoutineManager';
import { SocialView } from '@/src/views/Social';
import { SettingsView } from '@/src/views/Settings';

// Components
import { ToastContainer } from '@/src/components/ui/Toast';
import { useToast } from '@/src/hooks/useToast';

// Types
import { 
  RMData, 
  LogEntry, 
  HistoryEntry, 
  ViewType, 
  Exercise, 
  ExerciseMode,
  TrainingMax, 
  TrainingWeek,
  TrainingDay,
  PlannedExercise,
  RoutineVersion,
  FriendRequest,
  Friend,
  User,
  Challenge,
  BodyWeightScoringMode,
  GymCheckIn,
  SetLog,
  InternalExerciseMax,
  getInternalValueForMode,
  DayType
} from '@/src/types';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete, getApiBaseUrl } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import { computeRoutineProgressTotal } from '@/src/lib/routineProgressTotal';
import {
  calendarMonth1FromDateISO,
  dateISOFromYearWeekDay,
  dateISOToUtcNoonISO,
  entryDateISO,
} from '@/src/lib/calendarWeekDate';
import { buildBaselineHistoryEntry, TM_BASELINE_DATE_ISO } from '@/src/lib/historyTm';
import { serializeLogEntryForMongo } from '@/src/lib/routineLogs';
import {
  getLogEntryForExercise,
  parseRoutineLogKeyLoose,
  resolveExerciseNameFromRoutineLogKey,
  resolveLogEntryForMerge,
  routineLogKeyFromIds,
  stripLegacyLogKeysForCanonical,
  purgeAndReindexLogsAfterExerciseRemoval,
} from '@/src/lib/routineLogKey';
import { resolveTmForAutoBump } from '@/src/lib/trainingMaxResolve';
import { getWeekTypeSlot } from '@/src/lib/mesocycleWeek';
import {
  expandRoutineFromApi,
  deriveBaseTemplateFromWeeks,
  materialize52WeeksFromFourTemplateWeeks,
  normalizeTemplateWeek,
} from '@/src/lib/planMaterialize';
import { cloneFriendRoutineWeeks, DEFAULT_TM_SEED_ZERO } from '@/src/lib/cloneFriendRoutine';
import { buildPlanPatchPayload } from '@/src/lib/planSyncPayload';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import {
  loadSavedAccounts,
  upsertAccount,
  removeAccount,
  setActiveAccountId,
  migrateLegacyIfNeeded,
  toSummaries,
  type SavedAccount,
} from '@/src/lib/savedAccounts';

// --- Constants & Mock Data ---
const INITIAL_USER: User = {
  id: 'u-1',
  name: 'Noel Ponce',
  email: 'noel.ponce.gonzalez@gmail.com',
  avatar: 'https://picsum.photos/seed/noel/200/200',
  bodyWeight: 80,
  theme: 'light'
};

const INITIAL_CHALLENGES: Challenge[] = [];

const INITIAL_CHECKINS: GymCheckIn[] = [];

// --- Constants & Mock Data ---
const INITIAL_RMS: RMData = {
  bench: 110,
  squat: 140,
  deadlift: 190
};

const EXERCISES: readonly Exercise[] = [
  { key: 'bench', label: 'Press Banca', color: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-600' },
  { key: 'squat', label: 'Sentadilla', color: '#10b981', bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-600' },
  { key: 'deadlift', label: 'Peso Muerto', color: '#f43f5e', bg: 'bg-rose-50', border: 'border-rose-500', text: 'text-rose-600' }
] as const;

const INITIAL_TMS: TrainingMax[] = [
  { id: 'tm-1', name: 'Press Banca', value: 110, mode: 'weight', linkedExercise: 'bench' },
  { id: 'tm-2', name: 'Sentadilla', value: 140, mode: 'weight', linkedExercise: 'squat' },
  { id: 'tm-3', name: 'Peso Muerto', value: 190, mode: 'weight', linkedExercise: 'deadlift' },
  { id: 'tm-4', name: 'Dominadas', value: 15, mode: 'reps' },
  { id: 'tm-5', name: 'Plancha', value: 60, mode: 'seconds' },
];

/** Si el GET de TMs llega tarde, no pisa un TM ya subido al registrar series en el plan. */
function mergeTrainingMaxesFromServer(prev: TrainingMax[], server: TrainingMax[]): TrainingMax[] {
  if (!server.length) return prev;
  if (!prev.length) return server;
  return server.map(tm => {
    const p = prev.find(x => x.id === tm.id);
    if (p && p.value > tm.value) return { ...tm, value: p.value };
    return tm;
  });
}

const generateWeeks = (): TrainingWeek[] => {
  const weeks: TrainingWeek[] = [];
  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  
  for (let i = 1; i <= 52; i++) {
    weeks.push({
      id: `w${i}`,
      number: i,
      days: dayNames.map((name, dIdx) => ({
        id: `w${i}-d${dIdx}`,
        name,
        type: (dIdx === 0 || dIdx === 2 || dIdx === 4) ? 'workout' : 'rest',
        exercises: dIdx === 0 ? [
          { id: `w${i}-d${dIdx}-e1`, name: 'Press Banca', sets: 3, reps: 5, pct: 65 + (i % 4) * 5, mode: 'weight', linkedTo: 'tm-1' },
          { id: `w${i}-d${dIdx}-e2`, name: 'Press Militar', sets: 3, reps: 10, mode: 'weight' },
        ] : dIdx === 2 ? [
          { id: `w${i}-d${dIdx}-e3`, name: 'Sentadilla', sets: 3, reps: 5, pct: 65 + (i % 4) * 5, mode: 'weight', linkedTo: 'tm-2' },
        ] : dIdx === 4 ? [
          { id: `w${i}-d${dIdx}-e4`, name: 'Peso Muerto', sets: 3, reps: 5, pct: 65 + (i % 4) * 5, mode: 'weight', linkedTo: 'tm-3' },
        ] : []
      }))
    });
  }
  return weeks;
};

/** Misma estructura semanal (52 semanas), sin ejercicios — rutinas nuevas creadas por el usuario. */
const generateEmptyWeeks = (): TrainingWeek[] => {
  const weeks: TrainingWeek[] = [];
  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  for (let i = 1; i <= 52; i++) {
    weeks.push({
      id: `w${i}`,
      number: i,
      days: dayNames.map((name, dIdx) => ({
        id: `w${i}-d${dIdx}`,
        name,
        type: (dIdx === 0 || dIdx === 2 || dIdx === 4) ? 'workout' : 'rest',
        exercises: [],
      })),
    });
  }
  return weeks;
};

const INITIAL_WEEKS: TrainingWeek[] = generateWeeks();
const AUTH_USER_STORAGE_KEY = 'auth_user';

const getCurrentWeekOfYear = (date = new Date()): number => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diffDays = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
};

/** Fecha del día visible en Rutina (mes/semana/día), no “hoy” del reloj. */
type PlanViewAnchor = {
  year: number;
  week: number;
  dayOfWeek: number;
  dateISO: string;
};

function buildDefaultPlanViewAnchor(): PlanViewAnchor {
  const now = new Date();
  const y = now.getFullYear();
  const w = getCurrentWeekOfYear(now);
  const dow = (now.getDay() + 6) % 7;
  return {
    year: y,
    week: w,
    dayOfWeek: dow,
    dateISO: dateISOFromYearWeekDay(y, w, dow),
  };
}

function monthLabelFromDateISO(iso: string): string {
  const parts = iso.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return new Date().toLocaleDateString('es-ES', { month: 'short' });
  }
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { month: 'short' });
}

interface RoutinePlan {
  id: string;
  name: string;
  sameTemplateAllWeeks?: boolean;
  hiddenFromSocial?: boolean;
  cycleLength?: number;
  skippedWeeks?: number[];
  weeks: TrainingWeek[];
  versions?: RoutineVersion[];
  baseTemplate?: TrainingWeek[];
  weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
  logs: Record<string, LogEntry>;
}

function materializeRoutineWeeksIfNeeded(routine: RoutinePlan): TrainingWeek[] {
  const rw = routine.weeks;
  if (!rw?.length) return rw;
  if (rw.length >= 52) return rw;
  const cl = routine.cycleLength ?? 4;
  const tpl = rw.length <= cl ? rw : deriveBaseTemplateFromWeeks(rw, cl);
  return materialize52WeeksFromFourTemplateWeeks(tpl.length <= cl ? tpl : deriveBaseTemplateFromWeeks(tpl, cl));
}

function getWeeksAt(routine: RoutinePlan, weekNumber: number): TrainingWeek[] {
  const cl = routine.cycleLength ?? 4;
  const versions = routine.versions;
  if (!versions || versions.length === 0) {
    return materializeRoutineWeeksIfNeeded(routine);
  }
  const applicable = versions.filter(v => v.effectiveFromWeek <= weekNumber);
  if (applicable.length === 0) {
    return materializeRoutineWeeksIfNeeded(routine);
  }
  const best = applicable.reduce((a, b) => a.effectiveFromWeek >= b.effectiveFromWeek ? a : b);
  const w = best.weeks;
  if (!w?.length) return materializeRoutineWeeksIfNeeded(routine);
  if (w.length <= cl) return materialize52WeeksFromFourTemplateWeeks(w);
  if (w.length >= 52) return w;
  return materialize52WeeksFromFourTemplateWeeks(deriveBaseTemplateFromWeeks(w, cl));
}

/** Plan completo a guardar en Mongo: la versión más reciente. No usar `getWeeksAt(..., semanaActual)` aquí: si editas una semana futura, eso devolvía una versión vieja y el PUT pisaba series/reps. */
function getRoutineWeeksForPersistence(routine: RoutinePlan): TrainingWeek[] {
  if (routine.versions?.length) {
    const latest = routine.versions.reduce((a, b) =>
      a.effectiveFromWeek >= b.effectiveFromWeek ? a : b
    );
    return latest.weeks;
  }
  return routine.weeks;
}

/**
 * Semanas para enlazar `logs` con ejercicios al subir TM. Debe cubrir los mismos IDs que el plan visible
 * (`getWeeksAt` para la semana del calendario) y además el array completo en Mongo (`routine.weeks`), si no
 * las claves tipo `template-w4-d0-e1` vs `w14-d0-e1` no coinciden y el TM no sube al registrar series.
 */
function getWeeksForTrainingMaxScan(routine: RoutinePlan): TrainingWeek[] {
  const versionWeeksTpl =
    routine.versions?.length > 0
      ? routine.versions[routine.versions.length - 1].weeks
      : [];
  const rootWeeks = routine.weeks || [];
  const ref = getCurrentWeekOfYear();
  const atCalendarWeek = getWeeksAt(routine, ref);

  const merged = new Map<string, TrainingWeek>();
  const add = (arr: TrainingWeek[]) => {
    arr.forEach((w) => merged.set(w.id, w));
  };

  if (rootWeeks.length > 0) add(rootWeeks);
  add(atCalendarWeek);
  if (rootWeeks.length === 0 && versionWeeksTpl.length > 0) {
    const expanded =
      versionWeeksTpl.length <= 4
        ? materialize52WeeksFromFourTemplateWeeks(versionWeeksTpl)
        : versionWeeksTpl.length >= 52
          ? versionWeeksTpl
          : materialize52WeeksFromFourTemplateWeeks(deriveBaseTemplateFromWeeks(versionWeeksTpl));
    add(expanded);
  }

  return Array.from(merged.values());
}

/** Incluye la semana del log si el merge de plantillas no traía ese `wN` (evita no subir TM al registrar series). */
function getWeeksForTrainingMaxScanWithLog(routine: RoutinePlan, logId: string): TrainingWeek[] {
  const base = getWeeksForTrainingMaxScan(routine);
  const parsed = parseRoutineLogKeyLoose(logId);
  if (!parsed) return base;
  if (base.some((w) => w.number === parsed.planWeek)) return base;
  const extra = getWeeksAt(routine, parsed.planWeek);
  const merged = new Map<string, TrainingWeek>();
  base.forEach((w) => merged.set(w.id, w));
  extra.forEach((w) => merged.set(w.id, w));
  return Array.from(merged.values());
}

/** Acepta clave canónica `w13-d0-e1` (servidor/DB) o legada `w13-w13-d0-w13-d0-e1`. */
function parseLogIdForHistory(logId: string): { weekId: string; dayId: string; exId: string } | null {
  const canon = /^w(\d+)-d(\d+)-e(\d+)$/.exec(logId);
  if (canon) {
    const w = canon[1];
    const d = canon[2];
    const e = canon[3];
    return { weekId: `w${w}`, dayId: `w${w}-d${d}`, exId: `w${w}-d${d}-e${e}` };
  }
  const m = logId.match(/^(.*?)-(.*)-(e\d+)$/);
  if (!m) return null;
  return { weekId: m[1], dayId: m[2], exId: m[3] };
}

/**
 * Año / semana del calendario (1–52) / día (Lun=0) del plan donde cayó el log — alineado con el gráfico y getTMsForView.
 * `calendarWeekRef` = semana que el usuario tiene seleccionada en el plan (viewAsOfWeek ?? semana actual).
 */
function resolveCalendarFromLogId(
  routine: RoutinePlan,
  logId: string,
  calendarWeekRef: number
): { year: number; week: number; dayOfWeek: number } | null {
  const parts = parseLogIdForHistory(logId);
  if (!parts) return null;
  const weeks = getWeeksForTrainingMaxScan(routine);
  const week = weeks.find((w) => w.id === parts.weekId);
  if (!week) return null;
  const dm = parts.dayId.match(/d(\d+)$/i);
  const dayOfWeek = dm ? parseInt(dm[1], 10) : 0;
  const year = new Date().getFullYear();
  /** Rutina con plantilla 1–4 semanas: los logs usan w1…w4 como “slot” del mesociclo, no la semana civil. */
  const rootWeeksLen = routine.weeks?.length ?? 0;
  const isFourWeekTemplateRoutine = rootWeeksLen > 0 && rootWeeksLen <= 4;
  const slotM = /^w(\d+)$/.exec(parts.weekId);
  const slotFromId = slotM ? parseInt(slotM[1], 10) : 0;
  let weekNum = week.number;
  if (isFourWeekTemplateRoutine && slotFromId >= 1 && slotFromId <= 4) {
    weekNum = Math.max(1, Math.min(52, calendarWeekRef));
  }
  return { year, week: weekNum, dayOfWeek };
}

function buildRmsFromLinkedTms(tms: TrainingMax[], base: RMData): RMData {
  const out: RMData = { bench: base.bench, squat: base.squat, deadlift: base.deadlift };
  tms.forEach((tm) => {
    if (tm.linkedExercise) out[tm.linkedExercise] = tm.value;
  });
  return out;
}

/** Copia un día con nuevos IDs para la semana/día destino. Conserva `_dbId` de cada ejercicio del día destino (cada semana tiene su fila en Mongo). */
function copyDayWithNewIds(
  srcDay: { id: string; name: string; type: DayType; exercises: PlannedExercise[] },
  targetWeekId: string,
  targetDayId: string,
  targetDay?: { exercises: PlannedExercise[] }
): { id: string; name: string; type: DayType; exercises: PlannedExercise[] } {
  const targetEx = targetDay?.exercises;
  return {
    id: targetDayId,
    name: srcDay.name,
    type: srcDay.type,
    exercises: srcDay.exercises.map((e, idx) => ({
      ...e,
      id: `${targetWeekId}-${targetDayId}-e${idx + 1}`,
      _dbId: targetEx?.[idx]?._dbId ?? e._dbId,
    })),
  };
}

/** Campos que acepta PATCH /exercises/:id (evita mandar id/_dbId u otros campos del cliente). */
function exercisePatchBodyFromUpdates(updates: Partial<PlannedExercise>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (updates.name !== undefined) out.name = updates.name;
  if (updates.sets !== undefined) out.sets = updates.sets;
  if (updates.reps !== undefined) {
    const r = updates.reps;
    if (typeof r === 'string' && /^\d+$/.test(r.trim())) {
      out.reps = parseInt(r.trim(), 10);
    } else {
      out.reps = r;
    }
  }
  if (updates.pct !== undefined) out.pct = updates.pct;
  if (updates.pctPerSet !== undefined) out.pctPerSet = updates.pctPerSet;
  if (updates.weight !== undefined) out.weight = updates.weight;
  if (updates.mode !== undefined) out.mode = updates.mode;
  if (updates.linkedTo !== undefined) out.linkedTo = updates.linkedTo;
  return out;
}

/** Profundidad de copia de weeks */
function deepCloneWeeks(weeks: TrainingWeek[]): TrainingWeek[] {
  return weeks.map(w => ({
    ...w,
    days: w.days.map(d => ({
      ...d,
      exercises: d.exercises.map(e => ({ ...e })),
    })),
  }));
}

/**
 * Resuelve índices 0..51 en la plantilla anual (w1…w52). Debe usar la misma semana que `getWeeksAt`
 * aunque `routine.weeks` en estado tenga solo 4 semanas plantilla.
 */
function resolveWeekDayIndex(
  routine: RoutinePlan,
  weekId: string,
  dayId: string
): { weekIdx: number; dayIdx: number } | null {
  const base = routine.weeks;
  if (!base.length) return null;

  let calendarWeekNum: number;
  const wMatch = /^w(\d+)$/.exec(weekId);
  if (wMatch) {
    calendarWeekNum = Math.max(1, Math.min(52, parseInt(wMatch[1], 10)));
  } else {
    const byId = base.findIndex((w) => w.id === weekId);
    if (byId < 0) return null;
    calendarWeekNum = base[byId].number ?? byId + 1;
  }

  const weekIdx = calendarWeekNum - 1;
  if (weekIdx < 0 || weekIdx > 51) return null;

  const weeksView = getWeeksAt(routine, calendarWeekNum);
  const wk = weeksView[weekIdx] ?? weeksView.find((w) => w.number === calendarWeekNum);
  if (!wk?.days?.length) return null;

  let dayIdx = wk.days.findIndex((d) => d.id === dayId);
  if (dayIdx < 0) {
    const dm = /-d(\d+)$/.exec(dayId);
    if (dm) dayIdx = parseInt(dm[1], 10);
  }
  if (dayIdx < 0 || dayIdx >= wk.days.length) return null;

  return { weekIdx, dayIdx };
}

type CreateRoutinePlanOptions = { empty?: boolean; sameTemplateAllWeeks?: boolean; cycleLength?: number };

const createRoutinePlan = (id: string, name: string, options?: boolean | CreateRoutinePlanOptions) => {
  const opts: CreateRoutinePlanOptions =
    typeof options === 'boolean' ? { empty: options } : options ?? {};
  const empty = opts.empty ?? false;
  const sameTemplateAllWeeks = opts.sameTemplateAllWeeks !== false;
  const cycleLength = opts.cycleLength ?? 4;
  const weeks = empty ? generateEmptyWeeks() : generateWeeks();
  const tpl = deriveBaseTemplateFromWeeks(weeks, cycleLength);
  return {
    id,
    name,
    sameTemplateAllWeeks,
    hiddenFromSocial: false,
    cycleLength,
    skippedWeeks: [] as number[],
    weeks,
    versions: [{ effectiveFromWeek: 1, weeks: tpl }],
    baseTemplate: tpl,
    weekTypeOverrides: [],
    logs: {},
  };
};

const INITIAL_ROUTINES: RoutinePlan[] = [
  createRoutinePlan('routine-a', 'Rutina A', { empty: true }),
  createRoutinePlan('routine-b', 'Rutina B', { empty: true }),
];

const INITIAL_FRIENDS: FriendRequest[] = [];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [view, setView] = useState<ViewType>('dashboard');
  const toast = useToast();
  
  // State
  const [rms, setRms] = useState<RMData>(INITIAL_RMS);
  const [tms, setTms] = useState<TrainingMax[]>(INITIAL_TMS);
  /** TM inferidos por nombre de ejercicio (sin vínculo a TM de rutina). */
  const [internalExerciseMaxes, setInternalExerciseMaxes] = useState<InternalExerciseMax[]>([]);
  /** Evita cierres obsoletos en handleSetLogChange (varias series antes del siguiente render). */
  const tmsRef = useRef<TrainingMax[]>(tms);
  tmsRef.current = tms;
  const rmsRef = useRef<RMData>(rms);
  rmsRef.current = rms;
  const internalExerciseMaxesRef = useRef<InternalExerciseMax[]>(internalExerciseMaxes);
  internalExerciseMaxesRef.current = internalExerciseMaxes;
  const [routines, setRoutines] = useState<RoutinePlan[]>(INITIAL_ROUTINES);
  const [activeRoutineId, setActiveRoutineId] = useState<string>(INITIAL_ROUTINES[0].id);
  /** Ref para ignorar respuestas de fetch de TM/historial si el usuario ya cambió de rutina. */
  const activeRoutineIdRef = useRef(activeRoutineId);
  activeRoutineIdRef.current = activeRoutineId;
  /** Clave anterior user::routine; el cleanup del efecto la actualiza para detectar solo cambio real de rutina/usuario. */
  const prevRoutineDataKeyRef = useRef('');
  const [programScreen, setProgramScreen] = useState<'plan' | 'routines'>('plan');
  const [viewAsOfWeek, setViewAsOfWeek] = useState<number | null>(null); // null = presente, número = viaje en el tiempo
  const [friends, setFriends] = useState<FriendRequest[]>(INITIAL_FRIENDS);
  const [friendsList, setFriendsList] = useState<Friend[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>(INITIAL_CHALLENGES);
  const [checkIns, setCheckIns] = useState<GymCheckIn[]>(INITIAL_CHECKINS);
  const [socialTab, setSocialTab] = useState<'friends' | 'challenges' | 'checkins'>('friends');
  const [savedAccountsState, setSavedAccountsState] = useState<SavedAccount[]>(() => loadSavedAccounts());
  const [addAccountMode, setAddAccountMode] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  const mapUserFromMePayload = (data: { user: any }): User => {
    const u = data.user;
    return {
      id: String(u._id || u.id),
      name: u.name || 'Atleta',
      email: u.email,
      avatar: u.avatar || 'https://picsum.photos/seed/user/200/200',
      bodyWeight: u.bodyWeight ?? 80,
      theme: (u.theme ||
        (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light')) as 'light' | 'dark',
      progressMode: u.progressMode === 'year' ? 'year' : u.progressMode === 'month' ? 'month' : undefined,
    };
  };

  const [openCheckInModalSignal, setOpenCheckInModalSignal] = useState(0);
  /** Tick that forces social data refresh (friends, requests, check-ins, challenges). */
  const [socialRefreshTick, setSocialRefreshTick] = useState(0);
  const bumpSocialRefresh = useCallback(() => setSocialRefreshTick(t => t + 1), []);
  /** Refetch TM, TM internos e historial (progreso / gráficas) sin cerrar sesión. */
  const [routineDataRefreshTick, setRoutineDataRefreshTick] = useState(0);
  const bumpRoutineDataRefresh = useCallback(() => setRoutineDataRefreshTick(t => t + 1), []);
  const goToSocial = useCallback(
    (tab?: 'friends' | 'challenges' | 'checkins', opts?: { openCheckInModal?: boolean }) => {
      setSocialTab(tab ?? 'friends');
      setView('social');
      if (opts?.openCheckInModal) {
        setOpenCheckInModalSignal((s) => s + 1);
      }
    },
    []
  );

  const getYearAndWeek = (d = new Date()) => ({
    year: d.getFullYear(),
    week: getCurrentWeekOfYear(d),
  });

  /** Año, semana ISO y día (Lun=0 … Dom=6) — para snapshots de TM por día dentro de la semana. */
  const getYearWeekDay = (d = new Date()) => ({
    year: d.getFullYear(),
    week: getCurrentWeekOfYear(d),
    dayOfWeek: (d.getDay() + 6) % 7,
  });

  // Función helper para crear entrada de historial con todos los TMs
  const createHistoryEntry = (
    date: string,
    currentTms: TrainingMax[],
    currentRms: RMData,
    weekYear?: { week: number; year: number; dayOfWeek?: number }
  ): HistoryEntry => {
    const tmValues: Record<string, number> = {};
    currentTms.forEach(tm => {
      tmValues[tm.id] = tm.value;
    });
    const progress = computeRoutineProgressTotal(currentTms);
    const resolved = weekYear ?? getYearWeekDay();
    const dow = typeof resolved.dayOfWeek === 'number' ? resolved.dayOfWeek : 0;
    const dateISO = dateISOFromYearWeekDay(resolved.year, resolved.week, dow);
    return {
      date,
      week: resolved.week,
      year: resolved.year,
      ...(typeof resolved.dayOfWeek === 'number' ? { dayOfWeek: resolved.dayOfWeek } : {}),
      dateISO,
      month: calendarMonth1FromDateISO(dateISO),
      rms: { ...currentRms },
      total: progress.value,
      progressKind: progress.kind,
      trainingMaxes: tmValues
    };
  };

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  historyRef.current = history;
  /** Día/semana visibles en Rutina: TMs manuales deben anclarse aquí, no a `getYearWeekDay()`. */
  const planViewAnchorRef = useRef<PlanViewAnchor>(buildDefaultPlanViewAnchor());
  /** Evita repetir la hidratación de línea base 1970 para la misma rutina. */
  const baselineHydratedForRoutineRef = useRef<string | null>(null);

  usePushNotifications(user?.id ?? null);

  const activeRoutine = useMemo(
    () => routines.find((routine) => routine.id === activeRoutineId) || routines[0],
    [routines, activeRoutineId]
  );
  /** Siempre la rutina activa más reciente: el flush del debounce de sync debe leer esto, no el closure del efecto (evita guardar sin logs nuevos). */
  const routineForSyncRef = useRef<RoutinePlan | null>(null);
  routineForSyncRef.current = activeRoutine ?? null;
  /** Claves de log modificadas por rutina (sync incremental a ExerciseLog en Mongo). */
  const dirtyLogKeysByRoutineRef = useRef<Map<string, Set<string>>>(new Map());
  const planBulkSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Si no hay _dbId en ejercicio/día, el servidor solo recibe cambios vía PATCH /plan. */
  const schedulePlanBulkSync = useCallback(() => {
    if (planBulkSyncTimeoutRef.current) clearTimeout(planBulkSyncTimeoutRef.current);
    planBulkSyncTimeoutRef.current = setTimeout(async () => {
      planBulkSyncTimeoutRef.current = null;
      const r = routineForSyncRef.current;
      if (!r || (r.id.startsWith('routine-') && r.id.length < 20)) return;
      try {
        const body = buildPlanPatchPayload(r);
        const res = await apiPatch<Record<string, unknown>>(`/api/routines/${r.id}/plan`, body);
        const plan = expandRoutineFromApi(res);
        setRoutines((prev) => prev.map((x) => (x.id === plan.id ? plan : x)));
        bumpRoutineDataRefresh();
      } catch (e) {
        console.error('[Routine] Error sync plan (fallback):', e);
      }
    }, 500);
  }, []);

  const markLogDirty = useCallback((routineId: string, logKey: string) => {
    if (routineId.startsWith('routine-') && routineId.length < 20) return;
    let s = dirtyLogKeysByRoutineRef.current.get(routineId);
    if (!s) {
      s = new Set();
      dirtyLogKeysByRoutineRef.current.set(routineId, s);
    }
    s.add(logKey);
  }, []);

  /** PATCH logs a Mongo (WorkoutSession / WorkoutExercise / WorkoutSet). No limpia `dirty` si no hay payload. */
  const syncDirtyLogsForRoutine = useCallback(
    async (routine: RoutinePlan): Promise<boolean> => {
      const routineId = routine.id;
      if (routineId.startsWith('routine-') && routineId.length < 20) return false;
      if (!user) return false;
      const dirty = dirtyLogKeysByRoutineRef.current.get(routineId);
      const keysToSend = dirty && dirty.size > 0 ? [...dirty] : [];
      if (keysToSend.length === 0) return true;
      const logsToPatch: Record<string, LogEntry> = {};
      for (const k of keysToSend) {
        const entry = routine.logs[k];
        if (!entry) continue;
        const exerciseName = resolveExerciseNameFromRoutineLogKey(routine, k);
        logsToPatch[k] = serializeLogEntryForMongo({
          ...entry,
          ...(exerciseName ? { exerciseName } : {}),
        });
      }
      if (Object.keys(logsToPatch).length === 0) {
        console.warn('[Routine] Claves dirty sin entrada en logs; no se limpia la cola:', keysToSend);
        return false;
      }
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        await apiPatch(`/api/routines/${routineId}/logs`, { logs: logsToPatch, dateISO: todayISO });
        dirty?.clear();
        return true;
      } catch (e) {
        console.error('[Routine] Error sincronizando logs:', e);
        return false;
      }
    },
    [user]
  );
  /** Evita guardar historial/TM en Mongo con `routineId` nuevo y `tms` aún de la rutina anterior. */
  const tmsLoadedForRoutineRef = useRef<string | null>(null);
  const tmHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tarjetas TM que acaban de subir desde el registro de series (feedback visual). */
  const [tmAutoHighlightIds, setTmAutoHighlightIds] = useState<string[]>([]);
  /** Incrementa para forzar que el efecto de sync de logs vuelva a ejecutarse con el estado ya committed. */
  const [planSyncTick, setPlanSyncTick] = useState(0);
  /** Recalcula cada render para no quedar congelado en la semana del primer mount. */
  const currentWeekOfYear = getCurrentWeekOfYear(new Date());
  const weeks = useMemo(() => {
    if (!activeRoutine) return [];
    const refWeek = viewAsOfWeek ?? currentWeekOfYear;
    return getWeeksAt(activeRoutine, refWeek);
  }, [activeRoutine, viewAsOfWeek, currentWeekOfYear]);
  const logs = activeRoutine?.logs || {};
  /**
   * `viewAsOfWeek` solo indica qué semana del año materializar en el plan (mes / flechas).
   * No debe activar “solo lectura”: si `isHistoryMode` dependía de `viewAsOfWeek !== null`, al navegar
   * a otra semana desaparecían editar/borrar ejercicios y los handlers quedaban en no-op.
   */
  const isHistoryMode = false;

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const c = entryDateISO(a).localeCompare(entryDateISO(b));
      if (c !== 0) return c;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }, [history]);

  /**
   * Solo si el historial está vacío: línea base con los TM cargados (antes de cualquier PR).
   * Si ya hay filas del servidor, no insertar aquí (evita mezclar TM “actuales” tras subir el máximo en un PR).
   */
  useEffect(() => {
    if (!user?.id || !activeRoutineId) return;
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) return;
    if (tms.length === 0) return;
    setHistory((prev) => {
      if (prev.length > 0) return prev;
      if (prev.some((h) => entryDateISO(h) === TM_BASELINE_DATE_ISO)) return prev;
      const baseline = buildBaselineHistoryEntry(
        activeRoutineId,
        tms,
        buildRmsFromLinkedTms(tms, rms),
        'Origen'
      );
      return [baseline];
    });
  }, [user?.id, activeRoutineId, tms, rms]);

  useEffect(() => {
    baselineHydratedForRoutineRef.current = null;
  }, [activeRoutineId]);

  /**
   * Historial del servidor sin snapshot 1970-01-01: añadir una vez por rutina (TM vigentes hasta el primer cambio con fecha).
   */
  useEffect(() => {
    if (!user?.id || !activeRoutineId) return;
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
    if (tms.length === 0 || history.length === 0) return;
    if (baselineHydratedForRoutineRef.current === activeRoutineId) return;
    if (history.some((h) => entryDateISO(h) === TM_BASELINE_DATE_ISO)) {
      baselineHydratedForRoutineRef.current = activeRoutineId;
      return;
    }
    setHistory((prev) => {
      if (prev.some((h) => entryDateISO(h) === TM_BASELINE_DATE_ISO)) {
        baselineHydratedForRoutineRef.current = activeRoutineId;
        return prev;
      }
      const baseline = buildBaselineHistoryEntry(
        activeRoutineId,
        tms,
        buildRmsFromLinkedTms(tms, rms),
        'Origen'
      );
      baselineHydratedForRoutineRef.current = activeRoutineId;
      return [...prev, baseline].sort((a, b) => {
        const c = entryDateISO(a).localeCompare(entryDateISO(b));
        if (c !== 0) return c;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
    });
  }, [user?.id, activeRoutineId, tms, rms, history]);

  // Al volver a Rutina desde otra vista, resetear a presente
  const prevViewRef = useRef<ViewType>(view);
  useEffect(() => {
    if (prevViewRef.current !== 'program' && view === 'program') {
      setViewAsOfWeek(null);
    }
    prevViewRef.current = view;
  }, [view]);

  // Al volver al plan desde gestor de rutinas, resetear a presente (no al estar ya en plan)
  const prevProgramScreenRef = useRef(programScreen);
  useEffect(() => {
    if (prevProgramScreenRef.current === 'routines' && programScreen === 'plan') {
      setViewAsOfWeek(null);
    }
    prevProgramScreenRef.current = programScreen;
  }, [programScreen]);

  const updateActiveRoutine = (updater: (routine: RoutinePlan) => RoutinePlan) => {
    setRoutines((prev) => prev.map((routine) => (
      routine.id === activeRoutineId ? updater(routine) : routine
    )));
  };

  // Theme logic: usuario logueado usa su preferencia; sin login usa preferencia del sistema
  useEffect(() => {
    const apply = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark);
    };
    if (user) {
      const isDark = user.theme === 'dark' || (user.theme !== 'light' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      apply(isDark);
    } else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches);
      const handler = () => apply(mq.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [user?.id, user?.theme]);

  // Notificar a la capa nativa al iniciar sesión (reinyectar token push en la WebView)
  useEffect(() => {
    if (user?.id && typeof window !== 'undefined' && (window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'user_logged_in', userId: user.id }));
    }
  }, [user?.id]);

  // Si el token ya estaba en window antes del login, disparar registro en API
  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return;
    const w = window as unknown as { __EXPO_PUSH_TOKEN__?: string };
    if (w.__EXPO_PUSH_TOKEN__) {
      queueMicrotask(() => window.dispatchEvent(new Event('expoPushTokenReady')));
    }
  }, [user?.id]);

  // Al pulsar una notificación push: ir a Social (pestaña según `data.tab` del servidor)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const validTabs = ['friends', 'challenges', 'checkins'] as const;
    const handle = (d: { screen?: string; tab?: string }) => {
      if (d?.screen === 'social') {
        const raw = String(d.tab ?? 'checkins');
        const tab = (validTabs as readonly string[]).includes(raw)
          ? (raw as 'friends' | 'challenges' | 'checkins')
          : 'checkins';
        setSocialTab(tab);
        setView('social');
      }
    };
    const onNotificationOpened = (e: CustomEvent<{ screen?: string; tab?: string }>) => handle(e.detail || {});
    window.addEventListener('notificationOpened', onNotificationOpened as EventListener);
    const checkPending = () => {
      const pending = (window as any).__PENDING_NOTIFICATION_OPEN__;
      if (pending) {
        handle(pending);
        delete (window as any).__PENDING_NOTIFICATION_OPEN__;
      }
    };
    checkPending();
    const t = setTimeout(checkPending, 800);
    return () => {
      window.removeEventListener('notificationOpened', onNotificationOpened as EventListener);
      clearTimeout(t);
    };
  }, []);

  // Cargar datos del usuario (routines, TMs, history, checkins) desde DB al hacer login
  useEffect(() => {
    if (!user) return;
    const loadUserData = async () => {
      try {
        const [routinesRes, checkInsRes] = await Promise.all([
          apiGet<any[]>('/api/routines').catch(() => []),
          apiGet<any[]>('/api/checkins').catch(() => []),
        ]);
        // Usuario sin rutinas: una rutina vacía (sin TM ni ejercicios; mismo criterio que "Crear rutina")
        if (!routinesRes?.length) {
          const seedRoutine = createRoutinePlan('seed', 'Mi rutina', { empty: true, sameTemplateAllWeeks: true });
          try {
            const w = getWeeksAt(seedRoutine, currentWeekOfYear);
            const bt =
              seedRoutine.baseTemplate?.length ? seedRoutine.baseTemplate : deriveBaseTemplateFromWeeks(w);
            const created = await apiPost<any>('/api/routines', {
              name: seedRoutine.name,
              versions: [{ effectiveFromWeek: 1, weeks: bt }],
              baseTemplate: bt,
              weekTypeOverrides: seedRoutine.weekTypeOverrides || [],
              sameTemplateAllWeeks: true,
              isActive: true,
            });
            const plan: RoutinePlan = expandRoutineFromApi({
              _id: created._id,
              id: created.id,
              name: created.name,
              sameTemplateAllWeeks: created.sameTemplateAllWeeks,
              hiddenFromSocial: created.hiddenFromSocial,
              cycleLength: created.cycleLength,
              skippedWeeks: created.skippedWeeks,
              weeks: created.weeks,
              versions: created.versions,
              baseTemplate: created.baseTemplate,
              weekTypeOverrides: created.weekTypeOverrides,
              logs: {},
            });
            setRoutines([plan]);
            setActiveRoutineId(plan.id);
          } catch (e) {
            console.error('[App] Error creando rutina seed:', e);
          }
        }
        // Los TM se cargan por rutina activa (efecto dedicado).
        // Rutinas: server → RoutinePlan
        if (routinesRes?.length > 0) {
          const plans: RoutinePlan[] = routinesRes.map((r: any) =>
            expandRoutineFromApi({
              _id: r._id,
              id: r.id,
              name: r.name,
              sameTemplateAllWeeks: r.sameTemplateAllWeeks,
              hiddenFromSocial: r.hiddenFromSocial,
              cycleLength: r.cycleLength,
              skippedWeeks: r.skippedWeeks,
              weeks: r.weeks,
              versions: r.versions,
              baseTemplate: r.baseTemplate,
              weekTypeOverrides: r.weekTypeOverrides,
              logs: r.logs,
            })
          );
          setRoutines(plans);
          const active = routinesRes.find((r: any) => r.isActive);
          if (active) setActiveRoutineId(String(active._id || active.id));
        }
        // Historial: se carga por rutina activa en un efecto dedicado
        // Check-ins
        if (checkInsRes?.length > 0) {
          setCheckIns(checkInsRes.map((c: any) => ({
            id: c.id || String(c._id),
            userId: c.userId,
            userName: c.userName || 'Usuario',
            avatar: c.avatar,
            gymName: c.gymName,
            time: c.time,
            timestamp: c.timestamp,
          })));
        }
      } catch (e) {
        console.error('[App] Error cargando datos:', e);
      }
    };
    loadUserData();
  }, [user?.id]);

  // Training Maxes ligados a la rutina activa (API: GET /api/training-maxes?routineId=…)
  useEffect(() => {
    if (!user?.id) {
      tmsLoadedForRoutineRef.current = null;
      prevRoutineDataKeyRef.current = '';
      return;
    }
    if (!activeRoutineId) return;
    const key = `${user.id}::${activeRoutineId}`;
    const scopeChanged = prevRoutineDataKeyRef.current !== key;

    if (scopeChanged) {
      if (tmHighlightTimerRef.current) {
        clearTimeout(tmHighlightTimerRef.current);
        tmHighlightTimerRef.current = null;
      }
      setTmAutoHighlightIds([]);
    }
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) {
      if (scopeChanged) {
        setTms(INITIAL_TMS);
        setRms({
          bench: INITIAL_TMS[0]?.value ?? 110,
          squat: INITIAL_TMS[1]?.value ?? 140,
          deadlift: INITIAL_TMS[2]?.value ?? 190,
        });
        tmsLoadedForRoutineRef.current = activeRoutineId;
      }
      return () => {
        prevRoutineDataKeyRef.current = key;
      };
    }
    if (scopeChanged) {
      tmsLoadedForRoutineRef.current = null;
      setTms([]);
      setRms({ bench: 0, squat: 0, deadlift: 0 });
    }
    const rid = activeRoutineId;
    let cancelled = false;
    (async () => {
      try {
        const tmsRes = await apiGet<any[]>(`/api/training-maxes?routineId=${encodeURIComponent(rid)}`).catch(() => []);
        if (cancelled) return;
        if (activeRoutineIdRef.current !== rid) return;
        if (!tmsRes?.length) {
          setTms([]);
          setRms({ bench: 0, squat: 0, deadlift: 0 });
          tmsLoadedForRoutineRef.current = rid;
          return;
        }
        const mapped: TrainingMax[] = tmsRes.map((t: any) => ({
          id: String(t._id || t.id),
          name: t.name,
          value: Number(t.value),
          mode: t.mode,
          linkedExercise: t.linkedExercise,
          sharedToSocial: !!t.sharedToSocial,
        }));
        if (activeRoutineIdRef.current !== rid) return;
        setTms(prev => {
          const merged = mergeTrainingMaxesFromServer(prev, mapped);
          const rmsFromTms: RMData = { bench: 0, squat: 0, deadlift: 0 };
          merged.forEach(tm => {
            if (tm.linkedExercise === 'bench' || tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift') {
              rmsFromTms[tm.linkedExercise] = tm.value;
            }
          });
          queueMicrotask(() => setRms(rmsFromTms));
          return merged;
        });
        if (!cancelled && activeRoutineIdRef.current === rid) tmsLoadedForRoutineRef.current = rid;
      } catch (e) {
        console.error('[App] Error cargando TMs de la rutina:', e);
        if (!cancelled && activeRoutineIdRef.current === rid) {
          setTms([]);
          setRms({ bench: 0, squat: 0, deadlift: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
      prevRoutineDataKeyRef.current = key;
    };
  }, [user?.id, activeRoutineId, routineDataRefreshTick]);

  // TM internos por rutina activa (GET ?routineId= — mismos nombres en otra rutina = otros registros)
  useEffect(() => {
    if (!user?.id) {
      setInternalExerciseMaxes([]);
      return;
    }
    if (!activeRoutineId) return;
    const key = `${user.id}::${activeRoutineId}`;
    const scopeChanged = prevRoutineDataKeyRef.current !== key;
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) {
      if (scopeChanged) setInternalExerciseMaxes([]);
      return;
    }
    const rid = activeRoutineId;
    if (scopeChanged) setInternalExerciseMaxes([]);
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiGet<any[]>(`/api/internal-exercise-maxes`, { routineId: rid }).catch(() => []);
        if (cancelled || activeRoutineIdRef.current !== rid) return;
        if (!Array.isArray(rows)) return;
        setInternalExerciseMaxes(
          rows.map((r: any) => ({
            id: String(r._id || r.id),
            name: r.name,
            valueWeight:
              r.valueWeight != null
                ? Number(r.valueWeight)
                : r.value != null
                  ? Number(r.value)
                  : undefined,
            valueReps: r.valueReps != null ? Number(r.valueReps) : undefined,
            valueSeconds: r.valueSeconds != null ? Number(r.valueSeconds) : undefined,
            value: r.value != null ? Number(r.value) : undefined,
          }))
        );
      } catch (e) {
        console.error('[App] Error cargando TM internos:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeRoutineId, routineDataRefreshTick]);

  // Historial de progreso por rutina activa (mismos TM que la rutina)
  useEffect(() => {
    if (!user?.id || !activeRoutineId) return;
    const key = `${user.id}::${activeRoutineId}`;
    const scopeChanged = prevRoutineDataKeyRef.current !== key;
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) {
      if (scopeChanged) {
        const base = INITIAL_TMS;
        const feb = base.map(tm => ({ ...tm, value: tm.value + (tm.linkedExercise === 'bench' ? 2.5 : tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift' ? 5 : 0) }));
        const mar = base.map(tm => ({ ...tm, value: tm.value + (tm.linkedExercise === 'bench' ? 5 : tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift' ? 10 : 0) }));
        setHistory([
          createHistoryEntry('Ene', base, { bench: 100, squat: 130, deadlift: 180 }, { week: 1, year: new Date().getFullYear() }),
          createHistoryEntry('Feb', feb, { bench: 105, squat: 135, deadlift: 185 }, { week: 5, year: new Date().getFullYear() }),
          createHistoryEntry('Mar', mar, { bench: 110, squat: 140, deadlift: 190 }, { week: 10, year: new Date().getFullYear() }),
        ]);
      }
      return;
    }
    if (scopeChanged) setHistory([]);
    const hid = activeRoutineId;
    let cancelled = false;
    (async () => {
      try {
        const historyRes = await apiGet<any[]>(`/api/training-maxes/history?routineId=${encodeURIComponent(hid)}`).catch(() => []);
        if (cancelled || activeRoutineIdRef.current !== hid) return;
        if (!historyRes?.length) return;
        setHistory(
          historyRes.map((h: any) => ({
            date: h.date,
            week: h.week,
            year: h.year,
            dayOfWeek: h.dayOfWeek != null ? Number(h.dayOfWeek) : undefined,
            dateISO: h.dateISO ? String(h.dateISO) : undefined,
            month: h.month != null ? Number(h.month) : undefined,
            rms: h.rms || {},
            total: Number(h.total),
            trainingMaxes: h.trainingMaxes || {},
            progressKind: h.progressKind,
            routineId: h.routineId ? String(h.routineId) : hid,
            createdAt: h.createdAt ? String(h.createdAt) : undefined,
          }))
        );
      } catch (e) {
        console.error('[App] Error cargando historial de la rutina:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeRoutineId, routineDataRefreshTick]);

  // Sincronizar rutina activa a la DB (debounce corto; series/reps disparan flush al salir del campo)
  const routineSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routineSyncFlush = useRef<() => Promise<void> | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  /** Tras editar series/reps: el PUT debe ejecutarse en useEffect (ya committed), no en setTimeout(0) antes del render. */
  const shouldFlushRoutineAfterCommitRef = useRef(false);
  const ROUTINE_SYNC_DEBOUNCE_MS = 500;

  useEffect(() => {
    if (!user || !activeRoutine) {
      shouldFlushRoutineAfterCommitRef.current = false;
      return;
    }
    const routine = routines.find(r => r.id === activeRoutineId);
    if (!routine || (routine.id.startsWith('routine-') && routine.id.length < 20)) {
      shouldFlushRoutineAfterCommitRef.current = false;
      return;
    }
    const doSync = async () => {
      if (syncInFlightRef.current) {
        try { await syncInFlightRef.current; } catch { /* ignore */ }
      }
      const toSync = routineForSyncRef.current;
      if (!toSync || (toSync.id.startsWith('routine-') && toSync.id.length < 20)) {
        routineSyncRef.current = null;
        return;
      }
      const syncPromise = (async () => {
        await syncDirtyLogsForRoutine(toSync);
      })();
      syncInFlightRef.current = syncPromise;
      await syncPromise;
      syncInFlightRef.current = null;
      routineSyncRef.current = null;
    };
    routineSyncFlush.current = doSync;

    if (shouldFlushRoutineAfterCommitRef.current) {
      shouldFlushRoutineAfterCommitRef.current = false;
      void doSync();
      return () => {
        if (routineSyncRef.current) {
          clearTimeout(routineSyncRef.current);
          routineSyncRef.current = null;
        }
      };
    }

    routineSyncRef.current && clearTimeout(routineSyncRef.current);
    routineSyncRef.current = setTimeout(doSync, ROUTINE_SYNC_DEBOUNCE_MS);
    return () => {
      if (routineSyncRef.current) {
        clearTimeout(routineSyncRef.current);
        routineSyncRef.current = null;
      }
    };
  }, [routines, activeRoutineId, user?.id, activeRoutine, planSyncTick, syncDirtyLogsForRoutine]);

  /** Enviar rutina pendiente al salir de la pestaña / cerrar (por si el debounce no ha disparado). */
  useEffect(() => {
    const flushPendingRoutine = () => {
      if (routineSyncRef.current) {
        clearTimeout(routineSyncRef.current);
        routineSyncRef.current = null;
      }
      void routineSyncFlush.current?.();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushPendingRoutine();
    };
    window.addEventListener('pagehide', flushPendingRoutine);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flushPendingRoutine);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Al abrir Progreso, Programa o Comunidad: refresco inmediato (torneos, gyms, amigos, TM, gráficas).
  useEffect(() => {
    if (!user) return;
    if (view === 'dashboard' || view === 'social' || view === 'program') {
      bumpSocialRefresh();
      bumpRoutineDataRefresh();
    }
  }, [view, user?.id, bumpSocialRefresh, bumpRoutineDataRefresh]);

  // Sin polling periódico: solo al volver a primer plano (sincronía con el servidor sin intervalos 12/30 s).
  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        bumpSocialRefresh();
        bumpRoutineDataRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user?.id, bumpSocialRefresh, bumpRoutineDataRefresh]);

  // Amigos y solicitudes: cargar siempre que haya usuario (no solo en Social) para que estén listos al navegar.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadSocial = async () => {
      try {
        const [friendsRes, requestsRes] = await Promise.all([
          apiGet<Friend[]>('/api/social/friends').catch(() => null),
          apiGet<FriendRequest[]>('/api/social/requests').catch(() => null),
        ]);
        if (cancelled) return;
        if (Array.isArray(friendsRes)) {
          setFriendsList(friendsRes.filter((f: { id: string }) => f.id !== user.id));
        }
        if (Array.isArray(requestsRes)) {
          setFriends(requestsRes.map((r: FriendRequest) => ({ ...r, status: r.status ?? 'pending' })));
        }
      } catch {
        /* silently ignore */
      }
    };
    loadSocial();
    return () => { cancelled = true; };
  }, [user?.id, socialRefreshTick]);

  // Check-ins y torneos: cada bumpSocialRefresh trae datos frescos (también en Programa/Ajustes) para que al ir a Progreso/Comunidad ya estén al día.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadData = async () => {
      try {
        const [checkInsRes, challengesRes] = await Promise.all([
          apiGet<any[]>('/api/checkins').catch(() => null),
          apiGet<Challenge[]>('/api/challenges').catch(() => null),
        ]);
        if (cancelled) return;
        if (Array.isArray(checkInsRes)) {
          setCheckIns(checkInsRes.map((c: any) => ({
            id: c.id || String(c._id),
            userId: c.userId,
            userName: c.userName || 'Usuario',
            avatar: c.avatar,
            gymName: c.gymName,
            time: c.time,
            timestamp: c.timestamp,
          })));
        }
        if (Array.isArray(challengesRes)) {
          setChallenges(challengesRes);
        }
      } catch (e) {
        console.error('[App] Error cargando datos:', e);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [user?.id, socialRefreshTick]);

  // Swipe logic
  const x = useMotionValue(0);
  const views: ViewType[] = ['dashboard', 'program', 'social', 'settings'];
  const currentIndex = views.indexOf(view);

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 80;
    if (info.offset.x > threshold && currentIndex > 0) {
      const next = views[currentIndex - 1];
      if (next === 'social') setSocialTab('friends');
      setView(next);
    } else if (info.offset.x < -threshold && currentIndex < views.length - 1) {
      const next = views[currentIndex + 1];
      if (next === 'social') setSocialTab('friends');
      setView(next);
    }
  };

  // Al cambiar de vista (swipe o pestaña), scroll al inicio para que el encabezado quede arriba
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view, programScreen]);

  // Handlers
  const handleUpdateUser = async (updates: Partial<User>) => {
    setUser(prev => (prev ? { ...prev, ...updates } : prev));
    // Persistir en el servidor: theme, name, bodyWeight, avatar, progressMode
    const toSync = ['theme', 'name', 'bodyWeight', 'avatar', 'progressMode'] as const;
    const hasSync = toSync.some(k => k in updates);
    if (hasSync) {
      try {
        const payload: Record<string, unknown> = {};
        toSync.forEach(k => { if (k in updates) payload[k] = updates[k]; });
        await apiPut<{ user: User }>('/api/auth/me', payload);
        bumpRoutineDataRefresh();
        bumpSocialRefresh();
      } catch (e) {
        console.error('[App] Error al guardar preferencias:', e);
      }
    }
  };

  const handleCreateChallenge = async (data: {
    title: string;
    description?: string;
    type: 'max_reps' | 'weight' | 'seconds';
    exercise: string;
    endDate: string;
    usePointsSystem?: boolean;
    bodyWeightScoring?: BodyWeightScoringMode;
  }) => {
    try {
      const created = await apiPost<Challenge>('/api/challenges', data);
      setChallenges(prev => [...prev, created]);
      bumpSocialRefresh();
    } catch (e: any) {
    }
  };

  const handleJoinChallenge = async (id: string, value: number) => {
    try {
      const updated = await apiPut<Challenge>(`/api/challenges/${id}/join`, { value });
      setChallenges(prev => prev.map(c => c.id === id ? updated : c));
      bumpSocialRefresh();
    } catch (e: any) {
    }
  };

  const handleAcceptFriend = async (id: string) => {
    try {
      await apiPut(`/api/social/requests/${id}/accept`, {});
      setFriends(prev => prev.filter(f => f.id !== id));
      const [friendsRes, requestsRes] = await Promise.all([
        apiGet<Friend[]>('/api/social/friends'),
        apiGet<FriendRequest[]>('/api/social/requests'),
      ]);
      setFriendsList((friendsRes || []).filter(f => f.id !== user?.id));
      setFriends(requestsRes.map(r => ({ ...r, status: 'pending' as const })));
      bumpSocialRefresh();
    } catch (e: any) {
    }
  };

  const handleRejectFriend = async (id: string) => {
    try {
      await apiPut(`/api/social/requests/${id}/reject`, {});
      setFriends(prev => prev.filter(f => f.id !== id));
      bumpSocialRefresh();
    } catch (e: any) {
    }
  };

  const handleUnfriend = async (friendId: string) => {
    try {
      await apiDelete(`/api/social/friends/${friendId}`);
      setFriendsList(prev => prev.filter(f => f.id !== friendId));
      bumpSocialRefresh();
    } catch (e: any) {
    }
  };

  const handleSendFriendRequest = async (userId: string): Promise<void> => {
    try {
      await apiPost('/api/social/requests', { userId });
      bumpSocialRefresh();
    } catch (e: any) {
    }
  };

  const refreshChallenges = async () => {
    try {
      const challengesRes = await apiGet<Challenge[]>('/api/challenges');
      setChallenges(challengesRes);
    } catch {
      // ignore
    }
  };

  const upsertLocalDailyCheckIn = (nextCheckIn: GymCheckIn) => {
    const day = new Date(nextCheckIn.timestamp).toDateString();
    setCheckIns(prev => {
      const filtered = prev.filter(ci => !(ci.userId === nextCheckIn.userId && new Date(ci.timestamp).toDateString() === day));
      return [nextCheckIn, ...filtered];
    });
  };

  const handleCheckIn = async (gymName: string, time: string) => {
    if (!user) return;
    const optimisticCheckIn: GymCheckIn = {
      id: `ci-${Math.random().toString(36).substr(2, 5)}`,
      userId: user.id,
      userName: user.name,
      avatar: user.avatar,
      gymName,
      time,
      timestamp: Date.now()
    };
    upsertLocalDailyCheckIn(optimisticCheckIn);
    try {
      const saved = await apiPost<any>('/api/checkins', { gymName, time });
      upsertLocalDailyCheckIn({
        id: String(saved?._id || saved?.id || optimisticCheckIn.id),
        userId: String(saved?.userId || optimisticCheckIn.userId),
        userName: saved?.userName || optimisticCheckIn.userName,
        avatar: optimisticCheckIn.avatar,
        gymName: saved?.gymName || optimisticCheckIn.gymName,
        time: saved?.time || optimisticCheckIn.time,
        timestamp: saved?.timestamp ? new Date(saved.timestamp).getTime() : optimisticCheckIn.timestamp,
      });
      bumpSocialRefresh();
    } catch (e) {
      // Mantener en local aunque falle el backend
    }
  };

  const handleCheckInUpdate = async (checkInId: string, gymName: string, time: string) => {
    if (!user) return;
    try {
      const saved = await apiPut<any>(`/api/checkins/${checkInId}`, { gymName, time });
      upsertLocalDailyCheckIn({
        id: checkInId,
        userId: user.id,
        userName: user.name,
        avatar: user.avatar,
        gymName: saved?.gymName || gymName,
        time: saved?.time || time,
        timestamp: saved?.timestamp ? new Date(saved.timestamp).getTime() : Date.now(),
      });
      bumpSocialRefresh();
    } catch {
      // mantener en local si falla
    }
  };

  const handleCheckInDelete = async (checkInId: string) => {
    if (!user) return;
    try {
      await apiDelete(`/api/checkins/${checkInId}`);
      setCheckIns(prev => prev.filter(ci => ci.id !== checkInId));
      bumpSocialRefresh();
    } catch {
      // mantener en local si falla
    }
  };

  const handleJoinFriendCheckIn = async (friendCheckIn: GymCheckIn) => {
    if (!user) return;

    // Crear check-in propio a la misma hora/gimnasio para reflejarlo en Progreso y Comunidad.
    const myCheckIn: GymCheckIn = {
      id: `ci-${Math.random().toString(36).substr(2, 5)}`,
      userId: user.id,
      userName: user.name,
      avatar: user.avatar,
      gymName: friendCheckIn.gymName,
      time: friendCheckIn.time,
      timestamp: Date.now()
    };

    upsertLocalDailyCheckIn(myCheckIn);

    // Notificación in-app (compatible con móvil vía WebView).

    // Intentar notificación del sistema si está disponible.
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Powerlifting Tracker', {
            body: `Confirmaste que vas con ${friendCheckIn.userName} a las ${friendCheckIn.time}`,
          });
        } else if (Notification.permission !== 'denied') {
          await Notification.requestPermission();
        }
      }
    } catch {
      // Ignorar si el entorno no soporta notifications del sistema.
    }

    // Enviar notificación al amigo en backend.
    try {
      const saved = await apiPost<any>('/api/checkins', {
        gymName: friendCheckIn.gymName,
        time: friendCheckIn.time,
      });
      upsertLocalDailyCheckIn({
        id: String(saved?._id || saved?.id || myCheckIn.id),
        userId: String(saved?.userId || myCheckIn.userId),
        userName: saved?.userName || myCheckIn.userName,
        avatar: myCheckIn.avatar,
        gymName: saved?.gymName || myCheckIn.gymName,
        time: saved?.time || myCheckIn.time,
        timestamp: saved?.timestamp ? new Date(saved.timestamp).getTime() : myCheckIn.timestamp,
      });

      await apiPost('/api/notifications/same-time', {
          friendUserId: friendCheckIn.userId,
          gymName: friendCheckIn.gymName,
          time: friendCheckIn.time,
      });
      bumpSocialRefresh();
    } catch {
      // Si falla la notificación remota, no bloqueamos la UX local.
    }
  };

  // Handlers
  const handleCreateTM = async (payload: {
    name: string;
    value: number;
    mode: 'weight' | 'reps' | 'seconds';
    sharedToSocial?: boolean;
  }) => {
    const name = payload.name.trim();
    const value = Number(payload.value);
    if (!name || !Number.isFinite(value) || value < 1) return;
    const mode = payload.mode;
    const sharedToSocial = !!payload.sharedToSocial;
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) {
      const local: TrainingMax = {
        id: `tm-${Math.random().toString(36).slice(2, 9)}`,
        name,
        value,
        mode,
        sharedToSocial,
      };
      setTms((prev) => [...prev, local]);
      return;
    }
    try {
      const anchor = planViewAnchorRef.current;
      const created = await apiPost<any>('/api/training-maxes', {
        routineId: activeRoutineId,
        name,
        value,
        mode,
        sharedToSocial,
        createdAt: dateISOToUtcNoonISO(anchor.dateISO),
      });
      const newTm = {
        id: String(created._id || created.id),
        name: created.name,
        value: Number(created.value),
        mode: created.mode,
        linkedExercise: created.linkedExercise,
        sharedToSocial: !!created.sharedToSocial,
      };
      setTms((prev) => [...prev, newTm]);
      const currentDate = monthLabelFromDateISO(anchor.dateISO);
      setHistory((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const newTmsRecord = { ...last.trainingMaxes, [newTm.id]: newTm.value };
        const updatedTmsList = [...tms, newTm];
        const progNew = computeRoutineProgressTotal(updatedTmsList);
        const newTotal = progNew.value;
        const newKind = progNew.kind;
        const samePeriod =
          last.year === anchor.year &&
          last.week === anchor.week &&
          (last.dayOfWeek ?? 0) === anchor.dayOfWeek;
        if (samePeriod) {
          return [...prev.slice(0, -1), { ...last, trainingMaxes: newTmsRecord, total: newTotal, progressKind: newKind }];
        }
        const entry = createHistoryEntry(currentDate, updatedTmsList, rms, {
          week: anchor.week,
          year: anchor.year,
          dayOfWeek: anchor.dayOfWeek,
        });
        return [...prev, entry];
      });
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[TM] Error creando:', e);
    }
  };

  const handleRemoveTM = async (id: string) => {
    const removed = tms.find((tm) => tm.id === id);
    const remainingTms = tms.filter((tm) => tm.id !== id);
    setTms((prev) => prev.filter((tm) => tm.id !== id));
    if (removed?.linkedExercise) {
      setRms((prev) => ({ ...prev, [removed.linkedExercise]: 0 }));
    }
    setHistory((prev) =>
      prev.map((entry) => {
        if (!entry.trainingMaxes) return entry;
        const nextTm: Record<string, number> = { ...entry.trainingMaxes };
        delete nextTm[id];
        const snapshotTms = remainingTms.map((t) => ({
          ...t,
          value: nextTm[t.id] ?? 0,
        }));
        const prog = computeRoutineProgressTotal(snapshotTms);
        const le = removed?.linkedExercise;
        const nextRms =
          le && entry.rms
            ? { ...entry.rms, [le]: 0 }
            : entry.rms;
        return {
          ...entry,
          trainingMaxes: Object.keys(nextTm).length > 0 ? nextTm : {},
          rms: nextRms ?? entry.rms,
          total: prog.value,
          progressKind: prog.kind,
        };
      })
    );
    if (!/^[a-f0-9]{24}$/i.test(id)) return;
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
    try {
      await apiDelete(
        `/api/training-maxes/${id}?routineId=${encodeURIComponent(activeRoutineId)}`
      );
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[TM] Error eliminando:', e);
    }
  };

  const handleUpdateTM = (id: string, updates: Partial<TrainingMax>) => {
    const prevTms = tms;
    const prevRms = rms;
    setTms(prev => prev.map(tm => tm.id === id ? { ...tm, ...updates } : tm));
    const currentTm = tms.find(t => t.id === id);
    if (currentTm?.linkedExercise && updates.value !== undefined) {
      setRms(prev => ({ ...prev, [currentTm.linkedExercise!]: updates.value! }));
    }
    // Actualizar historial para que Progreso refleje el cambio al instante
    if (updates.value !== undefined) {
      const anchor = planViewAnchorRef.current;
      const currentDate = monthLabelFromDateISO(anchor.dateISO);
      const { week, year, dayOfWeek: d } = anchor;
      const linked = currentTm?.linkedExercise;
      setHistory(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const newTms = { ...last.trainingMaxes, [id]: updates.value! };
        const newRms = linked ? { ...rms, [linked]: updates.value! } : rms;
        const updatedTmsList = tms.map(t => t.id === id ? { ...t, value: updates.value! } : t);
        const progUp = computeRoutineProgressTotal(updatedTmsList);
        const newTotal = progUp.value;
        const newKind = progUp.kind;
        const samePeriod =
          last.year === year && last.week === week && (last.dayOfWeek ?? 0) === d;
        if (samePeriod) {
          const iso = anchor.dateISO;
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              trainingMaxes: newTms,
              rms: newRms,
              total: newTotal,
              progressKind: newKind,
              dateISO: iso,
              month: calendarMonth1FromDateISO(iso),
            },
          ];
        }
        const entry = createHistoryEntry(currentDate, updatedTmsList, newRms, { week, year, dayOfWeek: d });
        return [...prev, { ...entry, routineId: activeRoutineId }];
      });
    }
    (async () => {
      if (!/^[a-f0-9]{24}$/i.test(id)) return;
      if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
      try {
        await apiPut(`/api/training-maxes/${id}`, {
          ...updates,
          routineId: activeRoutineId,
          updatedAt: dateISOToUtcNoonISO(planViewAnchorRef.current.dateISO),
        });
        bumpRoutineDataRefresh();
      } catch (e) {
        console.error('[TM] Error actualizando:', e);
        setTms(prevTms);
        setRms(prevRms);
      }
    })();
  };

  const handleCreateRoutine = async (
    routineName: string,
    opts?: { sameTemplateAllWeeks?: boolean; cycleLength?: number }
  ) => {
    const name = routineName?.trim();
    if (!name) return;
    const sameTemplateAllWeeks = opts?.sameTemplateAllWeeks !== false;
    const cycleLength = opts?.cycleLength ?? 4;
    const newRoutine = createRoutinePlan(`routine-${Math.random().toString(36).slice(2, 8)}`, name, {
      empty: true,
      sameTemplateAllWeeks,
      cycleLength,
    });
    try {
      const w = getWeeksAt(newRoutine, currentWeekOfYear);
      const bt =
        newRoutine.baseTemplate?.length ? newRoutine.baseTemplate : deriveBaseTemplateFromWeeks(w, cycleLength);
      const created = await apiPost<any>('/api/routines', {
        name: newRoutine.name,
        versions: [{ effectiveFromWeek: 1, weeks: bt }],
        baseTemplate: bt,
        weekTypeOverrides: newRoutine.weekTypeOverrides || [],
        sameTemplateAllWeeks,
        cycleLength,
        isActive: true,
      });
      const plan: RoutinePlan = expandRoutineFromApi({
        _id: created._id,
        id: created.id,
        name: created.name,
        sameTemplateAllWeeks: created.sameTemplateAllWeeks,
        hiddenFromSocial: created.hiddenFromSocial,
        cycleLength: created.cycleLength,
        skippedWeeks: created.skippedWeeks,
        weeks: created.weeks,
        versions: created.versions,
        baseTemplate: created.baseTemplate,
        weekTypeOverrides: created.weekTypeOverrides,
        logs: created.logs,
      });
      setRoutines(prev => [...prev, plan]);
      setActiveRoutineId(plan.id);
      setProgramScreen('plan');
      try {
        await apiPut(`/api/routines/${plan.id}/activate`, {});
      } catch (activateErr) {
        console.error('[Routine] Error activando rutina recién creada:', activateErr);
      }
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error creando:', e);
    }
  };

  const handleSelectRoutine = async (routineId: string) => {
    setActiveRoutineId(routineId);
    setProgramScreen('plan');
    try {
      await apiPut(`/api/routines/${routineId}/activate`, {});
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error activando:', e);
    }
  };

  const handleCopyFriendRoutine = async (routine: { name: string; weeks: TrainingWeek[] }) => {
    /** Copia completa del plan (series, %, kg, modo, linkedTo tipo tm-*); IDs nuevos y sin _dbId del amigo. */
    const newWeeks = cloneFriendRoutineWeeks(routine.weeks);
    try {
      const copiedBaseTemplate = deriveBaseTemplateFromWeeks(newWeeks);
      const created = await apiPost<any>('/api/routines', {
        name: `${routine.name} (de amigo)`,
        versions: [{ effectiveFromWeek: 1, weeks: copiedBaseTemplate }],
        baseTemplate: copiedBaseTemplate,
        weekTypeOverrides: [],
        isActive: true,
      });
      const planId = String(created._id || created.id);
      let tmsList = await apiGet<any[]>(`/api/training-maxes?routineId=${encodeURIComponent(planId)}`).catch(() => []);
      if (!tmsList?.length) {
        await Promise.all(
          DEFAULT_TM_SEED_ZERO.map((row) =>
            apiPost('/api/training-maxes', {
              name: row.name,
              value: row.value,
              mode: row.mode,
              ...(row.linkedExercise ? { linkedExercise: row.linkedExercise } : {}),
              routineId: planId,
            }).catch(() => {})
          )
        );
        tmsList = await apiGet<any[]>(`/api/training-maxes?routineId=${encodeURIComponent(planId)}`).catch(() => []);
      }
      await Promise.all(
        (tmsList || []).map((t: any) =>
          apiPut(`/api/training-maxes/${t._id || t.id}`, {
            value: 0,
            routineId: planId,
          }).catch(() => {})
        )
      );
      const plan: RoutinePlan = expandRoutineFromApi({
        _id: created._id,
        id: created.id,
        name: created.name,
        sameTemplateAllWeeks: created.sameTemplateAllWeeks,
        hiddenFromSocial: created.hiddenFromSocial,
        cycleLength: created.cycleLength,
        skippedWeeks: created.skippedWeeks,
        weeks: created.weeks,
        versions: created.versions,
        baseTemplate: created.baseTemplate,
        weekTypeOverrides: created.weekTypeOverrides,
        logs: created.logs,
      });
      setRoutines(prev => [...prev, plan]);
      setActiveRoutineId(plan.id);
      setProgramScreen('plan');
      setView('program');
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error copiando:', e);
    }
  };

  const handleRenameRoutine = async (routineId: string, name: string) => {
    setRoutines((prev) => prev.map((r) => (r.id === routineId ? { ...r, name } : r)));
    try {
      await apiPut(`/api/routines/${routineId}`, { name });
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error renombrando:', e);
    }
  };

  const handleDeleteRoutine = async (routineId: string) => {
    if (routines.length <= 1) {
        alert('Debe existir al menos una rutina activa.');
      return;
    }
    try {
      await apiDelete(`/api/routines/${routineId}`);
      const remaining = routines.filter((r) => r.id !== routineId);
      setRoutines(remaining);
      if (activeRoutineId === routineId) {
        const nextId = remaining[0].id;
        setActiveRoutineId(nextId);
        if (!nextId.startsWith('routine-') || nextId.length >= 20) {
          try {
            await apiPut(`/api/routines/${nextId}/activate`, {});
          } catch (activateErr) {
            console.error('[Routine] Error activando rutina restante:', activateErr);
          }
        }
      }
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error eliminando:', e);
    }
  };

  const applyRoutineChangeWithVersioning = (
    routine: RoutinePlan,
    weekIdx: number,
    dayIdx: number,
    applyToDay: (day: TrainingWeek['days'][0]) => TrainingWeek['days'][0],
    options?: { propagate?: boolean; forwardOnly?: boolean }
  ): RoutinePlan => {
    const cl = routine.cycleLength ?? 4;
    const vers = routine.versions?.length
      ? routine.versions
      : [{ effectiveFromWeek: 1, weeks: deriveBaseTemplateFromWeeks(routine.weeks, cl) }];
    const baseWeeks = deepCloneWeeks(routine.weeks.length >= 52 ? routine.weeks : materialize52WeeksFromFourTemplateWeeks(vers[vers.length - 1].weeks));
    const srcWeek = baseWeeks[weekIdx];
    if (!srcWeek || !srcWeek.days[dayIdx]) return { ...routine, weeks: baseWeeks };
    const slot = getWeekTypeSlot(srcWeek.number, cl);
    const modifiedDay = applyToDay({ ...srcWeek.days[dayIdx] });
    baseWeeks[weekIdx] = { ...srcWeek, days: srcWeek.days.map((d, i) => i === dayIdx ? modifiedDay : d) };

    const propagate = options?.propagate !== false;
    const forwardOnly = options?.forwardOnly === true;
    if (propagate) {
      const sameAll = !!routine.sameTemplateAllWeeks;
      for (let wi = 0; wi < baseWeeks.length; wi++) {
        if (wi === weekIdx) continue;
        if (forwardOnly && wi < weekIdx) continue;
        const w = baseWeeks[wi];
        if (!w.days[dayIdx]) continue;
        if (!sameAll && getWeekTypeSlot(w.number, cl) !== slot) continue;
        const targetDay = copyDayWithNewIds(modifiedDay, w.id, w.days[dayIdx].id, w.days[dayIdx]);
        baseWeeks[wi] = { ...w, days: w.days.map((d, i) => (i === dayIdx ? targetDay : d)) };
      }
    }

    const currentBaseTemplate = deriveBaseTemplateFromWeeks(baseWeeks, cl);
    const nextOverrides = propagate
      ? [
          ...(routine.weekTypeOverrides || []).filter((ov: { weekType: number }) => ov.weekType !== slot),
          { weekType: slot, week: normalizeTemplateWeek(baseWeeks[weekIdx], slot) },
        ].sort((a: { weekType: number }, b: { weekType: number }) => a.weekType - b.weekType)
      : (routine.weekTypeOverrides || []);

    const newVersion: RoutineVersion = {
      effectiveFromWeek: weekIdx + 1,
      weeks: deriveBaseTemplateFromWeeks(baseWeeks, cl),
    };
    const newVersions = [...vers.filter(v => v.effectiveFromWeek < newVersion.effectiveFromWeek), newVersion].sort((a, b) => a.effectiveFromWeek - b.effectiveFromWeek);
    return {
      ...routine,
      weeks: baseWeeks,
      versions: newVersions,
      baseTemplate: currentBaseTemplate,
      weekTypeOverrides: nextOverrides,
    };
  };

  const handleAddExercise = (weekId: string, dayId: string, initialValues?: Partial<PlannedExercise>) => {
    const routine = routines.find(r => r.id === activeRoutineId);
    if (!routine) return;
    const resolved = resolveWeekDayIndex(routine, weekId, dayId);
    if (!resolved) return;
    const fullWeeks = routine.weeks.length >= 52 ? routine.weeks : materializeRoutineWeeksIfNeeded(routine);
    const day = fullWeeks[resolved.weekIdx]?.days[resolved.dayIdx];
    if (!day) return;

    const trimmedName = (initialValues?.name ?? '').trim();
    if (!trimmedName) return;

    const newEx: PlannedExercise = {
      id: `${weekId}-${dayId}-e${day.exercises.length + 1}`,
      sets: initialValues?.sets ?? 3,
      reps: initialValues?.reps ?? 10,
      mode: (initialValues?.mode as ExerciseMode) ?? 'weight',
      ...initialValues,
      name: trimmedName,
    };

    updateActiveRoutine((r) => {
      const res2 = resolveWeekDayIndex(r, weekId, dayId);
      if (!res2) return r;
      return applyRoutineChangeWithVersioning(r, res2.weekIdx, res2.dayIdx, (d) => ({
        ...d,
        exercises: [...d.exercises, newEx],
      }), { forwardOnly: true });
    });

    if (routine.id && !routine.id.startsWith('routine-')) {
      schedulePlanBulkSync();
    }
  };

  const handleRemoveExercise = (weekId: string, dayId: string, exerciseId: string) => {
    const routine = routines.find(r => r.id === activeRoutineId);
    if (!routine) return;
    const resolved = resolveWeekDayIndex(routine, weekId, dayId);
    if (!resolved) return;
    const fullWeeks = routine.weeks.length >= 52 ? routine.weeks : materializeRoutineWeeksIfNeeded(routine);
    const day = fullWeeks[resolved.weekIdx]?.days[resolved.dayIdx];
    const ex = day?.exercises.find(e => e.id === exerciseId);
    const exIdx1Based = ex ? day.exercises.indexOf(ex) + 1 : -1;

    updateActiveRoutine((r) => {
      const res2 = resolveWeekDayIndex(r, weekId, dayId);
      if (!res2) return r;
      /** No usar `forwardOnly: true` aquí: solo actualizaba semanas “futuras” (índice > actual) y las semanas
       * anteriores del año seguían con el ejercicio; al navegar o al derivar plantilla parecía que “volvía”. */
      const updated = applyRoutineChangeWithVersioning(r, res2.weekIdx, res2.dayIdx, (d) => ({
        ...d,
        exercises: d.exercises.filter(e => e.id !== exerciseId),
      }), { forwardOnly: false });
      if (exIdx1Based > 0) {
        return {
          ...updated,
          logs: purgeAndReindexLogsAfterExerciseRemoval(updated.logs, res2.dayIdx, exIdx1Based),
        };
      }
      return updated;
    });

    if (routine.id && !routine.id.startsWith('routine-')) {
      schedulePlanBulkSync();
    }
  };

  const handleUpdateExercise = (weekId: string, dayId: string, exerciseId: string, updates: Partial<PlannedExercise>) => {
    const routine = routines.find(r => r.id === activeRoutineId);
    if (!routine) return;
    const resolved = resolveWeekDayIndex(routine, weekId, dayId);
    if (!resolved) return;
    const fullWeeks = routine.weeks.length >= 52 ? routine.weeks : materializeRoutineWeeksIfNeeded(routine);
    const day = fullWeeks[resolved.weekIdx]?.days[resolved.dayIdx];
    const ex = day?.exercises.find(e => e.id === exerciseId);
    const dbExId = ex?._dbId;

    updateActiveRoutine((r) => {
      const res2 = resolveWeekDayIndex(r, weekId, dayId);
      if (!res2) return r;
      return applyRoutineChangeWithVersioning(r, res2.weekIdx, res2.dayIdx, (d) => ({
        ...d,
        exercises: d.exercises.map(e => e.id === exerciseId ? { ...e, ...updates } : e),
      }));
    });

    if (dbExId && routine.id && !routine.id.startsWith('routine-')) {
      const body = exercisePatchBodyFromUpdates(updates);
      if (Object.keys(body).length === 0) {
        /* Sin campos persistibles; el estado local ya se actualizó arriba. */
      } else {
      void apiPatch<{
        ok?: boolean;
        exercise?: Partial<PlannedExercise>;
      }>(`/api/routines/${routine.id}/exercises/${dbExId}`, body)
        .then((res) => {
          const ex = res?.exercise;
          if (!ex) return;
          updateActiveRoutine((r) => {
            const res2 = resolveWeekDayIndex(r, weekId, dayId);
            if (!res2) return r;
            return applyRoutineChangeWithVersioning(r, res2.weekIdx, res2.dayIdx, (d) => ({
              ...d,
              exercises: d.exercises.map((e) =>
                e.id === exerciseId
                  ? {
                      ...e,
                      ...(ex.sets !== undefined ? { sets: ex.sets } : {}),
                      ...(ex.reps !== undefined ? { reps: ex.reps } : {}),
                      ...(ex.pct !== undefined ? { pct: ex.pct } : {}),
                      ...(ex.pctPerSet !== undefined ? { pctPerSet: ex.pctPerSet } : {}),
                      ...(ex.weight !== undefined ? { weight: ex.weight } : {}),
                      ...(ex.mode !== undefined ? { mode: ex.mode } : {}),
                    }
                  : e
              ),
            }));
          });
        })
        .catch((e: any) => console.error('[Routine] Error updating exercise:', e));
      }
    } else if (routine.id && !routine.id.startsWith('routine-')) {
      schedulePlanBulkSync();
    }
  };

  const handleLogChange = (id: string, field: keyof LogEntry, value: any) => {
    markLogDirty(activeRoutineId, id);
    updateActiveRoutine((routine) => {
      const base = resolveLogEntryForMerge(routine.logs, id);
      const cleaned = stripLegacyLogKeysForCanonical(routine.logs, id);
      return {
        ...routine,
        logs: {
          ...cleaned,
          [id]: { ...base, [field]: value },
        },
      };
    });
  };

  const roundTo25 = (n: number) => Math.round(n / 2.5) * 2.5;

  /**
   * Safety-net: re-escanea TODOS los logs de la rutina buscando TMs superados.
   * Se ejecuta al pulsar "Guardar sesión" para atrapar bumps que el onChange por tecla no detectó.
   */
  const rescanTmBumpsFromLogs = (routine: RoutinePlan) => {
    if (!user) return;
    const allWeeks = getWeeksForTrainingMaxScan(routine);
    const currentTms = tmsRef.current;
    const newTms = currentTms.map((tm) => ({ ...tm }));
    let didBump = false;
    allWeeks.forEach((week: TrainingWeek) => {
      week.days.forEach((day: TrainingDay) => {
        day.exercises.forEach((ex: PlannedExercise) => {
          const linkedTM = resolveTmForAutoBump(ex, newTms);
          if (!linkedTM) return;
          const idxTm = newTms.findIndex((t) => t.id === linkedTM.id);
          if (idxTm < 0) return;
          const lid = routineLogKeyFromIds(week, day, ex);
          const l = resolveLogEntryForMerge(routine.logs, lid);
          if (!l?.sets) return;
          l.sets.forEach((set: SetLog) => {
            if (linkedTM.mode === 'weight') {
              const w = set.weight ?? 0;
              if (w <= 0) return;
              const candidate = roundTo25(w);
              if (candidate > newTms[idxTm].value) {
                newTms[idxTm] = { ...newTms[idxTm], value: candidate };
                didBump = true;
              }
            } else if (linkedTM.mode === 'reps' || linkedTM.mode === 'seconds') {
              const val = set.reps ?? 0;
              if (val <= 0) return;
              const candidate = Math.round(val);
              if (candidate > newTms[idxTm].value) {
                newTms[idxTm] = { ...newTms[idxTm], value: candidate };
                didBump = true;
              }
            }
          });
        });
      });
    });
    if (didBump) {
      tmsRef.current = newTms;
      setTms(newTms);
      const linked = newTms.filter(t => t.linkedExercise);
      const newRms = { ...rmsRef.current };
      linked.forEach(tm => { if (tm.linkedExercise) newRms[tm.linkedExercise] = tm.value; });
      rmsRef.current = newRms;
      setRms(newRms);
      const resolvedCal = getYearWeekDay();
      const { week: w, year: y, dayOfWeek: d } = resolvedCal;
      const newTmsRecord = newTms.reduce((acc, tm) => ({ ...acc, [tm.id]: tm.value }), {} as Record<string, number>);
      const currentDate = new Date().toLocaleDateString('es-ES', { month: 'short' });
      setHistory((prev) => {
        const samePeriodNew = (e: HistoryEntry) =>
          e.year === y && e.week === w && (e.dayOfWeek ?? 0) === (d ?? 0);
        const filtered = prev.filter((e) => !samePeriodNew(e));
        const entries: HistoryEntry[] = [...filtered];
        const hasBaseline = entries.some((e) => entryDateISO(e) === TM_BASELINE_DATE_ISO);
        if (!hasBaseline) {
          const prevRmsSnap = buildRmsFromLinkedTms(currentTms, rmsRef.current);
          entries.push(buildBaselineHistoryEntry(activeRoutineId, currentTms, prevRmsSnap, currentDate));
        }
        const newEntry: HistoryEntry = {
          ...createHistoryEntry(currentDate, newTms, newRms, { week: w, year: y, dayOfWeek: d }),
          routineId: activeRoutineId,
        };
        entries.push(newEntry);
        return entries.sort((a, b) => {
          const c = entryDateISO(a).localeCompare(entryDateISO(b));
          if (c !== 0) return c;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
      });
      const bumpIso = dateISOFromYearWeekDay(y, w, d ?? 0);
      newTms.filter(t => t.value !== currentTms.find(ot => ot.id === t.id)?.value).forEach(tm => {
        apiPut(`/api/training-maxes/${tm.id}`, {
          value: tm.value,
          routineId: activeRoutineId,
          updatedAt: dateISOToUtcNoonISO(bumpIso),
        }).catch(() => {});
      });
      const iso = bumpIso;
      apiPost('/api/training-maxes/save-period', {
        routineId: activeRoutineId,
        date: currentDate,
        week: w,
        year: y,
        dayOfWeek: d,
        dateISO: iso,
        month: calendarMonth1FromDateISO(iso),
        rms: newRms,
        total: computeRoutineProgressTotal(newTms).value,
        trainingMaxes: newTmsRecord,
        progressKind: computeRoutineProgressTotal(newTms).kind,
      }).catch(() => {});
    }
  };

  /** TM de rutina vinculado, o TM interno inferido por nombre (peso / reps / segundos por separado en Mongo). */
  const resolveEffectiveTM = (exercise: PlannedExercise): TrainingMax | undefined => {
    const official = resolveTmForAutoBump(exercise, tms);
    if (official) return official;
    const im = internalExerciseMaxes.find(
      m => normalizeExerciseNameKey(m.name) === normalizeExerciseNameKey(exercise.name)
    );
    if (!im) return undefined;
    const val = getInternalValueForMode(im, exercise.mode);
    if (val == null) return undefined;
    return {
      id: im.id,
      name: im.name,
      value: val,
      mode: exercise.mode,
      isInternal: true,
    };
  };

  const handleSetLogChange = (logId: string, setIdx: number, updates: Partial<SetLog>) => {
    type TmBumpPayload = {
      newTms: TrainingMax[];
      newRms: RMData;
      prevTmsSnapshot: TrainingMax[];
      prevRmsSnapshot: RMData;
      w: number;
      y: number;
      /** Lunes=0 … Domingo=6 — mismo día en que subió el TM desde series. */
      d: number;
      currentDate: string;
      newTmsRecord: Record<string, number>;
      newTotal: number;
    };
    let tmBump: TmBumpPayload | null = null;
    let pendingInternalUpserts: { name: string; mode: 'weight' | 'reps' | 'seconds'; candidateValue: number }[] = [];
    markLogDirty(activeRoutineId, logId);
    updateActiveRoutine((routine) => {
      const log = resolveLogEntryForMerge(routine.logs, logId);
      const currentSets = [...(log.sets || [])];
      
      while (currentSets.length <= setIdx) {
        currentSets.push({ id: `${currentSets.length}`, weight: null, reps: null, completed: false });
      }
      
      const merged = { ...currentSets[setIdx], ...updates };
      if (merged.reps != null) {
        const n = typeof merged.reps === 'number' ? merged.reps : parseInt(String(merged.reps), 10);
        merged.reps = Number.isFinite(n) ? n : null;
      }
      if (merged.weight != null) {
        const w = typeof merged.weight === 'number' ? merged.weight : parseFloat(String(merged.weight));
        merged.weight = Number.isFinite(w) ? w : null;
      }
      currentSets[setIdx] = merged;
      
      const updatedLogs = {
        ...stripLegacyLogKeysForCanonical(routine.logs, logId),
        [logId]: { ...log, sets: currentSets },
      };
      const updatedRoutine = { ...routine, logs: updatedLogs };

      if (user) {
        const baseWeeks = getWeeksForTrainingMaxScanWithLog(routine, logId);
        let didBump = false;
        const newTms = tmsRef.current.map((tm) => ({ ...tm }));
        baseWeeks.forEach((week: TrainingWeek) => {
          week.days.forEach((day: TrainingDay) => {
            day.exercises.forEach((ex: PlannedExercise) => {
              const linkedTM = resolveTmForAutoBump(ex, newTms);
              if (!linkedTM) return;
              const idxTm = newTms.findIndex((t) => t.id === linkedTM.id);
              if (idxTm < 0) return;
              const lid = routineLogKeyFromIds(week, day, ex);
              const l = resolveLogEntryForMerge(updatedLogs, lid);
              if (!l?.sets) return;
              l.sets.forEach((set: SetLog) => {
                if (linkedTM.mode === 'weight') {
                  const w = set.weight ?? 0;
                  if (w <= 0) return;
                  const candidate = roundTo25(w);
                  if (candidate > newTms[idxTm].value) {
                    newTms[idxTm] = { ...newTms[idxTm], value: candidate };
                    didBump = true;
                  }
                } else if (linkedTM.mode === 'reps' || linkedTM.mode === 'seconds') {
                  const val = set.reps ?? 0;
                  if (val <= 0) return;
                  const candidate = Math.round(val);
                  if (candidate > newTms[idxTm].value) {
                    newTms[idxTm] = { ...newTms[idxTm], value: candidate };
                    didBump = true;
                  }
                }
              });
            });
          });
        });

        // TM interno: sin linkedTo — peso = máximo kg apuntado en serie (tu «100 %»), no e1RM; reps/seg por campo en Mongo
        const maxByKey = new Map<string, { name: string; mode: 'weight' | 'reps' | 'seconds'; candidateValue: number }>();
        baseWeeks.forEach((week: TrainingWeek) => {
          week.days.forEach((day: TrainingDay) => {
            day.exercises.forEach((ex: PlannedExercise) => {
              // Solo saltar si hay TM de rutina real; si linkedTo es huérfano, el TM interno aplica y debe actualizarse
              if (resolveTmForAutoBump(ex, newTms)) return;
              const lid = routineLogKeyFromIds(week, day, ex);
              const l = resolveLogEntryForMerge(updatedLogs, lid);
              if (!l?.sets?.length) return;
              const nk = normalizeExerciseNameKey(ex.name);
              if (ex.mode === 'weight') {
                let best = 0;
                l.sets.forEach((set: SetLog) => {
                  const w = set.weight ?? 0;
                  if (w <= 0) return;
                  const cand = roundTo25(w);
                  if (cand > best) best = cand;
                });
                if (best <= 0) return;
                const key = `${nk}::weight`;
                const prev = maxByKey.get(key);
                if (!prev || best > prev.candidateValue) {
                  maxByKey.set(key, { name: ex.name, mode: 'weight', candidateValue: best });
                }
              } else if (ex.mode === 'reps' || ex.mode === 'seconds') {
                let best = 0;
                l.sets.forEach((set: SetLog) => {
                  const r = set.reps ?? 0;
                  if (r <= 0) return;
                  const cand = Math.round(r);
                  if (cand > best) best = cand;
                });
                if (best <= 0) return;
                const key = `${nk}::${ex.mode}`;
                const prev = maxByKey.get(key);
                if (!prev || best > prev.candidateValue) {
                  maxByKey.set(key, { name: ex.name, mode: ex.mode, candidateValue: best });
                }
              }
            });
          });
        });
        pendingInternalUpserts = [];
        maxByKey.forEach((v) => {
          const im = internalExerciseMaxesRef.current.find(
            m => normalizeExerciseNameKey(m.name) === normalizeExerciseNameKey(v.name)
          );
          const prevStored = im
            ? v.mode === 'weight'
              ? (im.valueWeight ?? im.value ?? 0)
              : v.mode === 'reps'
                ? (im.valueReps ?? 0)
                : (im.valueSeconds ?? 0)
            : 0;
          if (v.candidateValue > prevStored) {
            pendingInternalUpserts.push({ name: v.name, mode: v.mode, candidateValue: v.candidateValue });
          }
        });

        if (didBump) {
          const linked = newTms.filter(t => t.linkedExercise);
          const newRms = { ...rmsRef.current };
          linked.forEach(tm => { if (tm.linkedExercise) newRms[tm.linkedExercise] = tm.value; });
          const resolvedCal =
            resolveCalendarFromLogId(updatedRoutine, logId, viewAsOfWeek ?? currentWeekOfYear) ??
            getYearWeekDay();
          const { week: w, year: y, dayOfWeek: d } = resolvedCal;
          const newTmsRecord = newTms.reduce((acc, tm) => ({ ...acc, [tm.id]: tm.value }), {} as Record<string, number>);
          const newTotal = computeRoutineProgressTotal(newTms).value;
          const currentDate = new Date().toLocaleDateString('es-ES', { month: 'short' });
          const prevTmsSnap = tmsRef.current.map((tm) => ({ ...tm }));
          const prevRmsSnap = { ...rmsRef.current };
          tmBump = {
            newTms,
            newRms,
            prevTmsSnapshot: prevTmsSnap,
            prevRmsSnapshot: prevRmsSnap,
            w,
            y,
            d,
            currentDate,
            newTmsRecord,
            newTotal,
          };
          tmsRef.current = newTms;
          rmsRef.current = newRms;
        }

        if (pendingInternalUpserts.length > 0) {
          const next = [...internalExerciseMaxesRef.current];
          pendingInternalUpserts.forEach(({ name, mode, candidateValue }) => {
            const k = normalizeExerciseNameKey(name);
            const idx = next.findIndex(m => normalizeExerciseNameKey(m.name) === k);
            const field = mode === 'weight' ? 'valueWeight' : mode === 'reps' ? 'valueReps' : 'valueSeconds';
            if (idx >= 0) {
              const cur = next[idx];
              const prevNum =
                mode === 'weight'
                  ? (cur.valueWeight ?? cur.value ?? 0)
                  : mode === 'reps'
                    ? (cur.valueReps ?? 0)
                    : (cur.valueSeconds ?? 0);
              if (candidateValue > prevNum) {
                next[idx] = { ...cur, [field]: candidateValue };
              }
            } else {
              next.push({
                id: `pending-${k}`,
                name,
                ...(mode === 'weight'
                  ? { valueWeight: candidateValue }
                  : mode === 'reps'
                    ? { valueReps: candidateValue }
                    : { valueSeconds: candidateValue }),
              });
            }
          });
          internalExerciseMaxesRef.current = next;
        }
      }

      return updatedRoutine;
    });
    if (pendingInternalUpserts.length > 0) {
      queueMicrotask(() => {
        setInternalExerciseMaxes(prev => {
          const next = [...prev];
          pendingInternalUpserts.forEach(({ name, mode, candidateValue }) => {
            const k = normalizeExerciseNameKey(name);
            const idx = next.findIndex(m => normalizeExerciseNameKey(m.name) === k);
            const field = mode === 'weight' ? 'valueWeight' : mode === 'reps' ? 'valueReps' : 'valueSeconds';
            if (idx >= 0) {
              const cur = next[idx];
              const prevNum =
                mode === 'weight'
                  ? (cur.valueWeight ?? cur.value ?? 0)
                  : mode === 'reps'
                    ? (cur.valueReps ?? 0)
                    : (cur.valueSeconds ?? 0);
              if (candidateValue > prevNum) {
                next[idx] = { ...cur, [field]: candidateValue };
              }
            } else {
              next.push({
                id: `pending-${k}`,
                name,
                ...(mode === 'weight'
                  ? { valueWeight: candidateValue }
                  : mode === 'reps'
                    ? { valueReps: candidateValue }
                    : { valueSeconds: candidateValue }),
              });
            }
          });
          return next;
        });
        pendingInternalUpserts.forEach(({ name, mode, candidateValue }) => {
          if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
          apiPost<any>('/api/internal-exercise-maxes/upsert', {
            routineId: activeRoutineId,
            name,
            mode,
            candidateValue,
          })
            .then((doc: any) => {
              const id = String(doc._id || doc.id);
              setInternalExerciseMaxes(prev =>
                prev.map(m => {
                  if (normalizeExerciseNameKey(m.name) !== normalizeExerciseNameKey(name)) return m;
                  return {
                    ...m,
                    id,
                    valueWeight: doc.valueWeight != null ? Number(doc.valueWeight) : m.valueWeight,
                    valueReps: doc.valueReps != null ? Number(doc.valueReps) : m.valueReps,
                    valueSeconds: doc.valueSeconds != null ? Number(doc.valueSeconds) : m.valueSeconds,
                    value: doc.value != null ? Number(doc.value) : m.value,
                  };
                })
              );
            })
            .catch(() => {});
        });
      });
    }
    if (tmBump) {
      const b = tmBump;
      const bumpedIds = b.newTms
        .filter(t => t.value !== b.prevTmsSnapshot.find(ot => ot.id === t.id)?.value)
        .map(t => t.id);
      if (bumpedIds.length) {
        if (tmHighlightTimerRef.current) clearTimeout(tmHighlightTimerRef.current);
        setTmAutoHighlightIds(bumpedIds);
        tmHighlightTimerRef.current = setTimeout(() => {
          setTmAutoHighlightIds([]);
          tmHighlightTimerRef.current = null;
        }, 4000);
      }
      const tmActuallyChangedForHist = b.newTms.some(
        (t) => b.prevTmsSnapshot.find((ot) => ot.id === t.id)?.value !== t.value
      );
      const hasBaselineNow = historyRef.current.some((e) => entryDateISO(e) === TM_BASELINE_DATE_ISO);
      const needBaselineSave = tmActuallyChangedForHist && !hasBaselineNow;

      setTms(b.newTms);
      setRms(b.newRms);
      setHistory((prev) => {
        const samePeriodNew = (e: HistoryEntry) =>
          e.year === b.y && e.week === b.w && (e.dayOfWeek ?? 0) === (b.d ?? 0);
        const filtered = prev.filter((e) => !samePeriodNew(e));
        const entries: HistoryEntry[] = [...filtered];
        const hasBaseline = entries.some((e) => entryDateISO(e) === TM_BASELINE_DATE_ISO);
        if (tmActuallyChangedForHist && !hasBaseline) {
          const prevRmsSnap = buildRmsFromLinkedTms(b.prevTmsSnapshot, b.prevRmsSnapshot);
          entries.push(
            buildBaselineHistoryEntry(activeRoutineId, b.prevTmsSnapshot, prevRmsSnap, b.currentDate)
          );
        }
        const newEntry: HistoryEntry = {
          ...createHistoryEntry(b.currentDate, b.newTms, b.newRms, { week: b.w, year: b.y, dayOfWeek: b.d }),
          routineId: activeRoutineId,
        };
        entries.push(newEntry);
        return entries.sort((a, b) => {
          const c = entryDateISO(a).localeCompare(entryDateISO(b));
          if (c !== 0) return c;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
      });
      queueMicrotask(() => {
        const bumpIsoLog = dateISOFromYearWeekDay(b.y, b.w, b.d ?? 0);
        b.newTms.filter(t => t.value !== b.prevTmsSnapshot.find(ot => ot.id === t.id)?.value).forEach(tm => {
          apiPut(`/api/training-maxes/${tm.id}`, {
            value: tm.value,
            routineId: activeRoutineId,
            updatedAt: dateISOToUtcNoonISO(bumpIsoLog),
          }).catch(() => {});
        });
        const isPersistedRoutine = !(activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20);
        if (isPersistedRoutine) {
          const saveNew = () => {
            const iso = dateISOFromYearWeekDay(b.y, b.w, b.d ?? 0);
            return apiPost('/api/training-maxes/save-period', {
              routineId: activeRoutineId,
              date: b.currentDate,
              week: b.w,
              year: b.y,
              dayOfWeek: b.d,
              dateISO: iso,
              month: calendarMonth1FromDateISO(iso),
              rms: b.newRms,
              total: b.newTotal,
              trainingMaxes: b.newTmsRecord,
              progressKind: computeRoutineProgressTotal(b.newTms).kind,
            });
          };
          const run = async () => {
            if (needBaselineSave) {
              const prevRmsSnap = buildRmsFromLinkedTms(b.prevTmsSnapshot, b.prevRmsSnapshot);
              const prevProg = computeRoutineProgressTotal(b.prevTmsSnapshot);
              const prevTmRec = b.prevTmsSnapshot.reduce(
                (acc, tm) => ({ ...acc, [tm.id]: tm.value }),
                {} as Record<string, number>
              );
              try {
                await apiPost('/api/training-maxes/save-period', {
                  routineId: activeRoutineId,
                  date: b.currentDate,
                  week: 1,
                  year: 1970,
                  dayOfWeek: 0,
                  dateISO: TM_BASELINE_DATE_ISO,
                  month: 1,
                  rms: prevRmsSnap,
                  total: prevProg.value,
                  trainingMaxes: prevTmRec,
                  progressKind: prevProg.kind,
                });
              } catch {
                /* idempotente si ya existe */
              }
            }
            await saveNew().catch(() => {});
          };
          void run();
        }
      });
    }
  };

  const handleMarkCompleted = (logId: string, completed: boolean) => {
    markLogDirty(activeRoutineId, logId);
    updateActiveRoutine((routine) => {
      const base = resolveLogEntryForMerge(routine.logs, logId);
      const cleaned = stripLegacyLogKeysForCanonical(routine.logs, logId);
      return {
        ...routine,
        logs: {
          ...cleaned,
          [logId]: { ...base, completed },
        },
      };
    });
  };

  const handleLoginComplete = useCallback((userData: User) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      upsertAccount({
        id: userData.id,
        token,
        email: userData.email,
        name: userData.name,
        avatar: userData.avatar,
      });
      setActiveAccountId(userData.id);
      setSavedAccountsState(loadSavedAccounts());
    }
    setUser(userData);
  }, []);

  const switchToAccount = useCallback(
    async (userId: string) => {
      const accounts = loadSavedAccounts();
      const acc = accounts.find((a) => a.id === userId);
      if (!acc) {
        toast.error('Cuenta no encontrada');
        return;
      }
      setIsSwitchingAccount(true);
      const prevToken = localStorage.getItem('auth_token');
      try {
        localStorage.setItem('auth_token', acc.token);
        setActiveAccountId(userId);
        const base = getApiBaseUrl() || '';
        const res = await fetch(`${base}/api/auth/me`, {
          headers: { Authorization: `Bearer ${acc.token}` },
        });
        if (!res.ok) {
          localStorage.setItem('auth_token', prevToken || '');
          toast.error('Sesión inválida o caducada');
          removeAccount(userId);
          setSavedAccountsState(loadSavedAccounts());
          return;
        }
        const data = await res.json();
        const u = mapUserFromMePayload(data);
        upsertAccount({
          id: u.id,
          token: acc.token,
          email: u.email,
          name: u.name,
          avatar: u.avatar,
        });
        setSavedAccountsState(loadSavedAccounts());
        setRoutines([]);
        setActiveRoutineId(null);
        setHistory([]);
        setTms([]);
        setRms({ bench: 0, squat: 0, deadlift: 0 });
        setInternalExerciseMaxes([]);
        setCheckIns([]);
        setChallenges([]);
        setFriendsList([]);
        setFriends([]);
        setViewAsOfWeek(null);
        setProgramScreen('plan');
        setView('dashboard');
        setUser(u);
      } catch (e) {
        console.error('[Account] Error al cambiar de cuenta:', e);
        toast.error('No se pudo cambiar de cuenta');
      } finally {
        setIsSwitchingAccount(false);
      }
    },
    [toast]
  );

  const handleLogout = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    try {
      const token = localStorage.getItem('auth_token');
      const base = getApiBaseUrl() || '';
      await fetch(`${base}/api/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      /* ignore */
    }
    removeAccount(uid);
    setSavedAccountsState(loadSavedAccounts());
    const remaining = loadSavedAccounts();
    if (remaining.length > 0) {
      try {
        await switchToAccount(remaining[0].id);
      } catch {
        localStorage.removeItem('auth_token');
        setActiveAccountId(null);
        localStorage.removeItem(AUTH_USER_STORAGE_KEY);
        setUser(null);
      }
    } else {
      localStorage.removeItem('auth_token');
      setActiveAccountId(null);
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      setUser(null);
    }
  }, [user?.id, switchToAccount]);

  const handleRemoveSavedAccount = useCallback(
    (userId: string) => {
      if (userId === user?.id) {
        void handleLogout();
        return;
      }
      removeAccount(userId);
      setSavedAccountsState(loadSavedAccounts());
    },
    [user?.id, handleLogout]
  );

  useEffect(() => {
    const checkSession = async () => {
      migrateLegacyIfNeeded();
      setSavedAccountsState(loadSavedAccounts());
      const cachedRaw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
      if (cachedRaw) {
        try {
          const cachedUser = JSON.parse(cachedRaw) as User;
          if (cachedUser?.id) setUser(cachedUser);
        } catch {
          localStorage.removeItem(AUTH_USER_STORAGE_KEY);
        }
      }

      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          localStorage.removeItem(AUTH_USER_STORAGE_KEY);
          setUser(null);
          setIsCheckingSession(false);
          return;
        }
        
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 15000);
        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: ac.signal,
        });
        clearTimeout(t);
        
        if (res.ok) {
          try {
            const data = await res.json();
            const u = mapUserFromMePayload(data);
            setUser(u);
            localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(u));
            const t = localStorage.getItem('auth_token');
            if (t) {
              upsertAccount({
                id: u.id,
                token: t,
                email: u.email,
                name: u.name,
                avatar: u.avatar,
              });
              setActiveAccountId(u.id);
              setSavedAccountsState(loadSavedAccounts());
            }
          } catch (parseError) {
            console.error('[SESSION] Error parseando respuesta:', parseError);
            localStorage.removeItem('auth_token');
            localStorage.removeItem(AUTH_USER_STORAGE_KEY);
            setUser(null);
          }
        } else {
          try {
            const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
            if (raw) {
              const u = JSON.parse(raw) as User;
              if (u?.id) {
                removeAccount(u.id);
                setSavedAccountsState(loadSavedAccounts());
              }
            }
          } catch {
            /* ignore */
          }
          localStorage.removeItem('auth_token');
          localStorage.removeItem(AUTH_USER_STORAGE_KEY);
          setUser(null);
        }
      } catch (e: any) {
        // Error de conexión o servidor no disponible: mantener sesión local activa hasta logout.
        console.error('[SESSION] Error verificando sesión:', e.message || e);
      } finally {
        setIsCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (!user) {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  }, [user]);

  const exportToExcel = () => {
    const data: any[] = [];
    weeks.forEach(week => {
      week.days.forEach(day => {
        day.exercises.forEach(ex => {
          const log = getLogEntryForExercise(logs, week, day, ex);
          const linkedTM = tms.find(t => t.id === ex.linkedTo);
          const getTargetWeight = (sIdx: number) => linkedTM ? Math.round(linkedTM.value * ((ex.pctPerSet?.[sIdx] ?? ex.pct ?? 75) / 100)) : (ex.weight || 0);

          if (log.sets && log.sets.length > 0) {
            log.sets.forEach((set, sIdx) => {
              const targetWeight = getTargetWeight(sIdx);
              data.push({
                Semana: week.number,
                Dia: day.name,
                Ejercicio: ex.name,
                Serie: sIdx + 1,
                Objetivo: `${ex.sets}x${ex.reps} @ ${targetWeight}kg`,
                Peso_Real: set.weight ?? targetWeight,
                Reps_Real: set.reps ?? (parseInt(ex.reps.toString()) || 0),
                RPE: log.rpe || '',
                Notas: log.notes || ''
              });
            });
          } else {
            const targetWeight = getTargetWeight(0);
            data.push({
              Semana: week.number,
              Dia: day.name,
              Ejercicio: ex.name,
              Serie: '—',
              Objetivo: `${ex.sets}x${ex.reps} @ ${targetWeight}kg`,
              Peso_Real: '—',
              Reps_Real: '—',
              RPE: log.rpe || '',
              Notas: log.notes || ''
            });
          }
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plan Entrenamiento");
    XLSX.writeFile(wb, "Mi_Plan_Entrenamiento.xlsx");
  };

  // Función para guardar el período actual en el historial (local + DB)
  const saveCurrentPeriod = async (silent = false) => {
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
    if (tmsLoadedForRoutineRef.current !== activeRoutineId) return;
    if (!tms.length) return;
    const now = new Date();
    const currentDate = now.toLocaleDateString('es-ES', { month: 'short' });
    const { week, year, dayOfWeek: d } = getYearWeekDay(now);
    const entry = createHistoryEntry(currentDate, tms, rms, { week, year, dayOfWeek: d });
    const entryWithRoutine: HistoryEntry = { ...entry, routineId: activeRoutineId };
    setHistory(prev => {
      const samePeriod = (e: HistoryEntry) =>
        e.year === year && e.week === week && (e.dayOfWeek ?? 0) === d;
      const filtered = prev.filter(e => !samePeriod(e));
      return [...filtered, entryWithRoutine].sort((a, b) => {
        const c = entryDateISO(a).localeCompare(entryDateISO(b));
        if (c !== 0) return c;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
    });
    try {
      await apiPost('/api/training-maxes/save-period', {
        routineId: activeRoutineId,
        date: entry.date,
        week: entry.week,
        year: entry.year,
        dayOfWeek: d,
        dateISO: entry.dateISO,
        month: entry.month,
        rms: entry.rms,
        total: entry.total,
        trainingMaxes: entry.trainingMaxes,
        progressKind: entry.progressKind,
      });
      if (!silent) alert(`✅ Período guardado: ${currentDate}`);
    } catch (e) {
      console.error('[History] Error guardando período:', e);
    }
  };

  // Auto-guardar período en DB cuando cambian TMs, RMs o logs (debounce 500ms)
  const periodSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user) return;
    periodSaveRef.current && clearTimeout(periodSaveRef.current);
    periodSaveRef.current = setTimeout(() => {
      saveCurrentPeriod(true);
      periodSaveRef.current = null;
    }, 500);
    return () => {
      if (periodSaveRef.current) clearTimeout(periodSaveRef.current);
    };
  }, [tms, rms, routines, activeRoutineId, user?.id]);

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginView onLogin={handleLoginComplete} toast={toast} />
        <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      </>
    );
  }

  if (user && addAccountMode) {
    return (
      <>
        <LoginView
          variant="addAccount"
          onCancel={() => setAddAccountMode(false)}
          onLogin={(userData) => {
            handleLoginComplete(userData);
            setAddAccountMode(false);
            setView('settings');
          }}
          toast={toast}
        />
        <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      </>
    );
  }

  const handleToggleSameTemplateAllWeeks = () => {
    const routine = routines.find((r) => r.id === activeRoutineId);
    if (!routine) return;
    const newVal = !routine.sameTemplateAllWeeks;
    updateActiveRoutine((r) => ({ ...r, sameTemplateAllWeeks: newVal }));
    // Persistir inmediatamente en DB
    if (!routine.id.startsWith('routine-')) {
      apiPut(`/api/routines/${routine.id}`, { sameTemplateAllWeeks: newVal })
        .then(() => {
          bumpRoutineDataRefresh();
        })
        .catch((e) => {
          console.error('[Routine] Error guardando Mes/Sem:', e);
          toast.error('No se pudo guardar la preferencia Mes/Sem');
        });
    }
  };

  const handleSkipWeek = async (weekNumber: number, mode: 'shift' | 'skip_only') => {
    const routine = routines.find((r) => r.id === activeRoutineId);
    if (!routine || routine.id.startsWith('routine-')) return;
    const current = routine.skippedWeeks || [];
    let next: number[];
    if (mode === 'skip_only') {
      next = current.includes(weekNumber) ? current.filter(w => w !== weekNumber) : [...current, weekNumber];
    } else {
      next = [...current, weekNumber].filter((v, i, a) => a.indexOf(v) === i);
    }
    updateActiveRoutine((r) => ({ ...r, skippedWeeks: next }));
    try {
      await apiPut(`/api/routines/${routine.id}`, { skippedWeeks: next });
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error guardando semanas saltadas:', e);
    }
  };

  const handleToggleHiddenRoutine = async (routineId: string) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;
    const newHidden = !routine.hiddenFromSocial;
    setRoutines((prev) =>
      prev.map((r) => (r.id === routineId ? { ...r, hiddenFromSocial: newHidden } : r))
    );
    // Persistir inmediatamente en DB (cualquier rutina, no solo la activa)
    if (!routineId.startsWith('routine-')) {
      try {
        await apiPut(`/api/routines/${routineId}`, { hiddenFromSocial: newHidden });
        bumpSocialRefresh();
      } catch (e) {
        setRoutines((prev) =>
          prev.map((r) => (r.id === routineId ? { ...r, hiddenFromSocial: routine.hiddenFromSocial } : r))
        );
        toast.error('No se pudo guardar la visibilidad');
      }
    }
  };

  const handleUpdateDayType = (weekId: string, dayId: string, type: DayType) => {
    const routine = routines.find(r => r.id === activeRoutineId);
    const res0 = routine ? resolveWeekDayIndex(routine, weekId, dayId) : null;
    const dbDayId = res0 ? routine!.weeks[res0.weekIdx]?.days[res0.dayIdx]?._dbId : undefined;

    updateActiveRoutine((r) => {
      const resolved = resolveWeekDayIndex(r, weekId, dayId);
      if (!resolved) return r;
      const { weekIdx, dayIdx } = resolved;
      return applyRoutineChangeWithVersioning(r, weekIdx, dayIdx, (day) => ({ ...day, type }));
    });

    if (dbDayId && routine?.id && !routine.id.startsWith('routine-')) {
      apiPatch(`/api/routines/${routine.id}/days/${dbDayId}`, { dayType: type })
        .catch((e: any) => console.error('[Routine] Error updating day type:', e));
    } else if (routine?.id && !routine.id.startsWith('routine-')) {
      schedulePlanBulkSync();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden px-2 max-[400px]:px-2 sm:px-4 md:px-6 py-2 sm:py-4 relative">
      {isSwitchingAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <motion.div 
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        dragDirectionLock
        onDragEnd={handleDragEnd}
        className="min-h-screen touch-pan-y backdrop-blur-2xl bg-white/50 dark:bg-slate-900/50"
      >
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <DashboardView 
              key={`dashboard-${activeRoutineId}`}
              user={user}
              history={sortedHistory}
              rms={rms}
              trainingMaxes={tms}
              activeRoutineName={activeRoutine?.name || 'Rutina activa'}
              activeRoutineId={activeRoutineId}
              challenges={challenges}
              checkIns={checkIns}
              onUpdateUser={handleUpdateUser}
              onOpenProgram={() => {
                setProgramScreen('plan');
                setView('program');
              }}
              onOpenSocial={(tab, opts) => goToSocial(tab, opts)}
              onJoinFriendCheckIn={handleJoinFriendCheckIn}
            />
          )}
          {view === 'program' && (
            programScreen === 'routines' ? (
              <RoutineManagerView
                key="routine-manager"
                routines={[...routines]
                  .sort((a, b) => (a.id === activeRoutineId ? -1 : b.id === activeRoutineId ? 1 : 0))
                  .map((routine) => ({
                    id: routine.id,
                    name: routine.name,
                    isActive: routine.id === activeRoutineId,
                    hiddenFromSocial: !!routine.hiddenFromSocial,
                  }))}
                onBack={() => setProgramScreen('plan')}
                onActivateRoutine={handleSelectRoutine}
                onCreateRoutine={handleCreateRoutine}
                onRenameRoutine={handleRenameRoutine}
                onDeleteRoutine={handleDeleteRoutine}
                onToggleHiddenRoutine={handleToggleHiddenRoutine}
              />
            ) : (
              <TrainingPlanView 
                key="program"
                activeRoutineName={activeRoutine?.name || 'Rutina activa'}
                sameTemplateAllWeeks={activeRoutine?.sameTemplateAllWeeks !== false}
                cycleLength={activeRoutine?.cycleLength ?? 4}
                onToggleSameTemplateAllWeeks={handleToggleSameTemplateAllWeeks}
                trainingMaxes={tms}
                tmHistory={sortedHistory}
                tmAutoHighlightIds={
                  (viewAsOfWeek ?? currentWeekOfYear) === currentWeekOfYear ? tmAutoHighlightIds : []
                }
                internalExerciseMaxes={internalExerciseMaxes}
                weeks={weeks}
                logs={logs}
                viewAsOfWeek={viewAsOfWeek}
                currentWeekOfYear={currentWeekOfYear}
                onViewAsOfWeekChange={setViewAsOfWeek}
                isHistoryMode={isHistoryMode}
                versionWeeks={activeRoutine?.versions?.map(v => v.effectiveFromWeek) ?? []}
                onUpdateTM={handleUpdateTM}
                onCreateTM={handleCreateTM}
                planViewAnchorRef={planViewAnchorRef}
                onRemoveTM={handleRemoveTM}
                onAddExercise={isHistoryMode ? () => {} : handleAddExercise}
                onRemoveExercise={isHistoryMode ? () => {} : handleRemoveExercise}
                onUpdateExercise={isHistoryMode ? () => {} : handleUpdateExercise}
                onRoutinePlanFlush={
                  isHistoryMode
                    ? undefined
                    : async () => {
                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                        const r = routineForSyncRef.current;
                        if (!r || r.id !== activeRoutineId) return;
                        rescanTmBumpsFromLogs(r);
                        await syncDirtyLogsForRoutine(r);
                      }
                }
                onUpdateDayType={isHistoryMode ? () => {} : handleUpdateDayType}
                onLogChange={isHistoryMode ? () => {} : handleLogChange}
                onSetLogChange={isHistoryMode ? () => {} : handleSetLogChange}
                onMarkCompleted={isHistoryMode ? () => {} : handleMarkCompleted}
                onOpenRoutineManager={() => setProgramScreen('routines')}
                onExport={exportToExcel}
                skippedWeeks={activeRoutine?.skippedWeeks ?? []}
                onSkipWeek={handleSkipWeek}
              />
            )
          )}
          {view === 'social' && (
            <SocialView 
              key={socialTab}
              user={user}
              friendsList={friendsList}
              requests={friends}
              challenges={challenges}
              checkIns={checkIns}
              initialTab={socialTab}
              openCheckInModalSignal={openCheckInModalSignal}
              onAccept={handleAcceptFriend}
              onReject={handleRejectFriend}
              onSendFriendRequest={handleSendFriendRequest}
              onCreateChallenge={handleCreateChallenge}
              onJoinChallenge={handleJoinChallenge}
              onCheckIn={handleCheckIn}
              onCheckInUpdate={handleCheckInUpdate}
              onCheckInDelete={handleCheckInDelete}
              onRefreshChallenges={refreshChallenges}
              onCopyFriendRoutine={handleCopyFriendRoutine}
              onUnfriend={handleUnfriend}
            />
          )}
          {view === 'settings' && (
            <SettingsView 
              key="settings"
              user={user}
              onUpdateUser={handleUpdateUser}
              onLogout={handleLogout}
              savedAccountSummaries={toSummaries(savedAccountsState)}
              onSwitchAccount={(id) => void switchToAccount(id)}
              onAddAccount={() => setAddAccountMode(true)}
              onRemoveSavedAccount={handleRemoveSavedAccount}
            />
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* Floating Bottom Navigation */}
      <nav className="fixed bottom-1 max-[360px]:bottom-1 sm:bottom-6 left-1 right-1 max-[360px]:left-1 max-[360px]:right-1 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 max-w-md sm:max-w-none mx-auto bg-white/25 dark:bg-slate-900/25 backdrop-blur-[32px] sm:backdrop-blur-[48px] border border-white/15 dark:border-slate-500/15 shadow-2xl shadow-black/5 dark:shadow-black/20 rounded-xl max-[360px]:rounded-lg sm:rounded-2xl md:rounded-[2rem] px-1.5 max-[360px]:px-1 sm:px-6 py-1.5 max-[360px]:py-1 sm:py-3 flex items-center justify-between sm:gap-6 gap-0.5 max-[360px]:gap-0 z-50">
        <button 
          onClick={() => setView('dashboard')} 
          className={cn(
            "flex flex-col items-center gap-0.5 sm:gap-1 transition-all min-w-0 flex-1 min-h-[44px] justify-center py-1",
            view === 'dashboard' ? "text-indigo-600 scale-105 sm:scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <LayoutDashboard className="size-5 max-[360px]:size-4 sm:size-5" strokeWidth={view === 'dashboard' ? 2.5 : 2} />
          <span className="text-[7px] max-[360px]:text-[6px] sm:text-[10px] font-black tracking-widest uppercase truncate w-full text-center">Progreso</span>
        </button>
        <button 
          onClick={() => {
            setProgramScreen('plan');
            setView('program');
          }} 
          className={cn(
            "flex flex-col items-center gap-0.5 sm:gap-1 transition-all min-w-0 flex-1 min-h-[44px] justify-center py-1",
            view === 'program' ? "text-indigo-600 scale-105 sm:scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <Dumbbell className="size-5 max-[360px]:size-4 sm:size-5" strokeWidth={view === 'program' ? 2.5 : 2} />
          <span className="text-[7px] max-[360px]:text-[6px] sm:text-[10px] font-black tracking-widest uppercase truncate w-full text-center">Rutina</span>
        </button>
        <button 
          type="button"
          onClick={() => goToSocial('friends')} 
          className={cn(
            "flex flex-col items-center gap-0.5 sm:gap-1 transition-all min-w-0 flex-1 min-h-[44px] justify-center py-1",
            view === 'social' ? "text-indigo-600 scale-105 sm:scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <Users className="size-5 max-[360px]:size-4 sm:size-5" strokeWidth={view === 'social' ? 2.5 : 2} />
          <span className="text-[7px] max-[360px]:text-[6px] sm:text-[10px] font-black tracking-widest uppercase truncate w-full text-center">Social</span>
        </button>
        <button 
          onClick={() => setView('settings')} 
          className={cn(
            "flex flex-col items-center gap-0.5 sm:gap-1 transition-all min-w-0 flex-1 min-h-[44px] justify-center py-1",
            view === 'settings' ? "text-indigo-600 scale-105 sm:scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <Settings className="size-5 max-[360px]:size-4 sm:size-5" strokeWidth={view === 'settings' ? 2.5 : 2} />
          <span className="text-[7px] max-[360px]:text-[6px] sm:text-[10px] font-black tracking-widest uppercase truncate w-full text-center">Ajustes</span>
        </button>
      </nav>
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

