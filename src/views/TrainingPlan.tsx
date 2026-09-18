import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { 
  CheckCircle2, 
  Download, 
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Link as LinkIcon,
  Target,
  Gauge,
  Clock,
  MessageSquare,
  X,
  SkipForward,
  Loader2,
  CornerLeftDown,
  FileUp,
  Video,
  Moon
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { LogEntry, TrainingMax, TrainingWeek, TrainingDay, PlannedExercise, ExerciseMode, DayType, SetLog, InternalExerciseMax, getInternalValueForMode, HistoryEntry } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { mediaUrl } from '@/src/lib/api';
import { EASE_OUT, PAGE_ENTER_ITEM, PAGE_ENTER_ROOT, SCREEN_TRANSITION, SLIME_SHEET_IN, SLIME_SHEET_OUT, SLIME_SHEET_SHOW, STICKY } from '@/src/lib/motionPresets';
import { usePageEnter } from '@/src/lib/usePageEnter';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { useIncrementSignal } from '@/src/lib/useIncrementSignal';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import { applyDaySkips, shiftsForCalendarWeek, type CalendarDayShift } from '@/src/lib/calendarDayShift';
import { firstWeekOfYearStartingInMonth } from '@/src/lib/mesocycleWeek';
import { guessLinkedTmId, normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import { getTMsForView } from '@/src/lib/historyTm';
import { dateISOFromYearWeekDay, weekOfYearFromDate } from '@/src/lib/calendarWeekDate';
import { getLogEntryForExercise, routineLogKeyFromExerciseId, routineLogKeyFromIds } from '@/src/lib/routineLogKey';
import { resolveTmForAutoBump } from '@/src/lib/trainingMaxResolve';
import { pctForSet as planPctForSet } from '@/src/lib/rpeIntensity';
import {
  blocksFromPlanned,
  compactSchemeLabel,
  exerciseRpeLabel,
  exerciseSchemeLabel,
  isMultiBlock,
  mergeAdjacentSameExercises,
  plannedRepsForSet,
  plannedRepsLabelForSet,
  plannedRpeForSet,
  plannedWeightForSet,
} from '@/src/lib/exerciseScheme';
import type { ImportCoachPlanResult, LastCoachImport } from '@/src/components/ImportCoachPlanModal';
import { useOnlineStatus } from '@/src/pwa/onlineStatus';

/** Los lectores de Word/Excel/PDF solo se descargan si el usuario abre el importador. */
const ImportCoachPlanModal = React.lazy(() =>
  import('@/src/components/ImportCoachPlanModal').then(m => ({ default: m.ImportCoachPlanModal }))
);

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

/** Un chip por bloque del plan: 1×2 @8.5, 3×4 @6.5… así no se junta todo en 1×2+3×4+… */
const PlanBlockChips = ({
  exercise,
  className,
}: {
  exercise: PlannedExercise;
  className?: string;
}) => {
  const blocks = blocksFromPlanned(exercise);
  if (blocks.length < 2) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {blocks.map((b, i) => (
        <span
          key={`${b.sets}-${b.reps}-${b.rpe ?? ''}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          {b.sets}×{b.reps}
          {b.weight && b.weight > 0 ? (
            <span className="font-semibold text-slate-500 dark:text-slate-400">{String(b.weight).replace('.', ',')}kg</span>
          ) : null}
          {b.rpe ? (
            <span className="font-black text-amber-600 dark:text-amber-400">@{b.rpe}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
};

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
        "px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
        config[type].color,
        onClick && "hover:scale-105 active:scale-95"
      )}
    >
      {config[type].label}
    </button>
  );
};

function ExerciseHoldRow({
  highlighted,
  canHold,
  canMoveUp,
  canMoveDown,
  onOpen,
  onLongPress,
  onDismiss,
  onMoveUp,
  onMoveDown,
  onDelete,
  children,
}: {
  highlighted: boolean;
  canHold: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onDismiss: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
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
    if (!canHold) return;
    held.current = false;
    hold.current = window.setTimeout(() => {
      held.current = true;
      setPressing(false);
      onLongPress();
    }, 380);
  };

  return (
    <motion.div
      layout="position"
      animate={{
        scaleX: pressing ? 1.055 : 1,
        scaleY: pressing ? 0.9 : 1,
        borderRadius: pressing || highlighted ? 22 : 16,
      }}
      transition={STICKY}
      className={cn(
        'origin-center',
        highlighted && 'relative z-10'
      )}
    >
      <Card
        padding="sm"
        rounded="xl"
        className={cn(
          'group cursor-pointer border-0 bg-white !p-3 shadow-sm dark:bg-slate-900 sm:!p-4 lg:border-0 lg:bg-transparent lg:!p-0 lg:shadow-none lg:hover:bg-slate-50/80 dark:lg:hover:bg-slate-800/25',
          canHold && 'select-none touch-manipulation',
          highlighted && 'shadow-[0_10px_28px_-12px_rgba(15,23,42,0.28)] lg:bg-white lg:shadow-[0_10px_28px_-12px_rgba(15,23,42,0.28)] dark:lg:bg-slate-900'
        )}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          if (highlighted) {
            onDismiss();
            return;
          }
          onOpen();
        }}
        onPointerDown={e => {
          if (!canHold) return;
          if ((e.target as HTMLElement).closest('input,textarea,button,a')) return;
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
          if (canHold) e.preventDefault();
        }}
      >
        {children}
        <AnimatePresence>
          {highlighted && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={STICKY}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap justify-end gap-2 pt-2.5 md:px-4 md:pb-2">
                <button
                  type="button"
                  disabled={!canMoveUp}
                  onClick={e => {
                    e.stopPropagation();
                    onMoveUp();
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-40 dark:bg-slate-700 dark:text-slate-100"
                >
                  <ChevronUp size={12} />
                  Subir
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown}
                  onClick={e => {
                    e.stopPropagation();
                    onMoveDown();
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-40 dark:bg-slate-700 dark:text-slate-100"
                >
                  <ChevronDown size={12} />
                  Bajar
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    if (!sure) {
                      setSure(true);
                      return;
                    }
                    onDelete();
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold',
                    sure
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300'
                  )}
                >
                  <Trash2 size={12} />
                  {sure ? '¿Seguro?' : 'Eliminar'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

interface TrainingPlanViewProps {
  activeRoutineName: string;
  /** `true` solo si modo mes (misma plantilla cada semana civil). Si es `false` u omisión → modo por semanas de ciclo: siempre mostrar Saltar semana. */
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
  /** Fija el TM interno de un ejercicio desde el plan (variantes sin TM propio todavía). */
  onSetInternalMax?: (name: string, mode: ExerciseMode, value: number) => void;
  weeks: TrainingWeek[];
  logs: Record<string, LogEntry>;
  viewAsOfWeek?: number | null;
  currentWeekOfYear?: number;
  onViewAsOfWeekChange?: (week: number | null) => void;
  isHistoryMode?: boolean;
  versionWeeks?: number[];
  /**
   * El tipo (marca vs corrección) se infiere solo: no hay que elegir.
   */
  onUpdateTM: (id: string, updates: Partial<TrainingMax>, kind?: 'record' | 'correction') => void;
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
  onMoveExercise: (weekId: string, dayId: string, exerciseId: string, dir: -1 | 1) => void;
  onUpdateExercise: (weekId: string, dayId: string, exerciseId: string, updates: Partial<PlannedExercise>) => void;
  /** Guardar logs en servidor (PATCH /logs); puede ser async para esperar a Mongo antes de cerrar el modal. */
  onRoutinePlanFlush?: () => void | Promise<void>;
  onUpdateDayType: (weekId: string, dayId: string, type: DayType) => void;
  onLogChange: (id: string, field: keyof LogEntry, value: any) => void;
  onSetLogChange: (logId: string, setIdx: number, updates: Partial<SetLog>) => void;
  /** Adjuntar vídeo/foto a una serie concreta (banca 3ª, 5ª…). */
  onUploadSetMedia?: (logId: string, setIdx: number, file: File) => Promise<{ mediaKey: string; mediaType: 'image' | 'video' }>;
  onMarkCompleted: (logId: string, completed: boolean) => void;
  onOpenRoutineManager: () => void;
  onExport: () => void;
  /** Volcar un plan leído de un documento del entrenador sobre esta rutina. */
  onImportCoachPlan?: (result: ImportCoachPlanResult) => void | Promise<void>;
  /** Incrementar para abrir el importador (p. ej. justo después de crear la rutina). */
  openImportSignal?: number;
  /** Dónde empezó el plan importado la última vez en esta rutina. */
  lastCoachImport?: LastCoachImport | null;
  skippedWeeks?: number[];
  /** Semanas civiles donde «Saltar la semana» desplazó el ciclo (solo block mode). */
  shiftedAtCalendarWeeks?: number[];
  onSkipWeek?: (weekNumber: number, mode: 'shift' | 'skip_only') => void;
  calendarDayShifts?: CalendarDayShift[];
  onSkipDay?: (dayIdx: number, year: number, week: number) => void;
  onResetDayShifts?: (year: number, week: number) => void;
  /** Sincroniza año/semana/día del plan visible para anclar TM manual (no “hoy”). */
  planViewAnchorRef?: React.MutableRefObject<{
    year: number;
    week: number;
    dayOfWeek: number;
    dateISO: string;
  }>;
  /** Si la pestaña Rutina no está visible, se cierran hojas portaledas (RM, log, añadir). */
  pageActive?: boolean;
}

export const TrainingPlanView: React.FC<TrainingPlanViewProps> = ({ 
  activeRoutineName,
  /** `true` = misma plantilla todas las semanas (modo mes); `false` = ciclo por semanas → siempre botón Saltar. */
  sameTemplateAllWeeks = false,
  cycleLength = 4,
  onToggleSameTemplateAllWeeks,
  trainingMaxes,
  tmHistory = [],
  tmAutoHighlightIds = [],
  internalExerciseMaxes = [],
  onSetInternalMax,
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
  onMoveExercise,
  onUpdateExercise,
  onRoutinePlanFlush,
  onUpdateDayType,
  onLogChange, 
  onSetLogChange,
  onUploadSetMedia,
  onMarkCompleted,
  onOpenRoutineManager,
  onExport,
  onImportCoachPlan,
  openImportSignal = 0,
  lastCoachImport,
  skippedWeeks = [],
  shiftedAtCalendarWeeks = [],
  calendarDayShifts = [],
  onSkipWeek,
  onSkipDay,
  onResetDayShifts,
  planViewAnchorRef,
  pageActive = true,
}) => {
  const displayWeekNum = viewAsOfWeek ?? currentWeekOfYear;
  const displayPlanYear = new Date().getFullYear();
  const initialWeekIdx = Math.max(0, Math.min((weeks?.length || 52) - 1, displayWeekNum - 1));
  // Lunes=0 .. Domingo=6; getDay(): 0=Dom, 1=Lun, ...
  const todayDayIdx = (new Date().getDay() + 6) % 7;
  const [activeWeekIdx, setActiveWeekIdx] = useState(initialWeekIdx);
  const [activeDayIdx, setActiveDayIdx] = useState(Math.min(todayDayIdx, 6));
  const [dayDir, setDayDir] = useState(1);
  const daySwipe = useRef<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [heldExerciseId, setHeldExerciseId] = useState<string | null>(null);
  const [showSkipDropdown, setShowSkipDropdown] = useState(false);
  const [rmListOpen, setRmListOpen] = useState(false);
  const [logExtrasOpen, setLogExtrasOpen] = useState(false);
  const [logSetExtrasOpen, setLogSetExtrasOpen] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  
  // Add Exercise Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTM, setEditingTM] = useState<TrainingMax | null>(null);
  const [tmModalError, setTmModalError] = useState('');
  const [newExModalError, setNewExModalError] = useState('');
  useEscapeClose(showAddModal, () => {
    setNewExModalError('');
    setShowAddModal(false);
  });
  useEscapeClose(!!heldExerciseId, () => setHeldExerciseId(null));
  const [loggingExercise, setLoggingExercise] = useState<{ weekId: string, dayId: string, exercise: PlannedExercise } | null>(null);
  const [setMediaViewer, setSetMediaViewer] = useState<{
    title: string;
    mediaKey: string;
    mediaType: 'image' | 'video';
    logId: string;
    setIdx: number;
  } | null>(null);
  const [uploadingSetKey, setUploadingSetKey] = useState<string | null>(null);
  const setMediaInputRef = useRef<HTMLInputElement>(null);
  const pendingSetMedia = useRef<{ logId: string; setIdx: number } | null>(null);

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
  const [newExTmManual, setNewExTmManual] = useState(false);
  const [newExMoreOpen, setNewExMoreOpen] = useState(false);
  const [newExTmOpen, setNewExTmOpen] = useState(false);
  const newExNameRef = useRef<HTMLInputElement>(null);

  const resetNewExForm = () => {
    setNewExForm({ name: '', linkedTo: '', pct: 75, sets: 3, reps: '5', mode: 'weight' });
    setNewExModalError('');
    setNewExTmManual(false);
    setNewExMoreOpen(false);
    setNewExTmOpen(false);
  };

  const exerciseNameSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const week of weeks) {
      for (const day of week.days ?? []) {
        for (const ex of day.exercises ?? []) {
          const n = String(ex.name || '').trim();
          const key = normalizeExerciseNameKey(n);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          names.push(n);
        }
      }
    }
    return names;
  }, [weeks]);

  useEffect(() => {
    if (!showAddModal) return;
    const t = window.setTimeout(() => newExNameRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [showAddModal]);

  /** Borrador local para poder vaciar el campo al editar (evita 3→32 al no poder borrar). Se confirma en onBlur. */
  const [showImportModal, setShowImportModal] = useState(false);
  useIncrementSignal('import-plan', openImportSignal, () => {
    if (onImportCoachPlan) setShowImportModal(true);
  });

  useEffect(() => {
    if (pageActive) return;
    setRmListOpen(false);
    setShowAddModal(false);
    setEditingTM(null);
    setTmModalError('');
    setLoggingExercise(null);
    setSetMediaViewer(null);
    setShowMonthSelector(false);
    setShowSkipDropdown(false);
    setHeldExerciseId(null);
    setShowImportModal(false);
  }, [pageActive]);
  const pageEnter = usePageEnter(pageActive);
  const [setsInputDraft, setSetsInputDraft] = useState<Record<string, string>>({});
  const [repsInputDraft, setRepsInputDraft] = useState<Record<string, string>>({});
  const [pctInputDraft, setPctInputDraft] = useState<Record<string, string>>({});
  const [targetInputDraft, setTargetInputDraft] = useState<Record<string, string>>({});
  const [logInputDraft, setLogInputDraft] = useState<Record<string, string>>({});
  const logInputDraftRef = useRef<Record<string, string>>({});
  logInputDraftRef.current = logInputDraft;
  const pctInputDraftRef = useRef<Record<string, string>>({});
  pctInputDraftRef.current = pctInputDraft;

  // Scroll al día actual cuando cambia la semana civil o el día (no solo activeWeekIdx: con shift puede repetirse el índice)
  useEffect(() => {
    const el = dayButtonRefs.current[activeDayIdx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [displayWeekNum, activeDayIdx]);

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
  const skippedDaysThisWeek = useMemo(
    () => shiftsForCalendarWeek(calendarDayShifts, displayPlanYear, displayWeekNum),
    [calendarDayShifts, displayPlanYear, displayWeekNum]
  );
  const displayDays = useMemo(
    () => (currentWeek ? applyDaySkips(currentWeek.days, skippedDaysThisWeek) : []),
    [currentWeek, skippedDaysThisWeek]
  );
  const templateDay = currentWeek?.days[activeDayIdx];
  const currentDay = displayDays[activeDayIdx] ?? templateDay;
  const dayExercises = useMemo(
    () => mergeAdjacentSameExercises(currentDay?.exercises ?? []),
    [currentDay]
  );
  useEffect(() => {
    setHeldExerciseId(null);
  }, [activeDayIdx, viewMode]);

  const currentMonth = getMonthForWeek(displayWeekNum);
  /** Cuántas semanas se han desplazado por «Saltar la semana» antes de la semana actual (block mode). */
  const weekShift = useMemo(() => {
    if (sameTemplateAllWeeks) return 0;
    return shiftedAtCalendarWeeks.filter((w) => w < displayWeekNum).length;
  }, [sameTemplateAllWeeks, shiftedAtCalendarWeeks, displayWeekNum]);

  /** ¿Esta semana civil fue desplazada con «Saltar la semana»? */
  const isShiftedWeek = useMemo(
    () => !sameTemplateAllWeeks && shiftedAtCalendarWeeks.includes(displayWeekNum),
    [sameTemplateAllWeeks, shiftedAtCalendarWeeks, displayWeekNum]
  );

  /** Semana del ciclo (1–N) teniendo en cuenta los shifts acumulados. */
  const cycleWeek = useMemo(() => {
    const cl = Math.max(1, cycleLength);
    if (sameTemplateAllWeeks) return ((Math.max(1, displayWeekNum) - 1) % cl) + 1;
    const effective = displayWeekNum - weekShift;
    return (((Math.max(1, effective) - 1) % cl) + cl) % cl + 1;
  }, [displayWeekNum, cycleLength, weekShift, sameTemplateAllWeeks]);

  /**
   * Clave en `skippedWeeks`: en rutina lineal, semana civil; en rutina por bloque, posición del mesociclo (1…N),
   * para que al cambiar de semana civil la semana del ciclo siga marcada como saltada.
   */
  const skipWeekKey = sameTemplateAllWeeks ? displayWeekNum : cycleWeek;

  /** Semana del plan marcada como saltada (visual o shift). */
  const calendarWeekSkipped = skippedWeeks.includes(skipWeekKey) || isShiftedWeek;

  /** Con semana saltada, entreno/descarga se muestran como descanso; al quitar el salto vuelve el plan tal cual estaba guardado. */
  const effectiveDayType = useCallback(
    (day: TrainingDay): DayType => {
      if (!calendarWeekSkipped) return day.type;
      if (day.type === 'workout' || day.type === 'deload') return 'rest';
      return day.type;
    },
    [calendarWeekSkipped]
  );

  const effectiveCurrentDayType = useMemo(
    () => (currentDay ? effectiveDayType(currentDay) : 'rest'),
    [currentDay, effectiveDayType]
  );

  useEffect(() => {
    let idx: number;
    if (sameTemplateAllWeeks) {
      idx = displayWeekNum - 1;
    } else {
      const effective = displayWeekNum - weekShift;
      idx = ((effective - 1) % weeks.length + weeks.length) % weeks.length;
    }
    const targetIdx = Math.max(0, Math.min(weeks.length - 1, idx));
    setActiveWeekIdx(targetIdx);
    setHeldExerciseId(null);
  }, [displayWeekNum, weeks.length, weekShift, sameTemplateAllWeeks]);

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

  /**
   * Ejercicios del día que se está registrando: permiten encadenar uno tras otro
   * desde el propio modal en vez de cerrarlo y volver a abrirlo en cada ejercicio.
   */
  const modalDayContext = useMemo(() => {
    if (!loggingExercise) return null;
    const w = weeks.find(x => x.id === loggingExercise.weekId);
    const d = w?.days.find(x => x.id === loggingExercise.dayId);
    const list = mergeAdjacentSameExercises(d?.exercises ?? []);
    const idx = list.findIndex(e => e.id === loggingExercise.exercise.id || e.mergedFromIds?.includes(loggingExercise.exercise.id));
    if (idx < 0) return null;
    return { list, idx, next: list[idx + 1] };
  }, [loggingExercise, weeks]);

  const modalLogKey = useMemo(() => {
    if (!loggingExercise) return '';
    const w = weeks.find((x) => x.id === loggingExercise.weekId);
    const d = w?.days.find((x) => x.id === loggingExercise.dayId);
    if (w && d) return routineLogKeyFromIds(w, d, loggingExercise.exercise);
    return routineLogKeyFromExerciseId(loggingExercise.exercise.id) ?? `${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`;
  }, [loggingExercise, weeks]);

  useEffect(() => {
    if (!loggingExercise || !modalLogKey) return;
    const ex = loggingExercise.exercise;
    const n = Math.max(1, ex.sets || 1);
    for (let i = 0; i < n; i++) {
      const planned = plannedRepsForSet(ex, i);
      if (planned <= 0) continue;
      if (logs[modalLogKey]?.sets?.[i]?.reps == null) {
        onSetLogChange(modalLogKey, i, { reps: planned });
      }
    }
  }, [loggingExercise, modalLogKey]);

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

  /** Pie de serie en modo kg (con o sin TM): 1RM estimado (Epley) desde peso y reps de la serie. */
  const estimatedOneRmFooterKg = (weight: number | null, reps: number | null): string => {
    if (weight == null || reps == null || reps <= 0) return '—';
    const e = calculateRM(weight, reps);
    if (e <= 0) return '—';
    const s = Number.isInteger(e) ? `${e}` : e.toFixed(1);
    return `1RM est. ≈ ${s} kg`;
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

  const pickSetMedia = (logId: string, setIdx: number) => {
    if (!onUploadSetMedia) return;
    pendingSetMedia.current = { logId, setIdx };
    setMediaInputRef.current?.click();
  };

  const handleSetMediaPicked = async (file: File | undefined) => {
    const pending = pendingSetMedia.current;
    pendingSetMedia.current = null;
    if (!file || !pending || !onUploadSetMedia) return;
    const key = `${pending.logId}-${pending.setIdx}`;
    setUploadingSetKey(key);
    try {
      await onUploadSetMedia(pending.logId, pending.setIdx, file);
    } catch (e: any) {
      window.alert(e?.message || 'No se ha podido guardar el vídeo');
    } finally {
      setUploadingSetKey(null);
    }
  };

  /** Una serie cuenta como registrada cuando tiene reps y, si el plan pide kilos, también kg. */
  const isSetLogged = (exercise: PlannedExercise, setLog?: SetLog) => {
    if (!setLog || setLog.reps === null) return false;
    if (exercise.mode !== 'weight') return true;
    if (setLog.weight != null && setLog.weight > 0) return true;
    const hasPlannedLoad = !!resolveEffectiveTM(exercise) || (exercise.weight || 0) > 0;
    return !!setLog.completed && !hasPlannedLoad;
  };

  /** Lo que el plan pide para cada serie: la base de los atajos «según el plan». */
  const plannedSetsFor = (exercise: PlannedExercise) => {
    const tm = resolveEffectiveTM(exercise);
    const plannedReps = plannedRepsForSet(exercise, 0);
    const setCount = Math.max(1, exercise.sets || 1);
    const weightForSet = (idx: number) => {
      const written = plannedWeightForSet(exercise, idx);
      if (written > 0) return written;
      const pct = planPctForSet(exercise, idx);
      const hasPlanPct =
        exercise.pct != null ||
        (exercise.pctPerSet?.[idx] ?? 0) > 0 ||
        !!plannedRpeForSet(exercise, idx);
      if (tm && hasPlanPct) {
        return exercise.mode === 'weight'
          ? roundTo25(tm.value * (pct / 100))
          : Math.max(1, Math.round(tm.value * (pct / 100)));
      }
      return 0;
    };
    const canFill = Array.from({ length: setCount }, (_, i) =>
      plannedRepsForSet(exercise, i) > 0 || weightForSet(i) > 0
    ).some(Boolean);
    return { tm, plannedReps, setCount, weightForSet, canFill };
  };

  /** Cuántas series lleva registradas un ejercicio. */
  const setsLoggedCount = (exercise: PlannedExercise, logKey: string) => {
    const setCount = Math.max(1, exercise.sets || 1);
    const sets = logs[logKey]?.sets ?? [];
    let done = 0;
    for (let i = 0; i < setCount; i++) if (isSetLogged(exercise, sets[i])) done++;
    return { done, total: setCount };
  };

  /** Rellena solo las series que falten con lo planificado. Devuelve cuántas ha escrito. */
  const fillExerciseFromPlan = (exercise: PlannedExercise, logKey: string) => {
    const { tm, plannedReps, setCount, weightForSet, canFill } = plannedSetsFor(exercise);
    if (!canFill) return 0;
    const sets = logs[logKey]?.sets ?? [];
    let filled = 0;
    for (let i = 0; i < setCount; i++) {
      if (isSetLogged(exercise, sets[i])) continue;
      onSetLogChange(logKey, i, {
        // En modo reps/segundos el objetivo sale del TM si está vinculado.
        reps: exercise.mode === 'weight' ? plannedRepsForSet(exercise, i) : (tm ? weightForSet(i) : plannedRepsForSet(exercise, i)),
        weight: exercise.mode === 'weight' && weightForSet(i) > 0 ? weightForSet(i) : null,
        completed: true,
        inputMode: 'kg',
      });
      filled++;
    }
    return filled;
  };

  const removeExerciseRow = (weekId: string, dayId: string, ex: PlannedExercise) => {
    onRemoveExercise(weekId, dayId, ex.id);
    for (const extraId of ex.mergedFromIds ?? []) {
      if (extraId !== ex.id) onRemoveExercise(weekId, dayId, extraId);
    }
  };

  const goToDay = (idx: number) => {
    const last = Math.max(0, (displayDays.length || currentWeek?.days.length || 7) - 1);
    if (idx < 0 || idx > last) return;
    if (idx === activeDayIdx) return;
    setDayDir(idx > activeDayIdx ? 1 : -1);
    setActiveDayIdx(idx);
  };

  /** Resumen del día para la cabecera: ejercicios hechos y series que quedan por rellenar. */
  const dayProgress = useMemo(() => {
    const exercises = dayExercises;
    let doneExercises = 0;
    let fillableSets = 0;
    for (const ex of exercises) {
      if (!currentWeek || !currentDay) break;
      const key = routineLogKeyFromIds(currentWeek, currentDay, ex);
      const { done, total } = setsLoggedCount(ex, key);
      if (done >= total) doneExercises++;
      if (plannedSetsFor(ex).canFill) fillableSets += total - done;
    }
    return { doneExercises, totalExercises: exercises.length, fillableSets };
    // `logs` entra en las dependencias porque el recuento se recalcula al registrar series.
  }, [currentWeek, currentDay, dayExercises, logs, effectiveTms, internalExerciseMaxes]);

  const online = useOnlineStatus();

  return (
    <motion.div 
      variants={PAGE_ENTER_ROOT}
      initial={false}
      animate={pageEnter}
      className="app-page mx-auto flex max-w-5xl flex-col"
    >
      {!online && (
        <p className="mb-3 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Sin conexión. Se muestra el último plan guardado en este dispositivo.
        </p>
      )}
      <motion.header variants={PAGE_ENTER_ITEM} initial={false} className="mb-4 sm:mb-6">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onOpenRoutineManager}
            className="group flex min-w-0 flex-1 items-center gap-1 text-left"
          >
            <h1 className="truncate text-[17px] font-semibold tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
              {activeRoutineName}
            </h1>
            <ChevronRight className="shrink-0 text-slate-300 dark:text-slate-600" size={16} />
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {onImportCoachPlan && !isHistoryMode && (
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-transform active:scale-95 dark:text-slate-400"
                aria-label="Importar Word o PDF"
              >
                <FileUp size={16} />
              </button>
            )}
            <div className="flex rounded-full bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                onClick={() => setViewMode('daily')}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  viewMode === 'daily' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'
                )}
              >
                Día
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  viewMode === 'weekly' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'
                )}
              >
                Semana
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRmListOpen(true)}
          className="mt-2 flex w-full items-center gap-1.5 overflow-hidden text-left"
          aria-label="Ver y editar RM"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {effectiveTms.length === 0 ? (
              <span className="truncate text-[12px] text-slate-400">Añadir marcas</span>
            ) : (
              effectiveTms.map((tm, tmIdx) => (
                <span
                  key={tm.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tmCardsReadOnly) {
                      setRmListOpen(true);
                      return;
                    }
                    setEditingTM(tm);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (!tmCardsReadOnly) setEditingTM(tm);
                  }}
                  className={cn(
                    'inline-flex shrink-0 items-baseline gap-0.5 text-[12px] leading-tight',
                    tmAutoHighlightIds.includes(tm.id)
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {tmIdx > 0 && <span className="mr-1 text-slate-300 dark:text-slate-600">·</span>}
                  <span className="max-w-[6.5rem] truncate">{tm.name}</span>
                  <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {tm.value}
                    <span className="font-medium text-slate-400">
                      {tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'r' : 's'}
                    </span>
                  </span>
                </span>
              ))
            )}
          </div>
          <ChevronRight size={13} className="shrink-0 text-slate-300 dark:text-slate-600" />
        </button>
      </motion.header>

      <motion.section variants={PAGE_ENTER_ITEM} initial={false} className="relative">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400">
              {sameTemplateAllWeeks || cycleLength <= 1
                ? currentMonth
                : `Semana ${cycleWeek} de ${cycleLength}`}
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {viewMode === 'daily' ? currentDay?.name || 'Hoy' : 'Esta semana'}
            </h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <button 
                onClick={() => setShowMonthSelector(!showMonthSelector)}
                className="flex items-center justify-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-100"
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
                          onViewAsOfWeekChange?.(targetWeekNum === currentWeekOfYear ? null : targetWeekNum);
                          setShowMonthSelector(false);
                        }}
                        className={cn(
                          "px-2 py-2 rounded-lg text-xs font-medium transition-all",
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

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (displayWeekNum > 1) {
                    const newWeek = displayWeekNum - 1;
                    onViewAsOfWeekChange?.(newWeek === currentWeekOfYear ? null : newWeek);
                  }
                }}
                className={cn(
                  'app-icon-hit rounded-full bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-200',
                  displayWeekNum <= 1 && 'opacity-40'
                )}
                aria-label="Semana anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (displayWeekNum < 52) {
                    const newWeek = displayWeekNum + 1;
                    onViewAsOfWeekChange?.(newWeek === currentWeekOfYear ? null : newWeek);
                  }
                }}
                className={cn(
                  'app-icon-hit rounded-full bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-200',
                  displayWeekNum >= 52 && 'opacity-40'
                )}
                aria-label="Semana siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {!isHistoryMode && onSkipWeek && sameTemplateAllWeeks !== true && (
              <div className="relative">
                <button
                  type="button"
                  title={
                    calendarWeekSkipped
                      ? 'Pulsa para quitar el salto'
                      : 'Marcar semana como saltada'
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-sm transition-all",
                    calendarWeekSkipped
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                      : "bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (calendarWeekSkipped) {
                      if (isShiftedWeek) {
                        onSkipWeek(displayWeekNum, 'shift');
                      } else {
                        onSkipWeek(skipWeekKey, 'skip_only');
                      }
                      setShowSkipDropdown(false);
                      return;
                    }
                    setShowSkipDropdown((v) => !v);
                  }}
                >
                  <SkipForward size={12} />
                  {calendarWeekSkipped ? 'Semana libre' : 'No entreno'}
                </button>
                {showSkipDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSkipDropdown(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50">
                      <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2 min-w-[10rem] space-y-1">
                        <button
                          type="button"
                          onClick={() => { onSkipWeek(skipWeekKey, 'skip_only'); setShowSkipDropdown(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        >
                          Solo marcar
                          <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">No mueve el resto del plan</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { onSkipWeek(displayWeekNum, 'shift'); setShowSkipDropdown(false); }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        >
                          Vacaciones — mover el plan
                          <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">Las semanas siguientes se desplazan</span>
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
              key={`daily-${displayWeekNum}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <div
                className="mb-3 -mx-1 sm:mb-6 sm:mx-0"
                onTouchStart={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
              >
              <div className="app-h-scroll px-1 pb-1 sm:px-0">
              <div className="flex w-max gap-1.5">
                {(displayDays.length ? displayDays : currentWeek.days).map((day, idx) => {
                  const isActive = activeDayIdx === idx;
                  const dayTypeDot = {
                    workout: "bg-indigo-500",
                    deload: "bg-amber-500",
                    rest: "bg-slate-400"
                  };
                  const dotClass = isActive ? "bg-white" : dayTypeDot[effectiveDayType(day)];
                  /** Primer día de la semana: sin pop-in en el puntito; el resto entra en cascada (solo al montar la fila = cambio de semana). */
                  const dotDelay = idx === 0 ? 0 : (idx - 1) * 0.042;
                  
                  return (
                  <button
                    ref={(el) => { dayButtonRefs.current[idx] = el; }}
                    key={day.id}
                    onClick={() => goToDay(idx)}
                    className={cn(
                        "flex min-h-11 min-w-[2.85rem] flex-shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-[11px] font-medium transition-all sm:min-w-[3.4rem] sm:gap-1.5 sm:px-3 sm:text-[12px]",
                        isActive
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400"
                      )}
                    >
                      <motion.span
                        className={cn("w-2 h-2 rounded-full flex-shrink-0 block", dotClass)}
                        initial={idx === 0 ? false : { scale: 0.35, opacity: 0.25 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={
                          idx === 0
                            ? { duration: 0 }
                            : { delay: dotDelay, type: 'spring', stiffness: 520, damping: 26 }
                        }
                      />
                      <span className="sm:hidden">{day.name.slice(0, 3)}</span>
                      <span className="hidden sm:inline">{day.name}</span>
                  </button>
                  );
                })}
              </div>
              </div>
              </div>

              <AnimatePresence mode="wait">
              <motion.div
                key={`${displayWeekNum}-${activeDayIdx}`}
                initial={{ opacity: 0, x: dayDir > 0 ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dayDir > 0 ? -12 : 12 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                onPointerDown={e => {
                  if ((e.target as HTMLElement).closest('input,textarea,button,a')) return;
                  daySwipe.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerUp={e => {
                  const start = daySwipe.current;
                  daySwipe.current = null;
                  if (!start) return;
                  const dx = e.clientX - start.x;
                  const dy = e.clientY - start.y;
                  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
                  goToDay(activeDayIdx + (dx < 0 ? 1 : -1));
                }}
                onPointerCancel={() => { daySwipe.current = null; }}
              >
              <div>
                {calendarWeekSkipped && (
                  <div className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
                    Semana saltada: los días de entreno o descarga se muestran como descanso. El plan guardado no cambia; al pulsar «Saltada» vuelve todo como estaba.
                  </div>
                )}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      {dayProgress.totalExercises > 0 &&
                        (effectiveCurrentDayType === 'workout' || effectiveCurrentDayType === 'deload') && (
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                              <motion.div
                                className="h-full rounded-full bg-emerald-500"
                                initial={false}
                                animate={{
                                  width: `${(dayProgress.doneExercises / dayProgress.totalExercises) * 100}%`,
                                }}
                                transition={SCREEN_TRANSITION}
                              />
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {dayProgress.doneExercises} de {dayProgress.totalExercises} hechos
                            </span>
                          </div>
                        )}
                    </div>
                    <div className={cn("w-full sm:w-auto", isHistoryMode && "opacity-75 pointer-events-none")}>
                      <div className="flex rounded-full bg-slate-100 p-0.5 dark:bg-slate-800">
                        {([
                          { id: 'workout' as DayType, label: 'Entreno' },
                          { id: 'rest' as DayType, label: 'Descanso' },
                          { id: 'deload' as DayType, label: 'Descarga' },
                        ]).map(opt => {
                          const selected = (calendarWeekSkipped ? effectiveCurrentDayType : currentDay.type) === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={isHistoryMode || calendarWeekSkipped}
                              title={calendarWeekSkipped ? 'Quita el salto de semana para editar el tipo de día.' : undefined}
                              onClick={() => onUpdateDayType(currentWeek.id, templateDay?.id ?? currentDay.id, opt.id)}
                              className={cn(
                                'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none',
                                selected
                                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                                  : 'text-slate-500'
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                </div>

                {!isHistoryMode && (onSkipDay || onResetDayShifts) && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {onSkipDay && skippedDaysThisWeek.includes(activeDayIdx) ? (
                      <button
                        type="button"
                        onClick={() => onSkipDay(activeDayIdx, displayPlanYear, displayWeekNum)}
                        className="rounded-full bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        Hoy sí
                      </button>
                    ) : onSkipDay && (effectiveCurrentDayType === 'workout' || effectiveCurrentDayType === 'deload') ? (
                      <button
                        type="button"
                        onClick={() => onSkipDay(activeDayIdx, displayPlanYear, displayWeekNum)}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      >
                        Hoy no voy
                      </button>
                    ) : null}
                    {skippedDaysThisWeek.length > 0 && onResetDayShifts && (
                      <button
                        type="button"
                        onClick={() => onResetDayShifts(displayPlanYear, displayWeekNum)}
                        className="rounded-full px-3 py-1.5 text-[12px] font-medium text-indigo-600 dark:text-indigo-300"
                      >
                        Mis días
                      </button>
                    )}
                  </div>
                )}

                {effectiveCurrentDayType === 'workout' || effectiveCurrentDayType === 'deload' ? (
                  <div className="space-y-2">
                    {/* Table Header - Solo desktop. % RM solo si alguno tiene TM vinculado */}
                    <div className="hidden lg:grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800 dark:to-indigo-950/30 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
                      <div className="col-span-8">Ejercicio</div>
                      <div className="col-span-4 text-center">Series × Reps</div>
                    </div>

                    {/* Atajo de día: evita abrir el modal de cada ejercicio cuando la sesión ha ido según lo previsto. */}
                    {!isHistoryMode && dayProgress.fillableSets > 0 && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.985 }}
                        disabled={savingSession}
                        onClick={async () => {
                          for (const ex of dayExercises) {
                            fillExerciseFromPlan(ex, routineLogKeyFromIds(currentWeek, currentDay, ex));
                          }
                          setSavingSession(true);
                          try {
                            await onRoutinePlanFlush?.();
                          } finally {
                            setSavingSession(false);
                          }
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/70 py-2 text-[13px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                      >
                        {savingSession ? (
                          <><Loader2 size={16} className="animate-spin" /> Guardando…</>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            Entrené todo según el plan
                            <span className="font-bold normal-case tracking-normal opacity-70">
                              ({dayProgress.fillableSets} {dayProgress.fillableSets === 1 ? 'serie' : 'series'})
                            </span>
                          </>
                        )}
                      </motion.button>
                    )}

                    {/* Ejercicios */}
                    <LayoutGroup>
                    <div className="space-y-2">
                      {dayExercises.map((ex, exIdx) => {
                        const logId = routineLogKeyFromIds(currentWeek, currentDay, ex);
                        const log = getLogEntryForExercise(logs, currentWeek, currentDay, ex);
                        const effectiveTM = resolveEffectiveTM(ex);
                        const k = fieldKey(currentWeek, currentDay, ex);
                        const setsShown = setsInputDraft[k] !== undefined ? setsInputDraft[k] : String(Math.max(1, ex.sets || 1));
                        const repsShown = repsInputDraft[k] !== undefined ? repsInputDraft[k] : String(ex.reps ?? '');
                        const schemeLabel = exerciseSchemeLabel(ex);
                        const compactScheme = compactSchemeLabel(ex);
                        const rpeLabel = exerciseRpeLabel(ex);

                        /** Estado de un vistazo: así no hay que abrir el modal para saber qué falta. */
                        const exProgress = setsLoggedCount(ex, logId);
                        const setVideos = (log?.sets || []).filter(s => s.mediaKey).length;
                        const exStatusBadge =
                          exProgress.done === 0 ? null : (
                            <span
                              className={cn(
                                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
                                exProgress.done >= exProgress.total
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                              )}
                            >
                              {exProgress.done >= exProgress.total ? (
                                <>
                                  <CheckCircle2 size={12} className="fill-current" />
                                  Hecho
                                </>
                              ) : (
                                `${exProgress.done}/${exProgress.total} series`
                              )}
                            </span>
                          );

                          return (
                            <ExerciseHoldRow
                              key={ex.id}
                              highlighted={heldExerciseId === ex.id}
                              canHold={!isHistoryMode}
                              canMoveUp={exIdx > 0}
                              canMoveDown={exIdx < dayExercises.length - 1}
                              onOpen={() => setLoggingExercise({ weekId: currentWeek.id, dayId: currentDay.id, exercise: ex })}
                              onLongPress={() => setHeldExerciseId(ex.id)}
                              onDismiss={() => setHeldExerciseId(null)}
                              onMoveUp={() => {
                                onMoveExercise(currentWeek.id, currentDay.id, ex.id, -1);
                              }}
                              onMoveDown={() => {
                                onMoveExercise(currentWeek.id, currentDay.id, ex.id, 1);
                              }}
                              onDelete={() => {
                                removeExerciseRow(currentWeek.id, currentDay.id, ex);
                                setHeldExerciseId(null);
                              }}
                            >
                              {/* Mobile Card Layout */}
                              <div className="flex items-center gap-2.5 lg:hidden">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start gap-1.5">
                                    <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                                      {ex.name}
                                    </h4>
                                    {exStatusBadge}
                                    {setVideos > 0 && (
                                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                                        <Video size={10} />
                                        {setVideos}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400">
                                    {rpeLabel && (
                                      <span className="font-semibold text-amber-600 dark:text-amber-400">RPE {rpeLabel}</span>
                                    )}
                                    {rpeLabel && (effectiveTM || ex.coachNote) && ' · '}
                                    {effectiveTM && (
                                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                                        {effectiveTM.isInternal ? 'RM' : effectiveTM.name} {effectiveTM.value}{effectiveTM.mode === 'weight' ? 'kg' : effectiveTM.mode === 'reps' ? 'r' : 's'}
                                      </span>
                                    )}
                                    {ex.coachNote && (
                                      <>
                                        {(rpeLabel || effectiveTM) && ' · '}
                                        {ex.coachNote}
                                      </>
                                    )}
                                  </p>
                                </div>
                                <div
                                  className="shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {compactScheme ? (
                                    <span className="whitespace-nowrap rounded-lg bg-slate-50 px-2 py-1 text-[12px] font-bold tabular-nums text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                                      {compactScheme}
                                    </span>
                                  ) : (
                                    <div className="flex items-center whitespace-nowrap rounded-lg bg-slate-50 px-1.5 py-1 dark:bg-slate-800">
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
                                        style={{ width: `${Math.max(2, String(setsShown).length + 0.6)}ch` }}
                                        className="min-w-[1.5rem] bg-transparent text-center text-sm font-semibold text-slate-900 focus:outline-none disabled:opacity-50 dark:text-slate-100"
                                        placeholder="3"
                                      />
                                      <span className="px-0.5 text-xs font-medium text-slate-300">×</span>
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
                                        style={{ width: `${Math.max(4, String(repsShown).length + 0.6)}ch` }}
                                        className="min-w-[2.75rem] bg-transparent text-center text-sm font-semibold tabular-nums text-slate-900 focus:outline-none disabled:opacity-50 dark:text-slate-100"
                                        placeholder="10"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Desktop Table Layout */}
                              <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center py-4 px-4 border-b border-slate-100 last:border-0">
                              {/* Exercise Info */}
                                <div className="col-span-8 flex items-center gap-3">
                                <div className="flex flex-col">
                                  <span className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                                    {ex.name}
                                  </span>
                                  {isMultiBlock(ex) ? (
                                    <div className="mt-1.5 space-y-1">
                                      <PlanBlockChips exercise={ex} />
                                      {ex.coachNote && (
                                        <span className="text-xs text-slate-500 dark:text-slate-400">{ex.coachNote}</span>
                                      )}
                                    </div>
                                  ) : (rpeLabel || ex.coachNote) ? (
                                    <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                      {rpeLabel && (
                                        <span className="font-bold text-amber-600 dark:text-amber-400">
                                          RPE {rpeLabel}
                                        </span>
                                      )}
                                      {rpeLabel && ex.coachNote && ' · '}
                                      {ex.coachNote}
                                    </span>
                                  ) : null}
                                  {effectiveTM && (
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-0.5">{effectiveTM.isInternal ? 'RM' : effectiveTM.name}</span>
                                  )}
                                </div>
                              </div>

                              {/* Sets x Reps */}
                                <div className="col-span-4 flex items-center justify-center">
                                  {schemeLabel ? (
                                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    {ex.sets} series
                                  </span>
                                  ) : (
                                  <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 shadow-sm dark:shadow-md dark:shadow-slate-900/50 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-all" onClick={(e) => e.stopPropagation()}>
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
                                  )}
                              </div>
                            </div>
                            </ExerciseHoldRow>
                          );
                      })}
                    </div>
                    </LayoutGroup>

                    {currentDay.exercises.length === 0 ? (
                      <div className="rounded-2xl border-2 border-dashed border-slate-200/90 bg-slate-50/60 py-8 text-center dark:border-slate-600/70 dark:bg-slate-800/25">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100/90 dark:bg-indigo-950/55">
                          <Plus className="text-indigo-600 dark:text-indigo-400" size={20} strokeWidth={2.25} />
                        </div>
                        <p className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">No hay ejercicios para este día</p>
                      {!isHistoryMode && (
                      <button 
                        onClick={() => {
                          resetNewExForm();
                          setShowAddModal(true);
                        }}
                          className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/90 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 active:scale-[0.98] dark:border-indigo-500/35 dark:bg-indigo-950/35 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-900/40"
                      >
                          <Plus size={14} strokeWidth={2.5} className="text-indigo-500 transition-transform group-hover:scale-110 dark:text-indigo-300" />
                          <span>Añadir primer ejercicio</span>
                        </button>
                      )}
                        </div>
                    ) : (
                      !isHistoryMode && (
                      <div className="mt-3 flex justify-center">
                        <button 
                          onClick={() => {
                            resetNewExForm();
                            setShowAddModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-indigo-600 dark:text-indigo-400"
                        >
                          <Plus size={15} />
                          Añadir ejercicio
                      </button>
                    </div>
                    )
                    )}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                      <Moon className="text-slate-400 dark:text-slate-500" size={22} />
                    </div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Descanso</h4>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hoy toca recuperar.</p>
                  </div>
                )}
              </div>
              </motion.div>
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key={`weekly-${displayWeekNum}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {currentWeek.days.map((day, dayIdx) => {
                const effType = effectiveDayType(day);
                return (
                <Card 
                  key={day.id} 
                  padding="md" 
                  rounded="2xl" 
                  onClick={() => {
                    goToDay(dayIdx);
                    setViewMode('daily');
                  }}
                  className={cn(
                    "cursor-pointer border transition-all hover:border-indigo-200 dark:hover:border-indigo-600",
                    effType === 'rest' ? "border-slate-100 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/40" : "border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800/50"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{day.name}</h3>
                    <DayTypeBadge type={effType} />
                  </div>

                  {effType === 'workout' || effType === 'deload' ? (
                    <div className="space-y-1.5">
                      {day.exercises.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">Sin ejercicios</p>
                      ) : (
                        mergeAdjacentSameExercises(day.exercises).map(ex => (
                          <div key={ex.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-slate-700/40">
                            <span className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{ex.name}</span>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                              {isMultiBlock(ex) ? `${ex.sets} series` : `${ex.sets}×${ex.reps}`}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-3 text-slate-400 dark:text-slate-500">
                      <Moon size={16} />
                      <span className="text-xs font-medium">Descanso</span>
                    </div>
                  )}
                </Card>
              );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <motion.div variants={PAGE_ENTER_ITEM} initial={false} className="order-3 mt-6 flex items-center justify-center gap-3 sm:mt-8">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
        >
          <Download size={14} />
          Exportar
        </button>
      </motion.div>

      {showImportModal && onImportCoachPlan && (
        <React.Suspense fallback={null}>
          <ImportCoachPlanModal
            currentWeekNumber={currentWeek?.number ?? viewAsOfWeek ?? 1}
            planYear={displayPlanYear}
            lastImport={lastCoachImport}
            routineName={activeRoutineName}
            routineCycleLength={cycleLength}
            sameTemplateAllWeeks={sameTemplateAllWeeks}
            onClose={() => setShowImportModal(false)}
            onConfirm={async (result) => {
              await onImportCoachPlan(result);
              setShowImportModal(false);
            }}
          />
        </React.Suspense>
      )}

      <GlassModal
        open={!!loggingExercise}
        onClose={() => { setLoggingExercise(null); setLogInputDraft({}); setLogSetExtrasOpen(false); }}
        wide
        persist={savingSession}
        footer={loggingExercise ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              disabled={savingSession}
              className="h-11 w-full rounded-xl text-sm font-semibold"
              onClick={async () => {
                const next = modalDayContext?.next;
                if (!isHistoryMode && loggingExercise) {
                  setSavingSession(true);
                  try {
                    await onRoutinePlanFlush?.();
                  } finally {
                    setSavingSession(false);
                  }
                }
                setLogInputDraft({});
                if (next && loggingExercise) {
                  setLoggingExercise({ ...loggingExercise, exercise: next });
                  return;
                }
                setLoggingExercise(null);
                setLogSetExtrasOpen(false);
              }}
            >
              {savingSession ? (
                <><Loader2 size={16} className="mr-2 animate-spin" /> Guardando…</>
              ) : modalDayContext?.next ? (
                <>Guardar y siguiente <ChevronRight size={16} className="ml-1" /></>
              ) : (
                'Guardar'
              )}
            </Button>
            {logSetExtrasOpen && !isHistoryMode && (
              <button
                type="button"
                className="text-center text-[11px] font-medium text-rose-500"
                onClick={() => {
                  removeExerciseRow(loggingExercise.weekId, loggingExercise.dayId, loggingExercise.exercise);
                  setLoggingExercise(null);
                  setLogInputDraft({});
                  setLogSetExtrasOpen(false);
                }}
              >
                Eliminar ejercicio del plan
              </button>
            )}
          </div>
        ) : null}
      >
        {loggingExercise && (
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <div className="flex-1 mr-3 min-w-0">
                    {modalDayContext && modalDayContext.list.length > 1 && (
                      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        Ejercicio {modalDayContext.idx + 1} de {modalDayContext.list.length}
                      </p>
                    )}
                    <input 
                      value={loggingExercise.exercise.name}
                      onChange={(e) => onUpdateExercise(loggingExercise.weekId, loggingExercise.dayId, loggingExercise.exercise.id, { name: e.target.value })}
                      className="w-full border-b-2 border-transparent bg-transparent text-lg font-semibold tracking-tight text-slate-900 focus:border-indigo-200 focus:outline-none dark:text-slate-100 dark:focus:border-indigo-500 sm:text-xl"
                    />
                    {isMultiBlock(loggingExercise.exercise) ? (
                      <div className="mt-2 space-y-1">
                        <PlanBlockChips exercise={loggingExercise.exercise} />
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                          {(() => {
                            const ex = loggingExercise.exercise;
                            const eff = resolveEffectiveTM(ex);
                            if (!eff) return 'Escribe el peso de hoy';
                            return eff.isInternal ? 'Marca guardada' : 'Vinculado a tu RM';
                          })()}
                        </p>
                      </div>
                    ) : (
                    <p className="text-indigo-600 dark:text-indigo-400 font-black text-[10px] sm:text-xs uppercase tracking-widest mt-1">
                      {loggingExercise.exercise.sets} × {loggingExercise.exercise.reps} •{' '}
                      {(() => {
                        const ex = loggingExercise.exercise;
                        const eff = resolveEffectiveTM(ex);
                        if (!eff) return 'Libre';
                        return eff.isInternal ? 'Marca guardada' : 'Vinculado a tu RM';
                      })()}
                      {exerciseRpeLabel(loggingExercise.exercise) && (
                        <span className="text-amber-600 dark:text-amber-400"> • RPE {exerciseRpeLabel(loggingExercise.exercise)}</span>
                      )}
                    </p>
                    )}
                    {loggingExercise.exercise.coachNote && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        {loggingExercise.exercise.coachNote}
                      </p>
                    )}
                  </div>
                  <button 
                    onClick={() => { setLoggingExercise(null); setLogInputDraft({}); }} 
                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <button
                    type="button"
                    onClick={() => setLogExtrasOpen(o => !o)}
                    className="text-xs font-semibold text-slate-500 hover:text-indigo-600"
                  >
                    {logExtrasOpen ? 'Ocultar nota y RPE' : 'Nota y esfuerzo (RPE)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogSetExtrasOpen(o => !o)}
                    className="ml-4 text-xs font-semibold text-slate-500 hover:text-indigo-600"
                  >
                    {logSetExtrasOpen ? 'Ocultar vídeo y borrar' : 'Vídeo y borrar'}
                  </button>
                  {logExtrasOpen && (
                    <>
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nota</label>
                    <textarea 
                      placeholder="¿Cómo te has sentido hoy?"
                      value={logs[modalLogKey]?.notes || ''}
                      onChange={(e) => onLogChange(modalLogKey, 'notes', e.target.value)}
                      className="w-full h-16 sm:h-20 px-3 py-2.5 text-sm font-medium rounded-xl border-2 border-slate-100 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 transition-all resize-none outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Esfuerzo (1–10)</label>
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
                    </>
                  )}

                  {/* Sets Logging - Minimalist Design */}
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {/* Atajo: la app ya sabe qué tocaba hacer, no hace falta teclearlo serie a serie. */}
                    {(() => {
                      const ex = loggingExercise.exercise;
                      if (!plannedSetsFor(ex).canFill) return null;
                      const { done, total } = setsLoggedCount(ex, modalLogKey);
                      const allFilled = done >= total;

                      return (
                        <button
                          type="button"
                          disabled={allFilled}
                          onClick={() => {
                            setLogInputDraft({});
                            fillExerciseFromPlan(ex, modalLogKey);
                          }}
                          className={cn(
                            'mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98]',
                            allFilled
                              ? 'cursor-default border-slate-100 text-slate-300 dark:border-slate-700 dark:text-slate-600'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                          )}
                        >
                          <CheckCircle2 size={16} />
                          {allFilled ? 'Series completas' : 'Lo hice según el plan'}
                        </button>
                      );
                    })()}
                    <div className="min-w-0 space-y-4 overflow-x-hidden overscroll-x-none">
                      {blocksFromPlanned(loggingExercise.exercise).map((block, bi, allBlocks) => {
                        const start = allBlocks.slice(0, bi).reduce((n, b) => n + b.sets, 0);
                        return (
                          <div key={`blk-${bi}`} className="space-y-2">
                            {allBlocks.length > 1 && (
                              <p className="px-0.5 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {block.sets}×{block.reps}
                                {block.weight && block.weight > 0 ? (
                                  <span className="font-semibold normal-case tracking-normal text-slate-700 dark:text-slate-200">
                                    {' '}{String(block.weight).replace('.', ',')} kg
                                  </span>
                                ) : null}
                                {block.rpe ? (
                                  <span className="text-amber-600 dark:text-amber-400"> @{block.rpe}</span>
                                ) : null}
                              </p>
                            )}
                      {Array.from({ length: block.sets }).map((_, j) => {
                        const idx = start + j;
                        const logId = modalLogKey;
                        const setLog = logs[logId]?.sets?.[idx] || { id: `${idx}`, weight: null, reps: null, completed: false };
                        const effectiveMode = (setLog.inputMode ?? 'kg') as 'kg' | 'pct';
                        const effectiveTM = resolveEffectiveTM(loggingExercise.exercise);
                        const pctForSet = planPctForSet(loggingExercise.exercise, idx);
                        const exerciseMode = loggingExercise.exercise.mode;
                        const writtenKg = plannedWeightForSet(loggingExercise.exercise, idx);
                        const hasPlanPct =
                          loggingExercise.exercise.pct != null ||
                          (loggingExercise.exercise.pctPerSet?.[idx] ?? 0) > 0 ||
                          !!plannedRpeForSet(loggingExercise.exercise, idx);
                        const targetWeight = writtenKg > 0
                          ? writtenKg
                          : effectiveTM && hasPlanPct
                            ? (exerciseMode === 'weight'
                                ? roundTo25(effectiveTM.value * (pctForSet / 100))
                                : Math.max(1, Math.round(effectiveTM.value * (pctForSet / 100))))
                            : 0;
                        const targetReps = plannedRepsForSet(loggingExercise.exercise, idx);
                        const targetRepsLabel = plannedRepsLabelForSet(loggingExercise.exercise, idx);
                        const setRpe = plannedRpeForSet(loggingExercise.exercise, idx);
                        const repsLocked = targetReps > 0 || /^amrap$/i.test(targetRepsLabel);
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
                        const plannedRepsBox = (
                          <div
                            className={cn(
                              inputClass,
                              'flex cursor-default items-center justify-center bg-slate-100 dark:bg-slate-800'
                            )}
                            title="Reps del plan; no se pueden cambiar"
                          >
                            {targetRepsLabel || targetReps}
                          </div>
                        );

                        const prevSet = idx > 0 ? logs[logId]?.sets?.[idx - 1] : undefined;
                        const canRepeatPrev =
                          !!prevSet &&
                          prevSet.reps !== null &&
                          (exerciseMode !== 'weight' || prevSet.weight !== null) &&
                          !hasData;

                        const setHasMedia = !!setLog.mediaKey;
                        const setUploading = uploadingSetKey === `${logId}-${idx}`;
                        const setActionButtons = logSetExtrasOpen ? (
                          <div className="absolute right-2 top-2 z-10 flex gap-0.5" role="group" aria-label="Acciones de la serie">
                            <button
                              type="button"
                              disabled={setUploading || (!onUploadSetMedia && !setHasMedia)}
                              onClick={() => {
                                if (setHasMedia && setLog.mediaKey) {
                                  setSetMediaViewer({
                                    title: `${loggingExercise.exercise.name} · serie ${idx + 1}`,
                                    mediaKey: setLog.mediaKey,
                                    mediaType: setLog.mediaType === 'image' ? 'image' : 'video',
                                    logId,
                                    setIdx: idx,
                                  });
                                  return;
                                }
                                pickSetMedia(logId, idx);
                              }}
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                                setHasMedia
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                                  : 'border-transparent text-slate-400 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40'
                              )}
                              title={setHasMedia ? 'Ver vídeo de esta serie' : 'Adjuntar vídeo a esta serie'}
                              aria-label={setHasMedia ? 'Ver vídeo de la serie' : 'Adjuntar vídeo'}
                            >
                              {setUploading ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
                            </button>
                            {canRepeatPrev && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSetLogChange(logId, idx, {
                                    weight: prevSet!.weight,
                                    reps: prevSet!.reps,
                                    completed: true,
                                    inputMode: prevSet!.inputMode ?? 'kg',
                                  })
                                }
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-indigo-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40"
                                title="Repetir la serie anterior"
                                aria-label="Repetir la serie anterior"
                              >
                                <CornerLeftDown size={17} />
                              </button>
                            )}
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
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSetLogChange(logId, idx, { completed: !setLog.completed })}
                            className={cn(
                              'absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2',
                              setLog.completed
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-200 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800'
                            )}
                            aria-label={setLog.completed ? 'Marcar incompleto' : 'Marcar hecho'}
                          >
                            <CheckCircle2 size={17} className={setLog.completed ? 'fill-current' : ''} />
                          </button>
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
                                    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 pr-12 sm:pr-[7.5rem]">
                                      <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 sm:text-xs">
                                        Serie {idx + 1}{setRpe ? ` · RPE ${setRpe}` : ''}
                                      </span>
                                      <div className="flex min-w-0 flex-1 justify-start sm:justify-center">
                                        <div
                                          className="inline-flex h-8 w-[6.5rem] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-[3px] shadow-inner dark:border-slate-600 dark:bg-slate-800 sm:w-[7.25rem]"
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
                                              if (raw === '') onSetLogChange(logId, idx, { weight: null });
                                              else {
                                                const pct = parseFloat(raw);
                                                if (!Number.isNaN(pct))
                                                  onSetLogChange(logId, idx, { weight: roundTo25(effectiveTM.value * (pct / 100)) });
                                              }
                                            }}
                                            onBlur={() => {
                                              const draftKey = `log-${logId}-${idx}`;
                                              const raw = pctInputDraftRef.current[draftKey];
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
                                            placeholder={targetWeight > 0 ? String(targetWeight).replace('.', ',') : ''}
                                            value={logInputDraft[`w-${logId}-${idx}`] ?? (setLog.weight && setLog.weight > 0 ? setLog.weight : '')}
                                            onChange={(e) => {
                                              const raw = e.target.value.replace(/[^\d.,]/g, '');
                                              setLogInputDraft(prev => ({ ...prev, [`w-${logId}-${idx}`]: raw }));
                                              // Se confirma ya: cerrar el modal sin quitar el foco perdía el número.
                                              const v = parseFloat(raw.replace(',', '.'));
                                              onSetLogChange(logId, idx, { weight: raw === '' ? null : Number.isFinite(v) ? v : null });
                                            }}
                                            onBlur={() => {
                                              const raw = logInputDraftRef.current[`w-${logId}-${idx}`];
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
                                        {repsLocked ? plannedRepsBox : (
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          placeholder={targetRepsLabel || (targetReps > 0 ? String(targetReps) : '')}
                                          value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                            const v = parseInt(raw, 10);
                                            onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                          }}
                                          onBlur={() => {
                                            const raw = logInputDraftRef.current[`r-${logId}-${idx}`];
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
                                    </div>
                                    <p className="mt-2 text-center text-xs font-bold leading-tight text-indigo-600 dark:text-indigo-400">
                                      {effectiveMode === 'pct'
                                        ? `= ${setLog.weight !== null ? roundTo25(setLog.weight) : '—'} kg`
                                        : setLog.weight != null && setLog.reps != null && setLog.reps > 0
                                          ? estimatedOneRmFooterKg(setLog.weight, setLog.reps)
                                          : '—'}
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <div className="mb-2 pr-12 sm:pr-[7.5rem]">
                                      <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                                        Serie {idx + 1}{setRpe ? ` · RPE ${setRpe}` : ''}
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
                                          placeholder={targetWeight > 0 ? String(targetWeight).replace('.', ',') : ''}
                                          value={logInputDraft[`w-${logId}-${idx}`] ?? (setLog.weight && setLog.weight > 0 ? setLog.weight : '')}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(/[^\d.,]/g, '');
                                            setLogInputDraft(prev => ({ ...prev, [`w-${logId}-${idx}`]: raw }));
                                            const v = parseFloat(raw.replace(',', '.'));
                                            onSetLogChange(logId, idx, { weight: raw === '' ? null : Number.isFinite(v) ? v : null });
                                          }}
                                          onBlur={() => {
                                            const raw = logInputDraftRef.current[`w-${logId}-${idx}`];
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
                                        {repsLocked ? plannedRepsBox : (
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          placeholder={targetRepsLabel || (targetReps > 0 ? String(targetReps) : '')}
                                          value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                            const v = parseInt(raw, 10);
                                            onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                          }}
                                          onBlur={() => {
                                            const raw = logInputDraftRef.current[`r-${logId}-${idx}`];
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
                                    </div>
                                    <p className="mt-2 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                      {setLog.weight != null && setLog.reps != null && setLog.reps > 0
                                        ? estimatedOneRmFooterKg(setLog.weight, setLog.reps)
                                        : '—'}
                                    </p>
                                  </>
                                )}
                              </>
                            ) : effectiveTM ? (
                              <>
                                <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 pr-12 sm:pr-[7.5rem]">
                                  <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 sm:text-xs">
                                    Serie {idx + 1}{setRpe ? ` · RPE ${setRpe}` : ''}
                                  </span>
                                  <div className="flex min-w-0 flex-1 justify-start sm:justify-center">
                                    <div
                                      className="inline-flex h-8 w-[6.5rem] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-[3px] shadow-inner dark:border-slate-600 dark:bg-slate-800 sm:w-[7.25rem]"
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
                                        if (raw === '') onSetLogChange(logId, idx, { reps: null });
                                        else {
                                          const pct = parseFloat(raw);
                                          if (!Number.isNaN(pct))
                                            onSetLogChange(logId, idx, {
                                              reps: Math.max(1, Math.round(effectiveTM.value * (pct / 100))),
                                            });
                                        }
                                      }}
                                      onBlur={() => {
                                        const draftKey = `logrep-${logId}-${idx}`;
                                        const raw = pctInputDraftRef.current[draftKey];
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
                                  ) : repsLocked ? plannedRepsBox : (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      placeholder={targetRepsLabel || (targetReps > 0 ? String(targetReps) : '')}
                                      value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                        const v = parseInt(raw, 10);
                                        onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                      }}
                                      onBlur={() => {
                                        const raw = logInputDraftRef.current[`r-${logId}-${idx}`];
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
                                <div className="mb-2 pr-12 sm:pr-[7.5rem]">
                                  <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-200">
                                    Serie {idx + 1}{setRpe ? ` · RPE ${setRpe}` : ''}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {exerciseMode === 'reps' ? 'Reps' : 'Segundos'}
                                  </span>
                                  {repsLocked ? plannedRepsBox : (
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={targetRepsLabel || (targetReps > 0 ? String(targetReps) : '')}
                                    value={logInputDraft[`r-${logId}-${idx}`] ?? (setLog.reps ?? '')}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/\D/g, '');
                                      setLogInputDraft(prev => ({ ...prev, [`r-${logId}-${idx}`]: raw }));
                                      const v = parseInt(raw, 10);
                                      onSetLogChange(logId, idx, { reps: raw === '' ? null : Number.isFinite(v) ? v : null });
                                    }}
                                    onBlur={() => {
                                      const raw = logInputDraftRef.current[`r-${logId}-${idx}`];
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
                                <p className="mt-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                  {unitLabel}
                                </p>
                              </>
                            )}
                          </div>
                        );
                      })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
        )}
      </GlassModal>

      {createPortal(
        <AnimatePresence>
          {rmListOpen && (
            <motion.div
              key="rm-list-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[999998] flex items-end justify-center sm:items-center p-0 sm:p-4 min-h-[100dvh]"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setRmListOpen(false)}
                className="fixed inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
              />
              <motion.div
                initial={SLIME_SHEET_IN}
                animate={SLIME_SHEET_SHOW}
                exit={SLIME_SHEET_OUT}
                transition={STICKY}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-sm max-h-[78vh] overflow-y-auto rounded-t-[28px] border border-white/50 bg-white/70 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl sm:rounded-[28px] dark:border-white/10 dark:bg-slate-900/65"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/40 bg-white/40 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/40">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tus RM</p>
                    <p className="text-[11px] text-slate-500">Toca uno para cambiarlo</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRmListOpen(false)}
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Cerrar"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="px-3 py-2">
                  {(!isCurrentWeekLive && tmDisplayIsHistorical) && (
                    <p className="mb-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Valores de {viewDateLabel}. Al volver a hoy verás los actuales.
                    </p>
                  )}
                  {effectiveTms.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-slate-400">
                      Aún no hay marcas. Se guardan solas al registrar un ejercicio nuevo.
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {effectiveTms.map(tm => (
                        <li key={tm.id}>
                          <button
                            type="button"
                            disabled={tmCardsReadOnly}
                            onClick={() => {
                              if (tmCardsReadOnly) return;
                              setRmListOpen(false);
                              setEditingTM(tm);
                            }}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/60 disabled:opacity-60 dark:hover:bg-white/5"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                                {tm.name}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {tm.sharedToSocial ? 'Visible para amigos' : 'Solo tú'}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block text-[15px] font-semibold tabular-nums text-slate-900 dark:text-white">
                                {tm.value}
                                <span className="ml-1 text-[11px] font-medium text-slate-400">
                                  {tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's'}
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canAddTrainingMax && !tmCardsReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setRmListOpen(false);
                        setTmModalError('');
                        setEditingTM({
                          id: NEW_TM_DRAFT_ID,
                          name: '',
                          value: 0,
                          mode: 'weight',
                          sharedToSocial: true,
                        });
                      }}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 py-2.5 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
                    >
                      <Plus size={15} />
                      Añadir RM
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
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
              className="fixed inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
            />
            <motion.div 
              initial={SLIME_SHEET_IN}
              animate={SLIME_SHEET_SHOW}
              exit={SLIME_SHEET_OUT}
              transition={STICKY}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-sm max-h-[88vh] overflow-y-auto rounded-3xl border border-white/50 bg-white/75 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70"
            >
              <div className="p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {editingTM.id === NEW_TM_DRAFT_ID ? 'Nuevo RM' : 'Editar RM'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {editingTM.id === NEW_TM_DRAFT_ID
                        ? 'Nombre y valor. Cierra para cancelar.'
                        : 'Cambia la marca y guarda'}
                    </p>
                  </div>
                  <button 
                    onClick={closeTmModal}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-white/60 dark:hover:bg-white/10"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-slate-500">Ejercicio</label>
                    <Input 
                      value={editingTM.name}
                      onChange={(e) => {
                        setTmModalError('');
                        setEditingTM({ ...editingTM, name: e.target.value });
                      }}
                      className="h-11 rounded-xl border border-white/60 bg-white/70 text-sm font-medium text-slate-900 shadow-none dark:border-white/10 dark:bg-slate-800/70 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium text-slate-500">Valor</label>
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
                        className="h-11 rounded-xl border border-white/60 bg-white/70 text-center text-lg font-semibold tabular-nums text-slate-900 shadow-none dark:border-white/10 dark:bg-slate-800/70 dark:text-white"
                      />
                    </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-slate-500">Unidad</label>
                    <select 
                      value={editingTM.mode}
                      onChange={(e) => {
                        setTmModalError('');
                        setEditingTM({ ...editingTM, mode: e.target.value as ExerciseMode });
                      }}
                      className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-white/60 bg-white/70 px-3 text-sm font-medium text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800/70 dark:text-white"
                    >
                      <option value="weight">Kilogramos (KG)</option>
                      <option value="reps">Repeticiones (REPS)</option>
                      <option value="seconds">Segundos (SEG)</option>
                    </select>
                  </div>
                  </div>

                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!!editingTM.sharedToSocial}
                    onClick={() => setEditingTM({ ...editingTM, sharedToSocial: !editingTM.sharedToSocial })}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/50 bg-white/40 px-3 py-2.5 text-left dark:border-white/10 dark:bg-slate-800/40"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg border',
                        editingTM.sharedToSocial
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white/70 text-slate-400 dark:border-slate-600 dark:bg-slate-800'
                      )}
                    >
                      <CheckCircle2 size={16} />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Compartir</span>
                      <span className="block text-[11px] text-slate-500">Aviso a amigos si bates el récord</span>
                    </span>
                  </button>
                </div>

                {tmModalError ? (
                  <p className="mt-3 text-center text-sm font-medium text-rose-600 dark:text-rose-400" role="alert">
                    {tmModalError}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-col gap-2">
                  <Button 
                    variant="primary" 
                    className="h-11 w-full rounded-xl text-sm font-semibold"
                    onClick={async () => {
                      if (editingTM.id === NEW_TM_DRAFT_ID) {
                        const name = editingTM.name.trim();
                        const v = editingTM.value;
                        if (!name) {
                          setTmModalError('Escribe un nombre para el RM.');
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
                      onUpdateTM(
                        editingTM.id,
                        {
                          name: editingTM.name,
                          value: valueToSave,
                          mode: editingTM.mode,
                          sharedToSocial: editingTM.sharedToSocial,
                        }
                      );
                      closeTmModal();
                    }}
                  >
                    {editingTM.id === NEW_TM_DRAFT_ID ? 'Crear RM' : 'Guardar'}
                  </Button>
                  {editingTM.id !== NEW_TM_DRAFT_ID ? (
                    <Button 
                      variant="outline" 
                      className="h-10 w-full rounded-xl text-sm font-medium text-rose-500 border-rose-200/70 hover:bg-rose-50/70"
                      onClick={() => {
                        onRemoveTM(editingTM.id);
                        closeTmModal();
                      }}
                    >
                      <Trash2 size={18} className="mr-2" />
                      Eliminar RM
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
                initial={SLIME_SHEET_IN}
                animate={SLIME_SHEET_SHOW}
                exit={SLIME_SHEET_OUT}
                transition={STICKY}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-md max-h-[min(88dvh,90vh)] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700"
              >
              <form
                className="p-4 sm:p-6 dark:bg-slate-900"
                onSubmit={(e) => {
                  e.preventDefault();
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">Añadir ejercicio</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setNewExModalError('');
                      setShowAddModal(false);
                    }}
                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 rounded-full transition-colors"
                    aria-label="Cerrar"
                  >
                    <X size={20} />
                  </button>
                </div>

                {(() => {
                  const q = normalizeExerciseNameKey(newExForm.name);
                  const nameHits = q.length < 2
                    ? []
                    : exerciseNameSuggestions
                        .filter((n) => {
                          const nk = normalizeExerciseNameKey(n);
                          return nk.includes(q) && nk !== q;
                        })
                        .slice(0, 5);
                  const linkedTm = effectiveTms.find((t) => t.id === newExForm.linkedTo);
                  const pctValue = newExForm.pct || 75;
                  const preview = linkedTm
                    ? (linkedTm.mode === 'weight'
                        ? `${roundTo25(linkedTm.value * (pctValue / 100))} kg`
                        : `${Math.max(1, Math.round(linkedTm.value * (pctValue / 100)))} ${linkedTm.mode === 'seconds' ? 's' : 'reps'}`)
                    : null;
                  return (
                    <div className="space-y-4">
                      <div className="relative">
                        <Input
                          ref={newExNameRef}
                          value={newExForm.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setNewExModalError('');
                            const guessed = newExTmManual ? newExForm.linkedTo : guessLinkedTmId(name, effectiveTms);
                            const tm = effectiveTms.find((t) => t.id === guessed);
                            setNewExForm((prev) => ({
                              ...prev,
                              name,
                              linkedTo: newExTmManual ? prev.linkedTo : guessed,
                              mode: newExTmManual ? prev.mode : (tm?.mode ?? prev.mode),
                            }));
                          }}
                          placeholder="Press banca, sentadilla…"
                          autoComplete="off"
                          className="h-12 text-base font-bold rounded-xl border-2 border-slate-100 focus:border-indigo-500 px-4 shadow-sm"
                        />
                        {nameHits.length > 0 && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                            {nameHits.map((n) => (
                              <button
                                key={n}
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-slate-700"
                                onClick={() => {
                                  const guessed = guessLinkedTmId(n, effectiveTms);
                                  const tm = effectiveTms.find((t) => t.id === guessed);
                                  setNewExTmManual(false);
                                  setNewExForm((prev) => ({
                                    ...prev,
                                    name: n,
                                    linkedTo: guessed,
                                    mode: tm?.mode ?? prev.mode,
                                  }));
                                }}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Series</label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={newExForm.sets === 0 ? '' : newExForm.sets}
                            placeholder="3"
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '');
                              setNewExForm({ ...newExForm, sets: raw === '' ? 0 : parseInt(raw, 10) });
                            }}
                            className="h-12 text-center text-lg font-black rounded-xl border-2 border-slate-100 focus:border-indigo-500"
                          />
                        </div>
                        <span className="mb-3 text-lg font-black text-slate-300">×</span>
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {newExForm.mode === 'seconds' ? 'Segundos' : 'Reps'}
                          </label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={newExForm.reps}
                            onChange={(e) => setNewExForm({ ...newExForm, reps: e.target.value })}
                            className="h-12 text-center text-lg font-black rounded-xl border-2 border-slate-100 focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      {linkedTm ? (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200">
                              {pctValue}% de {linkedTm.name}
                              {preview ? <span className="ml-1 font-semibold text-indigo-500">≈ {preview}</span> : null}
                            </p>
                            <button
                              type="button"
                              className="text-xs font-bold text-indigo-500 hover:text-rose-500"
                              onClick={() => {
                                setNewExTmManual(true);
                                setNewExForm((prev) => ({ ...prev, linkedTo: '' }));
                              }}
                            >
                              Quitar
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[65, 70, 75, 80, 85, 90].map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setNewExForm({ ...newExForm, pct: p })}
                                className={cn(
                                  'h-8 rounded-lg px-2.5 text-xs font-black',
                                  newExForm.pct === p
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white text-slate-500 hover:bg-indigo-100 dark:bg-slate-800 dark:text-slate-300',
                                )}
                              >
                                {p}%
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : effectiveTms.length > 0 ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => setNewExTmOpen((v) => !v)}
                            className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left text-sm font-semibold text-slate-500 hover:text-indigo-600"
                          >
                            <span>Usar % de un TM</span>
                            <ChevronDown size={16} className={cn('transition-transform', newExTmOpen && 'rotate-180')} />
                          </button>
                          {newExTmOpen && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {effectiveTms.map((tm) => (
                                <button
                                  key={tm.id}
                                  type="button"
                                  onClick={() => {
                                    setNewExTmManual(true);
                                    setNewExForm((prev) => ({
                                      ...prev,
                                      linkedTo: tm.id,
                                      name: prev.name.trim() ? prev.name : tm.name,
                                      mode: tm.mode,
                                    }));
                                  }}
                                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  {tm.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setNewExMoreOpen((v) => !v)}
                        className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
                      >
                        <ChevronDown size={14} className={cn('transition-transform', newExMoreOpen && 'rotate-180')} />
                        {newExForm.mode === 'weight' ? 'Más opciones' : `Objetivo: ${newExForm.mode === 'seconds' ? 'tiempo' : 'reps'}`}
                      </button>
                      {newExMoreOpen && (
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'weight', label: 'Peso', icon: Gauge },
                            { id: 'reps', label: 'Reps', icon: CheckCircle2 },
                            { id: 'seconds', label: 'Tiempo', icon: Clock },
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              disabled={!!newExForm.linkedTo}
                              onClick={() => setNewExForm({ ...newExForm, mode: m.id as ExerciseMode })}
                              className={cn(
                                'flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-[10px] font-black uppercase',
                                newExForm.mode === m.id
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-transparent bg-slate-50 text-slate-400 dark:bg-slate-800',
                                newExForm.linkedTo && 'cursor-not-allowed opacity-50',
                              )}
                            >
                              <m.icon size={16} />
                              {m.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {newExModalError ? (
                  <p className="mt-3 text-center text-sm font-bold text-rose-600 dark:text-rose-400" role="alert">
                    {newExModalError}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  variant="primary"
                  className="mt-5 h-12 w-full rounded-xl bg-indigo-600 text-sm font-black tracking-wide hover:bg-indigo-700"
                >
                  Añadir
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
      )}

      <input
        ref={setMediaInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleSetMediaPicked(file);
        }}
      />

      {setMediaViewer && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100002] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4"
          onClick={() => setSetMediaViewer(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{setMediaViewer.title}</p>
              <button
                type="button"
                onClick={() => setSetMediaViewer(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            {setMediaViewer.mediaType === 'image' ? (
              <img src={mediaUrl(setMediaViewer.mediaKey)} alt="" className="max-h-[70vh] w-full rounded-2xl object-contain" />
            ) : (
              <video
                src={mediaUrl(setMediaViewer.mediaKey)}
                controls
                playsInline
                className="max-h-[70vh] w-full rounded-2xl bg-black"
              />
            )}
            <div className="mt-3 flex gap-2">
              {onUploadSetMedia && (
                <button
                  type="button"
                  onClick={() => {
                    const { logId, setIdx } = setMediaViewer;
                    setSetMediaViewer(null);
                    pickSetMedia(logId, setIdx);
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-[11px] font-black uppercase text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  Cambiar
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onSetLogChange(setMediaViewer.logId, setMediaViewer.setIdx, { mediaKey: null, mediaType: null });
                  setSetMediaViewer(null);
                }}
                className="flex-1 rounded-xl border border-rose-200 py-2 text-[11px] font-black uppercase text-rose-600 dark:border-rose-900"
              >
                Quitar
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Queda en esta serie. Al entrenador se lo puedes mandar también por el chat.
            </p>
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
};
