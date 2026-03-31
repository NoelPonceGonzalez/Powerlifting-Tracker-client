/**
 * Semana 1–N dentro del bloque de mesociclo (ciclo de N semanas).
 * Por defecto N=4 (compatibilidad con planes existentes).
 */
export function getMesocycleWeekIndex(weekNumber: number, cycleLength = 4): number {
  const cl = Math.max(1, cycleLength);
  return ((Math.max(1, weekNumber) - 1) % cl) + 1;
}

/** Alias al editar plantillas por "tipo" de semana (1–N). */
export const getWeekTypeSlot = getMesocycleWeekIndex;

/** Semana civil 1–52 aproximada (mismo criterio que TrainingPlan: días desde 1 ene). */
export function weekOfYearFromDate(d: Date, year: number): number {
  const jan1 = new Date(year, 0, 1);
  const diffDays = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
}

/**
 * Primera semana del plan (1–52) cuyo día inicial cae en ese mes civil.
 */
export function firstWeekOfYearStartingInMonth(year: number, monthIndex0: number): number {
  const jan1 = new Date(year, 0, 1);
  for (let w = 1; w <= 52; w++) {
    const d = new Date(jan1);
    d.setDate(jan1.getDate() + (w - 1) * 7);
    if (d.getFullYear() === year && d.getMonth() === monthIndex0) {
      return w;
    }
  }
  return Math.max(1, Math.min(52, weekOfYearFromDate(new Date(year, monthIndex0, 1), year)));
}

/**
 * Primer día civil de la ventana de 7 días de la "semana N" del plan.
 */
export function weekStartDateForWeekOfYear(weekOfYear: number, year: number): Date {
  const jan1 = new Date(year, 0, 1);
  const d = new Date(jan1);
  d.setDate(jan1.getDate() + (Math.max(1, weekOfYear) - 1) * 7);
  return d;
}

/**
 * Posición 1–N dentro del mes natural (reinicia cada mes).
 * Bloques: días 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–fin → 4, etc.
 */
export function getWeekSlotInNaturalMonth(weekOfYear: number, year: number, cycleLength = 4): number {
  const weekStart = weekStartDateForWeekOfYear(weekOfYear, year);
  const dayOfMonth = weekStart.getDate();
  return Math.min(cycleLength, Math.floor((dayOfMonth - 1) / 7) + 1);
}
