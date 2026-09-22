export type AppNoticeTone = 'error' | 'ok';

export type AppNotice = {
  id: number;
  message: string;
  tone: AppNoticeTone;
};

type Listener = (n: AppNotice) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function subscribeAppNotices(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function emit(message: string, tone: AppNoticeTone) {
  const text = String(message || '').trim();
  if (!text) return;
  const notice: AppNotice = { id: nextId++, message: text, tone };
  listeners.forEach((fn) => fn(notice));
}

const SILENT_ERRORS = /^(no le sigues|ya le sigues|ya le enviaste|ya existe una solicitud)/i;

export function showAppError(message: string, err?: unknown) {
  const fromErr = err instanceof Error && err.message ? err.message.trim() : '';
  if (SILENT_ERRORS.test(fromErr) || SILENT_ERRORS.test(message)) return;
  const generic = !fromErr || /error en la solicitud|failed to fetch|networkerror|load failed|network request failed/i.test(fromErr);
  emit(generic ? message : fromErr, 'error');
}

export function showAppOk(message: string) {
  emit(message, 'ok');
}
