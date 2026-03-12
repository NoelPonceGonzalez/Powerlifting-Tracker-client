/** Obtiene la URL base de la API (vacío = mismo origen) */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const base = (window as any).__API_BASE__;
    if (base) return base;
    // Fallback: usar origen actual cuando se carga desde el servidor
    return window.location.origin;
  }
  return '';
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
  const base = getBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  const url = new URL(path, base || 'http://3.231.3.49:3000'); // API en EC2
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const fetchUrl = base ? url.toString() : url.pathname + url.search;
  const res = await fetch(fetchUrl, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Error en la solicitud');
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  const base = getBaseUrl();
  const url = base ? base + path : path;
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
  const base = getBaseUrl();
  const url = base ? base + path : path;
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
