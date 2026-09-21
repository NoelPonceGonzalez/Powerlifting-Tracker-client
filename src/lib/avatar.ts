import { apiUpload, getApiBaseUrl, mediaUrl } from '@/src/lib/api';

const FAKE_AVATAR = /picsum\.photos|ui-avatars\.com|pravatar\.cc|randomuser\.me/i;

export function avatarInitial(name?: string | null): string {
  return (name || '').trim().charAt(0).toUpperCase() || '?';
}

/** Misma URL en Progreso, Perfil y el resto: clave de medios o foto real, nunca un placeholder. */
export function resolveAvatarUrl(avatar?: string | null): string | null {
  const raw = (avatar || '').trim();
  if (!raw || FAKE_AVATAR.test(raw)) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/')) {
    const origin = getApiBaseUrl().replace(/\/$/, '');
    return origin ? `${origin}${raw}` : raw;
  }
  return mediaUrl(raw);
}

/** Foto por id: el <img> no manda JWT y así se ve igual en listas, modal y perfil. */
export function userAvatarSrc(avatar?: string | null, userId?: string | null): string | null {
  const raw = (avatar || '').trim();
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if ((raw.startsWith('http://') || raw.startsWith('https://')) && !FAKE_AVATAR.test(raw)) return raw;
  const id = String(userId || '').trim();
  if (id) {
    const origin = getApiBaseUrl().replace(/\/$/, '');
    const version = raw && !raw.startsWith('/') ? raw.slice(-12) : 'live';
    const path = `/api/media/user/${id}?v=${encodeURIComponent(version)}`;
    return origin ? `${origin}${path}` : path;
  }
  return resolveAvatarUrl(avatar);
}

export function hasRealAvatar(avatar?: string | null): boolean {
  return !!resolveAvatarUrl(avatar);
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
