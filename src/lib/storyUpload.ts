import { useSyncExternalStore } from 'react';

/** Un minuto de vídeo se vuelve a grabar al quemar el texto, más la subida. */
export const STORY_UPLOAD_MAX_MS = 3 * 60 * 1000;

export interface StoryUploadNotice {
  id: string;
  message: string;
  createdAt: string;
  seen: boolean;
}

interface Snap {
  uploading: boolean;
  doneTick: number;
  notices: StoryUploadNotice[];
  unseen: number;
}

const STORAGE_KEY = 'pl-story-upload-notices';

function loadNotices(): StoryUploadNotice[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is StoryUploadNotice =>
      !!row && typeof row.id === 'string' && typeof row.message === 'string' && typeof row.createdAt === 'string');
  } catch {
    return [];
  }
}

function saveNotices(list: StoryUploadNotice[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* sesión privada */
  }
}

let uploading = false;
let doneTick = 0;
let notices = typeof sessionStorage === 'undefined' ? [] : loadNotices();
let snap: Snap = { uploading, doneTick, notices, unseen: notices.filter(n => !n.seen).length };
const listeners = new Set<() => void>();
let token = 0;

function publish() {
  snap = {
    uploading,
    doneTick,
    notices,
    unseen: notices.filter(n => !n.seen).length,
  };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return snap;
}

export function useStoryUpload(): Snap {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function isStoryUploading(): boolean {
  return uploading;
}

function pushNotice(message: string) {
  notices = [
    {
      id: `story-upload-${Date.now()}`,
      message,
      createdAt: new Date().toISOString(),
      seen: false,
    },
    ...notices,
  ].slice(0, 8);
  saveNotices(notices);
}

export function markStoryUploadNoticesSeen() {
  if (!notices.some(n => !n.seen)) return;
  notices = notices.map(n => ({ ...n, seen: true }));
  saveNotices(notices);
  publish();
}

/** false = ya hay una historia en camino. La anterior tiene que acabar. */
export function beginStoryUpload(run: (signal: AbortSignal) => Promise<void>): boolean {
  if (uploading) return false;
  uploading = true;
  const gen = ++token;
  const ac = new AbortController();
  publish();
  const timer = window.setTimeout(() => ac.abort(), STORY_UPLOAD_MAX_MS);
  void run(ac.signal)
    .then(() => {
      if (gen !== token) return;
      doneTick += 1;
    })
    .catch((error: unknown) => {
      if (gen !== token) return;
      const aborted = ac.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
      pushNotice(
        aborted
          ? 'La historia no se ha subido. Ha tardado demasiado y se ha cancelado.'
          : error instanceof Error && error.message
            ? error.message
            : 'La historia no se ha podido subir.'
      );
    })
    .finally(() => {
      window.clearTimeout(timer);
      if (gen !== token) return;
      uploading = false;
      publish();
    });
  return true;
}
