/**
 * Tabla RPE de Tuchscherer: % del máximo por repeticiones y RPE objetivo.
 * Sirve para estimar la intensidad de los ejercicios que el entrenador manda solo con RPE.
 */
const RPE_CHART: Record<string, number[]> = {
  // reps 1..10
  '10': [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9],
  '9.5': [99, 94.3, 91.1, 88.1, 85.3, 82.7, 80.1, 77.6, 75.3, 73],
  '9': [97.8, 93.9, 90.7, 87.8, 85, 82.4, 79.9, 77.4, 75.1, 72.3],
  '8.5': [96.5, 92.6, 89.6, 86.8, 84.1, 81.6, 79.1, 76.7, 74.4, 71.6],
  '8': [95.5, 91.6, 88.5, 85.8, 83.2, 80.7, 78.3, 75.9, 73.6, 70.7],
  '7.5': [94.3, 90.7, 87.6, 84.9, 82.3, 79.8, 77.4, 75.1, 72.8, 69.8],
  '7': [93.9, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 71.7, 68.8],
  '6.5': [92.2, 88.1, 85.3, 82.7, 80.1, 77.6, 75.3, 73, 70.7, 67.9],
  '6': [91.1, 87.5, 84.5, 81.8, 79.2, 76.7, 74.4, 72.1, 69.8, 66.9],
  // La tabla original acaba en RPE 6; estas dos filas siguen la misma pendiente (~1,2 % por medio punto).
  '5.5': [89.9, 86.3, 83.3, 80.6, 78, 75.5, 73.2, 70.9, 68.6, 65.7],
  '5': [88.7, 85.1, 82.1, 79.4, 76.8, 74.3, 72, 69.7, 67.4, 64.5],
};

/** Primer número de unas reps que pueden venir como rango («4-6» → 4). */
export function repsToNumber(reps: number | string | undefined): number | null {
  if (typeof reps === 'number') return Number.isFinite(reps) ? reps : null;
  const m = String(reps ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** RPE que puede venir como texto del documento («7», «7-8», «@8»). Se queda con el primero. */
function rpeToNumber(rpe: number | string | undefined): number | null {
  if (typeof rpe === 'number') return Number.isFinite(rpe) ? rpe : null;
  const m = String(rpe ?? '').match(/\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}

/** % estimado para unas reps a un RPE dado; `null` si se sale de la tabla. */
export function pctFromRpe(reps: number | string | undefined, rpe: number | string | undefined): number | null {
  const r = repsToNumber(reps);
  const rpeValue = rpeToNumber(rpe);
  if (!r || r < 1 || rpeValue == null) return null;
  const rounded = Math.round(rpeValue * 2) / 2;
  const row = RPE_CHART[String(Math.min(10, Math.max(5, rounded)))];
  if (!row) return null;
  return Math.round(row[Math.min(10, r) - 1]);
}

interface PctSource {
  pct?: number;
  pctPerSet?: number[];
  targetRpe?: number | string;
  reps?: number | string;
}

/**
 * % que toca usar para una serie: manda lo que diga el plan y, si solo hay RPE,
 * se estima desde la tabla. 75 % es el último recurso.
 */
export function pctForSet(ex: PctSource, setIndex = 0): number {
  const explicit = ex.pctPerSet?.[setIndex] ?? ex.pct;
  if (explicit != null) return explicit;
  if (ex.targetRpe) {
    const estimated = pctFromRpe(ex.reps, ex.targetRpe);
    if (estimated != null) return estimated;
  }
  return 75;
}

/**
 * TM que corresponde a una carga de trabajo hecha a cierto %: escribiendo el peso de un
 * ejercicio accesorio se siembra su TM interno y el resto de semanas ya se calcula solo.
 */
export function tmFromWorkingLoad(load: number, pct: number, mode: 'weight' | 'reps' | 'seconds'): number {
  if (!Number.isFinite(load) || load <= 0 || pct <= 0) return 0;
  const raw = load / (pct / 100);
  return mode === 'weight' ? Math.round(raw * 2) / 2 : Math.max(1, Math.round(raw));
}

/** `true` si el % no lo puso el plan sino la tabla RPE (se marca en la interfaz). */
export function isPctEstimated(ex: PctSource, setIndex = 0): boolean {
  return (ex.pctPerSet?.[setIndex] ?? ex.pct) == null && !!ex.targetRpe;
}
