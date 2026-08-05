import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PaymentRequestActionRow, PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';
import { filterDocumentPaymentActions } from '@/lib/finance-intelligence/payment-action-visibility';

const compact = (value: unknown) => String(value ?? '').trim();

const COMPANY = {
  name: 'Dorman Long Engineering Limited',
  addressLines: [
    '12/14 Agege Motor Road, Idi-Oro, Mushin',
    'Lagos, Nigeria',
  ],
  email: 'hrpayroll@dormanlongeng.com',
  website: 'www.dormanlongeng.com',
  phone: '',
};

/** PDF Helvetica / WinAnsi cannot render Naira or fancy dashes — keep printable ASCII. */
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

const moneyAscii = (value: number, currency = 'NGN') => {
  const amount = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
  return `${pdfSafe(currency || 'NGN')} ${amount}`;
};

const fmtDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pdfSafe(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const resolveLogoPath = () => {
  const cwd = process.cwd();
  const dashboardRoot = /[\\/]apps[\\/]dashboard$/i.test(cwd) ? cwd : path.join(cwd, 'apps', 'dashboard');
  return path.join(dashboardRoot, 'public', 'brand', 'dorman-long-logo.png');
};

const readJpegLogo = async (): Promise<{ bytes: Buffer; width: number; height: number } | null> => {
  try {
    const bytes = await readFile(resolveLogoPath());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    // Parse SOF0/SOF2 for dimensions.
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const size = bytes.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        const height = bytes.readUInt16BE(offset + 5);
        const width = bytes.readUInt16BE(offset + 7);
        return { bytes, width, height };
      }
      offset += 2 + size;
    }
    return { bytes, width: 780, height: 220 };
  } catch {
    return null;
  }
};

type DrawCmd = string;

const textAt = (x: number, y: number, size: number, text: string, font = 'F1'): DrawCmd =>
  `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;

const rect = (x: number, y: number, w: number, h: number, fillRgb?: [number, number, number], strokeRgb?: [number, number, number]): DrawCmd => {
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

const line = (x1: number, y1: number, x2: number, y2: number, rgb: [number, number, number] = [0.82, 0.86, 0.9]): DrawCmd =>
  `${rgb[0]} ${rgb[1]} ${rgb[2]} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S 0 0 0 RG`;

const kvRow = (label: string, value: string, x: number, y: number, labelW = 110, valueW = 150): DrawCmd[] => [
  textAt(x, y, 8, label.toUpperCase()),
  textAt(x + labelW, y, 9, value.slice(0, 48)),
];

/** Professional single-page payment document PDF with Dorman Long branding. */
export const buildPaymentRequestDocumentPdf = async (
  request: PaymentRequestRow,
  actions: PaymentRequestActionRow[] = [],
): Promise<Buffer> => {
  const stages = Array.isArray(request.payload?.stages)
    ? (request.payload.stages as unknown[]).map((item) => compact(item)).filter(Boolean)
    : [];
  const logo = await readJpegLogo();

  const pageW = 595;
  const pageH = 842;
  const margin = 36;
  const contentW = pageW - margin * 2;
  const brandBlue: [number, number, number] = [0, 0.56, 0.835]; // #008FD5
  const slate: [number, number, number] = [0.06, 0.09, 0.16];
  const muted: [number, number, number] = [0.39, 0.45, 0.55];
  const panel: [number, number, number] = [0.96, 0.98, 0.99];
  const border: [number, number, number] = [0.86, 0.89, 0.93];

  const cmds: DrawCmd[] = [];

  // Header band
  cmds.push(rect(0, pageH - 108, pageW, 108, brandBlue));
  cmds.push('1 1 1 rg');
  cmds.push(textAt(margin + (logo ? 132 : 0), pageH - 42, 16, COMPANY.name, 'F2'));
  cmds.push(textAt(margin + (logo ? 132 : 0), pageH - 58, 9, COMPANY.addressLines[0]));
  cmds.push(textAt(margin + (logo ? 132 : 0), pageH - 70, 9, COMPANY.addressLines[1]));
  cmds.push(textAt(margin + (logo ? 132 : 0), pageH - 84, 8, `${COMPANY.website}  |  ${COMPANY.email}`));
  cmds.push('0 0 0 rg');

  // Document title strip
  cmds.push(rect(margin, pageH - 148, contentW, 28, panel, border));
  cmds.push(textAt(margin + 12, pageH - 138, 12, 'PAYMENT DOCUMENT', 'F2'));
  cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
  cmds.push(textAt(margin + 200, pageH - 138, 9, 'Finance Intelligence & Approvals'));
  cmds.push('0 0 0 rg');
  cmds.push(textAt(pageW - margin - 150, pageH - 138, 9, pdfSafe(request.requestNumber)));

  // Meta cards
  const metaY = pageH - 220;
  cmds.push(rect(margin, metaY, contentW * 0.48, 58, [1, 1, 1], border));
  cmds.push(rect(margin + contentW * 0.52, metaY, contentW * 0.48, 58, [1, 1, 1], border));
  cmds.push(...kvRow('Payment type', pdfSafe(request.paymentType), margin + 10, metaY + 38));
  cmds.push(...kvRow('Status', pdfSafe(request.status), margin + 10, metaY + 20));
  cmds.push(...kvRow('Stage', pdfSafe(request.currentStage || '-'), margin + contentW * 0.52 + 10, metaY + 38));
  cmds.push(...kvRow('Submitted', fmtDate(request.submittedAt || request.createdAt), margin + contentW * 0.52 + 10, metaY + 20));

  // Summary panel
  let y = metaY - 24;
  cmds.push(textAt(margin, y, 11, 'REQUEST SUMMARY', 'F2'));
  y -= 10;
  cmds.push(rect(margin, y - 150, contentW, 150, [1, 1, 1], border));
  const summaryRows: Array<[string, string]> = [
    ['Requester', pdfSafe(request.requesterName || '-')],
    ['Beneficiary', pdfSafe(request.beneficiaryName || '-')],
    ['Title / Category', pdfSafe(request.title || request.requestCategory || '-')],
    ['Description', pdfSafe(request.description || '-')],
    ['Department', pdfSafe(request.department || '-')],
    ['Location', pdfSafe(request.location || '-')],
    ['Payment site', pdfSafe(request.paymentSiteName || request.companyCode || '-')],
    ['Project', pdfSafe(request.projectCode || '-')],
  ];
  let rowY = y - 18;
  for (const [label, value] of summaryRows) {
    cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
    cmds.push(textAt(margin + 12, rowY, 8, label.toUpperCase()));
    cmds.push(`${slate[0]} ${slate[1]} ${slate[2]} rg`);
    cmds.push(textAt(margin + 120, rowY, 9, value.slice(0, 70)));
    rowY -= 16;
  }
  cmds.push('0 0 0 rg');

  // Amounts panel
  y = y - 176;
  cmds.push(textAt(margin, y, 11, 'AMOUNTS', 'F2'));
  y -= 10;
  cmds.push(rect(margin, y - 78, contentW, 78, panel, border));
  const amountRows: Array<[string, string]> = [
    ['Gross', moneyAscii(request.grossAmount, request.currencyCode)],
    ['VAT', moneyAscii(request.vatAmount, request.currencyCode)],
    ['WHT', moneyAscii(request.whtAmount, request.currencyCode)],
    ['Retention', moneyAscii(request.retentionAmount, request.currencyCode)],
    ['Net payable', moneyAscii(request.netAmount, request.currencyCode)],
  ];
  amountRows.forEach(([label, value], index) => {
    const col = index < 3 ? 0 : 1;
    const row = index < 3 ? index : index - 3;
    const ax = margin + 14 + col * (contentW / 2);
    const ay = y - 20 - row * 18;
    cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
    cmds.push(textAt(ax, ay, 8, label.toUpperCase()));
    cmds.push(`${slate[0]} ${slate[1]} ${slate[2]} rg`);
    cmds.push(textAt(ax + 90, ay, 10, value, index === 4 ? 'F2' : 'F1'));
  });
  cmds.push('0 0 0 rg');

  // Workflow
  y = y - 104;
  cmds.push(textAt(margin, y, 11, 'APPROVAL WORKFLOW', 'F2'));
  y -= 10;
  const workflowLabel = stages.length
    ? stages.map((stage, index) => `${index + 1}. ${pdfSafe(stage)}`).join('  ->  ')
    : '-';
  cmds.push(rect(margin, y - 46, contentW, 46, [1, 1, 1], border));
  cmds.push(textAt(margin + 12, y - 18, 9, workflowLabel.slice(0, 95)));
  cmds.push(`${muted[0]} ${muted[1]} ${muted[2]} rg`);
  cmds.push(textAt(margin + 12, y - 34, 8, `Path: ${pdfSafe(request.payload?.pathType) || '-'}   |   Matrix: ${pdfSafe(request.payload?.matrixRuleName) || '-'}`));
  cmds.push('0 0 0 rg');

  // Action history
  y = y - 72;
  cmds.push(textAt(margin, y, 11, 'ACTION HISTORY', 'F2'));
  y -= 8;
  cmds.push(rect(margin, 70, contentW, y - 70, [1, 1, 1], border));
  cmds.push(rect(margin, y - 18, contentW, 18, panel, border));
  cmds.push(textAt(margin + 10, y - 12, 8, 'WHEN'));
  cmds.push(textAt(margin + 120, y - 12, 8, 'ACTION'));
  cmds.push(textAt(margin + 200, y - 12, 8, 'STAGE'));
  cmds.push(textAt(margin + 320, y - 12, 8, 'ACTOR'));
  let histY = y - 34;
  const history = filterDocumentPaymentActions(actions).slice(0, 10);
  if (!history.length) {
    cmds.push(textAt(margin + 10, histY, 9, 'No workflow actions recorded.'));
  } else {
    for (const action of history) {
      if (histY < 86) break;
      cmds.push(textAt(margin + 10, histY, 8, fmtDate(action.createdAt).slice(0, 18)));
      cmds.push(textAt(margin + 120, histY, 8, pdfSafe(action.actionType).slice(0, 14)));
      cmds.push(textAt(margin + 200, histY, 8, pdfSafe(action.stage || '-').slice(0, 20)));
      cmds.push(textAt(margin + 320, histY, 8, pdfSafe(action.actorName).slice(0, 28)));
      histY -= 14;
      cmds.push(line(margin + 8, histY + 10, pageW - margin - 8, histY + 10));
    }
  }

  // Footer
  cmds.push(rect(0, 0, pageW, 52, brandBlue));
  cmds.push('1 1 1 rg');
  cmds.push(textAt(margin, 28, 8, `Generated ${fmtDate(new Date().toISOString())}  |  System-generated from DLE Connect Finance Intelligence`));
  cmds.push(textAt(margin, 14, 8, 'Confidential - for authorised Dorman Long finance use only'));
  cmds.push('0 0 0 rg');

  // Logo image draw command (object 6)
  if (logo) {
    const maxW = 118;
    const maxH = 34;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const drawW = logo.width * scale;
    const drawH = logo.height * scale;
    const logoX = margin;
    const logoY = pageH - 28 - drawH;
    cmds.unshift(`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /Im1 Do Q`);
  }

  const stream = cmds.join('\n');

  // Build PDF with binary-safe logo embedding
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
    // Keep object numbers stable for Helvetica-Bold at 7 when logo missing: insert empty placeholder 6.
    pushObject('6 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 0 >>\nstream\n\nendstream\nendobj\n');
  }
  pushObject('7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  const body = Buffer.concat(chunks);
  const xrefStart = body.length;
  const objectCount = 8;
  let xref = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.concat([body, Buffer.from(xref, 'utf8')]);
};

/** Sync wrapper kept for callers that previously expected a Buffer immediately. */
export const buildPaymentRequestDocumentPdfSync = (
  request: PaymentRequestRow,
  actions: PaymentRequestActionRow[] = [],
): Buffer => {
  // Fallback ASCII document if async path is unavailable to the caller.
  const lines = [
    pdfSafe(COMPANY.name),
    ...COMPANY.addressLines.map(pdfSafe),
    '',
    'PAYMENT DOCUMENT',
    `Request No: ${pdfSafe(request.requestNumber)}`,
    `Payment Type: ${pdfSafe(request.paymentType)}`,
    `Status: ${pdfSafe(request.status)}`,
    `Net: ${moneyAscii(request.netAmount, request.currencyCode)}`,
    '',
    `Generated: ${fmtDate(new Date().toISOString())}`,
  ];
  const content = ['BT', '/F1 10 Tf', '50 800 Td', '12 TL', ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
};
