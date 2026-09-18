import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { SCREEN_TRANSITION, SLIME_SHEET_IN, SLIME_SHEET_SHOW, STICKY } from '@/src/lib/motionPresets';
import { FileUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/src/lib/api';
import { createEmptyTemplate, expandRoutineFromApi } from '@/src/lib/planMaterialize';
import { mergeCoachImportIntoRoutine } from '@/src/lib/coachPlan/applyCoachPlan';
import { buildPlanPatchPayload } from '@/src/lib/planSyncPayload';
import { weekOfYearFromDate } from '@/src/lib/mesocycleWeek';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import type { ImportCoachPlanResult } from '@/src/components/ImportCoachPlanModal';
import type { DayType, PlannedExercise, TrainingDay, TrainingWeek } from '@/src/types';

const ImportCoachPlanModal = React.lazy(() =>
  import('@/src/components/ImportCoachPlanModal').then(m => ({ default: m.ImportCoachPlanModal }))
);

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface AthleteTm {
  id: string;
  name: string;
  value: number;
}

interface CoachAthletePlanProps {
  athleteId: string;
  athleteName: string;
  onClose: () => void;
}

function mapTm(raw: { _id?: unknown; id?: string; name?: string; value?: number }): AthleteTm {
  return {
    id: String(raw.id || raw._id || ''),
    name: String(raw.name || ''),
    value: Number(raw.value) || 0,
  };
}

function newExercise(): PlannedExercise {
  return {
    id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    sets: 3,
    reps: '5',
    mode: 'weight',
  };
}

export const CoachAthletePlan: React.FC<CoachAthletePlanProps> = ({ athleteId, athleteName, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [routineId, setRoutineId] = useState('');
  const [cycleLength, setCycleLength] = useState(4);
  const [template, setTemplate] = useState<TrainingWeek[]>([]);
  const [sameAll, setSameAll] = useState(false);
  const [tms, setTms] = useState<AthleteTm[]>([]);
  const [weekIdx, setWeekIdx] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [tmName, setTmName] = useState('');
  const [tmValue, setTmValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let raw: any;
      try {
        raw = await apiGet<any>(`/api/routines/athlete/${athleteId}`);
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (!msg.includes('no tiene rutina')) throw e;
        const bt = createEmptyTemplate(4);
        raw = await apiPost<any>('/api/routines', {
          name: `Plan de ${athleteName}`,
          forAthleteId: athleteId,
          sameTemplateAllWeeks: false,
          cycleLength: 4,
          isActive: true,
          baseTemplate: bt,
          versions: [{ effectiveFromWeek: 1, weeks: bt }],
        });
      }
      const expanded = expandRoutineFromApi(raw);
      const tpl =
        expanded.baseTemplate?.length
          ? expanded.baseTemplate
          : expanded.versions?.[expanded.versions.length - 1]?.weeks || createEmptyTemplate(expanded.cycleLength || 4);
      setRoutineId(expanded.id);
      setCycleLength(expanded.cycleLength || tpl.length || 4);
      setSameAll(expanded.sameTemplateAllWeeks === true);
      setTemplate(tpl);
      const rows = await apiGet<any[]>(`/api/training-maxes?routineId=${expanded.id}`).catch(() => []);
      setTms((Array.isArray(rows) ? rows : []).map(mapTm));
    } catch (e: any) {
      setError(e?.message || 'No se ha podido abrir el plan');
    } finally {
      setLoading(false);
    }
  }, [athleteId, athleteName]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (nextTemplate: TrainingWeek[], nextCycle = cycleLength, nextSame = sameAll) => {
      if (!routineId) return;
      setSaving(true);
      setError('');
      try {
        await apiPatch(
          `/api/routines/${routineId}/plan`,
          buildPlanPatchPayload({
            weeks: nextTemplate,
            baseTemplate: nextTemplate,
            versions: [{ effectiveFromWeek: 1, cycleLength: nextCycle, weeks: nextTemplate }],
            sameTemplateAllWeeks: nextSame,
            cycleLength: nextCycle,
          })
        );
      } catch (e: any) {
        setError(e?.message || 'No se ha podido guardar');
      } finally {
        setSaving(false);
      }
    },
    [routineId, cycleLength, sameAll]
  );

  const patchExercise = (dayId: string, exerciseId: string, patch: Partial<PlannedExercise>) => {
    setTemplate(prev =>
      prev.map((week, i) =>
        i !== weekIdx
          ? week
          : {
              ...week,
              days: week.days.map(day =>
                day.id !== dayId
                  ? day
                  : {
                      ...day,
                      exercises: day.exercises.map(ex => (ex.id === exerciseId ? { ...ex, ...patch } : ex)),
                    }
              ),
            }
      )
    );
  };

  const patchDay = (dayId: string, patch: Partial<TrainingDay>) => {
    setTemplate(prev =>
      prev.map((week, i) =>
        i !== weekIdx
          ? week
          : {
              ...week,
              days: week.days.map(day => (day.id !== dayId ? day : { ...day, ...patch })),
            }
      )
    );
  };

  const addExercise = (dayId: string) => {
    setTemplate(prev =>
      prev.map((week, i) =>
        i !== weekIdx
          ? week
          : {
              ...week,
              days: week.days.map(day =>
                day.id !== dayId ? day : { ...day, type: 'workout', exercises: [...day.exercises, newExercise()] }
              ),
            }
      )
    );
  };

  const removeExercise = (dayId: string, exerciseId: string) => {
    setTemplate(prev =>
      prev.map((week, i) =>
        i !== weekIdx
          ? week
          : {
              ...week,
              days: week.days.map(day =>
                day.id !== dayId ? day : { ...day, exercises: day.exercises.filter(ex => ex.id !== exerciseId) }
              ),
            }
      )
    );
  };

  const addAthleteTm = async () => {
    const name = tmName.trim();
    const value = Number(tmValue.replace(',', '.'));
    if (!routineId || !name || !Number.isFinite(value) || value <= 0) return;
    try {
      const created = await apiPost<any>('/api/training-maxes', {
        routineId,
        name,
        value,
        mode: 'weight',
        sharedToSocial: true,
      });
      setTms(prev => [...prev, mapTm(created)]);
      setTmName('');
      setTmValue('');
    } catch (e: any) {
      setError(e?.message || 'No se ha podido crear el maximal');
    }
  };

  const applyImport = async (opts: ImportCoachPlanResult) => {
    if (!routineId) return;
    const year = new Date().getFullYear();
    const cl = Math.max(1, Math.min(52, opts.cycleLength || opts.plan.weeks.length || cycleLength || 4));
    const raw = await apiGet<any>(`/api/routines/athlete/${athleteId}`);
    const current = expandRoutineFromApi({
      _id: raw._id,
      id: raw.id || routineId,
      name: raw.name,
      sameTemplateAllWeeks: raw.sameTemplateAllWeeks,
      cycleLength: raw.cycleLength,
      weeks: raw.weeks,
      versions: raw.versions,
      baseTemplate: raw.baseTemplate,
      weekTypeOverrides: raw.weekTypeOverrides,
      logs: raw.logs,
      skippedWeeks: raw.skippedWeeks,
      shiftedAtCalendarWeeks: raw.shiftedAtCalendarWeeks,
    });
    const merged = mergeCoachImportIntoRoutine(current, {
      plan: opts.plan,
      startWeekNumber: opts.startWeekNumber,
      repeatAfterPlan: opts.repeatAfterPlan,
      cycleLength: cl,
      clearUntouchedDays: opts.clearUntouchedDays,
      continuesPreviousPlan: opts.continuesPreviousPlan,
      currentWeekOfYear: weekOfYearFromDate(new Date(), year),
    });
    await apiPatch(`/api/routines/${routineId}/plan`, buildPlanPatchPayload(merged));
    if (opts.importMaxes) {
      for (const max of opts.plan.maxes) {
        const already = tms.some(t => normalizeExerciseNameKey(t.name) === normalizeExerciseNameKey(max.name));
        if (already) continue;
        try {
          const created = await apiPost<any>('/api/training-maxes', {
            routineId,
            name: max.name,
            value: max.value,
            mode: 'weight',
            sharedToSocial: true,
          });
          setTms(prev => [...prev, mapTm(created)]);
        } catch {
          /* el plan ya está guardado */
        }
      }
    }
    setCycleLength(merged.cycleLength);
    setSameAll(merged.sameTemplateAllWeeks);
    setTemplate(merged.baseTemplate?.length ? merged.baseTemplate : merged.weeks.slice(0, merged.cycleLength));
    setShowImport(false);
  };

  const week = template[weekIdx] || template[0];

  return createPortal(
    // Se abre desde el perfil del atleta, que se pinta a 99000 (ver Social.tsx y Profile.tsx).
    // Con un z-index menor el panel se monta pero queda tapado: el entrenador pulsa
    // «Editar su plan» y no ve nada.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={SCREEN_TRANSITION}
      className="fixed inset-0 z-[99100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
    >
      <motion.div
        initial={SLIME_SHEET_IN}
        animate={SLIME_SHEET_SHOW}
        transition={STICKY}
        className="flex max-h-[96vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-600">Editando su plan</p>
            <p className="truncate text-base font-black text-slate-900 dark:text-slate-100">{athleteName}</p>
          </div>
          {saving && <span className="text-[11px] font-bold uppercase text-slate-400">Guardando…</span>}
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-black uppercase text-white"
          >
            <FileUp size={14} />
            Word
          </button>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto px-4 py-4">
            {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}

            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-200">
                Maximales
              </p>
              {tms.length === 0 ? (
                <p className="mb-2 text-xs text-amber-800/80">Aún no tiene. El Word o el recuadro de abajo los crea.</p>
              ) : (
                <div className="mb-2 flex flex-wrap gap-2">
                  {tms.map(tm => (
                    <span
                      key={tm.id}
                      className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                    >
                      {tm.name} {tm.value}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={tmName}
                  onChange={e => setTmName(e.target.value)}
                  placeholder="Sentadilla"
                  className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-2 py-1.5 text-sm dark:border-amber-900 dark:bg-slate-900"
                />
                <input
                  value={tmValue}
                  onChange={e => setTmValue(e.target.value)}
                  placeholder="170"
                  inputMode="decimal"
                  className="w-20 rounded-xl border border-amber-200 bg-white px-2 py-1.5 text-sm dark:border-amber-900 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => void addAthleteTm()}
                  className="rounded-xl bg-amber-600 px-3 text-xs font-black uppercase text-white"
                >
                  Añadir
                </button>
              </div>
            </section>

            {template.length > 1 && (
              <div className="flex gap-1 overflow-x-auto">
                {template.map((w, i) => (
                  <button
                    key={w.id || i}
                    type="button"
                    onClick={() => setWeekIdx(i)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black uppercase ${
                      i === weekIdx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                    }`}
                  >
                    Semana {w.number || i + 1}
                  </button>
                ))}
              </div>
            )}

            {week?.days.map((day, di) => (
              <section key={day.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100">
                    {DAY_NAMES[di] || day.name}
                  </p>
                  <div className="flex items-center gap-1">
                    {([
                      ['workout', 'Entreno'],
                      ['rest', 'Descanso'],
                      ['deload', 'Descarga'],
                    ] as [DayType, string][]).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => patchDay(day.id, { type, exercises: type === 'rest' ? [] : day.exercises })}
                        className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                          (day.type || 'workout') === type
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    {day.type !== 'rest' && (
                      <button
                        type="button"
                        onClick={() => addExercise(day.id)}
                        className="inline-flex items-center gap-1 pl-1 text-[11px] font-black uppercase text-indigo-600"
                      >
                        <Plus size={12} />
                        Ejercicio
                      </button>
                    )}
                  </div>
                </div>
                {day.type === 'rest' || day.exercises.length === 0 ? (
                  <p className="text-xs text-slate-400">{day.type === 'rest' ? 'Día de descanso.' : 'Vacío.'}</p>
                ) : (
                  <div className="space-y-2">
                    {day.exercises.map(ex => (
                      <div key={ex.id} className="space-y-1.5 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
                        <div className="grid grid-cols-[1fr_44px_52px_56px_28px] items-center gap-1.5">
                          <input
                            value={ex.name}
                            onChange={e => patchExercise(day.id, ex.id, { name: e.target.value })}
                            placeholder="Ejercicio"
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                          <input
                            value={ex.sets}
                            onChange={e => patchExercise(day.id, ex.id, { sets: Number(e.target.value) || 0 })}
                            title="Series"
                            className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                          <input
                            value={ex.reps}
                            onChange={e => patchExercise(day.id, ex.id, { reps: e.target.value })}
                            title="Reps"
                            className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                          <input
                            value={ex.weight ?? ''}
                            onChange={e => {
                              const n = Number(String(e.target.value).replace(',', '.'));
                              patchExercise(day.id, ex.id, { weight: Number.isFinite(n) ? n : undefined });
                            }}
                            placeholder="kg"
                            title="Peso"
                            className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => removeExercise(day.id, ex.id)}
                            className="text-slate-400 hover:text-rose-500"
                            aria-label="Quitar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-[72px_1fr_56px] gap-1.5">
                          <input
                            value={ex.pct ?? ''}
                            onChange={e => {
                              const n = Number(String(e.target.value).replace(',', '.'));
                              patchExercise(day.id, ex.id, { pct: Number.isFinite(n) ? n : undefined });
                            }}
                            placeholder="% TM"
                            title="% del maximal"
                            className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                          <select
                            value={ex.linkedTo || ''}
                            onChange={e => patchExercise(day.id, ex.id, { linkedTo: e.target.value || undefined })}
                            className="rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                          >
                            <option value="">Sin maximal</option>
                            {tms.map(tm => (
                              <option key={tm.id} value={tm.id}>{tm.name}</option>
                            ))}
                          </select>
                          <input
                            value={ex.targetRpe ?? ''}
                            onChange={e => patchExercise(day.id, ex.id, { targetRpe: e.target.value || undefined })}
                            placeholder="RPE"
                            title="RPE"
                            className="rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-center text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                        </div>
                        <input
                          value={ex.coachNote ?? ''}
                          onChange={e => patchExercise(day.id, ex.id, { coachNote: e.target.value || undefined })}
                          placeholder="Nota para el alumno"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}

            <button
              type="button"
              disabled={saving || !routineId}
              onClick={() => void persist(template)}
              className="w-full rounded-2xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40"
            >
              Guardar plan
            </button>
          </div>
        )}
      </motion.div>

      {showImport && (
        <React.Suspense fallback={null}>
          <ImportCoachPlanModal
            currentWeekNumber={weekOfYearFromDate(new Date(), new Date().getFullYear())}
            routineName={`Plan de ${athleteName}`}
            routineCycleLength={cycleLength}
            sameTemplateAllWeeks={sameAll}
            onClose={() => setShowImport(false)}
            onConfirm={async result => {
              await applyImport(result);
            }}
          />
        </React.Suspense>
      )}
    </motion.div>,
    document.body
  );
};
