import type { TrainingMax, RoutineProgressKind } from '@/src/types';

export type { RoutineProgressKind };

export interface RoutineProgressMeta {
  /** Valor único para la curva principal de progreso / campo `total` del historial. */
  value: number;
  kind: RoutineProgressKind;
  label: string;
  unit: string;
  /** Explicación breve para tooltip o subtítulo. */
  description: string;
}

/**
 * Progreso agregado de la rutina según los TM que tenga:
 * - Solo peso → suma de kg
 * - Solo reps → suma de repeticiones
 * - Solo tiempo → suma de segundos
 * - Varios modos → índice combinado (misma fórmula en cada punto del historial si los ids coinciden)
 */
export function computeRoutineProgressTotal(tms: TrainingMax[]): RoutineProgressMeta {
  const w = tms.filter((t) => t.mode === 'weight');
  const r = tms.filter((t) => t.mode === 'reps');
  const s = tms.filter((t) => t.mode === 'seconds');
  const sumW = w.reduce((a, t) => a + (t.value || 0), 0);
  const sumR = r.reduce((a, t) => a + (t.value || 0), 0);
  const sumS = s.reduce((a, t) => a + (t.value || 0), 0);
  const hasW = w.length > 0;
  const hasR = r.length > 0;
  const hasS = s.length > 0;
  const nModes = [hasW, hasR, hasS].filter(Boolean).length;

  if (nModes === 0) {
    return {
      value: 0,
      kind: 'weight',
      label: 'Sin TM',
      unit: '',
      description: 'Añade training maxes a la rutina para ver progreso.',
    };
  }

  if (nModes === 1) {
    if (hasW) {
      return {
        value: sumW,
        kind: 'weight',
        label: 'Suma TM (peso)',
        unit: 'kg',
        description: 'Suma de todos los training max en kilogramos.',
      };
    }
    if (hasR) {
      return {
        value: sumR,
        kind: 'reps',
        label: 'Suma TM (reps)',
        unit: 'reps',
        description: 'Suma de todos los training max en repeticiones.',
      };
    }
    return {
      value: sumS,
      kind: 'seconds',
      label: 'Suma TM (tiempo)',
      unit: 's',
      description: 'Suma de todos los training max en segundos.',
    };
  }

  const composite = sumW + sumR / 5 + sumS / 60;
  return {
    value: Math.round(composite * 100) / 100,
    kind: 'mixed',
    label: 'Índice combinado',
    unit: 'pts',
    description: 'Índice: kg + reps×0,2 + s×(1/60) para una sola curva con varios modos.',
  };
}

/**
 * Reconstruye el valor de progreso de un punto del historial usando los valores
 * guardados por TM y la plantilla actual de modos (ids).
 */
export function progressValueFromHistoryEntry(
  entry: { total: number; trainingMaxes?: Record<string, number> },
  templateTms: TrainingMax[]
): number {
  if (templateTms.length === 0) return entry.total ?? 0;
  if (!entry.trainingMaxes || Object.keys(entry.trainingMaxes).length === 0) {
    return entry.total ?? 0;
  }
  const tms = templateTms.map((tm) => ({
    ...tm,
    value: entry.trainingMaxes![tm.id] ?? 0,
  }));
  return computeRoutineProgressTotal(tms).value;
}
