import { mediaUrl } from '@/src/lib/api';

const FAKE_AVATAR = /picsum\.photos|ui-avatars\.com|pravatar\.cc|randomuser\.me/i;

export function avatarInitial(name?: string | null): string {
  return (name || '').trim().charAt(0).toUpperCase() || '?';
}

/** Misma URL en Progreso, Perfil y el resto: clave de medios o foto real, nunca un placeholder. */
export function resolveAvatarUrl(avatar?: string | null): string | null {
  const raw = (avatar || '').trim();
  if (!raw || FAKE_AVATAR.test(raw)) return null;
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:') ||
    raw.startsWith('/')
  ) {
    return raw;
  }
  return mediaUrl(raw);
}

export function hasRealAvatar(avatar?: string | null): boolean {
  return !!resolveAvatarUrl(avatar);
}
