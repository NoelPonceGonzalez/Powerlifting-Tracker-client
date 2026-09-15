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

export function blocksFromPlanned(ex: PlannedExercise): ExerciseBlock[] {
  if (ex.rpePerSet?.length || ex.repsPerSet?.length) {
    const n = Math.max(1, ex.sets || 1);
    const blocks: ExerciseBlock[] = [];
    let i = 0;
    while (i < n) {
      const reps = String(ex.repsPerSet?.[i] ?? ex.reps ?? '');
      const rpe = (ex.rpePerSet?.[i] || '').trim() || undefined;
      let count = 1;
      while (
        i + count < n &&
        String(ex.repsPerSet?.[i + count] ?? ex.reps ?? '') === reps &&
        ((ex.rpePerSet?.[i + count] || '').trim() || undefined) === rpe
      ) {
        count++;
      }
      blocks.push({ sets: count, reps, rpe });
      i += count;
    }
    return blocks;
  }
  if (ex.setScheme) {
    const parts = ex.setScheme.split(/\s*\+\s*/);
    const parsed = parts
      .map((p) => {
        const m = /(\d+)\s*[x×]\s*(.+)/i.exec(p.trim());
        if (!m) return null;
        return { sets: parseInt(m[1], 10), reps: m[2].trim() } as ExerciseBlock;
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

/** Varios bloques del mismo movimiento (1×2 @8.5 y luego 3×4 @6.5). */
export function isMultiBlock(ex: PlannedExercise): boolean {
  return blocksFromPlanned(ex).length > 1;
}

export function formatBlockChip(block: ExerciseBlock): string {
  return block.rpe ? `${block.sets}×${block.reps} @${block.rpe}` : `${block.sets}×${block.reps}`;
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

export function plannedRepsForSet(ex: PlannedExercise, setIndex: number): number {
  const per = ex.repsPerSet?.[setIndex];
  if (per != null && String(per).trim() !== '') {
    const n = parseInt(String(per), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const n = parseInt(String(ex.reps ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
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
