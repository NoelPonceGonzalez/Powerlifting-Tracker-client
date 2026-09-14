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

export function detectPlanFileKind(fileName: string): PlanFileKind | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt' || ext === 'md' || ext === 'rtf') return 'text';
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

  const kind = detectPlanFileKind(file.name);
  if (!kind) {
    throw new Error('Formato no admitido. Usa Word (.docx), Excel (.xlsx), PDF o texto.');
  }

  if (kind === 'text') {
    return { text: await file.text(), kind };
  }

  const buffer = await file.arrayBuffer();
  if (kind === 'docx') return { text: await readDocx(buffer), kind };
  if (kind === 'xlsx') return { text: await readXlsx(buffer), kind };
  return { text: await readPdf(buffer), kind };
}
