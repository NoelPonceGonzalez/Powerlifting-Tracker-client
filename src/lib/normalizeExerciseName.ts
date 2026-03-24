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
