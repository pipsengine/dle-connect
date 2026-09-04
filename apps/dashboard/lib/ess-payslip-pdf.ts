import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EssPayrollEmployee, PayrollHistoryRow, PayrollLine } from '@/app/workforce-portal/ess-payslip-shared';
import { buildPayslipModel } from '@/app/workforce-portal/ess-payslip-shared';

type DrawCmd = string;

const COMPANY = {
  name: 'Dorman Long Engineering Limited',
  addressLines: [
    '12/14 Agege Motor Road, Idi-Oro, Mushin',
    'Lagos, Nigeria',
  ],
  email: 'hrpayroll@dormanlongeng.com',
  website: 'www.dormanlongeng.com',
};

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

const moneyAscii = (value: number) => {
  const amount = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
  return `NGN ${amount}`;
};

const textAt = (x: number, y: number, size: number, text: string, font = 'F1'): DrawCmd =>
  `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;

const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  fillRgb?: [number, number, number],
  strokeRgb?: [number, number, number],
): DrawCmd => {
  const parts: string[] = [];
  if (fillRgb) parts.push(`${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg`);
  if (strokeRgb) parts.push(`${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG`, '0.8 w');
  parts.push(`${x} ${y} ${w} ${h} re`);
  if (fillRgb && strokeRgb) parts.push('B');
  else if (fillRgb) parts.push('f');
  else parts.push('S');
  parts.push('0 0 0 rg', '0 0 0 RG');
  return parts.join('\n');
};

const parseJpegDimensions = (bytes: Buffer): { width: number; height: number } | null => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const size = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + size;
  }
  return null;
};

const resolveLogoCandidates = () => {
  const cwd = process.cwd();
  const names = ['dorman-long-logo.jpg', 'dorman-long-logo.png'];
  const roots = [
    path.join(cwd, 'public', 'brand'),
    path.join(cwd, 'apps', 'dashboard', 'public', 'brand'),
  ];
  const candidates: string[] = [];
  for (const root of roots) {
    for (const name of names) candidates.push(path.join(root, name));
  }
  return candidates;
};

const readJpegLogo = async () => {
  for (const logoPath of resolveLogoCandidates()) {
    try {
      const bytes = await readFile(logoPath);
      const dims = parseJpegDimensions(bytes);
      if (!dims || dims.width < 1 || dims.height < 1) continue;
      return { bytes, width: dims.width, height: dims.height };
    } catch {
      // try next
    }
  }
  return null;
};

const drawLines = (
  cmds: DrawCmd[],
  title: string,
  lines: PayrollLine[],
  startY: number,
  margin: number,
  contentW: number,
) => {
  let y = startY;
  const muted: [number, number, number] = [0.39, 0.45, 0.55];
  cmds.push(textAt(margin, y, 11, title, 'F2'));
  y -= 14;
  cmds.push(rect(margin, y - Math.max(24, lines.length * 14 + 8), contentW, Math.max(24, lines.length * 14 + 8), [1, 1, 1], [0.86, 0.89, 0.93]));
  y -= 12;
  if (!lines.length) {
    cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
    cmds.push(textAt(margin + 10, y, 9, 'None'));
    cmds.push('0 0 0 rg');
    return y - 20;
  }
  for (const line of lines.slice(0, 12)) {
    cmds.push(textAt(margin + 10, y, 9, pdfSafe(line.label || line.code || 'Item').slice(0, 42)));
    cmds.push(textAt(margin + contentW - 110, y, 9, moneyAscii(Number(line.amount || 0)), 'F2'));
    y -= 14;
  }
  return y - 16;
};

const assemblePdf = (stream: string, logo: { bytes: Buffer; width: number; height: number } | null) => {
  const pageW = 595;
  const pageH = 842;
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
  pushObject(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources ${resources} >>\nendobj\n`);
  pushObject(`4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);
  pushObject('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  if (logo) {
    pushObject(
      `6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
      logo.bytes,
    );
  } else {
    pushObject('6 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 0 >>\nstream\n\nendstream\nendobj\n');
  }
  pushObject('7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');
  const body = Buffer.concat(chunks);
  const xrefStart = body.length;
  let xref = `xref\n0 8\n0000000000 65535 f \n`;
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
  const logo = await readJpegLogo();
  const pageW = 595;
  const pageH = 842;
  const margin = 36;
  const contentW = pageW - margin * 2;
  const brandBlue: [number, number, number] = [0, 0.56, 0.835];
  const muted: [number, number, number] = [0.39, 0.45, 0.55];
  const panel: [number, number, number] = [0.96, 0.98, 0.99];
  const cmds: DrawCmd[] = [];

  cmds.push(rect(0, pageH - 96, pageW, 96, [1, 1, 1]));
  cmds.push(rect(0, pageH - 98, pageW, 3, brandBlue));
  if (logo) {
    const scale = Math.min(140 / logo.width, 40 / logo.height);
    const drawW = logo.width * scale;
    const drawH = logo.height * scale;
    cmds.push(`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${margin.toFixed(2)} ${(pageH - 28 - drawH).toFixed(2)} cm /Im1 Do Q`);
    cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
    cmds.push(textAt(margin + 150, pageH - 42, 9, COMPANY.addressLines[0]));
    cmds.push(textAt(margin + 150, pageH - 56, 9, COMPANY.addressLines[1]));
    cmds.push(textAt(margin + 150, pageH - 70, 8, `${COMPANY.website}  |  ${COMPANY.email}`));
    cmds.push('0 0 0 rg');
  } else {
    cmds.push(`${brandBlue[0]} ${brandBlue[1]} ${brandBlue[2]} rg`);
    cmds.push(textAt(margin, pageH - 40, 14, COMPANY.name, 'F2'));
    cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
    cmds.push(textAt(margin, pageH - 56, 9, COMPANY.addressLines[0]));
    cmds.push(textAt(margin, pageH - 68, 9, COMPANY.addressLines[1]));
    cmds.push('0 0 0 rg');
  }

  cmds.push(rect(margin, pageH - 136, contentW, 28, panel, [0.86, 0.89, 0.93]));
  cmds.push(textAt(margin + 12, pageH - 126, 12, kind === 'tax' ? 'TAX SLIP / PAYE SUMMARY' : 'EMPLOYEE PAYSLIP', 'F2'));
  cmds.push(textAt(pageW - margin - 160, pageH - 126, 9, pdfSafe(selected.periodLabel || selected.period)));

  let y = pageH - 160;
  cmds.push(textAt(margin, y, 11, 'EMPLOYEE', 'F2'));
  y -= 14;
  cmds.push(rect(margin, y - 70, contentW, 70, [1, 1, 1], [0.86, 0.89, 0.93]));
  const employeeRows: Array<[string, string]> = [
    ['Name', pdfSafe(employee?.fullName || model.info.employeeName || '-')],
    ['Code', pdfSafe(employee?.employeeCode || employee?.employeeId || model.info.employeeCode || '-')],
    ['Department', pdfSafe(employee?.department || model.info.department || '-')],
    ['Job title', pdfSafe(employee?.jobTitle || model.info.designation || '-')],
  ];
  let rowY = y - 16;
  for (const [label, value] of employeeRows) {
    cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
    cmds.push(textAt(margin + 10, rowY, 8, label.toUpperCase()));
    cmds.push('0 0 0 rg');
    cmds.push(textAt(margin + 100, rowY, 9, value.slice(0, 55)));
    rowY -= 14;
  }

  y = y - 96;
  cmds.push(textAt(margin, y, 11, 'PAY SUMMARY', 'F2'));
  y -= 14;
  cmds.push(rect(margin, y - 78, contentW, 78, panel, [0.86, 0.89, 0.93]));
  const summary: Array<[string, string]> = [
    ['Gross pay', moneyAscii(model.grossPay)],
    ['Total deductions', moneyAscii(selected.deductions)],
    ['Net pay', moneyAscii(selected.netPay)],
    ['PAYE tax', moneyAscii(model.payeTax)],
  ];
  rowY = y - 16;
  for (const [label, value] of summary) {
    cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
    cmds.push(textAt(margin + 10, rowY, 8, label.toUpperCase()));
    cmds.push('0 0 0 rg');
    cmds.push(textAt(margin + 140, rowY, 10, value, 'F2'));
    rowY -= 14;
  }

  y = y - 100;
  if (kind === 'tax') {
    cmds.push(textAt(margin, y, 11, 'YEAR-TO-DATE TAX', 'F2'));
    y -= 14;
    cmds.push(rect(margin, y - 60, contentW, 60, [1, 1, 1], [0.86, 0.89, 0.93]));
    rowY = y - 16;
    for (const [label, value] of (model.ytdRows || []).filter((row) => /tax|paye|deduction|gross|net/i.test(row[0])).slice(0, 4)) {
      cmds.push(textAt(margin + 10, rowY, 9, pdfSafe(label)));
      cmds.push(textAt(margin + contentW - 120, rowY, 9, pdfSafe(value), 'F2'));
      rowY -= 14;
    }
  } else {
    y = drawLines(cmds, 'EARNINGS', model.earnings || [], y, margin, contentW);
    y = drawLines(cmds, 'DEDUCTIONS', model.deductions || [], y, margin, contentW);
  }

  cmds.push(rect(0, 0, pageW, 46, brandBlue));
  cmds.push('1 1 1 rg');
  cmds.push(textAt(margin, 24, 8, `Generated ${pdfSafe(options?.generatedAt || new Date().toISOString())} | DLE Connect Workforce Portal`));
  cmds.push(textAt(margin, 12, 8, 'Confidential - for the named employee only'));
  cmds.push('0 0 0 rg');

  const code = compact(employee?.employeeCode || employee?.employeeId || 'employee');
  const period = compact(selected.period || 'period');
  const filename = kind === 'tax'
    ? `tax-slip-${code}-${period}.pdf`
    : `payslip-${code}-${period}.pdf`;
  return { buffer: assemblePdf(cmds.join('\n'), logo), filename };
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
