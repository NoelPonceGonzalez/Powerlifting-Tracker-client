export type ViewType = 'dashboard' | 'program' | 'social' | 'settings';

export type ExerciseMode = 'weight' | 'reps' | 'seconds';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  bodyWeight: number;
  theme: 'light' | 'dark';
  progressMode?: 'month' | 'year';
}

export type ChallengeType = 'max_reps' | 'weight' | 'seconds';

export interface Challenge {
  id: string;
  title: string;
  description?: string;
  type: ChallengeType;
  exercise: string;
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
}

export interface GymCheckIn {
  id: string;
  userId: string;
  userName: string;
  avatar?: string;
  gymName: string;
  time: string;
  timestamp: number;
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
}

export interface LogEntry {
  rpe: string;
  notes: string;
  completed: boolean;
  weight?: number;
  sets?: SetLog[];
}

export interface HistoryEntry {
  date: string;
  week?: number;   // Semana del año (1-52) para ordenar por tramos
  year?: number;   // Año para ordenar por tramos
  rms: RMData;
  total: number;
  trainingMaxes: Record<string, number>; // ID del TM -> valor
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
  value: number;
  mode: ExerciseMode;
  linkedExercise?: keyof RMData;
  sharedToSocial?: boolean;
  /** TM derivado de series registradas (ejercicio sin vínculo oficial a TM de rutina). */
  isInternal?: boolean;
}

/** TM interno por usuario: clave = nombre de ejercicio normalizado (coincidencia con el plan). Tres vías independientes. */
export interface InternalExerciseMax {
  id: string;
  name: string;
  /** E1RM kg (modo peso). */
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
  name: string;
  sets: number;
  reps: string | number;
  pct?: number; // fallback cuando no hay pctPerSet
  pctPerSet?: number[]; // % por serie: [87, 90, 95, 80] para ramping + back-off
  weight?: number;
  mode: ExerciseMode;
  linkedTo?: string; // ID of a TrainingMax
}

export type DayType = 'workout' | 'rest' | 'deload';

export interface TrainingDay {
  id: string;
  name: string;
  type: DayType;
  exercises: PlannedExercise[];
}

export interface TrainingWeek {
  id: string;
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
