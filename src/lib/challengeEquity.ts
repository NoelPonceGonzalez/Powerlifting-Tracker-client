import type { BodyWeightScoringMode, ChallengeType } from '@/src/types';

export const EQUITY_OPTIONS: { value: BodyWeightScoringMode; short: string; hint: string }[] = [
  { value: 'heavier_more', short: 'Ayuda a quien pesa más', hint: 'En dominadas o plancha lo tiene más difícil' },
  { value: 'lighter_more', short: 'Ayuda a quien pesa menos', hint: 'Si ser ligero ya te favorece' },
  { value: 'neutral', short: 'Sin mirar el peso', hint: 'La marca cuenta igual para todos' },
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
  if (type === 'weight') {
    return 'El ranking se iguala por peso y género, para que no gane siempre el más grande.';
  }
  if (mode === 'neutral') return 'Gana quien tenga la mejor marca. El peso no cuenta.';
  if (mode === 'lighter_more') {
    return 'Si pesas menos, tu marca vale un poco más.';
  }
  return 'Si pesas más, tu marca vale un poco más. Así no gana siempre el más ligero.';
}
