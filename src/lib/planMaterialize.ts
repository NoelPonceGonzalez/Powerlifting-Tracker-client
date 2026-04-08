/**
 * Materializa 52 semanas desde una plantilla de N semanas (ciclo).
 * La API puede devolver solo N semanas; el cliente expande en memoria para no recibir JSON gigante.
 */
import type { DayType, LogEntry, TrainingWeek, RoutineVersion } from '@/src/types';
import { getWeekTypeSlot } from '@/src/lib/mesocycleWeek';
import { parseRoutineLogsFromMongo } from '@/src/lib/routineLogs';

/**
 * Rutinas por bloque (mesociclo): `skippedWeeks` almacena posiciones 1…cycleLength en el ciclo.
 * Datos antiguos usaban semana civil (1–53); si algún valor supera `cycleLength`, se convierten a índice de ciclo.
 */
export function migrateSkippedWeeksForBlockMode(skipped: number[], cycleLength: number): number[] {
  if (!Array.isArray(skipped) || skipped.length === 0) return [];
  const cl = Math.max(1, cycleLength);
  const rounded = skipped
    .map((w) => Math.round(Number(w)))
    .filter((w) => Number.isFinite(w) && w >= 1);
  if (rounded.some((w) => w > cl)) {
    return [...new Set(rounded.map((w) => ((Math.max(1, w) - 1) % cl) + 1))]
      .filter((x) => x >= 1 && x <= cl)
      .sort((a, b) => a - b);
  }
  return [...new Set(rounded.filter((w) => w <= cl))].sort((a, b) => a - b);
}

export function normalizeTemplateWeek(week: TrainingWeek, weekType: number): TrainingWeek {
  return {
    ...week,
    id: `template-w${weekType}`,
    number: weekType,
    days: week.days.map((day, dayIdx) => ({
      ...day,
      id: `template-w${weekType}-d${dayIdx}`,
      exercises: day.exercises.map((exercise, exIdx) => ({
        ...exercise,
        id: `template-w${weekType}-d${dayIdx}-e${exIdx + 1}`,
      })),
    })),
  };
}

export function deriveBaseTemplateFromWeeks(weeks: TrainingWeek[], cycleLength = 4): TrainingWeek[] {
  const cl = Math.max(1, cycleLength);
  const byType = new Map<number, TrainingWeek>();
  weeks.forEach((week) => {
    const slot = getWeekTypeSlot(week.number, cl);
    byType.set(slot, week);
  });
  const fallback =
    weeks[0] ||
    ({
      id: 'template-empty',
      number: 1,
      days: [],
    } as TrainingWeek);
  return Array.from({ length: cl }, (_, i) => i + 1).map((slot) =>
    normalizeTemplateWeek(byType.get(slot) || fallback, slot)
  );
}

const DAY_NAMES_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** Plantilla de N semanas sin ejercicios (rutinas nuevas / respuesta API incompleta). */
export function createEmptyTemplate(cycleLength = 4): TrainingWeek[] {
  const cl = Math.max(1, cycleLength);
  return Array.from({ length: cl }, (_, i) => {
    const n = i + 1;
    return {
      id: `template-w${n}`,
      number: n,
      days: DAY_NAMES_ES.map((name, dIdx) => ({
        id: `template-w${n}-d${dIdx}`,
        name,
        type: (dIdx === 0 || dIdx === 2 || dIdx === 4 ? 'workout' : 'rest') as DayType,
        exercises: [],
      })),
    };
  });
}

/** Compat: backward-compatible 4-week empty template */
export const EMPTY_FOUR_WEEK_TEMPLATE: TrainingWeek[] = createEmptyTemplate(4);

/** Compat: antes incluía un ejercicio de ejemplo; ahora equivale a plantilla vacía. */
export const FALLBACK_FOUR_WEEK_TEMPLATE = EMPTY_FOUR_WEEK_TEMPLATE;

export function materialize52WeeksFromTemplateWeeks(templateWeeks: TrainingWeek[], cycleLength = 4): TrainingWeek[] {
  const cl = Math.max(1, cycleLength);
  const slots: Record<number, TrainingWeek> = {};
  for (const tw of templateWeeks) {
    const slot =
      tw.number >= 1 && tw.number <= cl ? tw.number : getWeekTypeSlot(tw.number, cl);
    slots[slot] = tw;
  }
  const fallback = slots[1] || { id: 'template-empty', number: 1, days: [] };
  return Array.from({ length: 52 }, (_, i) => {
    const weekNumber = i + 1;
    const type = getWeekTypeSlot(weekNumber, cl);
    const template = slots[type] || fallback;
    return {
      ...template,
      id: `w${weekNumber}`,
      number: weekNumber,
      days: (template.days || []).map((day: any, dayIdx: number) => ({
        ...day,
        id: `w${weekNumber}-d${dayIdx}`,
        exercises: (day.exercises || []).map((ex: any, exIdx: number) => ({
          ...ex,
          id: `w${weekNumber}-d${dayIdx}-e${exIdx + 1}`,
        })),
      })),
    };
  });
}

/** Backward-compatible alias */
export const materialize52WeeksFromFourTemplateWeeks = materialize52WeeksFromTemplateWeeks;

/** Solo plantilla 1–N semanas (mesociclo). Nunca 52 aquí. */
export function versionWeeksToTemplateOnly(weeks: TrainingWeek[] | undefined, cycleLength = 4): TrainingWeek[] {
  if (!weeks?.length) return [];
  const cl = Math.max(1, cycleLength);
  if (weeks.length <= cl) return weeks;
  return deriveBaseTemplateFromWeeks(weeks, cl);
}

/** Convierte respuesta API (plan ligero) al RoutinePlan en memoria. */
export function expandRoutineFromApi(raw: {
  _id?: unknown;
  id?: string;
  name?: string;
  sameTemplateAllWeeks?: boolean;
  hiddenFromSocial?: boolean;
  cycleLength?: number;
  skippedWeeks?: number[];
  shiftedAtCalendarWeeks?: number[];
  weeks?: TrainingWeek[];
  versions?: RoutineVersion[];
  baseTemplate?: TrainingWeek[];
  weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
  logs?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  progressCheckpointAt?: string | Date;
  progressCheckpointTms?: Record<string, number>;
}): {
  id: string;
  name: string;
  sameTemplateAllWeeks: boolean;
  hiddenFromSocial: boolean;
  cycleLength: number;
  /** En rutina lineal: semanas civiles 1–53. En rutina por bloque: posición en el ciclo 1…cycleLength. */
  skippedWeeks: number[];
  /** Semanas civiles donde «Saltar la semana» desplazó el ciclo (solo block mode). */
  shiftedAtCalendarWeeks: number[];
  weeks: TrainingWeek[];
  versions: RoutineVersion[];
  baseTemplate: TrainingWeek[];
  weekTypeOverrides: Array<{ weekType: number; week: TrainingWeek }>;
  logs: Record<string, LogEntry>;
  createdAt?: string;
  progressCheckpointAt?: string;
  progressCheckpointTms?: Record<string, number>;
} {
  const cycleLength = Number.isFinite(raw.cycleLength) && raw.cycleLength! >= 1 ? raw.cycleLength! : 4;
  const sameTemplateAllWeeks = raw.sameTemplateAllWeeks !== false;
  const skippedRaw = Array.isArray(raw.skippedWeeks) ? raw.skippedWeeks : [];
  const skippedWeeks = sameTemplateAllWeeks ? skippedRaw : migrateSkippedWeeksForBlockMode(skippedRaw, cycleLength);
  const logs = parseRoutineLogsFromMongo(raw.logs);
  const baseTemplateRaw = raw.baseTemplate?.length ? raw.baseTemplate : [];

  let versions: RoutineVersion[] = (raw.versions || []).map((v) => ({
    ...v,
    weeks: versionWeeksToTemplateOnly(v.weeks, cycleLength),
  }));

  if (versions.length === 0) {
    if (raw.weeks?.length) {
      if (raw.weeks.length >= 52) {
        versions = [{ effectiveFromWeek: 1, weeks: deriveBaseTemplateFromWeeks(raw.weeks, cycleLength) }];
      } else {
        versions = [{ effectiveFromWeek: 1, weeks: versionWeeksToTemplateOnly(raw.weeks, cycleLength) }];
      }
    } else if (baseTemplateRaw.length) {
      versions = [{ effectiveFromWeek: 1, weeks: versionWeeksToTemplateOnly(baseTemplateRaw, cycleLength) }];
    }
  }

  const latestTemplate =
    versions.length > 0 ? versions[versions.length - 1].weeks : [];
  const derivedBase =
    baseTemplateRaw.length > 0
      ? versionWeeksToTemplateOnly(baseTemplateRaw, cycleLength)
      : latestTemplate.length > 0
        ? latestTemplate
        : [];

  let weeks52: TrainingWeek[] = [];
  if (derivedBase.length > 0) {
    weeks52 = materialize52WeeksFromTemplateWeeks(derivedBase, cycleLength);
  } else if (raw.weeks && raw.weeks.length >= 52) {
    weeks52 = raw.weeks;
  }

  if (versions.length === 0 && weeks52.length > 0) {
    versions = [{ effectiveFromWeek: 1, weeks: deriveBaseTemplateFromWeeks(weeks52, cycleLength) }];
  }

  let baseTemplateOut =
    derivedBase.length > 0 ? derivedBase : weeks52.length > 0 ? deriveBaseTemplateFromWeeks(weeks52, cycleLength) : [];

  let outWeeks = weeks52;
  let outVersions = versions;

  const emptyTpl = createEmptyTemplate(cycleLength);

  if (outWeeks.length === 0) {
    outWeeks = materialize52WeeksFromTemplateWeeks(emptyTpl, cycleLength);
    outVersions = [{ effectiveFromWeek: 1, weeks: emptyTpl }];
    baseTemplateOut = emptyTpl;
  } else if (outVersions.length > 0 && outVersions.every((v) => !v.weeks?.length)) {
    const fb = baseTemplateOut.length > 0 ? baseTemplateOut : deriveBaseTemplateFromWeeks(outWeeks, cycleLength);
    outVersions = [{ effectiveFromWeek: outVersions[0]?.effectiveFromWeek ?? 1, weeks: fb.length ? fb : emptyTpl }];
  }

  if (!outVersions.length && outWeeks.length > 0) {
    outVersions = [{ effectiveFromWeek: 1, weeks: deriveBaseTemplateFromWeeks(outWeeks, cycleLength) }];
  }

  const createdRaw = raw.createdAt;
  const createdAt =
    createdRaw != null
      ? typeof createdRaw === 'string'
        ? createdRaw
        : (createdRaw as Date).toISOString?.() ?? undefined
      : undefined;

  const pca = raw.progressCheckpointAt;
  const progressCheckpointAt =
    pca == null
      ? undefined
      : typeof pca === 'string'
        ? pca
        : (pca as Date).toISOString?.() ?? undefined;

  return {
    id: String(raw._id ?? raw.id ?? ''),
    name: raw.name || 'Rutina',
    sameTemplateAllWeeks,
    hiddenFromSocial: !!raw.hiddenFromSocial,
    cycleLength,
    skippedWeeks,
    shiftedAtCalendarWeeks: Array.isArray(raw.shiftedAtCalendarWeeks) ? raw.shiftedAtCalendarWeeks.filter(Number.isFinite) : [],
    weeks: outWeeks,
    versions: outVersions,
    baseTemplate: baseTemplateOut.length > 0 ? baseTemplateOut : deriveBaseTemplateFromWeeks(outWeeks, cycleLength),
    weekTypeOverrides: raw.weekTypeOverrides || [],
    logs,
    ...(createdAt ? { createdAt } : {}),
    ...(progressCheckpointAt ? { progressCheckpointAt } : {}),
    ...(raw.progressCheckpointTms && typeof raw.progressCheckpointTms === 'object' && Object.keys(raw.progressCheckpointTms).length > 0
      ? { progressCheckpointTms: raw.progressCheckpointTms as Record<string, number> }
      : {}),
  };
}
