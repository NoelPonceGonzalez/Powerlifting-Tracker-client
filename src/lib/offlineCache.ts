import { offlineLegacyTokenScope, offlineUserScope } from '@/src/lib/offlineQueue';

/** Última respuesta buena de los GET del plan. Así la pestaña Rutina abre sin red. */

const DB_NAME = 'pl-offline';
const STORE = 'gets';
const LS_PREFIX = 'pl-offline-get:';

function tokenScope(): string {
  return offlineUserScope();
}

export function offlineGetKey(path: string, search = ''): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${tokenScope()}::${clean}${search}`;
}

/** Solo datos del plan/entrenamiento. Nunca login ni social. */
export function isOfflinePlanPath(path: string): boolean {
  const p = path.split('?')[0];
  if (p.includes('/athlete/')) return false;
  if (p === '/api/routines' || /^\/api\/routines\/[^/]+$/.test(p)) return true;
  return (
    p === '/api/training-maxes' ||
    p === '/api/training-maxes/history' ||
    p === '/api/internal-exercise-maxes'
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* cuota o modo privado */
  }
}

function readLocal<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function saveOfflineGet(key: string, value: unknown): Promise<void> {
  writeLocal(key, value);
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(value, key);
    });
    db.close();
  } catch {
    /* IndexedDB no disponible: ya está en localStorage */
  }
}

async function readOfflineGetExact<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openDb();
      const value = await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (value !== undefined) return value;
    } catch {
      /* caer a localStorage */
    }
  }
  return readLocal<T>(key);
}

export async function readOfflineGet<T>(key: string): Promise<T | undefined> {
  const found = await readOfflineGetExact<T>(key);
  if (found !== undefined) return found;
  const uid = offlineUserScope();
  const legacy = offlineLegacyTokenScope();
  if (!uid || !legacy || uid === legacy || !key.startsWith(`${uid}::`)) return undefined;
  const oldKey = `${legacy}::${key.slice(uid.length + 2)}`;
  const old = await readOfflineGetExact<T>(oldKey);
  if (old !== undefined) void saveOfflineGet(key, old);
  return old;
}
