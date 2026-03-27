import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Calendar, CalendarDays, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { cn } from '@/src/lib/utils';

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
  onCreateRoutine: (name: string, options?: { sameTemplateAllWeeks: boolean }) => void;
  onRenameRoutine: (routineId: string, name: string) => void;
  onDeleteRoutine: (routineId: string) => void;
  onToggleHiddenRoutine?: (routineId: string) => void;
}

export const RoutineManagerView: React.FC<RoutineManagerViewProps> = ({
  routines,
  onBack,
  onActivateRoutine,
  onCreateRoutine,
  onRenameRoutine,
  onDeleteRoutine,
  onToggleHiddenRoutine,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  /** true = mes (por defecto), false = semana (ciclo 4 semanas). */
  const [createPlanSameTemplateAllWeeks, setCreatePlanSameTemplateAllWeeks] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleCreate = () => {
    const trimmed = newRoutineName.trim();
    if (!trimmed) return;
    onCreateRoutine(trimmed, { sameTemplateAllWeeks: createPlanSameTemplateAllWeeks });
    setNewRoutineName('');
    setCreatePlanSameTemplateAllWeeks(true);
    setShowCreateModal(false);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewRoutineName('');
    setCreatePlanSameTemplateAllWeeks(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-32"
    >
      <header className="mb-6 sm:mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="rounded-xl border-2">
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100">Rutinas</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Elige la rutina activa o crea una nueva</p>
          </div>
        </div>
      </header>

      <section className="mb-6">
        <Button
          variant="primary"
          onClick={() => {
            setCreatePlanSameTemplateAllWeeks(true);
            setShowCreateModal(true);
          }}
          className="w-full sm:w-auto rounded-xl"
        >
          <Plus size={14} className="mr-1" />
          Crear rutina
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
              onClick={closeCreateModal}
              className="absolute inset-0 min-h-[100dvh] bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-2xl dark:border dark:border-slate-700"
            >
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-4">Nueva rutina</h3>
              <Input
                value={newRoutineName}
                onChange={(e) => setNewRoutineName(e.target.value)}
                placeholder="Nombre (ej. Fuerza, Hipertrofia)"
                className="mb-4"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                Cómo ver el plan
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setCreatePlanSameTemplateAllWeeks(true)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-left transition-all',
                    createPlanSameTemplateAllWeeks
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-100'
                      : 'border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  )}
                >
                  <Calendar className="size-5 shrink-0" />
                  <span className="text-xs font-black">Mes</span>
                  <span className="text-[10px] font-medium leading-tight opacity-90">
                    Mismo contenido en todas las semanas (recomendado)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatePlanSameTemplateAllWeeks(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-left transition-all',
                    !createPlanSameTemplateAllWeeks
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-100'
                      : 'border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  )}
                >
                  <CalendarDays className="size-5 shrink-0" />
                  <span className="text-xs font-black">Semana</span>
                  <span className="text-[10px] font-medium leading-tight opacity-90">
                    Ciclo de 4 semanas (tipos 1–4)
                  </span>
                </button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={closeCreateModal}>
                  Cancelar
                </Button>
                <Button variant="primary" className="flex-1" onClick={handleCreate} disabled={!newRoutineName.trim()}>
                  Crear
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
              'border-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
              routine.isActive
                ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-lg dark:shadow-indigo-900/50'
                : 'border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500 dark:shadow-lg dark:shadow-black/30'
            )}
            onClick={(e) => {
              // Si no está editando y no es un clic en un botón, entrar a la rutina
              if (editingId !== routine.id && !(e.target as HTMLElement).closest('button')) {
                onActivateRoutine(routine.id);
              }
            }}
          >
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
                <Button variant="outline" size="sm" onClick={() => onActivateRoutine(routine.id)} className="rounded-lg border-2">
                  Activar
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
                onClick={() => onDeleteRoutine(routine.id)}
                className={cn(
                  'rounded-lg',
                  routine.isActive
                    ? '!bg-transparent text-white/90 hover:!bg-white/20 hover:text-white dark:text-white/90 dark:hover:!bg-white/20 dark:hover:text-white'
                    : 'text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30'
                )}
              >
                <Trash2 size={12} className="mr-1" />
                Borrar
              </Button>
            </div>
          </Card>
        ))}
      </section>
    </motion.div>
  );
};
