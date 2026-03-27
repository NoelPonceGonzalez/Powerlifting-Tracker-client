/** Origen de la API: `VITE_API_BASE_URL` tiene prioridad (p. ej. API en AWS con UI en localhost). */
function envApiUrl(): string {
  const v = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return v != null && String(v).trim() !== '' ? v.replace(/\/$/, '') : '';
}

export const API_URL =
  typeof window !== 'undefined' ? envApiUrl() || window.location.origin : envApiUrl();

export const API_BASE_URL = API_URL;
