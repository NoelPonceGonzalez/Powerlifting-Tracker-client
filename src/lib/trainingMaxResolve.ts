import type { PlannedExercise, TrainingMax, RMData } from '@/src/types';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';

/** Vinculación explícita: id, big3, o nombre en linkedTo / nombre del ejercicio. */
export function resolveLinkedTMFromList(
  exercise: PlannedExercise,
  tmList: TrainingMax[]
): TrainingMax | undefined {
  if (!exercise.linkedTo?.trim()) return undefined;
  const byId = tmList.find((tm) => tm.id === exercise.linkedTo);
  if (byId) return byId;
  const byLinked = tmList.find((tm) => tm.linkedExercise === (exercise.linkedTo as keyof RMData));
  if (byLinked) return byLinked;
  const norm = (s?: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  return tmList.find(
    (tm) =>
      norm(tm.name) === norm(exercise.linkedTo!) || norm(tm.name) === norm(exercise.name)
  );
}

/**
 * TM de rutina para % y subida automática desde series: linkedTo si existe;
 * si no hay vínculo pero hay un TM en la rutina con el mismo nombre y modo, usa ese (marca oficial en DB).
 */
export function resolveTmForAutoBump(exercise: PlannedExercise, tmList: TrainingMax[]): TrainingMax | undefined {
  const linked = resolveLinkedTMFromList(exercise, tmList);
  if (linked) return linked;
  const nk = normalizeExerciseNameKey(exercise.name);
  return tmList.find(
    (tm) =>
      normalizeExerciseNameKey(tm.name) === nk &&
      tm.mode === exercise.mode &&
      !tm.isInternal
  );
}
