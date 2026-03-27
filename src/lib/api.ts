/** Resuelve la base de la API: WebView inyecta __API_BASE__; Vite usa VITE_API_BASE_URL; si no, mismo origen que la página. */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const w = (window as unknown as { __API_BASE__?: string }).__API_BASE__;
    if (w != null && String(w).trim() !== '') {
      return String(w).replace(/\/$/, '');
    }
    const vite = import.meta.env.VITE_API_BASE_URL as string | undefined;
    if (vite != null && String(vite).trim() !== '') {
      return vite.replace(/\/$/, '');
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
  return vite?.replace(/\/$/, '') || '';
}

function resolveOriginForUrl(path: string): string {
  const base = getBaseUrl();
  if (base) return base;
  if (typeof window !== 'undefined') {
    try {
      return window.location.origin;
    } catch {
      /* ignore */
    }
  }
  return 'http://localhost:3000';
}

/** URL base de la API para uso directo (Login, health check, etc.) */
export function getApiBaseUrl(): string {
  return resolveOriginForUrl('');
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
  const origin = resolveOriginForUrl(path);
  const url = new URL(path.startsWith('/') ? path : `/${path}`, origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
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
  const origin = resolveOriginForUrl(path);
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
  const origin = resolveOriginForUrl(path);
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
  const origin = resolveOriginForUrl(path);
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
  const origin = resolveOriginForUrl(path);
  const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Error en la solicitud');
  }
}
