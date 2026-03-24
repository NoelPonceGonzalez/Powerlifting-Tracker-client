import type { HistoryEntry, LogEntry, PlannedExercise, TrainingMax, TrainingWeek } from '@/src/types';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';
import type { RMData } from '@/src/types';

const roundTo25 = (n: number) => Math.round(n / 2.5) * 2.5;

/** Misma semana materializada que en App (logs alineados con week.id). */
export function getWeeksForTrainingMaxScan(routine: {
  weeks: TrainingWeek[];
  versions?: { effectiveFromWeek: number; weeks: TrainingWeek[] }[];
}): TrainingWeek[] {
  const versionWeeks =
    routine.versions?.length > 0
      ? routine.versions[routine.versions.length - 1].weeks
      : [];
  if (routine.weeks?.length > 0 && routine.weeks.length >= (versionWeeks?.length || 0)) {
    return routine.weeks;
  }
  if (versionWeeks?.length > 0) return versionWeeks;
  return routine.weeks || [];
}

export function findDayIndexForLogId(
  routine: { weeks: TrainingWeek[]; versions?: { weeks: TrainingWeek[] }[] },
  logId: string
): number | undefined {
  const weeks = getWeeksForTrainingMaxScan(routine);
  for (const week of weeks) {
    for (let d = 0; d < week.days.length; d++) {
      const day = week.days[d];
      for (const ex of day.exercises) {
        if (`${week.id}-${day.id}-${ex.id}` === logId) return d;
      }
    }
  }
  return undefined;
}

export function getLastHistoryEntryBeforeWeek(
  history: HistoryEntry[],
  weekNum: number,
  year: number
): HistoryEntry | undefined {
  const candidates = history.filter(e => {
    if (e.week == null || e.year == null) return false;
    const ey = e.year;
    const ew = e.week;
    return ey < year || (ey === year && ew < weekNum);
  });
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => {
    const ya = (a.year ?? 0) - (b.year ?? 0);
    if (ya !== 0) return ya;
    const wa = (a.week ?? 0) - (b.week ?? 0);
    if (wa !== 0) return wa;
    return (a.dayIndex ?? 999) - (b.dayIndex ?? 999);
  });
  return candidates[candidates.length - 1];
}

/** TM de rutina al abrir la semana del calendario (tras la semana anterior). */
export function getLinkedTmsAtWeekStart(
  templateTms: TrainingMax[],
  history: HistoryEntry[],
  weekNum: number,
  year: number
): TrainingMax[] {
  const prev = getLastHistoryEntryBeforeWeek(history, weekNum, year);
  if (!prev?.trainingMaxes) return templateTms.map(tm => ({ ...tm }));
  return templateTms.map(tm => ({
    ...tm,
    value: prev.trainingMaxes[tm.id] ?? tm.value,
  }));
}

function resolveLinkedTM(ex: PlannedExercise, tms: TrainingMax[]): TrainingMax | undefined {
  if (!ex.linkedTo?.trim()) return undefined;
  const byId = tms.find(tm => tm.id === ex.linkedTo);
  if (byId) return byId;
  const byLinked = tms.find(tm => tm.linkedExercise === (ex.linkedTo as keyof RMData));
  if (byLinked) return byLinked;
  const norm = (s?: string) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return tms.find(
    tm => norm(tm.name) === norm(ex.linkedTo!) || norm(tm.name) === norm(ex.name)
  );
}

/**
 * Aplica logs del lunes → día `maxDayInclusive` (inclusive) sobre TM de rutina vinculados.
 * El valor mostrado el día D es el resultado tras ese día (coincide con “ya hice el entreno ese día”).
 */
export function simulateLinkedTmsForWeekThroughDay(
  weekStartTms: TrainingMax[],
  week: TrainingWeek,
  maxDayInclusive: number,
  logs: Record<string, LogEntry>
): TrainingMax[] {
  const newTms = weekStartTms.map(tm => ({ ...tm }));

  for (let d = 0; d <= maxDayInclusive; d++) {
    const day = week.days[d];
    if (!day) continue;
    for (const ex of day.exercises) {
      const lid = `${week.id}-${day.id}-${ex.id}`;
      const log = logs[lid];
      if (!log?.sets?.length) continue;
      const linked = resolveLinkedTM(ex, newTms);
      if (!linked) continue;
      const idxTm = newTms.findIndex(t => t.id === linked.id);
      if (idxTm < 0) continue;
      for (const set of log.sets) {
        if (linked.mode === 'weight') {
          const w = set.weight ?? 0;
          const r = set.reps ?? 0;
          if (w <= 0 || r <= 0) continue;
          const c = roundTo25(w);
          if (c > newTms[idxTm].value) {
            newTms[idxTm] = { ...newTms[idxTm], value: c };
          }
        } else if (linked.mode === 'reps' || linked.mode === 'seconds') {
          const val = set.reps ?? 0;
          if (val <= 0) continue;
          const c = Math.round(val);
          if (c > newTms[idxTm].value) {
            newTms[idxTm] = { ...newTms[idxTm], value: c };
          }
        }
      }
    }
  }
  return newTms;
}

/** Número de semana del año para enlazar con `history` (entrada semanal). */
export function resolveCalendarWeekForWeekRow(
  week: TrainingWeek | undefined,
  referenceCalendarWeek: number
): number {
  if (!week) return referenceCalendarWeek;
  const n = week.number;
  if (n > 4) return n;
  return referenceCalendarWeek;
}

export function computeDisplayTrainingMaxesForPlanDay(
  templateTms: TrainingMax[],
  history: HistoryEntry[],
  week: TrainingWeek | undefined,
  activeDayIdx: number,
  logs: Record<string, LogEntry>,
  calendarWeekNum: number,
  year: number
): TrainingMax[] {
  if (!week) return templateTms;
  const base = getLinkedTmsAtWeekStart(templateTms, history, calendarWeekNum, year);
  return simulateLinkedTmsForWeekThroughDay(base, week, activeDayIdx, logs);
}
