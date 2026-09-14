import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Award, BarChart3, Flame, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/src/components/ui/Card';
import { cn } from '@/src/lib/utils';
import type { SessionStats } from '@/src/lib/sessionStats';

const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 } as const;
const GRID_DARK = 'rgba(255,255,255,0.05)';
const GRID_LIGHT = 'rgba(148,163,184,0.12)';
const TICK_DARK = { fontSize: 10, fill: 'rgba(255,255,255,0.45)' } as const;
const TICK_LIGHT = { fontSize: 10, fill: '#94a3b8' } as const;
const TOOLTIP_DARK = {
  backgroundColor: 'rgba(15,23,42,0.95)',
  borderRadius: '8px',
  border: 'none',
  color: '#fff',
  padding: '6px 10px',
  fontSize: 12,
} as const;
const TOOLTIP_LIGHT = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  borderRadius: '8px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px -4px rgba(0,0,0,0.1)',
  padding: '6px 10px',
  fontSize: 12,
} as const;

const DATE_FMT = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' });

function formatKg(v: number): string {
  return `${Math.round(v * 10) / 10} kg`;
}

/** 12 500 kg → "12,5 t": el tonelaje semanal en kg crudos es ilegible. */
function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(Math.round((kg / 1000) * 10) / 10).toLocaleString('es-ES')} t`;
  return `${Math.round(kg)} kg`;
}

function relativeDay(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 14) return 'Hace 1 semana';
  if (days < 31) return `Hace ${Math.floor(days / 7)} semanas`;
  return DATE_FMT.format(new Date(ms));
}

interface StrengthInsightsProps {
  stats: SessionStats;
  isDark: boolean;
  /** Fuerza el replay de la animación al volver a la pestaña. */
  enterKey?: number;
}

export const StrengthInsights = React.memo(function StrengthInsights({
  stats,
  isDark,
  enterKey = 0,
}: StrengthInsightsProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (stats.e1rmByExercise.length === 0) return null;
    return (
      stats.e1rmByExercise.find(s => s.key === selectedKey) ?? stats.e1rmByExercise[0]
    );
  }, [stats.e1rmByExercise, selectedKey]);

  const e1rmChartData = useMemo(
    () =>
      selected?.points.map(p => ({
        date: DATE_FMT.format(new Date(p.dateMs)),
        e1rm: Math.round(p.e1rm * 10) / 10,
        detalle: `${p.weight} kg × ${p.reps}`,
      })) ?? [],
    [selected]
  );

  const volumeChartData = useMemo(
    () =>
      stats.weeklyVolume.slice(-12).map(w => ({
        label: w.label,
        toneladas: Math.round((w.tonnage / 1000) * 100) / 100,
        series: w.sets,
      })),
    [stats.weeklyVolume]
  );

  if (stats.totalSets === 0) {
    return (
      <Card padding="md" rounded="xl" className="border border-dashed border-slate-200 dark:border-slate-700">
        <div className="text-center py-6">
          <BarChart3 size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">Aún no hay series registradas</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            Cuando anotes el peso y las reps de tus series, aquí verás tu RM estimado, el volumen
            semanal y tus récords.
          </p>
        </div>
      </Card>
    );
  }

  const grid = isDark ? GRID_DARK : GRID_LIGHT;
  const tick = isDark ? TICK_DARK : TICK_LIGHT;
  const tooltipStyle = isDark ? TOOLTIP_DARK : TOOLTIP_LIGHT;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3 max-[360px]:gap-2">
        <Card padding="md" rounded="xl" className="border border-slate-100 dark:border-slate-700/60 p-3">
          <Flame size={16} className="text-orange-500 mb-1.5" />
          <p className="text-lg max-[360px]:text-base font-black text-slate-900 dark:text-white leading-none">
            {formatTonnage(stats.totalTonnage)}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Levantado</p>
        </Card>
        <Card padding="md" rounded="xl" className="border border-slate-100 dark:border-slate-700/60 p-3">
          <BarChart3 size={16} className="text-indigo-500 mb-1.5" />
          <p className="text-lg max-[360px]:text-base font-black text-slate-900 dark:text-white leading-none">
            {stats.totalSets}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Series</p>
        </Card>
        <Card padding="md" rounded="xl" className="border border-slate-100 dark:border-slate-700/60 p-3">
          <Award size={16} className="text-amber-500 mb-1.5" />
          <p className="text-lg max-[360px]:text-base font-black text-slate-900 dark:text-white leading-none">
            {stats.recentPrs.length}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Récords</p>
        </Card>
      </div>

      {/* 1RM estimado por ejercicio */}
      {selected && (
        <Card padding="md" rounded="xl" className="border border-slate-100 dark:border-slate-700/60">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base flex items-center gap-1.5">
                <TrendingUp size={16} className="text-indigo-500 flex-shrink-0" />
                RM estimado
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                Cálculo (Epley): no es una serie que hayas hecho
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
                {formatKg(selected.best.e1rm)}
              </p>
              {selected.deltaKg > 0.5 && (
                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  +{formatKg(selected.deltaKg)}
                </p>
              )}
            </div>
          </div>

          {stats.e1rmByExercise.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1 scrollbar-none">
              {stats.e1rmByExercise.slice(0, 8).map(s => (
                <button
                  key={s.key}
                  onClick={() => setSelectedKey(s.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all border',
                    s.key === selected.key
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500 dark:text-slate-400'
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <motion.div
            key={`e1rm-${selected.key}-${enterKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="h-[140px] sm:h-[160px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={e1rmChartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="2 2" vertical={false} stroke={grid} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={tick} minTickGap={16} />
                <YAxis
                  width={38}
                  axisLine={false}
                  tickLine={false}
                  tick={tick}
                  domain={['dataMin - 5', 'dataMax + 5']}
                  tickFormatter={(v: number) => String(Math.round(v))}
                />
                <Tooltip
                  cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '3 3' }}
                  contentStyle={tooltipStyle}
                  formatter={(value: number, _n, item: { payload?: { detalle?: string } }) => [
                    `${value} kg${item?.payload?.detalle ? ` (${item.payload.detalle})` : ''}`,
                    '1RM est.',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </Card>
      )}

      {/* Volumen semanal */}
      {volumeChartData.length > 0 && (
        <Card padding="md" rounded="xl" className="border border-slate-100 dark:border-slate-700/60">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base flex items-center gap-1.5 mb-0.5">
            <BarChart3 size={16} className="text-emerald-500 flex-shrink-0" />
            Volumen semanal
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 mb-3">
            Toneladas movidas por semana (peso × reps)
          </p>
          <motion.div
            key={`vol-${enterKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            className="h-[130px] sm:h-[150px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeChartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="2 2" vertical={false} stroke={grid} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} />
                <YAxis width={34} axisLine={false} tickLine={false} tick={tick} />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.06)' }}
                  contentStyle={tooltipStyle}
                  formatter={(value: number, _n, item: { payload?: { series?: number } }) => [
                    `${value} t · ${item?.payload?.series ?? 0} series`,
                    'Volumen',
                  ]}
                />
                <Bar dataKey="toneladas" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </Card>
      )}

      {/* Récords recientes */}
      {stats.recentPrs.length > 0 && (
        <Card padding="md" rounded="xl" className="border border-slate-100 dark:border-slate-700/60">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base flex items-center gap-1.5 mb-3">
            <Award size={16} className="text-amber-500 flex-shrink-0" />
            Récords recientes
          </h3>
          <div className="space-y-2">
            {stats.recentPrs.slice(0, 5).map((pr, i) => (
              <motion.div
                key={`${pr.exerciseName}-${pr.dateMs}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="flex items-center justify-between gap-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                    {pr.exerciseName}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {pr.weight} kg × {pr.reps} · {relativeDay(pr.dateMs)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-slate-900 dark:text-white text-sm">{formatKg(pr.e1rm)}</p>
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    +{Math.round(pr.improvementKg * 10) / 10}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
});
