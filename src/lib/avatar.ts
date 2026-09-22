import { apiUpload, getApiBaseUrl, mediaUrl } from '@/src/lib/api';

const FAKE_AVATAR = /picsum\.photos|ui-avatars\.com|pravatar\.cc|randomuser\.me/i;
const USER_MEDIA_RE = /\/api\/media\/user\/([a-f0-9]{24})/i;
const MEDIA_KEY_RE =
  /^\d{6}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;
const MEDIA_KEY_IN_URL_RE =
  /(\d{6}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+)/i;

export function avatarInitial(name?: string | null): string {
  return (name || '').trim().charAt(0).toUpperCase() || '?';
}

function apiOrigin(): string {
  return getApiBaseUrl().replace(/\/$/, '');
}

function withApiOrigin(path: string): string {
  const origin = apiOrigin();
  return origin ? `${origin}${path.startsWith('/') ? path : `/${path}`}` : path;
}

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '10.0.2.2';
}

/** Ruta de medios en el origen de la página (proxy Vite / rewrite Vercel), no localhost viejo. */
function sameOriginMediaPath(pathAndQuery: string): string {
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  if (typeof window !== 'undefined') {
    try {
      const o = window.location.origin;
      if (o && o !== 'null' && !o.startsWith('file:')) return path;
    } catch {
      /* ignore */
    }
  }
  return withApiOrigin(path);
}

/** Si la foto se guardó con localhost u otro host, nos quedamos solo con la ruta. */
function toCurrentApiPath(raw: string): string | null {
  try {
    const u = raw.startsWith('http://') || raw.startsWith('https://') ? new URL(raw) : null;
    if (u?.pathname.startsWith('/api/media/')) return `${u.pathname}${u.search}`;
  } catch {
    /* ignore */
  }
  if (raw.startsWith('/api/media/')) return raw;
  return null;
}

function extractUserIdFromAvatar(raw: string): string {
  const m = USER_MEDIA_RE.exec(raw);
  return m?.[1] || '';
}

export function extractAvatarMediaKey(raw: string): string {
  const trimmed = (raw || '').trim();
  if (MEDIA_KEY_RE.test(trimmed)) return trimmed;
  const m = MEDIA_KEY_IN_URL_RE.exec(trimmed);
  return m?.[1] || '';
}

function cacheBust(raw: string): string {
  try {
    const href = raw.startsWith('http') ? raw : raw.startsWith('/') ? `http://local${raw}` : '';
    if (href) {
      const v = new URL(href).searchParams.get('v');
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  const key = extractAvatarMediaKey(raw);
  if (key) return key.slice(-12);
  if (raw && !raw.startsWith('/') && !raw.startsWith('http') && !raw.startsWith('data:')) {
    return raw.slice(-12);
  }
  return 'live';
}

function userMediaHref(userId: string, version: string): string {
  const path = `/api/media/user/${userId}?v=${encodeURIComponent(version || 'live')}`;
  const href = sameOriginMediaPath(path);
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : '';
    if (!token) return href;
    return `${href}&t=${encodeURIComponent(token)}`;
  } catch {
    return href;
  }
}

/** URLs a probar en orden: clave de medio, luego foto por id, nunca localhost. */
export function avatarSrcCandidates(avatar?: string | null, userId?: string | null): string[] {
  const raw = (avatar || '').trim();
  const out: string[] = [];
  const add = (href: string | null | undefined) => {
    const v = (href || '').trim();
    if (v && !out.includes(v)) out.push(v);
  };

  if (raw.startsWith('data:') || raw.startsWith('blob:')) {
    add(raw);
    const idOnly = String(userId || '').trim();
    if (idOnly) add(userMediaHref(idOnly, 'live'));
    return out;
  }
  if (FAKE_AVATAR.test(raw)) {
    const idOnly = String(userId || '').trim();
    if (idOnly) add(userMediaHref(idOnly, 'live'));
    return out;
  }

  const key = extractAvatarMediaKey(raw);
  if (key) add(mediaUrl(key));

  const id = String(userId || '').trim() || extractUserIdFromAvatar(raw);
  if (id) add(userMediaHref(id, cacheBust(raw)));

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      if (!isLocalHost(new URL(raw).hostname)) add(raw);
    } catch {
      /* ignore */
    }
  }

  if (!key && !id) {
    const rewritten = resolveAvatarUrl(raw);
    add(rewritten);
  }
  return out;
}

/** Misma URL en Progreso, Perfil y el resto: clave de medios o foto real, nunca un placeholder. */
export function resolveAvatarUrl(avatar?: string | null): string | null {
  const raw = (avatar || '').trim();
  if (!raw || FAKE_AVATAR.test(raw)) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const key = extractAvatarMediaKey(raw);
  if (key) return mediaUrl(key);
  const mediaPath = toCurrentApiPath(raw);
  if (mediaPath) {
    if (USER_MEDIA_RE.test(mediaPath)) return sameOriginMediaPath(mediaPath);
    const rest = mediaPath.replace(/^\/api\/media\//i, '').split('?')[0];
    if (rest && !rest.startsWith('user/')) return mediaUrl(rest);
    return sameOriginMediaPath(mediaPath);
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      if (isLocalHost(new URL(raw).hostname)) return null;
    } catch {
      /* ignore */
    }
    return raw;
  }
  if (raw.startsWith('/')) return sameOriginMediaPath(raw);
  return mediaUrl(raw);
}

/** Foto por id: origen actual, o la clave de medio si la tenemos. */
export function userAvatarSrc(avatar?: string | null, userId?: string | null): string | null {
  return avatarSrcCandidates(avatar, userId)[0] || null;
}

export function hasRealAvatar(avatar?: string | null, userId?: string | null): boolean {
  return avatarSrcCandidates(avatar, userId).length > 0;
}

/** Recorte en data URL → clave en el almacén de medios. */
export async function uploadAvatarDataUrl(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append('file', blob, 'avatar.jpg');
  const data = await apiUpload<{ avatar: string }>('/api/auth/me/avatar', form);
  if (!data?.avatar) throw new Error('No se ha podido guardar la foto');
  return data.avatar;
}
