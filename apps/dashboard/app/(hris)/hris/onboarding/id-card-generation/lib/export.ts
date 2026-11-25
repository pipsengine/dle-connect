import { backSvg, CARD_H_MM, CARD_W_MM, frontSvg, svgDataUrl, type CardTemplate } from './card-template';
import { fullName, type Employee } from './employees';

export type ExportFormat = 'png' | 'jpg' | 'pdf';

const DPI = 300;
export const CARD_PX = { w: Math.round((CARD_W_MM / 25.4) * DPI), h: Math.round((CARD_H_MM / 25.4) * DPI) }; // 641 x 1013

// --- Sheet layout ---------------------------------------------------------------------------------
// Cards are printed on A4 landscape sheets, at most 4 per page in a 2 x 2 grid. Each card shows its
// front and back side by side, with crop marks around every face for cutting.

export const CARDS_PER_PAGE = 4;
const PAGE_MM = { w: 297, h: 210 };
const FACE_GAP_MM = 6; // between a card's front and back
const COL_GAP_MM = 20; // between the two cards on a row
const ROW_GAP_MM = 14;
const MARK = { offset: 1.5, length: 4 }; // crop marks, mm
const PAIR_W_MM = CARD_W_MM * 2 + FACE_GAP_MM;
const MARGIN_X_MM = (PAGE_MM.w - (PAIR_W_MM * 2 + COL_GAP_MM)) / 2;
const MARGIN_Y_MM = (PAGE_MM.h - (CARD_H_MM * 2 + ROW_GAP_MM)) / 2;

export const pageCount = (cards: number) => Math.ceil(cards / CARDS_PER_PAGE);

type Line = [number, number, number, number];

/** Top-left of the front and back (mm from the page's top-left) for the card in `slot` (0–3, row by row). */
function slotFaces(slot: number) {
  const x = MARGIN_X_MM + (slot % 2) * (PAIR_W_MM + COL_GAP_MM);
  const y = MARGIN_Y_MM + Math.floor(slot / 2) * (CARD_H_MM + ROW_GAP_MM);
  return [
    { x, y },
    { x: x + CARD_W_MM + FACE_GAP_MM, y },
  ];
}

/** Crop marks (mm lines) just outside the four corners of a face. */
function cropMarks(x: number, y: number): Line[] {
  const { offset: o, length: l } = MARK;
  const lines: Line[] = [];
  for (const cx of [x, x + CARD_W_MM]) {
    for (const cy of [y, y + CARD_H_MM]) {
      const dx = cx === x ? -1 : 1;
      const dy = cy === y ? -1 : 1;
      lines.push([cx + dx * o, cy, cx + dx * (o + l), cy]);
      lines.push([cx, cy + dy * o, cx, cy + dy * (o + l)]);
    }
  }
  return lines;
}

/** Everything placed on one sheet, in mm: the faces plus crop marks. */
function sheetLayout<T>(cards: { front: T; back: T }[]) {
  const faces: { img: T; x: number; y: number }[] = [];
  const marks: Line[] = [];
  cards.slice(0, CARDS_PER_PAGE).forEach((card, slot) => {
    const [f, b] = slotFaces(slot);
    faces.push({ img: card.front, ...f }, { img: card.back, ...b });
    marks.push(...cropMarks(f.x, f.y), ...cropMarks(b.x, b.y));
  });
  return { faces, marks };
}

/** One generated page holding up to four cards. */
export interface Sheet {
  page: number;
  employees: Employee[];
  filename: string;
  blob: Blob;
  thumbUrl: string;
  /** Kept for PDF exports so all pages can be merged into one file. */
  pdf?: PdfPage;
}

// --- Photos ---------------------------------------------------------------------------------------

const photoCache = new Map<string, Promise<string | undefined>>();

/**
 * Returns the photo as a data URL (SVG rendered as an image can only embed data URLs), downscaled to
 * print resolution. Undefined when there is no photo or it cannot be loaded (e.g. blocked by CORS).
 */
export function loadPhoto(url?: string): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined);
  if (!photoCache.has(url)) {
    photoCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const scale = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.round(img.naturalWidth * scale);
            c.height = Math.round(img.naturalHeight * scale);
            const ctx = c.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.9));
          } catch {
            resolve(undefined);
          }
        };
        img.onerror = () => resolve(undefined);
        img.src = url;
      })
    );
  }
  return photoCache.get(url)!;
}

// --- Rasterising ----------------------------------------------------------------------------------

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render the card'));
    img.src = svgDataUrl(svg);
  });
}

export interface RenderedCard {
  employee: Employee;
  front: HTMLImageElement;
  back: HTMLImageElement;
}

/** Renders one employee's front and back at 300 DPI. */
export async function renderCard(employee: Employee, template: CardTemplate): Promise<RenderedCard> {
  const photo = await loadPhoto(employee.photoUrl);
  const [front, back] = await Promise.all([svgToImage(frontSvg(employee, photo, CARD_PX)), svgToImage(backSvg(employee, template, CARD_PX))]);
  return { employee, front, back };
}

function canvasFor(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality));

const px = (mm: number) => Math.round((mm / 25.4) * DPI);

/** The whole A4 sheet as a 300 DPI canvas (3508 x 2480 px). */
function sheetCanvas(cards: RenderedCard[]) {
  const { c, ctx } = canvasFor(px(PAGE_MM.w), px(PAGE_MM.h));
  const { faces, marks } = sheetLayout(cards);
  for (const f of faces) ctx.drawImage(f.img, px(f.x), px(f.y), CARD_PX.w, CARD_PX.h);
  ctx.strokeStyle = '#8a8a8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of marks) {
    ctx.moveTo(px(x1), px(y1));
    ctx.lineTo(px(x2), px(y2));
  }
  ctx.stroke();
  return c;
}

function thumbnail(source: HTMLCanvasElement) {
  const h = 140;
  const w = Math.round((source.width / source.height) * h);
  const { c, ctx } = canvasFor(w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.85);
}

const safeName = (e: Employee) => `${e.id}_${fullName(e).replace(/[^A-Za-z0-9]+/g, '-')}`.replace(/-+$/, '');

async function faceJpeg(img: HTMLImageElement): Promise<Uint8Array> {
  const { c, ctx } = canvasFor(CARD_PX.w, CARD_PX.h);
  ctx.drawImage(img, 0, 0, CARD_PX.w, CARD_PX.h);
  return new Uint8Array(await (await toBlob(c, 'image/jpeg', 0.95)).arrayBuffer());
}

/**
 * Lays the cards out on A4 landscape sheets, at most four per page. PNG/JPG give one 300 DPI image per
 * page; PDF gives one page per sheet (faces embedded at true card size, with vector crop marks).
 */
export async function buildSheets(cards: RenderedCard[], format: ExportFormat): Promise<Sheet[]> {
  const stamp = new Date().toISOString().slice(0, 10);
  const total = pageCount(cards.length);
  const sheets: Sheet[] = [];
  for (let i = 0; i < total; i++) {
    const group = cards.slice(i * CARDS_PER_PAGE, (i + 1) * CARDS_PER_PAGE);
    const canvas = sheetCanvas(group);
    const base = cards.length === 1 ? safeName(group[0].employee) : total === 1 ? `ID-Cards_${stamp}` : `ID-Cards_${stamp}_page-${i + 1}-of-${total}`;
    const employees = group.map((c) => c.employee);
    const thumbUrl = thumbnail(canvas);
    if (format === 'pdf') {
      const { faces, marks } = sheetLayout(group);
      const images = await Promise.all(faces.map(async (f) => ({ jpeg: await faceJpeg(f.img), w: CARD_PX.w, h: CARD_PX.h, x: f.x, y: f.y })));
      const pdf: PdfPage = { images, marks };
      sheets.push({ page: i + 1, employees, filename: `${base}.pdf`, blob: buildPdf([pdf]), thumbUrl, pdf });
    } else {
      const blob = format === 'png' ? await toBlob(canvas, 'image/png') : await toBlob(canvas, 'image/jpeg', 0.95);
      sheets.push({ page: i + 1, employees, filename: `${base}.${format}`, blob: await withDpi(blob, DPI), thumbUrl });
    }
  }
  return sheets;
}

/** Tags a canvas PNG/JPEG with its print resolution (canvas exports say 96 DPI), so it prints at true size. */
async function withDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type === 'image/jpeg') {
    // JFIF APP0: units at offset 13 (1 = dots per inch), then X and Y density.
    if (String.fromCharCode(...bytes.subarray(6, 10)) !== 'JFIF') return blob;
    const v = new DataView(bytes.buffer);
    v.setUint8(13, 1);
    v.setUint16(14, dpi);
    v.setUint16(16, dpi);
    return new Blob([bytes], { type: blob.type });
  }
  // PNG: insert a pHYs chunk (pixels per metre) right after IHDR, which always ends at byte 33.
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  v.setUint32(8, ppm);
  v.setUint32(12, ppm);
  v.setUint8(16, 1);
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  return new Blob([bytes.subarray(0, 33), chunk, bytes.subarray(33)], { type: blob.type });
}

// --- PDF (minimal writer: A4 landscape pages, card faces as JPEG images) ---------------------------

export interface PdfImage {
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  w: number;
  h: number;
  /** Top-left position on the page in mm; drawn at true card size. */
  x: number;
  y: number;
}

export interface PdfPage {
  images: PdfImage[];
  /** Crop-mark lines in mm (x1, y1, x2, y2) from the page's top-left. */
  marks: Line[];
}

export function buildPdf(pages: PdfPage[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const pt = (mm: number) => ((mm / 25.4) * 72).toFixed(2);
  const flip = (mm: number) => PAGE_MM.h - mm; // PDF's origin is bottom-left

  // Object numbers: 1 catalog, 2 page tree, then per page: page, content, one per image.
  const firstObj: number[] = [];
  let next = 3;
  for (const p of pages) {
    firstObj.push(next);
    next += 2 + p.images.length;
  }
  const total = next - 1;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const obj = (n: number, body: () => void) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${firstObj.map((n) => `${n} 0 R`).join(' ')}] >>`));
  pages.forEach((p, i) => {
    const n = firstObj[i];
    const draw = p.images.map((img, k) => `q ${pt(CARD_W_MM)} 0 0 ${pt(CARD_H_MM)} ${pt(img.x)} ${pt(flip(img.y + CARD_H_MM))} cm /Im${k} Do Q`);
    const marks = p.marks.map(([x1, y1, x2, y2]) => `${pt(x1)} ${pt(flip(y1))} m ${pt(x2)} ${pt(flip(y2))} l`);
    const content = [...draw, '0.54 G 0.4 w', ...marks, 'S'].join('\n');
    const xobjects = p.images.map((_, k) => `/Im${k} ${n + 2 + k} 0 R`).join(' ');
    obj(n, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(PAGE_MM.w)} ${pt(PAGE_MM.h)}] /Resources << /XObject << ${xobjects} >> >> /Contents ${n + 1} 0 R >>`)
    );
    obj(n + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    p.images.forEach((img, k) =>
      obj(n + 2 + k, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
        push(img.jpeg);
        push('\nendstream');
      })
    );
  });
  const xref = length;
  let table = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(`${table}trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

// --- ZIP (store only; PNG/JPG are already compressed) ---------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function buildZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
