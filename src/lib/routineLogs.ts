import type { LogEntry, SetLog } from '@/src/types';

function entriesFromLogsObject(logs: unknown): [string, unknown][] {
  if (!logs || typeof logs !== 'object' || Array.isArray(logs)) return [];
  if (logs instanceof Map) return Array.from(logs.entries());
  return Object.entries(logs as Record<string, unknown>);
}

function serializeSetLog(s: SetLog): SetLog {
  return {
    id: s.id ?? '0',
    reps: s.reps ?? null,
    weight: s.weight ?? null,
    completed: !!s.completed,
    ...(s.inputMode === 'kg' || s.inputMode === 'pct' ? { inputMode: s.inputMode } : {}),
  };
}

/** Payload estable para PUT /api/routines/:id (todo lo que el esquema Mongo guarda por log). */
export function serializeLogEntryForMongo(v: LogEntry | undefined | null): LogEntry {
  if (!v) return { rpe: '', notes: '', completed: false, sets: [] };
  const sets = Array.isArray(v.sets) ? v.sets.map(serializeSetLog) : [];
  return {
    rpe: v.rpe ?? '',
    notes: v.notes ?? '',
    completed: !!v.completed,
    ...(v.weight != null && Number.isFinite(Number(v.weight)) ? { weight: Number(v.weight) } : {}),
    sets,
  };
}

export function serializeRoutineLogsForMongo(logs: Record<string, LogEntry> | undefined): Record<string, LogEntry> {
  if (!logs || typeof logs !== 'object') return {};
  return Object.fromEntries(Object.entries(logs).map(([k, v]) => [k, serializeLogEntryForMongo(v)]));
}

function parseSetLog(s: unknown): SetLog {
  if (!s || typeof s !== 'object') {
    return { id: '0', weight: null, reps: null, completed: false };
  }
  const o = s as Record<string, unknown>;
  const im = o.inputMode;
  return {
    id: o.id != null ? String(o.id) : '0',
    reps: o.reps != null && o.reps !== '' ? Number(o.reps) : null,
    weight: o.weight != null && o.weight !== '' ? Number(o.weight) : null,
    completed: !!o.completed,
    ...(im === 'kg' || im === 'pct' ? { inputMode: im } : {}),
  };
}

/** Respuesta API / rutina cargada → estado del cliente (sin perder campos). */
export function parseLogEntryFromMongo(v: unknown): LogEntry {
  if (!v || typeof v !== 'object') return { rpe: '', notes: '', completed: false, sets: [] };
  const o = v as Record<string, unknown>;
  const sets = Array.isArray(o.sets) ? o.sets.map(parseSetLog) : [];
  const w = o.weight;
  return {
    rpe: o.rpe != null ? String(o.rpe) : '',
    notes: o.notes != null ? String(o.notes) : '',
    completed: !!o.completed,
    ...(w != null && w !== '' && Number.isFinite(Number(w)) ? { weight: Number(w) } : {}),
    sets,
  };
}

export function parseRoutineLogsFromMongo(logs: unknown): Record<string, LogEntry> {
  return Object.fromEntries(entriesFromLogsObject(logs).map(([k, v]) => [k, parseLogEntryFromMongo(v)]));
}
