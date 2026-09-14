import type { User } from '@/src/types';

const STORAGE_KEY = 'saved_accounts_v1';
const ACTIVE_ID_KEY = 'active_account_id';

export interface SavedAccount {
  id: string;
  token: string;
  email: string;
  name: string;
  avatar?: string;
  lastUsedAt?: number;
}

export function loadSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedAccount[];
    return Array.isArray(arr) ? arr.filter((a) => a?.id && a?.token) : [];
  } catch {
    return [];
  }
}

function persist(accounts: SavedAccount[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

export function upsertAccount(entry: SavedAccount): SavedAccount[] {
  const list = loadSavedAccounts();
  const i = list.findIndex((a) => a.id === entry.id);
  const next: SavedAccount = { ...entry, lastUsedAt: Date.now() };
  if (i >= 0) list[i] = { ...list[i], ...next };
  else list.push(next);
  persist(list);
  return list;
}

export function removeAccount(userId: string): SavedAccount[] {
  const list = loadSavedAccounts().filter((a) => a.id !== userId);
  persist(list);
  return list;
}

export function getActiveAccountId(): string | null {
  return localStorage.getItem(ACTIVE_ID_KEY);
}

export function setActiveAccountId(userId: string | null): void {
  if (userId) localStorage.setItem(ACTIVE_ID_KEY, userId);
  else localStorage.removeItem(ACTIVE_ID_KEY);
}

/** Si no hay lista pero sí token + usuario en caché, crear la primera entrada (migración). */
export function migrateLegacyIfNeeded(): void {
  if (loadSavedAccounts().length > 0) return;
  const token = localStorage.getItem('auth_token');
  if (!token) return;
  try {
    const raw = localStorage.getItem('auth_user');
    if (!raw) return;
    const u = JSON.parse(raw) as User;
    if (!u?.id) return;
    upsertAccount({
      id: u.id,
      token,
      email: u.email || '',
      name: u.name || 'Atleta',
      avatar: u.avatar,
    });
    setActiveAccountId(u.id);
  } catch {
    /* ignore */
  }
}

export type AccountSummary = Omit<SavedAccount, 'token'>;

export function toSummaries(accounts: SavedAccount[]): AccountSummary[] {
  return accounts.map((a) => {
    const { token: _token, ...rest } = a;
    return rest;
  });
}
