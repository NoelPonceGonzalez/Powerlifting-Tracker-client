import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { GlassModal } from '@/src/components/ui/GlassModal';
import { apiGet, apiPut } from '@/src/lib/api';
import { PAGE_ENTER_ITEM, PAGE_ENTER_ROOT } from '@/src/lib/motionPresets';

type Row = {
  id: string;
  name: string;
  avatar?: string | null;
  squat: number;
  bench: number;
  deadlift: number;
  total: number;
  points: number;
  mine?: boolean;
};

const MEDALS = [
  { bg: '#f6c945', fg: '#6b4e00', label: 'Oro' },
  { bg: '#d7dee7', fg: '#3d4754', label: 'Plata' },
  { bg: '#e09a5a', fg: '#5c3010', label: 'Bronce' },
];

function kg(n: number) {
  const rounded = Math.round(n * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return text.replace('.', ',');
}

function parseKg(raw: string) {
  const n = Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function SbdRankingScreen({
  marksOpen,
  onMarksOpenChange,
}: {
  marksOpen: boolean;
  onMarksOpenChange: (open: boolean) => void;
}) {
  const [board, setBoard] = useState<Row[]>([]);
  const [squat, setSquat] = useState('');
  const [bench, setBench] = useState('');
  const [deadlift, setDeadlift] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    return apiGet<{ me: { squat: number; bench: number; deadlift: number }; board: Row[] }>('/api/social/sbd')
      .then(data => {
        setBoard(data.board || []);
        const me = data.me;
        const has = !!(me && me.squat > 0 && me.bench > 0 && me.deadlift > 0);
        setJoined(has);
        setSquat(has ? String(me.squat) : '');
        setBench(has ? String(me.bench) : '');
        setDeadlift(has ? String(me.deadlift) : '');
      })
      .catch(() => setError('No se ha podido cargar el ranking.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    const sq = parseKg(squat);
    const bp = parseKg(bench);
    const dl = parseKg(deadlift);
    if (sq <= 0 || bp <= 0 || dl <= 0) {
      setError('Pon sentadilla, banca y peso muerto.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPut('/api/social/sbd', { squat: sq, bench: bp, deadlift: dl });
      const data = await apiGet<{ board: Row[] }>('/api/social/sbd');
      setBoard(data.board || []);
      setJoined(true);
      onMarksOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se han podido guardar las marcas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-8">
      <GlassModal open={marksOpen} onClose={() => onMarksOpenChange(false)} title="Tus marcas" subtitle="Sentadilla, banca y peso muerto" center>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['Sentadilla', 'SQ', squat, setSquat],
                ['Banca', 'BP', bench, setBench],
                ['Muerto', 'DL', deadlift, setDeadlift],
              ] as const
            ).map(([label, short, value, set]) => (
              <label key={short} className="block min-w-0">
                <span className="mb-1 block truncate text-[11px] font-semibold text-slate-400">{label}</span>
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={e => set(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="kg"
                  className="h-12 w-full rounded-2xl bg-white px-2 text-center text-base font-semibold text-slate-900 ring-1 ring-black/[0.06] focus:outline-none focus:ring-indigo-300 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            ))}
          </div>
          <Button variant="primary" className="w-full rounded-2xl" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {joined ? 'Actualizar marcas' : 'Apuntarme'}
          </Button>
          {error && <p className="text-center text-xs font-semibold text-rose-500">{error}</p>}
        </div>
      </GlassModal>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : board.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {error && !marksOpen ? error : 'Todavía no hay marcas. Apunta las tuyas arriba a la derecha.'}
        </p>
      ) : (
        <motion.ol className="space-y-3" initial="hidden" animate="show" variants={PAGE_ENTER_ROOT}>
          {board.map((row, i) => {
            const medal = MEDALS[i];
            const cols = [
              ['SQ', kg(row.squat), false],
              ['BP', kg(row.bench), false],
              ['DL', kg(row.deadlift), false],
              ['Total', kg(row.total), false],
              ['GL', kg(row.points), true],
            ] as const;
            return (
              <motion.li
                key={row.id}
                variants={PAGE_ENTER_ITEM}
                className="grid items-center gap-x-4 rounded-2xl bg-white px-4 py-3.5 dark:bg-slate-900"
                style={{ gridTemplateColumns: '1.75rem 2rem minmax(4.5rem,1.1fr) repeat(5, minmax(0,1fr))' }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center justify-self-center rounded-full text-[12px] font-black"
                  style={{ background: medal?.bg || '#e8edf3', color: medal?.fg || '#475569' }}
                >
                  {i + 1}
                </span>
                <Avatar src={row.avatar} userId={row.id} name={row.name} className="h-8 w-8 justify-self-center rounded-full" />
                <span className="min-w-0 truncate pr-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                  {row.name}
                </span>
                {cols.map(([label, value, emphasis]) => (
                  <div key={label} className="min-w-0 text-center">
                    <p className="text-[10px] font-semibold uppercase leading-none tracking-wide text-slate-400">{label}</p>
                    <p className={`mt-1.5 truncate text-[14px] tabular-nums leading-none ${emphasis ? 'font-black text-slate-900 dark:text-slate-50' : 'font-semibold text-slate-800 dark:text-slate-100'}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </motion.li>
            );
          })}
        </motion.ol>
      )}
    </div>
  );
}
