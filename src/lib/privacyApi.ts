import { apiDelete, apiGet, apiPost, apiPut } from '@/src/lib/api';

export type PrivacyPerson = { id: string; name: string; avatar?: string | null };
export type Audience = 'all' | 'close';

let closeIds = new Set<string>();
let closePeople: PrivacyPerson[] = [];
const closeListeners = new Set<() => void>();

function emitClose() {
  closeListeners.forEach(fn => fn());
}

export function getCloseFriendIds() {
  return closeIds;
}

export function getCloseFriends() {
  return closePeople;
}

export function subscribeCloseFriends(fn: () => void) {
  closeListeners.add(fn);
  return () => {
    closeListeners.delete(fn);
  };
}

export async function hydrateCloseFriends() {
  const r = await apiGet<{ ids: string[]; people: PrivacyPerson[] }>('/api/social/close-friends');
  closeIds = new Set(r.ids || []);
  closePeople = Array.isArray(r.people) ? r.people : [];
  emitClose();
  return r;
}

export async function toggleCloseFriend(userId: string, on: boolean) {
  const r = await apiPut<{ ok: true; on: boolean; ids: string[] }>('/api/social/close-friends', { userId, on });
  closeIds = new Set(r.ids || []);
  if (!on) closePeople = closePeople.filter(p => p.id !== userId);
  emitClose();
  return r;
}

export function fetchBlocked() {
  return apiGet<{ ids: string[]; people: PrivacyPerson[] }>('/api/social/blocked');
}

export function blockUser(userId: string) {
  return apiPost<{ ok: true }>('/api/social/block', { userId });
}

export function unblockUser(userId: string) {
  return apiDelete(`/api/social/block/${userId}`);
}

export function reportUser(userId: string, reason?: string) {
  return apiPost<{ ok: true }>('/api/social/report', { userId, reason: reason || '' });
}
