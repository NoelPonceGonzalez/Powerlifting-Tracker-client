import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Activity, 
  CheckCircle2, 
  Download, 
  Plus,
  Trash2,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  Target,
  Gauge,
  Clock,
  MessageSquare,
  X,
  Lightbulb,
  SkipForward
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { LogEntry, TrainingMax, TrainingWeek, TrainingDay, PlannedExercise, ExerciseMode, DayType, SetLog, InternalExerciseMax, getInternalValueForMode, HistoryEntry } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { firstWeekOfYearStartingInMonth } from '@/src/lib/mesocycleWeek';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import { getTMsForView } from '@/src/lib/historyTm';
import { dateISOFromYearWeekDay, weekOfYearFromDate } from '@/src/lib/calendarWeekDate';
import { getLogEntryForExercise, routineLogKeyFromExerciseId, routineLogKeyFromIds } from '@/src/lib/routineLogKey';
import { resolveTmForAutoBump } from '@/src/lib/trainingMaxResolve';

/** Borrador de TM nuevo en el modal; no existe en API hasta que el usuario guarda. */
const NEW_TM_DRAFT_ID = '__new__';

/** Colores RPE según valor: soporta escalas 0-10 y 0-100, y decimales (ej. 8.5) */
const getRPEColor = (val: string): string => {
  const v = parseFloat(val.replace(',', '.'));
  if (Number.isNaN(v)) return 'border-slate-200 bg-slate-50 text-slate-500';
  const isScale100 = v > 10;
  const pct = isScale100 ? v / 100 : v / 10;
  if (pct <= 0.4) return 'border-emerald-200 bg-emerald-50 focus-within:border-emerald-400 text-emerald-700';
  if (pct <= 0.7) return 'border-amber-200 bg-amber-50 focus-within:border-amber-400 text-amber-700';
  return 'border-rose-200 bg-rose-50 focus-within:border-rose-400 text-rose-700';
};

interface DayTypeBadgeProps {
  key?: any;
  type: DayType;
  onClick?: () => void;
}

const DayTypeBadge = ({ type, onClick }: DayTypeBadgeProps) => {
  const config = {
    workout: { label: 'Entrenamiento', color: 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400' },
    rest: { label: 'Descanso', color: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' },
    deload: { label: 'Descarga', color: 'bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400' }
  };
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
        config[type].color,
        onClick && "hover:scale-105 active:scale-95"
      )}
    >
      {config[type].label}
    </button>
  );
};

interface TrainingPlanViewProps {
  activeRoutineName: string;
  sameTemplateAllWeeks?: boolean;
  cycleLength?: number;
  onToggleSameTemplateAllWeeks?: () => void;
  trainingMaxes: TrainingMax[];
  /** Snapshots de TM por semana/día (misma rutina); para mostrar el TM “como era” al ver otro día/semana. */
  tmHistory?: HistoryEntry[];
  /** IDs de TM recién subidos desde el registro de series (resaltado en tarjetas). */
  tmAutoHighlightIds?: string[];
  /** TM inferidos por nombre (registro de series); desbloquean % como TM de rutina. */
  internalExerciseMaxes: InternalExerciseMax[];
  weeks: TrainingWeek[];
  logs: Record<string, LogEntry>;
  viewAsOfWeek?: number | null;
  currentWeekOfYear?: number;
  onViewAsOfWeekChange?: (week: number | null) => void;
  isHistoryMode?: boolean;
  versionWeeks?: number[];
  onUpdateTM: (id: string, updates: Partial<TrainingMax>) => void;
  /** Crea TM en servidor solo al confirmar el modal (nombre + valor por el usuario). */
  onCreateTM: (payload: {
    name: string;
    value: number;
    mode: ExerciseMode;
    sharedToSocial?: boolean;
  }) => void | Promise<void>;
  onRemoveTM: (id: string) => void;
  onAddExercise: (weekId: string, dayId: string, initialValues?: Partial<PlannedExercise>) => void;
  onRemoveExercise: (weekId: string, dayId: string, exerciseId: string) => void;
  onUpdateExercise: (weekId: string, dayId: string, exerciseId: string, updates: Partial<PlannedExercise>) => void;
  /** Guardar logs en servidor (PATCH /logs); puede ser async para esperar a Mongo antes de cerrar el modal. */
  onRoutinePlanFlush?: () => void | Promise<void>;
  onUpdateDayType: (weekId: string, dayId: string, type: DayType) => void;
  onLogChange: (id: string, field: keyof LogEntry, value: any) => void;
  onSetLogChange: (logId: string, setIdx: number, updates: Partial<SetLog>) => void;
  onMarkCompleted: (logId: string, completed: boolean) => void;
  onOpenRoutineManager: () => void;
  onExport: () => void;
  skippedWeeks?: number[];
  onSkipWeek?: (weekNumber: number, mode: 'shift' | 'skip_only') => void;
  /** Sincroniza año/semana/día del plan visible para anclar TM manual (no “hoy”). */
  planViewAnchorRef?: React.MutableRefObject<{
    year: number;
    week: number;
    dayOfWeek: number;
    dateISO: string;
  }>;
}

export const TrainingPlanView: React.FC<TrainingPlanViewProps> = ({ 
  activeRoutineName,
  sameTemplateAllWeeks = true,
  cycleLength = 4,
  onToggleSameTemplateAllWeeks,
  trainingMaxes,
  tmHistory = [],
  tmAutoHighlightIds = [],
  internalExerciseMaxes = [],
  weeks,
  logs,
  viewAsOfWeek = null,
  currentWeekOfYear = 1,
  onViewAsOfWeekChange,
  isHistoryMode = false,
  versionWeeks = [], 
  onUpdateTM,
  onCreateTM,
  onRemoveTM,
  onAddExercise,
  onRemoveExercise,
  onUpdateExercise,
  onRoutinePlanFlush,
  onUpdateDayType,
  onLogChange, 
  onSetLogChange,
  onMarkCompleted,
  onOpenRoutineManager,
  onExport,
  skippedWeeks = [],
  onSkipWeek,
  planViewAnchorRef
}) => {
  const displayWeekNum = viewAsOfWeek ?? currentWeekOfYear;
  const displayPlanYear = new Date().getFullYear();
  const initialWeekIdx = Math.max(0, Math.min((weeks?.length || 52) - 1, displayWeekNum - 1));
  // Lunes=0 .. Domingo=6; getDay(): 0=Dom, 1=Lun, ...
  const todayDayIdx = (new Date().getDay() + 6) % 7;
  const [activeWeekIdx, setActiveWeekIdx] = useState(initialWeekIdx);
  const [activeDayIdx, setActiveDayIdx] = useState(Math.min(todayDayIdx, 6));
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [showDayTypeDropdown, setShowDayTypeDropdown] = useState(false);
  const [showSkipDropdown, setShowSkipDropdown] = useState(false);
  
  // Add Exercise Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTM, setEditingTM] = useState<TrainingMax | null>(null);
  const [tmModalError, setTmModalError] = useState('');
  const [newExModalError, setNewExModalError] = useState('');
  const [loggingExercise, setLoggingExercise] = useState<{ weekId: string, dayId: string, exercise: PlannedExercise } | null>(null);

  const closeTmModal = () => {
    setEditingTM(null);
    setTmModalError('');
  };

  // Bloquear scroll del body cuando el modal de ejercicio está abierto
  useEffect(() => {
    if (loggingExercise) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [loggingExercise]);

  const dayButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [newExForm, setNewExForm] = useState({
    name: '',
    linkedTo: '',
    pct: 75,
    sets: 3,
    reps: '5',
    mode: 'weight' as ExerciseMode
  });

  /** Borrador local para poder vaciar el campo al editar (evita 3→32 al no poder borrar). Se confirma en onBlur. */
  const [setsInputDraft, setSetsInputDraft] = useState<Record<string, string>>({});
  const [repsInputDraft, setRepsInputDraft] = useState<Record<string, string>>({});
  const [pctInputDraft, setPctInputDraft] = useState<Record<string, string>>({});
  const [targetInputDraft, setTargetInputDraft] = useState<Record<string, string>>({});
  const [logInputDraft, setLogInputDraft] = useState<Record<string, string>>({});

  // Scroll al día actual cuando se carga la semana
  useEffect(() => {
    const el = dayButtonRefs.current[activeDayIdx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeWeekIdx]);

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const getDateForWeekOfYear = (weekNum: number): Date => {
    const jan1 = new Date(displayPlanYear, 0, 1);
    const target = new Date(jan1);
    target.setDate(jan1.getDate() + (weekNum - 1) * 7);
    return target;
  };
  const getMonthForWeek = (weekNum: number): string => months[getDateForWeekOfYear(weekNum).getMonth()];
  const currentWeek = weeks[activeWeekIdx];
  const currentDay = currentWeek?.days[activeDayIdx];
  const currentMonth = getMonthForWeek(displayWeekNum);
  /** Semana del ciclo (1–N) según cycleLength de la rutina. */
  const cycleWeek = useMemo(
    () => ((Math.max(1, displayWeekNum) - 1) % Math.max(1, cycleLength)) + 1,
    [displayWeekNum, cycleLength]
  );

  useEffect(() => {
    const targetIdx = Math.max(0, Math.min(weeks.length - 1, displayWeekNum - 1));
    setActiveWeekIdx(targetIdx);
  }, [displayWeekNum, weeks.length]);

  const viewDateISO = useMemo(
    () => dateISOFromYearWeekDay(displayPlanYear, displayWeekNum, activeDayIdx),
    [displayPlanYear, displayWeekNum, activeDayIdx]
  );

  useLayoutEffect(() => {
    if (!planViewAnchorRef) return;
    planViewAnchorRef.current = {
      year: displayPlanYear,
      week: displayWeekNum,
      dayOfWeek: activeDayIdx,
      dateISO: viewDateISO,
    };
  }, [displayPlanYear, displayWeekNum, activeDayIdx, viewDateISO]);

  const modalLogKey = useMemo(() => {
    if (!loggingExercise) return '';
    const w = weeks.find((x) => x.id === loggingExercise.weekId);
    const d = w?.days.find((x) => x.id === loggingExercise.dayId);
    if (w && d) return routineLogKeyFromIds(w, d, loggingExercise.exercise);
    return routineLogKeyFromExerciseId(loggingExercise.exercise.id) ?? `${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`;
  }, [loggingExercise, weeks]);

  /**
   * Solo el día civil de “hoy” en esta misma semana del plan usa TM vivos (`trainingMaxes`).
   * Si usáramos vivos en toda la semana actual, al mejorar un TM el día 2 el día 1 seguiría mostrando el valor nuevo.
   * Si usáramos siempre `getTMsForView` también en hoy, un PR recién guardado podría no verse hasta que exista snapshot en historial.
   */
  const isCurrentWeekLive = displayWeekNum === (currentWeekOfYear ?? 1);

  const effectiveTms = useMemo(() => {
    const now = new Date();
    const todayIso = dateISOFromYearWeekDay(
      now.getFullYear(),
      weekOfYearFromDate(now),
      (now.getDay() + 6) % 7
    );
    if (isCurrentWeekLive && viewDateISO === todayIso) {
      return trainingMaxes;
    }
    return getTMsForView(trainingMaxes, tmHistory, viewDateISO);
  }, [trainingMaxes, tmHistory, viewDateISO, isCurrentWeekLive]);

  const viewDateLabel = useMemo(() => {
    const [y, m, d] = viewDateISO.split('-').map((x) => parseInt(x, 10));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return viewDateISO;
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [viewDateISO]);

  /** Los TM de la tarjeta difieren del último guardado en la rutina (snapshot histórico para esta fecha). */
  const tmDisplayIsHistorical = useMemo(
    () =>
      trainingMaxes.some((tm) => {
        const e = effectiveTms.find((x) => x.id === tm.id);
        return e != null && Number(e.value) !== Number(tm.value);
      }),
    [trainingMaxes, effectiveTms]
  );

  const tmCardsReadOnly = isHistoryMode || tmDisplayIsHistorical;
  /** Permitir registrar TM también mientras se consulta una semana pasada. */
  const canAddTrainingMax = true;

  const fieldKey = (week: TrainingWeek, day: TrainingDay, ex: PlannedExercise) => routineLogKeyFromIds(week, day, ex);

  const applySetsWithPct = (ex: PlannedExercise, newSets: number, effectiveTM: TrainingMax | undefined) => {
    const base = ex.pct ?? 75;
    let newPctPerSet = ex.pctPerSet;
    if (effectiveTM && newPctPerSet) {
      if (newSets < newPctPerSet.length) newPctPerSet = newPctPerSet.slice(0, newSets);
      else if (newSets > newPctPerSet.length) {
        newPctPerSet = [
          ...newPctPerSet,
          ...Array(newSets - newPctPerSet.length).fill(newPctPerSet[newPctPerSet.length - 1] ?? base),
        ];
      }
    } else if (effectiveTM) newPctPerSet = Array(newSets).fill(base);
    return { sets: newSets, ...(newPctPerSet && { pctPerSet: newPctPerSet }) };
  };

  /** Series: mínimo 1; no 0. */
  const parseSetsCommit = (raw: string): number => {
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  };

  /** Reps: no vacío ni "0" como único valor numérico; texto libre (ej. 8-12) se conserva. */
  const parseRepsCommit = (raw: string): string => {
    const t = raw.trim();
    if (t === '' || t === '0') return '1';
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      return n === 0 ? '1' : t;
    }
    return t || '1';
  };

  const roundTo25 = (num: number) => Math.round(num / 2.5) * 2.5;

  /** TM oficial (linkedTo o mismo nombre+modo) o TM interno (Mongo). */
  const resolveEffectiveTM = (exercise: PlannedExercise): TrainingMax | undefined => {
    const official = resolveTmForAutoBump(exercise, effectiveTms);
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

  /** Solo para feedback visual (series sin TM). La subida automática del TM usa kg/reps/s reales en App, no esto. */
  const calculateRM = (weight: number, reps: number) => {
    if (reps === 0) return 0;
    if (reps === 1) return weight;
    // Epley formula: Weight * (1 + Reps / 30)
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
  };

  const getIntensity = (weight: number, tmValue: number) => {
    if (tmValue === 0) return 0;
    return Math.round((weight / tmValue) * 100);
  };

  /** Determina si la serie fue más fuerte, más floja o parecida al plan. TM: compara %; no-TM: usa E1RM */
  const getSetPerformanceVerdict = (
    exercise: PlannedExercise,
    setLog: SetLog,
    targetWeight: number,
    targetReps: number
  ): 'stronger' | 'weaker' | 'similar' | null => {
    const refTM = resolveEffectiveTM(exercise);
    if (refTM && exercise.mode === 'weight') {
      const targetPct = refTM.value > 0 ? (targetWeight / refTM.value) * 100 : 0;
      const actualPct = setLog.weight != null && refTM.value > 0 ? (setLog.weight / refTM.value) * 100 : null;
      if (actualPct == null || setLog.reps == null) return null;
      const metReps = setLog.reps >= targetReps;
      if (actualPct > targetPct + 2 && metReps) return 'stronger';
      if (actualPct < targetPct - 2) return 'weaker';
      if (!metReps) return 'weaker';
      return 'similar';
    }
    if (exercise.mode === 'weight') {
      if (setLog.weight == null || setLog.reps == null) return null;
      const planE1RM = calculateRM(targetWeight, targetReps);
      const actualE1RM = calculateRM(setLog.weight, setLog.reps);
      if (planE1RM <= 0) return null;
      const diff = (actualE1RM - planE1RM) / planE1RM;
      if (diff > 0.03) return 'stronger';
      if (diff < -0.03) return 'weaker';
      return 'similar';
    }
    if (exercise.mode === 'reps' || exercise.mode === 'seconds') {
      if (setLog.reps == null) return null;
      const ar = setLog.reps;
      const tr = targetReps;
      if (ar > tr) return 'stronger';
      if (ar < tr) return 'weaker';
      return 'similar';
    }
    return null;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-32"
    >
      <header className="mb-6 sm:mb-10 flex flex-col gap-4">
        <div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-indigo-500 block">
              Rutina activa
            </span>
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={onOpenRoutineManager}
                className="text-left group flex-1 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                    {activeRoutineName}
                  </h1>
                  <ChevronRight className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" size={20} />
                </div>
              </button>
              {/* Sem/Mes toggle removed — not user-modifiable */}
            </div>
          </div>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-medium mt-1">Toca el nombre para gestionar tus rutinas</p>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-full sm:w-auto">
          <button 
            onClick={() => setViewMode('daily')}
            className={cn(
              "flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              viewMode === 'daily' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            Día
          </button>
          <button 
            onClick={() => setViewMode('weekly')}
            className={cn(
              "flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              viewMode === 'weekly' ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            )}
          >
            Semana
          </button>
        </div>
      </header>

      {/* Training Maxes Section */}
      <section className="mb-8 sm:mb-12">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-indigo-600 p-1.5 sm:p-2 rounded-xl">
              <Settings2 className="text-white" size={18} />
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Training Maxes</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!canAddTrainingMax) return;
              setTmModalError('');
              setEditingTM({
                id: NEW_TM_DRAFT_ID,
                name: '',
                value: 0,
                mode: 'weight',
                sharedToSocial: false,
              });
            }}
            disabled={!canAddTrainingMax}
            className="rounded-xl border-2 text-xs px-3 py-1.5 shadow-md shadow-slate-200/50 dark:shadow-none disabled:opacity-50"
          >
            <Plus size={14} className="mr-1 sm:mr-2" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest hidden sm:inline">Añadir TM</span>
            <span className="text-[9px] font-black uppercase tracking-widest sm:hidden">+</span>
          </Button>
        </div>

        {(!isCurrentWeekLive && tmDisplayIsHistorical) && (
          <p className="text-[10px] sm:text-xs font-semibold text-amber-800 dark:text-amber-300 mb-3 sm:mb-4 rounded-xl border border-amber-200 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/35 px-3 py-2.5 leading-snug">
            <span className="font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">TM en esta vista</span>
            {' — '}
            {viewDateLabel}
            {tmDisplayIsHistorical && (
              <span className="block mt-1 text-amber-700/95 dark:text-amber-400/95 font-medium">
                Valores históricos para ese día; al volver al presente verás los TM actuales guardados.
              </span>
            )}
          </p>
        )}
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {effectiveTms.map(tm => (
            <Card 
              key={tm.id} 
              padding="md" 
              rounded="xl" 
              className={cn(
                'border-2 relative group transition-all duration-500',
                tmCardsReadOnly
                  ? 'cursor-default'
                  : 'cursor-pointer hover:border-indigo-200 hover:shadow-md active:scale-[0.98]',
                tmAutoHighlightIds.includes(tm.id)
                  ? 'border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900 shadow-lg shadow-emerald-500/15'
                  : 'border-slate-100'
              )}
              onClick={() => {
                if (tmCardsReadOnly) return;
                setEditingTM(tm);
              }}
            >
              <div className="flex flex-col gap-1">
                <span className="font-black text-slate-400 uppercase text-[10px] tracking-widest">
                  {tm.name}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">{tm.value}</span>
                  <span className="text-slate-400 dark:text-slate-500 font-bold text-sm">
                    {tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's'}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Plan Content */}
      <section className="relative">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-slate-900 p-1.5 sm:p-2 rounded-xl">
              <Calendar className="text-white" size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Semana {cycleWeek}{!sameTemplateAllWeeks ? ` / ${cycleLength}` : ''} {viewMode === 'daily' && <span className="hidden sm:inline">— {currentDay.name}</span>}
              </h2>
              {viewMode === 'daily' && (
                <span className="text-sm sm:hidden text-slate-500 font-medium">{currentDay.name}</span>
              )}
              {!isHistoryMode && (
                <p className="mt-1 text-[10px] sm:text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {sameTemplateAllWeeks
                    ? "Los cambios se aplican a todas las semanas futuras."
                    : `Semana ${cycleWeek} del ciclo de ${cycleLength}. Los cambios se aplican a futuras semanas tipo ${cycleWeek}.`}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <button 
                onClick={() => setShowMonthSelector(!showMonthSelector)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 px-3 sm:px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 dark:text-white hover:border-indigo-200 dark:hover:border-indigo-500 transition-all"
              >
                {currentMonth}
              </button>
              <AnimatePresence>
                {showMonthSelector && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 shadow-2xl rounded-2xl p-2 grid grid-cols-3 gap-1 z-50 w-64"
                  >
                    {months.map((m, idx) => (
                      <button
                        key={m}
                        onClick={() => {
                          const year = displayPlanYear;
                          const targetWeekNum = firstWeekOfYearStartingInMonth(year, idx);
                          const targetIdx = Math.max(0, Math.min(weeks.length - 1, targetWeekNum - 1));
                          setActiveWeekIdx(targetIdx);
                          onViewAsOfWeekChange?.(targetWeekNum === currentWeekOfYear ? null : targetWeekNum);
                          setShowMonthSelector(false);
                        }}
                        className={cn(
                          "px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                          currentMonth === m ? "bg-indigo-600 text-white" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-300"
                        )}
                      >
                        {m.substr(0, 3)}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                if (activeWeekIdx > 0) {
                  const newIdx = activeWeekIdx - 1;
                  setActiveWeekIdx(newIdx);
                  const weekNum = newIdx + 1;
                  onViewAsOfWeekChange?.(weekNum === currentWeekOfYear ? null : weekNum);
                }
              }} disabled={activeWeekIdx === 0} className="px-3 py-2">
                <ChevronLeft size={18} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (activeWeekIdx < weeks.length - 1) {
                  const newIdx = activeWeekIdx + 1;
                  setActiveWeekIdx(newIdx);
                  const weekNum = newIdx + 1;
                  onViewAsOfWeekChange?.(weekNum === currentWeekOfYear ? null : weekNum);
                }
              }} disabled={activeWeekIdx === weeks.length - 1} className="px-3 py-2">
                <ChevronRight size={18} />
              </Button>
            </div>

            {!isHistoryMode && onSkipWeek && !sameTemplateAllWeeks && (
              <div className="relative">
                <button
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border-2 transition-all",
                    skippedWeeks.includes(displayWeekNum)
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                      : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300"
                  )}
                  onClick={(e) => { e.stopPropagation(); setShowSkipDropdown(v => !v); }}
                >
                  <SkipForward size={12} />
                  {skippedWeeks.includes(displayWeekNum) ? 'Saltada' : 'Saltar'}
                </button>
                {showSkipDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSkipDropdown(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50">
                      <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2 min-w-[10rem] space-y-1">
                        <button
                          onClick={() => { onSkipWeek(displayWeekNum, 'skip_only'); setShowSkipDropdown(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        >
                          Saltar el día
                          <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Queda marcado, sin más cambios</span>
                        </button>
                        <button
                          onClick={() => { onSkipWeek(displayWeekNum, 'shift'); setShowSkipDropdown(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        >
                          Saltar la semana
                          <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Todo se desplaza una semana</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!currentWeek || !currentDay ? (
            <motion.div key="empty-plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 text-center text-slate-500 dark:text-slate-400">
              {weeks.length === 0 ? 'No hay semanas en esta rutina.' : 'Cargando...'}
            </motion.div>
          ) : viewMode === 'daily' ? (
            <motion.div
              key={`daily-${activeWeekIdx}-${activeDayIdx}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            >
              <div 
                className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide -mx-3 sm:mx-0 px-3 sm:px-0"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                style={{ touchAction: 'pan-x' }}
              >
                {currentWeek.days.map((day, idx) => {
                  const isActive = activeDayIdx === idx;
                  const dayTypeDot = {
                    workout: "bg-indigo-500",
                    deload: "bg-amber-500",
                    rest: "bg-slate-400"
                  };
                  
                  return (
                  <button
                    ref={(el) => { dayButtonRefs.current[idx] = el; }}
                    key={day.id}
                    onClick={() => setActiveDayIdx(idx)}
                    className={cn(
                        "px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap min-w-[78px] sm:min-w-0 border flex items-center justify-center gap-2 flex-shrink-0",
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50"
                          : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", isActive ? "bg-white" : dayTypeDot[day.type])} />
                      <span className="sm:hidden">{day.name.slice(0, 3)}</span>
                      <span className="hidden sm:inline">{day.name}</span>
                  </button>
                  );
                })}
              </div>

              <Card padding="md" rounded="xl" className="shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 sm:rounded-2xl sm:p-8">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">{currentDay.name}</h3>
                    <div className={cn("w-full sm:w-auto sm:min-w-[200px] relative", isHistoryMode && "opacity-75 pointer-events-none")}>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 block">
                        Tipo de día
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => !isHistoryMode && setShowDayTypeDropdown(!showDayTypeDropdown)}
                          className={cn(
                            "w-full rounded-xl border-2 bg-white px-4 py-3 pr-10 text-xs font-black uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all flex items-center justify-between",
                            currentDay.type === 'workout' ? "border-indigo-500 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 focus:ring-indigo-500" :
                            currentDay.type === 'deload' ? "border-amber-500 dark:border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 focus:ring-amber-500" :
                            "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 focus:ring-slate-500"
                          )}
                        >
                          <span>
                            {currentDay.type === 'workout' ? 'Entrenamiento' :
                             currentDay.type === 'deload' ? 'Descarga' : 'Descanso'}
                          </span>
                          <ChevronDown className={cn("w-4 h-4 transition-transform", showDayTypeDropdown && "rotate-180")} />
                        </button>
                        
                        {showDayTypeDropdown && (
                          <>
                            <div 
                              className="fixed inset-0 z-40" 
                              onClick={() => setShowDayTypeDropdown(false)}
                            />
                            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                              {(['workout', 'rest', 'deload'] as DayType[]).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => {
                                    onUpdateDayType(currentWeek.id, currentDay.id, type);
                                    setShowDayTypeDropdown(false);
                                  }}
                                  className={cn(
                                    "w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
                                    currentDay.type === type
                                      ? type === 'workout' ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-l-4 border-indigo-500" :
                                        type === 'deload' ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-l-4 border-amber-500" :
                                        "bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-l-4 border-slate-400 dark:border-slate-500"
                                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-400"
                                  )}
                                >
                                  <span className={cn(
                                    "w-2 h-2 rounded-full",
                                    type === 'workout' ? "bg-indigo-500" :
                                    type === 'deload' ? "bg-amber-500" :
                                    "bg-slate-400"
                                  )} />
                                  {type === 'workout' ? 'Entrenamiento' :
                                   type === 'deload' ? 'Descarga' : 'Descanso'}
                                  {currentDay.type === type && (
                                    <CheckCircle2 className="w-4 h-4 ml-auto" />
                                  )}
                                </button>
                      ))}
                    </div>
                          </>
                        )}
                  </div>
                    </div>
                  </div>
                </div>

                {currentDay.type === 'workout' || currentDay.type === 'deload' ? (
                  <div className="space-y-3">
                    {/* Table Header - Solo desktop. % RM solo si alguno tiene TM vinculado */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-indigo-950/30 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
                      <div className="col-span-4">Ejercicio</div>
                      <div className="col-span-2 text-center">Series × Reps</div>
                      {currentDay.exercises.some(e => !!resolveEffectiveTM(e)) && <div className="col-span-2 text-center">% RM</div>}
                      <div className={cn("text-center", currentDay.exercises.some(e => !!resolveEffectiveTM(e)) ? "col-span-3" : "col-span-5")}>Peso / Reps / Tiempo</div>
                      <div className="col-span-1 text-center">Acción</div>
                    </div>

                    {/* Ejercicios */}
                    <div className="space-y-3">
                      {currentDay.exercises.map((ex) => {
                        const logId = routineLogKeyFromIds(currentWeek, currentDay, ex);
                        const log = getLogEntryForExercise(logs, currentWeek, currentDay, ex);
                        const effectiveTM = resolveEffectiveTM(ex);
                        const k = fieldKey(currentWeek, currentDay, ex);
                        const setsShown = setsInputDraft[k] !== undefined ? setsInputDraft[k] : String(Math.max(1, ex.sets || 1));
                        const repsShown = repsInputDraft[k] !== undefined ? repsInputDraft[k] : String(ex.reps ?? '');

                        const getPctForSet = (idx: number) => ex.pctPerSet?.[idx] ?? ex.pct ?? 75;
                        const getTargetForSet = (idx: number) => {
                          if (!effectiveTM) {
                            if (ex.mode === 'weight') return ex.weight || 0;
                            return parseInt(String(ex.reps), 10) || 0;
                          }
                          const raw = effectiveTM.value * (getPctForSet(idx) / 100);
                          if (ex.mode === 'weight') return roundTo25(raw);
                          return Math.max(1, Math.round(raw));
                        };
                        const targetWeight = getTargetForSet(0);
                        const updatePctForSet = (setIdx: number, newPct: number) => {
                          const n = Math.max(ex.sets || 1, 1);
                          const base = ex.pct ?? 75;
                          const arr = (ex.pctPerSet ?? Array(n).fill(base)).slice(0, n);
                          while (arr.length < n) arr.push(base);
                          arr[setIdx] = newPct;
                          onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { pctPerSet: arr, pct: arr[0] });
                        };
                        const updateTargetFromAbsolute = (setIdx: number, newVal: number) => {
                          if (!effectiveTM) return;
                          const newPct = Math.round((newVal / effectiveTM.value) * 100);
                          updatePctForSet(setIdx, newPct);
                        };

                          return (
                            <Card
                              key={ex.id}
                              padding="md"
                              rounded="xl"
                              className="group border-2 border-slate-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all cursor-pointer hover:shadow-lg bg-white dark:bg-slate-800/50 md:bg-transparent md:border-0 md:hover:bg-slate-50 dark:md:hover:bg-slate-800/30 md:p-0 md:shadow-none md:hover:shadow-none"
                              onClick={() => setLoggingExercise({ weekId: currentWeek.id, dayId: currentDay.id, exercise: ex })}
                            >
                              {/* Mobile Card Layout */}
                              <div className="md:hidden space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight mb-1">
                                      {ex.name}
                                    </h4>
                                    {effectiveTM && (
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider inline-block bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                                        {effectiveTM.isInternal ? 'TM interno' : effectiveTM.name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {!isHistoryMode && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveExercise(currentWeek.id, currentDay.id, ex.id);
                                      }}
                                      className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all flex-shrink-0"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Series × Reps - solo esto en la tarjeta; %/kg se edita dentro del modal */}
                                <div onClick={(e) => e.stopPropagation()}>
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block text-center">Series × Reps</label>
                                  <div className="flex items-center justify-center bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3.5 shadow-sm dark:shadow-md dark:shadow-slate-900/50 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:shadow-md transition-all">
                                    <input 
                                      type="text"
                                      inputMode="numeric"
                                      autoComplete="off"
                                      pattern="[0-9]*"
                                      value={setsShown}
                                      disabled={isHistoryMode}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        setSetsInputDraft(prev => ({ ...prev, [k]: raw }));
                                      }}
                                      onBlur={() => {
                                        if (isHistoryMode) return;
                                        const rawSets =
                                          setsInputDraft[k] !== undefined
                                            ? setsInputDraft[k]
                                            : String(Math.max(1, ex.sets || 1));
                                        const n = parseSetsCommit(rawSets);
                                        setSetsInputDraft(prev => {
                                          const next = { ...prev };
                                          delete next[k];
                                          return next;
                                        });
                                        onUpdateExercise(
                                          currentWeek.id,
                                          currentDay.id,
                                          ex.id,
                                          applySetsWithPct(ex, n, effectiveTM)
                                        );
                                      }}
                                      className="w-16 text-center font-black text-xl bg-transparent focus:outline-none text-slate-900 dark:text-slate-100 disabled:opacity-50"
                                      placeholder="3"
                                    />
                                    <span className="text-xl font-black text-slate-400 mx-3">×</span>
                                    <input 
                                      type="text"
                                      inputMode="numeric"
                                      autoComplete="off"
                                      value={repsShown}
                                      disabled={isHistoryMode}
                                      onChange={(e) => {
                                        setRepsInputDraft(prev => ({ ...prev, [k]: e.target.value }));
                                      }}
                                      onBlur={() => {
                                        if (isHistoryMode) return;
                                        const rawReps =
                                          repsInputDraft[k] !== undefined ? repsInputDraft[k] : String(ex.reps ?? '');
                                        setRepsInputDraft(prev => {
                                          const next = { ...prev };
                                          delete next[k];
                                          return next;
                                        });
                                        onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { reps: parseRepsCommit(rawReps) });
                                      }}
                                      className="w-24 text-center font-black text-xl bg-transparent focus:outline-none text-slate-900 dark:text-slate-100 disabled:opacity-50"
                                      placeholder="10"
                                    />
                                  </div>
                                </div>

                                {/* TM de rutina o TM interno inferido */}
                                {effectiveTM && (
                                  <div className="text-center pt-1">
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-full inline-block">
                                      {effectiveTM.isInternal ? '📊 ' : '🔗 '}
                                      {effectiveTM.isInternal ? 'TM interno' : effectiveTM.name} ({effectiveTM.value}{effectiveTM.mode === 'weight' ? 'kg' : effectiveTM.mode === 'reps' ? 'reps' : 's'})
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Desktop Table Layout */}
                              <div className="hidden md:grid md:grid-cols-12 gap-4 items-center py-4 px-4 border-b border-slate-100 last:border-0">
                              {/* Exercise Info */}
                                <div className="col-span-4 flex items-center gap-3">
                                <div className="flex flex-col">
                                  <span className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                                    {ex.name}
                                  </span>
                                  {effectiveTM && (
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-0.5">{effectiveTM.isInternal ? 'TM interno' : effectiveTM.name}</span>
                                  )}
                                </div>
                              </div>

                              {/* Sets x Reps */}
                                <div className="col-span-2 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 shadow-sm dark:shadow-md dark:shadow-slate-900/50 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-all">
                                  <input 
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    pattern="[0-9]*"
                                    value={setsShown}
                                    disabled={isHistoryMode}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/\D/g, '');
                                      setSetsInputDraft(prev => ({ ...prev, [k]: raw }));
                                    }}
                                    onBlur={() => {
                                      if (isHistoryMode) return;
                                      const rawSets =
                                        setsInputDraft[k] !== undefined
                                          ? setsInputDraft[k]
                                          : String(Math.max(1, ex.sets || 1));
                                      const n = parseSetsCommit(rawSets);
                                      setSetsInputDraft(prev => {
                                        const next = { ...prev };
                                        delete next[k];
                                        return next;
                                      });
                                      onUpdateExercise(
                                        currentWeek.id,
                                        currentDay.id,
                                        ex.id,
                                        applySetsWithPct(ex, n, effectiveTM)
                                      );
                                    }}
                                    className="w-10 text-center font-black text-sm bg-transparent focus:outline-none text-slate-900 dark:text-slate-100 disabled:opacity-50"
                                  />
                                    <span className="text-sm font-black text-slate-400 mx-2">×</span>
                                  <input 
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={repsShown}
                                    disabled={isHistoryMode}
                                    onChange={(e) => {
                                      setRepsInputDraft(prev => ({ ...prev, [k]: e.target.value }));
                                    }}
                                    onBlur={() => {
                                      if (isHistoryMode) return;
                                      const rawReps =
                                        repsInputDraft[k] !== undefined ? repsInputDraft[k] : String(ex.reps ?? '');
                                      setRepsInputDraft(prev => {
                                        const next = { ...prev };
                                        delete next[k];
                                        return next;
                                      });
                                      onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { reps: parseRepsCommit(rawReps) });
                                    }}
                                    className="w-12 text-center font-black text-sm bg-transparent focus:outline-none text-slate-900 dark:text-slate-100 disabled:opacity-50"
                                  />
                                </div>
                              </div>

                              {/* % RM + objetivo por serie (TM rutina o interno: peso / reps / seg) */}
                                {effectiveTM && effectiveTM.mode === ex.mode ? (
                                <div className="col-span-5 flex flex-wrap justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  {Array.from({ length: Math.max(ex.sets || 1, 1) }).map((_, idx) => {
                                    const pctDraftKey = `${k}-pct-${idx}`;
                                    const targetDraftKey = `${k}-target-${idx}`;
                                    const pctShown = pctInputDraft[pctDraftKey] !== undefined ? pctInputDraft[pctDraftKey] : String(getPctForSet(idx));
                                    const targetShown = targetInputDraft[targetDraftKey] !== undefined ? targetInputDraft[targetDraftKey] : String(getTargetForSet(idx));
                                    return (
                                    <div key={idx} className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg px-2 py-1.5 border border-indigo-200 dark:border-indigo-800">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={pctShown}
                                        onChange={(e) => {
                                          const raw = e.target.value.replace(/[^\d.]/g, '');
                                          setPctInputDraft(prev => ({ ...prev, [pctDraftKey]: raw }));
                                        }}
                                        onBlur={() => {
                                          const raw = pctInputDraft[pctDraftKey];
                                          setPctInputDraft(prev => { const n = { ...prev }; delete n[pctDraftKey]; return n; });
                                          if (raw !== undefined) {
                                            const v = parseFloat(raw);
                                            updatePctForSet(idx, Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : getPctForSet(idx));
                                          }
                                        }}
                                        className="w-9 bg-transparent text-center font-black text-indigo-700 dark:text-indigo-300 text-xs focus:outline-none"
                                      />
                                      <span className="text-[10px] opacity-80">%</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={targetShown}
                                        onChange={(e) => {
                                          const raw = e.target.value.replace(/[^\d.]/g, '');
                                          setTargetInputDraft(prev => ({ ...prev, [targetDraftKey]: raw }));
                                        }}
                                        onBlur={() => {
                                          const raw = targetInputDraft[targetDraftKey];
                                          setTargetInputDraft(prev => { const n = { ...prev }; delete n[targetDraftKey]; return n; });
                                          if (raw !== undefined) {
                                            const v = parseFloat(raw);
                                            if (Number.isFinite(v)) updateTargetFromAbsolute(idx, v);
                                          }
                                        }}
                                        className="w-12 bg-indigo-600 dark:bg-indigo-700 text-white text-center font-black text-xs rounded focus:outline-none"
                                      />
                                      <span className="text-[10px] opacity-80">{ex.mode === 'weight' ? 'kg' : ex.mode === 'reps' ? 'rep' : 's'}</span>
                                    </div>
                                    );
                                  })}
                                </div>
                                ) : !effectiveTM && (ex.mode === 'weight' || ex.mode === 'reps' || ex.mode === 'seconds') ? (
                                currentDay.exercises.some((e) => !!resolveEffectiveTM(e)) ? (
                                  <>
                                    <div className="col-span-2 min-h-[2.5rem]" aria-hidden />
                                    <div className="col-span-3 min-h-[2.5rem]" aria-hidden />
                                  </>
                                ) : (
                                  <div className="col-span-5 min-h-[2.5rem]" aria-hidden />
                                )
                                ) : null}

                                {/* Actions */}
                                <div className="col-span-1 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {!isHistoryMode && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveExercise(currentWeek.id, currentDay.id, ex.id);
                                  }}
                                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all"
                                >
                                  <Trash2 size={18} />
                                </button>
                                )}
                              </div>
                            </div>
                            </Card>
                          );
                      })}
                    </div>

                    {currentDay.exercises.length === 0 ? (
                      <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30">
                        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-950/50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Plus className="text-indigo-600 dark:text-indigo-400" size={24} />
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium mb-4">No hay ejercicios para este día</p>
                      {!isHistoryMode && (
                      <button 
                        onClick={() => {
                          setNewExForm({ ...newExForm, name: '', linkedTo: '', pct: 75 });
                          setNewExModalError('');
                          setShowAddModal(true);
                        }}
                          className="inline-flex items-center gap-2 text-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-all py-3 px-6 rounded-xl border-2 border-indigo-600 group active:scale-95 shadow-lg shadow-indigo-200"
                      >
                          <Plus size={18} />
                          <span className="font-black uppercase text-sm tracking-wider">Añadir primer ejercicio</span>
                        </button>
                      )}
                        </div>
                    ) : (
                      !isHistoryMode && (
                      <div className="mt-6 flex justify-center">
                        <button 
                          onClick={() => {
                            setNewExForm({ ...newExForm, name: '', linkedTo: '', pct: 75 });
                            setNewExModalError('');
                            setShowAddModal(true);
                          }}
                          className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all py-4 px-8 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 group active:scale-95 shadow-sm hover:shadow-md"
                        >
                          <div className="bg-indigo-600 text-white p-2 rounded-lg group-hover:scale-110 transition-transform">
                            <Plus size={18} />
                          </div>
                          <span className="font-black uppercase text-sm tracking-wider">Añadir ejercicio</span>
                      </button>
                    </div>
                    )
                    )}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Activity className="text-slate-300 dark:text-slate-500" size={40} />
                    </div>
                    <h4 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-2 uppercase tracking-tight">Día de Descanso</h4>
                    <p className="text-slate-400 dark:text-slate-500 font-medium">Recupera fuerzas para tu próxima sesión</p>
                  </div>
                )}
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key={`weekly-${activeWeekIdx}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {currentWeek.days.map((day, dayIdx) => (
                <Card 
                  key={day.id} 
                  padding="md" 
                  rounded="2xl" 
                  onClick={() => {
                    setActiveDayIdx(dayIdx);
                    setViewMode('daily');
                  }}
                  className={cn(
                    "border-2 transition-all cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-600",
                    day.type === 'rest' ? "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700" : "bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-700"
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-slate-900 dark:text-slate-100 uppercase text-xs tracking-widest">{day.name}</h3>
                    <DayTypeBadge type={day.type} />
                  </div>

                  {day.type === 'workout' || day.type === 'deload' ? (
                    <div className="space-y-2">
                      {day.exercises.length === 0 ? (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Sin ejercicios</p>
                      ) : (
                        day.exercises.map(ex => (
                          <div key={ex.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[100px]">{ex.name}</span>
                            <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">{ex.sets}×{ex.reps}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="py-4 flex flex-col items-center justify-center text-slate-300 dark:text-slate-500">
                      <Activity size={20} className="mb-1" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Descanso</span>
                    </div>
                  )}
                </Card>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="mt-8 sm:mt-12">
        <Button variant="outline" className="w-full sm:w-auto" onClick={onExport}>
          <Download size={18} />
          <span className="text-sm sm:text-base">Exportar</span>
        </Button>
      </div>

      {loggingExercise && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div 
            className="fixed inset-0 z-[100000] overflow-y-auto overflow-x-hidden overscroll-y-contain overscroll-x-none [touch-action:pan-y]"
            style={{ WebkitOverflowScrolling: 'touch' as const }}
          >
            <div className="flex min-h-[100dvh] w-full max-w-[100vw] min-w-0 flex-col items-stretch justify-start px-1.5 pt-10 pb-6 sm:items-center sm:justify-center sm:px-4 sm:py-5 box-border">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setLoggingExercise(null); setLogInputDraft({}); }}
              className="fixed inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 mx-auto flex min-h-0 w-full min-w-0 max-w-[min(calc(100vw-0.75rem),42rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 max-h-[min(92dvh,calc(100dvh-2.75rem))] sm:max-h-[min(90vh,calc(100dvh-2.5rem))]"
            >
              <div
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain overscroll-x-none p-4 sm:p-5 [touch-action:pan-y]"
                style={{ WebkitOverflowScrolling: 'touch' as const }}
              >
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <div className="flex-1 mr-3 min-w-0">
                    <input 
                      value={loggingExercise.exercise.name}
                      onChange={(e) => onUpdateExercise(loggingExercise.weekId, loggingExercise.dayId, loggingExercise.exercise.id, { name: e.target.value })}
                      className="text-lg sm:text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight bg-transparent focus:outline-none w-full border-b-2 border-transparent focus:border-indigo-200 dark:focus:border-indigo-500"
                    />
                    <p className="text-indigo-600 dark:text-indigo-400 font-black text-[10px] sm:text-xs uppercase tracking-widest mt-1">
                      {loggingExercise.exercise.sets} × {loggingExercise.exercise.reps} •{' '}
                      {(() => {
                        const ex = loggingExercise.exercise;
                        const eff = resolveEffectiveTM(ex);
                        if (!eff) return 'Libre';
                        return eff.isInternal ? 'TM interno · referencia' : 'Objetivo vinculado';
                      })()}
                    </p>
                  </div>
                  <button 
                    onClick={() => { setLoggingExercise(null); setLogInputDraft({}); }} 
                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  {/* Quick Notes */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-1.5 block tracking-[0.15em]">Nota rápida</label>
                    <textarea 
                      placeholder="¿Cómo te has sentido hoy?"
                      value={logs[modalLogKey]?.notes || ''}
                      onChange={(e) => onLogChange(modalLogKey, 'notes', e.target.value)}
                      className="w-full h-16 sm:h-20 px-3 py-2.5 text-sm font-bold rounded-xl border-2 border-slate-100 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 transition-all resize-none outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>

                  {/* RPE */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-1.5 block tracking-[0.15em]">RPE</label>
                    <div className={cn(
                      "flex items-center border-2 rounded-xl px-2.5 py-1.5 shadow-sm transition-all",
                      getRPEColor(logs[modalLogKey]?.rpe || '')
                    )}>
                      <Gauge size={14} className="mr-2 opacity-80 shrink-0" />
                      <input 
                        placeholder="8, 8.5, 9…" 
                        value={logs[modalLogKey]?.rpe || ''}
                        onChange={(e) => onLogChange(modalLogKey, 'rpe', e.target.value)}
                        className="flex-1 text-center font-bold text-sm bg-transparent focus:outline-none min-w-0"
                      />
                    </div>
                  </div>

                  {/* Sets Logging - Minimalist Design */}
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="min-w-0 space-y-2 overflow-x-hidden overscroll-x-none">
                      {Array.from({ length: loggingExercise.exercise.sets }).map((_, idx) => {
                        const logId = modalLogKey;
                        const setLog = logs[logId]?.sets?.[idx] || { id: `${idx}`, weight: null, reps: null, completed: false };
                        const effectiveMode = (setLog.inputMode ?? 'kg') as 'kg' | 'pct';
                        const effectiveTM = resolveEffectiveTM(loggingExercise.exercise);
                        const pctForSet = loggingExercise.exercise.pctPerSet?.[idx] ?? loggingExercise.exercise.pct ?? 75;
                        const exerciseMode = loggingExercise.exercise.mode;
                        const targetWeight = effectiveTM
                          ? (exerciseMode === 'weight'
                              ? roundTo25(effectiveTM.value * (pctForSet / 100))
                              : Math.max(1, Math.round(effectiveTM.value * (pctForSet / 100))))
                          : (exerciseMode === 'weight' ? (loggingExercise.exercise.weight || 0) : 0);
                        const targetReps = parseInt(loggingExercise.exercise.reps.toString()) || 0;
                        const unitLabel = exerciseMode === 'seconds' ? 'SEG' : 'REPS';
                        
                        const isCompleted = setLog.completed || (exerciseMode === 'weight' ? (setLog.weight !== null && setLog.reps !== null && setLog.reps >= targetReps) : (setLog.reps !== null && setLog.reps >= targetReps));
                        const hasData = setLog.weight !== null || setLog.reps !== null;
                        const verdict = getSetPerformanceVerdict(loggingExercise.exercise, setLog, targetWeight, targetReps);

                        const rowColors = verdict === 'stronger'
                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                          : verdict === 'weaker'
                            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                            : verdict === 'similar'
                              ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800"
                              : isCompleted
                                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                                : hasData
                                  ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600";

                        const inputClass =
                          'h-11 w-full min-h-[44px] rounded-lg border-2 border-slate-200 bg-white px-2 text-center text-sm font-black text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900/40';

                        const setActionButtons = (
                          <div className="absolute right-2 top-2 z-10 flex gap-0.5" role="group" aria-label="Acciones de la serie">
                            <button
                              type="button"
                              onClick={() => {
                                setLogInputDraft(prev => {
                                  const n = { ...prev };
                                  delete n[`w-${logId}-${idx}`];
                                  delete n[`r-${logId}-${idx}`];
                                  return n;
                                });
                                onSetLogChange(logId, idx, {
                                  weight: null,
                                  reps: null,
                                  completed: false,
                                  inputMode: 'kg',
                                });
                              }}
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors',
                                hasData
                                  ? 'text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/40'
                                  : 'cursor-default text-slate-300 dark:text-slate-600'
                              )}
                              title="Borrar datos de la serie"
                              aria-label="Borrar serie"
                              disabled={!hasData}
                            >
                              <Trash2 size={17} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onSetLogChange(logId, idx, { completed: !setLog.completed })}
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 transition-all',
                                setLog.completed
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-emerald-600'
                              )}
                              aria-label={setLog.completed ? 'Marcar incompleto' : 'Marcar hecho'}
                            >
                              <CheckCircle2 size={17} className={setLog.completed ? 'fill-current' : ''} />
                            </button>
                          </div>
                        );

                        return (
                          <div
                            key={idx}
                            className={cn(
                              'relative min-w-0 max-w-full rounded-xl border p-3 pb-2.5 transition-all',
                              rowColors
                            )}
                          >
                            {setActionButtons}
                            {exerciseMode === 'weight' ? (
                              <>
                                {effectiveTM ? (
                                  <>
                                    <div className="mb-2 flex min-w-0 items-center gap-2 pr-[4.5rem]">
                                      <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 sm:text-xs">
                                        Serie {idx + 1}
                                      </span>
                                      <div className="flex min-w-0 flex-1 justify-center">
                                        <div
                                          className="inline-flex h-8 w-[7.25rem] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-[3px] shadow-inner dark:border-slate-600 dark:bg-slate-800"
                                          role="group"
                                          aria-label="Unidad de peso (kg o %)"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => onSetLogChange(logId, idx, { inputMode: 'kg' })}
                                            className={cn(
                                              'flex h-7 flex-1 items-center justify-center rounded-md px-1.5 text-[10px] font-black uppercase tracking-wide transition-colors active:scale-[0.98]',
                                              effectiveMode === 'kg'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-slate-600 dark:text-slate-400'
                                            )}
                                          >
                                            kg
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onSetLogChange(logId, idx, { inputMode: 'pct' })}
                                            className={cn(
                                              'flex h-7 flex-1 items-center justify-center rounded-md px-1.5 text-[10px] font-black uppercase tracking-wide transition-colors active:scale-[0.98]',
                                              effectiveMode === 'pct'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-slate-600 dark:text-slate-400'
                                            )}
                                          >
                                            %
                                          </button>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:gap-3">
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                          {effectiveMode === 'pct' ? '% RM' : 'Peso (kg)'}
                                        </span>
                                        {effectiveMode === 'pct' ? (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder={pctForSet.toString()}
                                            value={
                                              pctInputDraft[`log-${logId}-${idx}`] !== undefined
                                                ? pctInputDraft[`log-${logId}-${idx}`]
                                                : setLog.weight !== null
                                                  ? Math.round((setLog.weight / effectiveTM.value) * 100).toString()
                                                  : ''
                                            }
                                            onChange={(e) => {
                                              const raw = e.target.value.replace(/[^\d.]/g, '');
                                              setPctInputDraft(prev => ({ ...prev, [`log-${logId}-${idx}`]: raw }));
                                            }}
                                            onBlur={() => {
                                              const draftKey = `log-${logId}-${idx}`;
                                              const raw = pctInputDraft[draftKey];
                                              setPctInputDraft(prev => { const n = { ...prev }; delete n[draftKey]; return n; });
                                              if (raw !== undefined) {
                                                if (raw === '') onSetLogChange(logId, idx, { weight: null });
                                                else {
                                                  const pct = parseFloat(raw);
                                                  if (!Number.isNaN(pct))
                                                    onSetLogChange(logId, idx, {
                                                      weight: roundTo25(effectiveTM.value * (pct / 100)),
                                                    });
                                                }
                                              }
                                            }}
                                            className={inputClass}
                                          />
                                        ) : (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder={targetWeight.toString()}
                                            value={logInputDraft[`w-${logId}-${idx}`] ?? (setLog.weight ?? '')}
                                            onChange={(e) => {
                                              const raw = e.target.value.replace(/[^\d.,]/g, '');
                                              setLogInputDraft(prev => ({ ...prev, [`w-${logId}-${idx}`]: raw }));
                                            }}
                                            onBlur={() => {
                                              const raw = logInputDraft[`w-${logId}-${idx}`];
                                              setLogInputDraft(prev => { const n = { ...prev }; delete n[`w-${logId}-${idx}`]; return n; });
                                              if (raw !== undefined) {
                                                const v = parseFloat(raw.replace(',', '.'));
                                                onSetLogChange(logId, idx, { weight: raw === '' ? null : Number.isFinite(v) ? v : null });
                                              }
                                            }}
                                            className={inputClass}
                                          />
                                        )}
                                      </div>
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                          Reps
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          placeholder={targetReps.toString()}
                                          value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                          }}
                                          onBlur={() => {
                                            const raw = logInputDraft[`r-${logId}-${idx}`];
                                            setLogInputDraft(prev => { const n = { ...prev }; delete n[`r-${logId}-${idx}`]; return n; });
                                            if (raw !== undefined) {
                                              const v = parseInt(raw, 10);
                                              onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                            }
                                          }}
                                          className={inputClass}
                                        />
                                      </div>
                                    </div>
                                    <p className="mt-2 text-center text-xs font-bold leading-tight text-indigo-600 dark:text-indigo-400">
                                      {effectiveMode === 'pct'
                                        ? `= ${setLog.weight !== null ? roundTo25(setLog.weight) : '—'} kg`
                                        : effectiveTM.isInternal && exerciseMode === 'weight'
                                          ? setLog.weight != null && effectiveTM.value > 0
                                            ? `${Math.round((setLog.weight / effectiveTM.value) * 100)}% de tu máx. (${roundTo25(effectiveTM.value)} kg)`
                                            : '—'
                                          : setLog.weight != null && setLog.reps != null && setLog.reps > 0
                                            ? `${roundTo25(setLog.weight)} kg × ${setLog.reps} reps`
                                            : setLog.weight !== null && effectiveTM
                                              ? `${Math.round((setLog.weight / effectiveTM.value) * 100)}% RM`
                                              : '—'}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <div className="pr-[4.5rem] mb-2">
                                      <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                                        Serie {idx + 1}
                                      </span>
                                    </div>
                                    <div className="grid w-full grid-cols-2 gap-2 sm:gap-3">
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                          Peso (kg)
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder={(loggingExercise.exercise.weight || 0).toString()}
                                          value={logInputDraft[`w-${logId}-${idx}`] ?? (setLog.weight ?? '')}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(/[^\d.,]/g, '');
                                            setLogInputDraft(prev => ({ ...prev, [`w-${logId}-${idx}`]: raw }));
                                          }}
                                          onBlur={() => {
                                            const raw = logInputDraft[`w-${logId}-${idx}`];
                                            setLogInputDraft(prev => { const n = { ...prev }; delete n[`w-${logId}-${idx}`]; return n; });
                                            if (raw !== undefined) {
                                              const v = parseFloat(raw.replace(',', '.'));
                                              onSetLogChange(logId, idx, { weight: raw === '' ? null : Number.isFinite(v) ? v : null });
                                            }
                                          }}
                                          className={inputClass}
                                        />
                                      </div>
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                          Reps
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          placeholder={targetReps.toString()}
                                          value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                          }}
                                          onBlur={() => {
                                            const raw = logInputDraft[`r-${logId}-${idx}`];
                                            setLogInputDraft(prev => { const n = { ...prev }; delete n[`r-${logId}-${idx}`]; return n; });
                                            if (raw !== undefined) {
                                              const v = parseInt(raw, 10);
                                              onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                            }
                                          }}
                                          className={inputClass}
                                        />
                                      </div>
                                    </div>
                                    <p className="mt-2 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                      {setLog.weight != null && setLog.reps != null && setLog.reps > 0
                                        ? `${roundTo25(setLog.weight)} kg × ${setLog.reps} reps`
                                        : '—'}
                                    </p>
                                  </>
                                )}
                              </>
                            ) : effectiveTM ? (
                              <>
                                <div className="mb-2 flex min-w-0 items-center gap-2 pr-[4.5rem]">
                                  <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 sm:text-xs">
                                    Serie {idx + 1}
                                  </span>
                                  <div className="flex min-w-0 flex-1 justify-center">
                                    <div
                                      className="inline-flex h-8 w-[7.25rem] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-[3px] shadow-inner dark:border-slate-600 dark:bg-slate-800"
                                      role="group"
                                      aria-label="Unidad (reps, segundos o %)"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => onSetLogChange(logId, idx, { inputMode: 'kg' })}
                                        className={cn(
                                          'flex h-7 flex-1 items-center justify-center rounded-md px-1 text-[10px] font-black uppercase tracking-wide transition-colors active:scale-[0.98]',
                                          effectiveMode === 'kg'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-600 dark:text-slate-400'
                                        )}
                                      >
                                        {exerciseMode === 'reps' ? 'reps' : 's'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onSetLogChange(logId, idx, { inputMode: 'pct' })}
                                        className={cn(
                                          'flex h-7 flex-1 items-center justify-center rounded-md px-1 text-[10px] font-black uppercase tracking-wide transition-colors active:scale-[0.98]',
                                          effectiveMode === 'pct'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-600 dark:text-slate-400'
                                        )}
                                      >
                                        %
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex w-full min-w-0 flex-col gap-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {effectiveMode === 'pct'
                                      ? '% sobre referencia'
                                      : exerciseMode === 'reps'
                                        ? 'Reps'
                                        : 'Segundos'}
                                  </span>
                                  {effectiveMode === 'pct' ? (
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder={pctForSet.toString()}
                                      value={
                                        pctInputDraft[`logrep-${logId}-${idx}`] !== undefined
                                          ? pctInputDraft[`logrep-${logId}-${idx}`]
                                          : setLog.reps != null && effectiveTM.value > 0
                                            ? Math.round((setLog.reps / effectiveTM.value) * 100).toString()
                                            : ''
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(/[^\d.]/g, '');
                                        setPctInputDraft(prev => ({ ...prev, [`logrep-${logId}-${idx}`]: raw }));
                                      }}
                                      onBlur={() => {
                                        const draftKey = `logrep-${logId}-${idx}`;
                                        const raw = pctInputDraft[draftKey];
                                        setPctInputDraft(prev => { const n = { ...prev }; delete n[draftKey]; return n; });
                                        if (raw !== undefined) {
                                          if (raw === '') onSetLogChange(logId, idx, { reps: null });
                                          else {
                                            const pct = parseFloat(raw);
                                            if (!Number.isNaN(pct))
                                              onSetLogChange(logId, idx, {
                                                reps: Math.max(1, Math.round(effectiveTM.value * (pct / 100))),
                                              });
                                          }
                                        }
                                      }}
                                      className={inputClass}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      placeholder={targetReps.toString()}
                                      value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                      }}
                                      onBlur={() => {
                                        const raw = logInputDraft[`r-${logId}-${idx}`];
                                        setLogInputDraft(prev => { const n = { ...prev }; delete n[`r-${logId}-${idx}`]; return n; });
                                        if (raw !== undefined) {
                                          const v = parseInt(raw, 10);
                                          onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                        }
                                      }}
                                      className={inputClass}
                                    />
                                  )}
                                </div>
                                <p className="mt-2 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                  {effectiveMode === 'pct'
                                    ? `= ${setLog.reps != null ? setLog.reps : '—'} ${exerciseMode === 'reps' ? 'reps' : 's'}`
                                    : effectiveTM.value > 0 && setLog.reps != null
                                      ? `${Math.round((setLog.reps / effectiveTM.value) * 100)}% ref.`
                                      : '—'}
                                </p>
                              </>
                            ) : (
                              <>
                                <div className="pr-[4.5rem] mb-2">
                                  <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-200">
                                    Serie {idx + 1}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {exerciseMode === 'reps' ? 'Reps' : 'Segundos'}
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={targetReps.toString()}
                                    value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/\D/g, '');
                                      setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                    }}
                                    onBlur={() => {
                                      const raw = logInputDraft[`r-${logId}-${idx}`];
                                      setLogInputDraft(prev => { const n = { ...prev }; delete n[`r-${logId}-${idx}`]; return n; });
                                      if (raw !== undefined) {
                                        const v = parseInt(raw, 10);
                                        onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                      }
                                    }}
                                    className={inputClass}
                                  />
                                </div>
                                <p className="mt-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                  {unitLabel}
                                </p>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
                  {!isHistoryMode && (
                    <Button
                      variant="outline"
                      className="w-full h-11 sm:h-12 rounded-xl font-black uppercase tracking-wider text-xs sm:text-sm text-rose-600 border-2 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-950/30"
                      onClick={() => {
                        onRemoveExercise(loggingExercise.weekId, loggingExercise.dayId, loggingExercise.exercise.id);
                        setLoggingExercise(null); setLogInputDraft({});
                      }}
                    >
                      <Trash2 size={15} className="mr-1.5" />
                      Eliminar
                    </Button>
                  )}
                  <Button 
                    variant="primary" 
                    className="w-full h-11 sm:h-12 rounded-xl font-black uppercase tracking-wider text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                    onClick={async () => {
                      if (!isHistoryMode && loggingExercise) {
                        await onRoutinePlanFlush?.();
                      }
                      setLoggingExercise(null); setLogInputDraft({});
                    }}
                  >
                    Guardar sesión
                  </Button>
                </div>
              </div>
            </motion.div>
            </div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {/* Edit TM Modal - portaled to body so always centered and above dashboard */}
      {createPortal(
        <AnimatePresence>
          {editingTM && (
          <motion.div 
            key="edit-tm-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999999] flex items-center justify-center p-4 min-h-[100dvh]"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeTmModal}
              className="fixed inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-700"
            >
              <div className="p-6 sm:p-8 md:p-10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-100">
                      <Settings2 className="text-white" size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                        {editingTM.id === NEW_TM_DRAFT_ID ? 'Nuevo TM' : 'Editar TM'}
                      </h3>
                      <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                        {editingTM.id === NEW_TM_DRAFT_ID
                          ? 'Nombre y valor obligatorios · cierra sin guardar para cancelar'
                          : 'Ajusta tus marcas máximas'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={closeTmModal}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                  >
                    <X size={24} className="text-slate-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Nombre del Ejercicio</label>
                    <Input 
                      value={editingTM.name}
                      onChange={(e) => {
                        setTmModalError('');
                        setEditingTM({ ...editingTM, name: e.target.value });
                      }}
                      className="h-16 text-lg font-black uppercase tracking-widest rounded-3xl border-2 border-slate-100 dark:border-slate-600 focus:border-indigo-500 shadow-md shadow-slate-200/60 dark:shadow-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Valor Máximo</label>
                    <Input 
                      type="number"
                      min={1}
                      value={editingTM.value === 0 ? '' : editingTM.value}
                      placeholder="50"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setTmModalError('');
                        setEditingTM({ ...editingTM, value: Number.isNaN(v) || v < 1 ? 0 : v });
                      }}
                        className="h-16 text-2xl font-black text-center rounded-3xl border-2 border-slate-100 dark:border-slate-600 focus:border-indigo-500 shadow-md shadow-slate-200/60 dark:shadow-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Unidad</label>
                    <select 
                      value={editingTM.mode}
                      onChange={(e) => {
                        setTmModalError('');
                        setEditingTM({ ...editingTM, mode: e.target.value as ExerciseMode });
                      }}
                      className="w-full h-16 px-6 text-sm font-black uppercase tracking-widest rounded-3xl border-2 border-slate-100 dark:border-slate-600 focus:border-indigo-500 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none appearance-none cursor-pointer shadow-md shadow-slate-200/60 dark:shadow-none"
                    >
                      <option value="weight">Kilogramos (KG)</option>
                      <option value="reps">Repeticiones (REPS)</option>
                      <option value="seconds">Segundos (SEG)</option>
                    </select>
                  </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!editingTM.sharedToSocial}
                      onClick={() => setEditingTM({ ...editingTM, sharedToSocial: !editingTM.sharedToSocial })}
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center transition-all border-2",
                        editingTM.sharedToSocial
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-400"
                      )}
                    >
                      <CheckCircle2 size={24} className={editingTM.sharedToSocial ? "opacity-100" : "opacity-50"} />
                    </button>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">Compartir</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Visible en tu perfil para amigos</p>
                    </div>
                  </div>
                </div>

                {tmModalError ? (
                  <p className="mt-6 text-sm font-bold text-rose-600 dark:text-rose-400 text-center" role="alert">
                    {tmModalError}
                  </p>
                ) : null}

                <div className="flex flex-col gap-3 mt-10">
                  <Button 
                    variant="primary" 
                    className="w-full h-16 rounded-3xl font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
                    onClick={async () => {
                      if (editingTM.id === NEW_TM_DRAFT_ID) {
                        const name = editingTM.name.trim();
                        const v = editingTM.value;
                        if (!name) {
                          setTmModalError('Escribe un nombre para el TM.');
                          return;
                        }
                        if (!Number.isFinite(v) || v < 1) {
                          setTmModalError('Indica un valor numérico de al menos 1.');
                          return;
                        }
                        setTmModalError('');
                        await Promise.resolve(
                          onCreateTM({
                            name,
                            value: v,
                            mode: editingTM.mode,
                            sharedToSocial: editingTM.sharedToSocial,
                          })
                        );
                        closeTmModal();
                        return;
                      }
                      const valueToSave = editingTM.value === 0 ? 50 : editingTM.value;
                      onUpdateTM(editingTM.id, { 
                        name: editingTM.name, 
                        value: valueToSave, 
                        mode: editingTM.mode,
                        sharedToSocial: editingTM.sharedToSocial 
                      });
                      closeTmModal();
                    }}
                  >
                    {editingTM.id === NEW_TM_DRAFT_ID ? 'Crear TM' : 'Guardar cambios'}
                  </Button>
                  {editingTM.id !== NEW_TM_DRAFT_ID ? (
                    <Button 
                      variant="outline" 
                      className="w-full h-16 rounded-3xl font-black uppercase tracking-widest text-rose-500 border-2 border-rose-100 hover:bg-rose-50 hover:border-rose-200"
                      onClick={() => {
                        onRemoveTM(editingTM.id);
                        closeTmModal();
                      }}
                    >
                      <Trash2 size={18} className="mr-2" />
                      Eliminar TM
                    </Button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Add Exercise Modal - portaled y centrado como el de TM */}
      {createPortal(
        <AnimatePresence>
          {showAddModal && (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 min-h-[100dvh]">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setNewExModalError('');
                  setShowAddModal(false);
                }}
                className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-md max-h-[min(88dvh,90vh)] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700"
              >
              <div className="p-4 sm:p-6 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Añadir ejercicio</h3>
                  <button 
                    onClick={() => {
                      setNewExModalError('');
                      setShowAddModal(false);
                    }} 
                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 rounded-full transition-colors"
                  >
                    <X size={22} />
                  </button>
                </div>
                
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-[0.15em]">Nombre del ejercicio *</label>
                    <Input 
                      value={newExForm.name}
                      onChange={(e) => {
                        setNewExModalError('');
                        setNewExForm({ ...newExForm, name: e.target.value });
                      }}
                      placeholder="Ej: Press banca"
                      className="h-12 text-base font-black rounded-xl border-2 border-slate-100 focus:border-indigo-500 px-4 shadow-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">
                      Tipo de Objetivo {newExForm.linkedTo && <span className="text-indigo-500 normal-case">(Vinculado a TM)</span>}
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'weight', label: 'Peso', icon: Gauge },
                        { id: 'reps', label: 'Reps', icon: CheckCircle2 },
                        { id: 'seconds', label: 'Tiempo', icon: Clock }
                      ].map(m => (
                        <button
                          key={m.id}
                          disabled={!!newExForm.linkedTo}
                          onClick={() => setNewExForm({ ...newExForm, mode: m.id as ExerciseMode })}
                          className={cn(
                            "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                            newExForm.mode === m.id ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100",
                            newExForm.linkedTo && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <m.icon size={18} />
                          <span className="text-[10px] font-black uppercase tracking-widest">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Vincular a TM</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        className={cn(
                          "p-4 rounded-2xl text-center font-black text-xs uppercase tracking-widest transition-all border-2",
                          newExForm.linkedTo === '' ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/50" : "bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        )}
                        onClick={() => setNewExForm({ ...newExForm, linkedTo: '' })}
                      >
                        Libre
                      </button>
                      {effectiveTms.map(tm => (
                        <button
                          key={tm.id}
                          onClick={() => {
                            setNewExForm({ 
                              ...newExForm, 
                              linkedTo: tm.id,
                              name: tm.name,
                              mode: tm.mode
                            });
                          }}
                          className={cn(
                            "p-4 rounded-2xl text-center font-black text-xs uppercase tracking-widest transition-all border-2",
                            newExForm.linkedTo === tm.id ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-indigo-900/50" : "bg-slate-50 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                          )}
                        >
                          {tm.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-[0.15em]">Sets *</label>
                      <Input 
                        type="text"
                        inputMode="numeric"
                        value={newExForm.sets === 0 ? '' : newExForm.sets}
                        placeholder="3"
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setNewExForm({ ...newExForm, sets: raw === '' ? 0 : parseInt(raw, 10) });
                        }}
                        className="h-12 text-lg font-black text-center rounded-xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                      />
                    </div>
                    {newExForm.mode === 'seconds' ? (
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-[0.15em]">Segundos *</label>
                        <Input 
                          type="number"
                          value={newExForm.reps}
                          onChange={(e) => setNewExForm({ ...newExForm, reps: e.target.value })}
                          className="h-12 text-lg font-black text-center rounded-xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-[0.15em]">Reps *</label>
                        <Input 
                          value={newExForm.reps}
                          onChange={(e) => setNewExForm({ ...newExForm, reps: e.target.value })}
                          className="h-12 text-lg font-black text-center rounded-xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                        />
                      </div>
                    )}
                  </div>
                  {!newExForm.linkedTo && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug -mt-2">
                      Sin TM de rutina: al guardar tus series se crea un <span className="font-bold text-indigo-600 dark:text-indigo-400">TM interno</span> y podrás usar % en la siguiente sesión.
                    </p>
                  )}

                </div>

                <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2">
                  <Lightbulb size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs leading-snug">
                    <p className="font-bold text-amber-800 dark:text-amber-200">Torneos</p>
                    <p className="text-amber-700 dark:text-amber-300 mt-0.5">En <span className="font-black">Comunidad → Torneos</span> puedes competir con amigos en este ejercicio.</p>
                  </div>
                </div>
                {newExModalError ? (
                  <p className="mt-3 text-sm font-bold text-rose-600 dark:text-rose-400 text-center" role="alert">
                    {newExModalError}
                  </p>
                ) : null}

                <div className="flex gap-3 mt-6">
                  <Button 
                    variant="outline" 
                    className="flex-1 h-12 rounded-xl font-black uppercase tracking-wider text-xs text-slate-400 border-2 border-slate-100 hover:bg-slate-50"
                    onClick={() => {
                      setNewExModalError('');
                      setShowAddModal(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    variant="primary" 
                    className="flex-1 h-12 rounded-xl font-black uppercase tracking-wider text-xs bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                    onClick={() => {
                      const name = newExForm.name.trim();
                      if (!name) {
                        setNewExModalError('Escribe un nombre para el ejercicio.');
                        return;
                      }
                      const sets = newExForm.sets || 3;
                      const pct = newExForm.linkedTo ? (newExForm.pct || 75) : 75;
                      onAddExercise(currentWeek.id, currentDay.id, {
                        name,
                        linkedTo: newExForm.linkedTo || undefined,
                        pct,
                        pctPerSet: Array(sets).fill(pct),
                        sets,
                        reps: newExForm.reps,
                        mode: newExForm.mode
                      });
                      setNewExModalError('');
                      setShowAddModal(false);
                    }}
                  >
                    Añadir
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </motion.div>
  );
};
