'use client';

import { describeDue, formatDate, isOverdue } from '@/lib/corporate-office/front-desk-format';
import type { Correspondence } from '@/lib/corporate-office/front-desk-types';

const statusLabel = (item: Correspondence) => (item.status === 'Closed' ? 'Closed' : isOverdue(item) ? 'Open (Overdue)' : 'Open');

const COLUMNS: { header: string; value: (item: Correspondence) => string }[] = [
  { header: 'Reference', value: (item) => item.referenceNo },
  { header: 'Date Received', value: (item) => item.dateReceived },
  { header: 'Description of Item', value: (item) => item.description },
  { header: 'Type', value: (item) => item.type },
  { header: 'Copies', value: (item) => String(item.copies) },
  { header: 'Sender', value: (item) => item.senderCompany },
  { header: 'Sender Category', value: (item) => item.senderCategory },
  { header: 'Addressed To', value: (item) => item.addressedTo },
  { header: 'Department', value: (item) => item.department },
  { header: 'Location', value: (item) => item.location ?? '' },
  { header: 'Priority', value: (item) => item.priority },
  { header: 'Due Date', value: (item) => item.dueDate ?? '' },
  { header: 'Status', value: statusLabel },
  { header: 'Closed By', value: (item) => item.closedBy ?? '' },
  { header: 'Date Closed', value: (item) => item.dateClosed ?? '' },
  { header: 'Attachments', value: (item) => item.attachments.map((attachment) => attachment.name).join('; ') },
  { header: 'Remarks', value: (item) => item.remarks ?? '' },
];

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function exportCsv(rows: Correspondence[], filename: string) {
  const lines = [COLUMNS.map((column) => column.header), ...rows.map((row) => COLUMNS.map((column) => column.value(row)))];
  const csv = `﻿${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

const esc = (value: string) => value.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export function printRegister(rows: Correspondence[], subtitle: string) {
  const body = rows.map((item) => `<tr>
    <td class="mono">${esc(item.referenceNo)}</td>
    <td class="nowrap">${esc(formatDate(item.dateReceived))}</td>
    <td>${esc(item.description)}${item.priority === 'High' ? ' <b>(HIGH)</b>' : ''}</td>
    <td>${esc(item.senderCompany)}<br><span class="muted">${esc(item.senderCategory)}</span></td>
    <td>${esc(item.addressedTo)}</td>
    <td>${esc(item.department)}</td>
    <td>${esc(item.location || '')}</td>
    <td class="nowrap">${esc(describeDue(item))}</td>
    <td>${esc(statusLabel(item))}</td>
    <td>${esc(item.closedBy ?? '')}${item.dateClosed ? `<br><span class="muted">${esc(formatDate(item.dateClosed))}</span>` : ''}</td>
    <td class="sign"></td>
  </tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Front Desk Correspondence Register</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font: 10px/1.35 Segoe UI, sans-serif; color: #0f172a; }
      h1 { font-size: 16px; margin: 0; }
      .sub { color: #64748b; margin: 2px 0 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 5px; text-align: left; vertical-align: top; }
      th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; }
      .mono { font-family: Consolas, monospace; white-space: nowrap; }
      .nowrap { white-space: nowrap; }
      .muted { color: #64748b; }
      .sign { width: 70px; }
    </style></head><body>
    <h1>Front Desk — Correspondence Register</h1>
    <p class="sub">${esc(subtitle)} · Printed ${esc(formatDate(new Date().toISOString().slice(0, 10)))} · ${rows.length} item${rows.length === 1 ? '' : 's'}</p>
    <table><thead><tr>
      <th>Ref</th><th>Date</th><th>Description of Item</th><th>Sender</th><th>Addressed To</th>
      <th>Dept</th><th>Location</th><th>Deadline</th><th>Status</th><th>Closed By</th><th>Sign</th>
    </tr></thead><tbody>${body}</tbody></table></body></html>`;
  const iframe = Object.assign(document.createElement('iframe'), { style: 'position:fixed;width:0;height:0;border:0;right:0;bottom:0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc || !iframe.contentWindow) return;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  window.setTimeout(() => iframe.remove(), 1000);
}
