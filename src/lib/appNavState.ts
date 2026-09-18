import { normalizeSocialTab, type SocialTab } from '@/src/lib/socialTab';
import type { FriendsFilter, ViewType } from '@/src/types';

const KEY = 'power_nav_v1';

export interface SavedAppNav {
  view: ViewType;
  socialTab: SocialTab;
  programScreen: 'plan' | 'routines';
  friendsFilter: FriendsFilter;
}

const VIEWS: ViewType[] = ['dashboard', 'program', 'social', 'settings'];

function isView(v: unknown): v is ViewType {
  return typeof v === 'string' && (VIEWS as string[]).includes(v);
}

function isFilter(v: unknown): v is FriendsFilter {
  return v === 'all' || v === 'following' || v === 'followers';
}

export function readSavedAppNav(): SavedAppNav | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedAppNav>;
    if (!isView(parsed.view)) return null;
    return {
      view: parsed.view,
      socialTab: normalizeSocialTab(parsed.socialTab),
      programScreen: parsed.programScreen === 'routines' ? 'routines' : 'plan',
      friendsFilter: isFilter(parsed.friendsFilter) ? parsed.friendsFilter : 'all',
    };
  } catch {
    return null;
  }
}

export function writeSavedAppNav(nav: SavedAppNav): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(nav));
  } catch {
    /* quota / private mode */
  }
}

export function clearSavedAppNav(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Query de notificación / deep link: tiene prioridad sobre lo guardado. */
export function navFromLaunchUrl(): Partial<SavedAppNav> | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const pwa = params.get('pwa');
  if (pwa === 'plan') return { view: 'program', programScreen: 'plan' };
  if (pwa === 'social') return { view: 'social', socialTab: normalizeSocialTab(params.get('tab')) };
  if (pwa === 'dashboard') return { view: 'dashboard' };
  return null;
}
