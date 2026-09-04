import { deflateSync, inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EssPayrollEmployee, PayrollHistoryRow, PayrollLine } from '@/app/workforce-portal/ess-payslip-shared';
import {
  amountInWords,
  buildPayslipModel,
  fmtDate,
  money2,
  nonZeroPayrollLine,
  nonZeroSummaryRow,
  stableDateTime,
  visibleInfoRow,
} from '@/app/workforce-portal/ess-payslip-shared';

type DrawCmd = string;
type Rgb = [number, number, number];
type BrandLogo =
  | { kind: 'jpeg'; width: number; height: number; bytes: Buffer }
  | { kind: 'png'; width: number; height: number; rgb: Buffer };

const brandBlue: Rgb = [0.071, 0.247, 0.51];
const borderBlue: Rgb = [0.184, 0.404, 0.694];
const lightBlue: Rgb = [0.608, 0.725, 0.875];
const muted: Rgb = [0.278, 0.333, 0.412];
const slate: Rgb = [0.059, 0.09, 0.165];
const panel: Rgb = [0.937, 0.973, 1];
const greenBg: Rgb = [0.925, 0.992, 0.953];
const green: Rgb = [0.016, 0.471, 0.341];
const amber: Rgb = [0.706, 0.325, 0.035];
const greenBorder: Rgb = [0.133, 0.773, 0.369];

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 28;

const compact = (value: unknown) => String(value ?? '').trim();

const pdfSafe = (value: unknown) =>
  compact(value)
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/₦/g, 'NGN ')
    .replace(/→/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

const escapePdfText = (value: string) =>
  pdfSafe(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const moneyAmt = (value: number) =>
  new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const moneyLabel = (value: number) => pdfSafe(money2(value));

const textAt = (x: number, y: number, size: number, text: string, font = 'F1'): DrawCmd =>
  `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;

const setFill = (rgb: Rgb) => `${rgb[0]} ${rgb[1]} ${rgb[2]} rg`;
const setStroke = (rgb: Rgb, width = 0.8) => `${rgb[0]} ${rgb[1]} ${rgb[2]} RG\n${width} w`;

const rect = (x: number, y: number, w: number, h: number, fillRgb?: Rgb, strokeRgb?: Rgb): DrawCmd => {
  const parts: string[] = [];
  if (fillRgb) parts.push(setFill(fillRgb));
  if (strokeRgb) parts.push(setStroke(strokeRgb));
  parts.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
  if (fillRgb && strokeRgb) parts.push('B');
  else if (fillRgb) parts.push('f');
  else parts.push('S');
  parts.push('0 0 0 rg', '0 0 0 RG');
  return parts.join('\n');
};

const hline = (x1: number, y: number, x2: number, rgb: Rgb = lightBlue, width = 0.7): DrawCmd =>
  `${setStroke(rgb, width)}\n${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S\n0 0 0 RG`;

const vline = (x: number, y1: number, y2: number, rgb: Rgb = lightBlue, width = 0.7): DrawCmd =>
  `${setStroke(rgb, width)}\n${x.toFixed(2)} ${y1.toFixed(2)} m ${x.toFixed(2)} ${y2.toFixed(2)} l S\n0 0 0 RG`;

const resolveLogoCandidates = () => {
  const cwd = process.cwd();
  const roots = [
    path.join(cwd, 'public', 'brand'),
    path.join(cwd, 'apps', 'dashboard', 'public', 'brand'),
  ];
  return roots.flatMap((root) => [
    path.join(root, 'dorman-long-logo.png'),
    path.join(root, 'dorman-long-logo.jpg'),
  ]);
};

const parseJpegDimensions = (bytes: Buffer): { width: number; height: number } | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const size = bytes.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > bytes.length) break;
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + size;
  }
  return null;
};

const paethPredictor = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
};

const decodePngRgb = (bytes: Buffer): { width: number; height: number; rgb: Buffer } | null => {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes.toString('ascii', 1, 4) !== 'PNG') return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 2;
  const idat: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    const chunk = bytes.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(chunk));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || !idat.length) return null;
  const inflated = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (inflated.length < expected) return null;
  const raw = Buffer.alloc(width * height * 3);
  const prior = Buffer.alloc(stride);
  let src = 0;
  let dst = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[src];
    src += 1;
    const curr = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const x = inflated[src + i];
      const a = i >= channels ? curr[i - channels] : 0;
      const b = prior[i];
      const c = i >= channels ? prior[i - channels] : 0;
      let value = x;
      if (filter === 1) value = (x + a) & 0xff;
      else if (filter === 2) value = (x + b) & 0xff;
      else if (filter === 3) value = (x + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) value = (x + paethPredictor(a, b, c)) & 0xff;
      curr[i] = value;
    }
    src += stride;
    for (let col = 0; col < width; col += 1) {
      const px = col * channels;
      raw[dst] = curr[px];
      raw[dst + 1] = curr[px + 1];
      raw[dst + 2] = curr[px + 2];
      dst += 3;
    }
    curr.copy(prior);
  }
  return { width, height, rgb: raw };
};

const readBrandLogo = async (): Promise<BrandLogo | null> => {
  for (const logoPath of resolveLogoCandidates()) {
    try {
      const bytes = await readFile(logoPath);
      const jpeg = parseJpegDimensions(bytes);
      if (jpeg) return { kind: 'jpeg', width: jpeg.width, height: jpeg.height, bytes };
      const png = decodePngRgb(bytes);
      if (png) return { kind: 'png', width: png.width, height: png.height, rgb: png.rgb };
    } catch {
      // try next candidate
    }
  }
  return null;
};

const sectionHeader = (cmds: DrawCmd[], x: number, y: number, w: number, title: string) => {
  cmds.push(rect(x, y - 14, w, 14, brandBlue));
  cmds.push('1 1 1 rg');
  const titleText = title.toUpperCase();
  const approxHalf = Math.min(titleText.length * 2.2, w / 2 - 8);
  cmds.push(textAt(x + w / 2 - approxHalf, y - 10, 8, titleText, 'F2'));
  cmds.push('0 0 0 rg');
};

const drawKvColumn = (
  cmds: DrawCmd[],
  rows: Array<[string, string]>,
  x: number,
  startY: number,
  labelW: number,
  valueMax = 48,
) => {
  let y = startY;
  for (const [label, value] of rows) {
    cmds.push(setFill(slate));
    cmds.push(textAt(x, y, 7, pdfSafe(label).slice(0, 28), 'F2'));
    cmds.push(textAt(x + labelW, y, 7, ':'));
    cmds.push(textAt(x + labelW + 8, y, 7, pdfSafe(value).slice(0, valueMax)));
    y -= 10;
  }
  cmds.push('0 0 0 rg');
  return y;
};

const drawPayslipTable = (
  cmds: DrawCmd[],
  title: string,
  lines: PayrollLine[],
  totalLabel: string,
  total: number,
  x: number,
  startY: number,
  width: number,
) => {
  const visible = lines.filter(nonZeroPayrollLine);
  const rowH = 11;
  const headerH = 14;
  const bodyRows = Math.max(visible.length, 1);
  const tableH = headerH + 14 + bodyRows * rowH + rowH + 2;
  let y = startY;
  sectionHeader(cmds, x, y, width, title);
  y -= headerH;
  cmds.push(rect(x, y - tableH + headerH, width, tableH - headerH, [1, 1, 1], borderBlue));
  cmds.push(rect(x, y - 12, width, 12, [0.973, 0.98, 0.988]));
  cmds.push(setFill(muted));
  cmds.push(textAt(x + 4, y - 9, 6.5, 'DESCRIPTION', 'F2'));
  cmds.push(textAt(x + width * 0.58, y - 9, 6.5, 'UNITS', 'F2'));
  cmds.push(textAt(x + width * 0.72, y - 9, 6.5, 'AMOUNT (NGN)', 'F2'));
  cmds.push('0 0 0 rg');
  y -= 14;
  if (!visible.length) {
    cmds.push(textAt(x + 4, y, 7, '—'));
    y -= rowH;
  } else {
    for (const item of visible) {
      cmds.push(setFill(slate));
      cmds.push(textAt(x + 4, y, 7, pdfSafe(item.label || item.code || 'Item').toUpperCase().slice(0, 36), 'F2'));
      cmds.push(textAt(x + width * 0.6, y, 7, Number(item.units || 0).toFixed(2)));
      cmds.push(textAt(x + width * 0.74, y, 7, moneyAmt(Number(item.amount || 0)), 'F2'));
      y -= rowH;
    }
  }
  cmds.push(rect(x, y - 2, width, rowH + 2, panel, borderBlue));
  cmds.push(setFill(brandBlue));
  cmds.push(textAt(x + 4, y + 1, 7, totalLabel.toUpperCase(), 'F2'));
  cmds.push(textAt(x + width * 0.7, y + 1, 8, moneyAmt(total), 'F2'));
  cmds.push('0 0 0 rg');
  return startY - tableH - 6;
};

const buildPdfBuffer = (stream: string, logo: BrandLogo | null) => {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'utf8')];
  const offsets = [0];
  const pushObject = (text: string, binary?: Buffer) => {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(text, 'utf8'));
    if (binary) {
      chunks.push(binary);
      chunks.push(Buffer.from('\nendstream\nendobj\n', 'utf8'));
    }
  };
  const resources = logo
    ? '<< /Font << /F1 5 0 R /F2 7 0 R >> /XObject << /Im1 6 0 R >> >>'
    : '<< /Font << /F1 5 0 R /F2 7 0 R >> >>';
  pushObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  pushObject('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  pushObject(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources ${resources} >>\nendobj\n`,
  );
  pushObject(`4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);
  pushObject('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  if (logo?.kind === 'jpeg') {
    pushObject(
      `6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
      logo.bytes,
    );
  } else if (logo?.kind === 'png') {
    const compressed = deflateSync(logo.rgb);
    pushObject(
      `6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      compressed,
    );
  } else {
    pushObject('6 0 obj\n<< >>\nendobj\n');
  }
  pushObject('7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');
  const body = Buffer.concat(chunks);
  const xrefStart = body.length;
  let xref = 'xref\n0 8\n0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.concat([body, Buffer.from(xref, 'utf8')]);
};

export const buildEssPayslipPdf = async (
  selected: PayrollHistoryRow,
  employee?: EssPayrollEmployee | null,
  options?: { kind?: 'payslip' | 'tax'; generatedAt?: string },
): Promise<{ buffer: Buffer; filename: string }> => {
  const kind = options?.kind || 'payslip';
  const model = buildPayslipModel(selected, employee, options?.generatedAt);
  const logo = await readBrandLogo();
  const contentW = PAGE_W - MARGIN * 2;
  const cmds: DrawCmd[] = [];

  // Header: logo + PAYSLIP title
  if (logo) {
    const maxW = 120;
    const maxH = 36;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const drawW = logo.width * scale;
    const drawH = logo.height * scale;
    cmds.push(
      `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${MARGIN.toFixed(2)} ${(PAGE_H - 20 - drawH).toFixed(2)} cm /Im1 Do Q`,
    );
  } else {
    cmds.push(setFill(brandBlue));
    cmds.push(textAt(MARGIN, PAGE_H - 36, 11, 'DORMAN LONG ENGINEERING LIMITED', 'F2'));
    cmds.push('0 0 0 rg');
  }
  cmds.push(setFill(brandBlue));
  cmds.push(textAt(PAGE_W - MARGIN - 120, PAGE_H - 28, 18, 'PAYSLIP', 'F2'));
  cmds.push(setFill(muted));
  cmds.push(textAt(PAGE_W - MARGIN - 120, PAGE_H - 40, 7, 'FOR THE MONTH OF', 'F2'));
  cmds.push(setFill(brandBlue));
  cmds.push(textAt(PAGE_W - MARGIN - 120, PAGE_H - 52, 11, pdfSafe(selected.periodLabel || selected.period), 'F2'));
  cmds.push('0 0 0 rg');
  cmds.push(hline(MARGIN, PAGE_H - 62, PAGE_W - MARGIN, borderBlue, 1.2));

  // Company + pay cycle
  let y = PAGE_H - 78;
  drawKvColumn(
    cmds,
    [
      ['Company Name', 'DORMANLONG ENGINEERING LIMITED'],
      ['Company Address', '12/14 AGEGE MOTOR ROAD, IDI-ORO MUSHIN, LAGOS'],
      ['RC Number', '744'],
      ['TIN', '01714597-0001'],
    ],
    MARGIN,
    y,
    78,
    42,
  );
  drawKvColumn(
    cmds,
    [
      ['Pay Period', `${fmtDate(selected.payPeriodStart)} - ${fmtDate(selected.payPeriodEnd)}`],
      ['Pay Date', fmtDate(selected.payDate)],
      ['Payroll No.', selected.payrollNumber || '—'],
      ['PAYE Ref. No.', selected.payeReference || '—'],
    ],
    MARGIN + contentW / 2 + 8,
    y,
    70,
  );
  cmds.push(vline(MARGIN + contentW / 2, PAGE_H - 78, PAGE_H - 118, lightBlue));
  cmds.push(hline(MARGIN, PAGE_H - 122, PAGE_W - MARGIN, lightBlue));
  y = PAGE_H - 132;

  // Employee information
  sectionHeader(cmds, MARGIN, y, contentW, 'Employee Information');
  y -= 16;
  const employeeRows = (model.employeeRows.filter(visibleInfoRow) as Array<[string, unknown]>).map(
    ([label, value]) => [label, String(value || '—')] as [string, string],
  );
  const bankRows = (model.bankRows.filter(visibleInfoRow) as Array<[string, unknown]>).map(
    ([label, value]) => [label, String(value || '—')] as [string, string],
  );
  const empBlockH = Math.max(employeeRows.length, bankRows.length, 1) * 10 + 12;
  cmds.push(rect(MARGIN, y - empBlockH, contentW, empBlockH, [1, 1, 1], borderBlue));
  drawKvColumn(cmds, employeeRows, MARGIN + 6, y - 10, 92, 40);
  drawKvColumn(cmds, bankRows, MARGIN + contentW / 2 + 8, y - 10, 100, 36);
  cmds.push(vline(MARGIN + contentW / 2, y, y - empBlockH, lightBlue));
  y = y - empBlockH - 10;

  // Earnings | Deductions
  const colW = (contentW - 8) / 2;
  const earnBottom = drawPayslipTable(
    cmds,
    'Earnings',
    model.earnings || [],
    'Total Earnings',
    model.grossPay,
    MARGIN,
    y,
    colW,
  );
  const dedBottom = drawPayslipTable(
    cmds,
    'Deductions',
    model.deductions || [],
    'Total Deductions',
    selected.deductions,
    MARGIN + colW + 8,
    y,
    colW,
  );
  y = Math.min(earnBottom, dedBottom) - 2;

  // Net summary
  cmds.push(rect(MARGIN, y - 42, contentW, 42, greenBg, greenBorder));
  cmds.push(setFill(slate));
  cmds.push(textAt(MARGIN + 10, y - 14, 8, `Gross Pay: ${moneyLabel(model.grossPay)}`, 'F2'));
  cmds.push(setFill(amber));
  cmds.push(textAt(MARGIN + 200, y - 14, 8, `Total Deductions: ${moneyLabel(selected.deductions)}`, 'F2'));
  cmds.push(setFill(green));
  cmds.push(textAt(MARGIN + 380, y - 14, 10, `Net Pay: ${moneyLabel(selected.netPay)}`, 'F2'));
  cmds.push(setFill(muted));
  cmds.push(textAt(MARGIN + 10, y - 30, 7, `Amount in Words: ${pdfSafe(amountInWords(selected.netPay))}`));
  cmds.push('0 0 0 rg');
  y -= 52;

  // Company contributions
  y =
    drawPayslipTable(
      cmds,
      'Company Contributions',
      model.employerLines || [],
      'Total Company Contributions',
      model.totalEmployer,
      MARGIN,
      y,
      contentW,
    ) - 2;

  // YTD (and leave for tax variant space permitting)
  const ytdRows = (model.ytdRows || []).filter(nonZeroSummaryRow).slice(0, kind === 'tax' ? 8 : 6);
  if (ytdRows.length && y > 110) {
    const blockH = ytdRows.length * 10 + 18;
    sectionHeader(cmds, MARGIN, y, contentW, 'Year-To-Date Summary');
    y -= 14;
    cmds.push(rect(MARGIN, y - blockH + 14, contentW, blockH - 14, [1, 1, 1], borderBlue));
    let rowY = y - 10;
    for (const [label, value] of ytdRows) {
      cmds.push(setFill(muted));
      cmds.push(textAt(MARGIN + 8, rowY, 7, pdfSafe(label), 'F2'));
      cmds.push(setFill(slate));
      cmds.push(textAt(PAGE_W - MARGIN - 110, rowY, 7, pdfSafe(value), 'F2'));
      rowY -= 10;
    }
    cmds.push('0 0 0 rg');
    y = rowY - 8;
  }

  // Notes footer
  if (y > 72) {
    const footerTop = Math.min(y - 4, 90);
    const footerH = footerTop - 24;
    cmds.push(rect(MARGIN, 24, contentW, footerH, [1, 1, 1], lightBlue));
    cmds.push(setFill(brandBlue));
    cmds.push(textAt(MARGIN + 8, footerTop - 12, 7, 'NOTES', 'F2'));
    cmds.push(setFill(slate));
    cmds.push(textAt(MARGIN + 8, footerTop - 24, 6.5, '1. This is a system generated payslip and does not require any signature.'));
    cmds.push(
      textAt(
        MARGIN + 8,
        footerTop - 34,
        6.5,
        `2. Payroll Processing Date: ${pdfSafe(stableDateTime(model.verification.generatedAt))}`,
      ),
    );
    cmds.push(textAt(MARGIN + 8, footerTop - 44, 6.5, `3. HR Approval Status: ${pdfSafe(model.verification.approvalStatus)}`));
    cmds.push(
      textAt(
        MARGIN + 8,
        footerTop - 54,
        6.5,
        `4. Verification: https://ess.dormanlongeng.com/verify/${pdfSafe(selected.period)}`,
      ),
    );
    cmds.push(setFill(brandBlue));
    cmds.push(
      textAt(
        MARGIN + 8,
        30,
        6.5,
        'THANK YOU FOR YOUR CONTINUED CONTRIBUTION TO DORMANLONG ENGINEERING LIMITED.',
        'F2',
      ),
    );
    cmds.push('0 0 0 rg');
  }

  const code = compact(employee?.employeeCode || employee?.employeeId || 'employee');
  const period = compact(selected.period || 'period');
  const filename =
    kind === 'tax' ? `tax-slip-${code}-${period}.pdf` : `payslip-${code}-${period}.pdf`;

  return { buffer: buildPdfBuffer(cmds.join('\n'), logo), filename };
};

export const buildEssPayslipPdfBundle = async (
  rows: PayrollHistoryRow[],
  employee?: EssPayrollEmployee | null,
  options?: { kind?: 'payslip' | 'tax'; generatedAt?: string },
) => {
  const files: Array<{ filename: string; buffer: Buffer; period: string }> = [];
  for (const row of rows) {
    const built = await buildEssPayslipPdf(row, employee, options);
    files.push({ filename: built.filename, buffer: built.buffer, period: row.period });
  }
  return files;
};
