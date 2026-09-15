import type { BodyWeightScoringMode, ChallengeType } from '@/src/types';

export const EQUITY_OPTIONS: { value: BodyWeightScoringMode; short: string; hint: string }[] = [
  { value: 'heavier_more', short: 'Compensa a quien pesa más', hint: 'Dominadas, plancha, fondos…' },
  { value: 'lighter_more', short: 'Compensa a quien pesa menos', hint: 'Si el peso ayuda a la marca' },
  { value: 'neutral', short: 'Misma marca, mismos puntos', hint: 'Sin mirar el peso corporal' },
];

/** Elige sola la equidad justa según tipo y nombre del ejercicio. */
export function suggestBodyWeightScoring(type: ChallengeType, exercise: string): BodyWeightScoringMode {
  if (type === 'weight') return 'heavier_more';
  const n = exercise.toLowerCase();
  if (/carrera|run|cardio|5k|10k|bici|cicl|remo|row|airdyne/.test(n)) return 'neutral';
  if (/dominad|pull.?up|chin|plancha|plank|fondo|dip|flexión|push.?up/.test(n)) return 'heavier_more';
  if (type === 'max_reps' || type === 'seconds') return 'heavier_more';
  return 'heavier_more';
}

export function equitySummary(type: ChallengeType, mode: BodyWeightScoringMode): string {
  if (type === 'weight') return 'Puntos según peso y género: misma vara para todos.';
  if (mode === 'neutral') return 'Misma marca, mismos puntos.';
  if (mode === 'lighter_more') return 'Quien pesa menos suma un poco más.';
  return 'Quien pesa más suma un poco más (dominadas, plancha…).';
}
