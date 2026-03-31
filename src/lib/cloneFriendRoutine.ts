import type { PlannedExercise, TrainingDay, TrainingWeek } from '@/src/types';

/** ObjectId de Mongo (24 hex): era el TM del amigo, no válido en tu cuenta. */
function sanitizeLinkedTo(linkedTo?: string): string | undefined {
  if (linkedTo == null || String(linkedTo).trim() === '') return undefined;
  const s = String(linkedTo).trim();
  if (/^[a-fA-F0-9]{24}$/.test(s)) return undefined;
  if (s.length > 128) return undefined;
  return s;
}

/**
 * Copia “pegada” de las 52 semanas: mismos datos de plan, IDs nuevos, sin _dbId.
 * Los vínculos linkedTo tipo "tm-1" se conservan; los ObjectId de TM del amigo se omiten.
 */
export function cloneFriendRoutineWeeks(weeks: TrainingWeek[]): TrainingWeek[] {
  return weeks.map((w, wi) => {
    const weekNum =
      typeof w.number === 'number' && w.number >= 1 && w.number <= 52 ? w.number : wi + 1;
    const wId = `w${weekNum}`;
    return {
      id: wId,
      number: weekNum,
      days: (w.days || []).map((d: TrainingDay, di: number) => ({
        id: `${wId}-d${di}`,
        name: d.name,
        type: d.type,
        exercises: (d.exercises || []).map((e: PlannedExercise, ei: number) => {
          const exId = `${wId}-d${di}-e${ei + 1}`;
          const linked = sanitizeLinkedTo(e.linkedTo);
          const ex: PlannedExercise = {
            id: exId,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            mode: e.mode,
          };
          if (e.pct != null) ex.pct = e.pct;
          if (e.pctPerSet?.length) ex.pctPerSet = [...e.pctPerSet];
          if (e.weight != null) ex.weight = e.weight;
          if (linked) ex.linkedTo = linked;
          return ex;
        }),
      })),
    };
  });
}

/** Mismos nombres/modos que el seed del servidor; valores 0 al crear la rutina copiada. */
export const DEFAULT_TM_SEED_ZERO: Array<{
  name: string;
  value: number;
  mode: 'weight' | 'reps' | 'seconds';
  linkedExercise?: 'bench' | 'squat' | 'deadlift';
}> = [
  { name: 'Press Banca', value: 0, mode: 'weight', linkedExercise: 'bench' },
  { name: 'Sentadilla', value: 0, mode: 'weight', linkedExercise: 'squat' },
  { name: 'Peso Muerto', value: 0, mode: 'weight', linkedExercise: 'deadlift' },
  { name: 'Dominadas', value: 0, mode: 'reps' },
  { name: 'Plancha', value: 0, mode: 'seconds' },
];
