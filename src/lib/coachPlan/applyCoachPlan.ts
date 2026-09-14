import type { DayType, PlannedExercise, RoutineVersion, TrainingDay, TrainingWeek } from '@/src/types';
import type { ParsedExercise, ParsedPlan } from '@/src/lib/coachPlan/parseCoachPlan';
import { getWeekTypeSlot } from '@/src/lib/mesocycleWeek';
import {
  deriveBaseTemplateFromWeeks,
  materialize52WeeksFromFourTemplateWeeks,
  normalizeTemplateWeek,
} from '@/src/lib/planMaterialize';

export interface ApplyPlanOptions {
  /** Semana civil 1–52 sobre la que cae la primera semana del plan. */
  startWeekNumber: number;
  /** Vaciar los días de la semana que el plan no menciona. */
  clearUntouchedDays: boolean;
}

export interface ApplyPlanResult {
  weeks: TrainingWeek[];
  /** Semanas civiles que han quedado escritas. */
  targetWeekNumbers: number[];
  skippedWeeks: number[];
}

function toPlannedExercise(
  pe: ParsedExercise,
  weekId: string,
  dayId: string,
  index: number
): PlannedExercise {
  const repsIsRange = /[^0-9]/.test(pe.reps);
  return {
    id: `${weekId}-${dayId}-e${index + 1}`,
    name: pe.name,
    sets: pe.sets,
    reps: repsIsRange ? pe.reps : parseInt(pe.reps, 10) || 1,
    mode: pe.mode,
    ...(pe.mode === 'weight' && pe.weight !== undefined ? { weight: pe.weight } : {}),
    ...(pe.rpe ? { targetRpe: pe.rpe } : {}),
    ...(pe.note ? { coachNote: pe.note } : {}),
  };
}

/**
 * Vuelca el plan del entrenador sobre las semanas civiles de la rutina, empezando
 * por `startWeekNumber`. No toca semanas anteriores ni posteriores al plan.
 */
export function applyCoachPlanToWeeks(
  weeks: TrainingWeek[],
  plan: ParsedPlan,
  options: ApplyPlanOptions
): ApplyPlanResult {
  const next = weeks.map(w => ({ ...w, days: w.days.map(d => ({ ...d })) }));
  const targetWeekNumbers: number[] = [];
  const skippedWeeks: number[] = [];

  plan.weeks.forEach((planWeek, i) => {
    const targetNumber = options.startWeekNumber + i;
    const weekIdx = next.findIndex(w => w.number === targetNumber);
    if (weekIdx === -1) {
      skippedWeeks.push(targetNumber);
      return;
    }

    const week = next[weekIdx];
    const newDays: TrainingDay[] = week.days.map((day, dayIdx) => {
      const planDay = planWeek.days.find(d => d.dayIndex === dayIdx);

      if (planDay) {
        return {
          ...day,
          type: 'workout' as DayType,
          exercises: planDay.exercises.map((pe, k) =>
            toPlannedExercise(pe, week.id, day.id, k)
          ),
        };
      }

      // El plan no menciona este día: se respeta el tipo de la tabla de organización
      // y, si procede, se vacía para que la semana refleje solo el plan importado.
      const declaredType = plan.dayTypes[dayIdx];
      if (!options.clearUntouchedDays) {
        return declaredType ? { ...day, type: declaredType } : day;
      }
      return {
        ...day,
        type: declaredType ?? ('rest' as DayType),
        exercises: [],
      };
    });

    next[weekIdx] = { ...week, days: newDays };
    targetWeekNumbers.push(targetNumber);
  });

  return { weeks: next, targetWeekNumbers, skippedWeeks };
}

/**
 * Plantilla de una semana sin ejercicios, para cuando el plan no se repite: a partir de la última semana
 * importada no se inventa nada, los días quedan vacíos hasta que llegue el siguiente documento.
 */
export function buildEmptyWeekTemplate(reference: TrainingWeek, plan: ParsedPlan): TrainingWeek[] {
  const week: TrainingWeek = {
    ...reference,
    days: reference.days.map((day, dayIdx) => ({
      ...day,
      type: plan.dayTypes[dayIdx] ?? ('rest' as DayType),
      exercises: [],
    })),
  };
  return [normalizeTemplateWeek(week, 1)];
}

/**
 * Plantilla del ciclo a partir de las semanas que acaba de escribir el plan.
 *
 * La rutina no guarda 52 semanas: guarda una plantilla de `cycleLength` semanas que se repite,
 * donde la semana civil W usa la posición `((W - 1) % cycleLength) + 1`. Por eso cada semana
 * importada se coloca en la posición que le toca por su semana civil: así el ciclo queda
 * "en fase" con la semana de inicio y el plan cae en los días correctos al repetirse.
 *
 * Las posiciones del ciclo que el plan no cubre (documento de 2 semanas en un ciclo de 4)
 * conservan lo que hubiera en la plantilla anterior.
 */
export function buildCycleTemplateFromImport(
  appliedWeeks: TrainingWeek[],
  targetWeekNumbers: number[],
  cycleLength: number,
  previousTemplate: TrainingWeek[]
): TrainingWeek[] {
  const cl = Math.max(1, cycleLength);
  const bySlot = new Map<number, TrainingWeek>();

  previousTemplate.forEach((week) => {
    const slot = week.number >= 1 && week.number <= cl ? week.number : getWeekTypeSlot(week.number, cl);
    bySlot.set(slot, week);
  });

  targetWeekNumbers.forEach((weekNumber) => {
    const week = appliedWeeks.find((w) => w.number === weekNumber);
    if (week) bySlot.set(getWeekTypeSlot(weekNumber, cl), week);
  });

  return Array.from({ length: cl }, (_, i) => i + 1).map((slot) => {
    const week =
      bySlot.get(slot) ||
      appliedWeeks.find((w) => getWeekTypeSlot(w.number, cl) === slot) ||
      appliedWeeks[0];
    return normalizeTemplateWeek(week, slot);
  });
}

export interface CoachImportMergeInput {
  plan: ParsedPlan;
  startWeekNumber: number;
  repeatAfterPlan: boolean;
  cycleLength: number;
  clearUntouchedDays: boolean;
  continuesPreviousPlan: boolean;
  currentWeekOfYear: number;
}

export interface CoachImportRoutineSlice {
  weeks: TrainingWeek[];
  baseTemplate?: TrainingWeek[];
  cycleLength?: number;
  sameTemplateAllWeeks?: boolean;
  versions?: RoutineVersion[];
  weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
  skippedWeeks?: number[];
  shiftedAtCalendarWeeks?: number[];
}

function weeksForImport(r: CoachImportRoutineSlice): TrainingWeek[] {
  if (r.weeks.length >= 52) return r.weeks;
  const cl = r.cycleLength ?? 4;
  const tpl = r.weeks.length <= cl ? r.weeks : deriveBaseTemplateFromWeeks(r.weeks, cl);
  return materialize52WeeksFromFourTemplateWeeks(
    tpl.length <= cl ? tpl : deriveBaseTemplateFromWeeks(tpl, cl),
    cl
  );
}

/** Aplica un Word/PDF parseado sobre la rutina (propia o de un alumno). */
export function mergeCoachImportIntoRoutine<T extends CoachImportRoutineSlice>(
  r: T,
  opts: CoachImportMergeInput
): T {
  const prevCycleLength = r.cycleLength ?? 4;
  const cycleLength = Math.max(1, Math.min(52, opts.cycleLength || opts.plan.weeks.length || prevCycleLength));
  const cycleChanged =
    cycleLength !== prevCycleLength || (cycleLength === 1) !== (r.sameTemplateAllWeeks === true);
  const endOfPlanWeek = opts.startWeekNumber + opts.plan.weeks.length;
  const versionFromWeek = opts.continuesPreviousPlan
    ? Math.max(opts.startWeekNumber, opts.currentWeekOfYear)
    : opts.startWeekNumber;

  const base = weeksForImport(r);
  const { weeks, targetWeekNumbers } = applyCoachPlanToWeeks(base, opts.plan, {
    startWeekNumber: opts.startWeekNumber,
    clearUntouchedDays: opts.clearUntouchedDays,
  });
  const previousTemplate = r.baseTemplate?.length
    ? r.baseTemplate
    : deriveBaseTemplateFromWeeks(base, prevCycleLength);
  const baseTemplate = buildCycleTemplateFromImport(weeks, targetWeekNumbers, cycleLength, previousTemplate);

  return {
    ...r,
    cycleLength,
    sameTemplateAllWeeks: cycleLength === 1,
    weeks: materialize52WeeksFromFourTemplateWeeks(baseTemplate, cycleLength),
    baseTemplate,
    weekTypeOverrides: [],
    versions: [
      ...(r.versions ?? [])
        .filter(v => v.effectiveFromWeek < versionFromWeek)
        .map(v => ({ ...v, cycleLength: v.cycleLength ?? prevCycleLength })),
      { effectiveFromWeek: versionFromWeek, cycleLength, weeks: baseTemplate },
      ...(!opts.repeatAfterPlan && endOfPlanWeek <= 52 && endOfPlanWeek > versionFromWeek
        ? [{
            effectiveFromWeek: endOfPlanWeek,
            cycleLength: 1,
            weeks: buildEmptyWeekTemplate(weeks[opts.startWeekNumber - 1] ?? base[0], opts.plan),
          }]
        : []),
    ],
    ...(cycleChanged ? { skippedWeeks: [], shiftedAtCalendarWeeks: [] } : {}),
  };
}
