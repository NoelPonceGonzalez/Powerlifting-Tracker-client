/**
 * Misma regla que el servidor: 3 h después de la hora de entreno del día del check-in.
 */
export function computeCheckInExpiresAt(referenceDay: Date, timeHHMM: string): Date {
  const parts = timeHHMM.split(':').map((p) => parseInt(p, 10));
  const h = Number.isFinite(parts[0]) ? parts[0] : 0;
  const m = Number.isFinite(parts[1]) ? parts[1] : 0;
  const d = new Date(referenceDay);
  d.setHours(h, m, 0, 0);
  d.setTime(d.getTime() + 3 * 60 * 60 * 1000);
  return d;
}

export function checkInExpiresAtMs(referenceDay: Date, timeHHMM: string): number {
  return computeCheckInExpiresAt(referenceDay, timeHHMM).getTime();
}

/** Respuesta POST/PUT de Mongoose o objeto API con expiresAt opcional. */
export function expiresAtFromSaved(
  saved: { expiresAt?: string | Date } | null | undefined,
  fallbackTimestampMs: number,
  time: string
): number {
  const raw = saved?.expiresAt;
  if (raw != null) return new Date(raw).getTime();
  return checkInExpiresAtMs(new Date(fallbackTimestampMs), time);
}
