/** Origen de la API: `VITE_API_BASE_URL` o `EXPO_PUBLIC_API_URL` (build APK / WebView). */
function envApiUrl(): string {
  const v = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const ex = import.meta.env.EXPO_PUBLIC_API_URL as string | undefined;
  const pick =
    (v != null && String(v).trim() !== '' ? String(v).trim() : '') ||
    (ex != null && String(ex).trim() !== '' ? String(ex).trim() : '');
  return pick ? pick.replace(/\/$/, '') : '';
}

/** La shell nativa inyecta `__API_BASE__` antes del bundle (APK con file://). Tiene prioridad sobre env embebido. */
function injectedApiBase(): string {
  if (typeof window === 'undefined') return '';
  const w = (window as unknown as { __API_BASE__?: string }).__API_BASE__;
  if (w == null) return '';
  const s = String(w).trim();
  if (s === '' || s === 'null') return '';
  if (s.startsWith('file:')) return '';
  return s.replace(/\/$/, '');
}

/** En WebView file:// el origin suele ser la cadena "null"; no usarlo como base de API. */
function safePageOrigin(): string {
  if (typeof window === 'undefined') return '';
  try {
    const o = window.location.origin;
    if (o && o !== 'null' && !o.startsWith('file:')) return o;
  } catch {
    /* ignore */
  }
  return '';
}

export const API_URL =
  typeof window !== 'undefined'
    ? injectedApiBase() || envApiUrl() || safePageOrigin()
    : envApiUrl();

export const API_BASE_URL = API_URL;
