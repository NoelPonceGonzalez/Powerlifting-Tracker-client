/**
 * Cuerpo para PATCH /api/routines/:id/plan (misma forma que antes en el sync debounced).
 * Usar solo como fallback cuando no hay _dbId en ejercicio/día para PATCH granular.
 */
import type { RoutineVersion, TrainingWeek } from '@/src/types';
import {
  deriveBaseTemplateFromWeeks,
  materialize52WeeksFromTemplateWeeks,
  createEmptyTemplate,
} from '@/src/lib/planMaterialize';

export interface RoutinePlanPatchInput {
  weeks: TrainingWeek[];
  versions?: RoutineVersion[];
  baseTemplate?: TrainingWeek[];
  weekTypeOverrides?: Array<{ weekType: number; week: TrainingWeek }>;
  sameTemplateAllWeeks?: boolean;
  hiddenFromSocial?: boolean;
  cycleLength?: number;
}

export function buildPlanPatchPayload(r: RoutinePlanPatchInput) {
  const cl = r.cycleLength ?? 4;
  let fullWeeksForTemplate: TrainingWeek[] =
    r.weeks.length >= 52 ? r.weeks : [];
  if (fullWeeksForTemplate.length < 52) {
    const latestV =
      r.versions?.length && r.versions.length > 0
        ? [...r.versions].reduce((a, b) =>
            a.effectiveFromWeek >= b.effectiveFromWeek ? a : b
          )
        : null;
    const tplWeeks =
      (latestV?.weeks?.length ? latestV.weeks : null) ||
      (r.baseTemplate?.length ? r.baseTemplate : null) ||
      createEmptyTemplate(cl);
    fullWeeksForTemplate = materialize52WeeksFromTemplateWeeks(tplWeeks, cl);
  }
  const baseTemplate = deriveBaseTemplateFromWeeks(fullWeeksForTemplate, cl);
  const weekTypeOverrides = r.weekTypeOverrides || [];
  const versionsPayload =
    r.versions?.length && r.versions.length > 0
      ? r.versions.map((v) => ({
          effectiveFromWeek: v.effectiveFromWeek,
          weeks:
            v.weeks && v.weeks.length > cl ? deriveBaseTemplateFromWeeks(v.weeks, cl) : v.weeks,
        }))
      : [{ effectiveFromWeek: 1, weeks: baseTemplate }];

  return {
    versions: versionsPayload,
    baseTemplate,
    weekTypeOverrides,
    sameTemplateAllWeeks: r.sameTemplateAllWeeks,
    hiddenFromSocial: r.hiddenFromSocial,
    cycleLength: cl,
  };
}
