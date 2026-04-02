/**
 * Semana del mes (1–5) con semanas que empiezan en **lunes**
 * (la semana 1 puede ser corta si el día 1 no es lunes).
 *
 * Diferencia con `ceil(día/7)`: p. ej. si el día 1 es miércoles, el domingo día 7
 * cae en la “segunda” semana natural (lun–dom), mientras que `ceil(7/7)` da 1.
 */
export function weekOfMonthMondayBased(d: Date): number {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0 … domingo = 6
  return Math.floor((d.getDate() + offset - 1) / 7) + 1;
}

/** Slot 1–4 para el gráfico (máx. 4 barras por mes). */
export function weekSlotForProgressChart(d: Date): number {
  return Math.max(1, Math.min(4, weekOfMonthMondayBased(d)));
}

/**
 * Cuántas “semanas lun–dom” (índice 1…N) caben en un mes civil (normalmente 4–6).
 * Coincide con el último `weekOfMonthMondayBased` del mes.
 */
export function weekCountInMonth(year: number, monthIndex0: number): number {
  const lastDay = new Date(year, monthIndex0 + 1, 0);
  return weekOfMonthMondayBased(lastDay);
}

/** Último día civil del mes que pertenece a esa semana del mes (1…N). */
export function lastCalendarDayOfWeekIndexInMonth(
  year: number,
  monthIndex0: number,
  weekIndex1Based: number
): Date {
  const dim = new Date(year, monthIndex0 + 1, 0).getDate();
  for (let d = dim; d >= 1; d--) {
    const dt = new Date(year, monthIndex0, d);
    if (weekOfMonthMondayBased(dt) === weekIndex1Based) return dt;
  }
  return new Date(year, monthIndex0, 1);
}
