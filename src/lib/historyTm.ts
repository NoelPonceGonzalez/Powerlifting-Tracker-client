import type { HistoryEntry, TrainingMax, RMData } from '@/src/types';
import { entryDateISO } from '@/src/lib/calendarWeekDate';
import { computeRoutineProgressTotal } from '@/src/lib/routineProgressTotal';

/** Snapshot “desde siempre” hasta el primer cambio con fecha explícita (vigencia por `dateISO`). */
export const TM_BASELINE_DATE_ISO = '1970-01-01';

/**
 * Entrada de historial con todos los TM en un instante; `dateISO` es el primer día en que aplica ese estado
 * (los días anteriores usan el snapshot anterior, típicamente `TM_BASELINE_DATE_ISO`).
 */
export function buildBaselineHistoryEntry(
  routineId: string,
  tms: TrainingMax[],
  currentRms: RMData,
  dateLabel = 'Origen'
): HistoryEntry {
  const tmValues: Record<string, number> = {};
  tms.forEach((tm) => {
    tmValues[tm.id] = tm.value;
  });
  const progress = computeRoutineProgressTotal(tms);
  return {
    date: dateLabel,
    week: 1,
    year: 1970,
    dayOfWeek: 0,
    dateISO: TM_BASELINE_DATE_ISO,
    month: 1,
    rms: { ...currentRms },
    total: progress.value,
    progressKind: progress.kind,
    trainingMaxes: tmValues,
    routineId,
  };
}

function hasTrainingMaxes(e: HistoryEntry): boolean {
  return !!(e.trainingMaxes && Object.keys(e.trainingMaxes).length > 0);
}

/**
 * TM vigentes como en la fecha del plan: último snapshot con `dateISO` ≤ día visto.
 * Así, al tirar hacia atrás en la rutina se ven los TM anteriores a un PR (snapshot base + cambios por fecha).
 */
export function getTMsForView(
  tms: TrainingMax[],
  history: HistoryEntry[],
  viewDateISO: string
): TrainingMax[] {
  const sorted = [...history]
    .filter((e) => hasTrainingMaxes(e) && (e.dateISO || (e.year != null && e.week != null)))
    .sort((a, b) => {
      const c = entryDateISO(a).localeCompare(entryDateISO(b));
      if (c !== 0) return c;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  if (sorted.length === 0) return tms;

  let lastIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (entryDateISO(sorted[i]) <= viewDateISO) lastIdx = i;
  }

  if (lastIdx < 0) {
    /**
     * Ningún snapshot ≤ día visto (p. ej. sin línea base 1970-01-01). No inventar valores del primer
     * snapshot (sería el TM nuevo). Mostrar TM actuales de la API hasta que exista baseline.
     */
    return tms;
  }

  const snap = sorted[lastIdx];
  return tms.map((tm) => ({
    ...tm,
    value: snap.trainingMaxes![tm.id] ?? tm.value,
  }));
}

/** Instante del snapshot (checkpoint de % vs orden del historial). */
export function historyEntryTimeMs(h: HistoryEntry): number {
  if (h.updatedAt) {
    const tu = Date.parse(h.updatedAt);
    if (!Number.isNaN(tu)) return tu;
  }
  if (h.createdAt) {
    const t = Date.parse(h.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  if (h.dateISO && /^\d{4}-\d{2}-\d{2}$/.test(h.dateISO)) {
    return Date.parse(`${h.dateISO}T12:00:00`);
  }
  const y = h.year ?? new Date().getFullYear();
  const m = h.month != null ? Math.max(0, h.month - 1) : 0;
  return new Date(y, m, 1).getTime();
}
