import type { TrainingWeek } from '@/src/types';
import type { ParsedPlan, ParsedWeek } from '@/src/lib/coachPlan/parseCoachPlan';
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';

export interface DetectedPlanStart {
  /** Semana civil donde cae la semana 1 del archivo. */
  startWeekNumber: number;
  /** Cuántas semanas del archivo, desde la 1, ya están en la rutina tal cual. */
  covered: number;
}

/**
 * «Semana 1…4, Semana 1» en un mismo archivo es el siguiente ciclo: la numeración sigue (5) para que
 * cada semana tenga su sitio y no se pise la primera.
 */
export function numberWeeksInOrder(plan: ParsedPlan): ParsedPlan {
  let last = 0;
  const weeks = plan.weeks.map((w) => {
    const number = w.number > last ? w.number : last + 1;
    last = number;
    return number === w.number ? w : { ...w, number };
  });
  return { ...plan, weeks };
}

function exerciseKey(name: string, scheme: string): string {
  return `${normalizeExerciseNameKey(name)}|${scheme.replace(/\s+/g, '').toLowerCase()}`;
}

function fileDayKeys(week: ParsedWeek): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const d of week.days) {
    if (!d.exercises.length) continue;
    out.set(d.dayIndex, d.exercises.map((e) => exerciseKey(e.name, e.setScheme ?? `${e.sets}x${e.reps}`)));
  }
  return out;
}

function routineDayKeys(week: TrainingWeek, dayIndex: number): string[] {
  const day = week.days[dayIndex];
  return (day?.exercises ?? []).map((e) => exerciseKey(e.name, e.setScheme ?? `${e.sets}x${String(e.reps ?? '')}`));
}

/** Mismos ejercicios en los mismos días y casi todas las series iguales: es esa semana ya importada. */
function sameWeek(file: ParsedWeek, routine: TrainingWeek | undefined): boolean {
  if (!routine) return false;
  const days = fileDayKeys(file);
  if (days.size === 0) return false;
  let total = 0;
  let equal = 0;
  for (const [dayIndex, keys] of days) {
    const mine = routineDayKeys(routine, dayIndex);
    if (mine.length !== keys.length) return false;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].split('|')[0] !== mine[i].split('|')[0]) return false;
      total += 1;
      if (keys[i] === mine[i]) equal += 1;
    }
  }
  return total > 0 && equal / total >= 0.7;
}

/**
 * Busca en la rutina dónde empezó este mismo archivo. No depende de lo guardado en el navegador:
 * si el móvil es otro o se borró la caché, se reconoce igual por el contenido.
 */
export function detectExistingPlanStart(
  plan: ParsedPlan,
  weekAt: (calendarWeek: number) => TrainingWeek | undefined,
  currentWeek: number
): DetectedPlanStart | null {
  if (plan.weeks.length === 0) return null;
  const cache = new Map<number, TrainingWeek | undefined>();
  const at = (n: number) => {
    if (!cache.has(n)) cache.set(n, weekAt(n));
    return cache.get(n);
  };
  let best: DetectedPlanStart | null = null;
  const from = Math.max(1, currentWeek - 30);
  const to = Math.min(52, currentWeek + 2);
  for (let start = from; start <= to; start++) {
    let covered = 0;
    while (covered < plan.weeks.length && start + covered <= 52 && sameWeek(plan.weeks[covered], at(start + covered))) {
      covered += 1;
    }
    if (covered === 0) continue;
    /* Un ciclo que se repite encaja en varios sitios: vale el primero cuyas semanas nuevas caen de hoy en adelante. */
    const landsAhead = start + covered >= currentWeek;
    const bestLandsAhead = best ? best.startWeekNumber + best.covered >= currentWeek : false;
    const better =
      !best ||
      covered > best.covered ||
      (covered === best.covered && landsAhead && !bestLandsAhead);
    if (better) best = { startWeekNumber: start, covered };
  }
  return best;
}

/**
 * Cuántas semanas del archivo, desde la 1, ya están en esa posición del ciclo.
 * La semana 1 se compara con el hueco 1, no con «la semana que viene» del calendario.
 */
export function coveredLeadingCycleWeeks(
  plan: ParsedPlan,
  slotWeek: (slot: number) => TrainingWeek | undefined,
  cycleLength: number
): number {
  const cl = Math.max(1, cycleLength);
  const byNumber = new Map(plan.weeks.map((w) => [w.number, w]));
  let covered = 0;
  while (covered < plan.weeks.length) {
    const next = covered + 1;
    const week = byNumber.get(next);
    if (!week || !sameWeek(week, slotWeek(((next - 1) % cl) + 1))) break;
    covered += 1;
  }
  return covered;
}
