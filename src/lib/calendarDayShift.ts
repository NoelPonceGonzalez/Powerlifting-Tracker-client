import type { DayType, PlannedExercise, TrainingDay } from '@/src/types';

export interface CalendarDayShift {
  year: number;
  week: number;
  skippedDays: number[];
}

export function shiftsForCalendarWeek(
  all: CalendarDayShift[] | undefined,
  year: number,
  week: number
): number[] {
  const row = (all ?? []).find(s => s.year === year && s.week === week);
  return row?.skippedDays ?? [];
}

export function upsertDayShift(
  all: CalendarDayShift[] | undefined,
  year: number,
  week: number,
  skippedDays: number[]
): CalendarDayShift[] {
  const rest = (all ?? []).filter(s => !(s.year === year && s.week === week));
  const clean = [...new Set(skippedDays.filter(d => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (clean.length === 0) return rest;
  return [...rest, { year, week, skippedDays: clean }];
}

function isTrainingDay(day: TrainingDay): boolean {
  return (day.type === 'workout' || day.type === 'deload') && (day.exercises?.length ?? 0) > 0;
}

function restClone(day: TrainingDay): TrainingDay {
  return { ...day, type: 'rest' as DayType, exercises: [] };
}

function placeWorkout(slot: TrainingDay, source: TrainingDay): TrainingDay {
  return {
    ...slot,
    type: source.type === 'deload' ? 'deload' : 'workout',
    exercises: source.exercises.map((ex: PlannedExercise) => ({ ...ex })),
  };
}

/**
 * Solo visual / esta semana civil: si saltas el lunes, las sesiones que quedan
 * se colocan en los días siguientes. El template no se toca; la semana que viene
 * vuelve a L-M-J-V (o lo que tengas guardado).
 */
export function applyDaySkips(days: TrainingDay[], skippedDays: number[]): TrainingDay[] {
  if (!days?.length || skippedDays.length === 0) return days;
  let next = days.map(d => ({ ...d, exercises: [...(d.exercises ?? [])] }));
  for (const skipIdx of skippedDays) {
    if (skipIdx < 0 || skipIdx > 6) continue;
    const queue: TrainingDay[] = [];
    for (let i = skipIdx; i < next.length; i++) {
      if (isTrainingDay(next[i])) queue.push({ ...next[i], exercises: [...next[i].exercises] });
      if (i >= skipIdx) next[i] = restClone(next[i]);
    }
    let slot = skipIdx + 1;
    for (const src of queue) {
      if (slot >= next.length) break;
      next[slot] = placeWorkout(next[slot], src);
      slot += 1;
    }
  }
  return next;
}
