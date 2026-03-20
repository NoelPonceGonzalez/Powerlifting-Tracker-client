import React, { useState, useEffect, useRef } from 'react';
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
  Lightbulb
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { RMData, LogEntry, TrainingMax, TrainingWeek, PlannedExercise, ExerciseMode, DayType, SetLog } from '@/src/types';
import { cn } from '@/src/lib/utils';

/** E1RM estimado (Epley): peso × (1 + reps/30). Para reps=1 devuelve el peso. */
function estimateE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

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
  onToggleSameTemplateAllWeeks?: () => void;
  trainingMaxes: TrainingMax[];
  weeks: TrainingWeek[];
  logs: Record<string, LogEntry>;
  viewAsOfWeek?: number | null;
  currentWeekOfYear?: number;
  onViewAsOfWeekChange?: (week: number | null) => void;
  isHistoryMode?: boolean;
  versionWeeks?: number[];
  onUpdateTM: (id: string, updates: Partial<TrainingMax>) => void;
  onAddTM: () => void;
  onRemoveTM: (id: string) => void;
  onAddExercise: (weekId: string, dayId: string, initialValues?: Partial<PlannedExercise>) => void;
  onRemoveExercise: (weekId: string, dayId: string, exerciseId: string) => void;
  onUpdateExercise: (weekId: string, dayId: string, exerciseId: string, updates: Partial<PlannedExercise>) => void;
  onUpdateDayType: (weekId: string, dayId: string, type: DayType) => void;
  onLogChange: (id: string, field: keyof LogEntry, value: any) => void;
  onSetLogChange: (logId: string, setIdx: number, updates: Partial<SetLog>) => void;
  onMarkCompleted: (logId: string, completed: boolean) => void;
  onOpenRoutineManager: () => void;
  onExport: () => void;
  onNextCycle: () => void;
}

export const TrainingPlanView: React.FC<TrainingPlanViewProps> = ({ 
  activeRoutineName,
  sameTemplateAllWeeks = true,
  onToggleSameTemplateAllWeeks,
  trainingMaxes, 
  weeks,
  logs,
  viewAsOfWeek = null,
  currentWeekOfYear = 1,
  onViewAsOfWeekChange,
  isHistoryMode = false,
  versionWeeks = [], 
  onUpdateTM,
  onAddTM,
  onRemoveTM,
  onAddExercise,
  onRemoveExercise,
  onUpdateExercise,
  onUpdateDayType,
  onLogChange, 
  onSetLogChange,
  onMarkCompleted,
  onOpenRoutineManager,
  onExport, 
  onNextCycle
}) => {
  const displayWeekNum = viewAsOfWeek ?? currentWeekOfYear;
  const initialWeekIdx = Math.max(0, Math.min((weeks?.length || 52) - 1, displayWeekNum - 1));
  // Lunes=0 .. Domingo=6; getDay(): 0=Dom, 1=Lun, ...
  const todayDayIdx = (new Date().getDay() + 6) % 7;
  const [activeWeekIdx, setActiveWeekIdx] = useState(initialWeekIdx);
  const [activeDayIdx, setActiveDayIdx] = useState(Math.min(todayDayIdx, 6));
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [showDayTypeDropdown, setShowDayTypeDropdown] = useState(false);
  
  // Add Exercise Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTM, setEditingTM] = useState<TrainingMax | null>(null);
  const [loggingExercise, setLoggingExercise] = useState<{ weekId: string, dayId: string, exercise: PlannedExercise } | null>(null);
  const [weightInputMode, setWeightInputMode] = useState<Record<string, 'pct' | 'kg'>>({});
  const clearWeightInputMode = () => setWeightInputMode({});

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
    const year = new Date().getFullYear();
    const jan1 = new Date(year, 0, 1);
    const target = new Date(jan1);
    target.setDate(jan1.getDate() + (weekNum - 1) * 7);
    return target;
  };
  const getMonthForWeek = (weekNum: number): string => months[getDateForWeekOfYear(weekNum).getMonth()];
  const getWeekOfMonth = (weekNum: number): number => {
    const d = getDateForWeekOfYear(weekNum);
    return Math.ceil(d.getDate() / 7);
  };
  const currentWeek = weeks[activeWeekIdx];
  const currentDay = currentWeek?.days[activeDayIdx];
  const currentMonth = getMonthForWeek(displayWeekNum);
  const weekOfMonth = getWeekOfMonth(currentWeek?.number ?? displayWeekNum);

  useEffect(() => {
    const targetIdx = Math.max(0, Math.min(weeks.length - 1, displayWeekNum - 1));
    setActiveWeekIdx(targetIdx);
  }, [displayWeekNum, weeks.length]);

  const roundTo25 = (num: number) => Math.round(num / 2.5) * 2.5;
  const normalizeText = (v?: string) => (v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const resolveLinkedTM = (exercise: PlannedExercise): TrainingMax | undefined => {
    if (!exercise.linkedTo) return undefined;
    const byId = trainingMaxes.find(tm => tm.id === exercise.linkedTo);
    if (byId) return byId;
    // Compat: algunas rutinas antiguas guardaban linkedTo como linkedExercise (bench/squat/deadlift)
    const byLinkedExercise = trainingMaxes.find(tm => tm.linkedExercise === (exercise.linkedTo as keyof RMData));
    if (byLinkedExercise) return byLinkedExercise;
    // Compat: vinculación por nombre (sin hardcode), usando datos reales de la DB del usuario
    const byName = trainingMaxes.find(tm =>
      normalizeText(tm.name) === normalizeText(exercise.linkedTo) ||
      normalizeText(tm.name) === normalizeText(exercise.name)
    );
    if (byName) return byName;
    return undefined;
  };

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
    const linkedTM = resolveLinkedTM(exercise);
    if (linkedTM && exercise.mode === 'weight') {
      const targetPct = linkedTM.value > 0 ? (targetWeight / linkedTM.value) * 100 : 0;
      const actualPct = setLog.weight != null && linkedTM.value > 0 ? (setLog.weight / linkedTM.value) * 100 : null;
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
              {onToggleSameTemplateAllWeeks && (
                <button
                  onClick={onToggleSameTemplateAllWeeks}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border-2 shrink-0 ml-2",
                  sameTemplateAllWeeks
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-500"
                )}
                title={sameTemplateAllWeeks ? "Mes: mismo contenido todas las semanas" : "Sem: ciclo 4 semanas (1,2,3,4)"}
              >
                <span className={cn(
                  "w-9 h-5 rounded-full flex items-center p-0.5 transition-colors",
                  sameTemplateAllWeeks ? "bg-white/30 justify-end" : "bg-slate-300 dark:bg-slate-600 justify-start"
                )}>
                  <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                </span>
                {sameTemplateAllWeeks ? "Mes" : "Sem"}
              </button>
            )}
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
          <Button variant="outline" size="sm" onClick={onAddTM} className="rounded-xl border-2 text-xs px-3 py-1.5 shadow-md shadow-slate-200/50 dark:shadow-none">
            <Plus size={14} className="mr-1 sm:mr-2" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest hidden sm:inline">Añadir TM</span>
            <span className="text-[9px] font-black uppercase tracking-widest sm:hidden">+</span>
          </Button>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {trainingMaxes.map(tm => (
            <Card 
              key={tm.id} 
              padding="md" 
              rounded="xl" 
              className="border-2 border-slate-100 relative group cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all active:scale-[0.98]"
              onClick={() => setEditingTM(tm)}
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
                Semana {weekOfMonth} {viewMode === 'daily' && <span className="hidden sm:inline">— {currentDay.name}</span>}
              </h2>
              {viewMode === 'daily' && (
                <span className="text-sm sm:hidden text-slate-500 font-medium">{currentDay.name}</span>
              )}
              {!isHistoryMode && (
                <p className="mt-1 text-[10px] sm:text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {sameTemplateAllWeeks
                    ? "Los cambios se aplican a todas las semanas futuras."
                    : `Los cambios se aplican a futuras semanas tipo ${weekOfMonth} (1-4).`}
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
                          const year = new Date().getFullYear();
                          const jan1 = new Date(year, 0, 1);
                          const firstDayOfMonth = new Date(year, idx, 1);
                          const dayOfYear = Math.floor((firstDayOfMonth.getTime() - jan1.getTime()) / 86400000);
                          const targetWeekNum = Math.min(52, Math.max(1, Math.floor(dayOfYear / 7) + 1));
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
                      {currentDay.exercises.some(e => e.linkedTo) && <div className="col-span-2 text-center">% RM</div>}
                      <div className={cn("text-center", currentDay.exercises.some(e => e.linkedTo) ? "col-span-3" : "col-span-5")}>Peso / Reps / Tiempo</div>
                      <div className="col-span-1 text-center">Acción</div>
                    </div>

                    {/* Ejercicios */}
                    <div className="space-y-3">
                      {currentDay.exercises.map((ex) => {
                        const logId = `${currentWeek.id}-${currentDay.id}-${ex.id}`;
                        const log = logs[logId] || { rpe: '', notes: '', completed: false, sets: [] };
                        const linkedTM = resolveLinkedTM(ex);
                        
                        const getPctForSet = (idx: number) => ex.pctPerSet?.[idx] ?? ex.pct ?? 75;
                        const getWeightForSet = (idx: number) => linkedTM ? roundTo25(linkedTM.value * (getPctForSet(idx) / 100)) : (ex.weight || 0);
                        const targetWeight = linkedTM ? getWeightForSet(0) : (ex.weight || 0); // para compat
                        const updatePctForSet = (setIdx: number, newPct: number) => {
                          const n = Math.max(ex.sets || 1, 1);
                          const base = ex.pct ?? 75;
                          const arr = (ex.pctPerSet ?? Array(n).fill(base)).slice(0, n);
                          while (arr.length < n) arr.push(base);
                          arr[setIdx] = newPct;
                          onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { pctPerSet: arr, pct: arr[0] });
                        };
                        const updateWeightForSet = (setIdx: number, newWeight: number) => {
                          if (!linkedTM) return;
                          const newPct = Math.round((newWeight / linkedTM.value) * 100);
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
                                    {linkedTM && (
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider inline-block bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                                        {linkedTM.name}
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
                                      type="number"
                                      min="1"
                                      value={ex.sets || ''}
                                      onChange={(e) => {
                                        const newSets = parseInt(e.target.value) || 1;
                                        const base = ex.pct ?? 75;
                                        let newPctPerSet = ex.pctPerSet;
                                        if (ex.linkedTo && newPctPerSet) {
                                          if (newSets < newPctPerSet.length) newPctPerSet = newPctPerSet.slice(0, newSets);
                                          else if (newSets > newPctPerSet.length) newPctPerSet = [...newPctPerSet, ...Array(newSets - newPctPerSet.length).fill(newPctPerSet[newPctPerSet.length - 1] ?? base)];
                                        } else if (ex.linkedTo) newPctPerSet = Array(newSets).fill(base);
                                        onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { sets: newSets, ...(newPctPerSet && { pctPerSet: newPctPerSet }) });
                                      }}
                                      className="w-16 text-center font-black text-xl bg-transparent focus:outline-none text-slate-900 dark:text-slate-100"
                                      placeholder="3"
                                    />
                                    <span className="text-xl font-black text-slate-400 mx-3">×</span>
                                    <input 
                                      type="text"
                                      inputMode="numeric"
                                      value={ex.reps || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { reps: val });
                                      }}
                                      className="w-24 text-center font-black text-xl bg-transparent focus:outline-none text-slate-900 dark:text-slate-100"
                                      placeholder="10"
                                    />
                                  </div>
                                </div>

                                {/* Objetivo: solo Peso (kg) si NO está vinculado a TM; reps/segundos se editan en Series×Reps */}
                                {ex.mode === 'weight' && !(ex.linkedTo && linkedTM) && (
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block text-center">Peso</label>
                                    <div className="flex items-center rounded-xl px-4 py-3.5 w-full justify-between shadow-lg transition-all bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-950/50 dark:shadow-lg">
                                      <input 
                                        type="number"
                                        step="0.5"
                                        value={ex.weight || ''}
                                        onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { weight: parseFloat(e.target.value) || 0 })}
                                        className="flex-1 text-center font-black text-white bg-transparent focus:outline-none text-xl min-w-0"
                                      />
                                      <span className="text-sm font-black opacity-90 ml-2 flex-shrink-0">KG</span>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Mostrar info de vinculación si existe */}
                                {ex.linkedTo && linkedTM && (
                                  <div className="text-center pt-1">
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-full inline-block">
                                      🔗 {linkedTM.name} ({linkedTM.value}{linkedTM.mode === 'weight' ? 'kg' : linkedTM.mode === 'reps' ? 'reps' : 's'})
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
                                  {linkedTM && (
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-0.5">{linkedTM.name}</span>
                                  )}
                                </div>
                              </div>

                              {/* Sets x Reps */}
                                <div className="col-span-2 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 shadow-sm dark:shadow-md dark:shadow-slate-900/50 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-all">
                                  <input 
                                    type="number"
                                    value={ex.sets}
                                    onChange={(e) => {
                                      const newSets = parseInt(e.target.value) || 1;
                                      const base = ex.pct ?? 75;
                                      let newPctPerSet = ex.pctPerSet;
                                      if (ex.linkedTo && newPctPerSet) {
                                        if (newSets < newPctPerSet.length) newPctPerSet = newPctPerSet.slice(0, newSets);
                                        else if (newSets > newPctPerSet.length) newPctPerSet = [...newPctPerSet, ...Array(newSets - newPctPerSet.length).fill(newPctPerSet[newPctPerSet.length - 1] ?? base)];
                                      } else if (ex.linkedTo) newPctPerSet = Array(newSets).fill(base);
                                      onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { sets: newSets, ...(newPctPerSet && { pctPerSet: newPctPerSet }) });
                                    }}
                                      className="w-10 text-center font-black text-sm bg-transparent focus:outline-none text-slate-900 dark:text-slate-100"
                                  />
                                    <span className="text-sm font-black text-slate-400 mx-2">×</span>
                                  <input 
                                    value={ex.reps}
                                    onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { reps: e.target.value })}
                                      className="w-12 text-center font-black text-sm bg-transparent focus:outline-none text-slate-900 dark:text-slate-100"
                                  />
                                </div>
                              </div>

                              {/* % RM + Peso por serie (si vinculado) o solo Peso/Reps */}
                                {ex.linkedTo && linkedTM && ex.mode === 'weight' ? (
                                <div className="col-span-5 flex flex-wrap justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  {Array.from({ length: Math.max(ex.sets || 1, 1) }).map((_, idx) => (
                                    <div key={idx} className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg px-2 py-1.5 border border-indigo-200 dark:border-indigo-800">
                                      <input type="number" min="0" max="100" value={getPctForSet(idx)} onChange={(e) => updatePctForSet(idx, parseFloat(e.target.value) || 0)} className="w-9 bg-transparent text-center font-black text-indigo-700 dark:text-indigo-300 text-xs focus:outline-none" />
                                      <span className="text-[10px] opacity-80">%</span>
                                      <input type="number" step="0.5" value={getWeightForSet(idx)} onChange={(e) => updateWeightForSet(idx, parseFloat(e.target.value) || 0)} className="w-12 bg-indigo-600 dark:bg-indigo-700 text-white text-center font-black text-xs rounded focus:outline-none" />
                                      <span className="text-[10px] opacity-80">kg</span>
                                    </div>
                                  ))}
                                </div>
                                ) : ex.mode === 'weight' ? (
                                <div className={cn(ex.linkedTo ? "col-span-3" : "col-span-5", "flex justify-center")} onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center rounded-xl px-4 py-3 w-full max-w-[140px] justify-between shadow-lg transition-all bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-950/50 dark:shadow-lg">
                                  <input 
                                    type="number"
                                    value={ex.weight || ''}
                                    onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { weight: parseFloat(e.target.value) || 0 })}
                                    className="w-full text-center font-black text-white bg-transparent focus:outline-none text-base"
                                  />
                                  <span className="text-xs font-black opacity-90 ml-2">KG</span>
                                </div>
                              </div>
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

      <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Button variant="outline" className="flex-1 w-full sm:w-auto" onClick={onExport}>
          <Download size={18} />
          <span className="text-sm sm:text-base">Exportar</span>
        </Button>
        <Button variant="primary" className="flex-1 w-full sm:w-auto" onClick={onNextCycle}>
          <span className="text-sm sm:text-base">Siguiente Ciclo</span>
        </Button>
      </div>

      {loggingExercise && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div 
            className="fixed inset-0 flex items-center justify-center p-4 min-h-[100dvh]"
            style={{ zIndex: 100000 }}
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setLoggingExercise(null); clearWeightInputMode(); }}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative flex flex-col bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90dvh] sm:max-h-[92vh] rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 flex-shrink-0 overflow-hidden mx-2 sm:mx-4"
            >
              <div className="p-4 sm:p-6 md:p-10 flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-contain overflow-x-hidden">
                <div className="flex items-center justify-between mb-6 sm:mb-8">
                  <div className="flex-1 mr-4">
                    <input 
                      value={loggingExercise.exercise.name}
                      onChange={(e) => onUpdateExercise(loggingExercise.weekId, loggingExercise.dayId, loggingExercise.exercise.id, { name: e.target.value })}
                      className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight bg-transparent focus:outline-none w-full border-b-2 border-transparent focus:border-indigo-200 dark:focus:border-indigo-500"
                    />
                    <p className="text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-widest mt-1">
                      {loggingExercise.exercise.sets} × {loggingExercise.exercise.reps} • {loggingExercise.exercise.linkedTo ? 'Objetivo vinculado' : 'Libre'}
                    </p>
                  </div>
                  <button 
                    onClick={() => { setLoggingExercise(null); clearWeightInputMode(); }} 
                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Quick Notes */}
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Nota Rápida / Sensaciones</label>
                    <textarea 
                      placeholder="¿Cómo te has sentido hoy?"
                      value={logs[`${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`]?.notes || ''}
                      onChange={(e) => onLogChange(`${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`, 'notes', e.target.value)}
                      className="w-full h-24 p-6 text-sm font-bold rounded-3xl border-2 border-slate-100 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-700 transition-all resize-none outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>

                  {/* RPE */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-[0.2em]">RPE</label>
                    <div className={cn(
                      "flex items-center border-2 rounded-xl px-3 py-2 shadow-sm transition-all",
                      getRPEColor(logs[`${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`]?.rpe || '')
                    )}>
                      <Gauge size={14} className="mr-2 opacity-80 shrink-0" />
                      <input 
                        placeholder="8, 8.5, 9…" 
                        value={logs[`${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`]?.rpe || ''}
                        onChange={(e) => onLogChange(`${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`, 'rpe', e.target.value)}
                        className="flex-1 text-center font-bold text-sm bg-transparent focus:outline-none min-w-0 w-16"
                      />
                    </div>
                  </div>

                  {/* Sets Logging - Minimalist Design */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="space-y-2 overflow-x-hidden overscroll-contain">
                      {Array.from({ length: loggingExercise.exercise.sets }).map((_, idx) => {
                        const logId = `${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`;
                        const setLog = logs[logId]?.sets?.[idx] || { id: `${idx}`, weight: null, reps: null, completed: false };
                        const linkedTM = resolveLinkedTM(loggingExercise.exercise);
                        const pctForSet = loggingExercise.exercise.pctPerSet?.[idx] ?? loggingExercise.exercise.pct ?? 75;
                        const targetWeight = linkedTM ? roundTo25(linkedTM.value * (pctForSet / 100)) : (loggingExercise.exercise.weight || 0);
                        const targetReps = parseInt(loggingExercise.exercise.reps.toString()) || 0;
                        const exerciseMode = loggingExercise.exercise.mode;
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

                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex flex-wrap items-center gap-2 sm:gap-3 p-3 rounded-xl border transition-all",
                              rowColors
                            )}
                          >
                            {/* Para TM: toggle % o kg + input editable + valor calculado */}
                            {exerciseMode === 'weight' ? (
                              <>
                              {linkedTM ? (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">S{idx + 1}</span>
                                    <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 p-0.5">
                                      <button
                                        type="button"
                                        onClick={() => setWeightInputMode(m => ({ ...m, [`${logId}-${idx}`]: 'pct' }))}
                                        className={cn(
                                          "px-2 py-1 text-[10px] font-black transition-colors",
                                          (weightInputMode[`${logId}-${idx}`] ?? 'kg') === 'pct'
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-500 dark:text-slate-400"
                                        )}
                                      >
                                        %
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setWeightInputMode(m => ({ ...m, [`${logId}-${idx}`]: 'kg' }))}
                                        className={cn(
                                          "px-2 py-1 text-[10px] font-black transition-colors",
                                          (weightInputMode[`${logId}-${idx}`] ?? 'kg') === 'kg'
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-500 dark:text-slate-400"
                                        )}
                                      >
                                        kg
                                      </button>
                                    </div>
                                  </div>
                                  {(weightInputMode[`${logId}-${idx}`] ?? 'kg') === 'pct' ? (
                                    <>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        placeholder={pctForSet.toString()}
                                        value={setLog.weight !== null ? Math.round((setLog.weight / linkedTM.value) * 100).toString() : ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === '') onSetLogChange(logId, idx, { weight: null });
                                          else {
                                            const pct = parseFloat(val);
                                            if (!Number.isNaN(pct)) onSetLogChange(logId, idx, { weight: roundTo25(linkedTM.value * (pct / 100)) });
                                          }
                                        }}
                                        className="flex-1 min-w-0 px-3 py-2 text-center font-black text-base bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                      />
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                        = {setLog.weight !== null ? roundTo25(setLog.weight) : '—'} kg
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <input
                                        type="number"
                                        step="0.5"
                                        placeholder={targetWeight.toString()}
                                        value={setLog.weight ?? ''}
                                        onChange={(e) => onSetLogChange(logId, idx, { weight: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                        className="flex-1 min-w-0 px-3 py-2 text-center font-black text-base bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                      />
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                        {setLog.weight != null && setLog.reps != null && setLog.reps > 0
                                          ? `= ${estimateE1RM(setLog.weight, setLog.reps)} kg`
                                          : setLog.weight !== null && linkedTM
                                            ? `= ${Math.round((setLog.weight / linkedTM.value) * 100)}%`
                                            : '= —'}
                                      </span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <input 
                                    type="number"
                                    step="0.5"
                                    placeholder={(loggingExercise.exercise.weight || 0).toString()}
                                    value={setLog.weight ?? ''}
                                    onChange={(e) => onSetLogChange(logId, idx, { weight: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                    className="flex-1 min-w-0 px-3 py-2 text-center font-black text-base bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 text-slate-900 dark:text-slate-100"
                                  />
                                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                    {setLog.weight != null && setLog.reps != null && setLog.reps > 0
                                      ? `= ${estimateE1RM(setLog.weight, setLog.reps)} kg`
                                      : '= — kg'}
                                  </span>
                                </>
                              )}
                              <input 
                                type="number"
                                placeholder={targetReps.toString()}
                                value={setLog.reps ?? ''}
                                onChange={(e) => onSetLogChange(logId, idx, { reps: e.target.value === '' ? null : parseInt(e.target.value) })}
                                className="flex-1 min-w-0 px-3 py-2 text-center font-black text-base bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 text-slate-900 dark:text-slate-100"
                              />
                              <span className="text-xs font-bold text-slate-400 flex-shrink-0">reps</span>
                              </>
                            ) : (
                              <>
                                <input 
                                  type="number"
                                  step="0.5"
                                  placeholder={targetReps.toString()}
                                  value={setLog.reps ?? ''}
                                  onChange={(e) => onSetLogChange(logId, idx, { reps: e.target.value === '' ? null : parseInt(e.target.value) })}
                                  className="flex-1 min-w-0 px-3 py-2 text-center font-black text-base bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 text-slate-900 dark:text-slate-100"
                                />
                                <span className="text-xs font-bold text-slate-400 flex-shrink-0">{unitLabel.toLowerCase()}</span>
                              </>
                            )}
                            
                            {/* Check + Borrar */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => onSetLogChange(logId, idx, { weight: null, reps: null, completed: false })}
                                className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                  hasData
                                    ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                    : "text-slate-300 dark:text-slate-600 cursor-default"
                                )}
                                title="Borrar datos de la serie"
                                aria-label="Borrar serie"
                                disabled={!hasData}
                              >
                                <Trash2 size={16} />
                              </button>
                              <button
                                onClick={() => onSetLogChange(logId, idx, { completed: !setLog.completed })}
                                className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                  setLog.completed 
                                    ? "bg-emerald-600 text-white" 
                                    : "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-emerald-300 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400"
                                )}
                              >
                                <CheckCircle2 size={16} className={setLog.completed ? "fill-current" : ""} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3">
                  {!isHistoryMode && (
                    <Button
                      variant="outline"
                      className="w-full h-14 sm:h-16 rounded-2xl sm:rounded-3xl font-black uppercase tracking-widest text-rose-600 border-2 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-950/30"
                      onClick={() => {
                        onRemoveExercise(loggingExercise.weekId, loggingExercise.dayId, loggingExercise.exercise.id);
                        setLoggingExercise(null);
                        clearWeightInputMode();
                      }}
                    >
                      <Trash2 size={16} className="mr-2" />
                      Eliminar ejercicio
                    </Button>
                  )}
                  <Button 
                    variant="primary" 
                    className="w-full h-14 sm:h-16 rounded-2xl sm:rounded-3xl font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100"
                    onClick={() => { setLoggingExercise(null); clearWeightInputMode(); }}
                  >
                    Guardar sesión
                  </Button>
                </div>
              </div>
            </motion.div>
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
              onClick={() => setEditingTM(null)}
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
                      <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Editar TM</h3>
                      <p className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Ajusta tus marcas máximas</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setEditingTM(null)}
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
                      onChange={(e) => setEditingTM({ ...editingTM, name: e.target.value })}
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
                          setEditingTM({ ...editingTM, value: Number.isNaN(v) || v < 1 ? 0 : v });
                        }}
                        className="h-16 text-2xl font-black text-center rounded-3xl border-2 border-slate-100 dark:border-slate-600 focus:border-indigo-500 shadow-md shadow-slate-200/60 dark:shadow-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Unidad</label>
                    <select 
                      value={editingTM.mode}
                      onChange={(e) => setEditingTM({ ...editingTM, mode: e.target.value as ExerciseMode })}
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

                <div className="flex flex-col gap-3 mt-10">
                  <Button 
                    variant="primary" 
                    className="w-full h-16 rounded-3xl font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
                    onClick={() => {
                      const valueToSave = editingTM.value === 0 ? 50 : editingTM.value;
                      onUpdateTM(editingTM.id, { 
                        name: editingTM.name, 
                        value: valueToSave, 
                        mode: editingTM.mode,
                        sharedToSocial: editingTM.sharedToSocial 
                      });
                      setEditingTM(null);
                    }}
                  >
                    Guardar Cambios
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full h-16 rounded-3xl font-black uppercase tracking-widest text-rose-500 border-2 border-rose-100 hover:bg-rose-50 hover:border-rose-200"
                    onClick={() => {
                      onRemoveTM(editingTM.id);
                      setEditingTM(null);
                    }}
                  >
                    <Trash2 size={18} className="mr-2" />
                    Eliminar TM
                  </Button>
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
                onClick={() => setShowAddModal(false)}
                className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-700"
              >
              <div className="p-6 sm:p-10 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Añadir Objetivo</h3>
                  <button 
                    onClick={() => setShowAddModal(false)} 
                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-8">
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Nombre del Ejercicio *</label>
                    <Input 
                      value={newExForm.name}
                      onChange={(e) => setNewExForm({ ...newExForm, name: e.target.value })}
                      placeholder="Ej: Press banca"
                      className="h-16 text-lg font-black rounded-3xl border-2 border-slate-100 focus:border-indigo-500 px-6 shadow-sm transition-all"
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
                      {trainingMaxes.map(tm => (
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

                  <div className={cn("grid gap-6", newExForm.mode === 'seconds' ? "grid-cols-2" : "grid-cols-2")}>
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Sets *</label>
                      <Input 
                        type="number"
                        value={newExForm.sets || ''}
                        placeholder="3"
                        min={1}
                        onChange={(e) => setNewExForm({ ...newExForm, sets: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="h-16 text-xl font-black text-center rounded-3xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                      />
                    </div>
                    {newExForm.mode === 'seconds' ? (
                      <div>
                        <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Segundos *</label>
                        <Input 
                          type="number"
                          value={newExForm.reps}
                          onChange={(e) => setNewExForm({ ...newExForm, reps: e.target.value })}
                          className="h-16 text-xl font-black text-center rounded-3xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Reps *</label>
                        <Input 
                          value={newExForm.reps}
                          onChange={(e) => setNewExForm({ ...newExForm, reps: e.target.value })}
                          className="h-16 text-xl font-black text-center rounded-3xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                        />
                      </div>
                    )}
                  </div>

                </div>

                <div className="mt-8 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
                  <Lightbulb size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold text-amber-800 dark:text-amber-200">¿Quieres competir?</p>
                    <p className="text-amber-700 dark:text-amber-300 mt-1">Crea un torneo con este ejercicio en <span className="font-black">Comunidad → Torneos</span> y compite con tus amigos. Verás quién mejora más semana a semana.</p>
                  </div>
                </div>

                <div className="flex gap-4 mt-12">
                  <Button 
                    variant="outline" 
                    className="flex-1 h-16 rounded-3xl font-black uppercase tracking-widest text-slate-400 border-2 border-slate-100 hover:bg-slate-50"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    variant="primary" 
                    className="flex-1 h-16 rounded-3xl font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
                    onClick={() => {
                      const sets = newExForm.sets || 3;
                      const pct = newExForm.linkedTo ? (newExForm.pct || 75) : undefined;
                      onAddExercise(currentWeek.id, currentDay.id, {
                        name: newExForm.name,
                        linkedTo: newExForm.linkedTo || undefined,
                        pct,
                        pctPerSet: pct ? Array(sets).fill(pct) : undefined,
                        sets,
                        reps: newExForm.reps,
                        mode: newExForm.mode
                      });
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
