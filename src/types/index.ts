export type ViewType = 'dashboard' | 'program' | 'social' | 'settings';

export type ExerciseMode = 'weight' | 'reps' | 'seconds';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  bodyWeight: number;
  theme: 'light' | 'dark';
  /** Acento rosa (MB); independiente de claro/oscuro. */
  mbMode?: boolean;
  /** `month` = vista por semanas en Progreso; `year` = por meses. La forma exacta del gráfico depende de la rutina (bloque vs mes civil). */
  progressMode?: 'month' | 'year';
}

export type ChallengeType = 'max_reps' | 'weight' | 'seconds';

/** En reps/seg: cómo pondera el peso corporal (en tipo fuerza solo aplica IPF GL). */
export type BodyWeightScoringMode = 'heavier_more' | 'lighter_more' | 'neutral';

export interface Challenge {
  id: string;
  title: string;
  description?: string;
  type: ChallengeType;
  exercise: string;
  /** true: IPF GL (kg) y puntos por peso/género (reps/seg). false: gana quien tenga mejor marca bruta. */
  usePointsSystem?: boolean;
  /** Solo afecta al cálculo de puntos en reps y segundos. */
  bodyWeightScoring?: BodyWeightScoringMode;
  participants: {
    userId: string;
    name: string;
    avatar: string;
    score: number;
    value: number; // raw value (reps, kg, or seconds)
    initialValue?: number;
    initialScore?: number;
    joinedAt?: string;
  }[];
  endDate: string;
  status?: 'active' | 'finished';
  createdBy?: { id: string; name: string };
  /** ISO; para ordenar torneos destacados (más reciente). */
  createdAt?: string;
}

/** Fila del ranking de mejora de rutina (tú + amigos) en Social → Torneos → Progreso. */
export interface RoutineProgressLeaderboardEntry {
  userId: string;
  name: string;
  avatar: string;
  isSelf: boolean;
  routineName?: string;
  snapshotCount: number;
  /** % de mejora del agregado entre primer y último punto del historial; null sin rutina o sin datos. */
  improvementPct: number | null;
}

export interface GymCheckIn {
  id: string;
  userId: string;
  userName: string;
  avatar?: string;
  gymName: string;
  time: string;
  timestamp: number;
  /** ms desde epoch; al pasar, el check-in deja de mostrarse (TTL en servidor + limpieza local). */
  expiresAt?: number;
}

export interface RMData {
  bench: number;
  squat: number;
  deadlift: number;
  [key: string]: number;
}

export interface SetLog {
  id: string;
  reps: number | null;
  weight: number | null;
  completed: boolean;
  /** Cómo introdujo el peso/reps: kg absolutos o % sobre TM (persistido en Mongo con el log). */
  inputMode?: 'kg' | 'pct';
}

export interface LogEntry {
  rpe: string;
  notes: string;
  completed: boolean;
  weight?: number;
  sets?: SetLog[];
  /** Nombre del ejercicio (solo sync a Mongo / WorkoutExercise.exerciseName). */
  exerciseName?: string;
}

export type RoutineProgressKind = 'weight' | 'reps' | 'seconds' | 'mixed';

export interface HistoryEntry {
  date: string;
  week?: number;   // Semana del año (1-52) para ordenar por tramos
  year?: number;   // Año para ordenar por tramos
  /** Lunes=0 … Domingo=6. Permite TM distinto el martes que el lunes de la misma semana. */
  dayOfWeek?: number;
  /** Fecha civil del snapshot (YYYY-MM-DD); vigencia hasta el siguiente snapshot. */
  dateISO?: string;
  /** Mes civil 1–12 (alineado con dateISO). */
  month?: number;
  /** ISO del servidor (puntos del gráfico / orden temporal). */
  createdAt?: string;
  /** Última persistencia del snapshot en Mongo (mejor que createdAt para “cuándo aplica” el TM). */
  updatedAt?: string;
  rms: RMData;
  /** Valor agregado del progreso de la rutina (ver `computeRoutineProgressTotal` en cliente). */
  total: number;
  trainingMaxes: Record<string, number>; // ID del TM -> valor
  /** Cómo se calculó `total` al guardar (entradas antiguas: solo kg implícito). */
  progressKind?: RoutineProgressKind;
  /** Id de rutina en servidor (progreso por rutina). */
  routineId?: string;
}

export interface Exercise {
  key: keyof RMData;
  label: string;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export interface TrainingMax {
  id: string;
  name: string;
  /** Mejor marca según modo: kg (redondeo 2,5), reps o s — de lo registrado en series, no e1RM. */
  value: number;
  mode: ExerciseMode;
  linkedExercise?: keyof RMData;
  sharedToSocial?: boolean;
  /** TM derivado de series registradas (ejercicio sin vínculo oficial a TM de rutina). */
  isInternal?: boolean;
}

/** TM interno por rutina: mismo nombre en otra rutina no comparte marcas. Tres vías (peso/reps/tiempo) en Mongo. */
export interface InternalExerciseMax {
  id: string;
  name: string;
  /** Mejor kg apuntado en serie (modo peso); referencia al 100 %, no e1RM estimado. */
  valueWeight?: number;
  /** Mejor reps (modo repeticiones). */
  valueReps?: number;
  /** Mejor tiempo en s (modo segundos). */
  valueSeconds?: number;
  /** @deprecated API antigua; usar valueWeight */
  value?: number;
}

/** Valor TM interno según el modo del ejercicio (los tres se guardan por separado en Mongo). */
export function getInternalValueForMode(im: InternalExerciseMax, mode: ExerciseMode): number | undefined {
  let v: number | undefined;
  if (mode === 'weight') v = im.valueWeight ?? im.value;
  else if (mode === 'reps') v = im.valueReps;
  else v = im.valueSeconds;
  if (v == null || Number(v) <= 0) return undefined;
  return Number(v);
}

export interface PlannedExercise {
  id: string;
  _dbId?: string;
  name: string;
  sets: number;
  reps: string | number;
  pct?: number;
  pctPerSet?: number[];
  weight?: number;
  mode: ExerciseMode;
  linkedTo?: string;
}

export type DayType = 'workout' | 'rest' | 'deload';

export interface TrainingDay {
  id: string;
  _dbId?: string;
  name: string;
  type: DayType;
  exercises: PlannedExercise[];
}

export interface TrainingWeek {
  id: string;
  _dbIdWeek?: string;
  number: number;
  days: TrainingDay[];
}

/** Una versión de la rutina efectiva desde una semana concreta */
export interface RoutineVersion {
  effectiveFromWeek: number;
  weeks: TrainingWeek[];
}

export interface FriendRequest {
  id: string;
  name: string;
  avatar?: string;
  email?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Friend {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

export interface UserSearchResult {
  id: string;
  name: string;
  email?: string;
  username?: string;
  avatar?: string;
  bodyWeight?: number;
  friendshipStatus: 'accepted' | 'pending' | 'rejected' | null;
}
