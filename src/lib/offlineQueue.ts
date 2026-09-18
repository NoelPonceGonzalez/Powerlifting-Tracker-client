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

function tokenScope(): string {
  try {
    return (localStorage.getItem('auth_token') || '').slice(-16) || 'anon';
  } catch {
    return 'anon';
  }
}

function loadAll(): Record<string, QueuedWrite[]> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, QueuedWrite[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
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
    const next = loadAll();
    next[scope] = left;
    saveAll(next);
  } finally {
    flushing = false;
  }
}
