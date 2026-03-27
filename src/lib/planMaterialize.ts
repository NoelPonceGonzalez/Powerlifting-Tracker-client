/**
 * Materializa 52 semanas desde la plantilla de 4 (mesociclo).
 * La API puede devolver solo 4 semanas; el cliente expande en memoria para no recibir JSON gigante.
 */
import type { DayType, LogEntry, TrainingWeek, RoutineVersion } from '@/src/types';
import { getWeekTypeSlot } from '@/src/lib/mesocycleWeek';
import { parseRoutineLogsFromMongo } from '@/src/lib/routineLogs';

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

export function deriveBaseTemplateFromWeeks(weeks: TrainingWeek[]): TrainingWeek[] {
  const byType = new Map<number, TrainingWeek>();
  weeks.forEach((week) => {
    const slot = getWeekTypeSlot(week.number);
    /** Última semana del año por tipo (1–4): si editas semana 13, la semana 1 del mismo tipo seguía vieja y “primera” ganaba → plantilla incorrecta al guardar. */
    byType.set(slot, week);
  });
  const fallback =
    weeks[0] ||
    ({
      id: 'template-empty',
      number: 1,
      days: [],
    } as TrainingWeek);
  return [1, 2, 3, 4].map((slot) => normalizeTemplateWeek(byType.get(slot) || fallback, slot));
}

const DAY_NAMES_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** Plantilla 1–4 sin ejercicios (rutinas nuevas / respuesta API incompleta). */
export const EMPTY_FOUR_WEEK_TEMPLATE: TrainingWeek[] = [1, 2, 3, 4].map((n) => ({
  id: `template-w${n}`,
  number: n,
  days: DAY_NAMES_ES.map((name, dIdx) => ({
    id: `template-w${n}-d${dIdx}`,
    name,
    type: (dIdx === 0 || dIdx === 2 || dIdx === 4 ? 'workout' : 'rest') as DayType,
    exercises: [],
  })),
}));

/** Compat: antes incluía un ejercicio de ejemplo; ahora equivale a plantilla vacía. */
export const FALLBACK_FOUR_WEEK_TEMPLATE = EMPTY_FOUR_WEEK_TEMPLATE;

export function materialize52WeeksFromFourTemplateWeeks(templateWeeks: TrainingWeek[]): TrainingWeek[] {
  const slots: Record<number, TrainingWeek> = {};
  for (const tw of templateWeeks) {
    const slot =
      tw.number >= 1 && tw.number <= 4 ? tw.number : getWeekTypeSlot(tw.number);
    slots[slot] = tw;
  }
  const fallback = slots[1] || { id: 'template-empty', number: 1, days: [] };
  return Array.from({ length: 52 }, (_, i) => {
    const weekNumber = i + 1;
    const type = getWeekTypeSlot(weekNumber);
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

/** Solo plantilla 1–4 semanas (mesociclo). Nunca 52 aquí — evita duplicar megabytes en memoria. */
export function versionWeeksToTemplateOnly(weeks: TrainingWeek[] | undefined): TrainingWeek[] {
  if (!weeks?.length) return [];
  if (weeks.length <= 4) return weeks;
  if (weeks.length >= 52) return deriveBaseTemplateFromWeeks(weeks);
  return deriveBaseTemplateFromWeeks(weeks);
}

/** Convierte respuesta API (plan ligero) al RoutinePlan en memoria: una sola materialización w1…w52 en `weeks`. */
export function expandRoutineFromApi(raw: {
  _id?: unknown;
  id?: string;
  name?: string;
  sameTemplateAllWeeks?: boolean;
  hiddenFromSocial?: boolean;
  weeks?: TrainingWeek[];
  versions?: RoutineVersion[];
  baseTemplate?: TrainingWeek[];
  weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
  logs?: unknown;
}): {
  id: string;
  name: string;
  sameTemplateAllWeeks: boolean;
  hiddenFromSocial: boolean;
  weeks: TrainingWeek[];
  versions: RoutineVersion[];
  baseTemplate: TrainingWeek[];
  weekTypeOverrides: Array<{ weekType: number; week: TrainingWeek }>;
  logs: Record<string, LogEntry>;
} {
  const logs = parseRoutineLogsFromMongo(raw.logs);
  const baseTemplateRaw = raw.baseTemplate?.length ? raw.baseTemplate : [];

  let versions: RoutineVersion[] = (raw.versions || []).map((v) => ({
    ...v,
    weeks: versionWeeksToTemplateOnly(v.weeks),
  }));

  if (versions.length === 0) {
    if (raw.weeks?.length) {
      if (raw.weeks.length >= 52) {
        versions = [{ effectiveFromWeek: 1, weeks: deriveBaseTemplateFromWeeks(raw.weeks) }];
      } else {
        versions = [{ effectiveFromWeek: 1, weeks: versionWeeksToTemplateOnly(raw.weeks) }];
      }
    } else if (baseTemplateRaw.length) {
      versions = [{ effectiveFromWeek: 1, weeks: versionWeeksToTemplateOnly(baseTemplateRaw) }];
    }
  }

  const latestTemplate =
    versions.length > 0 ? versions[versions.length - 1].weeks : [];
  const derivedBase =
    baseTemplateRaw.length > 0
      ? versionWeeksToTemplateOnly(baseTemplateRaw)
      : latestTemplate.length > 0
        ? latestTemplate
        : [];

  let weeks52: TrainingWeek[] = [];
  if (derivedBase.length > 0) {
    weeks52 = materialize52WeeksFromFourTemplateWeeks(derivedBase);
  } else if (raw.weeks && raw.weeks.length >= 52) {
    weeks52 = raw.weeks;
  }

  if (versions.length === 0 && weeks52.length > 0) {
    versions = [{ effectiveFromWeek: 1, weeks: deriveBaseTemplateFromWeeks(weeks52) }];
  }

  let baseTemplateOut =
    derivedBase.length > 0 ? derivedBase : weeks52.length > 0 ? deriveBaseTemplateFromWeeks(weeks52) : [];

  let outWeeks = weeks52;
  let outVersions = versions;

  if (outWeeks.length === 0) {
    const fb = EMPTY_FOUR_WEEK_TEMPLATE;
    outWeeks = materialize52WeeksFromFourTemplateWeeks(fb);
    outVersions = [{ effectiveFromWeek: 1, weeks: fb }];
    baseTemplateOut = fb;
  } else if (outVersions.length > 0 && outVersions.every((v) => !v.weeks?.length)) {
    const fb = baseTemplateOut.length > 0 ? baseTemplateOut : deriveBaseTemplateFromWeeks(outWeeks);
    outVersions = [{ effectiveFromWeek: outVersions[0]?.effectiveFromWeek ?? 1, weeks: fb.length ? fb : EMPTY_FOUR_WEEK_TEMPLATE }];
  }

  if (!outVersions.length && outWeeks.length > 0) {
    outVersions = [{ effectiveFromWeek: 1, weeks: deriveBaseTemplateFromWeeks(outWeeks) }];
  }

  return {
    id: String(raw._id ?? raw.id ?? ''),
    name: raw.name || 'Rutina',
    sameTemplateAllWeeks: raw.sameTemplateAllWeeks !== false,
    hiddenFromSocial: !!raw.hiddenFromSocial,
    weeks: outWeeks,
    versions: outVersions,
    baseTemplate: baseTemplateOut.length > 0 ? baseTemplateOut : deriveBaseTemplateFromWeeks(outWeeks),
    weekTypeOverrides: raw.weekTypeOverrides || [],
    logs,
  };
}
