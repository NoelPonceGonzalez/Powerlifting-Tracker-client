/**
 * Semana del año (1–52) y lunes=0…domingo=6, alineado con `getCurrentWeekOfYear` en App.tsx.
 * `dateISO` (YYYY-MM-DD) desambigua mes/año y alimenta vista de rutina + gráfico.
 */

function formatLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Misma fórmula que en App: `getCurrentWeekOfYear`. */
export function weekOfYearFromDate(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diffDays = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
}

export function dayOfWeekMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Primer día del año civil que coincide con (año, semana 1–52, día Lunes=0).
 * Recorre el año porque la semana no está alineada al lunes.
 */
export function dateISOFromYearWeekDay(year: number, week: number, dayOfWeek: number): string {
  const start = new Date(year, 0, 1);
  for (let i = 0; i < 400; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getFullYear() !== year) break;
    const diffDays = Math.floor((d.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
    const w = Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
    const wd = (d.getDay() + 6) % 7;
    if (w === week && wd === dayOfWeek) {
      return formatLocalDateISO(d);
    }
  }
  const fallback = new Date(year, 0, 1);
  fallback.setDate(fallback.getDate() + (week - 1) * 7 + dayOfWeek);
  return formatLocalDateISO(fallback);
}

/**
 * ISO 8601 UTC (mediodía) a partir de `YYYY-MM-DD` del plan (evita desfases por zona).
 * Sirve para persistir `createdAt` / `updatedAt` del TM alineados al día de la rutina.
 */
export function dateISOToUtcNoonISO(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date().toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
}

/** Mes civil 1–12 a partir de YYYY-MM-DD. */
export function calendarMonth1FromDateISO(iso: string): number {
  const m = parseInt(iso.slice(5, 7), 10);
  return Number.isFinite(m) ? m : 1;
}

/** Clave de orden / corte para una entrada de historial. */
export function entryDateISO(e: {
  dateISO?: string;
  year?: number;
  week?: number;
  dayOfWeek?: number;
  createdAt?: string;
}): string {
  if (e.dateISO && /^\d{4}-\d{2}-\d{2}$/.test(e.dateISO)) return e.dateISO;
  if (e.year != null && e.week != null) {
    return dateISOFromYearWeekDay(e.year, e.week, e.dayOfWeek ?? 0);
  }
  if (e.createdAt) {
    const d = new Date(e.createdAt);
    if (!Number.isNaN(d.getTime())) return formatLocalDateISO(d);
  }
  return '1970-01-01';
}
