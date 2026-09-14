import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Dumbbell,
  Eye,
  EyeOff,
  FileUp,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { cn } from '@/src/lib/utils';
import { VIEW_TRANSITION } from '@/src/lib/motionPresets';

/** Cómo se comporta la plantilla: igual siempre, oleada de pesos, o bloque que se cambia. */
type PlanShape = 'repeat' | 'wave' | 'block';

interface RoutineSummary {
  id: string;
  name: string;
  isActive: boolean;
  hiddenFromSocial?: boolean;
}

interface RoutineManagerViewProps {
  routines: RoutineSummary[];
  onBack: () => void;
  onActivateRoutine: (routineId: string) => void;
  onCreateRoutine: (
    name: string,
    options?: { sameTemplateAllWeeks: boolean; cycleLength?: number; importAfter?: boolean }
  ) => void | Promise<void>;
  createRoutineLoading?: boolean;
  /** Rutina que se está eliminando en servidor (overlay en la tarjeta). */
  deleteRoutineLoadingId?: string | null;
  /** Rutina que se está activando (overlay en la tarjeta). */
  activateRoutineLoadingId?: string | null;
  onRenameRoutine: (routineId: string, name: string) => void;
  onDeleteRoutine: (routineId: string) => void | Promise<void>;
  onToggleHiddenRoutine?: (routineId: string) => void;
}

export const RoutineManagerView: React.FC<RoutineManagerViewProps> = ({
  routines,
  onBack,
  onActivateRoutine,
  onCreateRoutine,
  createRoutineLoading = false,
  deleteRoutineLoadingId = null,
  activateRoutineLoadingId = null,
  onRenameRoutine,
  onDeleteRoutine,
  onToggleHiddenRoutine,
}) => {
  const deleteInFlight = deleteRoutineLoadingId != null;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [planShape, setPlanShape] = useState<PlanShape>('wave');
  const [waveWeeks, setWaveWeeks] = useState<number | ''>(4);
  const [importAfter, setImportAfter] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = async () => {
    if (createRoutineLoading) return;
    const trimmed = newRoutineName.trim();
    if (!trimmed) return;
    const sameTemplateAllWeeks = planShape === 'repeat';
    const resolvedCycleLength =
      planShape === 'repeat'
        ? 1
        : typeof waveWeeks === 'number' && waveWeeks >= 2
          ? Math.min(12, waveWeeks)
          : 4;
    if (planShape !== 'repeat' && resolvedCycleLength < 2) return;
    try {
      await Promise.resolve(
        onCreateRoutine(trimmed, {
          sameTemplateAllWeeks,
          cycleLength: resolvedCycleLength,
          importAfter,
        })
      );
      setNewRoutineName('');
      setPlanShape('wave');
      setWaveWeeks(4);
      setImportAfter(false);
      setShowAdvanced(false);
      setShowCreateModal(false);
    } catch {
      /* Error: feedback en App; modal abierto */
    }
  };

  const closeCreateModal = () => {
    if (createRoutineLoading) return;
    setShowCreateModal(false);
    setNewRoutineName('');
    setPlanShape('wave');
    setWaveWeeks(4);
    setImportAfter(false);
    setShowAdvanced(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={VIEW_TRANSITION}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-32"
    >
      <header className="mb-6 sm:mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={createRoutineLoading || deleteInFlight}
            className="rounded-xl border-2"
          >
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Rutinas</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Elige con cuál entrenas. Crear una es un nombre y listo.
            </p>
          </div>
        </div>
      </header>

      <section className="mb-6">
        <Button
          variant="primary"
          onClick={() => {
            setPlanShape('wave');
            setImportAfter(false);
            setShowAdvanced(false);
            setShowCreateModal(true);
          }}
          disabled={createRoutineLoading || deleteInFlight}
          className="w-full sm:w-auto rounded-xl"
        >
          {createRoutineLoading ? (
            <Loader2 size={14} className="animate-spin shrink-0" />
          ) : (
            <Plus size={14} className="mr-1" />
          )}
          {createRoutineLoading ? 'Creando…' : 'Crear rutina'}
        </Button>
      </section>

      {/* Modal crear rutina */}
      {showCreateModal && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 flex items-center justify-center p-4 min-h-[100dvh]" style={{ zIndex: 100000 }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={createRoutineLoading ? undefined : closeCreateModal}
              className={cn(
                'absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm',
                createRoutineLoading && 'cursor-wait'
              )}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="relative overflow-hidden bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-2xl dark:border dark:border-slate-700 max-h-[92dvh] overflow-y-auto"
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
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Nueva rutina</h3>
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                Un nombre y listo. Lo avanzado, solo si lo necesitas.
              </p>
              <Input
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                placeholder="Nombre (ej. 4º ciclo, Fuerza)"
                className="mb-4"
                disabled={createRoutineLoading}
                onKeyDown={(e) => e.key === 'Enter' && !createRoutineLoading && void handleCreate()}
              />
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="mb-3 text-xs font-semibold text-slate-500 hover:text-indigo-600"
              >
                {showAdvanced ? 'Menos opciones' : 'Cómo se comporta el plan'}
              </button>
              <div
                className={cn(
                  'mb-4 space-y-2',
                  !showAdvanced && 'hidden',
                  createRoutineLoading && 'pointer-events-none opacity-60'
                )}
              >
                {([
                  {
                    id: 'repeat' as const,
                    icon: Repeat,
                    title: 'Igual cada semana',
                    hint: 'Misma sesión siempre. Cambias un ejercicio y cambia en todas.',
                  },
                  {
                    id: 'wave' as const,
                    icon: TrendingUp,
                    title: 'Kilos distintos cada semana',
                    hint: 'Mismos ejercicios; kg y RPE cambian (S1 @6,5 → S2 @7…). Como tu ciclo.',
                  },
                  {
                    id: 'block' as const,
                    icon: Layers,
                    title: 'Bloque que se cambia',
                    hint: 'Cada mes (o cuando toque) cambias algún ejercicio o tiras el siguiente Word.',
                  },
                ]).map((opt) => {
                  const Icon = opt.icon;
                  const active = planShape === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPlanShape(opt.id)}
                      disabled={createRoutineLoading}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all',
                        active
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-100'
                          : 'border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      )}
                    >
                      <Icon className="mt-0.5 size-5 shrink-0" />
                      <span>
                        <span className="block text-sm font-black">{opt.title}</span>
                        <span className="mt-0.5 block text-[11px] font-medium leading-snug opacity-90">
                          {opt.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {showAdvanced && planShape !== 'repeat' && (
                <div className="mb-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1 block">
                    Semanas de este bloque
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={waveWeeks}
                    disabled={createRoutineLoading}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      if (raw === '') { setWaveWeeks(''); return; }
                      setWaveWeeks(Math.min(12, parseInt(raw, 10)));
                    }}
                    className="text-center font-black"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    {typeof waveWeeks === 'number'
                      ? `Semana 1 a ${waveWeeks} distintas; luego se puede repetir o importar el siguiente ciclo.`
                      : 'Normalmente 4, como un mesociclo.'}
                  </p>
                </div>
              )}
              <label
                className={cn(
                  'mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700',
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
                  <span className="flex items-center gap-1.5 text-sm font-black text-slate-800 dark:text-slate-100">
                    <FileUp size={14} className="shrink-0" />
                    Tengo un Word o PDF
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Al crear se abre el importador. El archivo se lee en tu móvil, no se sube.
                    Si más adelante te vinculas a un entrenador, él también podrá cambiarte este plan.
                  </span>
                </span>
              </label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={closeCreateModal}
                  disabled={createRoutineLoading}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => void handleCreate()}
                  disabled={
                    createRoutineLoading ||
                    !newRoutineName.trim() ||
                    (planShape !== 'repeat' && (waveWeeks === '' || Number(waveWeeks) < 2))
                  }
                >
                  {createRoutineLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin shrink-0" />
                      Creando…
                    </>
                  ) : importAfter ? (
                    'Crear e importar'
                  ) : (
                    'Crear vacía'
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {routines.map((routine) => (
          <Card
            key={routine.id}
            padding="md"
            rounded="xl"
            className={cn(
              'relative overflow-hidden border-2 transition-all',
              deleteRoutineLoadingId === routine.id
                ? 'cursor-wait'
                : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
              routine.isActive
                ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-lg dark:shadow-indigo-900/50'
                : 'border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500 dark:shadow-lg dark:shadow-black/30'
            )}
            onClick={(e) => {
              if (deleteInFlight || activateRoutineLoadingId != null) return;
              if (editingId !== routine.id && !(e.target as HTMLElement).closest('button')) {
                onActivateRoutine(routine.id);
              }
            }}
          >
            {activateRoutineLoadingId === routine.id && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-indigo-900/40 dark:bg-indigo-950/50 backdrop-blur-sm" role="status">
                <Loader2 size={28} className="animate-spin text-white" />
                <span className="text-xs font-black text-white uppercase tracking-wider">Activando…</span>
              </div>
            )}
            {deleteRoutineLoadingId === routine.id && (
              <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-900/55 dark:bg-slate-950/70 backdrop-blur-sm"
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
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <span className={cn('text-[10px] font-black uppercase tracking-widest', routine.isActive ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500')}>
                  {routine.isActive ? 'Activa' : 'Rutina'}
                </span>
                {editingId === routine.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <h3 className={cn('text-xl font-black mt-1', routine.isActive ? 'text-white' : 'text-slate-900 dark:text-slate-100')}>{routine.name}</h3>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              {onToggleHiddenRoutine && (
                <button
                  onClick={() => onToggleHiddenRoutine(routine.id)}
                  disabled={deleteInFlight}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors",
                    routine.isActive
                      ? routine.hiddenFromSocial
                        ? "border-amber-300/80 bg-amber-400/30 text-amber-100 dark:border-amber-400/80 dark:bg-amber-500/30 dark:text-amber-100"
                        : "border-white/40 bg-white/20 text-white hover:bg-white/30 dark:border-white/50 dark:bg-white/20 dark:text-white dark:hover:bg-white/30"
                      : routine.hiddenFromSocial
                        ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                        : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500"
                  )}
                  title={routine.hiddenFromSocial ? "Ocultar en perfil social (activado)" : "Mostrar en perfil social"}
                >
                  {routine.hiddenFromSocial ? <EyeOff size={12} /> : <Eye size={12} />}
                  {routine.hiddenFromSocial ? "Oculta" : "Visible"}
                </button>
              )}
              {!routine.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onActivateRoutine(routine.id)}
                  disabled={deleteInFlight || activateRoutineLoadingId != null}
                  className="rounded-lg border-2"
                >
                  {activateRoutineLoadingId === routine.id ? <><Loader2 size={14} className="animate-spin mr-1" /> Activando…</> : 'Activar'}
                </Button>
              )}

              {editingId === routine.id ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const trimmed = editingName.trim();
                    if (!trimmed) return;
                    onRenameRoutine(routine.id, trimmed);
                    setEditingId(null);
                    setEditingName('');
                  }}
                  disabled={deleteInFlight}
                  className={cn(
                    'rounded-lg border-2',
                    routine.isActive && '!bg-white/20 !border-white/50 text-white hover:!bg-white/30 dark:!bg-white/20 dark:!border-white/50 dark:hover:!bg-white/30'
                  )}
                >
                  Guardar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingId(routine.id);
                    setEditingName(routine.name);
                  }}
                  disabled={deleteInFlight}
                  className={cn(
                    'rounded-lg border-2',
                    routine.isActive && '!bg-white/20 !border-white/50 text-white hover:!bg-white/30 dark:!bg-white/20 dark:!border-white/50 dark:hover:!bg-white/30'
                  )}
                >
                  <Pencil size={12} className="mr-1" />
                  Renombrar
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onDeleteRoutine(routine.id)}
                disabled={deleteInFlight}
                className={cn(
                  'rounded-lg',
                  routine.isActive
                    ? '!bg-transparent text-white/90 hover:!bg-white/20 hover:text-white dark:text-white/90 dark:hover:!bg-white/20 dark:hover:text-white'
                    : 'text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30'
                )}
              >
                {deleteRoutineLoadingId === routine.id ? (
                  <Loader2 size={12} className="mr-1 animate-spin shrink-0" />
                ) : (
                  <Trash2 size={12} className="mr-1" />
                )}
                Borrar
              </Button>
            </div>
          </Card>
        ))}
      </section>
    </motion.div>
  );
};
