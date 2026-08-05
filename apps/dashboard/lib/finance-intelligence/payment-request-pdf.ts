import type { PaymentRequestActionRow, PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';

const compact = (value: unknown) => String(value ?? '').trim();

const money = (value: number, currency = 'NGN') => {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
};

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const escapePdfText = (value: string) =>
  compact(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Minimal single-page PDF (Helvetica) — no external PDF dependency. */
export const buildPaymentRequestDocumentPdf = (
  request: PaymentRequestRow,
  actions: PaymentRequestActionRow[] = [],
): Buffer => {
  const stages = Array.isArray(request.payload?.stages)
    ? (request.payload.stages as unknown[]).map((item) => compact(item)).filter(Boolean)
    : [];

  const lines = [
    'DORMAN LONG ENGINEERING — PAYMENT DOCUMENT',
    'Finance Intelligence & Approvals',
    '',
    `Request No: ${request.requestNumber}`,
    `Payment Type: ${request.paymentType}`,
    `Status: ${request.status}`,
    `Current Stage: ${request.currentStage || '—'}`,
    `Submitted: ${fmtDate(request.submittedAt || request.createdAt)}`,
    '',
    'REQUEST SUMMARY',
    `Requester: ${request.requesterName || '—'}`,
    `Beneficiary: ${request.beneficiaryName || '—'}`,
    `Title / Category: ${request.title || request.requestCategory || '—'}`,
    `Description: ${request.description || '—'}`,
    `Department: ${request.department || '—'}`,
    `Location: ${request.location || '—'}`,
    `Payment Site: ${request.paymentSiteName || request.companyCode || '—'}`,
    `Project: ${request.projectCode || '—'}`,
    '',
    'AMOUNTS',
    `Gross: ${money(request.grossAmount, request.currencyCode)}`,
    `VAT: ${money(request.vatAmount, request.currencyCode)}`,
    `WHT: ${money(request.whtAmount, request.currencyCode)}`,
    `Retention: ${money(request.retentionAmount, request.currencyCode)}`,
    `Net: ${money(request.netAmount, request.currencyCode)}`,
    `Currency: ${request.currencyCode || 'NGN'}`,
    '',
    'APPROVAL WORKFLOW',
    stages.length ? stages.map((stage, index) => `${index + 1}. ${stage}`).join('  →  ') : '—',
    `Matrix rule: ${compact(request.payload?.matrixRuleName) || '—'}`,
    `Path: ${compact(request.payload?.pathType) || '—'}`,
    '',
    'ACTION HISTORY',
    ...(actions.length
      ? actions.slice(0, 12).map((action) =>
        `${fmtDate(action.createdAt)} | ${action.actionType} | ${action.stage || '—'} | ${action.actorName}${action.reason || action.comment ? ` | ${action.reason || action.comment}` : ''}`)
      : ['No workflow actions recorded.']),
    '',
    `Generated: ${fmtDate(new Date().toISOString())}`,
    'This document is system-generated from DLE Connect Finance Intelligence.',
  ];

  const contentLines: string[] = ['BT', '/F1 11 Tf', '50 800 Td', '14 TL'];
  lines.forEach((line, index) => {
    const text = escapePdfText(line).slice(0, 110);
    if (index === 0) {
      contentLines.push('/F1 14 Tf', `(${text}) Tj`, '/F1 10 Tf', 'T*');
    } else {
      contentLines.push(`(${text}) Tj`, 'T*');
    }
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');
  objects.push(`4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
};
