'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Inbox,
  Plus,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import type { EmployeePaymentDashboard } from '@/lib/finance-intelligence/payment-requests-service';

type Props = {
  dashboard: EmployeePaymentDashboard;
  employeeName?: string;
};

const NAME_HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'engr', 'eng', 'chief',
  'alhaji', 'alhaja', 'hajia', 'mallam', 'pastor', 'rev', 'reverend', 'hon', 'honourable',
  'barr', 'barrister', 'arc', 'architect', 'pharm', 'sir', 'dame', 'lady',
]);

const greetingGivenName = (fullName?: string) => {
  const parts = String(fullName || '')
    .trim()
    .split(/[\s,]+/)
    .map((part) => part.replace(/\.+$/g, ''))
    .filter(Boolean);
  while (parts.length && NAME_HONORIFICS.has(parts[0].toLowerCase())) {
    parts.shift();
  }
  return parts[0] || '';
};

const money = (amount: number, currency = 'NGN') =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function EmployeePaymentsDashboardClient({ dashboard, employeeName }: Props) {
  const givenName = greetingGivenName(employeeName);
  const greeting = givenName ? `Welcome, ${givenName}` : 'My Payments';

  const kpis = [
    { label: 'My requests', value: String(dashboard.summary.myRequests), detail: 'All statuses', icon: FileText, wrap: 'bg-slate-100', color: 'text-slate-600', href: '/finance/approvals/my-requests' },
    { label: 'Pending approval', value: String(dashboard.summary.pendingApproval), detail: 'Awaiting decision', icon: Clock3, wrap: 'bg-blue-50', color: 'text-[#008FD5]', href: '/finance/approvals/my-requests?tab=pending' },
    { label: 'Returned', value: String(dashboard.summary.returned), detail: 'Needs your update', icon: RotateCcw, wrap: 'bg-violet-50', color: 'text-violet-600', href: '/finance/approvals/my-requests?tab=returned' },
    { label: 'Awaiting my approval', value: String(dashboard.summary.awaitingMyApproval), detail: 'In your inbox', icon: Inbox, wrap: 'bg-amber-50', color: 'text-amber-600', href: '/finance/approvals/inbox' },
    { label: 'Paid this month', value: String(dashboard.summary.paidThisMonth), detail: 'Completed', icon: CheckCircle2, wrap: 'bg-emerald-50', color: 'text-emerald-600', href: '/finance/approvals/my-requests?tab=paid' },
    { label: 'Outstanding advances', value: String(dashboard.summary.outstandingAdvances), detail: dashboard.eligibility?.blocked ? 'New advance blocked' : 'Retirement open', icon: Wallet, wrap: 'bg-rose-50', color: 'text-rose-600', href: '/finance/approvals/my-requests?tab=retirement' },
  ];

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#008FD5]">Employee payments</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900">{greeting}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">
          Raise cash advances and supplier payment requests. Your approval dashboard shows only items waiting for you.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/finance/approvals/cash-advances"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> New cash advance
          </Link>
          <Link
            href="/finance/approvals/my-requests"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"
          >
            My requests
          </Link>
          <Link
            href="/finance/approvals/inbox"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"
          >
            <Inbox className="h-4 w-4" /> Approval inbox
            {dashboard.summary.awaitingMyApproval > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                {dashboard.summary.awaitingMyApproval}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      {dashboard.eligibility?.blocked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Cash advance blocked</p>
              <p className="mt-1">{dashboard.eligibility.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-[#008FD5] hover:bg-[#EAF6FF] hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${card.wrap}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Awaiting my approval</h2>
            <Link href="/finance/approvals/inbox" className="inline-flex items-center gap-1 text-xs font-semibold text-[#008FD5]">
              Open inbox <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {dashboard.awaitingMyApproval.length ? dashboard.awaitingMyApproval.map((row) => (
              <Link
                key={row.requestId}
                href={`/finance/approvals/request/${encodeURIComponent(row.requestId)}`}
                className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 hover:bg-[#EAF6FF]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{row.requestNumber}</p>
                  <p className="truncate text-xs text-slate-500">{row.title || row.beneficiaryName}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-800">{money(row.netAmount, row.currencyCode)}</p>
                  <p className="text-[11px] text-slate-500">{row.currentStage || row.status}</p>
                </div>
              </Link>
            )) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing waiting for your approval.</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">My recent requests</h2>
            <Link href="/finance/approvals/my-requests" className="inline-flex items-center gap-1 text-xs font-semibold text-[#008FD5]">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {dashboard.recentMine.length ? dashboard.recentMine.map((row) => (
              <Link
                key={row.requestId}
                href={`/finance/approvals/request/${encodeURIComponent(row.requestId)}`}
                className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 hover:bg-[#EAF6FF]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{row.requestNumber}</p>
                  <p className="truncate text-xs text-slate-500">
                    {/cash advance/i.test(row.paymentType) ? (
                      <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cash advance</span>
                    ) : row.paymentType}
                    {' · '}
                    {fmtDate(row.submittedAt || row.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-800">{money(row.netAmount, row.currencyCode)}</p>
                  <p className="text-[11px] text-slate-500">{row.status}</p>
                </div>
              </Link>
            )) : (
              <p className="px-4 py-8 text-center text-sm text-slate-500">You have not raised a payment request yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
