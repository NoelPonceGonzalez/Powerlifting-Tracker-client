import { showAppError } from '@/src/lib/appNotice';

/** Escrituras del plan que fallan sin red: se reenvían al volver. */

const LS_KEY = 'pl-offline-writes';

export type QueuedWrite = {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH';
  path: string;
  body: unknown;
  createdAt: number;
};

function decodeUserIdFromToken(token: string): string {
  try {
    const part = token.split('.')[1];
    if (!part) return '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const payload = JSON.parse(json) as { userId?: string };
    return payload?.userId ? String(payload.userId) : '';
  } catch {
    return '';
  }
}

/** Estable entre renovaciones de JWT. El sufijo del token cambiaba y huérfana la cola. */
export function offlineUserScope(): string {
  try {
    const token = localStorage.getItem('auth_token') || '';
    return decodeUserIdFromToken(token) || token.slice(-16) || 'anon';
  } catch {
    return 'anon';
  }
}

export function offlineLegacyTokenScope(): string {
  try {
    return (localStorage.getItem('auth_token') || '').slice(-16) || '';
  } catch {
    return '';
  }
}

function tokenScope(): string {
  return offlineUserScope();
}

function loadAll(): Record<string, QueuedWrite[]> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, QueuedWrite[]>;
    if (!parsed || typeof parsed !== 'object') return {};
    const uid = offlineUserScope();
    const legacy = offlineLegacyTokenScope();
    if (uid && legacy && uid !== legacy && Array.isArray(parsed[legacy]) && parsed[legacy].length) {
      parsed[uid] = [...(parsed[uid] || []), ...parsed[legacy]];
      delete parsed[legacy];
      saveAll(parsed);
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, QueuedWrite[]>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* cuota */
  }
}

export function isQueueableWrite(method: string, path: string): boolean {
  const p = path.split('?')[0];
  if (method === 'GET' || method === 'DELETE') return false;
  if (p.startsWith('/api/routines/') && (method === 'PUT' || method === 'PATCH')) return true;
  if (p.startsWith('/api/training-maxes') && method !== 'GET') return true;
  if (p.startsWith('/api/internal-exercise-maxes') && method !== 'GET') return true;
  return false;
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const msg = String((err as { message?: string })?.message || err || '');
  return /failed to fetch|networkerror|load failed|network request failed|Failed to fetch/i.test(msg);
}

const PENDING_EVENT = 'pl-offline-writes';

function notifyPending() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PENDING_EVENT));
}

export function subscribePendingWrites(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PENDING_EVENT, listener);
  return () => window.removeEventListener(PENDING_EVENT, listener);
}

export function enqueueWrite(item: Omit<QueuedWrite, 'id' | 'createdAt'>): void {
  const all = loadAll();
  const scope = tokenScope();
  const list = all[scope] || [];
  list.push({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  });
  all[scope] = list.slice(-40);
  saveAll(all);
  notifyPending();
}

/** Parches de series que aún no han salido: se aplican encima del plan cacheado. */
export function queuedLogPatches(): Array<{ routineId: string; logs: Record<string, unknown> }> {
  const list = loadAll()[tokenScope()] || [];
  const out: Array<{ routineId: string; logs: Record<string, unknown> }> = [];
  for (const item of list) {
    const m = item.path.split('?')[0].match(/^\/api\/routines\/([^/]+)\/logs$/);
    if (!m || item.method !== 'PATCH') continue;
    const body = item.body as { logs?: Record<string, unknown> };
    if (body?.logs && typeof body.logs === 'object') {
      out.push({ routineId: m[1], logs: body.logs });
    }
  }
  return out;
}

export function applyQueuedLogPatches<T>(path: string, data: T): T {
  const p = path.split('?')[0];
  const patches = queuedLogPatches();
  if (!patches.length) return data;

  const mergeOne = (r: any) => {
    if (!r || typeof r !== 'object') return r;
    const id = String(r._id || r.id || '');
    const extra = patches.filter((x) => x.routineId === id);
    if (!extra.length) return r;
    let logs = { ...(r.logs || {}) };
    for (const x of extra) logs = { ...logs, ...x.logs };
    return { ...r, logs };
  };

  if (p === '/api/routines' && Array.isArray(data)) {
    return data.map(mergeOne) as T;
  }
  if (/^\/api\/routines\/[^/]+$/.test(p) && data && typeof data === 'object') {
    return mergeOne(data) as T;
  }
  return data;
}

export function pendingWriteCount(): number {
  return (loadAll()[tokenScope()] || []).length;
}

let flushing = false;

export async function flushOfflineWrites(
  send: (item: QueuedWrite) => Promise<void>
): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const scope = tokenScope();
  const all = loadAll();
  const list = all[scope] || [];
  if (list.length === 0) return;
  flushing = true;
  try {
    const left: QueuedWrite[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      try {
        await send(item);
      } catch (err) {
        if (isNetworkError(err)) {
          left.push(...list.slice(i));
          break;
        }
        showAppError('No se ha podido sincronizar un cambio guardado sin red.', err);
      }
    }
    const startedIds = new Set(list.map((item) => item.id));
    const next = loadAll();
    const arrivedDuringFlush = (next[scope] || []).filter((item) => !startedIds.has(item.id));
    next[scope] = [...left, ...arrivedDuringFlush];
    saveAll(next);
    notifyPending();
  } finally {
    flushing = false;
  }
}
