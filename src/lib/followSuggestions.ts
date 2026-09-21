import { apiGet } from '@/src/lib/api';
import type { UserSearchResult } from '@/src/types';

export type FollowSuggestPack = {
  followBack: UserSearchResult[];
  friends: UserSearchResult[];
  discover: UserSearchResult[];
};

export function parseFollowSuggestPack(raw: unknown): FollowSuggestPack {
  const empty: FollowSuggestPack = { followBack: [], friends: [], discover: [] };
  if (!raw) return empty;
  if (Array.isArray(raw)) return { ...empty, discover: raw };
  const obj = raw as Partial<FollowSuggestPack>;
  return {
    followBack: Array.isArray(obj.followBack) ? obj.followBack : [],
    friends: Array.isArray(obj.friends) ? obj.friends : [],
    discover: Array.isArray(obj.discover) ? obj.discover : [],
  };
}

function alreadyConnected(user: UserSearchResult): boolean {
  if (user.friendshipStatus === 'accepted' || user.friendshipStatus === 'following') return true;
  if (user.friendshipStatus === 'pending' && user.friendshipDirection === 'outgoing') return true;
  if (user.canSendRequest === false && user.friendshipStatus !== 'follower') return true;
  return false;
}

/** Te siguen → amigos de amigos → descubrir. Sin duplicados ni gente que ya sigues / tienes pendiente. */
export function flattenFollowSuggestions(pack: FollowSuggestPack): UserSearchResult[] {
  const seen = new Set<string>();
  const out: UserSearchResult[] = [];
  for (const list of [pack.followBack, pack.friends, pack.discover]) {
    for (const user of list) {
      if (!user?.id || seen.has(user.id) || alreadyConnected(user)) continue;
      seen.add(user.id);
      out.push(user);
    }
  }
  return out;
}

export async function fetchFollowSuggestions(): Promise<FollowSuggestPack> {
  const raw = await apiGet<FollowSuggestPack | UserSearchResult[]>('/api/social/suggestions');
  return parseFollowSuggestPack(raw);
}
