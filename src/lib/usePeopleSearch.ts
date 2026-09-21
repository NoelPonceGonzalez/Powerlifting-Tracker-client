import { useEffect, useState } from 'react';
import { apiGet } from '@/src/lib/api';
import type { UserSearchResult } from '@/src/types';

export function usePeopleSearch(open: boolean, q: string, myId?: string) {
  const [hits, setHits] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!open || !query) {
      setHits([]);
      setSearching(false);
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const results = await apiGet<UserSearchResult[]>('/api/social/search', { q: query });
        const list = Array.isArray(results) ? results : [];
        if (live) setHits(myId ? list.filter(u => u.id !== myId) : list);
      } catch {
        if (live) setHits([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 240);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, q, myId]);

  return { hits, searching };
}
