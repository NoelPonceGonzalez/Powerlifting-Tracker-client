import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dumbbell,
  Eye,
  EyeOff,
  FileUp,
  Layers,
  Loader2,
  ChevronRight,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { cn } from '@/src/lib/utils';
import { MODAL_RISE, PAGE_ENTER_ITEM, PAGE_ENTER_ROOT, SCREEN_TRANSITION, SLIME_SHEET_IN, SLIME_SHEET_OUT, SLIME_SHEET_SHOW, STICKY } from '@/src/lib/motionPresets';
import { usePageEnter } from '@/src/lib/usePageEnter';
import { useEscapeClose } from '@/src/lib/useEscapeClose';
import { useIncrementSignal } from '@/src/lib/useIncrementSignal';
import {
  addDays,
  formatWeekRangeFromDate,
  PLACEMENT_WEEK_STARTS_ON,
  startOfWeek,
  toISODate,
} from '@/src/lib/mesocycleWeek';

/** Al crear: una semana que se copia, o un ciclo de N semanas distintas. */
type PlanShape = 'repeat' | 'cycle';

interface RoutineSummary {
  id: string;
  name: string;
  isActive: boolean;
  hiddenFromSocial?: boolean;
  cycleLength?: number;
  sameTemplateAllWeeks?: boolean;
}

interface RoutineManagerViewProps {
  routines: RoutineSummary[];
  onActivateRoutine: (routineId: string) => void;
  onCreateRoutine: (
    name: string,
    options?: {
      sameTemplateAllWeeks: boolean;
      cycleLength?: number;
      importAfter?: boolean;
      cycleAnchorISO?: string;
      weekStartsOn?: number;
    }
  ) => void | Promise<void>;
  createRoutineLoading?: boolean;
  /** Rutina que se está eliminando en servidor (overlay en la tarjeta). */
  deleteRoutineLoadingId?: string | null;
  /** Rutina que se está activando (overlay en la tarjeta). */
  activateRoutineLoadingId?: string | null;
  onRenameRoutine: (routineId: string, name: string) => void;
  onDeleteRoutine: (routineId: string) => void | Promise<void>;
  onToggleHiddenRoutine?: (routineId: string) => void;
  /** Tick desde Progreso: abre el modal de crear. */
  openCreateSignal?: number;
  pageActive?: boolean;
}

export const RoutineManagerView: React.FC<RoutineManagerViewProps> = ({
  routines,
  onActivateRoutine,
  onCreateRoutine,
  createRoutineLoading = false,
  deleteRoutineLoadingId = null,
  activateRoutineLoadingId = null,
  onRenameRoutine,
  onDeleteRoutine,
  onToggleHiddenRoutine,
  openCreateSignal = 0,
  pageActive = true,
}) => {
  const deleteInFlight = deleteRoutineLoadingId != null;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [planShape, setPlanShape] = useState<PlanShape>('cycle');
  const [cycleWeeks, setCycleWeeks] = useState<number | ''>(4);
  const [importAfter, setImportAfter] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [startPlacement, setStartPlacement] = useState<'this' | 'prev' | 'date'>('this');
  const [customStartISO, setCustomStartISO] = useState(() => toISODate(startOfWeek(new Date(), PLACEMENT_WEEK_STARTS_ON)));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const thisWeekStart = startOfWeek(new Date(), PLACEMENT_WEEK_STARTS_ON);
  const week1Start =
    startPlacement === 'prev'
      ? addDays(thisWeekStart, -7)
      : startPlacement === 'date'
        ? startOfWeek(new Date(`${customStartISO}T12:00:00`), PLACEMENT_WEEK_STARTS_ON)
        : thisWeekStart;

  const resetCreateFields = () => {
    setPlanShape('cycle');
    setCycleWeeks(4);
    setImportAfter(false);
    setCreateStep(1);
    setStartPlacement('this');
    setCustomStartISO(toISODate(startOfWeek(new Date(), 1)));
  };

  useIncrementSignal('routine-create', openCreateSignal, () => {
    resetCreateFields();
    setShowCreateModal(true);
  });

  React.useEffect(() => {
    if (pageActive) return;
    setShowCreateModal(false);
    setEditingId(null);
  }, [pageActive]);
  const pageEnter = usePageEnter(pageActive);

  const handleCreate = async () => {
    if (createRoutineLoading) return;
    const trimmed = newRoutineName.trim();
    if (!trimmed) return;
    const sameTemplateAllWeeks = planShape === 'repeat';
    const resolvedCycleLength =
      planShape === 'repeat'
        ? 1
        : typeof cycleWeeks === 'number' && cycleWeeks >= 2
          ? Math.min(12, cycleWeeks)
          : 4;
    if (planShape !== 'repeat' && resolvedCycleLength < 2) return;
    try {
      await Promise.resolve(
        onCreateRoutine(trimmed, {
          sameTemplateAllWeeks,
          cycleLength: resolvedCycleLength,
          importAfter,
          cycleAnchorISO: toISODate(week1Start),
          weekStartsOn: PLACEMENT_WEEK_STARTS_ON,
        })
      );
      setNewRoutineName('');
      resetCreateFields();
      setShowCreateModal(false);
    } catch {
      /* Error: feedback en App; modal abierto */
    }
  };

  const closeCreateModal = () => {
    if (createRoutineLoading) return;
    setShowCreateModal(false);
    setNewRoutineName('');
    resetCreateFields();
  };
  useEscapeClose(showCreateModal && !createRoutineLoading, closeCreateModal);

  const openCreate = () => {
    resetCreateFields();
    setShowCreateModal(true);
  };

  return (
    <motion.div
      variants={PAGE_ENTER_ROOT}
      initial={false}
      animate={pageEnter}
      className="app-page mx-auto max-w-5xl"
    >
      <motion.header variants={PAGE_ENTER_ITEM} initial={false} className="mb-5 flex items-end justify-between gap-3 sm:mb-7">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-400">
            {routines.length === 0
              ? 'Aún no hay ninguna'
              : routines.length === 1
                ? '1 rutina'
                : `${routines.length} rutinas`}
          </p>
          <h1 className="text-[22px] font-black tracking-tight text-slate-900 dark:text-slate-100">Rutinas</h1>
        </div>
        {routines.length > 0 && (
          <button
            type="button"
            onClick={openCreate}
            disabled={createRoutineLoading || deleteInFlight}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-40"
          >
            {createRoutineLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
            Nueva
          </button>
        )}
      </motion.header>

      {routines.length === 0 && (
        <motion.div variants={PAGE_ENTER_ITEM} initial={false} className="flex min-h-[calc(100dvh-16rem)] items-center justify-center">
            <div className="relative w-full overflow-hidden rounded-[28px] border border-white/50 bg-white/70 px-6 py-12 text-center shadow-xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/65">
            <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-indigo-400/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-12 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl" />
            <span className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/35">
              <Dumbbell size={28} />
            </span>
            <h2 className="relative text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Empieza tu primera rutina
            </h2>
            <p className="relative mx-auto mt-2 max-w-[16.5rem] text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Elige cuántas semanas dura el ciclo. Luego la rellenas a mano o con un archivo.
            </p>
            <Button
              variant="primary"
              className="relative mx-auto mt-6 h-12 w-full max-w-xs rounded-2xl"
              onClick={openCreate}
              disabled={createRoutineLoading || deleteInFlight}
            >
              {createRoutineLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
              {createRoutineLoading ? 'Creando…' : 'Crear rutina'}
            </Button>
            <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-400">
                <Layers size={12} />
                Ciclo de semanas
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-400">
                <FileUp size={12} />
                O un archivo
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Modal crear rutina */}
      {showCreateModal && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 flex items-center justify-center p-4 min-h-[100dvh]" style={{ zIndex: 100000 }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SCREEN_TRANSITION}
              onClick={createRoutineLoading ? undefined : closeCreateModal}
              className={cn(
                'absolute inset-0 min-h-[100dvh] bg-slate-900/25 backdrop-blur-md dark:bg-black/45',
                createRoutineLoading && 'cursor-wait'
              )}
            />
            <motion.div
              initial={SLIME_SHEET_IN}
              animate={SLIME_SHEET_SHOW}
              exit={SLIME_SHEET_OUT}
              transition={STICKY}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/50 bg-white/75 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70"
            >
              {createRoutineLoading && (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl bg-white/90 dark:bg-slate-900/92 backdrop-blur-md"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <div className="relative flex size-16 items-center justify-center">
                    <div
                      className="absolute inset-0 rounded-full border-2 border-indigo-200/70 dark:border-indigo-500/25"
                      aria-hidden
                    />
                    <div
                      className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-indigo-600 border-r-indigo-400/80 dark:border-t-indigo-400 dark:border-r-indigo-500/50"
                      aria-hidden
                    />
                    <Dumbbell
                      className="relative size-7 text-indigo-600 dark:text-indigo-400"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">
                      Creando rutina
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Sincronizando con el servidor…
                    </p>
                  </div>
                </div>
              )}
              <motion.div
                initial={MODAL_RISE.initial}
                animate={MODAL_RISE.animate}
                transition={MODAL_RISE.transition}
              >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {createStep === 1 ? 'Nueva rutina' : 'El ciclo'}
                </h3>
                <p className="text-[11px] font-semibold text-slate-400">
                  {createStep} de {importAfter ? 3 : 2}
                </p>
              </div>

              {createStep === 1 && (
                <>
                  <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Nombre, cuánto dura y si traes un archivo.
                  </p>
                  <Input
                    value={newRoutineName}
                    onChange={(e) => setNewRoutineName(e.target.value)}
                    placeholder="Nombre (ej. Mesociclo 1, Fuerza)"
                    className="mb-4"
                    disabled={createRoutineLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newRoutineName.trim() && !createRoutineLoading) setCreateStep(2);
                    }}
                  />
                    <p className="mb-2 text-xs font-medium text-slate-400">¿Cuánto dura el plan?</p>
                  <div className={cn('mb-3 space-y-2', createRoutineLoading && 'pointer-events-none opacity-60')}>
                    <button
                      type="button"
                      onClick={() => setPlanShape('repeat')}
                      disabled={createRoutineLoading}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left shadow-sm transition-colors',
                        planShape === 'repeat'
                          ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40'
                          : 'bg-slate-50 dark:bg-slate-800'
                      )}
                    >
                      <Repeat className="mt-0.5 size-5 shrink-0 text-indigo-600 dark:text-indigo-300" />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">La misma semana, en bucle</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          Escribes o importas 1 semana. Se copia todas las demás.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanShape('cycle')}
                      disabled={createRoutineLoading}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left shadow-sm transition-colors',
                        planShape === 'cycle'
                          ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40'
                          : 'bg-slate-50 dark:bg-slate-800'
                      )}
                    >
                      <Layers className="mt-0.5 size-5 shrink-0 text-indigo-600 dark:text-indigo-300" />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Un ciclo de varias semanas</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          Cada semana puede ser distinta. Al acabar, vuelve a la 1.
                        </span>
                      </span>
                    </button>
                  </div>
                  <label
                    className={cn(
                      'mb-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 px-3.5 py-3 dark:bg-slate-800',
                      createRoutineLoading && 'pointer-events-none opacity-60'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={importAfter}
                      disabled={createRoutineLoading}
                      onChange={(e) => setImportAfter(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-600"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <FileUp size={14} className="shrink-0" />
                        Tengo un Word o PDF
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        Lo subes al final. Te digo qué hay y lo aplico.
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={closeCreateModal} disabled={createRoutineLoading}>
                      Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={() => setCreateStep(2)}
                      disabled={createRoutineLoading || !newRoutineName.trim()}
                    >
                      Siguiente
                    </Button>
                  </div>
                </>
              )}

              {createStep === 2 && (
                <>
                  <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {planShape === 'cycle' ? 'Cuántas semanas tiene el ciclo y cuándo empieza la 1.' : 'Cuándo empieza la semana 1.'}
                  </p>
                  {planShape === 'cycle' && (
                    <div className="mb-4">
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Semanas del ciclo
                      </label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={cycleWeeks}
                        disabled={createRoutineLoading}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          if (raw === '') { setCycleWeeks(''); return; }
                          setCycleWeeks(Math.min(12, parseInt(raw, 10)));
                        }}
                        className="text-center font-semibold"
                      />
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {typeof cycleWeeks === 'number' && cycleWeeks >= 2
                          ? `Quedan ${cycleWeeks} huecos. Un archivo de 2 semanas llena la 1 y la 2; el resto se puede añadir después.`
                          : 'Normalmente 4. Puede ser 3, 5… según el plan.'}
                      </p>
                    </div>
                  )}
                  <div className={cn('mb-4 space-y-3', createRoutineLoading && 'pointer-events-none opacity-60')}>
                    <div>
                      <p className="mb-2 text-xs font-medium text-slate-400">¿Cuándo empieza la semana 1?</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'this' as const, label: 'Esta', sub: formatWeekRangeFromDate(thisWeekStart) },
                          { id: 'prev' as const, label: 'La pasada', sub: formatWeekRangeFromDate(addDays(thisWeekStart, -7)) },
                        ]).map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setStartPlacement(opt.id)}
                            className={cn(
                              'rounded-2xl px-3 py-2.5 text-left',
                              startPlacement === opt.id
                                ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40'
                                : 'bg-slate-50 dark:bg-slate-800'
                            )}
                          >
                            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{opt.label}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">{opt.sub}</span>
                          </button>
                        ))}
                        <label
                          className={cn(
                            'col-span-2 rounded-2xl px-3 py-2.5 text-left',
                            startPlacement === 'date'
                              ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40'
                              : 'bg-slate-50 dark:bg-slate-800'
                          )}
                        >
                          <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Otra fecha</span>
                          <input
                            type="date"
                            value={customStartISO}
                            onChange={e => {
                              if (!e.target.value) return;
                              setCustomStartISO(e.target.value);
                              setStartPlacement('date');
                            }}
                            className="mt-1 w-full bg-transparent text-[11px] text-slate-500 focus:outline-none dark:text-slate-400"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setCreateStep(1)}
                      disabled={createRoutineLoading}
                    >
                      Atrás
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={() => void handleCreate()}
                      disabled={
                        createRoutineLoading ||
                        !newRoutineName.trim() ||
                        (planShape !== 'repeat' && (cycleWeeks === '' || Number(cycleWeeks) < 2))
                      }
                    >
                      {createRoutineLoading ? (
                        <>
                          <Loader2 size={14} className="animate-spin shrink-0" />
                          Creando…
                        </>
                      ) : importAfter ? (
                        'Siguiente'
                      ) : (
                        'Crear'
                      )}
                    </Button>
                  </div>
                </>
              )}
              </motion.div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      {routines.length > 0 && (
      <motion.section variants={PAGE_ENTER_ITEM} initial={false} className="flex flex-col gap-3">
        {routines.map((routine) => {
          const cycleLabel = routine.sameTemplateAllWeeks
            ? 'Misma semana, en bucle'
            : `Ciclo de ${routine.cycleLength ?? 4} semanas`;
          return (
          <div
            key={routine.id}
            className={cn(
              'relative overflow-hidden rounded-[28px] border transition-transform',
              deleteRoutineLoadingId === routine.id
                ? 'cursor-wait'
                : 'cursor-pointer active:scale-[0.99]',
              routine.isActive
                ? 'border-white/50 bg-white/75 shadow-xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70'
                : 'border-slate-200/70 bg-white/90 dark:border-slate-700 dark:bg-slate-800/70'
            )}
            onClick={(e) => {
              if (deleteInFlight || activateRoutineLoadingId != null) return;
              if (editingId !== routine.id && !(e.target as HTMLElement).closest('button, input')) {
                onActivateRoutine(routine.id);
              }
            }}
          >
            {routine.isActive && (
              <>
                <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-indigo-400/25 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -right-10 h-44 w-44 rounded-full bg-violet-400/20 blur-3xl" />
              </>
            )}
            {activateRoutineLoadingId === routine.id && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-indigo-900/40 backdrop-blur-sm dark:bg-indigo-950/50" role="status">
                <Loader2 size={28} className="animate-spin text-white" />
                <span className="text-xs font-black uppercase tracking-wider text-white">Activando…</span>
              </div>
            )}
            {deleteRoutineLoadingId === routine.id && (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-900/55 backdrop-blur-sm dark:bg-slate-950/70"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="relative flex size-12 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-white/25" aria-hidden />
                  <div
                    className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-white border-r-white/40"
                    aria-hidden
                  />
                  <Trash2 className="relative size-5 text-white" strokeWidth={2} aria-hidden />
                </div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/95">
                  Eliminando…
                </p>
              </div>
            )}

            <div className="relative flex items-start gap-3.5 p-4 sm:p-5">
              <span
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md',
                  routine.isActive
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/30'
                    : 'bg-slate-200 text-slate-500 shadow-none dark:bg-slate-700 dark:text-slate-300'
                )}
              >
                <Dumbbell size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {routine.isActive && (
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Activa
                    </span>
                  )}
                  {routine.hiddenFromSocial && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      Oculta
                    </span>
                  )}
                </div>
                {editingId === routine.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const trimmed = editingName.trim();
                        if (!trimmed) return;
                        onRenameRoutine(routine.id, trimmed);
                        setEditingId(null);
                        setEditingName('');
                      }
                    }}
                    className="mt-1.5 bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                    autoFocus
                  />
                ) : (
                  <h3 className="mt-1 truncate text-[19px] font-black tracking-tight text-slate-900 dark:text-slate-100">
                    {routine.name}
                  </h3>
                )}
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {routine.sameTemplateAllWeeks
                    ? <Repeat size={12} className="shrink-0" />
                    : <Layers size={12} className="shrink-0" />}
                  {cycleLabel}
                </p>
              </div>
              {routine.isActive && editingId !== routine.id && (
                <ChevronRight size={18} className="mt-3 shrink-0 text-slate-300 dark:text-slate-600" />
              )}
            </div>

            <div
              className="relative flex items-center gap-1 border-t border-slate-100/80 px-3 py-2 dark:border-white/5"
              onClick={(e) => e.stopPropagation()}
            >
              {onToggleHiddenRoutine && (
                <button
                  type="button"
                  onClick={() => onToggleHiddenRoutine(routine.id)}
                  disabled={deleteInFlight}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                    routine.hiddenFromSocial
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                  title={routine.hiddenFromSocial ? 'Oculta en el perfil' : 'Visible en el perfil'}
                >
                  {routine.hiddenFromSocial ? <EyeOff size={14} /> : <Eye size={14} />}
                  {routine.hiddenFromSocial ? 'Oculta' : 'Visible'}
                </button>
              )}
              {editingId === routine.id ? (
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = editingName.trim();
                    if (!trimmed) return;
                    onRenameRoutine(routine.id, trimmed);
                    setEditingId(null);
                    setEditingName('');
                  }}
                  disabled={deleteInFlight}
                  className="inline-flex h-9 items-center rounded-full px-2.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300"
                >
                  Guardar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(routine.id);
                    setEditingName(routine.name);
                  }}
                  disabled={deleteInFlight}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Pencil size={14} />
                  Renombrar
                </button>
              )}
              <button
                type="button"
                onClick={() => void onDeleteRoutine(routine.id)}
                disabled={deleteInFlight}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
              >
                {deleteRoutineLoadingId === routine.id ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : (
                  <Trash2 size={14} />
                )}
                Borrar
              </button>
            </div>
          </div>
          );
        })}
      </motion.section>
      )}
    </motion.div>
  );
};
