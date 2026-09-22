import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { MotionConfig, motion } from 'motion/react';
import { User as UserIcon, Users, Dumbbell, Plus, Trophy } from 'lucide-react';
import { ComposeSheet } from '@/src/components/ComposeSheet';
import { StoryCamera } from '@/src/components/social/StoryCamera';
import { AppNoticeHost } from '@/src/components/AppNoticeHost';
import { showAppError, showAppOk } from '@/src/lib/appNotice';

// Views
import { LoginView } from '@/src/views/Login';
import { DashboardView } from '@/src/views/Dashboard';
import { TrainingPlanView } from '@/src/views/TrainingPlan';
import { RoutineManagerView } from '@/src/views/RoutineManager';
import { SocialView } from '@/src/views/Social';
import { normalizeSocialTab, type SocialTab } from '@/src/lib/socialTab';
import { clearSavedAppNav, navFromLaunchUrl, readSavedAppNav, writeSavedAppNav } from '@/src/lib/appNavState';
import { ProfileView } from '@/src/views/Profile';

// Components
import { useRealtimeUpdates } from '@/src/hooks/useRealtimeUpdates';
import { isRealtimeOpen } from '@/src/lib/chatRealtime';
import { SLIME_TAP, STICKY } from '@/src/lib/motionPresets';

// Types
import { 
  RMData, 
  LogEntry, 
  HistoryEntry, 
  ViewType, 
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
import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiUpload, getApiBaseUrl } from '@/src/lib/api';
import { LoadingBlock, Spinner } from '@/src/components/ui/Spinner';
import { cn } from '@/src/lib/utils';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import { computeRoutineProgressTotal } from '@/src/lib/routineProgressTotal';
import {
  calendarMonth1FromDateISO,
  dateISOFromYearWeekDay,
  dateISOToUtcNoonISO,
  entryDateISO,
} from '@/src/lib/calendarWeekDate';
import {
  applySmartTmCorrection,
  buildBaselineHistoryEntry,
  inferTmChangeKind,
  lastHistoryTmBeforePeak,
  TM_BASELINE_DATE_ISO,
} from '@/src/lib/historyTm';
import { mergeRoutineHistoryFromServer } from '@/src/lib/routineHistoryMerge';
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
import {
  cloneFriendRoutineWeeks,
  parseSameTemplateAllWeeks,
  DEFAULT_TM_SEED_ZERO,
  mergeFriendProfileAndPlanTmSeeds,
  hasAnyLinkedExerciseInWeeks,
} from '@/src/lib/cloneFriendRoutine';
import { buildPlanPatchPayload } from '@/src/lib/planSyncPayload';
import { mergeCoachImportIntoRoutine } from '@/src/lib/coachPlan/applyCoachPlan';
import { moveMergedExerciseRow } from '@/src/lib/exerciseScheme';
import { upsertDayShift, type CalendarDayShift } from '@/src/lib/calendarDayShift';
import type { ImportCoachPlanResult, LastCoachImport } from '@/src/components/ImportCoachPlanModal';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import { getWebPushEndpoint } from '@/src/pwa/notifications';
import {
  loadSavedAccounts,
  upsertAccount,
  removeAccount,
  setActiveAccountId,
  migrateLegacyIfNeeded,
  toSummaries,
  type SavedAccount,
} from '@/src/lib/savedAccounts';
import { checkInExpiresAtMs, expiresAtFromSaved } from '@/src/lib/checkInExpires';
import { hasUnseenMark, markSeenIds } from '@/src/lib/unseenMarks';
import { silentRefreshToken } from '@/src/lib/authRefresh';

function mapCheckInFromApi(c: Record<string, unknown>): GymCheckIn {
  const ts =
    typeof c.timestamp === 'number'
      ? c.timestamp
      : new Date(String(c.timestamp)).getTime();
  const time = String(c.time ?? '00:00');
  let expiresAt: number | undefined;
  if (typeof c.expiresAt === 'number') expiresAt = c.expiresAt;
  else if (c.expiresAt != null) expiresAt = new Date(String(c.expiresAt)).getTime();
  else expiresAt = checkInExpiresAtMs(new Date(ts), time);
  return {
    id: String(c.id ?? c._id),
    userId: String(c.userId),
    userName: String(c.userName ?? 'Usuario'),
    avatar: c.avatar != null ? String(c.avatar) : undefined,
    gymName: String(c.gymName ?? ''),
    time,
    timestamp: ts,
    expiresAt,
  };
}

const EMPTY_RMS: RMData = {
  bench: 0,
  squat: 0,
  deadlift: 0
};

function mergeTrainingMaxesFromServer(prev: TrainingMax[], server: TrainingMax[]): TrainingMax[] {
  if (!server.length) return prev;
  if (!prev.length) return server;
  return server.map(tm => {
    const p = prev.find(x => x.id === tm.id);
    if (p && p.value > tm.value) return { ...tm, value: p.value };
    return tm;
  });
}

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
  cycleAnchorISO?: string;
  weekStartsOn?: number;
  skippedWeeks?: number[];
  shiftedAtCalendarWeeks?: number[];
  calendarDayShifts?: CalendarDayShift[];
  /** ISO del servidor: inicio de la rutina (gráficos en 0 antes de esta fecha). */
  createdAt?: string;
  /** ISO: referencia para % en gráficos (sin cambiar TM). */
  progressCheckpointAt?: string;
  /** Snapshot de TM al checkpoint ({ tmId: valor }). */
  progressCheckpointTms?: Record<string, number>;
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
  return materialize52WeeksFromFourTemplateWeeks(tpl.length <= cl ? tpl : deriveBaseTemplateFromWeeks(tpl, cl), cl);
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
  /** Ciclo con el que se guardó esa versión: al cambiar de ciclo, las semanas ya pasadas se siguen leyendo igual. */
  const vcl = Math.max(1, Math.min(52, best.cycleLength ?? (w.length < 52 ? w.length : cl)));
  if (w.length <= vcl) return materialize52WeeksFromFourTemplateWeeks(w, vcl);
  if (w.length >= 52) return w;
  return materialize52WeeksFromFourTemplateWeeks(deriveBaseTemplateFromWeeks(w, vcl), vcl);
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
    const cl = routine.cycleLength ?? 4;
    const expanded =
      versionWeeksTpl.length <= cl
        ? materialize52WeeksFromFourTemplateWeeks(versionWeeksTpl, cl)
        : versionWeeksTpl.length >= 52
          ? versionWeeksTpl
          : materialize52WeeksFromFourTemplateWeeks(deriveBaseTemplateFromWeeks(versionWeeksTpl, cl), cl);
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

function loggedPeaksByTm(
  routine: RoutinePlan,
  tmList: TrainingMax[],
  weeks: TrainingWeek[]
): Map<string, number> {
  const peaks = new Map<string, number>();
  const roundTo25 = (n: number) => Math.round(n / 2.5) * 2.5;
  for (const week of weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        const linked = resolveTmForAutoBump(ex, tmList);
        if (!linked) continue;
        const lid = routineLogKeyFromIds(week, day, ex);
        const l = resolveLogEntryForMerge(routine.logs, lid);
        if (!l?.sets) continue;
        for (const set of l.sets) {
          // Solo cuenta lo que el atleta ha marcado como hecho: el peso del Word no sube el RM.
          if (!set.completed) continue;
          let cand = 0;
          if (linked.mode === 'weight') {
            const w = set.weight ?? 0;
            if (w > 0) cand = roundTo25(w);
          } else {
            const val = set.reps ?? 0;
            if (val > 0) cand = Math.round(val);
          }
          if (cand > (peaks.get(linked.id) ?? 0)) peaks.set(linked.id, cand);
        }
      }
    }
  }
  return peaks;
}

function syncTmsFromLoggedPeaks(
  tms: TrainingMax[],
  peaks: Map<string, number>,
  autoBump: Map<string, number>,
  history: HistoryEntry[]
): { next: TrainingMax[]; autoBump: Map<string, number>; bumpedIds: string[]; revertedIds: string[] } {
  const nextAuto = new Map(autoBump);
  const bumpedIds: string[] = [];
  const revertedIds: string[] = [];
  const next = tms.map((tm) => {
    const peak = peaks.get(tm.id) ?? 0;
    if (peak > tm.value) {
      nextAuto.set(tm.id, peak);
      bumpedIds.push(tm.id);
      return { ...tm, value: peak };
    }
    if (nextAuto.get(tm.id) === tm.value && peak < tm.value) {
      const floor = lastHistoryTmBeforePeak(history, tm.id, tm.value) ?? 0;
      const revertTo = Math.max(peak, floor);
      if (revertTo > 0 && revertTo < tm.value) {
        nextAuto.delete(tm.id);
        revertedIds.push(tm.id);
        return { ...tm, value: revertTo };
      }
    }
    return tm;
  });
  return { next, autoBump: nextAuto, bumpedIds, revertedIds };
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
  if (updates.weightPerSet !== undefined) out.weightPerSet = updates.weightPerSet;
  if (updates.mode !== undefined) out.mode = updates.mode;
  if (updates.linkedTo !== undefined) out.linkedTo = updates.linkedTo;
  if (updates.targetRpe !== undefined) out.targetRpe = updates.targetRpe;
  if (updates.coachNote !== undefined) out.coachNote = updates.coachNote;
  if (updates.setScheme !== undefined) out.setScheme = updates.setScheme;
  if (updates.repsPerSet !== undefined) out.repsPerSet = updates.repsPerSet;
  if (updates.rpePerSet !== undefined) out.rpePerSet = updates.rpePerSet;
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

type CreateRoutinePlanOptions = {
  empty?: boolean;
  sameTemplateAllWeeks?: boolean;
  cycleLength?: number;
  cycleAnchorISO?: string;
  weekStartsOn?: number;
};

const createRoutinePlan = (id: string, name: string, options?: boolean | CreateRoutinePlanOptions) => {
  const opts: CreateRoutinePlanOptions =
    typeof options === 'boolean' ? { empty: options } : options ?? {};
  const sameTemplateAllWeeks = opts.sameTemplateAllWeeks !== false;
  const cycleLength = opts.cycleLength ?? 4;
  const weeks = generateEmptyWeeks();
  const tpl = deriveBaseTemplateFromWeeks(weeks, cycleLength);
  return {
    id,
    name,
    sameTemplateAllWeeks,
    hiddenFromSocial: false,
    cycleLength,
    cycleAnchorISO: opts.cycleAnchorISO,
    weekStartsOn: opts.weekStartsOn ?? 1,
    skippedWeeks: [] as number[],
    createdAt: new Date().toISOString(),
    weeks,
    versions: [{ effectiveFromWeek: 1, weeks: tpl }],
    baseTemplate: tpl,
    weekTypeOverrides: [],
    logs: {},
  };
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [view, setView] = useState<ViewType>(() => navFromLaunchUrl()?.view || readSavedAppNav()?.view || 'dashboard');
  /** Una vez visitada, la pantalla se queda montada: al volver no se recarga de cero. */
  const [aliveViews, setAliveViews] = useState<Record<ViewType, boolean>>(() => {
    const current = navFromLaunchUrl()?.view || readSavedAppNav()?.view || 'dashboard';
    return {
      dashboard: true,
      program: current === 'program',
      social: current === 'social',
      settings: current === 'settings',
    };
  });
  useEffect(() => {
    setAliveViews((prev) => (prev[view] ? prev : { ...prev, [view]: true }));
  }, [view]);
  const [dashboardEnterKey, setDashboardEnterKey] = useState(0);
  const [tmsLoading, setTmsLoading] = useState(false);

  // State
  const [rms, setRms] = useState<RMData>(EMPTY_RMS);
  const [tms, setTms] = useState<TrainingMax[]>([]);
  /** TM inferidos por nombre de ejercicio (sin vínculo a TM de rutina). */
  const [internalExerciseMaxes, setInternalExerciseMaxes] = useState<InternalExerciseMax[]>([]);
  /** Evita cierres obsoletos en handleSetLogChange (varias series antes del siguiente render). */
  const tmsRef = useRef<TrainingMax[]>(tms);
  tmsRef.current = tms;
  const rmsRef = useRef<RMData>(rms);
  rmsRef.current = rms;
  const internalExerciseMaxesRef = useRef<InternalExerciseMax[]>(internalExerciseMaxes);
  internalExerciseMaxesRef.current = internalExerciseMaxes;
  const [routines, setRoutines] = useState<RoutinePlan[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState('');
  useEffect(() => {
    if (view !== 'dashboard') return;
    setDashboardEnterKey(k => k + 1);
  }, [view, activeRoutineId]);
  /** Ref para ignorar respuestas de fetch de TM/historial si el usuario ya cambió de rutina. */
  const activeRoutineIdRef = useRef(activeRoutineId);
  activeRoutineIdRef.current = activeRoutineId;
  /** Clave anterior user::routine; el cleanup del efecto la actualiza para detectar solo cambio real de rutina/usuario. */
  const prevRoutineDataKeyRef = useRef('');
  const [programScreen, setProgramScreen] = useState<'plan' | 'routines'>(
    () => navFromLaunchUrl()?.programScreen || readSavedAppNav()?.programScreen || 'plan'
  );
  /** Tras crear una rutina con «tengo un documento»: abre el importador en el plan. */
  const [openImportAfterCreate, setOpenImportAfterCreate] = useState(0);
  const [openCreateRoutineSignal, setOpenCreateRoutineSignal] = useState(0);
  const [viewAsOfWeek, setViewAsOfWeek] = useState<number | null>(null); // null = presente, número = viaje en el tiempo
  const [friends, setFriends] = useState<FriendRequest[]>([]);
  const [friendsList, setFriendsList] = useState<Friend[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [checkIns, setCheckIns] = useState<GymCheckIn[]>([]);
  const [socialTab, setSocialTab] = useState<SocialTab>(
    () => navFromLaunchUrl()?.socialTab || readSavedAppNav()?.socialTab || 'chat'
  );
  const [socialFriendsFilter, setSocialFriendsFilter] = useState<'all' | 'following' | 'followers'>(
    () => navFromLaunchUrl()?.friendsFilter || readSavedAppNav()?.friendsFilter || 'all'
  );
  useEffect(() => {
    if (!user) return;
    writeSavedAppNav({
      view,
      socialTab,
      programScreen,
      friendsFilter: socialFriendsFilter,
    });
  }, [user?.id, view, socialTab, programScreen, socialFriendsFilter]);
  const [savedAccountsState, setSavedAccountsState] = useState<SavedAccount[]>(() => loadSavedAccounts());
  const [addAccountMode, setAddAccountMode] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const mapUserFromMePayload = (data: { user: any }): User => {
    const u = data.user;
    return {
      id: String(u._id || u.id),
      name: u.name || 'Atleta',
      email: u.email,
      avatar: u.avatar || '',
      bodyWeight: u.bodyWeight ?? 80,
      gender: u.gender === 'mujer' || u.gender === 'hombre' ? u.gender : undefined,
      theme: (u.theme ||
        (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light')) as 'light' | 'dark',
      progressMode:
        u.progressMode === 'year'
          ? 'year'
          : u.progressMode === 'month' || u.progressMode === 'week'
            ? 'month'
            : undefined,
      mbMode: !!u.mbMode,
      workoutReminderOn: u.workoutReminderOn !== false,
      workoutReminderTime: u.workoutReminderTime || '10:00',
      timezone: u.timezone,
    };
  };

  const [openCheckInModalSignal, setOpenCheckInModalSignal] = useState(0);
  const [openCreateChallengeSignal, setOpenCreateChallengeSignal] = useState(0);
  /** Tick that forces social data refresh (friends, requests, check-ins, challenges). */
  const [socialRefreshTick, setSocialRefreshTick] = useState(0);
  const [storyRefreshTick, setStoryRefreshTick] = useState(0);
  const lastSocialBumpAtRef = useRef(0);
  const bumpSocialRefresh = useCallback((opts?: { stories?: boolean }) => {
    const now = Date.now();
    if (now - lastSocialBumpAtRef.current < 4000) return;
    lastSocialBumpAtRef.current = now;
    setSocialRefreshTick(t => t + 1);
    if (opts?.stories) setStoryRefreshTick(t => t + 1);
  }, []);
  const bumpAllSocial = useCallback(() => bumpSocialRefresh({ stories: true }), [bumpSocialRefresh]);
  /** Refetch TM, TM internos e historial (progreso / gráficas) sin cerrar sesión. */
  const [routineDataRefreshTick, setRoutineDataRefreshTick] = useState(0);
  const lastRoutineBumpAtRef = useRef(0);
  const bumpRoutineDataRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRoutineBumpAtRef.current < 4000) return;
    lastRoutineBumpAtRef.current = now;
    setRoutineDataRefreshTick(t => t + 1);
  }, []);

  // SSE real-time: server pushes events → bump the corresponding refresh tick
  useRealtimeUpdates(user?.id ?? null, {
    onSocialUpdate: bumpAllSocial,
    onCheckinUpdate: bumpSocialRefresh,
    onChallengeUpdate: bumpSocialRefresh,
    onRoutineUpdate: bumpRoutineDataRefresh,
  });

  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [checkInIntent, setCheckInIntent] = useState<'now' | 'later' | null>(null);
  const [socialBackTo, setSocialBackTo] = useState<'profile' | 'dashboard' | 'chat'>('dashboard');
  const [socialNavTick, setSocialNavTick] = useState(0);
  const [chatConversationOpen, setChatConversationOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  useEffect(() => {
    if (view !== 'social') setChatConversationOpen(false);
  }, [view]);

  const goToSocial = useCallback(
    (
      tab?: SocialTab,
      opts?: {
        openCheckInModal?: boolean;
        openCreateChallenge?: boolean;
        gymNow?: boolean;
        from?: 'profile' | 'dashboard' | 'chat';
        friendsFilter?: 'all' | 'following' | 'followers';
      }
    ) => {
      const next = normalizeSocialTab(tab);
      setSocialTab(next);
      setSocialFriendsFilter(opts?.friendsFilter ?? 'all');
      setSocialNavTick(t => t + 1);
      setView('social');
      if (opts?.from) {
        setSocialBackTo(opts.from);
      } else if (next === 'friends') {
        setSocialBackTo(view === 'settings' ? 'profile' : 'dashboard');
      } else if (next === 'challenges' || next === 'checkins' || next === 'chat') {
        setSocialBackTo(view === 'settings' ? 'profile' : 'dashboard');
      } else {
        setSocialBackTo('dashboard');
      }
      if (opts?.openCheckInModal || opts?.gymNow) {
        setCheckInIntent(opts?.gymNow ? 'now' : 'later');
        setOpenCheckInModalSignal((s) => s + 1);
      }
      if (opts?.openCreateChallenge) {
        setOpenCreateChallengeSignal((s) => s + 1);
      }
    },
    [view]
  );

  const openProgramPlan = useCallback(() => {
    setProgramScreen(routines.length === 0 ? 'routines' : 'plan');
    setView('program');
  }, [routines.length]);

  const openCreateRoutine = useCallback(() => {
    setProgramScreen('routines');
    setView('program');
    setOpenCreateRoutineSignal(n => n + 1);
  }, []);

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
    const nowIso = new Date().toISOString();
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
      trainingMaxes: tmValues,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  };

  /**
   * Guarda un punto del historial para que Progreso pueda dibujar el escalón del RM.
   * Sin esto, el PUT del maximal cambia el número actual y el gráfico se queda plano.
   */
  const persistHistorySnapshot = async (entry: HistoryEntry) => {
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
    try {
      await apiPost('/api/training-maxes/save-period', {
        routineId: activeRoutineId,
        date: entry.date,
        week: entry.week,
        year: entry.year,
        dayOfWeek: entry.dayOfWeek ?? 0,
        dateISO: entry.dateISO,
        month: entry.month,
        rms: entry.rms,
        total: entry.total,
        trainingMaxes: entry.trainingMaxes,
        progressKind: entry.progressKind,
      });
    } catch (e) {
      console.error('[History] Error guardando snapshot de RM:', e);
    }
  };

  /**
   * Al crear o batir un RM: deja el valor viejo como origen (si aún no existe) y
   * escribe el de hoy. Así la línea de Progreso sube en el punto actual, no en todo.
   */
  const recordTmInHistory = (
    updatedTms: TrainingMax[],
    updatedRms: RMData,
    previousTms: TrainingMax[],
    previousRms: RMData
  ) => {
    const anchor = planViewAnchorRef.current;
    const today = {
      ...createHistoryEntry(monthLabelFromDateISO(anchor.dateISO), updatedTms, updatedRms, {
        week: anchor.week,
        year: anchor.year,
        dayOfWeek: anchor.dayOfWeek,
      }),
      routineId: activeRoutineId,
    };
    const needsOrigin = !historyRef.current.some(h => entryDateISO(h) === TM_BASELINE_DATE_ISO);
    const origin = needsOrigin && previousTms.length
      ? buildBaselineHistoryEntry(activeRoutineId, previousTms, previousRms, 'Origen')
      : null;

    setHistory(prev => {
      let next = [...prev];
      if (origin && !next.some(h => entryDateISO(h) === TM_BASELINE_DATE_ISO)) {
        next = [origin, ...next];
      }
      const sameDay = (e: HistoryEntry) =>
        entryDateISO(e) !== TM_BASELINE_DATE_ISO &&
        e.year === anchor.year &&
        e.week === anchor.week &&
        (e.dayOfWeek ?? 0) === anchor.dayOfWeek;
      next = next.filter(e => !sameDay(e));
      next.push(today);
      return next.sort((a, b) => {
        const c = entryDateISO(a).localeCompare(entryDateISO(b));
        if (c !== 0) return c;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
    });

    void (async () => {
      if (origin) await persistHistorySnapshot(origin);
      await persistHistorySnapshot(today);
    })();
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
  const hasRoutine = routines.length > 0 && !!activeRoutine;
  /** Nombres únicos de ejercicios de la rutina activa (sugerencias al crear un torneo). */
  const activeRoutineExerciseNames = useMemo(() => {
    if (!activeRoutine) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const week of activeRoutine.weeks) {
      for (const day of week.days) {
        for (const ex of day.exercises) {
          const name = ex.name?.trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          names.push(name);
        }
      }
    }
    return names;
  }, [activeRoutine]);
  /** Siempre la rutina activa más reciente: el flush del debounce de sync debe leer esto, no el closure del efecto (evita guardar sin logs nuevos). */
  const routineForSyncRef = useRef<RoutinePlan | null>(null);
  routineForSyncRef.current = activeRoutine ?? null;
  /** Todas las rutinas: el flush debe poder guardar una rutina que ya no está activa. */
  const routinesRef = useRef<RoutinePlan[]>(routines);
  routinesRef.current = routines;
  /** Claves de log modificadas por rutina (sync incremental a WorkoutSession en Mongo). */
  const dirtyLogKeysByRoutineRef = useRef<Map<string, Set<string>>>(new Map());
  const planBulkSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** PATCH /plan real. Separado del debounce para poder forzarlo al salir de la pestaña. */
  const runPlanBulkSync = useCallback(async () => {
    const r = routineForSyncRef.current;
    if (!r || (r.id.startsWith('routine-') && r.id.length < 20)) return;
    try {
      const body = buildPlanPatchPayload(r);
      const res = await apiPatch<Record<string, unknown>>(`/api/routines/${r.id}/plan`, body);
      const plan = expandRoutineFromApi({
        ...res,
        progressCheckpointAt:
          (res as any).progressCheckpointAt ?? r.progressCheckpointAt,
        progressCheckpointTms:
          (res as any).progressCheckpointTms ?? r.progressCheckpointTms,
      });
      // La respuesta trae los logs de Mongo; las series aún sin sincronizar solo viven
      // en memoria, así que se conservan para no perderlas al reemplazar la rutina.
      const dirtyKeys = dirtyLogKeysByRoutineRef.current.get(r.id);
      if (dirtyKeys?.size) {
        const preserved: Record<string, LogEntry> = { ...plan.logs };
        for (const k of dirtyKeys) {
          const local = r.logs[k];
          if (local) preserved[k] = local;
        }
        plan.logs = preserved;
      }
      setRoutines((prev) => prev.map((x) => (x.id === plan.id ? plan : x)));
    } catch (e) {
      console.error('[Routine] Error sync plan (fallback):', e);
    }
  }, []);

  /** Si no hay _dbId en ejercicio/día, el servidor solo recibe cambios vía PATCH /plan. */
  const schedulePlanBulkSync = useCallback(() => {
    if (planBulkSyncTimeoutRef.current) clearTimeout(planBulkSyncTimeoutRef.current);
    planBulkSyncTimeoutRef.current = setTimeout(() => {
      planBulkSyncTimeoutRef.current = null;
      void runPlanBulkSync();
    }, 500);
  }, [runPlanBulkSync]);

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
      const sentKeys = Object.keys(logsToPatch);
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        await apiPatch(`/api/routines/${routineId}/logs`, { logs: logsToPatch, dateISO: todayISO });
        // Solo las claves realmente enviadas: durante el await el usuario puede haber ensuciado otras.
        const stillDirty = dirtyLogKeysByRoutineRef.current.get(routineId);
        for (const k of sentKeys) stillDirty?.delete(k);
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
  /** El GET de TM no debe disparar save-period: solo los cambios del usuario. */
  const skipNextPeriodSaveRef = useRef(false);
  const lastPeriodSigRef = useRef('');
  /** TM subido solo por series: si corriges el kilo, se deshace el pico. */
  const tmAutoBumpValuesRef = useRef<Map<string, number>>(new Map());
  const tmHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tarjetas TM que acaban de subir desde el registro de series (feedback visual). */
  const [tmAutoHighlightIds, setTmAutoHighlightIds] = useState<string[]>([]);
  /** POST /api/routines (modal Crear rutina). */
  const [routineCreateLoading, setRoutineCreateLoading] = useState(false);
  /** DELETE /api/routines/:id — tarjeta en gestión de rutinas. */
  const [routineDeleteLoadingId, setRoutineDeleteLoadingId] = useState<string | null>(null);
  /** PUT /api/routines/:id/activate — seleccionar rutina. */
  const [routineSwitchingId, setRoutineSwitchingId] = useState<string | null>(null);
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
      // El origen tiene que ser el primer valor guardado, no el RM de hoy:
      // si usamos los TM actuales, un PR reescribe el pasado y el gráfico sale plano.
      const firstSnap = prev.find(h => h.trainingMaxes && Object.keys(h.trainingMaxes).length > 0);
      const originTms = firstSnap
        ? tms.map(tm => ({ ...tm, value: firstSnap.trainingMaxes![tm.id] ?? tm.value }))
        : tms;
      const baseline = buildBaselineHistoryEntry(
        activeRoutineId,
        originTms,
        buildRmsFromLinkedTms(originTms, rms),
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


  /** Dónde empezó el último plan importado, para poder continuarlo cuando llega el documento ampliado. */
  const lastCoachImportKey = (routineId: string) => `pl:lastCoachImport:${routineId}`;
  const [lastCoachImport, setLastCoachImport] = useState<LastCoachImport | null>(null);
  useEffect(() => {
    if (!activeRoutineId) return setLastCoachImport(null);
    try {
      const raw = localStorage.getItem(lastCoachImportKey(activeRoutineId));
      setLastCoachImport(raw ? (JSON.parse(raw) as LastCoachImport) : null);
    } catch {
      setLastCoachImport(null);
    }
  }, [activeRoutineId]);

  const updateActiveRoutine = useCallback((updater: (routine: RoutinePlan) => RoutinePlan) => {
    setRoutines((prev) => prev.map((routine) => (
      routine.id === activeRoutineId ? updater(routine) : routine
    )));
  }, [activeRoutineId]);

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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (user?.mbMode) {
      document.documentElement.setAttribute('data-mb', 'true');
    } else {
      document.documentElement.removeAttribute('data-mb');
    }
  }, [user?.mbMode]);

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

  // Al pulsar una notificación push: pantalla según `data.screen` / `data.tab` (servidor → push.ts)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = (d: { screen?: string; tab?: string }) => {
      const screen = d?.screen ?? 'dashboard';
      if (screen === 'program') {
        setProgramScreen('plan');
        setView('program');
        return;
      }
      if (screen === 'social') {
        setSocialTab(normalizeSocialTab(d.tab));
        setView('social');
        return;
      }
      setView('dashboard');
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
    const params = new URLSearchParams(window.location.search);
    const pwa = params.get('pwa');
    if (pwa === 'plan') handle({ screen: 'program' });
    else if (pwa === 'social') handle({ screen: 'social', tab: params.get('tab') || 'chat' });
    else if (pwa === 'dashboard') handle({ screen: 'dashboard' });
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
      setIsLoadingData(true);
      try {
        const routinesRes = await apiGet<any[]>('/api/routines').catch(() => []);
        if (!routinesRes?.length) {
          setRoutines([]);
          setActiveRoutineId('');
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
              cycleAnchorISO: r.cycleAnchorISO,
              weekStartsOn: r.weekStartsOn,
              skippedWeeks: r.skippedWeeks,
              shiftedAtCalendarWeeks: r.shiftedAtCalendarWeeks,
              calendarDayShifts: r.calendarDayShifts,
              weeks: r.weeks,
              versions: r.versions,
              baseTemplate: r.baseTemplate,
              weekTypeOverrides: r.weekTypeOverrides,
              logs: r.logs,
              progressCheckpointAt: r.progressCheckpointAt,
              progressCheckpointTms: r.progressCheckpointTms,
            })
          );
          setRoutines(plans);
          const active = routinesRes.find((r: any) => r.isActive);
          if (active) setActiveRoutineId(String(active._id || active.id));
        }
        // Historial: se carga por rutina activa en un efecto dedicado.
        // Check-ins y torneos: efecto de socialRefreshTick.
      } catch (e) {
        console.error('[App] Error cargando datos:', e);
        showAppError('No se han podido cargar tus datos. Revisa la conexión.', e);
      } finally {
        setIsLoadingData(false);
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
    if (!activeRoutineId) {
      tmsLoadedForRoutineRef.current = null;
      prevRoutineDataKeyRef.current = '';
      setTms([]);
      setHistory([]);
      setRms({ bench: 0, squat: 0, deadlift: 0 });
      setTmsLoading(false);
      return;
    }
    const key = `${user.id}::${activeRoutineId}`;
    const scopeChanged = prevRoutineDataKeyRef.current !== key;

    if (scopeChanged) {
      if (tmHighlightTimerRef.current) {
        clearTimeout(tmHighlightTimerRef.current);
        tmHighlightTimerRef.current = null;
      }
      setTmAutoHighlightIds([]);
      tmAutoBumpValuesRef.current = new Map();
    }
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) {
      if (scopeChanged) {
        setTms([]);
        setRms({ bench: 0, squat: 0, deadlift: 0 });
        tmsLoadedForRoutineRef.current = activeRoutineId;
      }
      setTmsLoading(false);
      return () => {
        prevRoutineDataKeyRef.current = key;
      };
    }
    if (scopeChanged) {
      tmsLoadedForRoutineRef.current = null;
      setTmsLoading(true);
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
          skipNextPeriodSaveRef.current = true;
          setTms([]);
          setRms({ bench: 0, squat: 0, deadlift: 0 });
          tmsLoadedForRoutineRef.current = rid;
          setTmsLoading(false);
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
        skipNextPeriodSaveRef.current = true;
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
        if (!cancelled && activeRoutineIdRef.current === rid) {
          tmsLoadedForRoutineRef.current = rid;
          setTmsLoading(false);
        }
      } catch (e) {
        console.error('[App] Error cargando TMs de la rutina:', e);
        showAppError('No se han podido cargar los máximos.', e);
        if (!cancelled && activeRoutineIdRef.current === rid) {
          setTms([]);
          setRms({ bench: 0, squat: 0, deadlift: 0 });
          setTmsLoading(false);
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
      if (scopeChanged) setHistory([]);
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
        const mapped: HistoryEntry[] = historyRes.map((h: any) => ({
          date: h.date ?? h.dateLabel ?? '',
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
          updatedAt: h.updatedAt ? String(h.updatedAt) : undefined,
        }));
        setHistory((prev) => mergeRoutineHistoryFromServer(prev, mapped));
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
      // Todas las rutinas con logs pendientes, no solo la activa: al cambiar de rutina
      // el debounce anterior se cancela y sus ediciones se perderían.
      const pendingIds = [...dirtyLogKeysByRoutineRef.current.entries()]
        .filter(([, keys]) => keys.size > 0)
        .map(([id]) => id);
      const toSyncList = pendingIds
        .map((id) => routinesRef.current.find((r) => r.id === id))
        .filter((r): r is RoutinePlan => !!r && !(r.id.startsWith('routine-') && r.id.length < 20));
      if (toSyncList.length === 0) {
        routineSyncRef.current = null;
        return;
      }
      const syncPromise = (async () => {
        for (const r of toSyncList) {
          await syncDirtyLogsForRoutine(r);
        }
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
      if (planBulkSyncTimeoutRef.current) {
        clearTimeout(planBulkSyncTimeoutRef.current);
        planBulkSyncTimeoutRef.current = null;
        void runPlanBulkSync();
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
  }, [runPlanBulkSync]);

  // Amigos/TM ya se cargan por user.id. No dispares otro refresco al montar.

  // Al volver a primer plano: un refresco, no TM + Social a la vez cada vez que se cambia de app.
  const lastVisRefreshAtRef = useRef(0);
  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisRefreshAtRef.current < 45000) return;
      lastVisRefreshAtRef.current = now;
      if (view === 'social') bumpAllSocial();
      else bumpSocialRefresh();
      if (view === 'dashboard' || view === 'program') bumpRoutineDataRefresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user?.id, view, bumpAllSocial, bumpSocialRefresh, bumpRoutineDataRefresh]);

  // Al entrar en Social/Torneos (no al cambiar de chip: eso ya lo cubre socialNavTick en la vista).
  useEffect(() => {
    if (!user || view !== 'social') return;
    bumpAllSocial();
  }, [user?.id, view, bumpAllSocial]);

  useEffect(() => {
    if (!user || view !== 'social') return;
    const id = window.setInterval(() => {
      if (isRealtimeOpen()) return;
      bumpSocialRefresh();
    }, 60000);
    return () => window.clearInterval(id);
  }, [user?.id, view, bumpSocialRefresh]);

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
          setCheckIns(checkInsRes.map((c: any) => mapCheckInFromApi(c)));
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

  /** Quitar check-ins caducados en todos los clientes sin recargar (misma regla que TTL en Mongo). */
  useEffect(() => {
    if (!user) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now();
    for (const ci of checkIns) {
      const exp = ci.expiresAt;
      if (typeof exp !== 'number' || exp <= now) continue;
      const delay = Math.min(Math.max(0, exp - now) + 400, 2147483647);
      timers.push(
        setTimeout(() => {
          setCheckIns((prev) => prev.filter((x) => x.id !== ci.id));
        }, delay)
      );
    }
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [user?.id, checkIns]);

  // Al cambiar de pestaña, scroll al inicio para que el encabezado quede arriba
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view, programScreen]);

  // Handlers
  const handleUpdateUser = useCallback(async (updates: Partial<User>) => {
    const next = { ...updates };
    if (typeof next.avatar === 'string' && next.avatar.startsWith('data:')) {
      try {
        const { uploadAvatarDataUrl } = await import('@/src/lib/avatar');
        next.avatar = await uploadAvatarDataUrl(next.avatar);
      } catch (e) {
        showAppError('No se ha podido guardar la foto de perfil.', e);
        return;
      }
    }
    setUser(prev => (prev ? { ...prev, ...next } : prev));
    const toSync = ['theme', 'name', 'bodyWeight', 'gender', 'avatar', 'progressMode', 'mbMode', 'workoutReminderOn', 'workoutReminderTime', 'timezone'] as const;
    const hasSync = toSync.some(k => k in next);
    if (hasSync) {
      try {
        const payload: Record<string, unknown> = {};
        toSync.forEach(k => { if (k in next) payload[k] = next[k]; });
        const data = await apiPut<{ user: User }>('/api/auth/me', payload);
        if (data?.user) {
          setUser(prev => (prev ? { ...prev, ...data.user } : prev));
        }
        bumpRoutineDataRefresh();
        bumpSocialRefresh();
      } catch (e) {
        console.error('[App] Error al guardar preferencias:', e);
        showAppError('No se han podido guardar los ajustes.', e);
      }
    }
  }, [bumpRoutineDataRefresh, bumpSocialRefresh]);

  const handleCreateChallenge = async (data: {
    title: string;
    description?: string;
    type: 'max_reps' | 'weight' | 'seconds';
    exercise: string;
    exercises?: string[];
    endDate: string;
    usePointsSystem?: boolean;
    bodyWeightScoring?: BodyWeightScoringMode;
    isPrivate?: boolean;
    closeFriendsOnly?: boolean;
    password?: string;
  }) => {
    const created = await apiPost<Challenge>('/api/challenges', data);
    setChallenges(prev => [...prev, created]);
    bumpSocialRefresh();
  };

  const handleJoinChallenge = async (
    id: string,
    payload: { value?: number; lifts?: { exercise: string; value: number }[]; password?: string }
  ) => {
    const updated = await apiPut<Challenge>(`/api/challenges/${id}/join`, payload);
    setChallenges(prev => prev.map(c => c.id === id ? updated : c));
    bumpSocialRefresh();
  };

  const handleDeleteChallenge = async (id: string) => {
    await apiDelete(`/api/challenges/${id}`);
    setChallenges((prev) => prev.filter((c) => c.id !== id));
    bumpSocialRefresh();
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
      setFriends(requestsRes.map(r => ({ ...r, status: r.status ?? 'pending' })));
      setStoryRefreshTick(t => t + 1);
      bumpSocialRefresh();
    } catch (e: any) {
      console.error('[Social] Error aceptando solicitud:', e);
      showAppError('No se ha podido aceptar la solicitud.', e);
      bumpSocialRefresh();
      throw e;
    }
  };

  const handleRejectFriend = async (id: string) => {
    try {
      await apiPut(`/api/social/requests/${id}/reject`, {});
      setFriends(prev => prev.filter(f => f.id !== id));
      bumpSocialRefresh();
    } catch (e: any) {
      console.error('[Social] Error rechazando solicitud:', e);
      showAppError('No se ha podido rechazar la solicitud.', e);
      bumpSocialRefresh();
      throw e;
    }
  };

  const handleUnfriend = async (friendId: string) => {
    try {
      await apiDelete(`/api/social/friends/${friendId}`);
      setFriendsList(prev => prev.filter(f => f.id !== friendId));
      bumpSocialRefresh();
    } catch (e: any) {
      console.error('[Social] Error eliminando amigo:', e);
      showAppError('No se ha podido eliminar al amigo.', e);
      bumpSocialRefresh();
      throw e;
    }
  };

  const handleSendFriendRequest = async (userId: string): Promise<void> => {
    // El error se propaga: Social lo muestra y así no se marca "Enviada" en falso.
    await apiPost('/api/social/requests', { userId });
    const [friendsRes, requestsRes] = await Promise.all([
      apiGet<Friend[]>('/api/social/friends').catch(() => null),
      apiGet<FriendRequest[]>('/api/social/requests').catch(() => null),
    ]);
    if (friendsRes) setFriendsList(friendsRes.filter(f => f.id !== user?.id));
    if (requestsRes) setFriends(requestsRes.map(r => ({ ...r, status: r.status ?? 'pending' })));
    bumpSocialRefresh();
  };

  const refreshChallenges = async () => {
    try {
      const challengesRes = await apiGet<Challenge[]>('/api/challenges');
      setChallenges(challengesRes);
    } catch {
      // ignore
    }
  };

  const socialUnseen = friends.some(r => r.status === 'pending' && !r.needsFollowBack);
  const [tourneySeenTick, setTourneySeenTick] = useState(0);
  const activeChallengeIds = useMemo(
    () => challenges.filter(c => new Date(c.endDate).getTime() > Date.now()).map(c => c.id).filter(Boolean),
    [challenges]
  );
  const tourneyUnseen = useMemo(
    () => hasUnseenMark('challenges', user?.id ?? '', activeChallengeIds),
    [user?.id, activeChallengeIds, tourneySeenTick]
  );
  useEffect(() => {
    if (view !== 'social' || socialTab !== 'challenges' || !user?.id) return;
    if (activeChallengeIds.length === 0) return;
    markSeenIds('challenges', user.id, activeChallengeIds);
    setTourneySeenTick(t => t + 1);
  }, [view, socialTab, user?.id, activeChallengeIds]);
  const seeRequests = useCallback(() => {
    /* La marca de Social se queda mientras haya solicitudes. */
  }, []);

  const upsertLocalDailyCheckIn = useCallback((nextCheckIn: GymCheckIn) => {
    const day = new Date(nextCheckIn.timestamp).toDateString();
    setCheckIns(prev => {
      const filtered = prev.filter(ci => !(ci.userId === nextCheckIn.userId && new Date(ci.timestamp).toDateString() === day));
      return [nextCheckIn, ...filtered];
    });
  }, []);

  const handleCheckIn = async (gymName: string, time: string, audience: 'all' | 'close' = 'all') => {
    if (!user) return;
    const ts = Date.now();
    const optimisticCheckIn: GymCheckIn = {
      id: `ci-${Math.random().toString(36).substr(2, 5)}`,
      userId: user.id,
      userName: user.name,
      avatar: user.avatar,
      gymName,
      time,
      timestamp: ts,
      expiresAt: checkInExpiresAtMs(new Date(ts), time),
    };
    upsertLocalDailyCheckIn(optimisticCheckIn);
    try {
      const saved = await apiPost<any>('/api/checkins', { gymName, time, audience });
      const savedTs = saved?.timestamp ? new Date(saved.timestamp).getTime() : optimisticCheckIn.timestamp;
      upsertLocalDailyCheckIn({
        id: String(saved?._id || saved?.id || optimisticCheckIn.id),
        userId: String(saved?.userId || optimisticCheckIn.userId),
        userName: saved?.userName || optimisticCheckIn.userName,
        avatar: optimisticCheckIn.avatar,
        gymName: saved?.gymName || optimisticCheckIn.gymName,
        time: saved?.time || optimisticCheckIn.time,
        timestamp: savedTs,
        expiresAt: expiresAtFromSaved(saved, savedTs, saved?.time || time),
      });
      bumpSocialRefresh();
    } catch (e) {
      // Mantener en local aunque falle el backend
    }
  };

  const handleCheckInUpdate = async (checkInId: string, gymName: string, time: string, audience?: 'all' | 'close') => {
    if (!user) return;
    try {
      const saved = await apiPut<any>(`/api/checkins/${checkInId}`, { gymName, time, ...(audience ? { audience } : {}) });
      const savedTs = saved?.timestamp ? new Date(saved.timestamp).getTime() : Date.now();
      upsertLocalDailyCheckIn({
        id: checkInId,
        userId: user.id,
        userName: user.name,
        avatar: user.avatar,
        gymName: saved?.gymName || gymName,
        time: saved?.time || time,
        timestamp: savedTs,
        expiresAt: expiresAtFromSaved(saved, savedTs, saved?.time || time),
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

  const handleJoinFriendCheckIn = useCallback(async (friendCheckIn: GymCheckIn) => {
    if (!user) return;

    // Crear check-in propio a la misma hora/gimnasio para reflejarlo en Progreso y Comunidad.
    const joinTs = Date.now();
    const myCheckIn: GymCheckIn = {
      id: `ci-${Math.random().toString(36).substr(2, 5)}`,
      userId: user.id,
      userName: user.name,
      avatar: user.avatar,
      gymName: friendCheckIn.gymName,
      time: friendCheckIn.time,
      timestamp: joinTs,
      expiresAt: checkInExpiresAtMs(new Date(joinTs), friendCheckIn.time),
    };

    upsertLocalDailyCheckIn(myCheckIn);

    // Enviar notificación al amigo en backend.
    try {
      const saved = await apiPost<any>('/api/checkins', {
        gymName: friendCheckIn.gymName,
        time: friendCheckIn.time,
      });
      const savedTs = saved?.timestamp ? new Date(saved.timestamp).getTime() : myCheckIn.timestamp;
      upsertLocalDailyCheckIn({
        id: String(saved?._id || saved?.id || myCheckIn.id),
        userId: String(saved?.userId || myCheckIn.userId),
        userName: saved?.userName || myCheckIn.userName,
        avatar: myCheckIn.avatar,
        gymName: saved?.gymName || myCheckIn.gymName,
        time: saved?.time || myCheckIn.time,
        timestamp: savedTs,
        expiresAt: expiresAtFromSaved(saved, savedTs, saved?.time || friendCheckIn.time),
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
  }, [user, upsertLocalDailyCheckIn, bumpSocialRefresh]);

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
      const updatedTmsList = [...tms, newTm];
      const linked = newTm.linkedExercise;
      const updatedRms =
        linked === 'bench' || linked === 'squat' || linked === 'deadlift'
          ? { ...rms, [linked]: newTm.value }
          : rms;
      recordTmInHistory(updatedTmsList, updatedRms, tms, rms);
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[TM] Error creando:', e);
      showAppError('No se ha podido crear el máximo.', e);
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
      showAppError('No se ha podido borrar el máximo.', e);
    }
  };

  /**
   * El tipo se infiere: bajar o corregir un alta plana reescribe el pico; si ya hay
   * escalones, una subida a mano es marca. Las series registradas marcan PR solas.
   */
  const handleUpdateTM = (
    id: string,
    updates: Partial<TrainingMax>,
    kind?: 'record' | 'correction'
  ) => {
    const prevTms = tms;
    const prevRms = rms;
    setTms(prev => prev.map(tm => tm.id === id ? { ...tm, ...updates } : tm));
    const currentTm = tms.find(t => t.id === id);
    if (currentTm?.linkedExercise && updates.value !== undefined) {
      setRms(prev => ({ ...prev, [currentTm.linkedExercise!]: updates.value! }));
    }
    if (updates.value !== undefined) {
      tmAutoBumpValuesRef.current.delete(id);
      const linked = currentTm?.linkedExercise;
      const newRms =
        linked === 'bench' || linked === 'squat' || linked === 'deadlift'
          ? { ...rms, [linked]: updates.value! }
          : rms;
      const updatedTmsList = tms.map(t => (t.id === id ? { ...t, ...updates, value: updates.value! } : t));
      const inferred =
        kind ??
        inferTmChangeKind(historyRef.current, id, currentTm?.value ?? updates.value!, updates.value!);
      if (inferred === 'record') {
        recordTmInHistory(updatedTmsList, newRms, prevTms, prevRms);
      } else {
        setHistory((prev) =>
          applySmartTmCorrection(
            prev,
            updatedTmsList,
            id,
            currentTm?.value ?? updates.value!,
            updates.value!,
            linked ? String(linked) : undefined
          )
        );
      }
      (async () => {
        if (!/^[a-f0-9]{24}$/i.test(id)) return;
        if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
        try {
          await apiPut(`/api/training-maxes/${id}`, {
            ...updates,
            correction: inferred === 'correction' ? true : undefined,
            routineId: activeRoutineId,
            updatedAt: dateISOToUtcNoonISO(planViewAnchorRef.current.dateISO),
          });
          bumpRoutineDataRefresh();
        } catch (e) {
          console.error('[TM] Error actualizando:', e);
          showAppError('No se ha podido actualizar el máximo.', e);
          setTms(prevTms);
          setRms(prevRms);
        }
      })();
      return;
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
        showAppError('No se ha podido actualizar el máximo.', e);
        setTms(prevTms);
        setRms(prevRms);
      }
    })();
  };

  const handleCreateRoutine = async (
    routineName: string,
    opts?: {
      sameTemplateAllWeeks?: boolean;
      cycleLength?: number;
      cycleAnchorISO?: string;
      weekStartsOn?: number;
      importAfter?: boolean;
    }
  ) => {
    const name = routineName?.trim();
    if (!name) return;
    setRoutineCreateLoading(true);
    const sameTemplateAllWeeks = opts?.sameTemplateAllWeeks !== false;
    const cycleLength = opts?.cycleLength ?? 4;
    const newRoutine = createRoutinePlan(`routine-${Math.random().toString(36).slice(2, 8)}`, name, {
      empty: true,
      sameTemplateAllWeeks,
      cycleLength,
      cycleAnchorISO: opts?.cycleAnchorISO,
      weekStartsOn: opts?.weekStartsOn,
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
        cycleAnchorISO: opts?.cycleAnchorISO,
        weekStartsOn: opts?.weekStartsOn ?? 1,
        isActive: true,
      });
      const plan: RoutinePlan = expandRoutineFromApi({
        _id: created._id,
        id: created.id,
        name: created.name,
        sameTemplateAllWeeks: created.sameTemplateAllWeeks,
        hiddenFromSocial: created.hiddenFromSocial,
        cycleLength: created.cycleLength,
        cycleAnchorISO: created.cycleAnchorISO,
        weekStartsOn: created.weekStartsOn,
        skippedWeeks: created.skippedWeeks,
        shiftedAtCalendarWeeks: created.shiftedAtCalendarWeeks,
        calendarDayShifts: created.calendarDayShifts,
        weeks: created.weeks,
        versions: created.versions,
        baseTemplate: created.baseTemplate,
        weekTypeOverrides: created.weekTypeOverrides,
        logs: created.logs,
        progressCheckpointAt: created.progressCheckpointAt,
        progressCheckpointTms: created.progressCheckpointTms,
      });
      setRoutines(prev => [...prev, plan]);
      setActiveRoutineId(plan.id);
      setProgramScreen('plan');
      if (opts?.importAfter) setOpenImportAfterCreate((n) => n + 1);
      try {
        await apiPut(`/api/routines/${plan.id}/activate`, {});
      } catch (activateErr) {
        console.error('[Routine] Error activando rutina recién creada:', activateErr);
      }
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error creando:', e);
      showAppError('No se ha podido crear la rutina.', e);
      throw e;
    } finally {
      setRoutineCreateLoading(false);
    }
  };

  const handleSelectRoutine = async (routineId: string) => {
    if (routineId === activeRoutineId) {
      setProgramScreen('plan');
      return;
    }
    setRoutineSwitchingId(routineId);
    // Guardar lo pendiente de la rutina que dejamos antes de que el debounce se cancele.
    if (routineSyncRef.current) {
      clearTimeout(routineSyncRef.current);
      routineSyncRef.current = null;
    }
    if (planBulkSyncTimeoutRef.current) {
      clearTimeout(planBulkSyncTimeoutRef.current);
      planBulkSyncTimeoutRef.current = null;
      await runPlanBulkSync();
    }
    try { await routineSyncFlush.current?.(); } catch { /* el flush ya loguea */ }
    setActiveRoutineId(routineId);
    setProgramScreen('plan');
    try {
      await apiPut(`/api/routines/${routineId}/activate`, {});
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error activando:', e);
      showAppError('No se ha podido activar la rutina.', e);
    } finally {
      setRoutineSwitchingId(null);
    }
  };

  const handleCopyFriendRoutine = async (routine: {
    name: string;
    friendName: string;
    weeks: TrainingWeek[];
    cycleLength?: number;
    sameTemplateAllWeeks?: boolean;
    weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
    skippedWeeks?: number[];
    friendTrainingMaxes?: { name: string; mode: string; linkedExercise?: string }[];
  }) => {
    /** Plan: series, %, kg, modo, linkedTo tm-*; sin historial ni series del amigo. TMs = mismos que el amigo/plan, valor 0 (no se añade el paquete por defecto si ya hay TMs reales). */
    const newWeeks = cloneFriendRoutineWeeks(routine.weeks);
    const cl = Math.max(1, Math.min(52, routine.cycleLength ?? 4));

    try {
      const copiedBaseTemplate = deriveBaseTemplateFromWeeks(newWeeks, cl);
      const friendSuffix = (routine.friendName || 'Amigo').trim() || 'Amigo';
      const sameTemplateAllWeeks = parseSameTemplateAllWeeks(routine.sameTemplateAllWeeks);
      const weekTypeOverrides = Array.isArray(routine.weekTypeOverrides)
        ? JSON.parse(JSON.stringify(routine.weekTypeOverrides)) as Array<{ weekType: number; week: TrainingWeek }>
        : [];
      const created = await apiPost<any>('/api/routines', {
        name: `${routine.name} (${friendSuffix})`,
        versions: [{ effectiveFromWeek: 1, weeks: copiedBaseTemplate }],
        baseTemplate: copiedBaseTemplate,
        weekTypeOverrides,
        isActive: true,
        cycleLength: cl,
        sameTemplateAllWeeks,
        skippedWeeks: [],
      });
      const planId = String(created._id || created.id);

      const mergedSeeds = mergeFriendProfileAndPlanTmSeeds(routine.friendTrainingMaxes, newWeeks);
      const seedRows =
        mergedSeeds.length > 0
          ? mergedSeeds
          : !hasAnyLinkedExerciseInWeeks(newWeeks)
            ? DEFAULT_TM_SEED_ZERO.map((row) => ({ ...row }))
            : [];

      await Promise.all(
        seedRows.map((row) =>
          apiPost('/api/training-maxes', {
            name: row.name,
            value: 0,
            mode: row.mode,
            routineId: planId,
            ...(row.linkedExercise ? { linkedExercise: row.linkedExercise } : {}),
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
        cycleAnchorISO: created.cycleAnchorISO,
        weekStartsOn: created.weekStartsOn,
        skippedWeeks: created.skippedWeeks,
        shiftedAtCalendarWeeks: created.shiftedAtCalendarWeeks,
        calendarDayShifts: created.calendarDayShifts,
        weeks: created.weeks,
        versions: created.versions,
        baseTemplate: created.baseTemplate,
        weekTypeOverrides: created.weekTypeOverrides,
        logs: created.logs,
        progressCheckpointAt: created.progressCheckpointAt,
        progressCheckpointTms: created.progressCheckpointTms,
      });
      setRoutines(prev => [...prev, plan]);
      setActiveRoutineId(plan.id);
      setProgramScreen('plan');
      setView('program');
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error copiando:', e);
      showAppError('No se ha podido copiar la rutina.', e);
    }
  };

  const handleRenameRoutine = async (routineId: string, name: string) => {
    setRoutines((prev) => prev.map((r) => (r.id === routineId ? { ...r, name } : r)));
    try {
      await apiPut(`/api/routines/${routineId}`, { name });
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error renombrando:', e);
      showAppError('No se ha podido cambiar el nombre.', e);
    }
  };

  const handleDeleteRoutine = async (routineId: string) => {
    const target = routines.find((r) => r.id === routineId);
    const label = target?.name || 'esta rutina';
    const isLocalId = (id: string) => id.startsWith('routine-') && id.length < 20;
    if (!window.confirm(`¿Borrar «${label}»? No se puede deshacer.`)) return;

    setRoutineDeleteLoadingId(routineId);
    try {
      if (!isLocalId(routineId)) {
        await apiDelete(`/api/routines/${routineId}`);
      }
      const remaining = routines.filter((r) => r.id !== routineId);
      setRoutines(remaining);
      if (remaining.length === 0) {
        setActiveRoutineId('');
        setHistory([]);
        setTms([]);
        setProgramScreen('routines');
      } else if (activeRoutineId === routineId) {
        const nextId = remaining[0].id;
        setActiveRoutineId(nextId);
        if (!isLocalId(nextId)) {
          try {
            await apiPut(`/api/routines/${nextId}/activate`, {});
          } catch (activateErr) {
            console.error('[Routine] Error activando rutina restante:', activateErr);
          }
        }
      }
      bumpRoutineDataRefresh();
    } catch (e: any) {
      console.error('[Routine] Error eliminando:', e);
      showAppError(e?.message || 'No se ha podido borrar la rutina. Prueba otra vez.', e);
    } finally {
      setRoutineDeleteLoadingId(null);
    }
  };

  const applyRoutineChangeWithVersioning = (
    routine: RoutinePlan,
    weekIdx: number,
    dayIdx: number,
    applyToDay: (day: TrainingWeek['days'][0]) => TrainingWeek['days'][0],
    options?: { propagate?: boolean; forwardOnly?: boolean }
  ): RoutinePlan => {
    const weekNumber = weekIdx + 1;
    /** Ciclo de la versión vigente esa semana: si estás en un tramo sin plan (ciclo 1) no se usa el de la rutina. */
    const activeVersion = (routine.versions ?? [])
      .filter(v => v.effectiveFromWeek <= weekNumber)
      .reduce<RoutineVersion | null>((a, b) => (a && a.effectiveFromWeek >= b.effectiveFromWeek ? a : b), null);
    const cl = Math.max(1, Math.min(52, activeVersion?.cycleLength ?? routine.cycleLength ?? 4));
    const vers = routine.versions?.length
      ? routine.versions
      : [{ effectiveFromWeek: 1, cycleLength: cl, weeks: deriveBaseTemplateFromWeeks(routine.weeks, cl) }];
    /** Se edita lo que se ve en esa semana, no la última plantilla guardada. */
    const baseWeeks = deepCloneWeeks(getWeeksAt(routine, weekNumber));
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
      effectiveFromWeek: weekNumber,
      cycleLength: cl,
      weeks: deriveBaseTemplateFromWeeks(baseWeeks, cl),
    };
    /**
     * El cambio vale desde esta semana en adelante: las anteriores se quedan como estaban y los tramos
     * posteriores (otro bloque importado, o el corte de un plan que no se repite) tampoco se pisan.
     */
    const newVersions = [...vers.filter(v => v.effectiveFromWeek !== weekNumber), newVersion].sort((a, b) => a.effectiveFromWeek - b.effectiveFromWeek);
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

  /** Vuelca un plan leído de un documento del entrenador sobre la rutina activa. */
  const handleImportCoachPlan = async (opts: ImportCoachPlanResult) => {
    const routine = routines.find(r => r.id === activeRoutineId);
    if (!routine) return;

    const prevCycleLength = routine.cycleLength ?? 4;
    const cycleLength = Math.max(1, Math.min(52, opts.cycleLength || opts.plan.weeks.length || prevCycleLength));
    const cycleChanged =
      cycleLength !== prevCycleLength || (cycleLength === 1) !== (routine.sameTemplateAllWeeks === true);

    updateActiveRoutine((r) =>
      mergeCoachImportIntoRoutine(r, {
        plan: opts.plan,
        startWeekNumber: opts.startWeekNumber,
        repeatAfterPlan: opts.repeatAfterPlan,
        cycleLength,
        clearUntouchedDays: opts.clearUntouchedDays,
        continuesPreviousPlan: opts.continuesPreviousPlan,
        currentWeekOfYear,
        week1ISO: opts.week1ISO,
        weekStartsOn: opts.weekStartsOn,
      })
    );

    const importMark: LastCoachImport = {
      startWeekNumber: opts.startWeekNumber,
      weeks: opts.plan.weeks.length,
      week1ISO: opts.week1ISO,
    };
    setLastCoachImport(importMark);
    try {
      localStorage.setItem(lastCoachImportKey(routine.id), JSON.stringify(importMark));
    } catch {
      /* Sin localStorage solo se pierde el atajo «Continuar el plan». */
    }

    if (cycleChanged && routine.id && !routine.id.startsWith('routine-')) {
      try {
        await apiPut(`/api/routines/${routine.id}`, { skippedWeeks: [], shiftedAtCalendarWeeks: [] });
      } catch (e) {
        console.error('[Import] No se pudieron limpiar las semanas saltadas', e);
        showAppError('No se han podido limpiar las semanas saltadas.', e);
      }
    }

    if (opts.importMaxes) {
      for (const max of opts.plan.maxes) {
        const already = tms.some(
          t => normalizeExerciseNameKey(t.name) === normalizeExerciseNameKey(max.name)
        );
        if (already) continue;
        try {
          await handleCreateTM({ name: max.name, value: max.value, mode: 'weight', sharedToSocial: true });
        } catch (e) {
          console.error('[Import] No se pudo crear el TM', max.name, e);
          showAppError(`No se ha podido crear el máximo ${max.name}.`, e);
        }
      }
    }

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

  const handleMoveExercise = (weekId: string, dayId: string, exerciseId: string, dir: -1 | 1) => {
    const routine = routines.find(r => r.id === activeRoutineId);
    if (!routine) return;
    const resolved = resolveWeekDayIndex(routine, weekId, dayId);
    if (!resolved) return;

    updateActiveRoutine((r) => {
      const res2 = resolveWeekDayIndex(r, weekId, dayId);
      if (!res2) return r;
      return applyRoutineChangeWithVersioning(r, res2.weekIdx, res2.dayIdx, (d) => ({
        ...d,
        exercises: moveMergedExerciseRow(d.exercises, exerciseId, dir),
      }), { forwardOnly: false });
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
                      ...(ex.weightPerSet !== undefined ? { weightPerSet: ex.weightPerSet } : {}),
                      ...(ex.mode !== undefined ? { mode: ex.mode } : {}),
                    }
                  : e
              ),
            }));
          });
        })
        .catch((e: any) => {
          console.error('[Routine] Error updating exercise:', e);
          showAppError('No se ha podido guardar el ejercicio.', e);
        });
      }
    }
    /**
     * El PATCH por ejercicio solo toca ese documento: no guarda la versión nueva que crea el cambio
     * («desde esta semana en adelante»), así que hay que mandar también el plan completo.
     */
    if (routine.id && !routine.id.startsWith('routine-')) {
      schedulePlanBulkSync();
    }
  };

  const handleLogChange = useCallback((id: string, field: keyof LogEntry, value: any) => {
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
  }, [activeRoutineId, markLogDirty, updateActiveRoutine]);

  const roundTo25 = (n: number) => Math.round(n / 2.5) * 2.5;

  /**
   * Safety-net: re-escanea TODOS los logs de la rutina buscando TMs superados.
   * Se ejecuta al pulsar "Guardar sesión" para atrapar bumps que el onChange por tecla no detectó.
   */
  const rescanTmBumpsFromLogs = (routine: RoutinePlan) => {
    if (!user) return;
    const allWeeks = getWeeksForTrainingMaxScan(routine);
    const currentTms = tmsRef.current;
    const peaks = loggedPeaksByTm(routine, currentTms, allWeeks);
    const synced = syncTmsFromLoggedPeaks(
      currentTms,
      peaks,
      tmAutoBumpValuesRef.current,
      historyRef.current
    );
    tmAutoBumpValuesRef.current = synced.autoBump;
    const newTms = synced.next;
    const didBump = synced.bumpedIds.length > 0;
    const didRevert = synced.revertedIds.length > 0;
    if (didRevert) {
      let hist = historyRef.current;
      for (const id of synced.revertedIds) {
        const oldVal = currentTms.find((t) => t.id === id)?.value;
        const nextVal = newTms.find((t) => t.id === id)?.value;
        if (oldVal == null || nextVal == null || nextVal === oldVal) continue;
        const linked = newTms.find((t) => t.id === id)?.linkedExercise;
        hist = applySmartTmCorrection(hist, newTms, id, oldVal, nextVal, linked ? String(linked) : undefined);
        if (/^[a-f0-9]{24}$/i.test(id) && !(activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20)) {
          apiPut(`/api/training-maxes/${id}`, {
            value: nextVal,
            correction: true,
            routineId: activeRoutineId,
          }).catch(() => {});
        }
      }
      setHistory(hist);
    }
    if (didRevert && !didBump) {
      tmsRef.current = newTms;
      setTms(newTms);
      const linked = newTms.filter(t => t.linkedExercise);
      const newRms = { ...rmsRef.current };
      linked.forEach(tm => { if (tm.linkedExercise) newRms[tm.linkedExercise] = tm.value; });
      rmsRef.current = newRms;
      setRms(newRms);
    }
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
      newTms.filter(t => synced.bumpedIds.includes(t.id)).forEach(tm => {
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

  /**
   * Fija a mano el TM interno de un ejercicio (variantes tipo «pause squat»: son sentadilla,
   * pero con su propia referencia). A diferencia del upsert automático, aquí manda lo escrito.
   */
  const handleSetInternalMax = (name: string, mode: ExerciseMode, value: number) => {
    const key = normalizeExerciseNameKey(name);
    const field = mode === 'weight' ? 'valueWeight' : mode === 'reps' ? 'valueReps' : 'valueSeconds';
    setInternalExerciseMaxes(prev => {
      const idx = prev.findIndex(m => normalizeExerciseNameKey(m.name) === key);
      if (idx < 0) return [...prev, { id: `pending-${key}`, name, [field]: value } as InternalExerciseMax];
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    if (!activeRoutineId || (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20)) return;
    apiPost<any>('/api/internal-exercise-maxes/upsert', {
      routineId: activeRoutineId,
      name,
      mode,
      candidateValue: value,
      overwrite: true,
    })
      .then((doc: any) => {
        const id = String(doc._id || doc.id);
        setInternalExerciseMaxes(prev =>
          prev.map(m =>
            normalizeExerciseNameKey(m.name) === key
              ? {
                  ...m,
                  id,
                  valueWeight: doc.valueWeight != null ? Number(doc.valueWeight) : m.valueWeight,
                  valueReps: doc.valueReps != null ? Number(doc.valueReps) : m.valueReps,
                  valueSeconds: doc.valueSeconds != null ? Number(doc.valueSeconds) : m.valueSeconds,
                }
              : m
          )
        );
      })
      .catch(() => {});
  };

  const handleUploadSetMedia = async (logId: string, setIdx: number, file: File) => {
    const routine = routinesRef.current.find(r => r.id === activeRoutineId);
    if (!routine?.id || routine.id.startsWith('routine-')) {
      throw new Error('Guarda la rutina antes de adjuntar el vídeo');
    }
    const form = new FormData();
    form.append('file', file);
    const stored = await apiUpload<{ mediaKey: string; mediaType: 'image' | 'video' }>(
      `/api/routines/${routine.id}/set-media`,
      form
    );
    handleSetLogChange(logId, setIdx, { mediaKey: stored.mediaKey, mediaType: stored.mediaType });
    return stored;
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
    let tmRevert: { prev: TrainingMax[]; next: TrainingMax[]; ids: string[] } | null = null;
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
        const prevTmsSnap = tmsRef.current.map((tm) => ({ ...tm }));
        const peaks = loggedPeaksByTm(updatedRoutine, prevTmsSnap, baseWeeks);
        const synced = syncTmsFromLoggedPeaks(
          prevTmsSnap,
          peaks,
          tmAutoBumpValuesRef.current,
          historyRef.current
        );
        tmAutoBumpValuesRef.current = synced.autoBump;
        const newTms = synced.next;
        const didBump = synced.bumpedIds.length > 0;
        if (synced.revertedIds.length > 0) {
          tmRevert = { prev: prevTmsSnap, next: newTms, ids: synced.revertedIds };
        }

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
                  if (!set.completed) return;
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
                  if (!set.completed) return;
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
              ? (im.valueWeight ?? 0)
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
                  ? (cur.valueWeight ?? 0)
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
                  ? (cur.valueWeight ?? 0)
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
        let working = prev;
        if (tmRevert) {
          for (const id of tmRevert.ids) {
            const oldVal = tmRevert.prev.find((t) => t.id === id)?.value;
            const nextVal = tmRevert.next.find((t) => t.id === id)?.value;
            const linked = tmRevert.next.find((t) => t.id === id)?.linkedExercise;
            if (oldVal == null || nextVal == null || nextVal === oldVal) continue;
            working = applySmartTmCorrection(working, tmRevert.next, id, oldVal, nextVal, linked ? String(linked) : undefined);
          }
        }
        const samePeriodNew = (e: HistoryEntry) =>
          e.year === b.y && e.week === b.w && (e.dayOfWeek ?? 0) === (b.d ?? 0);
        const filtered = working.filter((e) => !samePeriodNew(e));
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
        const reverted = new Set(tmRevert?.ids ?? []);
        b.newTms.filter(t => !reverted.has(t.id) && t.value !== b.prevTmsSnapshot.find(ot => ot.id === t.id)?.value).forEach(tm => {
          apiPut(`/api/training-maxes/${tm.id}`, {
            value: tm.value,
            routineId: activeRoutineId,
            updatedAt: dateISOToUtcNoonISO(bumpIsoLog),
          }).catch((e) => {
            console.error('[TM] Error guardando subida automática:', e);
            showAppError('No se ha podido guardar la subida del máximo.', e);
          });
        });
        tmRevert?.ids.forEach((id) => {
          const nextVal = tmRevert.next.find((t) => t.id === id)?.value;
          if (nextVal == null || !/^[a-f0-9]{24}$/i.test(id)) return;
          apiPut(`/api/training-maxes/${id}`, {
            value: nextVal,
            correction: true,
            routineId: activeRoutineId,
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
    } else if (tmRevert) {
      const linked = tmRevert.next.filter((t) => t.linkedExercise);
      const newRms = { ...rmsRef.current };
      linked.forEach((tm) => { if (tm.linkedExercise) newRms[tm.linkedExercise] = tm.value; });
      tmsRef.current = tmRevert.next;
      rmsRef.current = newRms;
      setTms(tmRevert.next);
      setRms(newRms);
      setHistory((prev) => {
        let working = prev;
        for (const id of tmRevert.ids) {
          const oldVal = tmRevert.prev.find((t) => t.id === id)?.value;
          const nextVal = tmRevert.next.find((t) => t.id === id)?.value;
          const link = tmRevert.next.find((t) => t.id === id)?.linkedExercise;
          if (oldVal == null || nextVal == null || nextVal === oldVal) continue;
          working = applySmartTmCorrection(working, tmRevert.next, id, oldVal, nextVal, link ? String(link) : undefined);
        }
        return working;
      });
      tmRevert.ids.forEach((id) => {
        const nextVal = tmRevert.next.find((t) => t.id === id)?.value;
        if (nextVal == null || !/^[a-f0-9]{24}$/i.test(id)) return;
        if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
        apiPut(`/api/training-maxes/${id}`, {
          value: nextVal,
          correction: true,
          routineId: activeRoutineId,
        }).catch(() => {});
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
    void (async () => {
      const prevId = user?.id;
      const newId = userData.id;
      if (prevId && prevId !== newId) {
        const prevAcc = loadSavedAccounts().find((a) => a.id === prevId);
        const expo =
          typeof window !== 'undefined'
            ? (window as unknown as { __EXPO_PUSH_TOKEN__?: string }).__EXPO_PUSH_TOKEN__
            : undefined;
        if (prevAcc?.token && expo?.trim()) {
          try {
            const base = getApiBaseUrl() || '';
            await fetch(`${base}/api/auth/logout`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${prevAcc.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token: expo.trim() }),
            });
          } catch {
            /* ignore */
          }
        }
      }
    })();
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
    setView('dashboard');
    writeSavedAppNav({ view: 'dashboard', socialTab: 'chat', programScreen: 'plan', friendsFilter: 'all' });
    setAddAccountMode(false);
  }, [user?.id]);

  const switchToAccount = useCallback(
    async (userId: string) => {
      const accounts = loadSavedAccounts();
      const acc = accounts.find((a) => a.id === userId);
      if (!acc) {
        return;
      }
      setIsSwitchingAccount(true);
      const prevToken = localStorage.getItem('auth_token');
      try {
        const basePre = getApiBaseUrl() || '';
        const expoPre =
          typeof window !== 'undefined'
            ? (window as unknown as { __EXPO_PUSH_TOKEN__?: string }).__EXPO_PUSH_TOKEN__
            : undefined;
        if (prevToken && expoPre?.trim()) {
          try {
            await fetch(`${basePre}/api/auth/logout`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${prevToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token: expoPre.trim() }),
            });
          } catch {
            /* ignore */
          }
        }
        localStorage.setItem('auth_token', acc.token);
        setActiveAccountId(userId);
        const base = getApiBaseUrl() || '';
        const res = await fetch(`${base}/api/auth/me`, {
          headers: { Authorization: `Bearer ${acc.token}` },
        });
        if (!res.ok) {
          localStorage.setItem('auth_token', prevToken || '');
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
        setActiveRoutineId('');
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
        showAppError('No se ha podido cambiar de cuenta.', e);
      } finally {
        setIsSwitchingAccount(false);
      }
    },
    []
  );

  const handleLogout = useCallback(() => {
    const uid = user?.id;
    const authToken = localStorage.getItem('auth_token');
    const expoPush =
      typeof window !== 'undefined'
        ? (window as unknown as { __EXPO_PUSH_TOKEN__?: string }).__EXPO_PUSH_TOKEN__
        : undefined;

    void (async () => {
      try {
        const webPushEndpoint = await Promise.race([
          getWebPushEndpoint(),
          new Promise<null>(resolve => {
            window.setTimeout(() => resolve(null), 1200);
          }),
        ]);
        const base = getApiBaseUrl() || '';
        const ac = new AbortController();
        const t = window.setTimeout(() => ac.abort(), 2500);
        await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...(expoPush?.trim() ? { token: expoPush.trim() } : {}),
            ...(webPushEndpoint ? { webPushEndpoint } : {}),
          }),
          signal: ac.signal,
        });
        window.clearTimeout(t);
      } catch {
        /* el cierre local no espera al servidor */
      }
    })();

    if (uid) removeAccount(uid);
    setSavedAccountsState(loadSavedAccounts());
    localStorage.removeItem('auth_token');
    setActiveAccountId(null);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    setAddAccountMode(false);
    clearSavedAppNav();
    setView('dashboard');
    setUser(null);
  }, [user?.id]);

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
        let token = localStorage.getItem('auth_token');
        if (!token) {
          localStorage.removeItem(AUTH_USER_STORAGE_KEY);
          setUser(null);
          setIsCheckingSession(false);
          return;
        }

        const renewed = await silentRefreshToken(token);
        if (renewed) {
          token = renewed;
          localStorage.setItem('auth_token', renewed);
          try {
            const cached = JSON.parse(localStorage.getItem(AUTH_USER_STORAGE_KEY) || 'null') as User | null;
            if (cached?.id) {
              upsertAccount({
                id: cached.id,
                token: renewed,
                email: cached.email,
                name: cached.name,
                avatar: cached.avatar,
              });
            }
          } catch {
            /* la cuenta se actualiza al completar /me */
          }
        }
        
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 45000);
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
            console.error('[SESSION] Error parseando respuesta — sesión local mantenida:', parseError);
          }
        } else if (res.status === 401 || res.status === 403 || res.status === 404) {
          let recovered = false;
          if (res.status === 403 && token) {
            try {
              const refreshed = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: '{}',
              });
              if (refreshed.ok) {
                const body = await refreshed.json();
                if (body?.token) {
                  localStorage.setItem('auth_token', body.token);
                  const me2 = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${body.token}` } });
                  if (me2.ok) {
                    const data = await me2.json();
                    const u = mapUserFromMePayload(data);
                    setUser(u);
                    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(u));
                    recovered = true;
                  }
                }
              }
            } catch {
              /* se cierra abajo */
            }
          }
          if (!recovered) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem(AUTH_USER_STORAGE_KEY);
            setUser(null);
          }
        } else {
          console.warn('[SESSION] /api/auth/me respondió', res.status, '— sesión local mantenida');
        }
      } catch (e: any) {
        // Network error or server unavailable: keep local session alive until explicit logout.
        console.error('[SESSION] Error verificando sesión:', e.message || e);
      } finally {
        setIsCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const token = localStorage.getItem('auth_token');
      if (!token) return;
      void silentRefreshToken(token).then((renewed) => {
        if (!renewed) return;
        localStorage.setItem('auth_token', renewed);
        if (!user?.id) return;
        upsertAccount({
          id: user.id,
          token: renewed,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        });
      });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user?.id, user?.email, user?.name, user?.avatar]);

  useEffect(() => {
    if (!user) {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  }, [user]);

  const exportToExcel = async () => {
    const data: any[] = [];
    weeks.forEach(week => {
      week.days.forEach(day => {
        day.exercises.forEach(ex => {
          const log = getLogEntryForExercise(logs, week, day, ex);
          const linkedTM = tms.find(t => t.id === ex.linkedTo);
          const getTargetWeight = (sIdx: number) => {
            const written = ex.weightPerSet?.[sIdx] || ex.weight || 0;
            if (written > 0) return written;
            if (!linkedTM) return 0;
            const pct = ex.pctPerSet?.[sIdx] ?? ex.pct;
            if (pct == null) return 0;
            return Math.round(linkedTM.value * (pct / 100));
          };

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

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plan Entrenamiento");
    XLSX.writeFile(wb, "Mi_Plan_Entrenamiento.xlsx");
  };

  // Función para guardar el período actual en el historial (local + DB)
  const saveCurrentPeriod = async (
    silent = false,
    opts?: { syncCommit?: boolean }
  ) => {
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
    if (tmsLoadedForRoutineRef.current !== activeRoutineId) return;
    if (!tms.length) return;
    const now = new Date();
    const currentDate = now.toLocaleDateString('es-ES', { month: 'short' });
    const { week, year, dayOfWeek: d } = getYearWeekDay(now);
    const entry = createHistoryEntry(currentDate, tms, rms, { week, year, dayOfWeek: d });
    const entryWithRoutine: HistoryEntry = { ...entry, routineId: activeRoutineId };
    const commitHistory = () =>
      setHistory((prev) => {
        const samePeriod = (e: HistoryEntry) =>
          e.year === year && e.week === week && (e.dayOfWeek ?? 0) === d;
        const filtered = prev.filter((e) => !samePeriod(e));
        return [...filtered, entryWithRoutine].sort((a, b) => {
          const c = entryDateISO(a).localeCompare(entryDateISO(b));
          if (c !== 0) return c;
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
      });
    if (opts?.syncCommit) {
      flushSync(commitHistory);
    } else {
      commitHistory();
    }
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
      if (!silent) showAppOk('Período guardado.');
    } catch (e) {
      console.error('[History] Error guardando período:', e);
      if (!silent) showAppError('No se ha podido guardar el período.', e);
    }
  };

  // Auto-guardar período solo si el usuario cambia TM/RM, no al hidratar ni al editar series.
  const periodSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user || !tms.length) return;
    const sig = `${activeRoutineId}:${tms.map(t => `${t.id}:${t.value}`).join(',')}:${rms.bench}:${rms.squat}:${rms.deadlift}`;
    if (skipNextPeriodSaveRef.current) {
      skipNextPeriodSaveRef.current = false;
      lastPeriodSigRef.current = sig;
      return;
    }
    if (sig === lastPeriodSigRef.current) return;
    periodSaveRef.current && clearTimeout(periodSaveRef.current);
    periodSaveRef.current = setTimeout(() => {
      lastPeriodSigRef.current = sig;
      saveCurrentPeriod(true);
      periodSaveRef.current = null;
    }, 2000);
    return () => {
      if (periodSaveRef.current) clearTimeout(periodSaveRef.current);
    };
  }, [tms, rms, activeRoutineId, user?.id]);

  if (isCheckingSession) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginView onLogin={handleLoginComplete} />
        <AppNoticeHost />
      </>
    );
  }

  if (isLoadingData && routines.length === 0) {
    return (
      <>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <LoadingBlock label="Cargando tus datos…" />
        </div>
        <AppNoticeHost />
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
        }}
      />
      <AppNoticeHost />
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
          showAppError('No se ha podido guardar el cambio de la rutina.', e);
        });
    }
  };

  /** Lista única 1–53 (rutina lineal: semana civil). */
  const normalizeSkippedWeeksLinear = (arr: number[]) =>
    [...new Set(arr.map((w) => Math.round(Number(w))).filter((w) => Number.isFinite(w) && w >= 1 && w <= 53))].sort(
      (a, b) => a - b
    );

  /** Rutina por bloque: índices 1…cycleLength dentro del mesociclo. */
  const normalizeSkippedWeeksCycle = (arr: number[], cycleLength: number) => {
    const cl = Math.max(1, Math.min(52, cycleLength));
    return [...new Set(arr.map((w) => Math.round(Number(w))).filter((w) => Number.isFinite(w) && w >= 1 && w <= cl))].sort(
      (a, b) => a - b
    );
  };

  /**
   * `weekNumber` en skip_only (lineal = semana civil; bloque = posición ciclo).
   * En shift + bloque: `weekNumber` = semana civil (displayWeekNum) que se desplaza.
   */
  const handleSkipWeek = async (weekNumber: number, mode: 'shift' | 'skip_only') => {
    const routine = routines.find((r) => r.id === activeRoutineId);
    if (!routine || routine.id.startsWith('routine-')) return;
    const isBlock = routine.sameTemplateAllWeeks === false;

    if (mode === 'shift' && isBlock) {
      const calWeek = weekNumber;
      const current: number[] = routine.shiftedAtCalendarWeeks ?? [];
      const next = current.includes(calWeek)
        ? current.filter((w) => w !== calWeek)
        : [...current, calWeek].sort((a, b) => a - b);
      updateActiveRoutine((r) => ({ ...r, shiftedAtCalendarWeeks: next }));
      try {
        await apiPut(`/api/routines/${routine.id}`, { shiftedAtCalendarWeeks: next });
        bumpRoutineDataRefresh();
      } catch (e) {
        console.error('[Routine] Error guardando shift de semana:', e);
        showAppError('No se ha podido mover la semana.', e);
      }
      return;
    }

    const current = routine.skippedWeeks || [];
    const cl = routine.cycleLength ?? 4;
    let next: number[];
    next = current.includes(weekNumber) ? current.filter((w) => w !== weekNumber) : [...current, weekNumber];
    next = isBlock ? normalizeSkippedWeeksCycle(next, cl) : normalizeSkippedWeeksLinear(next);
    updateActiveRoutine((r) => ({ ...r, skippedWeeks: next }));
    try {
      await apiPut(`/api/routines/${routine.id}`, { skippedWeeks: next });
      bumpRoutineDataRefresh();
    } catch (e) {
      console.error('[Routine] Error guardando semanas saltadas:', e);
      showAppError('No se han podido guardar las semanas saltadas.', e);
    }
  };

  /** Esta semana civil: no voy un día y se corren las sesiones que quedan. La siguiente semana no se toca. */
  const handleSkipDay = async (dayIdx: number, year: number, week: number) => {
    const routine = routines.find((r) => r.id === activeRoutineId);
    if (!routine || routine.id.startsWith('routine-')) return;
    const current = routine.calendarDayShifts ?? [];
    const row = current.find((s) => s.year === year && s.week === week);
    const skipped = row?.skippedDays ?? [];
    const nextSkipped = skipped.includes(dayIdx)
      ? skipped.filter((d) => d !== dayIdx)
      : [...skipped, dayIdx];
    const next = upsertDayShift(current, year, week, nextSkipped);
    updateActiveRoutine((r) => ({ ...r, calendarDayShifts: next }));
    try {
      await apiPut(`/api/routines/${routine.id}`, { calendarDayShifts: next });
    } catch (e) {
      console.error('[Routine] Error guardando salto de día:', e);
      showAppError('No se ha podido saltar el día.', e);
    }
  };

  /** Un toque: esta semana vuelve a L-M-J-V. Quien no pulse, la que viene ya es así sola. */
  const handleResetDayShifts = async (year: number, week: number) => {
    const routine = routines.find((r) => r.id === activeRoutineId);
    if (!routine || routine.id.startsWith('routine-')) return;
    const next = upsertDayShift(routine.calendarDayShifts ?? [], year, week, []);
    updateActiveRoutine((r) => ({ ...r, calendarDayShifts: next }));
    try {
      await apiPut(`/api/routines/${routine.id}`, { calendarDayShifts: next });
    } catch (e) {
      console.error('[Routine] Error restaurando días del plan:', e);
      showAppError('No se han podido restaurar los días.', e);
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
        .catch((e: any) => {
          console.error('[Routine] Error updating day type:', e);
          showAppError('No se ha podido cambiar el tipo de día.', e);
        });
    }
    // Igual que al editar un ejercicio: el PATCH suelto no guarda la versión nueva.
    if (routine?.id && !routine.id.startsWith('routine-')) {
      schedulePlanBulkSync();
    }
  };

  return (
    // `reducedMotion="user"`: si el móvil tiene activado «reducir movimiento», motion
    // deja solo las opacidades y se salta desplazamientos y escalados.
    <MotionConfig reducedMotion="user">
    <div className="relative h-dvh max-h-dvh overflow-hidden bg-[var(--app-bg)] font-sans selection:bg-indigo-100 selection:text-indigo-900 dark:selection:bg-indigo-950/80 dark:selection:text-indigo-200">
      {isSwitchingAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
          <Spinner size={36} />
        </div>
      )}
      <div className="relative h-full bg-[var(--app-bg)]">
        {aliveViews.dashboard && (
          <div className={cn('app-scroll h-full overflow-y-auto overflow-x-hidden', view !== 'dashboard' && 'hidden')} aria-hidden={view !== 'dashboard'}>
            <DashboardView 
              key={`dashboard-${user.id}`}
              chartEnterKey={dashboardEnterKey}
              pageActive={view === 'dashboard'}
              user={user}
              history={sortedHistory}
              rms={rms}
              trainingMaxes={tms}
              trainingMaxesLoading={tmsLoading}
              activeRoutineName={activeRoutine?.name || 'Rutina activa'}
              activeRoutineId={hasRoutine ? activeRoutineId : ''}
              hasRoutine={hasRoutine}
              progressCheckpointAt={activeRoutine?.progressCheckpointAt}
              progressCheckpointTms={activeRoutine?.progressCheckpointTms}
              routineCreatedAt={activeRoutine?.createdAt}
              sameTemplateAllWeeks={activeRoutine?.sameTemplateAllWeeks !== false}
              cycleLength={activeRoutine?.cycleLength ?? 4}
              currentWeekOfYear={currentWeekOfYear}
              routineWeeks={activeRoutine?.weeks}
              routineLogs={activeRoutine?.logs}
              challenges={challenges}
              checkIns={checkIns}
              friendCount={friendsList.length}
              socialRefreshTick={socialRefreshTick}
              onUpdateUser={handleUpdateUser}
              onOpenProgram={openProgramPlan}
              onCreateRoutine={openCreateRoutine}
              onOpenSocial={goToSocial}
              onSendFriendRequest={handleSendFriendRequest}
              onConnectionsOpenChange={setProfileSheetOpen}
              onJoinFriendCheckIn={handleJoinFriendCheckIn}
              onOpenSettings={() => setView('settings')}
            />
          </div>
        )}
        {aliveViews.program && (
          <div className={cn('app-scroll h-full overflow-y-auto overflow-x-hidden', view !== 'program' && 'hidden')} aria-hidden={view !== 'program'}>
            <div className={programScreen !== 'routines' ? 'hidden' : undefined} aria-hidden={programScreen !== 'routines'}>
              <RoutineManagerView
                key="routine-manager"
                pageActive={view === 'program' && programScreen === 'routines'}
                routines={[...routines]
                  .sort((a, b) => (a.id === activeRoutineId ? -1 : b.id === activeRoutineId ? 1 : 0))
                  .map((routine) => ({
                    id: routine.id,
                    name: routine.name,
                    isActive: routine.id === activeRoutineId,
                    hiddenFromSocial: !!routine.hiddenFromSocial,
                    cycleLength: routine.cycleLength ?? 4,
                    sameTemplateAllWeeks: routine.sameTemplateAllWeeks === true,
                  }))}
                onActivateRoutine={handleSelectRoutine}
                onCreateRoutine={handleCreateRoutine}
                openCreateSignal={openCreateRoutineSignal}
                createRoutineLoading={routineCreateLoading}
                deleteRoutineLoadingId={routineDeleteLoadingId}
                activateRoutineLoadingId={routineSwitchingId}
                onRenameRoutine={handleRenameRoutine}
                onDeleteRoutine={handleDeleteRoutine}
                onToggleHiddenRoutine={handleToggleHiddenRoutine}
              />
            </div>
            <div className={programScreen !== 'plan' ? 'hidden' : undefined} aria-hidden={programScreen !== 'plan'}>
              <TrainingPlanView 
                key="program"
                pageActive={view === 'program' && programScreen === 'plan'}
                activeRoutineName={activeRoutine?.name || 'Rutina activa'}
                sameTemplateAllWeeks={activeRoutine?.sameTemplateAllWeeks === true}
                cycleLength={activeRoutine?.cycleLength ?? 4}
                cycleAnchorISO={activeRoutine?.cycleAnchorISO}
                weekStartsOn={activeRoutine?.weekStartsOn ?? 1}
                onToggleSameTemplateAllWeeks={handleToggleSameTemplateAllWeeks}
                trainingMaxes={tms}
                tmHistory={sortedHistory}
                tmAutoHighlightIds={
                  (viewAsOfWeek ?? currentWeekOfYear) === currentWeekOfYear ? tmAutoHighlightIds : []
                }
                internalExerciseMaxes={internalExerciseMaxes}
                onSetInternalMax={handleSetInternalMax}
                weeks={weeks}
                logs={logs}
                viewAsOfWeek={viewAsOfWeek}
                currentWeekOfYear={currentWeekOfYear}
                onViewAsOfWeekChange={setViewAsOfWeek}
                versionWeeks={activeRoutine?.versions?.map(v => v.effectiveFromWeek) ?? []}
                onUpdateTM={handleUpdateTM}
                onCreateTM={handleCreateTM}
                planViewAnchorRef={planViewAnchorRef}
                onRemoveTM={handleRemoveTM}
                onAddExercise={handleAddExercise}
                onRemoveExercise={handleRemoveExercise}
                onMoveExercise={handleMoveExercise}
                onUpdateExercise={handleUpdateExercise}
                onRoutinePlanFlush={async () => {
                  await new Promise<void>((resolve) => setTimeout(resolve, 0));
                  const r = routineForSyncRef.current;
                  if (!r || r.id !== activeRoutineId) return;
                  rescanTmBumpsFromLogs(r);
                  await syncDirtyLogsForRoutine(r);
                }}
                onUpdateDayType={handleUpdateDayType}
                onLogChange={handleLogChange}
                onSetLogChange={handleSetLogChange}
                onUploadSetMedia={handleUploadSetMedia}
                onMarkCompleted={handleMarkCompleted}
                onOpenRoutineManager={() => setProgramScreen('routines')}
                onExport={exportToExcel}
                onImportCoachPlan={handleImportCoachPlan}
                openImportSignal={openImportAfterCreate}
                lastCoachImport={lastCoachImport}
                skippedWeeks={activeRoutine?.skippedWeeks ?? []}
                shiftedAtCalendarWeeks={activeRoutine?.shiftedAtCalendarWeeks ?? []}
                calendarDayShifts={activeRoutine?.calendarDayShifts ?? []}
                onSkipWeek={handleSkipWeek}
                onSkipDay={handleSkipDay}
                onResetDayShifts={handleResetDayShifts}
              />
            </div>
          </div>
        )}
        {aliveViews.social && (
          <div className={cn('app-scroll h-full overflow-y-auto overflow-x-hidden', view !== 'social' && 'hidden')} aria-hidden={view !== 'social'}>
            <SocialView 
              key={user?.id ?? 'social'}
              user={user}
              friendsList={friendsList}
              requests={friends}
              challenges={challenges}
              checkIns={checkIns}
              initialTab={socialTab}
              openFriendsFilter={socialFriendsFilter}
              socialNavTick={socialNavTick}
              openCheckInModalSignal={openCheckInModalSignal}
              openCreateChallengeSignal={openCreateChallengeSignal}
              checkInIntent={checkInIntent}
              onAccept={handleAcceptFriend}
              onReject={handleRejectFriend}
              onSendFriendRequest={handleSendFriendRequest}
              onCreateChallenge={handleCreateChallenge}
              onJoinChallenge={handleJoinChallenge}
              onDeleteChallenge={handleDeleteChallenge}
              onCheckIn={handleCheckIn}
              onCheckInUpdate={handleCheckInUpdate}
              onCheckInDelete={handleCheckInDelete}
              onRefreshChallenges={refreshChallenges}
              onCopyFriendRoutine={handleCopyFriendRoutine}
              myRoutines={routines.map((r) => ({ id: r.id, name: r.name }))}
              myExercises={activeRoutineExerciseNames}
              activeRoutineId={activeRoutineId}
              onGoToCopiedRoutine={(routineId) => {
                setView('program');
                void handleSelectRoutine(routineId);
              }}
              onUnfriend={handleUnfriend}
              onGoToProfile={() => setView('dashboard')}
              onGoToDashboard={() => setView('dashboard')}
              socialBackTo={socialBackTo}
              onChatConversationChange={setChatConversationOpen}
              onAddStory={() => setStoryComposerOpen(true)}
              storyRefreshTick={storyRefreshTick}
              socialRefreshTick={socialRefreshTick}
              onSeeRequests={seeRequests}
              onPullRefresh={bumpAllSocial}
              pageActive={view === 'social'}
            />
          </div>
        )}
        {aliveViews.settings && (
          <div className={cn('app-scroll h-full overflow-y-auto overflow-x-hidden', view !== 'settings' && 'hidden')} aria-hidden={view !== 'settings'}>
            <ProfileView
              key="settings"
              user={user}
              onUpdateUser={handleUpdateUser}
              onLogout={handleLogout}
              savedAccountSummaries={toSummaries(savedAccountsState)}
              onSwitchAccount={(id) => void switchToAccount(id)}
              onAddAccount={() => setAddAccountMode(true)}
              onRemoveSavedAccount={handleRemoveSavedAccount}
              onBackToProfile={() => setView('dashboard')}
            />
          </div>
        )}
      </div>
      
      {!chatConversationOpen && !profileSheetOpen && <nav
        className="app-tabbar fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 right-2 z-50 mx-auto flex max-w-lg items-center gap-0.5 px-1 py-1 max-[360px]:left-1.5 max-[360px]:right-1.5 sm:bottom-6 sm:left-3 sm:right-3 sm:px-1.5"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <div className="grid min-w-0 flex-1 grid-cols-2">
          <motion.button
            type="button"
            whileTap={SLIME_TAP}
            transition={STICKY}
            onClick={() => setView('dashboard')}
            className={cn(
              "flex min-h-12 origin-center flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-medium leading-none tracking-wide outline-none focus:outline-none focus-visible:outline-none max-[340px]:min-h-11 max-[340px]:text-[9px]",
              view === 'dashboard'
                ? "bg-white/65 text-indigo-600 shadow-sm dark:bg-white/10 dark:text-indigo-300"
                : "text-slate-400 dark:text-slate-500"
            )}
          >
            <UserIcon className="size-[17px]" strokeWidth={view === 'dashboard' ? 2.35 : 1.9} />
            <span>Perfil</span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={SLIME_TAP}
            transition={STICKY}
            onClick={() => {
              setProgramScreen(routines.length === 0 ? 'routines' : 'plan');
              setView('program');
            }}
            className={cn(
              "flex min-h-12 origin-center flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-medium leading-none tracking-wide outline-none focus:outline-none focus-visible:outline-none max-[340px]:min-h-11 max-[340px]:text-[9px]",
              view === 'program'
                ? "bg-white/65 text-indigo-600 shadow-sm dark:bg-white/10 dark:text-indigo-300"
                : "text-slate-400 dark:text-slate-500"
            )}
          >
            <Dumbbell className="size-[17px]" strokeWidth={view === 'program' ? 2.35 : 1.9} />
            <span>Rutina</span>
          </motion.button>
        </div>

        <motion.button
          type="button"
          whileTap={{ scaleX: 1.12, scaleY: 0.84 }}
          transition={STICKY}
          onClick={() => setComposeOpen(true)}
          className="mx-0.5 mb-px flex size-11 shrink-0 origin-center items-center justify-center rounded-full border border-white/55 bg-indigo-500/90 text-white shadow-[0_10px_28px_rgba(79,70,229,0.28)] outline-none backdrop-blur-xl focus:outline-none focus-visible:outline-none max-[360px]:size-10 sm:size-12 dark:border-white/15 dark:bg-indigo-500/80"
          aria-label="Publicar o avisar"
        >
          <Plus className="size-5" strokeWidth={2.4} />
        </motion.button>

        <div className="grid min-w-0 flex-1 grid-cols-2">
          <motion.button
            type="button"
            whileTap={SLIME_TAP}
            transition={STICKY}
            onClick={() => goToSocial('chat')}
            className={cn(
              "flex min-h-12 origin-center flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-medium leading-none tracking-wide outline-none focus:outline-none focus-visible:outline-none max-[340px]:min-h-11 max-[340px]:text-[9px]",
              view === 'social' && socialTab === 'chat'
                ? "bg-white/65 text-indigo-600 shadow-sm dark:bg-white/10 dark:text-indigo-300"
                : "text-slate-400 dark:text-slate-500"
            )}
          >
            <span className="relative">
              <Users className="size-[17px]" strokeWidth={view === 'social' && socialTab === 'chat' ? 2.35 : 1.9} />
              {socialUnseen && (
                <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950" />
              )}
            </span>
            <span>Social</span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={SLIME_TAP}
            transition={STICKY}
            onClick={() => goToSocial('challenges')}
            className={cn(
              "flex min-h-12 origin-center flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-medium leading-none tracking-wide outline-none focus:outline-none focus-visible:outline-none max-[340px]:min-h-11 max-[340px]:text-[9px]",
              view === 'social' && socialTab === 'challenges'
                ? "bg-white/65 text-indigo-600 shadow-sm dark:bg-white/10 dark:text-indigo-300"
                : "text-slate-400 dark:text-slate-500"
            )}
          >
            <span className="relative">
              <Trophy className="size-[17px]" strokeWidth={view === 'social' && socialTab === 'challenges' ? 2.35 : 1.9} />
              {tourneyUnseen && (
                <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-950" />
              )}
            </span>
            <span>Torneos</span>
          </motion.button>
        </div>
      </nav>}
      <ComposeSheet
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPublish={() => {
          setComposeOpen(false);
          goToSocial('chat');
          setStoryComposerOpen(true);
        }}
        onGymNow={() => {
          setComposeOpen(false);
          goToSocial('checkins', { gymNow: true, from: 'dashboard' });
        }}
        onGymLater={() => {
          setComposeOpen(false);
          goToSocial('checkins', { openCheckInModal: true, from: 'dashboard' });
        }}
      />
      <StoryCamera
        open={storyComposerOpen}
        onClose={() => setStoryComposerOpen(false)}
        onPublished={() => {
          setStoryRefreshTick(n => n + 1);
        }}
      />
      <AppNoticeHost />
    </div>
    </MotionConfig>
  );
}

