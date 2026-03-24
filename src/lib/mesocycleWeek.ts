/**
 * Semana 1–4 dentro del bloque de mesociclo (ciclo de 4 semanas).
 * Usa la semana del año (1–52 del modelo de la app), no el calendario mensual
 * (evita meses con 5 “semanas” que rompían el 1–4).
 */
export function getMesocycleWeekIndex(weekNumber: number): number {
  return ((Math.max(1, weekNumber) - 1) % 4) + 1;
}

/** Alias al editar plantillas por “tipo” de semana (1–4). */
export const getWeekTypeSlot = getMesocycleWeekIndex;
