/**
 * Claves de log alineadas con el servidor (assembleRoutine.ts / disassembleLogsToCollections):
 * `w{planWeek}-d{planDayIndex}-e{exerciseIndex}` — ej. `w13-d0-e1`.
 * No usar `${week.id}-${day.id}-${ex.id}` (queda `w13-w13-d0-...` y el servidor ignora la entrada).
 */
import type { LogEntry, PlannedExercise, TrainingDay, TrainingWeek } from '@/src/types';

/** Resuelve el nombre del ejercicio en la plantilla a partir de la clave canónica `wN-dN-eN`. */
export function resolveExerciseNameFromRoutineLogKey(
  routine: { weeks: TrainingWeek[] },
  logKey: string
): string | undefined {
  const parsed = parseRoutineLogKey(logKey);
  if (!parsed) return undefined;
  const week = routine.weeks.find((w) => w.number === parsed.planWeek);
  if (!week) return undefined;
  const day = week.days[parsed.planDayIndex];
  if (!day) return undefined;
  const ex = day.exercises[parsed.exerciseIndex - 1];
  return ex?.name;
}

export const ROUTINE_LOG_KEY_RE = /^w(\d+)-d(\d+)-e(\d+)$/;

export function parseRoutineLogKey(
  key: string
): { planWeek: number; planDayIndex: number; exerciseIndex: number } | null {
  const m = ROUTINE_LOG_KEY_RE.exec(key);
  if (!m) return null;
  return {
    planWeek: parseInt(m[1], 10),
    planDayIndex: parseInt(m[2], 10),
    exerciseIndex: parseInt(m[3], 10),
  };
}

/** Claves legadas con prefijo (`…-w4-d0-e1`) o mezclas; el sufijo `wN-dN-eN` es canónico. */
export function parseRoutineLogKeyLoose(
  key: string
): { planWeek: number; planDayIndex: number; exerciseIndex: number } | null {
  const exact = parseRoutineLogKey(key);
  if (exact) return exact;
  const m = /w(\d+)-d(\d+)-e(\d+)$/.exec(key);
  if (!m) return null;
  return {
    planWeek: parseInt(m[1], 10),
    planDayIndex: parseInt(m[2], 10),
    exerciseIndex: parseInt(m[3], 10),
  };
}

export function routineLogKey(weekNumber: number, dayIndex: number, exerciseIndex1Based: number): string {
  return `w${weekNumber}-d${dayIndex}-e${exerciseIndex1Based}`;
}

function dayIndexInWeek(week: TrainingWeek, day: TrainingDay): number {
  const i = week.days.findIndex((d) => d.id === day.id);
  if (i >= 0) return i;
  const m = /-d(\d+)$/.exec(day.id);
  return m ? parseInt(m[1], 10) : 0;
}

function exerciseIndexInDay(day: TrainingDay, ex: PlannedExercise): number {
  const i = day.exercises.findIndex((e) => e.id === ex.id);
  if (i >= 0) return i + 1;
  const m = /-e(\d+)$/.exec(ex.id);
  return m ? parseInt(m[1], 10) : 1;
}

export function routineLogKeyFromIds(week: TrainingWeek, day: TrainingDay, ex: PlannedExercise): string {
  return routineLogKey(week.number, dayIndexInWeek(week, day), exerciseIndexInDay(day, ex));
}

/** Si `ex.id` termina en `wN-dN-eN` (p. ej. `template-w1-d0-e1` o `w13-d0-e1`), obtiene la clave canónica. */
export function routineLogKeyFromExerciseId(exId: string): string | null {
  const m = /w(\d+)-d(\d+)-e(\d+)$/.exec(exId);
  if (!m) return null;
  return routineLogKey(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
}

/** Lee log priorizando clave canónica y migrando clave legada si hace falta. */
export function getLogEntryForExercise(
  logs: Record<string, LogEntry> | undefined,
  week: TrainingWeek,
  day: TrainingDay,
  ex: PlannedExercise
): LogEntry {
  const empty: LogEntry = { rpe: '', notes: '', completed: false, sets: [] };
  if (!logs || typeof logs !== 'object') return empty;
  const canonical = routineLogKeyFromIds(week, day, ex);
  const legacy = `${week.id}-${day.id}-${ex.id}`;
  const fromExId = routineLogKeyFromExerciseId(ex.id);
  return logs[canonical] ?? logs[legacy] ?? (fromExId ? logs[fromExId] : undefined) ?? empty;
}

function logEntryHasData(e: LogEntry | undefined): boolean {
  if (!e) return false;
  if (e.completed) return true;
  if (e.notes?.trim()) return true;
  if (e.rpe?.trim()) return true;
  if (e.weight != null) return true;
  return !!(e.sets && e.sets.some((s) => s.weight != null || s.reps != null || s.completed));
}

/** Para handlers que solo reciben `logId` canónico: fusiona entrada legada cuya clave termina en la misma `wN-dN-eN`. */
export function resolveLogEntryForMerge(routineLogs: Record<string, LogEntry>, canonicalLogId: string): LogEntry {
  const empty: LogEntry = { rpe: '', notes: '', completed: false, sets: [] };
  const direct = routineLogs[canonicalLogId];
  if (logEntryHasData(direct)) return direct!;
  for (const [k, v] of Object.entries(routineLogs)) {
    if (k === canonicalLogId) continue;
    if (k.endsWith(canonicalLogId) && logEntryHasData(v)) return v;
  }
  return direct ?? empty;
}

/** Elimina claves legadas duplicadas al guardar bajo la clave canónica. */
export function stripLegacyLogKeysForCanonical(
  routineLogs: Record<string, LogEntry>,
  canonicalLogId: string
): Record<string, LogEntry> {
  const next: Record<string, LogEntry> = { ...routineLogs };
  for (const k of Object.keys(next)) {
    if (k !== canonicalLogId && k.endsWith(canonicalLogId)) {
      delete next[k];
    }
  }
  return next;
}

/**
 * Al eliminar el ejercicio en posición `exerciseIndex1Based` del día `dayIndex` en **todas** las semanas:
 * 1. Borra logs `wN-d{dayIndex}-e{exerciseIndex1Based}` para cada semana N.
 * 2. Reindexa `eM` → `e(M-1)` para M > exerciseIndex1Based (los ejercicios que se mueven una posición arriba).
 */
export function purgeAndReindexLogsAfterExerciseRemoval(
  logs: Record<string, LogEntry>,
  dayIndex: number,
  exerciseIndex1Based: number,
  totalWeeks = 52
): Record<string, LogEntry> {
  const next: Record<string, LogEntry> = {};
  for (const [key, val] of Object.entries(logs)) {
    const parsed = parseRoutineLogKey(key);
    if (!parsed) {
      next[key] = val;
      continue;
    }
    if (parsed.planDayIndex !== dayIndex) {
      next[key] = val;
      continue;
    }
    if (parsed.exerciseIndex === exerciseIndex1Based) continue;
    if (parsed.exerciseIndex > exerciseIndex1Based) {
      next[routineLogKey(parsed.planWeek, dayIndex, parsed.exerciseIndex - 1)] = val;
    } else {
      next[key] = val;
    }
  }
  return next;
}
