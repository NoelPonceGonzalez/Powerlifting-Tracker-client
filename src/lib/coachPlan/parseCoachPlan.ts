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
  /** "6", "10-12" o "AMRAP": se conserva tal cual lo escribió el entrenador. */
  reps: string;
  weight?: number;
  /** Kilos de cada serie cuando el top y las descargas no pesan lo mismo. */
  weightPerSet?: number[];
  /** Porcentaje del maximal ("al 75%"). El peso lo calcula la app desde el RM. */
  pct?: number;
  rpe?: string;
  mode: ParsedExerciseMode;
  note?: string;
  /** Varios bloques del mismo movimiento: "1×2 + 3×4". */
  setScheme?: string;
  repsPerSet?: string[];
  rpePerSet?: string[];
  /** Porcentaje de cada serie cuando los bloques no son iguales. */
  pctPerSet?: number[];
  /**
   * Básico al que corresponde el movimiento, si es uno de los tres de competición.
   * Sirve para enlazarlo con el RM del atleta: así un plan escrito en porcentajes
   * recalcula los kilos solo cuando el RM sube.
   */
  linkedLift?: 'squat' | 'bench' | 'deadlift';
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

const REST_WORDS = /\b(rest|descanso|off|libre|movilidad|mobility|recovery|recovery\s*day)\b/i;

/** Reps que no son un número: "3xAMRAP", "4x máx", "3 x fallo". */
const REPS_WORD = String.raw`amrap|m[aá]x(?:imo)?|fallo`;
/** `x`, `×` o `*` (Excel a veces escribe 3*8). */
const SET_PATTERN = new RegExp(
  String.raw`(\d+)\s*[x×*c]\s*(\d+(?:\s*[-–/]\s*\d+)?|${REPS_WORD})\s*(["'”″′]?)`,
  'gi'
);
/** "4x8x80" / "4 x 8 x 80kg": series × reps × kilos, el formato que más se pierde. */
const SETS_REPS_WEIGHT = /(\d+)\s*[x×*c]\s*(\d+(?:\s*[-–/]\s*\d+)?)\s*[x×*c]\s*(\d+(?:[,.]\d+)?)\s*(?:kg|kgs)?/gi;
/** "3 series de 8", "4 sets x 10". */
const SERIES_DE = /(\d+)\s*(?:series?|sets?)\s*(?:de|x|×|a)?\s*(\d+(?:\s*[-–/]\s*\d+)?|amrap|m[aá]x(?:imo)?|fallo)/gi;

/**
 * El tempo se escribe con números ("tempo 3-1-1", "2-0-1") y no es una carga. Sin
 * quitarlo antes de buscar el peso, "4x8 tempo 3-1-1" acaba guardado como 3 kg.
 */
const TEMPO_PATTERN = /\b(?:tempo\s*)?\d\s*[-–]\s*\d\s*[-–]\s*\d(?:\s*[-–]\s*\d)?\b/gi;

/**
 * El descanso también va en números ("desc 90\"", "rest 3'"). Se recorta solo ese
 * trozo en vez de descartar la línea entera: "4x5 100kg desc 3'" tiene peso y descanso,
 * y antes se perdían los 100 kg por mencionar el descanso.
 */
const REST_SEGMENT = /\b(?:rest|descanso|desc)\b\s*[:.]?\s*\d+(?:[,.]\d+)?\s*(?:["'”′″]|s|seg|segundos|min|m)?/gi;

/** "al 75%", "75 %", "@80%". */
const PCT_PATTERN = /(\d{1,3}(?:[,.]\d+)?)\s*%/;

/** Peso suelto tras las series: "100", "132,5 kg", "@80kg". */
const WEIGHT_PATTERN = /(?:^|[\s+@]|al\s+)(\d{1,3}(?:[,.]\d+)?)\s*(?:kg|kgs)?(?=$|[\s?)]|[x×*c]|\b)/i;

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toNumber(raw: string): number | undefined {
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function normalizeLine(line: string): string {
  return line
    .replace(/[“”″]/g, '"')
    .replace(/(\d)\s*[cC]\s*(\d)/g, '$1x$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Semana 1", "SEMANA 3:", "Week 2" → 1, 3, 2 */
function matchWeekHeader(line: string): number | null {
  const m = /^(?:semana|week|micro(?:ciclo)?)\s*[:#]?\s*(\d{1,2})\b/i.exec(stripAccents(line));
  return m ? parseInt(m[1], 10) : null;
}

/** "Lunes:", "LUNES", "Lunes - squat" → índice 0-6 */
function matchDayHeader(line: string): number | null {
  const clean = normalizeLine(line).replace(/[:.\-–]+$/, '');
  const key = stripAccents(clean.toLowerCase());

  const direct = DAY_ALIASES[key];
  if (direct !== undefined) return direct;

  const starts = /^(lunes|lun|monday|mon|martes|mar|tuesday|tue|miercoles|mie|wednesday|wed|jueves|jue|thursday|thu|viernes|vie|friday|fri|sabado|sab|saturday|sat|domingo|dom|sunday|sun)\b/.exec(key);
  if (starts) {
    const idx = DAY_ALIASES[starts[1]];
    if (idx !== undefined) return idx;
  }

  // "Día 1" / "Day 3": se asume lunes como primer día.
  const numbered = /^(?:dia|day|sesion|session)\s*[:#]?\s*(\d)\b/i.exec(key);
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

/** Cabecera de Excel/Word: "Ejercicio | Series | Reps | Peso". */
function isTableHeaderRow(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const joined = cells.map(c => stripAccents(c).toLowerCase()).join(' ');
  if (/\d/.test(joined)) return false;
  return /\b(ejercicio|exercise|movimiento|series|sets|reps|repeticiones|peso|carga|rpe|kg)\b/.test(joined);
}

/** Quita "Lunes:" / "Lun -" del inicio para no tirar el ejercicio que va en la misma línea. */
function stripDayPrefix(line: string): string {
  return line.replace(
    /^(lunes|lun|monday|mon|martes|mar|tuesday|tue|miercoles|miércoles|mie|mié|wednesday|wed|jueves|jue|thursday|thu|viernes|vie|friday|fri|sabado|sábado|sab|sáb|saturday|sat|domingo|dom|sunday|sun)\s*[:.\-–]?\s*/i,
    ''
  ).trim();
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
  pct?: number;
  rpe?: string;
  mode: ParsedExerciseMode;
}

/** Normaliza "AMRAP", "máx" o "fallo" a una etiqueta única y legible. */
function normalizeReps(raw: string): string {
  const key = stripAccents(raw.trim().toLowerCase());
  if (/^(amrap|max|maximo|fallo)$/.test(key)) return 'AMRAP';
  return raw.replace(/\s*[-–/]\s*/, '-');
}

/**
 * Interpreta la parte numérica de una línea. Puede contener varios bloques:
 * "1x6 132,5 3x6 107,5" son dos prescripciones del mismo ejercicio.
 */
function parsePrescriptions(text: string): Prescription[] {
  const fromTriple: Prescription[] = [];
  let working = text;
  SETS_REPS_WEIGHT.lastIndex = 0;
  working = working.replace(SETS_REPS_WEIGHT, (_all, sets, reps, kg) => {
    fromTriple.push({
      sets: Math.max(1, parseInt(sets, 10)),
      reps: normalizeReps(reps),
      weight: toNumber(kg),
      mode: 'weight',
    });
    return ' ';
  });

  const matches: Array<{ index: number; length: number; sets: number; reps: string; seconds: boolean; weightAsReps?: number }> = [];
  SET_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SET_PATTERN.exec(working)) !== null) {
    const after = working.slice(m.index + m[0].length);
    // "3x 100kg" no son 3 series de 100 reps: el número pegado a kg es el peso.
    const secondIsNumber = /^\d+(?:[,.]\d+)?$/.test(m[2].trim());
    const kgInsteadOfReps = secondIsNumber && /^(?:\s*)(?:kg|kgs)\b/i.test(after);
    // "8x80" en un gym es 8 reps a 80 kg, no 8 series de 80 reps.
    const shorthandLoad =
      !kgInsteadOfReps &&
      secondIsNumber &&
      parseInt(m[1], 10) <= 15 &&
      (toNumber(m[2]) ?? 0) >= 40 &&
      !/\d+\s*[x×*]/.test(after);
    const loadAsReps = kgInsteadOfReps || shorthandLoad;
    matches.push({
      index: m.index,
      length: m[0].length,
      sets: loadAsReps ? 1 : parseInt(m[1], 10),
      reps: loadAsReps ? normalizeReps(m[1]) : normalizeReps(m[2]),
      seconds: m[3] !== '',
      weightAsReps: loadAsReps ? toNumber(m[2]) : undefined,
    });
  }
  if (matches.length === 0) {
    SERIES_DE.lastIndex = 0;
    const series: Prescription[] = [...fromTriple];
    let sm: RegExpExecArray | null;
    while ((sm = SERIES_DE.exec(working)) !== null) {
      const tail = working.slice(sm.index + sm[0].length);
      let weight: number | undefined;
      let pct: number | undefined;
      const pctMatch = PCT_PATTERN.exec(tail);
      if (pctMatch) {
        const value = toNumber(pctMatch[1]);
        if (value !== undefined && value > 0 && value <= 150) pct = value;
      }
      const cleaned = tail.replace(TEMPO_PATTERN, ' ').replace(REST_SEGMENT, ' ');
      if (pct === undefined) {
        const weightMatch = WEIGHT_PATTERN.exec(cleaned);
        if (weightMatch) weight = toNumber(weightMatch[1]);
      }
      series.push({
        sets: Math.max(1, parseInt(sm[1], 10)),
        reps: normalizeReps(sm[2]),
        weight,
        pct,
        mode: 'weight',
      });
    }
    return series;
  }

  const mapped = matches.map((cur, i) => {
    const from = cur.index + cur.length;
    const to = i + 1 < matches.length ? matches[i + 1].index : working.length;
    const tail = working.slice(from, to);

    let weight: number | undefined;
    let pct: number | undefined;
    let rpe: string | undefined;

    // Se va limpiando la cola: cada dato reconocido se retira para que el siguiente
    // no se confunda con él. Lo que quede al final, si es un número, es el peso.
    let rest = tail;

    const rpeMatch = /(?:@|\brpe)\s*(\d+(?:[,.]\d+)?(?:\s*[-–]\s*\d+(?:[,.]\d+)?)?)(?!\s*%)/i.exec(rest);
    if (rpeMatch) {
      rpe = rpeMatch[1].replace(',', '.').replace(/\s+/g, '');
      rest = rest.replace(rpeMatch[0], ' ');
    }

    // "al 75%" es carga relativa al maximal: se guarda como porcentaje y el peso lo
    // calcula la app con el RM del atleta. Antes se guardaba 75 kg, que no es lo mismo.
    const pctMatch = PCT_PATTERN.exec(rest);
    if (pctMatch) {
      const value = toNumber(pctMatch[1]);
      if (value !== undefined && value > 0 && value <= 150) pct = value;
      rest = rest.replace(pctMatch[0], ' ');
    }

    rest = rest.replace(TEMPO_PATTERN, ' ').replace(REST_SEGMENT, ' ');

    if (pct === undefined && !REST_WORDS.test(rest)) {
      const weightMatch = WEIGHT_PATTERN.exec(rest);
      if (weightMatch) weight = toNumber(weightMatch[1]);
    }
    if (weight === undefined && cur.weightAsReps !== undefined) weight = cur.weightAsReps;

    return {
      sets: Math.max(1, cur.sets),
      reps: cur.reps || '—',
      weight,
      pct,
      rpe,
      // Siempre hay hueco para la carga aunque el entrenador no la escriba: el atleta
      // anota la que use. Solo los isométricos ("3x45\"") se miden en tiempo.
      mode: cur.seconds ? 'seconds' : 'weight',
    } as Prescription;
  });
  return fromTriple.length ? [...fromTriple, ...mapped] : mapped;
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

  SETS_REPS_WEIGHT.lastIndex = 0;
  SET_PATTERN.lastIndex = 0;
  SERIES_DE.lastIndex = 0;
  const first =
    SETS_REPS_WEIGHT.exec(withoutNotes) ||
    SET_PATTERN.exec(withoutNotes) ||
    SERIES_DE.exec(withoutNotes);

  const note = notes.length ? notes.join(' · ') : undefined;

  if (first) {
    let name = withoutNotes.slice(0, first.index).trim();
    name = name.replace(/[:：\-–,;]+\s*$/, '').trim();
    if (!name) return null;
    const prescriptions = parsePrescriptions(withoutNotes.slice(first.index));
    if (prescriptions.length === 0) return null;
    return [prescriptionsToExercise(name, prescriptions, note, clean)];
  }

  const cells = splitCells(withoutNotes).filter(Boolean);
  if (isTableHeaderRow(cells)) return null;

  // "Press banca | 3x8 80kg" / "Press banca | 4x8x80"
  if (cells.length >= 2 && cells[0].length > 1 && !/^\d+$/.test(cells[0])) {
    const rest = cells.slice(1).join(' ');
    SETS_REPS_WEIGHT.lastIndex = 0;
    SET_PATTERN.lastIndex = 0;
    SERIES_DE.lastIndex = 0;
    if (SETS_REPS_WEIGHT.test(rest) || SET_PATTERN.test(rest) || SERIES_DE.test(rest)) {
      const prescriptions = parsePrescriptions(rest);
      if (prescriptions.length > 0) {
        return [prescriptionsToExercise(cells[0], prescriptions, note, clean)];
      }
    }
  }

  // Fila de Excel/Word: "Press banca | 3 | 8 | 80" o "Press banca | 3 | 8 | 70%"
  if (cells.length >= 3) {
    const nums = cells.slice(1).map(c => c.replace(',', '.'));
    const sets = parseInt(nums[0], 10);
    const repsRaw = nums[1];
    const third = nums[2] || '';
    const pct = /%/.test(third) ? toNumber(third.replace('%', '')) : undefined;
    const weight =
      pct === undefined && third
        ? toNumber(third.replace(/kg/i, ''))
        : undefined;
    if (Number.isFinite(sets) && sets > 0 && repsRaw && cells[0].length > 1 && !/^\d+$/.test(cells[0])) {
      return [prescriptionsToExercise(
        cells[0],
        [{
          sets,
          reps: normalizeReps(repsRaw.replace(/reps?/i, '').trim()),
          weight,
          pct,
          mode: 'weight',
        }],
        note,
        clean
      )];
    }
  }

  // Solo peso: "Press banca 80 kg" / "Press banca 80kg"
  const weightOnly = /^(.+?)\s+(\d+(?:[,.]\d+)?)\s*(?:kg|kgs)\s*$/i.exec(withoutNotes);
  if (weightOnly) {
    const name = weightOnly[1].replace(/[:：\-–,;]+\s*$/, '').trim();
    const weight = toNumber(weightOnly[2]);
    if (name && weight !== undefined) {
      return [prescriptionsToExercise(name, [{ sets: 1, reps: '—', weight, mode: 'weight' }], note, clean)];
    }
  }

  // Solo reps: "Press banca 8 reps" / "Press banca 8 repeticiones"
  const repsOnly = /^(.+?)\s+(\d+(?:\s*[-–/]\s*\d+)?)\s*(?:reps?|repeticiones)\s*$/i.exec(withoutNotes);
  if (repsOnly) {
    const name = repsOnly[1].replace(/[:：\-–,;]+\s*$/, '').trim();
    if (name) {
      return [prescriptionsToExercise(name, [{ sets: 1, reps: normalizeReps(repsOnly[2]), mode: 'weight' }], note, clean)];
    }
  }

  return null;
}

function exerciseNameKey(name: string): string {
  return stripAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Nombres que son exactamente uno de los tres básicos de competición. Las variantes
 * (sentadilla frontal, press inclinado, peso muerto a déficit…) se dejan fuera a
 * propósito: su porcentaje no se calcula sobre el mismo RM y enlazarlas daría cargas
 * equivocadas. Quedan como ejercicio libre y el atleta pone el peso.
 */
const LIFT_KEYS: Record<string, 'squat' | 'bench' | 'deadlift'> = {
  sentadilla: 'squat', sentadillatrasera: 'squat', squat: 'squat', backsquat: 'squat', sq: 'squat',
  sqlb: 'squat', sentadillalowbar: 'squat',
  pressbanca: 'bench', banca: 'bench', bench: 'bench', benchpress: 'bench', bp: 'bench',
  pesomuerto: 'deadlift', deadlift: 'deadlift', dl: 'deadlift', pm: 'deadlift',
  pesomuertoconvencional: 'deadlift', conventionaldl: 'deadlift',
};

function matchLinkedLift(name: string): 'squat' | 'bench' | 'deadlift' | undefined {
  const key = exerciseNameKey(name);
  if (/bulgar|hack|goblet|frontal|frontsquat|legpress|hipthrust|extension|curl|remo|row|facepull|ohp|militar|unilateral|contralateral/.test(key)) {
    return undefined;
  }
  if (LIFT_KEYS[key]) return LIFT_KEYS[key];
  if (/(?:^|pause|pin|tempo|spoto|larsen)/.test(key) && /(?:sqlb|squat|sentadilla)/.test(key)) return 'squat';
  if (/(?:pause|spoto|larsen|tempo|pin)/.test(key) && /(?:bp|banca|bench)/.test(key)) return 'bench';
  if (/(?:pause|deficit|convencional|conventional|sumo)/.test(key) && /(?:dl|deadlift|pesomuerto)/.test(key)) {
    return 'deadlift';
  }
  if (/\bsqlb\b|^sq\b|sentadilla/.test(key)) return 'squat';
  if (/\bbp\b|pressbanca|bench/.test(key)) return 'bench';
  if (/\bdl\b|deadlift|pesomuerto/.test(key)) return 'deadlift';
  return undefined;
}

/** Abreviaturas habituales del entrenador → nombre que se lee en la app. */
function prettyExerciseName(raw: string): string {
  let name = raw.replace(/[:：]+\s*$/, '').trim();
  const rules: Array<[RegExp, string]> = [
    [/pause\s+sq\s*lb/i, 'Sentadilla low bar con pausa'],
    [/pin\s+sq\s*lb/i, 'Sentadilla low bar a pins'],
    [/\bsq\s*lb\b/i, 'Sentadilla low bar'],
    [/deficit\s+conventional\s+dl/i, 'Peso muerto convencional a déficit'],
    [/pause\s+conventional\s+dl/i, 'Peso muerto convencional con pausa'],
    [/conventional\s+dl/i, 'Peso muerto convencional'],
    [/tempo\s+\d+"\s*\+\s*pause\s+bp/i, 'Press banca tempo + pausa'],
    [/spoto\s+\d+"\s*bp/i, 'Press banca Spoto'],
    [/larsen\s+bp/i, 'Press banca Larsen'],
    [/pause\s+bp/i, 'Press banca con pausa'],
    [/\bdb\s+ohp\b/i, 'Press militar con mancuernas'],
    [/\bohp\b/i, 'Press militar'],
    [/\bdb\s+contralateral\s+bulgarian\s+sq\b/i, 'Sentadilla búlgara contralateral con mancuerna'],
    [/\bunilateral\s+db\s+bp\b/i, 'Press banca unilateral con mancuerna'],
    [/\bunilateral\s+db\s+row\b/i, 'Remo unilateral con mancuerna'],
    [/pause\s+\d+"\s+hamstring\s+curl/i, 'Curl femoral con pausa'],
    [/curl\s+up\s+mcguill/i, 'Curl-up McGill'],
    [/mini\s+band\s+hip\s+thrust/i, 'Hip thrust con miniband'],
    [/pause\s+adductor\s+machine/i, 'Aductor en máquina con pausa'],
    [/unilateral\s+half\s+kneeling\s+(?:kb|kettlebell)\s+bottom\s+up\s+military\s+press/i, 'Press militar arrodillado unilateral con kettlebell'],
    [/unilateral\s+leg\s+extension/i, 'Extensión de cuádriceps unilateral'],
    [/row\s+machine/i, 'Remo en máquina'],
    [/face\s+pull/i, 'Face pull'],
    [/rope\s+triceps\s+extension/i, 'Extensión de tríceps con cuerda'],
    [/triceps\s+kickback/i, 'Patada de tríceps'],
    [/lumbar\s+hyperextension/i, 'Hiperextensión lumbar'],
    [/leg\s+press/i, 'Prensa de piernas'],
  ];
  for (const [re, pretty] of rules) {
    if (re.test(name)) return pretty;
  }
  return name
    .replace(/\bDB\b/g, 'mancuerna')
    .replace(/\bKB\b/g, 'kettlebell')
    .replace(/\bBP\b/g, 'press banca')
    .replace(/\bDL\b/g, 'peso muerto')
    .replace(/\bSQ\b/g, 'sentadilla');
}

function prescriptionsToExercise(
  name: string,
  prescriptions: Prescription[],
  note: string | undefined,
  raw: string
): ParsedExercise {
  const first = prescriptions[0];
  const sets = prescriptions.reduce((n, p) => n + p.sets, 0);
  const rpes = prescriptions.map(p => p.rpe).filter((r): r is string => !!r);
  const uniqueRpes = rpes.filter((r, i) => rpes.indexOf(r) === i);
  const repsPerSet: string[] = [];
  const rpePerSet: string[] = [];
  const pctPerSet: number[] = [];
  const weightPerSet: number[] = [];
  for (const p of prescriptions) {
    for (let i = 0; i < p.sets; i++) {
      repsPerSet.push(p.reps);
      rpePerSet.push(p.rpe || '');
      pctPerSet.push(p.pct ?? 0);
      weightPerSet.push(p.weight ?? 0);
    }
  }
  const multi = prescriptions.length > 1;

  // Solo tiene sentido guardar el porcentaje por serie si los bloques no coinciden.
  const anyPct = pctPerSet.some(p => p > 0);
  const variesPct = anyPct && pctPerSet.some(p => p !== pctPerSet[0]);
  const anyWeight = weightPerSet.some(w => w > 0);

  const displayName = prettyExerciseName(name);
  const linkedLift = matchLinkedLift(name) ?? matchLinkedLift(displayName);

  return {
    name: displayName,
    sets,
    reps: first.reps,
    weight: first.weight,
    ...(anyWeight ? { weightPerSet } : {}),
    ...(first.pct !== undefined ? { pct: first.pct } : {}),
    ...(linkedLift ? { linkedLift } : {}),
    rpe: uniqueRpes.length ? uniqueRpes.join(' · ') : first.rpe,
    mode: first.mode,
    note,
    raw,
    repsPerSet,
    rpePerSet,
    ...(multi
      ? {
          setScheme: prescriptions
            .map(p => {
              const load = p.weight !== undefined ? ` (${formatKg(p.weight)})` : '';
              return `${p.sets}×${p.reps}${load}`;
            })
            .join(' + '),
          ...(variesPct ? { pctPerSet } : {}),
        }
      : variesPct
        ? { pctPerSet }
        : {}),
  };
}

function formatKg(value: number): string {
  return `${String(value).replace('.', ',')} kg`;
}

function mergeParsedExercises(a: ParsedExercise, b: ParsedExercise): ParsedExercise {
  const aBlocks: Prescription[] = a.repsPerSet?.length
    ? collapseToPrescriptions(a)
    : [{ sets: a.sets, reps: a.reps, weight: a.weight, pct: a.pct, rpe: a.rpe, mode: a.mode }];
  const bBlocks: Prescription[] = b.repsPerSet?.length
    ? collapseToPrescriptions(b)
    : [{ sets: b.sets, reps: b.reps, weight: b.weight, pct: b.pct, rpe: b.rpe, mode: b.mode }];
  const notes = [a.note, b.note].filter((n, i, arr) => n && arr.indexOf(n) === i);
  return prescriptionsToExercise(
    a.name,
    [...aBlocks, ...bBlocks],
    notes.length ? notes.join(' · ') : undefined,
    `${a.raw} / ${b.raw}`
  );
}

function collapseToPrescriptions(ex: ParsedExercise): Prescription[] {
  const n = Math.max(1, ex.sets || 1);
  const out: Prescription[] = [];
  let i = 0;
  while (i < n) {
    const reps = ex.repsPerSet?.[i] ?? ex.reps;
    const perRpe = (ex.rpePerSet?.[i] || '').trim();
    const rpe = perRpe || (ex.rpe && !/[·/,]/.test(ex.rpe) ? ex.rpe : undefined);
    const pct = ex.pctPerSet?.[i] || ex.pct;
    const weight = ex.weightPerSet?.[i] || ex.weight;
    let count = 1;
    while (
      i + count < n &&
      (ex.repsPerSet?.[i + count] ?? ex.reps) === reps &&
      (ex.rpePerSet?.[i + count] || ex.rpe) === rpe &&
      (ex.pctPerSet?.[i + count] || ex.pct) === pct &&
      (ex.weightPerSet?.[i + count] || ex.weight) === weight
    ) {
      count++;
    }
    out.push({ sets: count, reps, rpe, pct, mode: ex.mode, weight });
    i += count;
  }
  return out;
}

/** "3x4 @6.5" sin nombre: sigue el ejercicio de la línea de arriba. */
function parseOrphanPrescriptions(line: string): Prescription[] | null {
  const clean = normalizeLine(line);
  SETS_REPS_WEIGHT.lastIndex = 0;
  SET_PATTERN.lastIndex = 0;
  SERIES_DE.lastIndex = 0;
  const first =
    SETS_REPS_WEIGHT.exec(clean) ||
    SET_PATTERN.exec(clean) ||
    SERIES_DE.exec(clean);
  if (!first || first.index > 0) return null;
  const prescriptions = parsePrescriptions(clean);
  return prescriptions.length ? prescriptions : null;
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
    if (isTableHeaderRow(cells)) continue;

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
      const leftover = stripDayPrefix(line);
      if (leftover && leftover !== line) {
        const extra = parseExerciseLine(leftover);
        if (extra) {
          const incoming = extra[0];
          const last = currentDay.exercises[currentDay.exercises.length - 1];
          if (last && exerciseNameKey(last.name) === exerciseNameKey(incoming.name)) {
            currentDay.exercises[currentDay.exercises.length - 1] = mergeParsedExercises(last, incoming);
          } else {
            currentDay.exercises.push(incoming);
          }
        }
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
      const incoming = exercises[0];
      const last = currentDay.exercises[currentDay.exercises.length - 1];
      if (last && exerciseNameKey(last.name) === exerciseNameKey(incoming.name)) {
        currentDay.exercises[currentDay.exercises.length - 1] = mergeParsedExercises(last, incoming);
      } else {
        currentDay.exercises.push(incoming);
      }
      continue;
    }

    const orphan = parseOrphanPrescriptions(line);
    if (orphan && currentDay?.exercises.length) {
      const last = currentDay.exercises[currentDay.exercises.length - 1];
      currentDay.exercises[currentDay.exercises.length - 1] = mergeParsedExercises(
        last,
        prescriptionsToExercise(last.name, orphan, last.note, line)
      );
      continue;
    }

    if (IGNORABLE.test(stripAccents(line))) continue;
    // Solo se reportan líneas que parecen prescripción fallida, no prosa del entrenador.
    if (/\d/.test(line) && line.length < 120) unparsedLines.push(line);
  }

  const kept: ParsedWeek[] = [];
  for (const w of weeks) {
    w.days.sort((a, b) => a.dayIndex - b.dayIndex);
    w.days = w.days.filter((d) => d.exercises.length > 0);
    if (w.days.length === 0) {
      warnings.push(`${w.label} no tenía ningún día con ejercicios; se ha omitido.`);
      continue;
    }
    kept.push(w);
  }
  weeks.length = 0;
  weeks.push(...kept);

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const hasWork = weeks.some((w) => w.days.some((d) => d.dayIndex === dayIdx && d.exercises.length > 0));
    if (hasWork) dayTypes[dayIdx] = 'workout';
    else if (dayTypes[dayIdx] === 'workout' || dayTypes[dayIdx] == null) dayTypes[dayIdx] = 'rest';
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
