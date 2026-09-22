function key(kind: 'requests' | 'challenges', userId: string) {
  return `pl-seen-${kind}:${userId}`;
}

function readIds(kind: 'requests' | 'challenges', userId: string): Set<string> {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(key(kind, userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function hasUnseenMark(kind: 'requests' | 'challenges', userId: string, currentIds: string[]): boolean {
  if (!userId || currentIds.length === 0) return false;
  const seen = readIds(kind, userId);
  return currentIds.some(id => id && !seen.has(id));
}

export function markSeenIds(kind: 'requests' | 'challenges', userId: string, currentIds: string[]) {
  if (!userId || currentIds.length === 0) return;
  const seen = readIds(kind, userId);
  for (const id of currentIds) {
    if (id) seen.add(id);
  }
  try {
    localStorage.setItem(key(kind, userId), JSON.stringify(Array.from(seen)));
  } catch {
    /* ignore quota */
  }
}

function hintKey(kind: 'requests' | 'challenges', userId: string) {
  return `pl-unseen-hint-${kind}:${userId}`;
}

/** Último estado conocido: para pintar el punto al instante, antes de que llegue la API. */
export function readUnseenHint(kind: 'requests' | 'challenges', userId: string): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(hintKey(kind, userId)) === '1';
  } catch {
    return false;
  }
}

export function writeUnseenHint(kind: 'requests' | 'challenges', userId: string, unseen: boolean) {
  if (!userId) return;
  try {
    localStorage.setItem(hintKey(kind, userId), unseen ? '1' : '0');
  } catch {
    /* ignore quota */
  }
}
