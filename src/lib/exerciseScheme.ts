import type { PlannedExercise } from '@/src/types';

export interface ExerciseBlock {
  sets: number;
  reps: string;
  rpe?: string;
  weight?: number;
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function exerciseNameKey(name: string): string {
  return stripAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function formatSetScheme(blocks: ExerciseBlock[]): string {
  return blocks.map((b) => `${b.sets}×${b.reps}`).join(' + ');
}

export function formatRpeSequence(blocks: ExerciseBlock[]): string | undefined {
  const seen: string[] = [];
  for (const b of blocks) {
    const r = (b.rpe || '').trim();
    if (r && !seen.includes(r)) seen.push(r);
  }
  return seen.length ? seen.join(' · ') : undefined;
}

export function expandRepsPerSet(blocks: ExerciseBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    for (let i = 0; i < b.sets; i++) out.push(b.reps);
  }
  return out;
}

export function expandRpePerSet(blocks: ExerciseBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    for (let i = 0; i < b.sets; i++) out.push(b.rpe || '');
  }
  return out;
}

export function totalSets(blocks: ExerciseBlock[]): number {
  return blocks.reduce((n, b) => n + Math.max(1, b.sets), 0);
}

function weightAt(ex: PlannedExercise, setIndex: number): number | undefined {
  const per = ex.weightPerSet?.[setIndex];
  if (per != null && per > 0) return per;
  if (ex.weight != null && ex.weight > 0) return ex.weight;
  return undefined;
}

export function blocksFromPlanned(ex: PlannedExercise): ExerciseBlock[] {
  if (ex.rpePerSet?.length || ex.repsPerSet?.length || ex.weightPerSet?.length) {
    const n = Math.max(1, ex.sets || 1);
    const blocks: ExerciseBlock[] = [];
    let i = 0;
    while (i < n) {
      const reps = String(ex.repsPerSet?.[i] ?? ex.reps ?? '');
      const rpe = (ex.rpePerSet?.[i] || '').trim() || undefined;
      const weight = weightAt(ex, i);
      let count = 1;
      while (
        i + count < n &&
        String(ex.repsPerSet?.[i + count] ?? ex.reps ?? '') === reps &&
        ((ex.rpePerSet?.[i + count] || '').trim() || undefined) === rpe &&
        weightAt(ex, i + count) === weight
      ) {
        count++;
      }
      blocks.push({ sets: count, reps, rpe, weight });
      i += count;
    }
    return blocks;
  }
  if (ex.setScheme) {
    const parts = ex.setScheme.split(/\s*\+\s*/);
    const parsed = parts
      .map((p) => {
        const m = /(\d+)\s*[x×]\s*([^\s(]+)\s*(?:\((\d+(?:[,.]\d+)?)\s*kg\))?/i.exec(p.trim());
        if (!m) return null;
        const kg = m[3] ? parseFloat(m[3].replace(',', '.')) : undefined;
        return {
          sets: parseInt(m[1], 10),
          reps: m[2].trim(),
          weight: Number.isFinite(kg) ? kg : undefined,
        } as ExerciseBlock;
      })
      .filter((b): b is ExerciseBlock => !!b);
    if (parsed.length) {
      const rpes = (ex.targetRpe || '').split(/\s*[·/,]\s*/).filter(Boolean);
      return parsed.map((b, i) => ({ ...b, rpe: rpes[i] || rpes[0] }));
    }
  }
  return [
    {
      sets: Math.max(1, ex.sets || 1),
      reps: String(ex.reps ?? ''),
      rpe: ex.targetRpe,
      weight: ex.weight,
    },
  ];
}

export function combinePlannedExercises(a: PlannedExercise, b: PlannedExercise): PlannedExercise {
  const blocks = [...blocksFromPlanned(a), ...blocksFromPlanned(b)];
  const extraIds = [...(a.mergedFromIds ?? []), b.id, ...(b.mergedFromIds ?? [])].filter((id) => id && id !== a.id);
  const notes = [a.coachNote, b.coachNote].filter((n, i, arr) => n && arr.indexOf(n) === i);
  return {
    ...a,
    sets: totalSets(blocks),
    reps: blocks[0]?.reps ?? a.reps,
    setScheme: formatSetScheme(blocks),
    rpePerSet: expandRpePerSet(blocks),
    repsPerSet: expandRepsPerSet(blocks),
    weightPerSet: blocks.flatMap((b) => Array.from({ length: b.sets }, () => b.weight ?? 0)),
    weight: blocks.find((b) => b.weight && b.weight > 0)?.weight,
    targetRpe: formatRpeSequence(blocks),
    coachNote: notes.length ? notes.join(' · ') : a.coachNote,
    mergedFromIds: extraIds.length ? extraIds : undefined,
  };
}

export function mergeAdjacentSameExercises(exercises: PlannedExercise[]): PlannedExercise[] {
  const out: PlannedExercise[] = [];
  for (const ex of exercises) {
    const last = out[out.length - 1];
    if (last && exerciseNameKey(last.name) === exerciseNameKey(ex.name)) {
      out[out.length - 1] = combinePlannedExercises(last, ex);
    } else {
      out.push({ ...ex });
    }
  }
  return out;
}

export function exerciseSchemeLabel(ex: PlannedExercise): string | undefined {
  if (ex.setScheme) return ex.setScheme;
  const blocks = blocksFromPlanned(ex);
  if (blocks.length > 1) return formatSetScheme(blocks);
  return undefined;
}

/** Fila de rutina: 1×3+4×4. Si hay más de 2 bloques, 1×3+4×4 +2. */
export function compactSchemeLabel(ex: PlannedExercise): string | undefined {
  const blocks = blocksFromPlanned(ex);
  if (blocks.length < 2) return undefined;
  const shown = blocks.slice(0, 2).map(b => `${b.sets}×${b.reps}`);
  const extra = blocks.length - 2;
  return extra > 0 ? `${shown.join('+')} +${extra}` : shown.join('+');
}

/** Varios bloques del mismo movimiento (1×2 @8.5 y luego 3×4 @6.5). */
export function isMultiBlock(ex: PlannedExercise): boolean {
  return blocksFromPlanned(ex).length > 1;
}

export function formatBlockChip(block: ExerciseBlock): string {
  const load = block.weight && block.weight > 0 ? ` ${String(block.weight).replace('.', ',')}kg` : '';
  return block.rpe ? `${block.sets}×${block.reps}${load} @${block.rpe}` : `${block.sets}×${block.reps}${load}`;
}

export function exerciseRpeLabel(ex: PlannedExercise): string | undefined {
  if (ex.rpePerSet?.some(Boolean)) {
    const seen: string[] = [];
    for (const r of ex.rpePerSet) {
      const t = (r || '').trim();
      if (t && !seen.includes(t)) seen.push(t);
    }
    if (seen.length) return seen.join(' · ');
  }
  return ex.targetRpe || undefined;
}

function firstRepsNumber(raw: string): number {
  const n = parseInt(String(raw).replace(',', '.'), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Texto del plan para esa serie: "6", "10-12" o "AMRAP". */
export function plannedRepsLabelForSet(ex: PlannedExercise, setIndex: number): string {
  const per = ex.repsPerSet?.[setIndex];
  if (per != null && String(per).trim() !== '' && String(per).trim() !== '—') return String(per).trim();
  const fallback = String(ex.reps ?? '').trim();
  return fallback && fallback !== '—' ? fallback : '';
}

export function plannedRepsForSet(ex: PlannedExercise, setIndex: number): number {
  return firstRepsNumber(plannedRepsLabelForSet(ex, setIndex));
}

/**
 * Kilos que escribió el entrenador para esa serie.
 * Si el Word trae 142,5 no se sustituye por RM × 75 %.
 */
export function plannedWeightForSet(ex: PlannedExercise, setIndex: number): number {
  const per = ex.weightPerSet?.[setIndex];
  if (per != null && per > 0) return per;
  if (ex.weight != null && ex.weight > 0) return ex.weight;
  if (ex.setScheme) {
    const blocks = blocksFromPlanned(ex);
    let cursor = 0;
    for (const b of blocks) {
      if (setIndex < cursor + b.sets) return b.weight && b.weight > 0 ? b.weight : 0;
      cursor += b.sets;
    }
  }
  return 0;
}

/** RPE prescrito de esa serie; no usa el texto combinado («8.5 · 6.5»). */
export function plannedRpeForSet(ex: PlannedExercise, setIndex: number): string | undefined {
  const per = (ex.rpePerSet?.[setIndex] || '').trim();
  if (per) return per;
  const blocks = blocksFromPlanned(ex);
  let cursor = 0;
  for (const b of blocks) {
    if (setIndex < cursor + b.sets) return b.rpe;
    cursor += b.sets;
  }
  return undefined;
}
