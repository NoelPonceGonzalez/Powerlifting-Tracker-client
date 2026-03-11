import React, { useState } from 'react';
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
  History
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { RMData, LogEntry, TrainingMax, TrainingWeek, PlannedExercise, ExerciseMode, DayType, SetLog } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface DayTypeBadgeProps {
  key?: any;
  type: DayType;
  onClick?: () => void;
}

const DayTypeBadge = ({ type, onClick }: DayTypeBadgeProps) => {
  const config = {
    workout: { label: 'Entrenamiento', color: 'bg-indigo-100 text-indigo-600' },
    rest: { label: 'Descanso', color: 'bg-slate-100 text-slate-500' },
    deload: { label: 'Descarga', color: 'bg-amber-100 text-amber-600' }
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
  trainingMaxes: TrainingMax[];
  weeks: TrainingWeek[];
  logs: Record<string, LogEntry>;
  viewAsOfWeek?: number | null;
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
  onSavePeriod: () => void;
}

export const TrainingPlanView: React.FC<TrainingPlanViewProps> = ({ 
  activeRoutineName,
  trainingMaxes, 
  weeks,
  logs,
  viewAsOfWeek = null,
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
  onNextCycle,
  onSavePeriod
}) => {
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [showDayTypeDropdown, setShowDayTypeDropdown] = useState(false);
  
  // Add Exercise Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTM, setEditingTM] = useState<TrainingMax | null>(null);
  const [loggingExercise, setLoggingExercise] = useState<{ weekId: string, dayId: string, exercise: PlannedExercise } | null>(null);
  const [newExForm, setNewExForm] = useState({
    name: '',
    linkedTo: '',
    pct: 75,
    sets: 3,
    reps: '5',
    mode: 'weight' as ExerciseMode
  });

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  // Mock month calculation: assume Week 1 starts in January
  const currentMonthIdx = (Math.floor(activeWeekIdx / 4)) % 12;
  const currentMonth = months[currentMonthIdx];

  const currentWeek = weeks[activeWeekIdx];
  const currentDay = currentWeek?.days[activeDayIdx];

  const roundTo25 = (num: number) => Math.round(num / 2.5) * 2.5;

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

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pb-32"
    >
      <header className="mb-6 sm:mb-10 flex flex-col gap-4">
        <div>
          <button
            onClick={onOpenRoutineManager}
            className="w-full sm:w-auto text-left group"
          >
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-indigo-500 block mb-1">
              Rutina activa
            </span>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                {activeRoutineName}
              </h1>
              <ChevronRight className="text-slate-400 group-hover:text-indigo-600 transition-colors" size={20} />
            </div>
          </button>
          <p className="text-sm sm:text-base text-slate-500 font-medium">Toca el nombre para gestionar tus rutinas</p>
        </div>

        {/* Viaje en el tiempo: ver rutina y progreso como en una semana pasada */}
        {versionWeeks.length > 1 && onViewAsOfWeekChange && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <History size={18} className="text-indigo-600" />
              <span className="text-xs font-bold text-slate-600">Ver como en</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onViewAsOfWeekChange(null)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                  !viewAsOfWeek ? "bg-indigo-600 text-white shadow-lg" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                Presente
              </button>
              {versionWeeks.map(w => (
                <button
                  key={w}
                  onClick={() => onViewAsOfWeekChange(w)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                    viewAsOfWeek === w ? "bg-amber-500 text-white shadow-lg" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  Semana {w}
                </button>
              ))}
            </div>
            {isHistoryMode && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Solo lectura — rutina y logs de esa época</span>
            )}
          </div>
        )}
        
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-auto">
          <button 
            onClick={() => setViewMode('daily')}
            className={cn(
              "flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              viewMode === 'daily' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Día
          </button>
          <button 
            onClick={() => setViewMode('weekly')}
            className={cn(
              "flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              viewMode === 'weekly' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
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
            <h2 className="text-lg sm:text-xl font-black text-slate-800 uppercase tracking-tight">Training Maxes</h2>
          </div>
          <Button variant="outline" size="sm" onClick={onAddTM} className="rounded-xl border-2 text-xs px-3 py-1.5">
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
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">{tm.value}</span>
                    <span className="text-slate-400 font-bold text-sm">
                      {tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's'}
                    </span>
                  </div>
                  <div className="bg-slate-100 rounded-lg px-2 py-1">
                    <span className="text-[9px] font-black uppercase text-slate-500">
                      {tm.mode === 'weight' ? 'Peso' : tm.mode === 'reps' ? 'Reps' : 'Seg'}
                    </span>
                  </div>
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
              <h2 className="text-base sm:text-xl font-black text-slate-800 uppercase tracking-tight">
                Semana {currentWeek.number} {viewMode === 'daily' && <span className="hidden sm:inline">— {currentDay.name}</span>}
              </h2>
              {viewMode === 'daily' && (
                <span className="text-sm sm:hidden text-slate-500 font-medium">{currentDay.name}</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <button 
                onClick={() => setShowMonthSelector(!showMonthSelector)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border-2 border-slate-100 px-3 sm:px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:border-indigo-200 transition-all"
              >
                {currentMonth}
              </button>
              <AnimatePresence>
                {showMonthSelector && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 bg-white border border-slate-100 shadow-2xl rounded-2xl p-2 grid grid-cols-3 gap-1 z-50 w-64"
                  >
                    {months.map((m, idx) => (
                      <button
                        key={m}
                        onClick={() => {
                          // Jump to first week of that month (approx 4 weeks per month)
                          const targetWeek = idx * 4;
                          if (targetWeek < weeks.length) {
                            setActiveWeekIdx(targetWeek);
                          }
                          setShowMonthSelector(false);
                        }}
                        className={cn(
                          "px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                          currentMonth === m ? "bg-indigo-600 text-white" : "hover:bg-slate-50 text-slate-400"
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
                if (activeWeekIdx > 0) setActiveWeekIdx(activeWeekIdx - 1);
              }} disabled={activeWeekIdx === 0} className="px-3 py-2">
                <ChevronLeft size={18} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (activeWeekIdx < weeks.length - 1) setActiveWeekIdx(activeWeekIdx + 1);
              }} disabled={activeWeekIdx === weeks.length - 1} className="px-3 py-2">
                <ChevronRight size={18} />
              </Button>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {viewMode === 'daily' ? (
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
                    key={day.id}
                    onClick={() => setActiveDayIdx(idx)}
                    className={cn(
                        "px-3 sm:px-4 py-2.5 rounded-xl text-[11px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap min-w-[78px] sm:min-w-0 border flex items-center justify-center gap-2 flex-shrink-0",
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200"
                          : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", isActive ? "bg-white" : dayTypeDot[day.type])} />
                      <span className="sm:hidden">{day.name.slice(0, 3)}</span>
                      <span className="hidden sm:inline">{day.name}</span>
                  </button>
                  );
                })}
              </div>

              <Card padding="md" rounded="xl" className="shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:p-8">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900">{currentDay.name}</h3>
                    <div className={cn("w-full sm:w-auto sm:min-w-[200px] relative", isHistoryMode && "opacity-75 pointer-events-none")}>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 block">
                        Tipo de día
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => !isHistoryMode && setShowDayTypeDropdown(!showDayTypeDropdown)}
                          className={cn(
                            "w-full rounded-xl border-2 bg-white px-4 py-3 pr-10 text-xs font-black uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all flex items-center justify-between",
                            currentDay.type === 'workout' ? "border-indigo-500 text-indigo-700 bg-indigo-50 focus:ring-indigo-500" :
                            currentDay.type === 'deload' ? "border-amber-500 text-amber-700 bg-amber-50 focus:ring-amber-500" :
                            "border-slate-300 text-slate-600 bg-slate-50 focus:ring-slate-500"
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
                            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border-2 border-slate-200 rounded-xl shadow-2xl overflow-hidden">
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
                                      ? type === 'workout' ? "bg-indigo-50 text-indigo-700 border-l-4 border-indigo-500" :
                                        type === 'deload' ? "bg-amber-50 text-amber-700 border-l-4 border-amber-500" :
                                        "bg-slate-50 text-slate-700 border-l-4 border-slate-400"
                                      : "hover:bg-slate-50 text-slate-600"
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
                    {/* Table Header - Solo desktop */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gradient-to-r from-slate-50 to-indigo-50/30 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 border border-slate-100">
                      <div className="col-span-4">Ejercicio</div>
                      <div className="col-span-2 text-center">Series × Reps</div>
                      <div className="col-span-2 text-center">% RM</div>
                      <div className="col-span-3 text-center">Peso / Reps / Tiempo</div>
                      <div className="col-span-1 text-center">Acción</div>
                    </div>

                    {/* Ejercicios */}
                    <div className="space-y-3">
                      {currentDay.exercises.map((ex) => {
                        const logId = `${currentWeek.id}-${currentDay.id}-${ex.id}`;
                        const log = logs[logId] || { rpe: '', notes: '', completed: false, sets: [] };
                        const linkedTM = trainingMaxes.find(tm => tm.id === ex.linkedTo);
                        
                        const targetWeight = linkedTM ? roundTo25(linkedTM.value * (ex.pct || 100) / 100) : (ex.weight || 0);
                        const targetLabel = ex.mode === 'weight' ? 'Peso' : ex.mode === 'seconds' ? 'Tiempo' : 'Reps';

                          return (
                            <Card
                              key={ex.id}
                              padding="md"
                              rounded="xl"
                              className="group border-2 border-slate-100 hover:border-indigo-300 transition-all cursor-pointer hover:shadow-lg bg-white md:bg-transparent md:border-0 md:hover:bg-slate-50 md:p-0 md:shadow-none md:hover:shadow-none"
                              onClick={() => setLoggingExercise({ weekId: currentWeek.id, dayId: currentDay.id, exercise: ex })}
                            >
                              {/* Mobile Card Layout */}
                              <div className="md:hidden space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">
                                      {ex.name}
                                    </h4>
                                    {linkedTM && (
                                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider inline-block bg-indigo-50 px-2 py-0.5 rounded-md">
                                        {linkedTM.name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const logId = `${currentWeek.id}-${currentDay.id}-${ex.id}`;
                                        onMarkCompleted(logId, !log.completed);
                                      }}
                                      className={cn(
                                        "p-2 rounded-lg transition-all flex-shrink-0",
                                        log.completed 
                                          ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" 
                                          : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                      )}
                                    >
                                      <CheckCircle2 size={18} />
                                    </button>
                                    {!isHistoryMode && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveExercise(currentWeek.id, currentDay.id, ex.id);
                                      }}
                                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all flex-shrink-0"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Series × Reps - siempre arriba y centrado */}
                                <div onClick={(e) => e.stopPropagation()}>
                                  <label className="text-xs font-bold text-slate-500 mb-2 block text-center">Series × Reps</label>
                                  <div className="flex items-center justify-center bg-white border-2 border-slate-200 rounded-xl px-4 py-3.5 shadow-sm focus-within:border-indigo-400 focus-within:shadow-md transition-all">
                                    <input 
                                      type="number"
                                      min="1"
                                      value={ex.sets || ''}
                                      onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { sets: parseInt(e.target.value) || 0 })}
                                      className="w-16 text-center font-black text-xl bg-transparent focus:outline-none text-slate-900"
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
                                      className="w-24 text-center font-black text-xl bg-transparent focus:outline-none text-slate-900"
                                      placeholder="10"
                                    />
                                  </div>
                                </div>

                                {/* Fila inferior: %RM izquierda y Peso/Reps/Tiempo derecha */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <label className="text-xs font-bold text-slate-500 mb-2 block text-center">% RM</label>
                                    {ex.linkedTo ? (
                                      <div className="bg-indigo-50 text-indigo-700 px-3 py-3 rounded-xl text-base font-black flex items-center justify-center gap-2 border-2 border-indigo-200">
                                        <input 
                                          type="number"
                                          min="0"
                                          max="100"
                                          value={ex.pct || ''}
                                          onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { pct: parseFloat(e.target.value) || 0 })}
                                          className="w-16 bg-transparent text-center focus:outline-none"
                                        />
                                        <span className="text-sm opacity-80">%</span>
                                      </div>
                                    ) : (
                                      <div className="bg-slate-100 text-slate-400 px-3 py-3 rounded-xl text-base font-black flex items-center justify-center border-2 border-slate-200">
                                        —
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <label className="text-xs font-bold text-slate-500 mb-2 block text-center">
                                      {targetLabel}
                                    </label>
                                    <div className={cn(
                                      "flex items-center rounded-xl px-4 py-3.5 w-full justify-between shadow-lg transition-all",
                                      ex.mode === 'weight' ? "bg-indigo-600 text-white shadow-indigo-200" : "bg-emerald-600 text-white shadow-emerald-200"
                                    )}>
                                      <input 
                                        type="number"
                                        step={ex.mode === 'weight' ? '0.5' : '1'}
                                        value={ex.mode === 'weight' ? (ex.linkedTo ? targetWeight : (ex.weight || '')) : (typeof ex.reps === 'number' ? ex.reps : (parseInt(String(ex.reps)) || ''))}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          if (ex.mode === 'weight') {
                                            if (ex.linkedTo && linkedTM) {
                                              const newPct = Math.round((val / linkedTM.value) * 100);
                                              onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { pct: newPct });
                                            } else {
                                              onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { weight: val });
                                            }
                                          } else {
                                            onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { reps: val.toString() });
                                          }
                                        }}
                                        className="flex-1 text-center font-black text-white bg-transparent focus:outline-none text-xl min-w-0"
                                      />
                                      <span className="text-sm font-black opacity-90 ml-2 flex-shrink-0">
                                        {ex.mode === 'weight' ? 'KG' : (ex.mode === 'seconds' ? 'SEG' : 'REPS')}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Mostrar info de vinculación si existe */}
                                {ex.linkedTo && linkedTM && (
                                  <div className="text-center pt-1">
                                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full inline-block">
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
                                  <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                    {ex.name}
                                  </span>
                                  {linkedTM && (
                                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider mt-0.5">{linkedTM.name}</span>
                                  )}
                                </div>
                              </div>

                              {/* Sets x Reps */}
                                <div className="col-span-2 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center bg-white border-2 border-slate-200 rounded-xl px-3 py-2 shadow-sm focus-within:border-indigo-400 transition-all">
                                  <input 
                                    type="number"
                                    value={ex.sets}
                                    onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { sets: parseInt(e.target.value) || 0 })}
                                      className="w-10 text-center font-black text-sm bg-transparent focus:outline-none text-slate-900"
                                  />
                                    <span className="text-sm font-black text-slate-400 mx-2">×</span>
                                  <input 
                                    value={ex.reps}
                                    onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { reps: e.target.value })}
                                      className="w-12 text-center font-black text-sm bg-transparent focus:outline-none text-slate-900"
                                  />
                                </div>
                              </div>

                              {/* % RM */}
                                <div className="col-span-2 flex justify-center" onClick={(e) => e.stopPropagation()}>
                                {ex.linkedTo ? (
                                    <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 border-2 border-indigo-200">
                                    <input 
                                      type="number"
                                      value={ex.pct || ''}
                                      onChange={(e) => onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { pct: parseFloat(e.target.value) || 0 })}
                                        className="w-14 bg-transparent text-center focus:outline-none"
                                    />
                                      <span className="text-xs opacity-80">%</span>
                                  </div>
                                ) : (
                                    <span className="text-slate-300 font-black">—</span>
                                )}
                              </div>

                              {/* Weight / Target */}
                                <div className="col-span-3 flex justify-center" onClick={(e) => e.stopPropagation()}>
                                <div className={cn(
                                    "flex items-center rounded-xl px-4 py-3 w-full max-w-[140px] justify-between shadow-lg transition-all",
                                    ex.mode === 'weight' ? "bg-indigo-600 text-white shadow-indigo-200" : "bg-emerald-600 text-white shadow-emerald-200"
                                )}>
                                  <input 
                                    type="number"
                                    value={ex.mode === 'weight' ? (ex.linkedTo ? targetWeight : (ex.weight || '')) : ex.reps}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (ex.mode === 'weight') {
                                        if (ex.linkedTo && linkedTM) {
                                          const newPct = Math.round((val / linkedTM.value) * 100);
                                          onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { pct: newPct });
                                        } else {
                                          onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { weight: val });
                                        }
                                      } else {
                                        onUpdateExercise(currentWeek.id, currentDay.id, ex.id, { reps: val });
                                      }
                                    }}
                                    className="w-full text-center font-black text-white bg-transparent focus:outline-none text-base"
                                  />
                                    <span className="text-xs font-black opacity-90 ml-2">
                                    {ex.mode === 'weight' ? 'KG' : (ex.mode === 'seconds' ? 'SEG' : 'REPS')}
                                  </span>
                                </div>
                              </div>

                                {/* Actions */}
                                <div className="col-span-1 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const logId = `${currentWeek.id}-${currentDay.id}-${ex.id}`;
                                      onMarkCompleted(logId, !log.completed);
                                    }}
                                    className={cn(
                                      "p-2 rounded-lg transition-all",
                                      log.completed 
                                        ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" 
                                        : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                    )}
                                  >
                                    <CheckCircle2 size={18} />
                                  </button>
                                {!isHistoryMode && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveExercise(currentWeek.id, currentDay.id, ex.id);
                                  }}
                                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
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
                      <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Plus className="text-indigo-600" size={24} />
                        </div>
                        <p className="text-slate-500 font-medium mb-4">No hay ejercicios para este día</p>
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
                          className="flex items-center gap-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all py-4 px-8 rounded-xl border-2 border-dashed border-indigo-300 group active:scale-95 shadow-sm hover:shadow-md"
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
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Activity className="text-slate-300" size={40} />
                    </div>
                    <h4 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Día de Descanso</h4>
                    <p className="text-slate-400 font-medium">Recupera fuerzas para tu próxima sesión</p>
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
              {currentWeek.days.map((day) => (
                <Card 
                  key={day.id} 
                  padding="md" 
                  rounded="2xl" 
                  className={cn(
                    "border-2 transition-all cursor-pointer hover:border-indigo-200",
                    day.type === 'rest' ? "bg-slate-50 border-slate-100" : "bg-white border-slate-100"
                  )}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">{day.name}</h3>
                    <DayTypeBadge type={day.type} />
                  </div>

                  {day.type === 'workout' || day.type === 'deload' ? (
                    <div className="space-y-2">
                      {day.exercises.length === 0 ? (
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Sin ejercicios</p>
                      ) : (
                        day.exercises.map(ex => (
                          <div key={ex.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                            <span className="text-[10px] font-bold text-slate-700 truncate max-w-[100px]">{ex.name}</span>
                            <span className="text-[10px] font-black text-indigo-600">{ex.sets}×{ex.reps}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="py-4 flex flex-col items-center justify-center text-slate-300">
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
        <Button variant="outline" className="flex-1 w-full sm:w-auto" onClick={onSavePeriod}>
          <Calendar size={18} />
          <span className="text-sm sm:text-base">Guardar Período</span>
        </Button>
        <Button variant="primary" className="flex-1 w-full sm:w-auto" onClick={onNextCycle}>
          <span className="text-sm sm:text-base">Siguiente Ciclo</span>
        </Button>
      </div>

      {/* Log Exercise Modal */}
      <AnimatePresence>
        {loggingExercise && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLoggingExercise(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 sm:p-10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex-1 mr-4">
                    <input 
                      value={loggingExercise.exercise.name}
                      onChange={(e) => onUpdateExercise(loggingExercise.weekId, loggingExercise.dayId, loggingExercise.exercise.id, { name: e.target.value })}
                      className="text-3xl font-black text-slate-900 uppercase tracking-tight bg-transparent focus:outline-none w-full border-b-2 border-transparent focus:border-indigo-200"
                    />
                    <p className="text-indigo-600 font-black text-xs uppercase tracking-widest mt-1">
                      {loggingExercise.exercise.sets} × {loggingExercise.exercise.reps} • {loggingExercise.exercise.linkedTo ? 'Objetivo vinculado' : 'Libre'}
                    </p>
                  </div>
                  <button 
                    onClick={() => setLoggingExercise(null)} 
                    className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors"
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
                      className="w-full h-24 p-6 text-sm font-bold rounded-3xl border-2 border-slate-100 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all resize-none outline-none"
                    />
                  </div>

                  {/* RPE */}
                  <div>
                    <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">RPE (Rate of Perceived Exertion)</label>
                    <div className="flex items-center bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 shadow-sm focus-within:border-indigo-500 transition-all">
                      <Gauge size={20} className="text-indigo-600 mr-3" />
                      <input 
                        placeholder="Ej: 8, 8.5, 9..." 
                        value={logs[`${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`]?.rpe || ''}
                        onChange={(e) => onLogChange(`${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`, 'rpe', e.target.value)}
                        className="flex-1 text-center font-black text-lg bg-transparent focus:outline-none text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-center">Escala del 1-10 (1=muy fácil, 10=máximo esfuerzo)</p>
                  </div>

                  {/* Sets Logging - Minimalist Design */}
                  <div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 scrollbar-hide">
                      {Array.from({ length: loggingExercise.exercise.sets }).map((_, idx) => {
                        const logId = `${loggingExercise.weekId}-${loggingExercise.dayId}-${loggingExercise.exercise.id}`;
                        const setLog = logs[logId]?.sets?.[idx] || { id: `${idx}`, weight: null, reps: null, completed: false };
                        const linkedTM = trainingMaxes.find(tm => tm.id === loggingExercise.exercise.linkedTo);
                        const targetWeight = linkedTM ? roundTo25(linkedTM.value * (loggingExercise.exercise.pct || 100) / 100) : (loggingExercise.exercise.weight || 0);
                        const targetReps = parseInt(loggingExercise.exercise.reps.toString()) || 0;
                        const exerciseMode = loggingExercise.exercise.mode;
                        const unitLabel = exerciseMode === 'seconds' ? 'SEG' : 'REPS';
                        
                        const isCompleted = setLog.completed || (setLog.reps !== null && setLog.reps >= targetReps);
                        const hasData = setLog.weight !== null || setLog.reps !== null;

                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-xl border transition-all",
                              isCompleted 
                                ? "bg-emerald-50 border-emerald-200" 
                                : hasData 
                                  ? "bg-indigo-50 border-indigo-200" 
                                  : "bg-slate-50 border-slate-200"
                            )}
                          >
                            {/* Set Number */}
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0",
                              isCompleted ? "bg-emerald-600 text-white" : "bg-white border border-slate-200 text-slate-500"
                            )}>
                              {idx + 1}
                            </div>
                            
                            {/* Weight (if weight mode) */}
                            {exerciseMode === 'weight' && (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <input 
                                    type="number"
                                  step="0.5"
                                    placeholder={targetWeight.toString()}
                                  value={setLog.weight ?? ''}
                                    onChange={(e) => onSetLogChange(logId, idx, { weight: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                  className="flex-1 min-w-0 px-3 py-2 text-center font-black text-base bg-white rounded-lg border border-slate-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                />
                                <span className="text-xs font-bold text-slate-400 flex-shrink-0">kg</span>
                                </div>
                              )}

                            {/* Reps/Time Input */}
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="text-xs font-bold text-slate-400 flex-shrink-0">Meta: {targetReps}</span>
                                <input 
                                  type="number"
                                  placeholder={targetReps.toString()}
                                value={setLog.reps ?? ''}
                                  onChange={(e) => onSetLogChange(logId, idx, { reps: e.target.value === '' ? null : parseInt(e.target.value) })}
                                className="flex-1 min-w-0 px-3 py-2 text-center font-black text-base bg-white rounded-lg border border-slate-200 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                />
                              <span className="text-xs font-bold text-slate-400 flex-shrink-0">{unitLabel.toLowerCase()}</span>
                              </div>
                            
                            {/* Check Button */}
                            <button
                              onClick={() => onSetLogChange(logId, idx, { completed: !setLog.completed })}
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
                                setLog.completed 
                                  ? "bg-emerald-600 text-white" 
                                  : "bg-white border border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600"
                              )}
                            >
                              <CheckCircle2 size={16} className={setLog.completed ? "fill-current" : ""} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-10">
                  <Button 
                    variant="primary" 
                    className="w-full h-16 rounded-3xl font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100"
                    onClick={() => setLoggingExercise(null)}
                  >
                    Guardar Sesión
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit TM Modal */}
      <AnimatePresence>
        {editingTM && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTM(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 sm:p-8 md:p-10">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-100">
                      <Settings2 className="text-white" size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Editar TM</h3>
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Ajusta tus marcas máximas</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setEditingTM(null)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
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
                      className="h-16 text-lg font-black uppercase tracking-widest rounded-3xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Valor Máximo</label>
                      <Input 
                        type="number"
                        value={editingTM.value}
                        onChange={(e) => setEditingTM({ ...editingTM, value: parseFloat(e.target.value) || 0 })}
                        className="h-16 text-2xl font-black text-center rounded-3xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Unidad</label>
                      <select 
                        value={editingTM.mode}
                        onChange={(e) => setEditingTM({ ...editingTM, mode: e.target.value as ExerciseMode })}
                        className="w-full h-16 px-6 text-sm font-black uppercase tracking-widest rounded-3xl border-2 border-slate-100 focus:border-indigo-500 bg-slate-50 outline-none appearance-none cursor-pointer"
                      >
                        <option value="weight">Kilogramos (KG)</option>
                        <option value="reps">Repeticiones (REPS)</option>
                        <option value="seconds">Segundos (SEG)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-10">
                  <Button 
                    variant="primary" 
                    className="w-full h-16 rounded-3xl font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
                    onClick={() => {
                      onUpdateTM(editingTM.id, { 
                        name: editingTM.name, 
                        value: editingTM.value, 
                        mode: editingTM.mode 
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
          </div>
        )}
      </AnimatePresence>

      {/* Add Exercise Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-2xl sm:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 sm:p-10">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Añadir Objetivo</h3>
                  <button 
                    onClick={() => setShowAddModal(false)} 
                    className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors"
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
                          newExForm.linkedTo === '' ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100"
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
                            newExForm.linkedTo === tm.id ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100"
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
                        value={newExForm.sets}
                        onChange={(e) => setNewExForm({ ...newExForm, sets: parseInt(e.target.value) || 0 })}
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

                  {newExForm.mode === 'weight' && (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">% RM</label>
                        <Input 
                          type="number"
                          disabled={!newExForm.linkedTo}
                          value={newExForm.pct}
                          onChange={(e) => setNewExForm({ ...newExForm, pct: parseInt(e.target.value) || 0 })}
                          className="h-16 text-xl font-black text-center rounded-3xl border-2 border-slate-100 focus:border-indigo-500 shadow-sm disabled:opacity-30"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-black uppercase text-slate-400 mb-3 block tracking-[0.2em]">Peso (KG)</label>
                        <div className="h-16 flex items-center justify-center bg-slate-50 rounded-3xl border-2 border-slate-100 text-2xl font-black text-slate-900 shadow-inner">
                          {newExForm.linkedTo ? roundTo25((trainingMaxes.find(t => t.id === newExForm.linkedTo)?.value || 0) * newExForm.pct / 100) : 0}
                          <span className="text-xs ml-2 text-slate-400">KG</span>
                        </div>
                      </div>
                    </div>
                  )}
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
                      onAddExercise(currentWeek.id, currentDay.id, {
                        name: newExForm.name,
                        linkedTo: newExForm.linkedTo || undefined,
                        pct: newExForm.linkedTo ? newExForm.pct : undefined,
                        sets: newExForm.sets,
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
      </AnimatePresence>
    </motion.div>
  );
};
