import type { LogEntry, SetLog } from '@/src/types';
import { ROUTINE_LOG_KEY_RE, routineLogKey } from '@/src/lib/routineLogKey';

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
  const en = v.exerciseName;
  return {
    rpe: v.rpe ?? '',
    notes: v.notes ?? '',
    completed: !!v.completed,
    ...(v.weight != null && Number.isFinite(Number(v.weight)) ? { weight: Number(v.weight) } : {}),
    ...(typeof en === 'string' && en.trim() ? { exerciseName: en.trim() } : {}),
    sets,
  };
}

export function serializeRoutineLogsForMongo(logs: Record<string, LogEntry> | undefined): Record<string, LogEntry> {
  if (!logs || typeof logs !== 'object') return {};
  return Object.fromEntries(Object.entries(logs).map(([k, v]) => [k, serializeLogEntryForMongo(v)]));
}

function isLogEntryEmpty(e: LogEntry): boolean {
  if (e.completed) return false;
  if (e.rpe && e.rpe !== '') return false;
  if (e.notes && e.notes !== '') return false;
  if (e.weight != null) return false;
  if (Array.isArray(e.sets) && e.sets.some(s => s.weight != null || s.reps != null || s.completed)) return false;
  return true;
}

/** Igual que serializeRoutineLogsForMongo pero descarta entradas vacías para reducir el payload. */
export function compactRoutineLogsForMongo(logs: Record<string, LogEntry> | undefined): Record<string, LogEntry> {
  if (!logs || typeof logs !== 'object') return {};
  const out: Record<string, LogEntry> = {};
  for (const [k, v] of Object.entries(logs)) {
    const s = serializeLogEntryForMongo(v);
    if (!isLogEntryEmpty(s)) out[k] = s;
  }
  return out;
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
  const exn = o.exerciseName;
  return {
    rpe: o.rpe != null ? String(o.rpe) : '',
    notes: o.notes != null ? String(o.notes) : '',
    completed: !!o.completed,
    ...(w != null && w !== '' && Number.isFinite(Number(w)) ? { weight: Number(w) } : {}),
    ...(typeof exn === 'string' && exn.trim() ? { exerciseName: exn.trim() } : {}),
    sets,
  };
}

const TAIL_LOG_KEY_RE = /w(\d+)-d(\d+)-e(\d+)$/;

/** Migra claves legadas `w13-w13-d0-w13-d0-e1` → `w13-d0-e1` (misma forma que el servidor). */
export function normalizeRoutineLogsKeys(logs: Record<string, LogEntry>): Record<string, LogEntry> {
  const score = (e: LogEntry) => {
    let n = 0;
    if (e.notes?.trim()) n += 2;
    if (e.rpe?.trim()) n += 2;
    if (e.completed) n += 3;
    if (e.weight != null) n += 1;
    if (Array.isArray(e.sets)) {
      n += e.sets.filter((s) => s.weight != null || s.reps != null || s.completed).length * 4;
    }
    return n;
  };

  const out: Record<string, LogEntry> = {};
  for (const [k, v] of Object.entries(logs)) {
    let canonical = k;
    if (!ROUTINE_LOG_KEY_RE.test(k)) {
      const m = TAIL_LOG_KEY_RE.exec(k);
      if (m) {
        canonical = routineLogKey(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      }
    }
    const prev = out[canonical];
    if (!prev || score(v) >= score(prev)) {
      out[canonical] = v;
    }
  }
  return out;
}

export function parseRoutineLogsFromMongo(logs: unknown): Record<string, LogEntry> {
  const raw = Object.fromEntries(entriesFromLogsObject(logs).map(([k, v]) => [k, parseLogEntryFromMongo(v)]));
  return normalizeRoutineLogsKeys(raw);
}
