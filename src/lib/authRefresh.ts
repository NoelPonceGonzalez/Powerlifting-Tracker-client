/** Renueva el JWT en silencio. Si falla (sin red, sesión cerrada), se deja el token actual. */

export async function silentRefreshToken(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!refreshed.ok) return null;
    const body = await refreshed.json();
    return typeof body?.token === 'string' && body.token ? body.token : null;
  } catch {
    return null;
  }
}
