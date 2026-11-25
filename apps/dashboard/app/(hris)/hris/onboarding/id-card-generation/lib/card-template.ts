import { create as createQrCode } from 'qrcode';
import { BACK_ART, FRONT_ART } from './card-artwork';
import type { Employee } from './employees';
import { fullName } from './employees';

/**
 * Dorman Long employee ID card, 2-sided, built on the artwork of public/files/ID Card.pdf.
 *
 * Coordinates are PDF points with a top-left origin (page = 153.96 x 243 pt = 54.3 x 85.7 mm), and every
 * position, size and font below was measured from that PDF, so the cards match it exactly. The artwork
 * (pattern, logo, white QR box) comes from lib/card-artwork.ts; only the employee's photo, name, job
 * title, QR code and ID are added here. The same SVG string is shown in the preview and rasterised for
 * export. Embedded photos must be data URLs (see export.ts → loadPhoto).
 */

const W = 153.96;
const H = 243;
export const CARD_W_MM = (W / 72) * 25.4; // 54.31
export const CARD_H_MM = (H / 72) * 25.4; // 85.73

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

export const TEMPLATES: CardTemplate[] = [{ id: 'dorman-long', name: 'Dorman Long Template', description: 'Portrait • 2-sided', isDefault: true }];

export type Face = 'front' | 'back';

/** The design uses Tahoma Bold throughout (Verdana is its closest relative when Tahoma is missing). */
const FONT = 'Tahoma, Verdana, Geneva, sans-serif';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => +v.toFixed(3);

// --- Text -----------------------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Width of `text` in bold Tahoma at `size` pt (falls back to an average glyph width outside the browser). */
function textWidth(text: string, size: number): number {
  if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * size * 0.62;
  measureCtx.font = `bold 100px ${FONT}`;
  return (measureCtx.measureText(text).width / 100) * size;
}

/**
 * Bold text centred on `cx`. Long text is first reduced in size (down to `minSize`), then condensed
 * horizontally - like the 88% scaling the original card uses on its address lines.
 */
function centredText(text: string, cx: number, baseline: number, size: number, maxWidth: number, fill: string, minSize = size * 0.8) {
  let s = size;
  let w = textWidth(text, s);
  if (w > maxWidth) {
    s = Math.max(minSize, (size * maxWidth) / w);
    w = textWidth(text, s);
  }
  const squeeze = w > maxWidth ? ` textLength="${n(maxWidth)}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${n(cx)}" y="${n(baseline)}" font-size="${n(s)}" text-anchor="middle" fill="${fill}"${squeeze}>${esc(text)}</text>`;
}

/** Static text from the PDF: starts at `x` and is fitted to the exact run length Word produced. */
const fixedText = (text: string, x: number, baseline: number, size: number, length: number, fill = '#fff') =>
  `<text x="${x}" y="${baseline}" font-size="${size}" fill="${fill}" textLength="${length}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text>`;

// --- Front ----------------------------------------------------------------------------------------

const PHOTO = { x: 36, y: 51.544, w: 81.5, h: 73.466 };
/**
 * Name and title sit on a navy panel directly under the photo. The PDF's own panel is narrower than the
 * photo and has a stray white line down its right edge, so a clean panel is drawn over it, exactly as
 * wide as the photo and ending on the background's grid line.
 */
const PANEL = { x: PHOTO.x, y: PHOTO.y + PHOTO.h, w: PHOTO.w, h: 152.3 - (PHOTO.y + PHOTO.h), fill: '#1a1c42' };
const LABEL = { cx: PANEL.x + PANEL.w / 2, size: 6.96, maxWidth: PANEL.w - 8 };
/**
 * The PDF leaves a 1 pt gap between its name panel and the purple block to the right, where the card's
 * white base shows through the background's semi-transparent grid line. Starting that block (drawn
 * behind the background image) 1.2 pt further left closes the gap.
 */
const FRONT = FRONT_ART.replace(
  '<path d="M116.64 152.863L153.995 152.863L153.995 104.248L116.64 104.248Z"',
  '<path d="M115.44 152.863L153.995 152.863L153.995 104.248L115.44 104.248Z"'
);
/** Tahoma Bold cap height as a fraction of the font size. */
const CAP = 0.727;

/** Baselines that centre `count` lines (cap height to last baseline) vertically in the panel. */
function panelBaselines(count: number, size: number, leading: number): number[] {
  const block = (count - 1) * leading + size * CAP;
  const first = PANEL.y + (PANEL.h - block) / 2 + size * CAP;
  return Array.from({ length: count }, (_, i) => first + i * leading);
}

/** Two lines = name + title; three or four when a long name and/or title wraps (smaller for four). */
const LAYOUTS: Record<number, { size: number; baselines: number[] }> = {
  2: { size: 6.96, baselines: panelBaselines(2, 6.96, 8.4) },
  3: { size: 6.96, baselines: panelBaselines(3, 6.96, 7.6) },
  4: { size: 6.2, baselines: panelBaselines(4, 6.2, 6.6) },
};

/** Splits text over two lines when it doesn't fit on one, choosing the most balanced word break. */
function wrapTwo(text: string, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  if (words.length < 2 || textWidth(text, size) <= maxWidth) return [text];
  let best = [text];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const widest = Math.max(...lines.map((l) => textWidth(l, size)));
    if (widest < bestWidth) [best, bestWidth] = [lines, widest];
  }
  return best;
}

const PLACEHOLDER_PHOTO = `<rect width="100" height="90" fill="#d3d8de"/>
  <circle cx="50" cy="36" r="19" fill="#9aa3ad"/><path d="M10 90 Q12 60 50 60 Q88 60 90 90 Z" fill="#9aa3ad"/>`;

const open = (size?: { w: number; h: number }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" ${
    size ? ` width="${size.w}" height="${size.h}"` : ''
  } font-family="${esc(FONT)}" font-weight="700">`;

/**
 * @param photo data URL of the employee photo (undefined → silhouette placeholder)
 * @param size optional pixel size for export; omitted for responsive preview
 */
export function frontSvg(employee: Employee, photo: string | undefined, size?: { w: number; h: number }): string {
  const { x, y, w, h } = PHOTO;
  const photoEl = photo
    ? `<image href="${photo}" xlink:href="${photo}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMin slice" clip-path="url(#ph)"/>`
    : `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 100 90" preserveAspectRatio="none">${PLACEHOLDER_PHOTO}</svg>`;
  const labels = [fullName(employee), employee.jobTitle].flatMap((t) => wrapTwo(t.toUpperCase(), LABEL.size, LABEL.maxWidth));
  const layout = LAYOUTS[labels.length];
  // One size for every line (the widest line decides), so a shrunk line never looks out of place.
  const labelSize = Math.max(layout.size * 0.8, Math.min(layout.size, ...labels.map((t) => (layout.size * LABEL.maxWidth) / textWidth(t, layout.size))));

  return `${open(size)}
    ${FRONT}
    <defs><clipPath id="ph"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>
    <rect x="${PANEL.x}" y="${n(PANEL.y)}" width="${PANEL.w}" height="${n(PANEL.h)}" fill="${PANEL.fill}"/>
    ${photoEl}
    ${labels.map((text, i) => centredText(text, LABEL.cx, layout.baselines[i], labelSize, LABEL.maxWidth, '#fff', labelSize)).join('')}
  </svg>`;
}

// --- Back -----------------------------------------------------------------------------------------

const BACK_TEXT = [
  fixedText('RC: 744', 45.648, 100.97, 16.56, 61.492, '#f9f9f9'),
  fixedText('12/14 Agege Motor Road,', 34.224, 127.87, 8.04, 89.836),
  fixedText('Idi-Oro Mushin, Lagos.', 35.184, 137.47, 8.04, 87.916),
  fixedText('P.O Box 256', 56.928, 146.832, 8.04, 43.102),
  fixedText('www.dormanlongeng.com', 28.344, 156.432, 8.04, 101.356),
].join('');

const QR = { x: 59.95, y: 190.99, size: 34.08 };
const ID = { cx: 76.985, baseline: 231.96, size: 6.96, maxWidth: 48 };

function qrPath(value: string): { size: number; d: string } {
  const { modules } = createQrCode(value, { errorCorrectionLevel: 'M' });
  let d = '';
  for (let r = 0; r < modules.size; r++) for (let c = 0; c < modules.size; c++) if (modules.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { size: modules.size, d };
}

export function backSvg(employee: Employee, template: CardTemplate, size?: { w: number; h: number }): string {
  const qr = qrPath(employee.id);
  return `${open(size)}
    ${BACK_ART}
    ${BACK_TEXT}
    <svg x="${QR.x}" y="${QR.y}" width="${QR.size}" height="${QR.size}" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges"><path d="${qr.d}" fill="#000"/></svg>
    ${centredText(`ID: ${employee.id}`, ID.cx, ID.baseline, ID.size, ID.maxWidth, '#000')}
  </svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
