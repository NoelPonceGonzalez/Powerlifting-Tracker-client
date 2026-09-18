export type SocialTab = 'friends' | 'challenges' | 'checkins' | 'chat';

export function normalizeSocialTab(tab?: string | null): SocialTab {
  if (tab === 'friends' || tab === 'challenges' || tab === 'checkins' || tab === 'chat') return tab;
  return 'chat';
}
