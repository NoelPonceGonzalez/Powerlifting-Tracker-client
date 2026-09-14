/**
 * Convierte el texto de un plan de entrenador (Word, Excel, PDF o pegado a mano)
 * en semanas, días y ejercicios. Los planes reales no siguen un formato fijo, así
 * que se reconocen los patrones habituales y todo lo que no encaje se reporta como
 * aviso en vez de descartarse en silencio.
 */

export type ParsedExerciseMode = 'weight' | 'reps' | 'seconds';

export interface ParsedExercise {
  name: string;
  sets: number;
  /** "6" o "10-12": se conserva el rango tal cual lo escribió el entrenador. */
  reps: string;
  weight?: number;
  rpe?: string;
  mode: ParsedExerciseMode;
  note?: string;
  /** Línea original, para mostrarla en la previsualización. */
  raw: string;
}

export interface ParsedDay {
  /** 0 = lunes … 6 = domingo. */
  dayIndex: number;
  name: string;
  exercises: ParsedExercise[];
}

export interface ParsedWeek {
  number: number;
  label: string;
  days: ParsedDay[];
}

export interface ParsedMax {
  name: string;
  value: number;
}

export interface ParsedPlan {
  weeks: ParsedWeek[];
  maxes: ParsedMax[];
  /** Tipo de cada día detectado en la tabla de organización semanal. */
  dayTypes: Record<number, 'workout' | 'rest'>;
  warnings: string[];
  /** Líneas que parecían ejercicio pero no se pudieron interpretar. */
  unparsedLines: string[];
}

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DAY_ALIASES: Record<string, number> = {
  lunes: 0, lun: 0, monday: 0, mon: 0,
  martes: 1, mar: 1, tuesday: 1, tue: 1,
  miercoles: 2, miércoles: 2, mie: 2, mié: 2, wednesday: 2, wed: 2,
  jueves: 3, jue: 3, thursday: 3, thu: 3,
  viernes: 4, vie: 4, friday: 4, fri: 4,
  sabado: 5, sábado: 5, sab: 5, sáb: 5, saturday: 5, sat: 5,
  domingo: 6, dom: 6, sunday: 6, sun: 6,
};

/** Nombres de maximales que la app entiende como Training Max de powerlifting. */
const MAX_ALIASES: Record<string, string> = {
  squat: 'Squat', sq: 'Squat', sentadilla: 'Squat',
  bench: 'Bench', bp: 'Bench', 'bench press': 'Bench', banca: 'Bench', 'press banca': 'Bench',
  deadlift: 'Deadlift', dl: 'Deadlift', 'peso muerto': 'Deadlift',
};

const REST_WORDS = /\b(rest|descanso|off|libre)\b/i;
const SET_PATTERN = /(\d+)\s*[x×]\s*(\d+(?:\s*[-–/]\s*\d+)?)\s*(["'”]?)/gi;

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toNumber(raw: string): number | undefined {
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/** "Semana 1", "SEMANA 3:", "Week 2" → 1, 3, 2 */
function matchWeekHeader(line: string): number | null {
  const m = /^(?:semana|week|micro(?:ciclo)?)\s*[:#]?\s*(\d{1,2})\b/i.exec(stripAccents(line));
  return m ? parseInt(m[1], 10) : null;
}

/** "Lunes:", "LUNES", "Día 1:" → índice 0-6 */
function matchDayHeader(line: string): number | null {
  const clean = normalizeLine(line).replace(/[:.\-–]+$/, '');
  const key = stripAccents(clean.toLowerCase());

  const direct = DAY_ALIASES[key];
  if (direct !== undefined) return direct;

  // "Día 1" / "Day 3": se asume lunes como primer día.
  const numbered = /^(?:dia|day|sesion|session)\s*[:#]?\s*(\d)$/i.exec(key);
  if (numbered) {
    const n = parseInt(numbered[1], 10);
    if (n >= 1 && n <= 7) return n - 1;
  }
  return null;
}

/** Fila de tabla con los 7 días: "LUNES | MARTES | ..." */
function matchDayTableHeader(cells: string[]): number[] | null {
  if (cells.length < 3) return null;
  const idx = cells.map(c => DAY_ALIASES[stripAccents(normalizeLine(c).toLowerCase())]);
  if (idx.some(i => i === undefined)) return null;
  return idx as number[];
}

function splitCells(line: string): string[] {
  if (line.includes('|')) return line.split('|').map(c => c.trim());
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  return [line.trim()];
}

/** "SQUAT: 170" dentro del bloque de maximales. */
function matchMaxLine(line: string): ParsedMax | null {
  const m = /^([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)\s*[:=]\s*(\d+(?:[,.]\d+)?)\s*(?:kg)?\s*$/i.exec(normalizeLine(line));
  if (!m) return null;
  const rawName = normalizeLine(m[1]).toLowerCase();
  const value = toNumber(m[2]);
  if (value === undefined || value <= 0) return null;
  // "TOTAL: 470" es la suma, no un ejercicio.
  if (/^(total|suma|sum)$/i.test(rawName)) return null;
  const known = MAX_ALIASES[stripAccents(rawName)];
  return { name: known ?? normalizeLine(m[1]), value };
}

interface Prescription {
  sets: number;
  reps: string;
  weight?: number;
  rpe?: string;
  mode: ParsedExerciseMode;
}

/**
 * Interpreta la parte numérica de una línea. Puede contener varios bloques:
 * "1x6 132,5 3x6 107,5" son dos prescripciones del mismo ejercicio.
 */
function parsePrescriptions(text: string): Prescription[] {
  const matches: Array<{ index: number; length: number; sets: number; reps: string; seconds: boolean }> = [];
  SET_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SET_PATTERN.exec(text)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      sets: parseInt(m[1], 10),
      reps: m[2].replace(/\s*[-–/]\s*/, '-'),
      seconds: m[3] !== '',
    });
  }
  if (matches.length === 0) return [];

  return matches.map((cur, i) => {
    const from = cur.index + cur.length;
    const to = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const tail = text.slice(from, to);

    let weight: number | undefined;
    let rpe: string | undefined;

    const rpeMatch = /@\s*(\d+(?:[,.]\d+)?)/.exec(tail);
    if (rpeMatch) rpe = rpeMatch[1].replace(',', '.');

    // Un número suelto tras las series es el peso, salvo que sea el descanso ("+ 10\"rest").
    if (!REST_WORDS.test(tail)) {
      const withoutRpe = tail.replace(/@\s*\d+(?:[,.]\d+)?/g, ' ');
      const weightMatch = /(\d+(?:[,.]\d+)?)\s*(?:kg)?\s*\??/.exec(withoutRpe);
      if (weightMatch) weight = toNumber(weightMatch[1]);
    }

    return {
      sets: Math.max(1, cur.sets),
      reps: cur.reps,
      weight,
      rpe,
      mode: cur.seconds ? 'seconds' : weight !== undefined ? 'weight' : 'weight',
    } as Prescription;
  });
}

function parseExerciseLine(line: string): ParsedExercise[] | null {
  const clean = normalizeLine(line);
  if (!clean) return null;

  // Las notas entre paréntesis no deben confundirse con pesos.
  const notes: string[] = [];
  const withoutNotes = clean.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const t = normalizeLine(inner);
    if (t) notes.push(t);
    return ' ';
  });

  SET_PATTERN.lastIndex = 0;
  const first = SET_PATTERN.exec(withoutNotes);
  if (!first) return null;

  let name = withoutNotes.slice(0, first.index).trim();
  name = name.replace(/[:：\-–,;]+\s*$/, '').trim();
  if (!name) return null;

  const prescriptions = parsePrescriptions(withoutNotes.slice(first.index));
  if (prescriptions.length === 0) return null;

  const note = notes.length ? notes.join(' · ') : undefined;

  return prescriptions.map(p => ({
    name,
    sets: p.sets,
    reps: p.reps,
    weight: p.weight,
    rpe: p.rpe,
    mode: p.mode,
    note,
    raw: clean,
  }));
}

/** Cabeceras del documento que no aportan ejercicios pero tampoco son errores. */
const IGNORABLE = /^(con material|sin material|organizacion de la semana|algunos tips|tips de ayuda|maximales|prs?|maximales\/prs?|notas?|observaciones)\b/i;

export function parseCoachPlan(rawText: string): ParsedPlan {
  const lines = rawText.split(/\r?\n/);
  const weeks: ParsedWeek[] = [];
  const maxes: ParsedMax[] = [];
  const dayTypes: Record<number, 'workout' | 'rest'> = {};
  const warnings: string[] = [];
  const unparsedLines: string[] = [];

  let currentWeek: ParsedWeek | null = null;
  let currentDay: ParsedDay | null = null;
  let inMaxesBlock = false;
  let pendingDayHeaderIdx: number[] | null = null;

  const ensureWeek = (): ParsedWeek => {
    if (!currentWeek) {
      currentWeek = { number: weeks.length + 1, label: `Semana ${weeks.length + 1}`, days: [] };
      weeks.push(currentWeek);
    }
    return currentWeek;
  };

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const cells = splitCells(line);

    // Tabla "LUNES | MARTES | …" seguida de "Power | Power | Rest | …"
    const tableDays = matchDayTableHeader(cells);
    if (tableDays) {
      pendingDayHeaderIdx = tableDays;
      continue;
    }
    if (pendingDayHeaderIdx && cells.length === pendingDayHeaderIdx.length) {
      pendingDayHeaderIdx.forEach((dayIdx, i) => {
        dayTypes[dayIdx] = REST_WORDS.test(cells[i]) ? 'rest' : 'workout';
      });
      pendingDayHeaderIdx = null;
      continue;
    }
    pendingDayHeaderIdx = null;

    const weekNum = matchWeekHeader(line);
    if (weekNum !== null) {
      currentWeek = { number: weekNum, label: `Semana ${weekNum}`, days: [] };
      weeks.push(currentWeek);
      currentDay = null;
      inMaxesBlock = false;
      continue;
    }

    if (/^maximales|^\s*prs?\s*[:.]?$/i.test(stripAccents(line))) {
      inMaxesBlock = true;
      continue;
    }

    if (inMaxesBlock) {
      const max = matchMaxLine(line);
      if (max) {
        maxes.push(max);
        continue;
      }
      // "TOTAL: 470" es la suma de los tres levantamientos, no un ejercicio.
      if (/^(total|suma|sum)\s*[:=]/i.test(stripAccents(line))) continue;
      // Cualquier otra línea cierra el bloque y se reevalúa abajo.
      inMaxesBlock = false;
    }

    const dayIdx = matchDayHeader(line);
    if (dayIdx !== null) {
      const week = ensureWeek();
      currentDay = week.days.find(d => d.dayIndex === dayIdx) ?? null;
      if (!currentDay) {
        currentDay = { dayIndex: dayIdx, name: DAY_NAMES[dayIdx], exercises: [] };
        week.days.push(currentDay);
      }
      continue;
    }

    const exercises = parseExerciseLine(line);
    if (exercises) {
      if (!currentDay) {
        const week = ensureWeek();
        currentDay = { dayIndex: 0, name: DAY_NAMES[0], exercises: [] };
        week.days.push(currentDay);
        warnings.push(`"${exercises[0].name}" aparecía sin día indicado; se ha puesto en lunes.`);
      }
      currentDay.exercises.push(...exercises);
      continue;
    }

    if (IGNORABLE.test(stripAccents(line))) continue;
    // Solo se reportan líneas que parecen prescripción fallida, no prosa del entrenador.
    if (/\d/.test(line) && line.length < 120) unparsedLines.push(line);
  }

  for (const w of weeks) {
    w.days.sort((a, b) => a.dayIndex - b.dayIndex);
    if (w.days.length === 0) warnings.push(`${w.label} no tenía ningún día con ejercicios.`);
  }

  if (weeks.length === 0) {
    warnings.push('No se encontró ninguna semana. Comprueba que el documento use "Semana 1", "Semana 2"…');
  }

  return { weeks, maxes, dayTypes, warnings, unparsedLines };
}

export function countPlanExercises(plan: ParsedPlan): number {
  return plan.weeks.reduce(
    (acc, w) => acc + w.days.reduce((a, d) => a + d.exercises.length, 0),
    0
  );
}
