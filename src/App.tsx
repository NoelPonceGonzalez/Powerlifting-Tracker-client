import React, { useState, useMemo, useEffect } from 'react';
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
  DayType
} from '@/src/types';
import { apiGet, apiPost, apiPut } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
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

interface RoutinePlan {
  id: string;
  name: string;
  weeks: TrainingWeek[]; // compat: se usa cuando no hay versions
  versions?: RoutineVersion[]; // versiones ordenadas por effectiveFromWeek asc
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

/** Copia un día con nuevos IDs para la semana/día destino */
function copyDayWithNewIds(
  srcDay: { id: string; name: string; type: string; exercises: PlannedExercise[] },
  targetWeekId: string,
  targetDayId: string
): { id: string; name: string; type: string; exercises: PlannedExercise[] } {
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

const createRoutinePlan = (id: string, name: string): RoutinePlan => {
  const weeks = generateWeeks();
  return {
    id,
    name,
    weeks,
    versions: [{ effectiveFromWeek: 1, weeks: deepCloneWeeks(weeks) }],
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
  const [routines, setRoutines] = useState<RoutinePlan[]>(INITIAL_ROUTINES);
  const [activeRoutineId, setActiveRoutineId] = useState<string>(INITIAL_ROUTINES[0].id);
  const [programScreen, setProgramScreen] = useState<'plan' | 'routines'>('plan');
  const [viewAsOfWeek, setViewAsOfWeek] = useState<number | null>(null); // null = presente, número = viaje en el tiempo
  const [friends, setFriends] = useState<FriendRequest[]>(INITIAL_FRIENDS);
  const [friendsList, setFriendsList] = useState<Friend[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>(INITIAL_CHALLENGES);
  const [checkIns, setCheckIns] = useState<GymCheckIn[]>(INITIAL_CHECKINS);
  const [socialTab, setSocialTab] = useState<'friends' | 'challenges' | 'checkins'>('friends');
  // Función helper para crear entrada de historial con todos los TMs
  const createHistoryEntry = (date: string, currentTms: TrainingMax[], currentRms: RMData): HistoryEntry => {
    const tmValues: Record<string, number> = {};
    currentTms.forEach(tm => {
      tmValues[tm.id] = tm.value;
    });
    
    const mainLiftsTotal = (currentRms.bench || 0) + (currentRms.squat || 0) + (currentRms.deadlift || 0);
    
    return {
      date,
      rms: { ...currentRms },
      total: mainLiftsTotal,
      trainingMaxes: tmValues
    };
  };

  const [history, setHistory] = useState<HistoryEntry[]>([
    createHistoryEntry('Ene', INITIAL_TMS, { bench: 100, squat: 130, deadlift: 180 }),
    createHistoryEntry('Feb', INITIAL_TMS.map(tm => ({ ...tm, value: tm.value + (tm.linkedExercise === 'bench' ? 2.5 : tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift' ? 5 : 0) })), { bench: 105, squat: 135, deadlift: 185 }),
    createHistoryEntry('Mar', INITIAL_TMS.map(tm => ({ ...tm, value: tm.value + (tm.linkedExercise === 'bench' ? 5 : tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift' ? 10 : 0) })), { bench: 110, squat: 140, deadlift: 190 }),
  ]);

  usePushNotifications(user?.id ?? null);

  const activeRoutine = useMemo(
    () => routines.find((routine) => routine.id === activeRoutineId) || routines[0],
    [routines, activeRoutineId]
  );
  const weeks = useMemo(() => {
    if (!activeRoutine) return [];
    const refWeek = viewAsOfWeek ?? 52;
    return getWeeksAt(activeRoutine, refWeek);
  }, [activeRoutine, viewAsOfWeek]);
  const logs = activeRoutine?.logs || {};
  const isHistoryMode = viewAsOfWeek !== null;

  const updateActiveRoutine = (updater: (routine: RoutinePlan) => RoutinePlan) => {
    setRoutines((prev) => prev.map((routine) => (
      routine.id === activeRoutineId ? updater(routine) : routine
    )));
  };

  // Theme logic
  useEffect(() => {
    if (!user) return;
    if (user.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [user]);

  // Cargar datos sociales cuando el usuario entra en la vista Social
  useEffect(() => {
    if (!user || view !== 'social') return;
    const loadSocialData = async () => {
      try {
        const [friendsRes, requestsRes, challengesRes] = await Promise.all([
          apiGet<Friend[]>('/api/social/friends'),
          apiGet<FriendRequest[]>('/api/social/requests'),
          apiGet<Challenge[]>('/api/challenges'),
        ]);
        setFriendsList(friendsRes);
        setFriends(requestsRes.map(r => ({ ...r, status: 'pending' as const })));
        setChallenges(challengesRes);
      } catch (e) {
        // Si no hay token o falla la API, mantener estado actual
        console.error('[Social] Error cargando datos:', e);
      }
    };
    loadSocialData();
  }, [user, view]);

  // Swipe logic
  const x = useMotionValue(0);
  const views: ViewType[] = ['dashboard', 'program', 'social', 'settings'];
  const currentIndex = views.indexOf(view);

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 50;
    if (info.offset.x > threshold && currentIndex > 0) {
      setView(views[currentIndex - 1]);
    } else if (info.offset.x < -threshold && currentIndex < views.length - 1) {
      setView(views[currentIndex + 1]);
    }
  };

  // Handlers
  const handleUpdateUser = (updates: Partial<User>) => {
    setUser(prev => (prev ? { ...prev, ...updates } : prev));
  };

  const handleCreateChallenge = async (data: { title: string; description?: string; type: 'max_reps' | 'weight' | 'seconds'; exercise: string; endDate: string }) => {
    try {
      const created = await apiPost<Challenge>('/api/challenges', data);
      setChallenges(prev => [...prev, created]);
      toast.success('Torneo creado correctamente');
    } catch (e: any) {
      toast.error(e.message || 'Error al crear el torneo');
    }
  };

  const handleJoinChallenge = async (id: string, value: number) => {
    try {
      const updated = await apiPut<Challenge>(`/api/challenges/${id}/join`, { value });
      setChallenges(prev => prev.map(c => c.id === id ? updated : c));
      toast.success('Te has unido al torneo');
    } catch (e: any) {
      toast.error(e.message || 'Error al unirte');
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
      setFriendsList(friendsRes);
      setFriends(requestsRes.map(r => ({ ...r, status: 'pending' as const })));
      toast.success('Solicitud aceptada');
    } catch (e: any) {
      toast.error(e.message || 'Error al aceptar');
    }
  };

  const handleRejectFriend = async (id: string) => {
    try {
      await apiPut(`/api/social/requests/${id}/reject`, {});
      setFriends(prev => prev.filter(f => f.id !== id));
      toast.success('Solicitud rechazada');
    } catch (e: any) {
      toast.error(e.message || 'Error al rechazar');
    }
  };

  const handleSendFriendRequest = async (userId: string): Promise<void> => {
    try {
      await apiPost('/api/social/requests', { userId });
    } catch (e: any) {
      toast.error(e.message || 'Error al enviar solicitud');
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

  const handleCheckIn = async (gymName: string, time: string) => {
    if (!user) return;
    const newCheckIn: GymCheckIn = {
      id: `ci-${Math.random().toString(36).substr(2, 5)}`,
      userId: user.id,
      userName: user.name,
      avatar: user.avatar,
      gymName,
      time,
      timestamp: Date.now()
    };
    setCheckIns(prev => [...prev, newCheckIn]);
    try {
      await apiPost('/api/checkins', { gymName, time });
    } catch (e) {
      // Mantener en local aunque falle el backend
    }
    toast.success(`Aviso enviado: ${gymName} a las ${time}`);
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

    setCheckIns((prev) => [...prev, myCheckIn]);

    // Notificación in-app (compatible con móvil vía WebView).
    toast.info(`Vas con ${friendCheckIn.userName} a las ${friendCheckIn.time}`);

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

    // Enviar notificación al amigo en backend (si hay sesión/token).
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      await fetch('/api/notifications/same-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          friendUserId: friendCheckIn.userId,
          gymName: friendCheckIn.gymName,
          time: friendCheckIn.time,
        }),
      });
    } catch {
      // Si falla la notificación remota, no bloqueamos la UX local.
    }
  };

  // Handlers
  const handleAddTM = () => {
    const newTM: TrainingMax = {
      id: `tm-${Math.random().toString(36).substr(2, 5)}`,
      name: 'Nuevo TM',
      value: 0,
      mode: 'weight'
    };
    setTms(prev => [...prev, newTM]);
  };

  const handleRemoveTM = (id: string) => {
    setTms(prev => prev.filter(tm => tm.id !== id));
  };

  const handleUpdateTM = (id: string, updates: Partial<TrainingMax>) => {
    // Actualizar el TM
    setTms(prev => prev.map(tm => tm.id === id ? { ...tm, ...updates } : tm));
    
    // If it's a main lift, update rms too
    const currentTm = tms.find(t => t.id === id);
    if (currentTm?.linkedExercise && updates.value !== undefined) {
      setRms(prev => ({ ...prev, [currentTm.linkedExercise!]: updates.value! }));
    }
  };

  const handleCreateRoutine = () => {
    const routineName = prompt('Nombre de la rutina:')?.trim();
    if (!routineName) return;

    setRoutines((prev) => {
      const nextIndex = prev.length + 1;
      const newRoutine: RoutinePlan = createRoutinePlan(
        `routine-${Math.random().toString(36).slice(2, 8)}`,
        routineName || `Rutina ${String.fromCharCode(64 + Math.min(nextIndex, 26))}`
      );
      setActiveRoutineId(newRoutine.id);
      setProgramScreen('plan');
      return [...prev, newRoutine];
    });
  };

  const handleSelectRoutine = (routineId: string) => {
    setActiveRoutineId(routineId);
    setProgramScreen('plan');
  };

  const handleCopyFriendRoutine = (routine: { name: string; weeks: TrainingWeek[] }) => {
    const id = `routine-${Math.random().toString(36).slice(2, 8)}`;
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
    const newRoutine: RoutinePlan = {
      id,
      name: `${routine.name} (de amigo)`,
      weeks: newWeeks,
      versions: [{ effectiveFromWeek: 1, weeks: deepCloneWeeks(newWeeks) }],
      logs: {},
    };
    setRoutines(prev => {
      const next = [...prev, newRoutine];
      setActiveRoutineId(id);
      setProgramScreen('plan');
      return next;
    });
    setView('program');
    toast.success('Rutina copiada y activada');
  };

  const handleRenameRoutine = (routineId: string, name: string) => {
    setRoutines((prev) => prev.map((routine) => (
      routine.id === routineId ? { ...routine, name } : routine
    )));
  };

  const handleDeleteRoutine = (routineId: string) => {
    setRoutines((prev) => {
      if (prev.length <= 1) {
        alert('Debe existir al menos una rutina activa.');
        return prev;
      }

      const remaining = prev.filter((routine) => routine.id !== routineId);
      if (activeRoutineId === routineId) {
        setActiveRoutineId(remaining[0].id);
      }
      return remaining;
    });
  };

  const applyRoutineChangeWithVersioning = (
    routine: RoutinePlan,
    weekIdx: number,
    dayIdx: number,
    applyToDay: (day: TrainingWeek['days'][0]) => TrainingWeek['days'][0]
  ): RoutinePlan => {
    const vers = routine.versions?.length ? routine.versions : [{ effectiveFromWeek: 1, weeks: deepCloneWeeks(routine.weeks) }];
    const latest = vers[vers.length - 1];
    const baseWeeks = deepCloneWeeks(latest.weeks);
    const srcWeek = baseWeeks[weekIdx];
    if (!srcWeek || !srcWeek.days[dayIdx]) return { ...routine, weeks: baseWeeks };
    const modifiedDay = applyToDay({ ...srcWeek.days[dayIdx] });
    baseWeeks[weekIdx] = { ...srcWeek, days: srcWeek.days.map((d, i) => i === dayIdx ? modifiedDay : d) };
    for (let wi = weekIdx + 1; wi < baseWeeks.length; wi++) {
      const w = baseWeeks[wi];
      const targetDay = copyDayWithNewIds(modifiedDay, w.id, w.days[dayIdx].id);
      baseWeeks[wi] = { ...w, days: w.days.map((d, i) => i === dayIdx ? targetDay : d) };
    }
    const newVersion: RoutineVersion = { effectiveFromWeek: weekIdx + 1, weeks: baseWeeks };
    const newVersions = [...vers.filter(v => v.effectiveFromWeek < newVersion.effectiveFromWeek), newVersion].sort((a, b) => a.effectiveFromWeek - b.effectiveFromWeek);
    return { ...routine, weeks: baseWeeks, versions: newVersions };
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

  const handleSetLogChange = (logId: string, setIdx: number, updates: Partial<SetLog>) => {
    updateActiveRoutine((routine) => {
      const log = routine.logs[logId] || { rpe: '', notes: '', completed: false, sets: [] };
      const currentSets = [...(log.sets || [])];
      
      while (currentSets.length <= setIdx) {
        currentSets.push({ id: `${currentSets.length}`, weight: null, reps: null, completed: false });
      }
      
      currentSets[setIdx] = { ...currentSets[setIdx], ...updates };
      
      return {
        ...routine,
        logs: {
          ...routine.logs,
          [logId]: {
            ...log,
            sets: currentSets
          }
        }
      };
    });
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
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
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
              theme: data.user.theme ?? 'light',
            });
          } catch (parseError) {
            console.error('[SESSION] Error parseando respuesta:', parseError);
            localStorage.removeItem('auth_token');
            setUser(null);
          }
        } else {
          // Si el token es inválido o expirado, simplemente limpiar y continuar
          localStorage.removeItem('auth_token');
          setUser(null);
        }
      } catch (e: any) {
        // Error de conexión o servidor no disponible - no mostrar error, solo continuar sin usuario
        console.error('[SESSION] Error verificando sesión:', e.message || e);
        localStorage.removeItem('auth_token');
        setUser(null);
      } finally {
        setIsCheckingSession(false);
      }
    };
    checkSession();
  }, []);

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
      setUser(null);
    } catch (e) {
      console.error('Logout failed');
      localStorage.removeItem('auth_token');
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
          const targetWeight = linkedTM ? Math.round(linkedTM.value * (ex.pct || 100) / 100) : (ex.weight || 0);

          if (log.sets && log.sets.length > 0) {
            log.sets.forEach((set, sIdx) => {
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

  // Función para guardar el período actual en el historial
  const saveCurrentPeriod = () => {
    const currentDate = new Date().toLocaleDateString('es-ES', { month: 'short' });
    
    const newRms: RMData = {
      bench: tms.find(t => t.linkedExercise === 'bench')?.value || 0,
      squat: tms.find(t => t.linkedExercise === 'squat')?.value || 0,
      deadlift: tms.find(t => t.linkedExercise === 'deadlift')?.value || 0,
    };
    
    // Añadir otros TMs al RMData
    tms.forEach(tm => {
      const key = tm.linkedExercise || tm.name.toLowerCase().replace(/\s+/g, '_');
      if (key !== 'bench' && key !== 'squat' && key !== 'deadlift') {
        newRms[key] = tm.value;
      }
    });
    
    setHistory(prev => {
      // Si el último entry es del mismo mes, reemplazarlo, sino añadir uno nuevo
      const lastIsCurrentMonth = prev.length > 0 && prev[prev.length - 1].date === currentDate;
      if (lastIsCurrentMonth) {
        return [
          ...prev.slice(0, -1),
          createHistoryEntry(currentDate, tms, newRms)
        ];
      } else {
        return [
          ...prev,
          createHistoryEntry(currentDate, tms, newRms)
        ];
      }
    });
    
    alert(`✅ Período guardado: ${currentDate}`);
  };

  const nextCycle = () => {
    // Primero guardar el período actual antes de incrementar
    saveCurrentPeriod();
    
    // Luego incrementar los TMs
    const newTms = tms.map(tm => {
      if (tm.linkedExercise === 'bench') return { ...tm, value: tm.value + 2.5 };
      if (tm.linkedExercise === 'squat' || tm.linkedExercise === 'deadlift') return { ...tm, value: tm.value + 5 };
      if (tm.mode === 'weight') return { ...tm, value: tm.value + 2.5 };
      if (tm.mode === 'reps') return { ...tm, value: tm.value + 1 };
      if (tm.mode === 'seconds') return { ...tm, value: tm.value + 5 };
      return tm;
    });
    setTms(newTms);
    
    // Actualizar RMs para los ejercicios principales
    const updatedRms: RMData = { ...rms };
    newTms.forEach(tm => {
      if (tm.linkedExercise) {
        updatedRms[tm.linkedExercise] = tm.value;
      }
    });
    setRms(updatedRms);

    updateActiveRoutine((routine) => ({ ...routine, logs: {} }));
    alert("¡Ciclo actualizado! Se han incrementado tus Training Maxes.");
  };

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

  const handleUpdateDayType = (weekId: string, dayId: string, type: DayType) => {
    updateActiveRoutine((r) => {
      const base = r.versions?.length ? r.versions[r.versions.length - 1].weeks : r.weeks;
      const weekIdx = base.findIndex((w: TrainingWeek) => w.id === weekId);
      if (weekIdx < 0) return r;
      const dayIdx = base[weekIdx]?.days.findIndex((d: { id: string }) => d.id === dayId) ?? -1;
      if (dayIdx < 0) return r;
      return applyRoutineChangeWithVersioning(r, weekIdx, dayIdx, (day) => ({ ...day, type }));
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
      <motion.div 
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={handleDragEnd}
        className="min-h-screen cursor-grab active:cursor-grabbing"
      >
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <DashboardView 
              key="dashboard"
              user={user}
              history={history}
              rms={rms}
              trainingMaxes={tms}
              challenges={challenges}
              checkIns={checkIns}
              onOpenProgram={() => {
                setProgramScreen('plan');
                setView('program');
              }}
              onOpenSocial={(tab) => {
                if (tab) setSocialTab(tab);
                setView('social');
              }}
              onJoinFriendCheckIn={handleJoinFriendCheckIn}
              onLogout={handleLogout}
            />
          )}
          {view === 'program' && (
            programScreen === 'routines' ? (
              <RoutineManagerView
                key="routine-manager"
                routines={routines.map((routine) => ({
                  id: routine.id,
                  name: routine.name,
                  isActive: routine.id === activeRoutineId,
                }))}
                onBack={() => setProgramScreen('plan')}
                onActivateRoutine={handleSelectRoutine}
                onCreateRoutine={handleCreateRoutine}
                onRenameRoutine={handleRenameRoutine}
                onDeleteRoutine={handleDeleteRoutine}
              />
            ) : (
              <TrainingPlanView 
                key="program"
                activeRoutineName={activeRoutine?.name || 'Rutina activa'}
                trainingMaxes={tms}
                weeks={weeks}
                logs={logs}
                viewAsOfWeek={viewAsOfWeek}
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
                onNextCycle={nextCycle}
                onSavePeriod={saveCurrentPeriod}
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
              onRefreshChallenges={refreshChallenges}
              onCopyFriendRoutine={handleCopyFriendRoutine}
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
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/80 dark:bg-slate-900/85 backdrop-blur-xl border border-white/20 dark:border-slate-700/60 shadow-2xl shadow-indigo-200/50 dark:shadow-black/40 rounded-[2.5rem] px-8 py-4 flex items-center gap-10 z-50">
        <button 
          onClick={() => setView('dashboard')} 
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'dashboard' ? "text-indigo-600 scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <LayoutDashboard size={24} strokeWidth={view === 'dashboard' ? 2.5 : 2} />
          <span className="text-[10px] font-black tracking-widest uppercase">Progreso</span>
        </button>
        <button 
          onClick={() => {
            setProgramScreen('plan');
            setView('program');
          }} 
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'program' ? "text-indigo-600 scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <Dumbbell size={24} strokeWidth={view === 'program' ? 2.5 : 2} />
          <span className="text-[10px] font-black tracking-widest uppercase">Rutina</span>
        </button>
        <button 
          onClick={() => setView('social')} 
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'social' ? "text-indigo-600 scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <Users size={24} strokeWidth={view === 'social' ? 2.5 : 2} />
          <span className="text-[10px] font-black tracking-widest uppercase">Social</span>
        </button>
        <button 
          onClick={() => setView('settings')} 
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'settings' ? "text-indigo-600 scale-110" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          )}
        >
          <Settings size={24} strokeWidth={view === 'settings' ? 2.5 : 2} />
          <span className="text-[10px] font-black tracking-widest uppercase">Ajustes</span>
        </button>
      </nav>
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

