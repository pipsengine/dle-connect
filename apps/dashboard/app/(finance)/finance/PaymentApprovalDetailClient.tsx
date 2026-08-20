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
  FileUp,
  Loader2,
  MessageSquare,
  Paperclip,
  XCircle,
} from 'lucide-react';
import type { PaymentRequestActionRow, PaymentRequestAttachment, PaymentRequestCommentRow, PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';
import {
  isExpenseNoPoPayment,
  supplierInvoiceCategoryLabel,
} from '@/lib/finance-intelligence/payment-invoice-category';
import { filterDocumentPaymentActions } from '@/lib/finance-intelligence/payment-action-visibility';
import PaymentAttachmentLinks from '@/app/(finance)/finance/PaymentAttachmentLinks';
import PaymentRequestCommentsThread from '@/app/(finance)/finance/PaymentRequestCommentsThread';

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
  if (/pending|submitted|review|treasury|awaiting retirement/i.test(status)) return 'bg-amber-50 text-amber-800';
  if (/rejected|cancelled/i.test(status)) return 'bg-rose-50 text-rose-700';
  if (/returned|clarification/i.test(status)) return 'bg-orange-50 text-orange-800';
  return 'bg-slate-100 text-slate-700';
};

const compactStage = (value?: string | null) => String(value || '').trim().toLowerCase();

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    const comma = result.indexOf(',');
    resolve(comma >= 0 ? result.slice(comma + 1) : result);
  };
  reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
  reader.readAsDataURL(file);
});

type DetailPayload = {
  request: PaymentRequestRow;
  actions: PaymentRequestActionRow[];
  comments?: PaymentRequestCommentRow[];
  viewer?: {
    actorCode?: string;
    canApprove?: boolean;
    canComment?: boolean;
    canEditReturned?: boolean;
    isRequesterOnly?: boolean;
    canDownloadPdf?: boolean;
    canSubmitRetirement?: boolean;
  };
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
  const [retirementNote, setRetirementNote] = useState('');
  const [retirementFiles, setRetirementFiles] = useState<File[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setActionHint(new URLSearchParams(window.location.search).get('action') || '');
    if (window.location.hash === '#payment-comments') setChatOpen(true);
  }, [pathname]);

  const load = async (opts?: { soft?: boolean }) => {
    if (!requestId) {
      setError('Payment request id is missing.');
      setLoading(false);
      return;
    }
    if (!opts?.soft) {
      setLoading(true);
      setError('');
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/finance/payment-requests?requestId=${encodeURIComponent(requestId)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const json = await response.json();
      if (!response.ok || json.status !== 'success') {
        throw new Error(json.error || 'Unable to load payment request.');
      }
      setDetail(json.data as DetailPayload);
      setError('');
    } catch (err) {
      const message = err instanceof Error
        ? (err.name === 'AbortError' ? 'Timed out loading this payment request. Please refresh and try again.' : err.message)
        : 'Unable to load payment request.';
      // After approve, keep the successful detail on screen — never flash a hard access error.
      if (opts?.soft) {
        setMessage((prev) => prev || message);
        return;
      }
      setError(message);
      setDetail(null);
    } finally {
      window.clearTimeout(timer);
      if (!opts?.soft) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [requestId]);

  useEffect(() => {
    if (!actionHint || !detail?.request || !detail.viewer?.canApprove) return;
    if (actionHint === 'approve' || actionHint === 'reject') {
      window.setTimeout(() => {
        document.getElementById('payment-detail-actions')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [actionHint, detail?.request?.requestId, detail?.viewer?.canApprove]);

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
      // Apply transition payload immediately so a post-approve reload cannot blank the page.
      if (json.data?.request) {
        setDetail((prev) => ({
          request: json.data.request as PaymentRequestRow,
          actions: (json.data.actions as PaymentRequestActionRow[]) || prev?.actions || [],
          comments: prev?.comments || [],
          viewer: {
            ...(prev?.viewer || {}),
            canApprove: false,
            canComment: false,
            canDownloadPdf: /ready for treasury|approved|payment scheduled|payment processing|paid|awaiting retirement|retirement submitted|treasury verification|retired|completed|closed|posted/i.test(
              String(json.data.request.status || ''),
            ),
          },
        }));
      }
      setMessage(json.data?.message || 'Payment request updated.');
      setReason('');
      if (actionHint) router.replace(pathname);
      await load({ soft: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update payment request.');
    } finally {
      setBusy(false);
    }
  };

  const submitRetirement = async () => {
    if (!detail?.request) return;
    if (retirementNote.trim().length < 10) {
      setMessage('Provide a retirement note of at least 10 characters.');
      return;
    }
    if (!retirementFiles.length) {
      setMessage('Upload at least one retirement receipt / supporting document.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const retirementEvidenceUploads = await Promise.all(retirementFiles.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      })));
      const response = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'transition',
          requestId: detail.request.requestId,
          transition: 'submit-retirement',
          comment: retirementNote.trim(),
          reason: retirementNote.trim(),
          retirementEvidenceUploads,
        }),
      });
      const json = await response.json().catch(() => ({ status: 'error', error: 'Unable to submit retirement.' }));
      if (!response.ok || json.status !== 'success') {
        throw new Error(json.error || `Unable to submit retirement (${response.status}).`);
      }
      setMessage(json.data?.message || 'Retirement submitted for Treasury verification.');
      setRetirementNote('');
      setRetirementFiles([]);
      if (json.data?.request) {
        setDetail((prev) => ({
          request: json.data.request as PaymentRequestRow,
          actions: (json.data.actions as PaymentRequestActionRow[]) || prev?.actions || [],
          comments: prev?.comments || [],
          viewer: {
            ...(prev?.viewer || {}),
            canSubmitRetirement: false,
          },
        }));
      }
      await load({ soft: true });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to submit retirement.');
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
  const visibleActions = filterDocumentPaymentActions(detail.actions || []);
  const stages = Array.isArray(request.payload?.stages)
    ? (request.payload.stages as string[]).map((item) => String(item))
    : [];
  const pending = /pending|submitted|finance review/i.test(request.status);
  const returned = /^returned$/i.test(request.status);
  const isDraft = /^draft$/i.test(request.status);
  const canApprove = Boolean(detail.viewer?.canApprove) && pending;
  const canEditOwn = Boolean(detail.viewer?.canEditReturned) && (returned || isDraft);
  const canDownloadPdf = Boolean(detail.viewer?.canDownloadPdf);
  const canSubmitRetirement = Boolean(detail.viewer?.canSubmitRetirement);
  const retirementNoteExisting = String(request.retirement?.note || '');
  const retirementEvidence = (request.attachments || []).filter((file) => file.kind === 'retirement-evidence');
  const supportingDocs = (request.attachments || []).filter((file) => file.kind !== 'payment-evidence' && file.kind !== 'retirement-evidence');
  const showActionBar = canApprove;
  const showRetirementBar = canSubmitRetirement;
  const returnReason = [...(detail.actions || [])]
    .find((action) => /return/i.test(action.actionType))?.reason
    || [...(detail.actions || [])].find((action) => /return/i.test(action.actionType))?.comment
    || '';

  return (
    <div className={`space-y-4 ${showActionBar || showRetirementBar ? 'pb-36' : 'pb-6'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/finance/approvals/payments" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#008FD5]">
          <ArrowLeft className="h-4 w-4" /> Payment requests
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {canEditOwn ? (
            <Link
              href={`/finance/approvals/payments?edit=${encodeURIComponent(request.requestId)}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#007bb8]"
            >
              <FileUp className="h-3.5 w-3.5" /> {isDraft ? 'Edit & submit' : 'Edit & resend'}
            </Link>
          ) : null}
          {canDownloadPdf ? (
            <a
              href={`/api/finance/payment-requests/pdf?requestId=${encodeURIComponent(request.requestId)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#008FD5]/40 hover:text-[#008FD5]"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Comment
            {(detail.comments || []).length ? (
              <span className="rounded-full bg-sky-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {(detail.comments || []).length}
              </span>
            ) : null}
          </button>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(request.status)}`}>
            {request.status}
          </span>
        </div>
      </div>

      {isDraft ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            <div>
              <p className="font-semibold">Draft payment request</p>
              <p className="mt-1 text-sky-900">
                This request has not been submitted yet. Edit the details and submit it for approval when ready.
              </p>
              {canEditOwn ? (
                <Link
                  href={`/finance/approvals/payments?edit=${encodeURIComponent(request.requestId)}`}
                  className="mt-2 inline-flex text-xs font-semibold text-[#008FD5] hover:underline"
                >
                  Open editor to update and submit
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {returned ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
            <div>
              <p className="font-semibold">Returned for correction</p>
              <p className="mt-1 text-violet-900">
                {returnReason || 'An approver returned this request. Update the details and resend for approval.'}
              </p>
              {canEditOwn ? (
                <Link
                  href={`/finance/approvals/payments?edit=${encodeURIComponent(request.requestId)}`}
                  className="mt-2 inline-flex text-xs font-semibold text-[#008FD5] hover:underline"
                >
                  Open editor to correct and resend
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
              ['Category', supplierInvoiceCategoryLabel(request) || '—'],
              ...(isExpenseNoPoPayment(request) && request.payload?.expenseNature
                ? [['Expense nature', String(request.payload.expenseNature)] as [string, string]]
                : []),
              ['PO', isExpenseNoPoPayment(request) ? 'N/A (expense · no PO)' : (request.purchaseOrderNo || '—')],
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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment evidence</p>
            <div className="mt-2">
              <PaymentAttachmentLinks
                requestId={request.requestId}
                files={((request.attachments as PaymentRequestAttachment[]) || []).filter((file) => file.kind === 'payment-evidence')}
                emptyLabel="No payment evidence uploaded yet."
                tone="border-emerald-200 bg-emerald-50"
              />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Retirement evidence</p>
            <div className="mt-2">
              <PaymentAttachmentLinks
                requestId={request.requestId}
                files={retirementEvidence}
                emptyLabel="No retirement receipts uploaded yet."
                tone="border-amber-200 bg-amber-50"
              />
            </div>
            {retirementNoteExisting ? (
              <div className="mt-2 rounded-xl bg-amber-50/70 p-3 text-xs text-slate-700">
                <p className="font-semibold uppercase tracking-wide text-amber-800">Retirement note</p>
                <p className="mt-1 whitespace-pre-wrap">{retirementNoteExisting}</p>
              </div>
            ) : null}
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting documents</p>
            <div className="mt-2">
              <PaymentAttachmentLinks
                requestId={request.requestId}
                files={supportingDocs}
                emptyLabel="No supporting documents attached."
                tone="border-slate-200 bg-slate-50"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Financial context</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
            {[
              ['Path', String(request.payload?.pathType || '—')],
              ['Matrix rule', String(request.payload?.matrixRuleName || '—')],
              ['Amount (NGN routing)', fmtMoney(Number(request.payload?.amountNgn || request.netAmount), 'NGN')],
              ['FX rate', request.payload?.fxRate
                ? `${request.payload.fxRate}${request.payload?.fxRateDate ? ` · ${request.payload.fxRateDate}` : ''}`
                : '—'],
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
          {visibleActions.length ? visibleActions.map((action) => (
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

      {showActionBar ? (
      <div id="payment-detail-actions" className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:left-[270px]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason required for reject / return"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE] sm:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {message ? <p className="mr-2 self-center text-xs text-slate-600">{message}</p> : null}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Comment
              {(detail.comments || []).length ? (
                <span className="rounded-full bg-sky-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {(detail.comments || []).length}
                </span>
              ) : null}
            </button>
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
      ) : showRetirementBar ? (
      <div id="payment-detail-actions" className="fixed inset-x-0 bottom-0 z-20 border-t border-amber-200 bg-amber-50/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:left-[270px]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-900">Submit cash advance retirement</p>
            {message ? <p className="text-xs text-slate-700">{message}</p> : null}
          </div>
          <textarea
            value={retirementNote}
            onChange={(e) => setRetirementNote(e.target.value)}
            rows={2}
            placeholder="Describe how the advance was used (required, min 10 characters)"
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900">
              <FileUp className="h-4 w-4" />
              <span>{retirementFiles.length ? `${retirementFiles.length} file(s) selected` : 'Upload retirement receipts *'}</span>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*"
                className="hidden"
                onChange={(e) => setRetirementFiles(Array.from(e.target.files || []))}
              />
            </label>
            <button
              type="button"
              disabled={busy || !retirementFiles.length || retirementNote.trim().length < 10}
              onClick={() => void submitRetirement()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Submit retirement
            </button>
          </div>
        </div>
      </div>
      ) : message ? (
        <p className="text-xs text-slate-600">{message}</p>
      ) : null}

      <PaymentRequestCommentsThread
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        requestId={request.requestId}
        requestNumber={request.requestNumber}
        comments={detail.comments || []}
        canComment={Boolean(detail.viewer?.canComment)}
        actorCode={detail.viewer?.actorCode}
        onCommentsChange={(comments) => setDetail((prev) => (prev ? { ...prev, comments } : prev))}
      />
    </div>
  );
}
