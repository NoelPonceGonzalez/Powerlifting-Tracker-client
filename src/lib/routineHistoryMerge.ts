import type { HistoryEntry } from '@/src/types';
import { entryDateISO } from '@/src/lib/calendarWeekDate';

function snapCount(e: HistoryEntry): number {
  return Object.keys(e.trainingMaxes || {}).length;
}

/** Instante “lógico” del snapshot (Mongo actualiza `updatedAt` al guardar período). */
function entryInstantMs(e: HistoryEntry): number {
  if (e.updatedAt) {
    const t = Date.parse(e.updatedAt);
    if (!Number.isNaN(t)) return t;
  }
  if (e.createdAt) {
    const t = Date.parse(e.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/** Clave estable por período (misma que al reemplazar en save-period). */
export function routineHistoryPeriodKey(e: HistoryEntry): string {
  return `${e.year ?? ''}|${e.week ?? ''}|${e.dayOfWeek ?? 0}|${e.dateISO ?? entryDateISO(e)}`;
}

/**
 * Tras GET /history, no sustituir ciego el estado local: el refetch (SSE / bump) puede llegar
 * antes de que los TM snapshots estén consistentes o con `createdAt` viejo y datos nuevos.
 * Preferimos la entrada con snapshots no vacíos, `updatedAt` más reciente o total coherente.
 */
export function mergeRoutineHistoryFromServer(prev: HistoryEntry[], server: HistoryEntry[]): HistoryEntry[] {
  const merged = new Map<string, HistoryEntry>();
  for (const s of server) {
    merged.set(routineHistoryPeriodKey(s), { ...s });
  }
  for (const p of prev) {
    const k = routineHistoryPeriodKey(p);
    const s = merged.get(k);
    if (!s) {
      merged.set(k, p);
      continue;
    }
    const snapS = snapCount(s);
    const snapP = snapCount(p);
    const tS = entryInstantMs(s);
    const tP = entryInstantMs(p);
    if (snapS === 0 && snapP > 0) {
      merged.set(k, p);
      continue;
    }
    if (tP > tS) {
      merged.set(k, p);
      continue;
    }
    if (snapP > snapS && tP >= tS) {
      merged.set(k, p);
    }
  }
  return [...merged.values()].sort((a, b) => {
    const c = entryDateISO(a).localeCompare(entryDateISO(b));
    if (c !== 0) return c;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}
