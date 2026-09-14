import type { PlannedExercise, TrainingDay, TrainingWeek } from '@/src/types';

/** Alineado con el servidor: mensual salvo `false` explícito (ciclo por N semanas). */
export function parseSameTemplateAllWeeks(v: unknown): boolean {
  if (v === false || v === 'false' || v === 0) return false;
  return true;
}
import { normalizeExerciseNameKey } from '@/src/lib/normalizeExerciseName';

/** ObjectId de Mongo (24 hex): era el TM del amigo, no válido en tu cuenta. */
function sanitizeLinkedTo(linkedTo?: string): string | undefined {
  if (linkedTo == null || String(linkedTo).trim() === '') return undefined;
  const s = String(linkedTo).trim();
  if (/^[a-fA-F0-9]{24}$/.test(s)) return undefined;
  if (s.length > 128) return undefined;
  return s;
}

/**
 * Copia “pegada” de las 52 semanas: mismos datos de plan, IDs nuevos, sin _dbId.
 * Los vínculos linkedTo tipo "tm-1" se conservan; los ObjectId de TM del amigo se omiten.
 */
export function cloneFriendRoutineWeeks(weeks: TrainingWeek[]): TrainingWeek[] {
  return weeks.map((w, wi) => {
    const weekNum =
      typeof w.number === 'number' && w.number >= 1 && w.number <= 52 ? w.number : wi + 1;
    const wId = `w${weekNum}`;
    return {
      id: wId,
      number: weekNum,
      days: (w.days || []).map((d: TrainingDay, di: number) => ({
        id: `${wId}-d${di}`,
        name: d.name,
        type: d.type,
        exercises: (d.exercises || []).map((e: PlannedExercise, ei: number) => {
          const exId = `${wId}-d${di}-e${ei + 1}`;
          const linked = sanitizeLinkedTo(e.linkedTo);
          const mode: PlannedExercise['mode'] =
            e.mode === 'reps' || e.mode === 'seconds' || e.mode === 'weight' ? e.mode : 'weight';
          const setsRaw = e.sets;
          const sets =
            typeof setsRaw === 'number' && Number.isFinite(setsRaw)
              ? Math.max(1, setsRaw)
              : Math.max(1, parseInt(String(setsRaw ?? '1'), 10) || 1);
          const reps = e.reps;
          const ex: PlannedExercise = {
            id: exId,
            name: String(e.name || '').trim() || 'Ejercicio',
            sets,
            reps: typeof reps === 'number' && Number.isFinite(reps) ? reps : String(reps ?? ''),
            mode,
          };
          if (e.pct != null && Number.isFinite(e.pct)) ex.pct = e.pct;
          if (e.pctPerSet?.length) ex.pctPerSet = [...e.pctPerSet];
          if (e.weight != null && Number.isFinite(e.weight)) ex.weight = e.weight;
          if (linked) ex.linkedTo = linked;
          return ex;
        }),
      })),
    };
  });
}

/** Mismos nombres/modos que el seed del servidor; valores 0 al crear la rutina copiada. */
export const DEFAULT_TM_SEED_ZERO: Array<{
  name: string;
  value: number;
  mode: 'weight' | 'reps' | 'seconds';
  linkedExercise?: 'bench' | 'squat' | 'deadlift';
}> = [
  { name: 'Press Banca', value: 0, mode: 'weight', linkedExercise: 'bench' },
  { name: 'Sentadilla', value: 0, mode: 'weight', linkedExercise: 'squat' },
  { name: 'Peso Muerto', value: 0, mode: 'weight', linkedExercise: 'deadlift' },
  { name: 'Dominadas', value: 0, mode: 'reps' },
  { name: 'Plancha', value: 0, mode: 'seconds' },
];

export type TmSeedRow = {
  name: string;
  mode: 'weight' | 'reps' | 'seconds';
  linkedExercise?: 'bench' | 'squat' | 'deadlift';
};

function normMode(m: string): 'weight' | 'reps' | 'seconds' {
  if (m === 'reps' || m === 'seconds' || m === 'weight') return m;
  return 'weight';
}

/**
 * TMs que el plan referencia (linkedTo): mismos nombres/modos que en el plan, valor 0 al copiar.
 */
export function deriveTrainingMaxSeedsFromWeeks(weeks: TrainingWeek[]): TmSeedRow[] {
  const seen = new Set<string>();
  const out: TmSeedRow[] = [];
  for (const w of weeks) {
    for (const d of w.days || []) {
      for (const e of d.exercises || []) {
        const lt = e.linkedTo?.trim();
        if (!lt) continue;
        const mode = normMode(String(e.mode || 'weight'));
        let linkedExercise: 'bench' | 'squat' | 'deadlift' | undefined;
        if (lt === 'bench' || lt === 'squat' || lt === 'deadlift') linkedExercise = lt;
        const key = linkedExercise ? `le:${linkedExercise}:${mode}` : `nm:${normalizeExerciseNameKey(e.name)}:${mode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const row: TmSeedRow = { name: String(e.name || '').trim() || 'Ejercicio', mode };
        if (linkedExercise) row.linkedExercise = linkedExercise;
        out.push(row);
      }
    }
  }
  return out;
}

function seedRowKey(s: TmSeedRow): string {
  if (s.linkedExercise) return `le:${s.linkedExercise}:${s.mode}`;
  return `nm:${normalizeExerciseNameKey(s.name)}:${s.mode}`;
}

function friendRowToSeed(r: { name: string; mode: string; linkedExercise?: string }): TmSeedRow | null {
  const name = String(r.name || '').trim();
  if (!name) return null;
  const mode = normMode(String(r.mode || 'weight'));
  const leRaw = r.linkedExercise;
  const linkedExercise =
    leRaw === 'bench' || leRaw === 'squat' || leRaw === 'deadlift' ? leRaw : undefined;
  return { name, mode, ...(linkedExercise ? { linkedExercise } : {}) };
}

/** ¿El plan ya está cubierto por un TM del amigo (mismo big3 o mismo nombre+modo)? */
function planSeedCoveredByFriend(plan: TmSeedRow, friends: TmSeedRow[]): boolean {
  return friends.some((f) => {
    if (f.mode !== plan.mode) return false;
    if (f.linkedExercise && plan.linkedExercise) return f.linkedExercise === plan.linkedExercise;
    if (f.linkedExercise && !plan.linkedExercise) {
      return normalizeExerciseNameKey(f.name) === normalizeExerciseNameKey(plan.name);
    }
    if (!f.linkedExercise && plan.linkedExercise) {
      return normalizeExerciseNameKey(f.name) === normalizeExerciseNameKey(plan.name);
    }
    return normalizeExerciseNameKey(f.name) === normalizeExerciseNameKey(plan.name);
  });
}

/**
 * Unión: TMs del perfil del amigo (sin valores) + los que el plan exige y no estaban en el perfil.
 * No añade el paquete DEFAULT si ya hay filas del amigo o del plan.
 */
export function mergeFriendProfileAndPlanTmSeeds(
  friendProfileRows: { name: string; mode: string; linkedExercise?: string }[] | undefined,
  weeks: TrainingWeek[]
): TmSeedRow[] {
  const seen = new Set<string>();
  const merged: TmSeedRow[] = [];

  const fromFriend: TmSeedRow[] = [];
  for (const r of friendProfileRows || []) {
    const s = friendRowToSeed(r);
    if (!s) continue;
    const k = seedRowKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    fromFriend.push(s);
  }

  for (const s of fromFriend) {
    merged.push(s);
  }

  const fromPlan = deriveTrainingMaxSeedsFromWeeks(weeks);
  for (const p of fromPlan) {
    if (seen.has(seedRowKey(p))) continue;
    if (planSeedCoveredByFriend(p, fromFriend)) continue;
    seen.add(seedRowKey(p));
    merged.push(p);
  }

  return merged;
}

export function hasAnyLinkedExerciseInWeeks(weeks: TrainingWeek[]): boolean {
  for (const w of weeks) {
    for (const d of w.days || []) {
      for (const e of d.exercises || []) {
        if (e.linkedTo?.trim()) return true;
      }
    }
  }
  return false;
}
