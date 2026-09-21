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
 * Las semanas de “esta / la pasada / la que viene” son siempre lunes–domingo.
 * El día en que el usuario entrena primero no mueve esa ventana.
 */
export const PLACEMENT_WEEK_STARTS_ON = 1;

/** 0 = domingo … 6 = sábado. Por defecto la semana de gym empieza el lunes. */
export function startOfWeek(d: Date, weekStartsOn = PLACEMENT_WEEK_STARTS_ON): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** «21–27 sept»: lunes a domingo (o el día que empiece la rutina), no la ventana desde el 1 de enero. */
export function formatWeekRangeFromDate(d: Date, weekStartsOn = 1): string {
  const start = startOfWeek(d, weekStartsOn);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startTxt = start.toLocaleDateString('es-ES', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const endTxt = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${startTxt}–${endTxt}`;
}

/** Semana 1–N del ciclo contando desde el ancla (cuando empezó la semana 1), no desde el 1 de enero. */
export function cycleIndexFromAnchor(
  date: Date,
  anchorISO: string,
  cycleLength: number,
  weekStartsOn = 1
): number {
  const cl = Math.max(1, cycleLength);
  const todayStart = startOfWeek(date, weekStartsOn);
  const parsed = parseISODate(anchorISO);
  if (!parsed) return getMesocycleWeekIndex(weekOfYearFromDate(date, date.getFullYear()), cl);
  const anchorStart = startOfWeek(parsed, weekStartsOn);
  const weeks = Math.round((todayStart.getTime() - anchorStart.getTime()) / 86400000 / 7);
  return ((weeks % cl) + cl) % cl + 1;
}

/**
 * Misma idea, pero sobre el índice civil 1–52 que usa el plan guardado.
 * Así «semana 1 del archivo = esta» es semana 1 del ciclo, no la que toque por el 1 de enero.
 */
export function cycleIndexFromCivilWeek(
  civilWeek: number,
  anchorISO: string | undefined,
  cycleLength: number,
  year = new Date().getFullYear()
): number {
  const cl = Math.max(1, cycleLength);
  if (!anchorISO) return getMesocycleWeekIndex(civilWeek, cl);
  const parsed = parseISODate(anchorISO);
  if (!parsed) return getMesocycleWeekIndex(civilWeek, cl);
  const anchorCivil = weekOfYearFromDate(parsed, parsed.getFullYear() || year);
  return ((civilWeek - anchorCivil) % cl + cl) % cl + 1;
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
