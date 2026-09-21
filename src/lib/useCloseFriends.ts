import { useCallback, useEffect, useState } from 'react';
import {
  getCloseFriendIds,
  hydrateCloseFriends,
  subscribeCloseFriends,
  toggleCloseFriend,
} from '@/src/lib/privacyApi';

export function useCloseFriends() {
  const [ids, setIds] = useState<Set<string>>(() => new Set(getCloseFriendIds()));

  useEffect(() => {
    const unsub = subscribeCloseFriends(() => setIds(new Set(getCloseFriendIds())));
    if (getCloseFriendIds().size === 0) void hydrateCloseFriends().catch(() => {});
    return unsub;
  }, []);

  const toggle = useCallback(async (userId: string, on?: boolean) => {
    const next = on ?? !getCloseFriendIds().has(userId);
    await toggleCloseFriend(userId, next);
  }, []);

  return { ids, isClose: (id: string) => ids.has(id), toggle };
}
