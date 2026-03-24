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
  PlannedExercise,
  RoutineVersion,
  FriendRequest,
  Friend,
  User,
  Challenge,
  GymCheckIn,
  SetLog,
  InternalExerciseMax,
  getInternalValueForMode,
  DayType
} from '@/src/types';
import { apiGet, apiPost, apiPut, apiDelete } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import { computeRoutineProgressTotal } from '@/src/lib/routineProgressTotal';
import { findDayIndexForLogId } from '@/src/lib/trainingMaxDayContext';
import { parseRoutineLogsFromMongo, serializeRoutineLogsForMongo } from '@/src/lib/routineLogs';
import { getWeekTypeSlot } from '@/src/lib/mesocycleWeek';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';

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

const INITIAL_WEEKS: TrainingWeek[] = generateWeeks();
const AUTH_USER_STORAGE_KEY = 'auth_user';

const getCurrentWeekOfYear = (date = new Date()): number => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diffDays = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
};

interface RoutinePlan {
  id: string;
  name: string;
  sameTemplateAllWeeks?: boolean; // true = mismo contenido todas las semanas
  hiddenFromSocial?: boolean; // true = no mostrar/copiar en perfil social
  weeks: TrainingWeek[]; // compat: se usa cuando no hay versions
  versions?: RoutineVersion[]; // versiones ordenadas por effectiveFromWeek asc
  baseTemplate?: TrainingWeek[]; // Plantilla base Semana 1..4
  weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
  logs: Record<string, LogEntry>;
}

/** Obtiene las semanas a mostrar según la semana de referencia (1-based) */
function getWeeksAt(routine: RoutinePlan, weekNumber: number): TrainingWeek[] {
  const versions = routine.versions;
  if (!versions || versions.length === 0) return routine.weeks;
  const applicable = versions.filter(v => v.effectiveFromWeek <= weekNumber);
  if (applicable.length === 0) return routine.weeks;
  const best = applicable.reduce((a, b) => a.effectiveFromWeek >= b.effectiveFromWeek ? a : b);
  return best.weeks;
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
 * Semanas para enlazar `logs` con ejercicios al subir TM. Debe usar los mismos IDs que la UI (p. ej. w14-d0-e1).
 * Si solo se usa `versions[last].weeks` con plantilla 1–4, las claves de log no coinciden y el TM no sube.
 */
function getWeeksForTrainingMaxScan(routine: RoutinePlan): TrainingWeek[] {
  const versionWeeks =
    routine.versions?.length > 0
      ? routine.versions[routine.versions.length - 1].weeks
      : [];
  if (routine.weeks?.length > 0 && routine.weeks.length >= (versionWeeks?.length || 0)) {
    return routine.weeks;
  }
  if (versionWeeks?.length > 0) return versionWeeks;
  return routine.weeks || [];
}

/** Copia un día con nuevos IDs para la semana/día destino */
function copyDayWithNewIds(
  srcDay: { id: string; name: string; type: DayType; exercises: PlannedExercise[] },
  targetWeekId: string,
  targetDayId: string
): { id: string; name: string; type: DayType; exercises: PlannedExercise[] } {
  return {
    id: targetDayId,
    name: srcDay.name,
    type: srcDay.type,
    exercises: srcDay.exercises.map((e, idx) => ({
      ...e,
      id: `${targetWeekId}-${targetDayId}-e${idx + 1}`,
    })),
  };
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

function normalizeTemplateWeek(week: TrainingWeek, weekType: number): TrainingWeek {
  return {
    ...week,
    id: `template-w${weekType}`,
    number: weekType,
    days: week.days.map((day, dayIdx) => ({
      ...day,
      id: `template-w${weekType}-d${dayIdx}`,
      exercises: day.exercises.map((exercise, exIdx) => ({
        ...exercise,
        id: `template-w${weekType}-d${dayIdx}-e${exIdx + 1}`,
      })),
    })),
  };
}

function deriveBaseTemplateFromWeeks(weeks: TrainingWeek[]): TrainingWeek[] {
  const byType = new Map<number, TrainingWeek>();
  weeks.forEach((week) => {
    const slot = getWeekTypeSlot(week.number);
    if (!byType.has(slot)) byType.set(slot, week);
  });
  const fallback = weeks[0] || {
    id: 'template-empty',
    number: 1,
    days: [],
  } as TrainingWeek;
  return [1, 2, 3, 4].map((slot) => normalizeTemplateWeek(byType.get(slot) || fallback, slot));
}

const createRoutinePlan = (id: string, name: string): RoutinePlan => {
  const weeks = generateWeeks();
  return {
    id,
    name,
    sameTemplateAllWeeks: true,
    hiddenFromSocial: false,
    weeks,
    versions: [{ effectiveFromWeek: 1, weeks: deepCloneWeeks(weeks) }],
    baseTemplate: deriveBaseTemplateFromWeeks(weeks),
    weekTypeOverrides: [],
    logs: {},
  };
};

const INITIAL_ROUTINES: RoutinePlan[] = [
  createRoutinePlan('routine-a', 'Rutina A'),
  createRoutinePlan('routine-b', 'Rutina B'),
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
  const [routines, setRoutines] = useState<RoutinePlan[]>(INITIAL_ROUTINES);
  const [activeRoutineId, setActiveRoutineId] = useState<string>(INITIAL_ROUTINES[0].id);
  /** Ref para ignorar respuestas de fetch de TM/historial si el usuario ya cambió de rutina. */
  const activeRoutineIdRef = useRef(activeRoutineId);
  activeRoutineIdRef.current = activeRoutineId;
  const [programScreen, setProgramScreen] = useState<'plan' | 'routines'>('plan');
  const [viewAsOfWeek, setViewAsOfWeek] = useState<number | null>(null); // null = presente, número = viaje en el tiempo
  const [friends, setFriends] = useState<FriendRequest[]>(INITIAL_FRIENDS);
  const [friendsList, setFriendsList] = useState<Friend[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>(INITIAL_CHALLENGES);
  const [checkIns, setCheckIns] = useState<GymCheckIn[]>(INITIAL_CHECKINS);
  const [socialTab, setSocialTab] = useState<'friends' | 'challenges' | 'checkins'>('friends');

  const goToSocial = useCallback((tab?: 'friends' | 'challenges' | 'checkins') => {
    setSocialTab(tab ?? 'friends');
    setView('social');
  }, []);

  const getYearAndWeek = (d = new Date()) => ({
    year: d.getFullYear(),
    week: getCurrentWeekOfYear(d),
  });

  // Función helper para crear entrada de historial con todos los TMs
  const createHistoryEntry = (
    date: string,
    currentTms: TrainingMax[],
    currentRms: RMData,
    weekYear?: { week: number; year: number; dayIndex?: number }
  ): HistoryEntry => {
    const tmValues: Record<string, number> = {};
    currentTms.forEach(tm => {
      tmValues[tm.id] = tm.value;
    });
    const progress = computeRoutineProgressTotal(currentTms);
    const { week, year } = weekYear ?? getYearAndWeek();
    return {
      date,
      week,
      year,
      ...(weekYear?.dayIndex !== undefined ? { dayIndex: weekYear.dayIndex } : {}),
      rms: { ...currentRms },
      total: progress.value,
      progressKind: progress.kind,
      trainingMaxes: tmValues
    };
  };

  /** Obtener los TMs vigentes para una semana concreta (modo histórico) */
  const getTMsForWeek = (displayWeekNum: number, displayYear: number): TrainingMax[] => {
    const sorted = [...history].filter(e => e.year != null && e.week != null);
    if (sorted.length === 0) return tms;
    // Ordenar desc por (year, week) para encontrar el más reciente <= (displayYear, displayWeekNum)
    sorted.sort((a, b) => {
      const y = (b.year ?? 0) - (a.year ?? 0);
      if (y !== 0) return y;
      return (b.week ?? 0) - (a.week ?? 0);
    });
    const entry = sorted.find(e => {
      const ey = e.year ?? 0;
      const ew = e.week ?? 0;
      return ey < displayYear || (ey === displayYear && ew <= displayWeekNum);
    });
    if (!entry?.trainingMaxes) return tms;
    return tms.map(tm => ({
      ...tm,
      value: entry.trainingMaxes[tm.id] ?? tm.value
    }));
  };

  const [history, setHistory] = useState<HistoryEntry[]>([]);

  usePushNotifications(user?.id ?? null);

  const activeRoutine = useMemo(
    () => routines.find((routine) => routine.id === activeRoutineId) || routines[0],
    [routines, activeRoutineId]
  );
  /** Siempre la rutina activa más reciente: el flush del debounce de sync debe leer esto, no el closure del efecto (evita guardar sin logs nuevos). */
  const routineForSyncRef = useRef<RoutinePlan | null>(null);
  routineForSyncRef.current = activeRoutine ?? null;
  /** Evita guardar historial/TM en Mongo con `routineId` nuevo y `tms` aún de la rutina anterior. */
  const tmsLoadedForRoutineRef = useRef<string | null>(null);
  const tmHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tarjetas TM que acaban de subir desde el registro de series (feedback visual). */
  const [tmAutoHighlightIds, setTmAutoHighlightIds] = useState<string[]>([]);
  /** Recalcula cada render para no quedar congelado en la semana del primer mount. */
  const currentWeekOfYear = getCurrentWeekOfYear(new Date());
  const weeks = useMemo(() => {
    if (!activeRoutine) return [];
    const refWeek = viewAsOfWeek ?? currentWeekOfYear;
    return getWeeksAt(activeRoutine, refWeek);
  }, [activeRoutine, viewAsOfWeek, currentWeekOfYear]);
  const logs = activeRoutine?.logs || {};
  const isHistoryMode = viewAsOfWeek !== null;

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const ya = a.year ?? 0, yb = b.year ?? 0;
      if (ya !== yb) return ya - yb;
      return (a.week ?? 0) - (b.week ?? 0);
    });
  }, [history]);

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
        // Usuario nuevo: crear rutina y TMs por defecto en DB
        if (!routinesRes?.length) {
          const seedRoutine = createRoutinePlan('seed', 'Rutina A');
          try {
            const created = await apiPost<any>('/api/routines', {
              name: seedRoutine.name,
              weeks: getWeeksAt(seedRoutine, currentWeekOfYear),
              versions: seedRoutine.versions,
              baseTemplate: seedRoutine.baseTemplate,
              weekTypeOverrides: seedRoutine.weekTypeOverrides,
              isActive: true,
            });
            const plan: RoutinePlan = {
              id: String(created._id || created.id),
              name: created.name,
              sameTemplateAllWeeks: !!created.sameTemplateAllWeeks,
              hiddenFromSocial: !!created.hiddenFromSocial,
              weeks: created.weeks || [],
              versions: created.versions?.length ? created.versions : [{ effectiveFromWeek: 1, weeks: created.weeks || [] }],
              baseTemplate: created.baseTemplate?.length ? created.baseTemplate : deriveBaseTemplateFromWeeks(created.weeks || []),
              weekTypeOverrides: created.weekTypeOverrides || [],
              logs: {},
            };
            setRoutines([plan]);
            setActiveRoutineId(plan.id);
          } catch (e) {
            console.error('[App] Error creando rutina seed:', e);
          }
        }
        // Los TM se cargan por rutina activa (efecto dedicado); al crear rutina el servidor inserta TM por defecto.
        // Rutinas: server → RoutinePlan
        if (routinesRes?.length > 0) {
          const plans: RoutinePlan[] = routinesRes.map((r: any) => ({
            id: String(r._id || r.id),
            name: r.name || 'Rutina',
            sameTemplateAllWeeks: r.sameTemplateAllWeeks !== false,
            hiddenFromSocial: !!r.hiddenFromSocial,
            weeks: r.weeks || [],
            versions: r.versions?.length ? r.versions : [{ effectiveFromWeek: 1, weeks: r.weeks || [] }],
            baseTemplate: r.baseTemplate?.length ? r.baseTemplate : deriveBaseTemplateFromWeeks(r.weeks || []),
            weekTypeOverrides: r.weekTypeOverrides || [],
            logs: parseRoutineLogsFromMongo(r.logs),
          }));
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
      return;
    }
    if (!activeRoutineId) return;
    if (tmHighlightTimerRef.current) {
      clearTimeout(tmHighlightTimerRef.current);
      tmHighlightTimerRef.current = null;
    }
    setTmAutoHighlightIds([]);
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) {
      setTms(INITIAL_TMS);
      setRms({
        bench: INITIAL_TMS[0]?.value ?? 110,
        squat: INITIAL_TMS[1]?.value ?? 140,
        deadlift: INITIAL_TMS[2]?.value ?? 190,
      });
      tmsLoadedForRoutineRef.current = activeRoutineId;
      return;
    }
    tmsLoadedForRoutineRef.current = null;
    const rid = activeRoutineId;
    setTms([]);
    setRms({ bench: 0, squat: 0, deadlift: 0 });
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
    };
  }, [user?.id, activeRoutineId]);

  // TM internos por rutina activa (GET ?routineId= — mismos nombres en otra rutina = otros registros)
  useEffect(() => {
    if (!user?.id) {
      setInternalExerciseMaxes([]);
      return;
    }
    if (!activeRoutineId) return;
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) {
      setInternalExerciseMaxes([]);
      return;
    }
    const rid = activeRoutineId;
    setInternalExerciseMaxes([]);
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
  }, [user?.id, activeRoutineId]);

  // Historial de progreso por rutina activa (mismos TM que la rutina)
  useEffect(() => {
    if (!user?.id || !activeRoutineId) return;
    const isLocalOnlyRoutine = activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20;
    if (isLocalOnlyRoutine) {
      const base = INITIAL_TMS;
      const feb = base.map(tm => ({ ...tm, value: tm.value + (tm.linkedExercise === 'bench' ? 2.5 : tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift' ? 5 : 0) }));
      const mar = base.map(tm => ({ ...tm, value: tm.value + (tm.linkedExercise === 'bench' ? 5 : tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift' ? 10 : 0) }));
      setHistory([
        createHistoryEntry('Ene', base, { bench: 100, squat: 130, deadlift: 180 }, { week: 1, year: new Date().getFullYear() }),
        createHistoryEntry('Feb', feb, { bench: 105, squat: 135, deadlift: 185 }, { week: 5, year: new Date().getFullYear() }),
        createHistoryEntry('Mar', mar, { bench: 110, squat: 140, deadlift: 190 }, { week: 10, year: new Date().getFullYear() }),
      ]);
      return;
    }
    setHistory([]);
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
            dayIndex: h.dayIndex != null ? Number(h.dayIndex) : undefined,
            rms: h.rms || {},
            total: Number(h.total),
            trainingMaxes: h.trainingMaxes || {},
            progressKind: h.progressKind,
            routineId: h.routineId ? String(h.routineId) : hid,
          }))
        );
      } catch (e) {
        console.error('[App] Error cargando historial de la rutina:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeRoutineId]);

  // Sincronizar rutina activa a la DB (debounced 2s tras cambios en logs/weeks)
  const routineSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routineSyncFlush = useRef<() => Promise<void> | null>(null);
  useEffect(() => {
    if (!user || !activeRoutine) return;
    const routine = routines.find(r => r.id === activeRoutineId);
    if (!routine || (routine.id.startsWith('routine-') && routine.id.length < 20)) return; // evitar ids locales no persistidos
    const doSync = async () => {
      const toSync = routineForSyncRef.current;
      if (!toSync || (toSync.id.startsWith('routine-') && toSync.id.length < 20)) {
        routineSyncRef.current = null;
        return;
      }
      try {
        const weeks = getRoutineWeeksForPersistence(toSync);
        const baseTemplate = toSync.baseTemplate?.length ? toSync.baseTemplate : deriveBaseTemplateFromWeeks(weeks);
        const weekTypeOverrides = toSync.weekTypeOverrides || [];
        const logsObj = serializeRoutineLogsForMongo(toSync.logs);
        const versionsPayload =
          toSync.versions?.length && toSync.versions.length > 0
            ? toSync.versions
            : [{ effectiveFromWeek: 1, weeks }];
        await apiPut(`/api/routines/${toSync.id}`, {
          weeks,
          versions: versionsPayload,
          baseTemplate,
          weekTypeOverrides,
          logs: logsObj,
          sameTemplateAllWeeks: toSync.sameTemplateAllWeeks,
          hiddenFromSocial: toSync.hiddenFromSocial,
        });
      } catch (e) {
        console.error('[Routine] Error sincronizando:', e);
      }
      routineSyncRef.current = null;
    };
    routineSyncFlush.current = doSync;
    routineSyncRef.current && clearTimeout(routineSyncRef.current);
    routineSyncRef.current = setTimeout(doSync, 2000);
    return () => {
      if (routineSyncRef.current) {
        clearTimeout(routineSyncRef.current);
        routineSyncRef.current = null;
        // Flush pendiente al desmontar para no perder cambios
        routineSyncFlush.current?.();
      }
    };
  }, [routines, activeRoutineId, user?.id, activeRoutine]);

  /** Enviar rutina pendiente al salir de la pestaña / cerrar (el debounce 2s podría no dispararse). */
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

  // Check-ins en Social y Dashboard; torneos siempre en ambas vistas (así los amigos ven torneos creados sin depender solo de Social)
  useEffect(() => {
    if (!user || (view !== 'social' && view !== 'dashboard')) return;
    const loadData = async () => {
      try {
        const toFetch: Promise<any>[] = [
          apiGet<any[]>('/api/checkins'),
          apiGet<Challenge[]>('/api/challenges'),
        ];
        if (view === 'social') {
          toFetch.push(
            apiGet<Friend[]>('/api/social/friends'),
            apiGet<FriendRequest[]>('/api/social/requests'),
          );
        }
        const results = await Promise.all(toFetch.map(p => p.catch(() => null)));
        const checkInsRes = results[0];
        const challengesRes = results[1];
        if (checkInsRes?.length) {
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
        if (view === 'social') {
          const friendsRes = results[2] || [];
          setFriendsList(friendsRes.filter((f: { id: string }) => f.id !== user?.id));
          setFriends((results[3] || []).map((r: any) => ({ ...r, status: 'pending' as const })));
        }
      } catch (e) {
        console.error('[App] Error cargando datos:', e);
      }
    };
    loadData();
  }, [user, view]);

  // Swipe logic
  const x = useMotionValue(0);
  const views: ViewType[] = ['dashboard', 'program', 'social', 'settings'];
  const currentIndex = views.indexOf(view);

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 50;
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
      } catch (e) {
        console.error('[App] Error al guardar preferencias:', e);
      }
    }
  };

  const handleCreateChallenge = async (data: { title: string; description?: string; type: 'max_reps' | 'weight' | 'seconds'; exercise: string; endDate: string }) => {
    try {
      const created = await apiPost<Challenge>('/api/challenges', data);
      setChallenges(prev => [...prev, created]);
    } catch (e: any) {
    }
  };

  const handleJoinChallenge = async (id: string, value: number) => {
    try {
      const updated = await apiPut<Challenge>(`/api/challenges/${id}/join`, { value });
      setChallenges(prev => prev.map(c => c.id === id ? updated : c));
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
    } catch (e: any) {
    }
  };

  const handleRejectFriend = async (id: string) => {
    try {
      await apiPut(`/api/social/requests/${id}/reject`, {});
      setFriends(prev => prev.filter(f => f.id !== id));
    } catch (e: any) {
    }
  };

  const handleUnfriend = async (friendId: string) => {
    try {
      await apiDelete(`/api/social/friends/${friendId}`);
      setFriendsList(prev => prev.filter(f => f.id !== friendId));
    } catch (e: any) {
    }
  };

  const handleSendFriendRequest = async (userId: string): Promise<void> => {
    try {
      await apiPost('/api/social/requests', { userId });
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
    } catch {
      // mantener en local si falla
    }
  };

  const handleCheckInDelete = async (checkInId: string) => {
    if (!user) return;
    try {
      await apiDelete(`/api/checkins/${checkInId}`);
      setCheckIns(prev => prev.filter(ci => ci.id !== checkInId));
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
    } catch {
      // Si falla la notificación remota, no bloqueamos la UX local.
    }
  };

  // Handlers
  const handleAddTM = async () => {
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) {
      const local: TrainingMax = {
        id: `tm-${Math.random().toString(36).slice(2, 9)}`,
        name: 'Nuevo TM',
        value: 50,
        mode: 'weight',
      };
      setTms((prev) => [...prev, local]);
      return;
    }
    try {
      const created = await apiPost<any>('/api/training-maxes', {
        routineId: activeRoutineId,
        name: 'Nuevo TM',
        value: 50,
        mode: 'weight',
      });
      const newTm = {
        id: String(created._id || created.id),
        name: created.name,
        value: Number(created.value),
        mode: created.mode,
        linkedExercise: created.linkedExercise,
      };
      setTms(prev => [...prev, newTm]);
      // Actualizar historial para que el total incluya el nuevo TM
      const currentDate = new Date().toLocaleDateString('es-ES', { month: 'short' });
      setHistory(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const newTmsRecord = { ...last.trainingMaxes, [newTm.id]: newTm.value };
        const updatedTmsList = [...tms, newTm];
        const progNew = computeRoutineProgressTotal(updatedTmsList);
        const newTotal = progNew.value;
        const newKind = progNew.kind;
        if (last.date === currentDate) {
          return [...prev.slice(0, -1), { ...last, trainingMaxes: newTmsRecord, total: newTotal, progressKind: newKind }];
        }
        const entry = createHistoryEntry(currentDate, updatedTmsList, rms, getYearAndWeek());
        return [...prev, entry];
      });
    } catch (e) {
      console.error('[TM] Error creando:', e);
    }
  };

  const handleRemoveTM = async (id: string) => {
    setTms(prev => prev.filter(tm => tm.id !== id));
    if (!/^[a-f0-9]{24}$/i.test(id)) return;
    if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
    try {
      await apiDelete(
        `/api/training-maxes/${id}?routineId=${encodeURIComponent(activeRoutineId)}`
      );
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
      const currentDate = new Date().toLocaleDateString('es-ES', { month: 'short' });
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
        if (last.date === currentDate) {
          return [...prev.slice(0, -1), { ...last, trainingMaxes: newTms, rms: newRms, total: newTotal, progressKind: newKind }];
        }
        const entry = createHistoryEntry(currentDate, updatedTmsList, newRms, getYearAndWeek());
        return [...prev, entry];
      });
    }
    (async () => {
      if (!/^[a-f0-9]{24}$/i.test(id)) return;
      if (activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20) return;
      try {
        await apiPut(`/api/training-maxes/${id}`, { ...updates, routineId: activeRoutineId });
      } catch (e) {
        console.error('[TM] Error actualizando:', e);
        // rollback si no persiste en DB
        setTms(prevTms);
        setRms(prevRms);
      }
    })();
  };

  const handleCreateRoutine = async (routineName: string) => {
    const name = routineName?.trim();
    if (!name) return;
    const newRoutine = createRoutinePlan(
      `routine-${Math.random().toString(36).slice(2, 8)}`,
      name
    );
    try {
      const created = await apiPost<any>('/api/routines', {
        name: newRoutine.name,
        weeks: getWeeksAt(newRoutine, currentWeekOfYear),
        versions: newRoutine.versions,
        baseTemplate: newRoutine.baseTemplate,
        weekTypeOverrides: newRoutine.weekTypeOverrides,
        /** La rutina nueva pasa a ser la activa en Mongo (desactiva el resto): TM, gráficos e historial van ligados a ella. */
        isActive: true,
      });
      const plan: RoutinePlan = {
        id: String(created._id || created.id),
        name: created.name,
        sameTemplateAllWeeks: !!created.sameTemplateAllWeeks,
        hiddenFromSocial: !!created.hiddenFromSocial,
        weeks: created.weeks || [],
        versions: created.versions?.length ? created.versions : [{ effectiveFromWeek: 1, weeks: created.weeks || [] }],
        baseTemplate: created.baseTemplate?.length ? created.baseTemplate : deriveBaseTemplateFromWeeks(created.weeks || []),
        weekTypeOverrides: created.weekTypeOverrides || [],
        logs: parseRoutineLogsFromMongo(created.logs),
      };
      setRoutines(prev => [...prev, plan]);
      setActiveRoutineId(plan.id);
      setProgramScreen('plan');
      try {
        await apiPut(`/api/routines/${plan.id}/activate`, {});
      } catch (activateErr) {
        console.error('[Routine] Error activando rutina recién creada:', activateErr);
      }
    } catch (e) {
      console.error('[Routine] Error creando:', e);
    }
  };

  const handleSelectRoutine = async (routineId: string) => {
    setActiveRoutineId(routineId);
    setProgramScreen('plan');
    try {
      await apiPut(`/api/routines/${routineId}/activate`, {});
    } catch (e) {
      console.error('[Routine] Error activando:', e);
    }
  };

  const handleCopyFriendRoutine = async (routine: { name: string; weeks: TrainingWeek[] }) => {
    const newWeeks: TrainingWeek[] = routine.weeks.map((w, wi) => ({
      ...w,
      id: `w${wi + 1}`,
      days: w.days.map((d, di) => ({
        ...d,
        id: `w${wi + 1}-d${di}`,
        exercises: d.exercises.map((e, ei) => ({
          ...e,
          id: `w${wi + 1}-d${di}-e${ei + 1}`,
          linkedTo: undefined,
        })),
      })),
    }));
    try {
      const copiedBaseTemplate = deriveBaseTemplateFromWeeks(newWeeks);
      const created = await apiPost<any>('/api/routines', {
      name: `${routine.name} (de amigo)`,
      weeks: newWeeks,
        versions: [{ effectiveFromWeek: 1, weeks: newWeeks }],
        baseTemplate: copiedBaseTemplate,
        weekTypeOverrides: [],
        isActive: true,
      });
      const plan: RoutinePlan = {
        id: String(created._id || created.id),
        name: created.name,
        sameTemplateAllWeeks: !!created.sameTemplateAllWeeks,
        hiddenFromSocial: !!created.hiddenFromSocial,
        weeks: created.weeks || [],
        versions: created.versions?.length ? created.versions : [{ effectiveFromWeek: 1, weeks: created.weeks || [] }],
        baseTemplate: created.baseTemplate?.length ? created.baseTemplate : copiedBaseTemplate,
        weekTypeOverrides: created.weekTypeOverrides || [],
        logs: {},
      };
      setRoutines(prev => [...prev, plan]);
      setActiveRoutineId(plan.id);
      setProgramScreen('plan');
    setView('program');
    } catch (e) {
      console.error('[Routine] Error copiando:', e);
    }
  };

  const handleRenameRoutine = async (routineId: string, name: string) => {
    setRoutines((prev) => prev.map((r) => (r.id === routineId ? { ...r, name } : r)));
    try {
      await apiPut(`/api/routines/${routineId}`, { name });
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
    } catch (e) {
      console.error('[Routine] Error eliminando:', e);
    }
  };

  const applyRoutineChangeWithVersioning = (
    routine: RoutinePlan,
    weekIdx: number,
    dayIdx: number,
    applyToDay: (day: TrainingWeek['days'][0]) => TrainingWeek['days'][0],
    options?: { propagate?: boolean }
  ): RoutinePlan => {
    const vers = routine.versions?.length ? routine.versions : [{ effectiveFromWeek: 1, weeks: deepCloneWeeks(routine.weeks) }];
    const latest = vers[vers.length - 1];
    const baseWeeks = deepCloneWeeks(latest.weeks);
    const srcWeek = baseWeeks[weekIdx];
    if (!srcWeek || !srcWeek.days[dayIdx]) return { ...routine, weeks: baseWeeks };
    const slot = getWeekTypeSlot(srcWeek.number);
    const modifiedDay = applyToDay({ ...srcWeek.days[dayIdx] });
    baseWeeks[weekIdx] = { ...srcWeek, days: srcWeek.days.map((d, i) => i === dayIdx ? modifiedDay : d) };

    const propagate = options?.propagate !== false;
    if (propagate) {
      const sameAll = !!routine.sameTemplateAllWeeks;
      for (let wi = weekIdx + 1; wi < baseWeeks.length; wi++) {
        const w = baseWeeks[wi];
        if (!sameAll && getWeekTypeSlot(w.number) !== slot) continue;
        const targetDay = copyDayWithNewIds(modifiedDay, w.id, w.days[dayIdx].id);
        baseWeeks[wi] = { ...w, days: w.days.map((d, i) => i === dayIdx ? targetDay : d) };
      }
    }

    const currentBaseTemplate = routine.baseTemplate?.length ? routine.baseTemplate : deriveBaseTemplateFromWeeks(baseWeeks);
    const nextOverrides = propagate
      ? [
          ...(routine.weekTypeOverrides || []).filter((ov: { weekType: number }) => ov.weekType !== slot),
          { weekType: slot, week: normalizeTemplateWeek(baseWeeks[weekIdx], slot) },
        ].sort((a: { weekType: number }, b: { weekType: number }) => a.weekType - b.weekType)
      : (routine.weekTypeOverrides || []);

    const newVersion: RoutineVersion = { effectiveFromWeek: weekIdx + 1, weeks: baseWeeks };
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
    updateActiveRoutine((r) => {
      const base = r.versions?.length ? r.versions[r.versions.length - 1].weeks : r.weeks;
      const weekIdx = base.findIndex((w: TrainingWeek) => w.id === weekId);
      if (weekIdx < 0) return r;
      const dayIdx = base[weekIdx]?.days.findIndex((d: { id: string }) => d.id === dayId) ?? -1;
      if (dayIdx < 0) return r;
      return applyRoutineChangeWithVersioning(r, weekIdx, dayIdx, (day) => ({
        ...day,
        exercises: [...day.exercises, {
          id: `${weekId}-${dayId}-e${day.exercises.length + 1}`,
          name: initialValues?.name ?? 'Nuevo Ejercicio',
          sets: initialValues?.sets ?? 3,
          reps: initialValues?.reps ?? 10,
          mode: (initialValues?.mode as ExerciseMode) ?? 'weight',
          ...initialValues,
        }],
      }));
    });
  };

  const handleRemoveExercise = (weekId: string, dayId: string, exerciseId: string) => {
    updateActiveRoutine((r) => {
      const base = r.versions?.length ? r.versions[r.versions.length - 1].weeks : r.weeks;
      const weekIdx = base.findIndex((w: TrainingWeek) => w.id === weekId);
      if (weekIdx < 0) return r;
      const dayIdx = base[weekIdx]?.days.findIndex((d: { id: string }) => d.id === dayId) ?? -1;
      if (dayIdx < 0) return r;
      return applyRoutineChangeWithVersioning(r, weekIdx, dayIdx, (day) => ({
        ...day,
        exercises: day.exercises.filter(e => e.id !== exerciseId),
      }));
    });
  };

  const handleUpdateExercise = (weekId: string, dayId: string, exerciseId: string, updates: Partial<PlannedExercise>) => {
    updateActiveRoutine((r) => {
      const base = r.versions?.length ? r.versions[r.versions.length - 1].weeks : r.weeks;
      const weekIdx = base.findIndex((w: TrainingWeek) => w.id === weekId);
      if (weekIdx < 0) return r;
      const dayIdx = base[weekIdx]?.days.findIndex((d: { id: string }) => d.id === dayId) ?? -1;
      if (dayIdx < 0) return r;
      return applyRoutineChangeWithVersioning(r, weekIdx, dayIdx, (day) => ({
        ...day,
        exercises: day.exercises.map(e => e.id === exerciseId ? { ...e, ...updates } : e),
      }));
    });
  };

  const handleLogChange = (id: string, field: keyof LogEntry, value: any) => {
    updateActiveRoutine((routine) => ({
      ...routine,
      logs: {
        ...routine.logs,
        [id]: {
          ...(routine.logs[id] || { rpe: '', notes: '', completed: false, sets: [] }),
          [field]: value
        }
      }
    }));
  };

  const roundTo25 = (n: number) => Math.round(n / 2.5) * 2.5;

  const resolveLinkedTM = (exercise: PlannedExercise): TrainingMax | undefined => {
    if (!exercise.linkedTo?.trim()) return undefined;
    const byId = tms.find(tm => tm.id === exercise.linkedTo);
    if (byId) return byId;
    const byLinked = tms.find(tm => tm.linkedExercise === (exercise.linkedTo as keyof RMData));
    if (byLinked) return byLinked;
    const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return tms.find(tm => norm(tm.name) === norm(exercise.linkedTo!) || norm(tm.name) === norm(exercise.name));
  };

  /** TM de rutina vinculado, o TM interno inferido por nombre (peso / reps / segundos por separado en Mongo). */
  const resolveEffectiveTM = (exercise: PlannedExercise): TrainingMax | undefined => {
    const official = resolveLinkedTM(exercise);
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
      w: number;
      y: number;
      dayIndex: number;
      currentDate: string;
      newTmsRecord: Record<string, number>;
      newTotal: number;
    };
    let tmBump: TmBumpPayload | null = null;
    let pendingInternalUpserts: { name: string; mode: 'weight' | 'reps' | 'seconds'; candidateValue: number }[] = [];
    updateActiveRoutine((routine) => {
      const log = routine.logs[logId] || { rpe: '', notes: '', completed: false, sets: [] };
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
        ...routine.logs,
        [logId]: { ...log, sets: currentSets }
      };
      const updatedRoutine = { ...routine, logs: updatedLogs };

      if (!isHistoryMode && user) {
        const baseWeeks = getWeeksForTrainingMaxScan(routine);
        let didBump = false;
        const newTms = [...tms];
        baseWeeks.forEach((week: TrainingWeek) => {
          week.days.forEach((day: { id: string; exercises: PlannedExercise[] }) => {
            day.exercises.forEach((ex: PlannedExercise) => {
              const linkedTM = resolveLinkedTM(ex);
              if (!linkedTM) return;
              const idxTm = newTms.findIndex(t => t.id === linkedTM.id);
              if (idxTm < 0) return;
              const lid = `${week.id}-${day.id}-${ex.id}`;
              const l = updatedLogs[lid];
              if (!l?.sets) return;
              l.sets.forEach((set: SetLog) => {
                if (linkedTM.mode === 'weight') {
                  const w = set.weight ?? 0;
                  const r = set.reps ?? 0;
                  if (w <= 0 || r <= 0) return;
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
          week.days.forEach((day: { id: string; exercises: PlannedExercise[] }) => {
            day.exercises.forEach((ex: PlannedExercise) => {
              // Solo saltar si hay TM de rutina real; si linkedTo es huérfano, el TM interno aplica y debe actualizarse
              if (resolveLinkedTM(ex)) return;
              const lid = `${week.id}-${day.id}-${ex.id}`;
              const l = updatedLogs[lid];
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
          const im = internalExerciseMaxes.find(
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
          const newRms = { ...rms };
          linked.forEach(tm => { if (tm.linkedExercise) newRms[tm.linkedExercise] = tm.value; });
          const { week: w, year: y } = getYearAndWeek();
          const newTmsRecord = newTms.reduce((acc, tm) => ({ ...acc, [tm.id]: tm.value }), {} as Record<string, number>);
          const newTotal = computeRoutineProgressTotal(newTms).value;
          const currentDate = new Date().toLocaleDateString('es-ES', { month: 'short' });
          const dayIndex = findDayIndexForLogId(updatedRoutine, logId) ?? 0;
          tmBump = {
            newTms,
            newRms,
            prevTmsSnapshot: tms,
            w,
            y,
            dayIndex,
            currentDate,
            newTmsRecord,
            newTotal,
          };
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
      queueMicrotask(() => {
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
        setTms(b.newTms);
        setRms(b.newRms);
        setHistory(prev => {
          const entry: HistoryEntry = {
            ...createHistoryEntry(b.currentDate, b.newTms, b.newRms, {
              week: b.w,
              year: b.y,
              dayIndex: b.dayIndex,
            }),
            routineId: activeRoutineId,
          };
          const filtered = prev.filter(
            e =>
              !(
                e.year === entry.year &&
                e.week === entry.week &&
                (e.dayIndex ?? -1) === (entry.dayIndex ?? -1)
              )
          );
          return [...filtered, entry].sort((a, b) => {
            const ya = (a.year ?? 0) - (b.year ?? 0);
            if (ya !== 0) return ya;
            const wa = (a.week ?? 0) - (b.week ?? 0);
            if (wa !== 0) return wa;
            return (a.dayIndex ?? 999) - (b.dayIndex ?? 999);
          });
        });
        b.newTms.filter(t => t.value !== b.prevTmsSnapshot.find(ot => ot.id === t.id)?.value).forEach(tm => {
          apiPut(`/api/training-maxes/${tm.id}`, {
            value: tm.value,
            routineId: activeRoutineId,
          }).catch(() => {});
        });
        const isPersistedRoutine = !(activeRoutineId.startsWith('routine-') && activeRoutineId.length < 20);
        if (isPersistedRoutine) {
          apiPost('/api/training-maxes/save-period', {
            routineId: activeRoutineId,
            date: b.currentDate,
            week: b.w,
            year: b.y,
            dayIndex: b.dayIndex,
            rms: b.newRms,
            total: b.newTotal,
            trainingMaxes: b.newTmsRecord,
            progressKind: computeRoutineProgressTotal(b.newTms).kind,
          }).catch(() => {});
        }
      });
    }
  };

  const handleMarkCompleted = (logId: string, completed: boolean) => {
    updateActiveRoutine((routine) => ({
      ...routine,
      logs: {
        ...routine.logs,
        [logId]: {
          ...(routine.logs[logId] || { rpe: '', notes: '', completed: false, sets: [] }),
          completed
        }
      }
    }));
  };

  useEffect(() => {
    const checkSession = async () => {
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
        
        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (res.ok) {
          try {
            const data = await res.json();
            setUser({
              id: String(data.user._id || data.user.id),
              name: data.user.name || 'Atleta',
              email: data.user.email,
              avatar: data.user.avatar || 'https://picsum.photos/seed/user/200/200',
              bodyWeight: data.user.bodyWeight ?? 80,
              theme: (data.user.theme || (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) as 'light' | 'dark',
              progressMode: data.user.progressMode === 'year' ? 'year' : data.user.progressMode === 'month' ? 'month' : undefined,
            });
            localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify({
              id: String(data.user._id || data.user.id),
              name: data.user.name || 'Atleta',
              email: data.user.email,
              avatar: data.user.avatar || 'https://picsum.photos/seed/user/200/200',
              bodyWeight: data.user.bodyWeight ?? 80,
              theme: (data.user.theme || (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) as 'light' | 'dark',
              progressMode: data.user.progressMode === 'year' ? 'year' : data.user.progressMode === 'month' ? 'month' : undefined,
            }));
          } catch (parseError) {
            console.error('[SESSION] Error parseando respuesta:', parseError);
            localStorage.removeItem('auth_token');
            localStorage.removeItem(AUTH_USER_STORAGE_KEY);
            setUser(null);
          }
        } else {
          // Si el token es inválido o expirado, simplemente limpiar y continuar
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

  const handleLogout = async () => {
    const token = localStorage.getItem('auth_token');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });
      localStorage.removeItem('auth_token');
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      setUser(null);
    } catch (e) {
      console.error('Logout failed');
      localStorage.removeItem('auth_token');
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      setUser(null);
    }
  };

  const exportToExcel = () => {
    const data: any[] = [];
    weeks.forEach(week => {
      week.days.forEach(day => {
        day.exercises.forEach(ex => {
          const logId = `${week.id}-${day.id}-${ex.id}`;
          const log = logs[logId] || { rpe: '', notes: '', completed: false, sets: [] };
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
    const { week, year } = getYearAndWeek(now);
    const entry = createHistoryEntry(currentDate, tms, rms, { week, year });
    const entryWithRoutine: HistoryEntry = { ...entry, routineId: activeRoutineId };
    setHistory(prev => {
      const filtered = prev.filter(
        e => !(e.year === year && e.week === week && e.dayIndex == null)
      );
      return [...filtered, entryWithRoutine].sort((a, b) => {
        const ya = (a.year ?? 0) - (b.year ?? 0);
        if (ya !== 0) return ya;
        const wa = (a.week ?? 0) - (b.week ?? 0);
        if (wa !== 0) return wa;
        return (a.dayIndex ?? 999) - (b.dayIndex ?? 999);
      });
    });
    try {
      await apiPost('/api/training-maxes/save-period', {
        routineId: activeRoutineId,
        date: entry.date,
        week: entry.week,
        year: entry.year,
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
        <LoginView onLogin={(userData) => setUser(userData)} toast={toast} />
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
      apiPut(`/api/routines/${routine.id}`, { sameTemplateAllWeeks: newVal }).catch((e) => {
        console.error('[Routine] Error guardando Mes/Sem:', e);
        toast?.({ type: 'error', message: 'No se pudo guardar la preferencia Mes/Sem' });
      });
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
      } catch (e) {
        setRoutines((prev) =>
          prev.map((r) => (r.id === routineId ? { ...r, hiddenFromSocial: routine.hiddenFromSocial } : r))
        );
        toast?.({ type: 'error', message: 'No se pudo guardar la visibilidad' });
      }
    }
  };

  const handleUpdateDayType = (weekId: string, dayId: string, type: DayType) => {
    updateActiveRoutine((r) => {
      const base = r.versions?.length ? r.versions[r.versions.length - 1].weeks : r.weeks;
      const weekIdx = base.findIndex((w: TrainingWeek) => w.id === weekId);
      if (weekIdx < 0) return r;
      const dayIdx = base[weekIdx]?.days.findIndex((d: { id: string }) => d.id === dayId) ?? -1;
      if (dayIdx < 0) return r;
      return applyRoutineChangeWithVersioning(r, weekIdx, dayIdx, (day) => ({ ...day, type }), { propagate: false });
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden px-2 max-[400px]:px-2 sm:px-4 md:px-6 py-2 sm:py-4">
      <motion.div 
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={handleDragEnd}
        className="min-h-screen cursor-grab active:cursor-grabbing backdrop-blur-2xl bg-white/50 dark:bg-slate-900/50"
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
              onOpenSocial={(tab) => goToSocial(tab)}
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
                onToggleSameTemplateAllWeeks={handleToggleSameTemplateAllWeeks}
                trainingMaxes={tms}
                history={history}
                referenceCalendarWeek={viewAsOfWeek ?? currentWeekOfYear}
                calendarYear={new Date().getFullYear()}
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
                onAddTM={handleAddTM}
                onRemoveTM={handleRemoveTM}
                onAddExercise={isHistoryMode ? () => {} : handleAddExercise}
                onRemoveExercise={isHistoryMode ? () => {} : handleRemoveExercise}
                onUpdateExercise={isHistoryMode ? () => {} : handleUpdateExercise}
                onUpdateDayType={isHistoryMode ? () => {} : handleUpdateDayType}
                onLogChange={isHistoryMode ? () => {} : handleLogChange}
                onSetLogChange={isHistoryMode ? () => {} : handleSetLogChange}
                onMarkCompleted={isHistoryMode ? () => {} : handleMarkCompleted}
                onOpenRoutineManager={() => setProgramScreen('routines')}
                onExport={exportToExcel}
              />
            )
          )}
          {view === 'social' && (
            <SocialView 
              key="social"
              user={user}
              friendsList={friendsList}
              requests={friends}
              challenges={challenges}
              checkIns={checkIns}
              initialTab={socialTab}
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

