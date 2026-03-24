import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Trophy, TrendingUp, Dumbbell, ChevronRight, MapPin, Clock, Bell } from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { Card } from '@/src/components/ui/Card';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { HistoryEntry, RMData, TrainingMax, Challenge, GymCheckIn, User, RoutineProgressKind } from '@/src/types';
import { cn } from '@/src/lib/utils';
import {
  computeRoutineProgressTotal,
  progressValueFromHistoryEntry,
} from '@/src/lib/routineProgressTotal';

interface DashboardProps {
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
  challenges: Challenge[];
  checkIns: GymCheckIn[];
  onUpdateUser?: (updates: Partial<User>) => void;
  onOpenProgram: () => void;
  onOpenSocial: (tab?: 'friends' | 'challenges' | 'checkins') => void;
  onJoinFriendCheckIn: (checkIn: GymCheckIn) => void;
}

type ProgressMode = 'month' | 'year';

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
        onClick={() => onChange('month')}
        className={cn(
          "px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all",
          mode === 'month'
            ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
            : "text-slate-500 dark:text-slate-400"
        )}
      >
        Mes
      </button>
      <button
        type="button"
        onClick={() => onChange('year')}
        className={cn(
          "px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all",
          mode === 'year'
            ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
            : "text-slate-500 dark:text-slate-400"
        )}
      >
        Año
      </button>
    </div>
  );
});

export const DashboardView: React.FC<DashboardProps> = ({ 
  user,
  history, 
  rms, 
  trainingMaxes,
  activeRoutineName = 'Rutina activa',
  activeRoutineId,
  challenges,
  checkIns,
  onUpdateUser,
  onOpenProgram, 
  onOpenSocial,
  onJoinFriendCheckIn
}) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const [selectedCheckIn, setSelectedCheckIn] = useState<GymCheckIn | null>(null);
  const [progressMode, setProgressMode] = useState<ProgressMode>(() => user.progressMode === 'year' ? 'year' : 'month');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);

  // Al volver a Progreso: si año/mes no son actuales, usar actuales
  useEffect(() => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
  }, []);

  // Sincronizar progressMode desde user (ej. tras login)
  useEffect(() => {
    if (user.progressMode === 'year' || user.progressMode === 'month') {
      setProgressMode(user.progressMode);
    }
  }, [user.progressMode]);

  /** Al cambiar de rutina, el selector año/mes se alinea con el mes actual (progresión de esa rutina, no el filtro anterior). */
  useEffect(() => {
    if (activeRoutineId == null) return;
    const n = new Date();
    setSelectedYear(n.getFullYear());
    setSelectedMonth(n.getMonth());
  }, [activeRoutineId]);

  // Guardar progressMode en DB al cambiar
  const handleProgressModeChange = (mode: ProgressMode) => {
    setProgressMode(mode);
    onUpdateUser?.({ progressMode: mode });
  };
  const lastHistory = history[history.length - 1];
  const firstHistory = history[0];

  /** Cómo se agrega el progreso de esta rutina (kg / reps / s / índice mixto). */
  const routineProgressMeta = useMemo(
    () => computeRoutineProgressTotal(trainingMaxes),
    [trainingMaxes]
  );

  /** Valor mostrado: coherente con la misma fórmula que el gráfico (reconstruye desde `trainingMaxes` guardados). */
  const displayRoutineProgress = useMemo(() => {
    if (!lastHistory) return routineProgressMeta.value;
    return progressValueFromHistoryEntry(lastHistory, trainingMaxes);
  }, [lastHistory, trainingMaxes, routineProgressMeta.value]);

  const totalGain = useMemo(() => {
    if (!firstHistory || !lastHistory) return 0;
    const a = progressValueFromHistoryEntry(firstHistory, trainingMaxes);
    const b = progressValueFromHistoryEntry(lastHistory, trainingMaxes);
    return b - a;
  }, [firstHistory, lastHistory, trainingMaxes]);

  const totalGainPct =
    firstHistory != null
      ? (() => {
          const base = progressValueFromHistoryEntry(firstHistory, trainingMaxes);
          return base > 0 ? Math.round((totalGain / base) * 100) : 0;
        })()
      : 0;

  /** Modo global: todos los gráficos muestran kg/reps/s o % a la vez. Alterna cada 3s. */
  const [showPercent, setShowPercent] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setShowPercent(p => !p), 3000);
    return () => clearInterval(id);
  }, []);

  /** Variación del agregado de la rutina (misma unidad que `routineProgressMeta`). */
  const mainStatDisplay = useMemo(() => {
    const positive = totalGain >= 0;
    const u = routineProgressMeta.unit;
    if (showPercent) {
      return { value: `${totalGainPct > 0 ? '+' : ''}${totalGainPct}%`, positive };
    }
    const abs =
      routineProgressMeta.kind === 'mixed'
        ? Math.round(totalGain * 100) / 100
        : Math.round(totalGain);
    return { value: `${abs > 0 ? '+' : ''}${abs} ${u}`.trim(), positive };
  }, [totalGain, totalGainPct, showPercent, routineProgressMeta.kind, routineProgressMeta.unit]);

  /** Primer/último valor guardado de este TM en el historial de esta rutina (ids distintos por rutina). */
  const tmStatDisplay = useMemo(() => {
    const byId: Record<string, { value: string; negative: boolean }> = {};
    const firstSnap = (tmId: string) =>
      history.find(h => h.trainingMaxes != null && h.trainingMaxes[tmId] != null)?.trainingMaxes?.[tmId];
    const lastSnap = (tmId: string) => {
      for (let i = history.length - 1; i >= 0; i--) {
        const v = history[i]?.trainingMaxes?.[tmId];
        if (v != null) return v;
      }
      return undefined;
    };

    trainingMaxes.forEach(tm => {
      const unit = tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
      const firstVal = firstSnap(tm.id);
      const lastVal = lastSnap(tm.id) ?? (tm.mode === 'weight' ? tm.value : undefined);
      if (firstVal != null && lastVal != null) {
        const gain = lastVal - firstVal;
        const pct = firstVal > 0 ? Math.round((gain / firstVal) * 100) : 0;
        if (showPercent) {
          byId[tm.id] = { value: `${pct > 0 ? '+' : ''}${pct}%`, negative: pct < 0 };
        } else {
          byId[tm.id] = { value: `${gain > 0 ? '+' : ''}${gain} ${unit}`, negative: gain < 0 };
        }
      } else {
        byId[tm.id] = showPercent ? { value: '0%', negative: false } : { value: `0 ${unit}`, negative: false };
      }
    });
    return byId;
  }, [history, trainingMaxes, showPercent]);

  const joinedChallenges = useMemo(() => challenges.filter(c => c.participants.some(p => p.userId === user.id)), [challenges, user.id]);

  /** Torneos activos que un amigo creó y aún no te has unido (el API ya filtra por amistad) */
  const friendTournamentsToJoin = useMemo(() => {
    return challenges.filter(c => {
      const ended = c.status === 'finished' || new Date(c.endDate) <= now;
      if (ended) return false;
      if (c.participants.some(p => p.userId === user.id)) return false;
      const creatorId = c.createdBy?.id;
      if (!creatorId || creatorId === user.id) return false;
      return true;
    });
  }, [challenges, user.id, now]);

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

  const getTMConfig = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('banca')) return { color: '#3b82f6', bg: 'bg-blue-50', text: 'text-blue-600' };
    if (lower.includes('sentadilla')) return { color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-600' };
    if (lower.includes('muerto')) return { color: '#f43f5e', bg: 'bg-rose-50', text: 'text-rose-600' };
    return { color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-600' };
  };

  const parsedHistory = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const monthByText: Record<string, number> = {
      ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
      may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
      sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11
    };

    return [...history]
      .map((entry, idx) => {
        let date = new Date(entry.date);
        if (entry.year && entry.week) {
          date = new Date(entry.year, 0, 1 + (entry.week - 1) * 7);
        }
        if (Number.isNaN(date.getTime())) {
          const raw = (entry.date || '').toLowerCase().trim();
          const matchedMonth = Object.entries(monthByText).find(([key]) => raw.includes(key))?.[1];
          if (matchedMonth !== undefined) {
            date = new Date(entry.year ?? currentYear, matchedMonth, 1);
          } else {
            date = new Date(entry.year ?? currentYear, 0, Math.min(28, idx + 1));
          }
        }
        const dayIdx = entry.dayIndex;
        return {
          source: entry,
          date,
          year: entry.year ?? date.getFullYear(),
          month: date.getMonth(),
          weekOfMonth: Math.max(1, Math.min(4, Math.ceil(date.getDate() / 7))),
          dayIndex: dayIdx,
          order: date.getTime() + (dayIdx ?? 0) * 3600000 + idx * 0.001
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [history]);

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear; y >= 2020; y--) years.push(y);
    return years;
  }, []);

  useEffect(() => {
    const now = new Date();
    if (!availableYears.includes(selectedYear)) setSelectedYear(now.getFullYear());
    if (selectedMonth < 0 || selectedMonth > 11) setSelectedMonth(now.getMonth());
  }, [availableYears, selectedMonth, selectedYear]);

  const chartContext = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentWeekOfMonth = Math.max(1, Math.min(4, Math.ceil(now.getDate() / 7)));
    const currentTotal = computeRoutineProgressTotal(trainingMaxes).value;

    if (progressMode === 'month') {
      const monthData = parsedHistory.filter(item => item.year === selectedYear && item.month === selectedMonth);
      const latestByWeek = new Map<number, typeof monthData[number]>();
      monthData.forEach(item => {
        const prev = latestByWeek.get(item.weekOfMonth);
        if (!prev || item.order >= prev.order) latestByWeek.set(item.weekOfMonth, item);
      });
      const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;
      let carryTotal: number | null = null;
      return [1, 2, 3, 4].map(week => {
        const point = latestByWeek.get(week);
        const isCurrentSlot = selectedYear === currentYear && selectedMonth === currentMonth && week === currentWeekOfMonth;
        if (point?.source) carryTotal = progressValueFromHistoryEntry(point.source, trainingMaxes);
        if (isCurrentSlot) carryTotal = currentTotal;
        const isFuture = isCurrentMonth && week > currentWeekOfMonth;
        return {
          key: `w${week}`,
          label: String(week),
          weekNum: week,
          source: point?.source,
          total: isFuture ? null : (carryTotal ?? 0)
        };
      });
    }

    const yearData = parsedHistory.filter(item => item.year === selectedYear);
    const latestByMonth = new Map<number, typeof yearData[number]>();
    yearData.forEach(item => {
      const prev = latestByMonth.get(item.month);
      if (!prev || item.order >= prev.order) latestByMonth.set(item.month, item);
    });
    const isCurrentYear = selectedYear === currentYear;
    let carryTotal: number | null = null;
    return Array.from({ length: 12 }, (_, month) => {
      const point = latestByMonth.get(month);
      const isCurrentSlot = selectedYear === currentYear && month === currentMonth;
      if (point?.source) carryTotal = progressValueFromHistoryEntry(point.source, trainingMaxes);
      if (isCurrentSlot) carryTotal = currentTotal;
      const isFuture = isCurrentYear && month > currentMonth;
      return {
        key: `m${month}`,
        label: MONTH_LABELS_SHORT[month],
        monthNum: month,
        source: point?.source,
        total: isFuture ? null : (carryTotal ?? 0)
      };
    });
  }, [parsedHistory, progressMode, selectedMonth, selectedYear, trainingMaxes]);

  const mainChartData = useMemo(() => chartContext.map(p => ({ date: p.label, total: p.total })), [chartContext]);

  const tmChartDataById = useMemo(() => {
    const byId: Record<string, Array<{ date: string; value: number | null }>> = {};
    const dayNamesShort = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const entriesInView =
      progressMode === 'month'
        ? parsedHistory.filter(item => item.year === selectedYear && item.month === selectedMonth)
        : parsedHistory.filter(item => item.year === selectedYear);

    const sorted = [...entriesInView].sort((a, b) => a.order - b.order);

    trainingMaxes.forEach(tm => {
      let carry: number | null = null;
      const points: Array<{ date: string; value: number | null }> = [];

      sorted.forEach(item => {
        const raw = item.source.trainingMaxes?.[tm.id];
        if (raw != null) carry = raw;
        const isoWeek = item.source.week;
        const di = item.source.dayIndex;
        let label: string;
        if (progressMode === 'month') {
          label =
            isoWeek != null && di != null
              ? `S${isoWeek}·${dayNamesShort[di % 7]}`
              : `${item.date.getDate()}/${item.month + 1}`;
        } else {
          label =
            di != null
              ? `${MONTH_LABELS_SHORT[item.month]}·${dayNamesShort[di % 7]}`
              : MONTH_LABELS_SHORT[item.month];
        }
        points.push({ date: label, value: carry });
      });

      const shouldAppendLive =
        progressMode === 'month'
          ? selectedYear === currentYear && selectedMonth === currentMonth
          : selectedYear === currentYear;

      if (shouldAppendLive) {
        if (points.length === 0) {
          points.push({ date: 'Ahora', value: tm.value });
        } else {
          const last = points[points.length - 1].value;
          if (last !== tm.value) points.push({ date: 'Ahora', value: tm.value });
        }
      }

      byId[tm.id] = points.length ? points : [{ date: 'Inicio', value: tm.value }];
    });
    return byId;
  }, [parsedHistory, trainingMaxes, progressMode, selectedYear, selectedMonth]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto mt-2 max-[400px]:mt-2 sm:mt-4 md:mt-8 mb-6 sm:mb-10 md:mb-12 px-3 max-[360px]:px-2 sm:px-5 md:px-6 py-5 max-[360px]:py-4 sm:py-8 md:py-10 pb-32 max-[360px]:pb-28 sm:pb-40 md:pb-44 rounded-2xl max-[400px]:rounded-xl sm:rounded-[2rem] md:rounded-[2.5rem] backdrop-blur-2xl bg-white/55 dark:bg-slate-900/55 border border-white/30 dark:border-slate-700/40 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/50"
    >
      <header className="mb-3 max-[400px]:mb-2 flex items-center justify-between gap-2 max-[360px]:gap-1">
        <div className="flex items-center gap-2 max-[360px]:gap-1.5 min-w-0">
          <Avatar 
            src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}`}
            name={user.name}
            className="w-10 max-[360px]:w-9 h-10 max-[360px]:h-9 sm:w-12 sm:h-12 rounded-xl max-[360px]:rounded-lg sm:rounded-2xl border-2 border-white dark:border-slate-700 shadow-lg flex-shrink-0"
          />
          <p className="text-sm max-[360px]:text-xs sm:text-base md:text-lg font-medium text-slate-500 dark:text-slate-400 truncate">Hola, {user.name || 'Atleta'}</p>
        </div>
        <ProgressModeSwitch mode={progressMode} onChange={handleProgressModeChange} />
      </header>

      <div className="mb-4 max-[400px]:mb-3 flex justify-end gap-1.5 max-[360px]:gap-1">
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
        {progressMode === 'month' && (
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-[360px]:gap-2 sm:gap-4 md:gap-6 mb-6 max-[400px]:mb-5 sm:mb-8 md:mb-10">
        {/* Main Stat Card - Progreso total */}
        <Card padding="md" rounded="xl" className="md:col-span-3 relative overflow-hidden border border-slate-100 dark:border-slate-700/60 group hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 p-4 max-[360px]:p-3">
          <div className="flex justify-between items-center mb-2 max-[360px]:mb-1.5">
            <div className={cn("p-2.5 max-[360px]:p-2 rounded-xl max-[360px]:rounded-lg sm:rounded-2xl", "bg-indigo-50 dark:bg-indigo-950/50")}>
              <TrendingUp size={18} className="max-[360px]:size-4 sm:size-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-right">
              <div
                className="text-xl max-[360px]:text-lg sm:text-2xl font-black text-slate-900 dark:text-white"
                title={`${routineProgressMeta.label}: ${routineProgressMeta.description}`}
              >
                {routineProgressMeta.kind === 'mixed'
                  ? Math.round(displayRoutineProgress * 100) / 100
                  : Math.round(displayRoutineProgress)}
                {routineProgressMeta.unit ? (
                  <span className="text-[10px] max-[360px]:text-[9px] sm:text-xs text-slate-400 dark:text-slate-500 ml-1">
                    {routineProgressMeta.unit}
                  </span>
                ) : null}
              </div>
              <AnimatePresence mode="wait">
                <motion.span
                  key={showPercent ? 'pct' : 'abs'}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "text-xs sm:text-sm font-bold block mt-0.5",
                    mainStatDisplay.positive === false
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-500 dark:text-slate-400"
                  )}
                >
                  En esta rutina: {mainStatDisplay.value}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
          <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-0.5 max-[360px]:mb-0 sm:mb-1 text-sm max-[360px]:text-xs sm:text-base">
            Progreso de la rutina
          </h3>
          <p className="text-[10px] max-[360px]:text-[9px] sm:text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-3 max-[360px]:mb-2 sm:mb-4 truncate" title={activeRoutineName}>
            {activeRoutineName}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeRoutineName}-${progressMode}-${selectedYear}-${selectedMonth}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="h-[90px] max-[360px]:h-[80px] sm:h-[100px] md:h-[120px] w-full -mx-1 sm:-mx-2 outline-none"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onPointerMoveCapture={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                style={{ touchAction: 'pan-x pan-y', WebkitTapHighlightColor: 'transparent', outline: 'none' }}
              >
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mainChartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="colorTotalLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTotalDark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" vertical={false} stroke={user.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(148,163,184,0.06)'} />
                  <XAxis dataKey="date" interval={0} axisLine={false} tickLine={false} tick={{fontSize: 8, fill: user.theme === 'dark' ? 'rgba(255,255,255,0.4)' : '#94a3b8'}} />
                  <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip 
                    cursor={false}
                    contentStyle={user.theme === 'dark' 
                      ? { backgroundColor: 'rgba(15,23,42,0.95)', borderRadius: '8px', border: 'none', color: '#fff', padding: '6px 10px', fontSize: 12 } 
                      : { backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px -4px rgba(0,0,0,0.1)', padding: '6px 10px', fontSize: 12 }} 
                    itemStyle={{ color: user.theme === 'dark' ? '#818cf8' : '#6366f1' }} 
                    formatter={(value: number | null) => [
                      formatRoutineAggregate(value, routineProgressMeta.kind, routineProgressMeta.unit),
                      '',
                    ]}
                  />
                  <Area type="monotone" dataKey="total" stroke={user.theme === 'dark' ? '#818cf8' : '#6366f1'} strokeWidth={3} fillOpacity={1} fill={`url(#colorTotal${user.theme === 'dark' ? 'Dark' : 'Light'})`} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </AnimatePresence>
        </Card>

        {/* Individual Progress Cards - TODOS los TMs */}
        {trainingMaxes.map((tm, idx) => {
          const config = getTMConfig(tm.name);
          const chartData = tmChartDataById[tm.id] ?? [{ date: 'Inicio', value: tm.value }];
          const unit = tm.mode === 'weight' ? 'kg' : tm.mode === 'reps' ? 'reps' : 's';
          const gradId = `grad-${tm.id.replace(/[^a-z0-9]/gi, '')}`;

          return (
            <motion.div 
              key={tm.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card padding="md" rounded="xl" className="group hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 dark:border-slate-700/60 border border-slate-100 overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                  <div className={cn("p-3 rounded-2xl", config.bg, "dark:bg-opacity-50")}>
                    <Dumbbell size={20} className={config.text} />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {tm.value}
                      <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">{unit}</span>
                    </div>
                    {(() => {
                      const item = tmStatDisplay[tm.id];
                      if (!item) return null;
                      return (
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={showPercent ? 'pct' : 'abs'}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className={cn(
                              "text-xs font-bold block mt-0.5",
                              item.negative ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"
                            )}
                          >
                            {item.value}
                          </motion.span>
                        </AnimatePresence>
                      );
                    })()}
                  </div>
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">{tm.name}</h3>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${tm.id}-${activeRoutineName}-${progressMode}-${selectedYear}-${selectedMonth}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="h-[90px] max-[360px]:h-[80px] sm:h-[100px] md:h-[120px] w-full -mx-1 sm:-mx-2 outline-none"
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onPointerMoveCapture={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    style={{ touchAction: 'pan-x pan-y', WebkitTapHighlightColor: 'transparent', outline: 'none' }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={config.color} stopOpacity={0.35}/>
                          <stop offset="95%" stopColor={config.color} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 2" vertical={false} stroke={user.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(148,163,184,0.06)'} />
                      <XAxis dataKey="date" interval={0} axisLine={false} tickLine={false} tick={{fontSize: 8, fill: user.theme === 'dark' ? 'rgba(255,255,255,0.4)' : '#94a3b8'}} />
                      <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip 
                        cursor={false}
                        contentStyle={user.theme === 'dark' 
                          ? { backgroundColor: 'rgba(15,23,42,0.95)', borderRadius: '8px', border: 'none', padding: '6px 10px', fontSize: 11 }
                          : { backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px -4px rgba(0,0,0,0.1)', padding: '6px 10px', fontSize: 11 }}
                        itemStyle={{ color: config.color }}
                        formatter={(value: number | null) => [value == null ? '—' : `${Math.round(value)} ${unit}`, '']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={config.color} 
                        strokeWidth={3} 
                        fillOpacity={1} 
                        fill={`url(#${gradId})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  </motion.div>
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-[400px]:gap-3 sm:gap-6 md:gap-8 mb-6 max-[400px]:mb-5 sm:mb-8 md:mb-10">
        {/* Joined Challenges Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base max-[360px]:text-sm sm:text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-1.5 max-[360px]:gap-1">
              <Trophy size={18} className="max-[360px]:size-4 sm:size-5 text-amber-500 flex-shrink-0" />
              Mis Torneos
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenSocial('challenges')} className="text-indigo-600 text-xs font-bold">
              Ver todos
            </Button>
          </div>

          {friendTournamentsToJoin.length > 0 && (
            <Card padding="md" rounded="2xl" className="mb-4 border-amber-200/80 dark:border-amber-700/50 bg-amber-50/40 dark:bg-amber-950/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300 mb-2">
                Tus amigos — únete
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                Torneos en curso creados por amigos; ábrelos en Comunidad para registrar tu marca.
              </p>
              <div className="space-y-2">
                {friendTournamentsToJoin.slice(0, 4).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpenSocial('challenges')}
                    className="w-full text-left flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-100 dark:border-amber-900/40 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm">{c.title}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Por {c.createdBy?.name ?? 'Amigo'} · {c.exercise}
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 flex-shrink-0">Unirse</span>
                  </button>
                ))}
              </div>
              {friendTournamentsToJoin.length > 4 && (
                <Button variant="outline" size="sm" className="w-full mt-2 rounded-xl text-xs" onClick={() => onOpenSocial('challenges')}>
                  Ver {friendTournamentsToJoin.length - 4} más en Comunidad
                </Button>
              )}
            </Card>
          )}
          
          <div className="space-y-4">
            {joinedChallenges.length === 0 ? (
              <Card padding="md" className="text-center border-dashed border-2 border-slate-200 dark:border-slate-600 bg-transparent">
                <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">No te has unido a ningún torneo aún</p>
                <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => onOpenSocial('challenges')}>Explorar</Button>
              </Card>
            ) : (
              joinedChallenges.map(challenge => {
                const sorted = [...challenge.participants].sort((a, b) => b.score - a.score);
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
              })
            )}
          </div>
        </section>

        {/* Today's Gym Check-ins */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base max-[360px]:text-sm sm:text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight flex items-center gap-1.5 max-[360px]:gap-1">
              <Bell size={18} className="max-[360px]:size-4 sm:size-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              ¿Quién entrena hoy?
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onOpenSocial('checkins')} className="text-indigo-600 text-xs font-bold">
              Ver feed
            </Button>
          </div>

          <div className="space-y-4">
            {todayCheckInGroups.length === 0 ? (
              <Card padding="md" className="text-center border-dashed border-2 border-slate-200 bg-transparent">
                <p className="text-slate-400 text-sm font-medium">Nadie ha avisado hoy todavía</p>
                <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => onOpenSocial('checkins')}>Avisar yo</Button>
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
        </section>
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
