import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { SCREEN_TRANSITION, SLIME_SHEET_IN, SLIME_SHEET_SHOW, STICKY } from '@/src/lib/motionPresets';
import { AlertCircle, CheckCircle2, FileUp, Loader2, X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { cn } from '@/src/lib/utils';
import { countPlanExercises, parseCoachPlan, type ParsedPlan } from '@/src/lib/coachPlan/parseCoachPlan';
import { readPlanFile } from '@/src/lib/coachPlan/readPlanFile';
import { firstWeekOfYearStartingInMonth, weekStartDateForWeekOfYear } from '@/src/lib/mesocycleWeek';
import { isAndroid, isIOS } from '@/src/pwa/installPrompt';

export interface ImportCoachPlanResult {
  plan: ParsedPlan;
  startWeekNumber: number;
  /** `false` = solo estas semanas; las siguientes quedan vacías hasta el próximo plan. */
  repeatAfterPlan: boolean;
  /** Cada cuántas semanas vuelve a empezar el plan (1 = todas las semanas igual). Solo si se repite. */
  cycleLength: number;
  clearUntouchedDays: boolean;
  importMaxes: boolean;
  /** Es el mismo plan ampliado: las semanas ya vividas se dejan como están. */
  continuesPreviousPlan: boolean;
}

export interface LastCoachImport {
  startWeekNumber: number;
  /** Semanas que traía el documento anterior. */
  weeks: number;
}

interface ImportCoachPlanModalProps {
  currentWeekNumber: number;
  /** Año del calendario del plan, para traducir número de semana a fechas. */
  planYear?: number;
  /** Última importación de esta rutina: permite continuar el mismo plan al recibir el documento ampliado. */
  lastImport?: LastCoachImport | null;
  /** Nombre de la rutina sobre la que se va a volcar. */
  routineName: string;
  /** Ciclo que ya eligió al crear la rutina. El archivo llena huecos; no lo cambia salvo que traiga más semanas. */
  routineCycleLength?: number;
  sameTemplateAllWeeks?: boolean;
  onClose: () => void;
  onConfirm: (result: ImportCoachPlanResult) => void | Promise<void>;
}

/**
 * En el móvil un `accept` solo con extensiones hace que Android (Drive) oculte
 * .docx/.xlsx. Sin filtro el selector enseña Archivos, Drive y Descargas;
 * el tipo se comprueba al leer el archivo.
 */
const DESKTOP_ACCEPT = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'application/pdf',
  'text/plain',
  'text/csv',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.xlsm',
  '.csv',
  '.pdf',
  '.txt',
  '.md',
].join(',');

function filePickerAccept(): string {
  if (typeof navigator !== 'undefined' && (isAndroid() || isIOS())) return '';
  return DESKTOP_ACCEPT;
}

/** «3–9 ago»: las fechas se entienden mejor que el número de semana civil. */
function formatWeekRange(weekNumber: number, year: number): string {
  const start = weekStartDateForWeekOfYear(weekNumber, year);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startTxt = start.toLocaleDateString('es-ES', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const endTxt = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${startTxt}–${endTxt}`;
}

export const ImportCoachPlanModal: React.FC<ImportCoachPlanModalProps> = ({
  currentWeekNumber,
  planYear = new Date().getFullYear(),
  lastImport,
  routineName,
  routineCycleLength,
  sameTemplateAllWeeks = false,
  onClose,
  onConfirm,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [startWeekNumber, setStartWeekNumber] = useState(currentWeekNumber);
  /** El número de semana solo se enseña si el usuario pide elegirla a mano. */
  const [customStartWeek, setCustomStartWeek] = useState(false);
  /** Un ciclo de varias semanas (tipo power) se repite; un doc de 1 semana suele ser “esta semana y ya”. */
  const [repeatAfterPlan, setRepeatAfterPlan] = useState(true);
  /** 0 mientras el usuario borra el campo; al confirmar se usa el ciclo de la rutina o el del documento. */
  const [cycleLength, setCycleLength] = useState(routineCycleLength && routineCycleLength >= 1 ? routineCycleLength : 0);
  const [expandCycle, setExpandCycle] = useState(false);
  const [useContinue, setUseContinue] = useState(false);
  const [clearUntouchedDays, setClearUntouchedDays] = useState(true);
  const [importMaxes, setImportMaxes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const totalExercises = useMemo(() => (plan ? countPlanExercises(plan) : 0), [plan]);

  const knownCycle = routineCycleLength && routineCycleLength >= 1 ? routineCycleLength : 0;
  /** Mismo plan ampliado: se respeta lo ya entrenado y el documento solo manda de esta semana en adelante. */
  const continuingPlan = useContinue && !!lastImport && startWeekNumber === lastImport.startWeekNumber;

  /** Atajos habituales; el número de semana civil no le dice nada a nadie. */
  const startOptions = useMemo(() => {
    const monthOfCurrent = weekStartDateForWeekOfYear(currentWeekNumber, planYear).getMonth();
    const nextMonthWeek =
      monthOfCurrent < 11 ? firstWeekOfYearStartingInMonth(planYear, monthOfCurrent + 1) : null;
    const raw = [
      ...(lastImport
        ? [{ id: 'continue', label: 'Continuar el plan', week: lastImport.startWeekNumber }]
        : []),
      { id: 'prev', label: 'La anterior', week: currentWeekNumber - 1 },
      { id: 'this', label: 'Esta semana', week: currentWeekNumber },
      { id: 'next', label: 'La que viene', week: currentWeekNumber + 1 },
      { id: 'month', label: 'El mes que viene', week: nextMonthWeek },
    ];
    const seen = new Set<number>();
    return raw.filter(o => {
      if (o.week === null || o.week < 1 || o.week > 52 || seen.has(o.week)) return false;
      seen.add(o.week);
      return true;
    }) as { id: string; label: string; week: number }[];
  }, [currentWeekNumber, planYear, lastImport]);

  const resolvedCycle = useMemo(() => {
    if (!plan) return knownCycle || 1;
    if (expandCycle) return Math.max(plan.weeks.length, cycleLength || plan.weeks.length, knownCycle || 0);
    if (knownCycle) return knownCycle;
    return Math.max(1, cycleLength || plan.weeks.length);
  }, [plan, expandCycle, cycleLength, knownCycle]);

  /** Explica qué pasará con las semanas del ciclo según el archivo. */
  const cyclePreview = useMemo(() => {
    if (!plan) return '';
    const fileWeeks = plan.weeks.length;
    const n = resolvedCycle;
    if (!repeatAfterPlan) {
      const lastPlanWeek = startWeekNumber + fileWeeks - 1;
      if (lastPlanWeek >= 52) return 'El plan llega hasta el final del año.';
      const nextStart = weekStartDateForWeekOfYear(lastPlanWeek + 1, planYear);
      return `Desde el ${nextStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} los días quedan vacíos hasta el siguiente archivo.`;
    }
    if (n === 1) return 'Se copia esa semana en bucle. Si más adelante importas varias semanas distintas, el ciclo pasará a tener esas.';
    if (fileWeeks < n) {
      return `El archivo llena las semanas 1 a ${fileWeeks} de tu ciclo de ${n}. Las demás se quedan como están. Si luego pasas un archivo con más semanas (1+2, o las ${n} de golpe), se irán pisando/añadiendo esas posiciones.`;
    }
    if (fileWeeks === n) return `Llena las ${n} semanas del ciclo. Luego se repetirá hasta que importes otro plan.`;
    return `El archivo trae ${fileWeeks} semanas. ${expandCycle ? `El ciclo pasa a ${fileWeeks} y se repetirá.` : `Solo se usan las primeras ${n} (tu ciclo).`}`;
  }, [plan, resolvedCycle, startWeekNumber, repeatAfterPlan, planYear, expandCycle]);

  /**
   * Lo que va a pasar, en frases, para poder confirmar sin abrir ningún ajuste.
   * Es el mismo estado que manejan los controles de abajo, solo contado.
   */
  const summary = useMemo(() => {
    if (!plan) return [];
    const when = continuingPlan
      ? `Continúa el plan que ya tenías, desde el ${formatWeekRange(startWeekNumber, planYear)}`
      : startWeekNumber === currentWeekNumber
        ? `Empieza esta semana (${formatWeekRange(startWeekNumber, planYear)})`
        : startWeekNumber === currentWeekNumber + 1
          ? `Empieza la semana que viene (${formatWeekRange(startWeekNumber, planYear)})`
          : `Empieza el ${formatWeekRange(startWeekNumber, planYear)}`;

    const rows = [when, cyclePreview];
    if (importMaxes && plan.maxes.length > 0) {
      rows.push(`Se guardarán los maximales del documento: ${plan.maxes.map(m => `${m.name} ${m.value}`).join(', ')}`);
    }
    if (!clearUntouchedDays) {
      rows.push('Se conserva lo que ya tuvieras en los días que el plan no menciona');
    }
    return rows.filter(Boolean);
  }, [plan, continuingPlan, startWeekNumber, currentWeekNumber, planYear, cyclePreview, importMaxes, clearUntouchedDays]);

  const handleFile = useCallback(async (file: File) => {
    setReading(true);
    setError(null);
    setPlan(null);
    setFileName(file.name);
    try {
      const { text } = await readPlanFile(file);
      const parsed = parseCoachPlan(text);
      if (parsed.weeks.length === 0) {
        setError(
          'No se ha reconocido ninguna semana. En Word o PDF pon "Semana 1", "Semana 2"…; en Excel vale el nombre de la hoja (S1, Sem 2, Week 1) y los días ("Lunes:", "Martes:").'
        );
        return;
      }
      setPlan(parsed);
      const keep = knownCycle;
      if (keep) {
        const grows = parsed.weeks.length > keep;
        setExpandCycle(grows);
        setCycleLength(grows ? parsed.weeks.length : keep);
        setRepeatAfterPlan(true);
      } else {
        setExpandCycle(false);
        setCycleLength(parsed.weeks.length);
        setRepeatAfterPlan(parsed.weeks.length > 1 || sameTemplateAllWeeks);
      }
      /**
       * Documento con al menos las mismas semanas que el anterior: casi siempre es el mismo plan con
       * semanas nuevas al final, así que se propone continuar donde empezó para no descolocarlo.
       */
      if (lastImport && parsed.weeks.length >= lastImport.weeks) {
        setCustomStartWeek(false);
        setStartWeekNumber(lastImport.startWeekNumber);
        setUseContinue(true);
      } else {
        setUseContinue(false);
        setStartWeekNumber(currentWeekNumber);
      }
    } catch (e: any) {
      setError(e?.message || 'No se ha podido leer el archivo.');
    } finally {
      setReading(false);
    }
  }, [lastImport, knownCycle, sameTemplateAllWeeks, currentWeekNumber]);

  const handleConfirm = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await onConfirm({
        plan,
        startWeekNumber,
        repeatAfterPlan,
        cycleLength: repeatAfterPlan ? resolvedCycle : plan.weeks.length,
        clearUntouchedDays,
        importMaxes,
        continuesPreviousPlan: continuingPlan,
      });
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100001] overflow-y-auto">
      <div className="flex min-h-[100dvh] items-start justify-center p-3 sm:items-center sm:p-5">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={SCREEN_TRANSITION}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/25 backdrop-blur-md dark:bg-black/45"
        />
        <motion.div
          initial={SLIME_SHEET_IN}
          animate={SLIME_SHEET_SHOW}
          transition={STICKY}
          onClick={e => e.stopPropagation()}
          className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/50 bg-white/75 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
            <div className="min-w-0">
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">
                Importar plan
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {knownCycle
                  ? `Tu ciclo es de ${knownCycle} ${knownCycle === 1 ? 'semana' : 'semanas'}. El archivo llena huecos; no hace falta que traiga el ciclo entero.`
                  : 'Word, Excel, PDF o texto. En el móvil puedes elegir desde Drive, Descargas o Archivos; se lee en el dispositivo, no se sube.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="app-icon-hit rounded-full bg-slate-50 text-slate-400 transition-colors hover:text-rose-500 dark:bg-slate-800"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={filePickerAccept()}
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={reading}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-6 text-indigo-700 transition-all hover:bg-indigo-100 active:scale-[0.99] disabled:opacity-60 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300"
            >
              {reading ? <Loader2 size={26} className="animate-spin" /> : <FileUp size={26} />}
              <span className="text-sm font-black uppercase tracking-wider">
                {reading ? 'Leyendo…' : fileName ? 'Elegir otro archivo' : 'Elegir archivo'}
              </span>
              {fileName && !reading && (
                <span className="max-w-full truncate text-xs font-medium text-indigo-500 dark:text-indigo-400">
                  {fileName}
                </span>
              )}
              {!fileName && !reading && (
                <span className="max-w-[16rem] text-center text-[11px] font-medium leading-snug text-indigo-500/80 dark:text-indigo-400/80">
                  Drive, Descargas o Archivos · Word, Excel o PDF
                </span>
              )}
            </button>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/40">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-500" />
                <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>
              </div>
            )}

            {plan && (
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                    {plan.weeks.length} {plan.weeks.length === 1 ? 'semana' : 'semanas'} · {totalExercises} ejercicios
                    {plan.maxes.length > 0 && ` · ${plan.maxes.length} maximales`}
                  </p>
                </div>

                {/* La preview escaneada va primero: es lo que quieres revisar. */}
                <div className="space-y-3">
                  {plan.weeks.map((w, i) => (
                    <div key={`${w.number}-${i}`} className="rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-700">
                        <p className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">
                          {w.label}
                        </p>
                        <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                          → {formatWeekRange(startWeekNumber + i, planYear)}
                        </p>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {w.days.map(d => (
                          <div key={d.dayIndex} className="px-4 py-2.5">
                            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
                              {d.name} · {d.exercises.length}
                            </p>
                            <ul className="space-y-1">
                              {d.exercises.map((e, k) => (
                                <li key={k} className="flex items-baseline justify-between gap-3 text-xs">
                                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                                    {e.name}
                                    {e.note && (
                                      <span className="ml-1 text-slate-400 dark:text-slate-500">· {e.note}</span>
                                    )}
                                  </span>
                                  <span className="shrink-0 font-bold text-slate-500 dark:text-slate-400">
                                    {e.setScheme ?? `${e.sets}×${e.reps}`}
                                    {e.mode === 'seconds' ? '"' : ''}
                                    {e.pct !== undefined
                                      ? ` · ${e.pct}%`
                                      : e.weight !== undefined
                                        ? ` · ${String(e.weight).replace('.', ',')} kg`
                                        : ''}
                                    {e.rpe && ` · RPE ${e.rpe}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {(plan.warnings.length > 0 || plan.unparsedLines.length > 0) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/30">
                    <p className="mb-1.5 text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Revisa esto
                    </p>
                    <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
                      {plan.warnings.map((w, i) => (
                        <li key={`w${i}`}>· {w}</li>
                      ))}
                      {plan.unparsedLines.slice(0, 6).map((l, i) => (
                        <li key={`u${i}`}>· No se ha entendido: «{l}»</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2.5">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Qué hace este archivo</p>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                    <p>
                      Trae <span className="font-semibold text-slate-800 dark:text-slate-100">{plan.weeks.length} {plan.weeks.length === 1 ? 'semana' : 'semanas'}</span>
                      {knownCycle
                        ? <> y tu ciclo es de <span className="font-semibold text-slate-800 dark:text-slate-100">{knownCycle}</span>.</>
                        : '.'}
                    </p>
                    <p className="mt-1.5">{cyclePreview}</p>
                  </div>

                  {knownCycle > 0 && plan.weeks.length > knownCycle && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandCycle(false);
                          setCycleLength(knownCycle);
                        }}
                        className={cn(
                          'flex-1 rounded-2xl px-3 py-2.5 text-left text-xs',
                          !expandCycle ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40' : 'bg-white shadow-sm dark:bg-slate-800'
                        )}
                      >
                        <span className="block font-semibold text-slate-800 dark:text-slate-100">Quedarme en {knownCycle}</span>
                        <span className="mt-0.5 block text-slate-500">Solo usa las primeras {knownCycle} del archivo.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandCycle(true);
                          setCycleLength(plan.weeks.length);
                        }}
                        className={cn(
                          'flex-1 rounded-2xl px-3 py-2.5 text-left text-xs',
                          expandCycle ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40' : 'bg-white shadow-sm dark:bg-slate-800'
                        )}
                      >
                        <span className="block font-semibold text-slate-800 dark:text-slate-100">Alargar a {plan.weeks.length}</span>
                        <span className="mt-0.5 block text-slate-500">El ciclo pasa a tener {plan.weeks.length} semanas.</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2">
                    {lastImport && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomStartWeek(false);
                          setStartWeekNumber(lastImport.startWeekNumber);
                          setUseContinue(true);
                          setRepeatAfterPlan(true);
                        }}
                        className={cn(
                          'rounded-2xl px-3.5 py-3 text-left',
                          continuingPlan
                            ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40'
                            : 'bg-white shadow-sm dark:bg-slate-800'
                        )}
                      >
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                          Es el mismo plan, con más semanas
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          La semana 1 sigue en el {formatWeekRange(lastImport.startWeekNumber, planYear)}.
                          {plan.weeks.length > lastImport.weeks
                            ? ` Antes tenías ${lastImport.weeks}; ahora trae ${plan.weeks.length}. Se añaden las nuevas. Lo ya entrenado no se toca.`
                            : ' Actualiza el ciclo. Lo ya entrenado no se toca.'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomStartWeek(false);
                        setStartWeekNumber(currentWeekNumber);
                        setUseContinue(false);
                        setRepeatAfterPlan(true);
                      }}
                      className={cn(
                        'rounded-2xl px-3.5 py-3 text-left',
                        !continuingPlan && startWeekNumber === currentWeekNumber
                          ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40'
                          : 'bg-white shadow-sm dark:bg-slate-800'
                      )}
                    >
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Meterlo desde esta semana
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                        La semana 1 del archivo cae en el {formatWeekRange(currentWeekNumber, planYear)}.
                        {knownCycle > 1 && plan.weeks.length < knownCycle
                          ? ` Llena ${plan.weeks.length} de ${knownCycle} huecos.`
                          : ' El ciclo se mantiene y se repetirá.'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <ul className="min-w-0 space-y-1">
                      {summary.map((row, i) => (
                        <li key={i} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          {row}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setShowOptions(v => !v)}
                      aria-expanded={showOptions}
                      className="shrink-0 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-400"
                    >
                      {showOptions ? 'Listo' : 'Más opciones'}
                    </button>
                  </div>

                {showOptions && (
                <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-700">
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">¿Cuándo empieza el plan?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {startOptions.map(opt => {
                        const active = !customStartWeek && startWeekNumber === opt.week;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setCustomStartWeek(false);
                              setStartWeekNumber(opt.week);
                              setUseContinue(opt.id === 'continue');
                            }}
                            className={cn(
                              'rounded-xl border-2 px-3 py-2 text-left transition-colors',
                              opt.id === 'continue' && 'col-span-2',
                              active
                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                                : 'border-slate-200 dark:border-slate-600'
                            )}
                          >
                            <span className={cn(
                              'block text-xs font-black uppercase tracking-wider',
                              active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'
                            )}>
                              {opt.label}
                            </span>
                            <span className="block text-[11px] font-medium text-slate-400">
                              {opt.id === 'continue'
                                ? `Sigue donde estaba: la semana 1 del documento vuelve al ${formatWeekRange(opt.week, planYear)}`
                                : formatWeekRange(opt.week, planYear)}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setCustomStartWeek(true)}
                        className={cn(
                          'rounded-xl border-2 px-3 py-2 text-left transition-colors',
                          customStartWeek
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                            : 'border-slate-200 dark:border-slate-600'
                        )}
                      >
                        <span className={cn(
                          'block text-xs font-black uppercase tracking-wider',
                          customStartWeek ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'
                        )}>
                          Otra semana
                        </span>
                        <span className="block text-[11px] font-medium text-slate-400">Elegir a mano</span>
                      </button>
                    </div>

                    {customStartWeek && (
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          Semana {startWeekNumber || '—'} del año
                          {startWeekNumber ? ` · ${formatWeekRange(startWeekNumber, planYear)}` : ''}
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoFocus
                          value={startWeekNumber === 0 ? '' : startWeekNumber}
                          onChange={e => {
                            const raw = e.target.value.replace(/\D/g, '');
                            setStartWeekNumber(raw === '' ? 0 : Math.min(52, parseInt(raw, 10)));
                          }}
                          onBlur={() => {
                            if (!startWeekNumber) setStartWeekNumber(currentWeekNumber);
                          }}
                          className="h-10 w-16 shrink-0 rounded-xl border-2 border-slate-200 text-center text-base font-black text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    )}

                    {continuingPlan && startWeekNumber < currentWeekNumber && (
                      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                        Lo que ya entrenaste se queda como está: el documento solo cambia de esta semana
                        ({formatWeekRange(currentWeekNumber, planYear)}) en adelante.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cuando acaban esas semanas</p>
                    <div className="flex gap-2">
                      {([
                        { value: false, label: 'No repetir' },
                        { value: true, label: 'Repetir en bucle' },
                      ] as const).map(opt => (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setRepeatAfterPlan(opt.value)}
                          className={cn(
                            'flex-1 rounded-xl border-2 px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors',
                            repeatAfterPlan === opt.value
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                              : 'border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {repeatAfterPlan && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-600 dark:text-slate-300">Se repite cada</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={cycleLength === 0 ? '' : cycleLength}
                            onChange={e => {
                              const raw = e.target.value.replace(/\D/g, '');
                              setCycleLength(raw === '' ? 0 : Math.min(52, parseInt(raw, 10)));
                            }}
                            onBlur={() => {
                              if (cycleLength < plan.weeks.length) setCycleLength(plan.weeks.length);
                            }}
                            className="h-11 w-16 rounded-xl border-2 border-slate-200 text-center text-lg font-black text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">sem.</span>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400">{cyclePreview}</p>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={clearUntouchedDays}
                      onChange={e => setClearUntouchedDays(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-600"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      Vaciar los días que el plan no menciona. Desactívalo si quieres conservar lo que ya tenías
                      en esos días.
                    </span>
                  </label>

                  {plan.maxes.length > 0 && (
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={importMaxes}
                        onChange={e => setImportMaxes(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-600"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        Crear los maximales que faltan:{' '}
                        <span className="font-semibold">
                          {plan.maxes.map(m => `${m.name} ${m.value}`).join(', ')}
                        </span>
                      </span>
                    </label>
                  )}
                </div>
                )}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-700">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={cn('flex-1', !plan && 'opacity-50')}
              disabled={!plan || saving || !startWeekNumber}
              onClick={handleConfirm}
            >
              {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
              {saving ? 'Aplicando…' : 'Aplicar al plan'}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>,
    document.body
  );
};
