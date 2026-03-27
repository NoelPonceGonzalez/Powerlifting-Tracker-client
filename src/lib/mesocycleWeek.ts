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

/** Semana civil 1–52 aproximada (mismo criterio que TrainingPlan: días desde 1 ene). */
export function weekOfYearFromDate(d: Date, year: number): number {
  const jan1 = new Date(year, 0, 1);
  const diffDays = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
}

/**
 * Primera semana del plan (1–52) cuyo día inicial cae en ese mes civil.
 * Evita el bug de usar `weekOfYearFromDate(1 del mes)`: esa semana puede empezar aún en el mes anterior
 * (ej. feb → semana 5 empieza 29 ene → la UI mostraba "enero").
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
 * Primer día civil de la ventana de 7 días de la "semana N" del plan (misma regla que `weekOfYearFromDate`).
 */
export function weekStartDateForWeekOfYear(weekOfYear: number, year: number): Date {
  const jan1 = new Date(year, 0, 1);
  const d = new Date(jan1);
  d.setDate(jan1.getDate() + (Math.max(1, weekOfYear) - 1) * 7);
  return d;
}

/**
 * Posición 1–4 dentro del mes natural (reinicia cada mes).
 * Se usa el **inicio** de la ventana de la semana (no el miércoles), para que semanas que cruzan
 * fin de mes no se etiqueten como mes siguiente por error.
 * Bloques: días 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–fin → 4.
 */
export function getWeekSlotInNaturalMonth(weekOfYear: number, year: number): number {
  const weekStart = weekStartDateForWeekOfYear(weekOfYear, year);
  const dayOfMonth = weekStart.getDate();
  return Math.min(4, Math.floor((dayOfMonth - 1) / 7) + 1);
}
