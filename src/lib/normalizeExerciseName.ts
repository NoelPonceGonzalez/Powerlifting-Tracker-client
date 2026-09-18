/**
 * Clave estable para comparar nombres de ejercicio (TM internos, alias, etc.).
 * Mayúsculas, acentos, espacios múltiples y NBSP no deben crear "otro" ejercicio.
 */
export function normalizeExerciseNameKey(s?: string | null): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

export function guessLinkedTmId(
  name: string,
  tms: { id: string; name: string }[],
): string {
  const k = normalizeExerciseNameKey(name);
  if (!k || tms.length === 0) return '';
  const ranked = tms
    .map((tm) => {
      const tk = normalizeExerciseNameKey(tm.name);
      if (!tk) return { id: tm.id, score: 0 };
      if (k === tk) return { id: tm.id, score: 100 };
      if (k.includes(tk) || tk.includes(k)) return { id: tm.id, score: 70 + Math.min(tk.length, 15) };
      return { id: tm.id, score: 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked[0]) return ranked[0].id;

  const groups: { hit: boolean; needles: string[] }[] = [
    { hit: /sentadilla|squat/.test(k), needles: ['squat', 'sentadilla'] },
    { hit: /banca|bench/.test(k), needles: ['bench', 'banca'] },
    { hit: /peso muerto|deadlift/.test(k), needles: ['deadlift', 'peso muerto'] },
  ];
  for (const g of groups) {
    if (!g.hit) continue;
    const tm = tms.find((t) => {
      const tk = normalizeExerciseNameKey(t.name);
      return g.needles.some((n) => tk.includes(n));
    });
    if (tm) return tm.id;
  }
  return '';
}
