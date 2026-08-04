'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Loader2,
  Paperclip,
  XCircle,
} from 'lucide-react';
import type { PaymentRequestActionRow, PaymentRequestAttachment, PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });

const fmtMoney = (value: number, currency = 'NGN') => {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${money.format(value || 0).replace('₦', '')}`;
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

const statusTone = (status: string) => {
  if (/approved|paid|completed|retired|closed/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/pending|submitted|review|treasury/i.test(status)) return 'bg-amber-50 text-amber-800';
  if (/rejected|cancelled/i.test(status)) return 'bg-rose-50 text-rose-700';
  if (/returned|clarification/i.test(status)) return 'bg-orange-50 text-orange-800';
  return 'bg-slate-100 text-slate-700';
};

const compactStage = (value?: string | null) => String(value || '').trim().toLowerCase();

type DetailPayload = {
  request: PaymentRequestRow;
  actions: PaymentRequestActionRow[];
};

export default function PaymentApprovalDetailClient() {
  const pathname = usePathname();
  const router = useRouter();
  const requestId = useMemo(() => {
    const match = pathname.match(/\/finance\/approvals\/request\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  }, [pathname]);

  const [actionHint, setActionHint] = useState('');
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setActionHint(new URLSearchParams(window.location.search).get('action') || '');
  }, [pathname]);

  const load = async () => {
    if (!requestId) {
      setError('Payment request id is missing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/finance/payment-requests?requestId=${encodeURIComponent(requestId)}`, {
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok || json.status !== 'success') {
        throw new Error(json.error || 'Unable to load payment request.');
      }
      setDetail(json.data as DetailPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment request.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [requestId]);

  useEffect(() => {
    if (!actionHint || !detail?.request) return;
    if (actionHint === 'approve' || actionHint === 'reject') {
      window.setTimeout(() => {
        document.getElementById('payment-detail-actions')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [actionHint, detail?.request?.requestId]);

  const transition = async (action: 'approve' | 'reject' | 'return' | 'clarify') => {
    if (!detail?.request) return;
    const needsReason = action !== 'approve';
    if (needsReason && !reason.trim()) {
      setMessage('Please provide a reason for this action.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'transition',
          requestId: detail.request.requestId,
          transition: action,
          reason: reason.trim() || undefined,
          comment: reason.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || json.status !== 'success') {
        throw new Error(json.error || 'Unable to update payment request.');
      }
      setMessage(json.data?.message || 'Payment request updated.');
      setReason('');
      if (actionHint) router.replace(pathname);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update payment request.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#008FD5]" />
      </div>
    );
  }

  if (error || !detail?.request) {
    return (
      <div className="space-y-4">
        <Link href="/finance/approvals/payments" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#008FD5]">
          <ArrowLeft className="h-4 w-4" /> Back to payment requests
        </Link>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <p>{error || 'Payment request not found.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const request = detail.request;
  const stages = Array.isArray(request.payload?.stages)
    ? (request.payload.stages as string[]).map((item) => String(item))
    : [];
  const pending = /pending|submitted|finance review/i.test(request.status);

  return (
    <div className="space-y-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/finance/approvals/payments" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#008FD5]">
          <ArrowLeft className="h-4 w-4" /> Payment requests
        </Link>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(request.status)}`}>
          {request.status}
        </span>
      </div>

      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#008FD5]">{request.paymentType}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{request.requestNumber}</h1>
        <p className="mt-1 text-sm text-slate-500">{request.title}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5">Stage: <strong>{request.currentStage || '—'}</strong></span>
          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5">Approver: <strong>{request.currentApproverName || '—'}</strong></span>
          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5">Submitted: <strong>{fmtDate(request.submittedAt || request.createdAt)}</strong></span>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Request summary</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            {[
              ['Requester', request.requesterName],
              ['Beneficiary', request.beneficiaryName],
              ['Gross amount', fmtMoney(request.grossAmount, request.currencyCode)],
              ['VAT', fmtMoney(request.vatAmount, request.currencyCode)],
              ['WHT', fmtMoney(request.whtAmount, request.currencyCode)],
              ['Retention', fmtMoney(request.retentionAmount, request.currencyCode)],
              ['Net amount', fmtMoney(request.netAmount, request.currencyCode)],
              ['Payment site', request.paymentSiteName || request.paymentSiteCode || '—'],
              ['Department', request.department || '—'],
              ['Location', request.location || '—'],
              ['Project', request.projectCode || '—'],
              ['Invoice', request.invoiceNumber || '—'],
              ['PO', request.purchaseOrderNo || '—'],
            ].map(([label, value]) => (
              <li key={label} className="flex justify-between gap-3 border-b border-slate-50 py-1.5">
                <span>{label}</span>
                <span className="text-right font-medium text-slate-800">{value}</span>
              </li>
            ))}
          </ul>
          {request.businessJustification ? (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business justification</p>
              <p className="mt-1 whitespace-pre-wrap">{request.businessJustification}</p>
            </div>
          ) : null}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting documents</p>
            {Array.isArray(request.attachments) && request.attachments.length ? (
              <ul className="mt-2 space-y-1.5">
                {(request.attachments as PaymentRequestAttachment[]).map((file) => (
                  <li key={file.id || file.fileName}>
                    <a
                      href={`/api/finance/payment-requests/attachments?requestId=${encodeURIComponent(request.requestId)}&fileName=${encodeURIComponent(file.fileName)}`}
                      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-[#008FD5] hover:bg-[#EAF6FF]"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{file.originalName || file.fileName}</span>
                      <Download className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
                <FileText className="h-3.5 w-3.5" /> No supporting documents attached.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Financial context</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            {[
              ['Path', String(request.payload?.pathType || '—')],
              ['Matrix rule', String(request.payload?.matrixRuleName || '—')],
              ['Amount (NGN routing)', fmtMoney(Number(request.payload?.amountNgn || request.netAmount), 'NGN')],
              ['FX rate', String(request.payload?.fxRate || 1)],
              ['Priority', request.priority || 'Normal'],
              ['Risk', request.riskLevel || 'Normal'],
            ].map(([label, value]) => (
              <li key={label} className="flex justify-between gap-3 border-b border-slate-50 py-1.5">
                <span>{label}</span>
                <span className="text-right font-medium text-slate-800">{value}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Workflow</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(stages.length ? stages : [request.currentStage || 'Pending']).map((stage, index) => {
              const current = stage.toLowerCase() === compactStage(request.currentStage);
              const done = stages.findIndex((item) => item.toLowerCase() === compactStage(request.currentStage)) > index
                || /approved|paid|treasury/i.test(request.status);
              return (
                <span
                  key={`${stage}-${index}`}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    current ? 'border-[#008FD5] bg-[#EAF6FF] text-[#008FD5]'
                      : done ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold">
                    {index + 1}
                  </span>
                  {stage}
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Stages are driven by Approval Limits (Non-project / Project) using the day’s FX rate for NGN band routing.
          </p>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Action history</h2>
        <div className="mt-3 space-y-2">
          {detail.actions.length ? detail.actions.map((action) => (
            <div key={action.actionId} className="flex items-start gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
              <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {action.actionType} · {action.stage || '—'}
                </p>
                <p className="text-xs text-slate-500">
                  {action.actorName} · {fmtDate(action.createdAt)}
                </p>
                {action.comment || action.reason ? (
                  <p className="mt-1 text-xs text-slate-600">{action.comment || action.reason}</p>
                ) : null}
              </div>
            </div>
          )) : (
            <p className="text-sm text-slate-500">No workflow actions recorded yet.</p>
          )}
        </div>
      </section>

      <div id="payment-detail-actions" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:left-[270px]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason required for reject / return / clarification"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE] sm:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {message ? <p className="mr-2 self-center text-xs text-slate-600">{message}</p> : null}
            <button
              type="button"
              disabled={busy || !pending}
              onClick={() => void transition('return')}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              Return
            </button>
            <button
              type="button"
              disabled={busy || !pending}
              onClick={() => void transition('reject')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" /> Reject
            </button>
            <button
              type="button"
              disabled={busy || !pending}
              onClick={() => void transition('approve')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
