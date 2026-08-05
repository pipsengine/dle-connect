'use client';

import type { ReactNode } from 'react';
import type { PaymentRequestActionRow, PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';

const money = (amount: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(amount || 0);

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

type Props = {
  request: PaymentRequestRow;
  actions?: PaymentRequestActionRow[];
  footer?: ReactNode;
};

export default function PaymentRequestDetailPanel({ request, actions = [], footer }: Props) {
  const supportingDocs = (request.attachments || []).filter((file) => file.kind !== 'payment-evidence');
  const paymentEvidence = (request.attachments || []).filter((file) => file.kind === 'payment-evidence');

  const fields: Array<[string, string]> = [
    ['Request #', request.requestNumber],
    ['Type', request.paymentType],
    ['Status', request.status],
    ['Stage', request.currentStage || '—'],
    ['Beneficiary', request.beneficiaryName || '—'],
    ['Bank', request.beneficiaryBankSummary || '—'],
    ['Net amount', money(request.netAmount, request.currencyCode)],
    ['Site', request.paymentSiteName || request.paymentSiteCode || '—'],
    ['Expense code', request.expenseCode || '—'],
    ['Department', request.department || '—'],
    ['Cost centre', request.costCentre || '—'],
    ['Project', request.projectCode || '—'],
    ['Requester', request.requesterName || '—'],
    ['Invoice #', request.invoiceNumber || '—'],
    ['PO / GRN', [request.purchaseOrderNo, request.grnNo].filter(Boolean).join(' / ') || '—'],
    ['Payment evidence', paymentEvidence[0]?.originalName || request.paymentReference || '—'],
    ['Paid at', fmtDate(request.paidAt)],
    ['Sage ref', request.sageReference || '—'],
    ['Posting', request.postingStatus || 'NotReady'],
    ['Posted', request.postedAt ? `${fmtDate(request.postedAt)} · ${request.postedBy || '—'}` : '—'],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{request.title || request.requestNumber}</h3>
        <p className="mt-1 text-sm text-slate-500">{request.purpose || request.description || 'No purpose captured.'}</p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-800 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Payment evidence</h4>
        {paymentEvidence.length ? (
          <ul className="space-y-2">
            {paymentEvidence.map((file) => (
              <li key={file.id || file.fileName} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
                <span className="truncate font-medium text-slate-800">{file.originalName || file.fileName}</span>
                <a
                  className="shrink-0 text-xs font-semibold text-[#008FD5] hover:underline"
                  href={`/api/finance/payment-requests/attachments?requestId=${encodeURIComponent(request.requestId)}&fileName=${encodeURIComponent(file.fileName)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No payment evidence uploaded yet.</p>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Supporting documents</h4>
        {supportingDocs.length ? (
          <ul className="space-y-2">
            {supportingDocs.map((file) => (
              <li key={file.id || file.fileName} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <span className="truncate font-medium text-slate-800">{file.originalName || file.fileName}</span>
                <a
                  className="shrink-0 text-xs font-semibold text-[#008FD5] hover:underline"
                  href={`/api/finance/payment-requests/attachments?requestId=${encodeURIComponent(request.requestId)}&fileName=${encodeURIComponent(file.fileName)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No supporting documents uploaded.</p>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Action history</h4>
        {actions.length ? (
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {actions.map((item) => (
              <li key={item.actionId} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">{item.actionType} · {item.stage || '—'}</div>
                <div>{item.actorName} · {fmtDate(item.createdAt)}</div>
                {item.comment || item.reason ? <div className="mt-1 text-slate-500">{item.comment || item.reason}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No actions logged yet.</p>
        )}
      </section>

      {footer ? <div className="border-t border-slate-100 pt-3">{footer}</div> : null}
    </div>
  );
}
