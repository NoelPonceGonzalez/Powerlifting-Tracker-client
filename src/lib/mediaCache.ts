import { mediaUrl } from '@/src/lib/api';

/**
 * Una historia se descarga una vez por teléfono y las repeticiones salen de aquí.
 * La clave del archivo no cambia, así que la copia vale las 24 h que vive la historia.
 * Tope de memoria: unos pocos vídeos, para no llenar el teléfono.
 */
const CACHE_NAME = 'pl-story-media-v2';
const INDEX_KEY = 'pl-story-media-index';
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Meta = { key: string; bytes: number; at: number };

const memory = new Map<string, { url: string; bytes: number; at: number }>();
const inflight = new Map<string, Promise<string>>();
const pins = new Map<string, number>();

function cacheRequest(key: string): Request {
  return new Request(`/api/media/${key}`);
}

function readIndex(): Meta[] {
  try {
    const raw = sessionStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is Meta =>
      !!row && typeof row.key === 'string' && typeof row.bytes === 'number' && typeof row.at === 'number');
  } catch {
    return [];
  }
}

function writeIndex(items: Meta[]) {
  try {
    sessionStorage.setItem(INDEX_KEY, JSON.stringify(items));
  } catch {
    /* el navegador puede rechazar sessionStorage; la copia en memoria sigue valiendo */
  }
}

function remember(key: string, blob: Blob): string {
  const prev = memory.get(key);
  if (prev) URL.revokeObjectURL(prev.url);
  const url = URL.createObjectURL(blob);
  memory.set(key, { url, bytes: blob.size, at: Date.now() });
  const index = readIndex().filter(row => row.key !== key);
  index.push({ key, bytes: blob.size, at: Date.now() });
  writeIndex(index);
  return url;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function evict(): Promise<void> {
  const now = Date.now();
  const cache = await openCache();
  const drop = async (key: string) => {
    const held = memory.get(key);
    if (held) {
      URL.revokeObjectURL(held.url);
      memory.delete(key);
    }
    if (cache) await cache.delete(cacheRequest(key)).catch(() => undefined);
  };

  const fresh = readIndex().filter(row => now - row.at <= MAX_AGE_MS || (pins.get(row.key) || 0) > 0);
  for (const row of readIndex()) {
    if (now - row.at > MAX_AGE_MS && (pins.get(row.key) || 0) === 0) await drop(row.key);
  }

  const ordered = [...fresh].sort((a, b) => a.at - b.at);
  let total = ordered.reduce((sum, row) => sum + row.bytes, 0);
  const keep: Meta[] = [];
  for (const row of ordered) {
    if (total > MAX_BYTES && (pins.get(row.key) || 0) === 0) {
      await drop(row.key);
      total -= row.bytes;
      continue;
    }
    keep.push(row);
  }
  writeIndex(keep);
}

export function pinMedia(key: string): () => void {
  pins.set(key, (pins.get(key) || 0) + 1);
  return () => {
    const next = (pins.get(key) || 1) - 1;
    if (next <= 0) pins.delete(key);
    else pins.set(key, next);
  };
}

export async function dropCachedMedia(key: string): Promise<void> {
  const held = memory.get(key);
  if (held) {
    URL.revokeObjectURL(held.url);
    memory.delete(key);
  }
  inflight.delete(key);
  writeIndex(readIndex().filter(row => row.key !== key));
  const cache = await openCache();
  if (cache) await cache.delete(cacheRequest(key)).catch(() => undefined);
}

async function loadFresh(key: string): Promise<string> {
  const res = await fetch(mediaUrl(key));
  if (!res.ok) throw new Error('media');
  const blob = await res.blob();
  if (!blob.size) throw new Error('media');
  const cache = await openCache();
  if (cache) {
    await cache.put(cacheRequest(key), new Response(blob, {
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    })).catch(() => undefined);
  }
  const url = remember(key, blob);
  await evict();
  const kept = memory.get(key);
  return kept?.url || url;
}

async function loadCached(key: string): Promise<string> {
  const held = memory.get(key);
  if (held) {
    held.at = Date.now();
    return held.url;
  }
  const cache = await openCache();
  if (cache) {
    const hit = await cache.match(cacheRequest(key));
    if (hit) {
      const blob = await hit.blob();
      if (blob.size) {
        const url = remember(key, blob);
        await evict();
        return memory.get(key)?.url || url;
      }
    }
  }
  return loadFresh(key);
}

/** La misma clave comparte una sola descarga, también si la historia siguiente se prepara a la vez. */
export function cachedMediaUrl(key: string): Promise<string> {
  const held = memory.get(key);
  if (held) {
    held.at = Date.now();
    return Promise.resolve(held.url);
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = loadCached(key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

export function prefetchMedia(key: string): void {
  void cachedMediaUrl(key).catch(() => undefined);
}
