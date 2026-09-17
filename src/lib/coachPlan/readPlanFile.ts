/**
 * Extrae texto plano de los formatos en los que suelen venir los planes del
 * entrenador. Todo ocurre en el dispositivo: el archivo no se sube a ningún
 * servidor, solo se guarda el plan ya interpretado.
 */

export type PlanFileKind = 'docx' | 'xlsx' | 'pdf' | 'text';

export interface ReadPlanFileResult {
  text: string;
  kind: PlanFileKind;
}

const MAX_BYTES = 15 * 1024 * 1024;

const OLE_DOC_MSG =
  'Este Word es el formato antiguo (.doc). Ábrelo y guárdalo como .docx, o en Drive: menú del archivo → Descargar → Microsoft Word (.docx).';
const GDOC_MSG =
  'Drive ha enviado el enlace de Google Docs, no el archivo. En el archivo pulsa ⋮ → Descargar (o “Enviar una copia”) y elige el .docx o .xlsx que se baja.';
const UNKNOWN_MSG =
  'No se reconoce el archivo. Usa Word (.docx), Excel (.xlsx), PDF o texto. Si está en Drive, elige el archivo descargado, no el documento nativo de Google.';

type DetectedKind = PlanFileKind | 'ole-doc' | 'gdoc';

export function detectPlanFileKind(fileName: string): PlanFileKind | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'csv') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt' || ext === 'md' || ext === 'rtf') return 'text';
  return null;
}

function kindFromMime(mime: string): DetectedKind | null {
  const t = mime.toLowerCase().split(';')[0].trim();
  if (!t) return null;
  if (t.includes('wordprocessingml')) return 'docx';
  if (t.includes('spreadsheetml') || t.includes('ms-excel') || t === 'text/csv' || t === 'application/csv') {
    return 'xlsx';
  }
  if (t === 'application/msword') return 'ole-doc';
  if (t.includes('google-apps')) return 'gdoc';
  if (t === 'application/pdf') return 'pdf';
  if (t === 'application/rtf' || t === 'text/rtf' || t === 'text/plain' || t === 'text/markdown') return 'text';
  if (t.startsWith('text/')) return t.includes('csv') ? 'xlsx' : 'text';
  return null;
}

function looksLikeGoogleShortcut(buffer: ArrayBuffer, fileName: string): boolean {
  const n = fileName.toLowerCase();
  if (n.endsWith('.gdoc') || n.endsWith('.gsheet') || n.endsWith('.gslides')) return true;
  const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 400));
  return /"url"\s*:\s*"https:\/\/docs\.google/.test(head);
}

function magicKind(buffer: ArrayBuffer): 'pdf' | 'zip' | 'ole' | null {
  const b = new Uint8Array(buffer);
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) return 'zip';
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
  return null;
}

async function zipOfficeKind(buffer: ArrayBuffer): Promise<PlanFileKind | null> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer));
  const names = Object.keys(files);
  if (names.some(n => n === 'word/document.xml' || n.startsWith('word/'))) return 'docx';
  if (names.some(n => n === 'xl/workbook.xml' || n.startsWith('xl/'))) return 'xlsx';
  return null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/**
 * Un .docx es un ZIP con word/document.xml dentro. Se recorre el XML en orden
 * conservando saltos de párrafo y celdas de tabla, que es donde los entrenadores
 * meten la organización de la semana.
 */
async function readDocx(buffer: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer));
  const docXml = files['word/document.xml'];
  if (!docXml) throw new Error('El .docx no contiene word/document.xml. ¿Es un .doc antiguo?');

  const xml = strFromU8(docXml);
  const lines: string[] = [];
  let paragraph = '';
  let cellBuffer: string[] = [];
  let inTable = false;

  // Etiquetas relevantes de WordprocessingML, en el orden en que aparecen.
  const tagRe = /<(\/?)w:(t|p|tab|br|tc|tr|tbl)(\s[^>]*)?>([^<]*)/g;
  let m: RegExpExecArray | null;
  let inTextRun = false;

  while ((m = tagRe.exec(xml)) !== null) {
    const closing = m[1] === '/';
    const tag = m[2];
    const following = m[4] ?? '';

    switch (tag) {
      case 't':
        if (!closing) {
          inTextRun = true;
          paragraph += decodeXmlEntities(following);
          continue;
        }
        inTextRun = false;
        break;
      case 'tab':
        if (!closing) paragraph += ' ';
        break;
      case 'br':
        if (!closing) paragraph += ' / ';
        break;
      case 'tbl':
        inTable = !closing;
        break;
      case 'tc':
        if (closing) {
          cellBuffer.push(paragraph.trim());
          paragraph = '';
        }
        break;
      case 'tr':
        if (closing) {
          const row = cellBuffer.filter(c => c !== '').join(' | ');
          if (row) lines.push(row);
          cellBuffer = [];
        }
        break;
      case 'p':
        if (closing && !inTable) {
          const t = paragraph.trim();
          if (t) lines.push(t);
          paragraph = '';
        }
        break;
    }

    // Texto suelto entre etiquetas dentro de un <w:t> abierto.
    if (inTextRun && tag !== 't' && following) paragraph += decodeXmlEntities(following);
  }

  const tail = paragraph.trim();
  if (tail) lines.push(tail);

  return lines.join('\n');
}

async function readXlsx(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const chunks: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    // Cada hoja suele ser una semana: su nombre puede ser la cabecera.
    chunks.push(sheetName);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    for (const row of rows) {
      const cells = (row as unknown[])
        .map(c => (c === null || c === undefined ? '' : String(c).trim()))
        .filter(c => c !== '');
      if (cells.length === 0) continue;
      chunks.push(cells.length === 1 ? cells[0] : cells.join(' | '));
    }
  }

  return chunks.join('\n');
}

async function readPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // El worker se resuelve como módulo del propio bundle: evita CDNs externas.
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // pdf.js devuelve fragmentos sueltos: se reagrupan por altura para reconstruir líneas.
    let currentY: number | null = null;
    let current: string[] = [];
    const flush = () => {
      const t = current.join(' ').replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
      current = [];
    };

    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof item.str !== 'string') continue;
      const y = item.transform?.[5];
      if (currentY !== null && y !== undefined && Math.abs(y - currentY) > 3) flush();
      if (y !== undefined) currentY = y;
      if (item.str.trim()) current.push(item.str);
    }
    flush();
  }

  return lines.join('\n');
}

export async function readPlanFile(file: File): Promise<ReadPlanFileResult> {
  if (file.size > MAX_BYTES) {
    throw new Error('El archivo pesa más de 15 MB. Comprueba que sea el plan y no un documento con vídeos.');
  }
  if (file.size === 0) {
    throw new Error(
      'El archivo está vacío. Si lo has elegido desde Drive, pulsa ⋮ → Descargar y vuelve a importar ese archivo.'
    );
  }

  const byName = detectPlanFileKind(file.name);
  const byMime = kindFromMime(file.type || '');
  const looksDoc = /\.doc$/i.test(file.name);
  const looksXls = /\.xls$/i.test(file.name) || (file.type || '').toLowerCase().includes('excel');

  if ((byName === 'text' || byMime === 'text') && byName !== 'xlsx' && byMime !== 'xlsx') {
    return { text: await file.text(), kind: 'text' };
  }

  const buffer = await file.arrayBuffer();
  if (byMime === 'gdoc' || looksLikeGoogleShortcut(buffer, file.name)) {
    throw new Error(GDOC_MSG);
  }

  const magic = magicKind(buffer);
  if (magic === 'ole' || byMime === 'ole-doc' || looksDoc) {
    if (looksXls || byName === 'xlsx') {
      return { text: await readXlsx(buffer), kind: 'xlsx' };
    }
    if (magic === 'ole' && !looksDoc && byMime !== 'ole-doc') {
      try {
        return { text: await readXlsx(buffer), kind: 'xlsx' };
      } catch {
        throw new Error(OLE_DOC_MSG);
      }
    }
    throw new Error(OLE_DOC_MSG);
  }

  let kind: PlanFileKind | null = null;
  if (magic === 'pdf') kind = 'pdf';
  else if (magic === 'zip') {
    try {
      kind = await zipOfficeKind(buffer);
    } catch {
      throw new Error(UNKNOWN_MSG);
    }
  }
  else kind = byName ?? (byMime === 'docx' || byMime === 'xlsx' || byMime === 'pdf' || byMime === 'text' ? byMime : null);

  if (!kind && (byName === 'xlsx' || byMime === 'xlsx' || /\.csv$/i.test(file.name))) {
    return { text: await readXlsx(buffer), kind: 'xlsx' };
  }

  if (!kind) {
    const sample = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 256));
    const stripped = sample.replace(/[\t\r\n]/g, '');
    if (stripped.length > 20 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(sample)) {
      return { text: new TextDecoder('utf-8').decode(buffer), kind: 'text' };
    }
    throw new Error(UNKNOWN_MSG);
  }

  if (kind === 'text') return { text: new TextDecoder('utf-8').decode(buffer), kind };
  if (kind === 'docx') return { text: await readDocx(buffer), kind };
  if (kind === 'xlsx') return { text: await readXlsx(buffer), kind };
  return { text: await readPdf(buffer), kind };
}
