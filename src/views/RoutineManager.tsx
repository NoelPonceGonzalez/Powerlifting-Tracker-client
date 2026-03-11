import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { cn } from '@/src/lib/utils';

interface RoutineSummary {
  id: string;
  name: string;
  isActive: boolean;
}

interface RoutineManagerViewProps {
  routines: RoutineSummary[];
  onBack: () => void;
  onActivateRoutine: (routineId: string) => void;
  onCreateRoutine: (name: string) => void;
  onRenameRoutine: (routineId: string, name: string) => void;
  onDeleteRoutine: (routineId: string) => void;
}

export const RoutineManagerView: React.FC<RoutineManagerViewProps> = ({
  routines,
  onBack,
  onActivateRoutine,
  onCreateRoutine,
  onRenameRoutine,
  onDeleteRoutine,
}) => {
  const [newRoutineName, setNewRoutineName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pb-32"
    >
      <header className="mb-6 sm:mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="rounded-xl border-2">
            <ArrowLeft size={14} />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900">Rutinas</h1>
            <p className="text-sm text-slate-500 font-medium">Elige la rutina activa o crea una nueva</p>
          </div>
        </div>
      </header>

      <section className="mb-6">
        <Card padding="md" rounded="xl" className="border-2 border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={newRoutineName}
              onChange={(e) => setNewRoutineName(e.target.value)}
              placeholder="Nombre de rutina (ej. Fuerza, Hipertrofia)"
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={() => {
                const trimmed = newRoutineName.trim();
                if (!trimmed) return;
                onCreateRoutine(trimmed);
                setNewRoutineName('');
              }}
              className="rounded-xl"
            >
              <Plus size={14} className="mr-1" />
              Crear rutina
            </Button>
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {routines.map((routine) => (
          <Card
            key={routine.id}
            padding="md"
            rounded="xl"
            className={cn(
              'border-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
              routine.isActive ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'border-slate-100 bg-white hover:border-indigo-300'
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
                <span className={cn('text-[10px] font-black uppercase tracking-widest', routine.isActive ? 'text-indigo-100' : 'text-slate-400')}>
                  {routine.isActive ? 'Activa' : 'Rutina'}
                </span>
                {editingId === routine.id ? (
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 bg-white text-slate-900"
                  />
                ) : (
                  <h3 className={cn('text-xl font-black mt-1', routine.isActive ? 'text-white' : 'text-slate-900')}>{routine.name}</h3>
                )}
              </div>
              {routine.isActive && <Check size={18} />}
            </div>

            <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
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
                  className="rounded-lg border-2"
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
                  className="rounded-lg border-2"
                >
                  <Pencil size={12} className="mr-1" />
                  Renombrar
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteRoutine(routine.id)}
                className={cn('rounded-lg', routine.isActive ? 'text-white hover:bg-white/20' : 'text-rose-500 hover:bg-rose-50')}
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
