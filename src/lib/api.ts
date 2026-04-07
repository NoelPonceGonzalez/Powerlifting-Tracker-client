function isInvalidApiBase(s: string): boolean {
  const t = String(s).trim();
  if (!t || t === 'null') return true;
  if (t.startsWith('file:')) return true;
  try {
    new URL(t.endsWith('/') ? t : `${t}/`);
    return false;
  } catch {
    return true;
  }
}

/** Resuelve la base de la API: WebView inyecta __API_BASE__; Vite usa VITE_/EXPO_PUBLIC_; si no, mismo origen que la página. */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const w = (window as unknown as { __API_BASE__?: string }).__API_BASE__;
    if (w != null && String(w).trim() !== '' && !isInvalidApiBase(String(w))) {
      return String(w).replace(/\/$/, '');
    }
    const vite = import.meta.env.VITE_API_BASE_URL as string | undefined;
    const expo = import.meta.env.EXPO_PUBLIC_API_URL as string | undefined;
    const fromEnv =
      (vite != null && String(vite).trim() !== '' ? String(vite).trim() : '') ||
      (expo != null && String(expo).trim() !== '' ? String(expo).trim() : '');

    /**
     * Web en HTTPS (p. ej. Vercel): una API en `http://…` incrustada en el bundle no puede llamarse
     * desde el navegador (mixed content). Usar el mismo origen y proxy en vercel.json → AWS.
     * EAS/APK (file:// o WebView sin HTTPS de la página) sigue usando `fromEnv` hacia el servidor.
     */
    if (fromEnv) {
      try {
        const apiU = new URL(fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`);
        if (window.location.protocol === 'https:' && apiU.protocol === 'http:') {
          const o = window.location.origin;
          if (o && o !== 'null' && !o.startsWith('file:')) {
            return o.replace(/\/$/, '');
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (fromEnv) {
      return fromEnv.replace(/\/$/, '');
    }
    try {
      const o = window.location.origin;
      if (o && o !== 'null' && !o.startsWith('file:')) {
        return o;
      }
    } catch {
      /* ignore */
    }
    return '';
  }
  const vite = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const expo = import.meta.env.EXPO_PUBLIC_API_URL as string | undefined;
  const fromEnv =
    (vite != null && String(vite).trim() !== '' ? String(vite).trim() : '') ||
    (expo != null && String(expo).trim() !== '' ? String(expo).trim() : '');
  return fromEnv ? fromEnv.replace(/\/$/, '') : '';
}

function resolveOriginForUrl(_path: string): string {
  const base = getBaseUrl();
  if (base) return base;
  if (typeof window !== 'undefined') {
    try {
      const o = window.location.origin;
      if (o && o !== 'null' && !o.startsWith('file:')) {
        return o;
      }
      // APK con assets file://: localhost es el propio móvil, no el PC — no usar como fallback
      if (window.location.protocol === 'file:') {
        return '';
      }
    } catch {
      /* ignore */
    }
  }
  // Solo en desarrollo (Vite dev / npm run dev): mismo origen típico http://localhost:3000
  // En build de producción (EAS, AWS, etc.) nunca forzar localhost: obliga a EXPO_PUBLIC_API_URL / extra.apiUrl
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }
  return '';
}

const MISSING_API_ORIGIN_MSG =
  'Falta la URL del servidor API. En la app instalada (APK/AAB) define expo.extra.apiUrl en app.json o EXPO_PUBLIC_API_URL en EAS (URL pública HTTPS de tu backend).';

function requireApiOrigin(origin: string): string {
  if (!origin) throw new Error(MISSING_API_ORIGIN_MSG);
  return origin;
}

/** URL base de la API para uso directo (Login, health check, etc.) */
export function getApiBaseUrl(): string {
  return resolveOriginForUrl('');
}

/** true si la API resuelta es claramente entorno local (mensajes de error en login, etc.) */
export function isLocalDevApiBase(): boolean {
  const base = resolveOriginForUrl('').trim();
  if (!base) return import.meta.env.DEV;
  try {
    const u = new URL(base.startsWith('http') ? base : `https://${base}`);
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '10.0.2.2';
  } catch {
    return import.meta.env.DEV;
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const origin = requireApiOrigin(resolveOriginForUrl(path));
  const url = new URL(path.startsWith('/') ? path : `/${path}`, origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      const s = String(v);
      if (s === '') return;
      url.searchParams.set(k, s);
    });
  }
  const res = await fetch(url.toString(), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Error en la solicitud');
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  const origin = requireApiOrigin(resolveOriginForUrl(path));
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.errors?.[0]?.msg || err.message || 'Error en la solicitud');
  }
  return res.json();
}

export async function apiPut<T>(path: string, body: object): Promise<T> {
  const origin = requireApiOrigin(resolveOriginForUrl(path));
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.errors?.[0]?.msg || err.message || 'Error en la solicitud');
  }
  return res.json();
}

export async function apiPatch<T>(path: string, body: object): Promise<T> {
  const origin = requireApiOrigin(resolveOriginForUrl(path));
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.errors?.[0]?.msg || err.message || 'Error en la solicitud');
  }
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const origin = requireApiOrigin(resolveOriginForUrl(path));
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Error en la solicitud');
  }
}
