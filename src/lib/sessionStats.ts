import type { LogEntry, TrainingWeek } from '@/src/types';
import { routineLogKeyFromIds } from '@/src/lib/routineLogKey';
import { weekStartDateForWeekOfYear } from '@/src/lib/mesocycleWeek';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';

/** Epley: la misma fórmula que ya se muestra bajo cada serie al registrar. */
export function estimateOneRm(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return weight * (1 + reps / 30);
}

export interface SetRecord {
  exerciseName: string;
  dateMs: number;
  weekOfYear: number;
  weight: number;
  reps: number;
  e1rm: number;
}

export interface E1rmPoint {
  dateMs: number;
  e1rm: number;
  weight: number;
  reps: number;
}

export interface ExerciseE1rmSeries {
  key: string;
  name: string;
  points: E1rmPoint[];
  best: E1rmPoint;
  /** Diferencia en kg entre el mejor e1RM y el primero registrado. */
  deltaKg: number;
}

export interface WeeklyVolumePoint {
  weekOfYear: number;
  label: string;
  /** Tonelaje: suma de peso × reps de las series con peso. */
  tonnage: number;
  sets: number;
  reps: number;
}

export interface PersonalRecord {
  exerciseName: string;
  dateMs: number;
  e1rm: number;
  weight: number;
  reps: number;
  /** Mejora en kg respecto al récord anterior de ese ejercicio. */
  improvementKg: number;
}

export interface SessionStats {
  e1rmByExercise: ExerciseE1rmSeries[];
  weeklyVolume: WeeklyVolumePoint[];
  recentPrs: PersonalRecord[];
  totalTonnage: number;
  totalSets: number;
}

const EMPTY: SessionStats = {
  e1rmByExercise: [],
  weeklyVolume: [],
  recentPrs: [],
  totalTonnage: 0,
  totalSets: 0,
};

/**
 * Los logs no guardan fecha propia: se deduce de la semana civil de la plantilla
 * más el índice del día dentro de esa semana.
 */
function dateForLog(weekOfYear: number, dayIndex: number, year: number): number {
  const start = weekStartDateForWeekOfYear(weekOfYear, year);
  start.setDate(start.getDate() + dayIndex);
  start.setHours(12, 0, 0, 0);
  return start.getTime();
}

function collectSetRecords(
  weeks: TrainingWeek[],
  logs: Record<string, LogEntry>,
  year: number
): SetRecord[] {
  const out: SetRecord[] = [];
  const maxMs = Date.now();

  for (const week of weeks) {
    week.days.forEach((day, dayIndex) => {
      if (day.type === 'rest') return;
      const dateMs = dateForLog(week.number, dayIndex, year);
      if (dateMs > maxMs) return; // sesiones futuras del plan: aún no se han hecho

      for (const ex of day.exercises) {
        if (ex.mode !== 'weight') continue;
        const log = logs[routineLogKeyFromIds(week, day, ex)];
        if (!log?.sets?.length) continue;

        for (const s of log.sets) {
          const weight = typeof s.weight === 'number' ? s.weight : 0;
          const reps = typeof s.reps === 'number' ? s.reps : 0;
          if (!(weight > 0) || !(reps > 0)) continue;
          out.push({
            exerciseName: ex.name,
            dateMs,
            weekOfYear: week.number,
            weight,
            reps,
            e1rm: estimateOneRm(weight, reps),
          });
        }
      }
    });
  }

  return out.sort((a, b) => a.dateMs - b.dateMs);
}

function buildE1rmSeries(records: SetRecord[]): ExerciseE1rmSeries[] {
  // Un punto por ejercicio y día: la mejor serie de esa sesión.
  const byExercise = new Map<string, { name: string; byDay: Map<number, E1rmPoint> }>();

  for (const r of records) {
    const key = normalizeExerciseNameKey(r.exerciseName);
    let entry = byExercise.get(key);
    if (!entry) {
      entry = { name: r.exerciseName, byDay: new Map() };
      byExercise.set(key, entry);
    }
    const prev = entry.byDay.get(r.dateMs);
    if (!prev || r.e1rm > prev.e1rm) {
      entry.byDay.set(r.dateMs, { dateMs: r.dateMs, e1rm: r.e1rm, weight: r.weight, reps: r.reps });
    }
  }

  const series: ExerciseE1rmSeries[] = [];
  for (const [key, entry] of byExercise) {
    const points = [...entry.byDay.values()].sort((a, b) => a.dateMs - b.dateMs);
    if (points.length === 0) continue;
    const best = points.reduce((acc, p) => (p.e1rm > acc.e1rm ? p : acc), points[0]);
    series.push({
      key,
      name: entry.name,
      points,
      best,
      deltaKg: best.e1rm - points[0].e1rm,
    });
  }

  // Los ejercicios más trabajados primero: es lo que el usuario quiere ver de entrada.
  return series.sort((a, b) => b.points.length - a.points.length || b.best.e1rm - a.best.e1rm);
}

function buildWeeklyVolume(records: SetRecord[]): WeeklyVolumePoint[] {
  const byWeek = new Map<number, WeeklyVolumePoint>();

  for (const r of records) {
    let w = byWeek.get(r.weekOfYear);
    if (!w) {
      w = { weekOfYear: r.weekOfYear, label: `S${r.weekOfYear}`, tonnage: 0, sets: 0, reps: 0 };
      byWeek.set(r.weekOfYear, w);
    }
    w.tonnage += r.weight * r.reps;
    w.sets += 1;
    w.reps += r.reps;
  }

  return [...byWeek.values()].sort((a, b) => a.weekOfYear - b.weekOfYear);
}

function buildPrs(records: SetRecord[]): PersonalRecord[] {
  const bestSoFar = new Map<string, number>();
  const prs: PersonalRecord[] = [];

  for (const r of records) {
    const key = normalizeExerciseNameKey(r.exerciseName);
    const prev = bestSoFar.get(key);
    if (prev === undefined) {
      // El primer registro de un ejercicio no es un récord: es la referencia.
      bestSoFar.set(key, r.e1rm);
      continue;
    }
    // Margen de 0,5 kg para que el redondeo de discos no dispare falsos PR.
    if (r.e1rm > prev + 0.5) {
      prs.push({
        exerciseName: r.exerciseName,
        dateMs: r.dateMs,
        e1rm: r.e1rm,
        weight: r.weight,
        reps: r.reps,
        improvementKg: r.e1rm - prev,
      });
      bestSoFar.set(key, r.e1rm);
    }
  }

  return prs.sort((a, b) => b.dateMs - a.dateMs);
}

export function computeSessionStats(
  weeks: TrainingWeek[] | undefined,
  logs: Record<string, LogEntry> | undefined,
  year: number
): SessionStats {
  if (!weeks?.length || !logs) return EMPTY;

  const records = collectSetRecords(weeks, logs, year);
  if (records.length === 0) return EMPTY;

  return {
    e1rmByExercise: buildE1rmSeries(records),
    weeklyVolume: buildWeeklyVolume(records),
    recentPrs: buildPrs(records),
    totalTonnage: records.reduce((acc, r) => acc + r.weight * r.reps, 0),
    totalSets: records.length,
  };
}
