import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { fetchProfileTmHistory, type ProfileTmHistory } from '@/src/lib/feedApi';

function unitFor(mode: string) {
  return mode === 'weight' ? 'kg' : mode === 'reps' ? 'reps' : 's';
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function colorFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('sentad') || n.includes('squat')) return '#6366f1';
  if (n.includes('banca') || n.includes('bench') || n.includes('press banca')) return '#f43f5e';
  if (n.includes('muerto') || n.includes('dead')) return '#10b981';
  return '#6366f1';
}

interface TmHistoryModalProps {
  userId: string;
  tm: { id?: string; name: string; value: number; mode: string };
  onClose: () => void;
}

export const TmHistoryModal: React.FC<TmHistoryModalProps> = ({ userId, tm, onClose }) => {
  const [data, setData] = useState<ProfileTmHistory | null>(null);
  const [error, setError] = useState('');
  const color = colorFor(tm.name);
  const unit = unitFor(tm.mode);
  const gradId = `friend-tm-${(tm.id || tm.name).replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (!tm.id) {
      setData({
        tm: { id: '', name: tm.name, value: tm.value, mode: tm.mode },
        points: [{ dateISO: new Date().toISOString().slice(0, 10), value: tm.value }],
      });
      return;
    }
    let cancelled = false;
    fetchProfileTmHistory(userId, tm.id)
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.message || 'No se ha podido cargar la gráfica');
          setData({
            tm: { id: tm.id || '', name: tm.name, value: tm.value, mode: tm.mode },
            points: [{ dateISO: new Date().toISOString().slice(0, 10), value: tm.value }],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tm.id, tm.name, tm.value, tm.mode]);

  const chartData = useMemo(() => {
    return (data?.points || []).map(p => ({ date: shortDate(p.dateISO), value: p.value }));
  }, [data]);

  const firstReal = (data?.points || []).find(p => p.value > 0)?.value;
  const last = data?.tm.value ?? tm.value;
  const delta = firstReal != null && last != null ? last - firstReal : 0;
  const pct = firstReal && firstReal > 0 ? (delta / firstReal) * 100 : 0;

  return (
    <GlassModal
      open
      onClose={onClose}
      rise
      wide
      zIndexClass="z-[100080]"
      title={tm.name}
      subtitle="Cómo ha cambiado esta marca"
    >
      <div className="space-y-3">
        <p className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {tm.value}
          <span className="ml-1 text-sm font-semibold text-slate-400">{unit}</span>
        </p>
        {delta !== 0 && (
          <p className={`inline-flex items-center gap-1 text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            <TrendingUp size={13} className={delta < 0 ? 'rotate-180' : ''} />
            {delta > 0 ? '+' : ''}
            {delta} {unit}
            {Number.isFinite(pct) && pct !== 0 ? ` · ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}
          </p>
        )}
        {!data && !error ? (
          <div className="flex h-44 items-center justify-center text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="h-44 w-full min-w-0 outline-none [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData.length ? chartData : [{ date: 'Ahora', value: tm.value }]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.38} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  height={18}
                />
                <Tooltip
                  cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
                  content={({ active, payload, label }) => {
                    const raw = payload?.[0]?.value;
                    if (!active || raw == null) return null;
                    return (
                      <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
                        {label}: {raw} {unit}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fill={`url(#${gradId})`}
                  isAnimationActive
                  animationDuration={900}
                  animationBegin={180}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2.5}
                  isAnimationActive
                  animationDuration={900}
                  animationBegin={180}
                  animationEasing="ease-out"
                  dot={{ r: 3, fill: color, stroke: color }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {error && <p className="text-center text-[11px] text-slate-400">{error}</p>}
      </div>
    </GlassModal>
  );
};
