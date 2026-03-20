/** URL del servidor de la API. En localhost usa el origen actual; en producción usa EC2. */
const REMOTE_API = 'http://3.231.3.49:3000';
export const API_URL =
  typeof window !== 'undefined' && /^https?:\/\/localhost(\d*)([/?#]|$)/.test(window.location.origin)
    ? window.location.origin
    : REMOTE_API;

/** Alias para compatibilidad */
export const API_BASE_URL = API_URL;