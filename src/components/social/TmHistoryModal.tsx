import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, TrendingUp, X } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
    const raw = (data?.points || []).map(p => ({ date: shortDate(p.dateISO), value: p.value }));
    return raw;
  }, [data]);

  const firstReal = (data?.points || []).find(p => p.value > 0)?.value;
  const last = data?.tm.value ?? tm.value;
  const delta = firstReal != null && last != null ? last - firstReal : 0;
  const pct = firstReal && firstReal > 0 ? (delta / firstReal) * 100 : 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        // Igual que el editor de plan: se abre sobre el perfil, que va a 99000.
        className="fixed inset-0 z-[99100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Progreso</p>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">{tm.name}</h2>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                {tm.value}
                <span className="ml-1 text-sm font-bold text-slate-400">{unit}</span>
              </p>
              {delta !== 0 && (
                <p className={`mt-1 inline-flex items-center gap-1 text-xs font-black ${delta > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  <TrendingUp size={13} className={delta < 0 ? 'rotate-180' : ''} />
                  {delta > 0 ? '+' : ''}
                  {delta} {unit}
                  {Number.isFinite(pct) && pct !== 0 ? ` · ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          {!data && !error ? (
            <div className="flex h-40 items-center justify-center text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <div className="h-44 w-full outline-none [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tm-hist-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="date" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip
                    cursor={false}
                    formatter={(v: number) => [`${v} ${unit}`, tm.name]}
                    contentStyle={{
                      backgroundColor: 'rgba(255,255,255,0.98)',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="none" fill="url(#tm-hist-fill)" tooltipType="none" />
                  <Line type="monotone" dataKey="value" stroke={color} strokeWidth={3} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {error && <p className="mt-2 text-center text-[11px] text-slate-400">{error}</p>}
          <p className="mt-3 text-center text-[11px] text-slate-400">
            Cómo ha ido subiendo esta marca desde que la apunta.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
