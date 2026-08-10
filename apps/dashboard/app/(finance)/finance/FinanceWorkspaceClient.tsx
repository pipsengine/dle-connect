'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollTable } from '@/components/ui/responsive';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileBarChart,
  Filter,
  FolderOpen,
  History,
  Inbox,
  Info,
  MessageSquare,
  MessageSquarePlus,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  UserPlus,
  Wallet,
  Workflow,
  XCircle,
} from 'lucide-react';
import type { FinancePageMeta } from '@/lib/finance-intelligence/nav';
import type {
  FinanceApprovalCentreSnapshot,
  FinanceCommandCentreSnapshot,
} from '@/lib/finance-intelligence/store';
import type { PaymentRequestsWorkspace, CashAdvanceControlsWorkspace, TreasuryWorkspace, FinancePostingWorkspace, EmployeePaymentDashboard } from '@/lib/finance-intelligence/payment-requests-service';
import type { ApprovalMatrixWorkspace } from '@/lib/finance-intelligence/approval-matrix-service';
import type { ApprovalDelegationWorkspace } from '@/lib/finance-intelligence/approval-delegation-types';
import { FinanceBreadcrumbs } from './finance-portal-shell';
import CfoDashboardClient from './CfoDashboardClient';
import PaymentRequestsClient from './PaymentRequestsClient';
import ApprovalMatrixClient from './ApprovalMatrixClient';
import ApprovalLimitsClient from './ApprovalLimitsClient';
import DelegationRulesClient from './DelegationRulesClient';
import CashAdvanceControlsClient from './CashAdvanceControlsClient';
import TreasuryOperationsClient from './TreasuryOperationsClient';
import FinancePostingClient from './FinancePostingClient';
import PaymentApprovalDetailClient from './PaymentApprovalDetailClient';
import EmployeePaymentsDashboardClient from './EmployeePaymentsDashboardClient';

type Props = {
  page: FinancePageMeta;
  commandCentre?: FinanceCommandCentreSnapshot | null;
  approvalCentre?: FinanceApprovalCentreSnapshot | null;
  employeePaymentDashboard?: EmployeePaymentDashboard | null;
  employeeName?: string;
  paymentSelfService?: boolean;
  paymentRequests?: PaymentRequestsWorkspace | null;
  paymentListMode?: 'default' | 'inbox' | 'mine' | 'approved';
  initialPaymentType?: 'All' | 'Cash Advance Payment' | 'Supplier Invoice Payment' | 'Expense Payment';
  approvalMatrix?: ApprovalMatrixWorkspace | null;
  approvalDelegations?: ApprovalDelegationWorkspace | null;
  cashAdvanceControls?: CashAdvanceControlsWorkspace | null;
  treasuryWorkspace?: TreasuryWorkspace | null;
  financePostingWorkspace?: FinancePostingWorkspace | null;
  childLinks?: Array<{ href: string; title: string; description?: string }>;
};

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

const fmtMoney = (value: number) => money.format(value);
const fmtDateTime = (value?: string | null) => {
  if (!value) return 'Not refreshed';
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

const SUGGESTED_AI_QUESTIONS = [
  'Why did expenses increase this month?',
  'Which projects have declining margins?',
  'What is our expected 90-day cash position?',
  'Which customers have the highest overdue balances?',
  'Compare actual performance against budget.',
  'Prepare the monthly financial commentary.',
];

const APPROVAL_COLUMNS = [
  'Request No.',
  'Payment Type',
  'Beneficiary',
  'Description',
  'Amount',
  'Currency',
  'Department',
  'Project',
  'Submitted',
  'Current Stage',
  'Approver',
  'Age',
  'Risk',
  'Status',
] as const;

const kpiToneClass: Record<string, string> = {
  blue: 'text-[#008FD5]',
  teal: 'text-teal-600',
  orange: 'text-orange-500',
  purple: 'text-violet-600',
  red: 'text-rose-600',
  green: 'text-emerald-600',
  rose: 'text-rose-700',
};

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
      {label}
      <span className="ml-1 text-slate-400">· awaiting Sage X3 data</span>
    </div>
  );
}

function FilterBar({ period, currency, basis }: { period: string; currency: string; basis: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <Filter className="h-4 w-4 text-slate-400" />
      {[
        { label: 'Company', value: 'Dorman Long Engineering' },
        { label: 'Business unit', value: 'All' },
        { label: 'Reporting period', value: period },
        { label: 'Currency', value: currency },
        { label: 'Basis', value: basis },
      ].map((item) => (
        <label key={item.label} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
          <span className="font-medium text-slate-400">{item.label}</span>
          <select className="bg-transparent text-slate-800 outline-none" defaultValue={item.value}>
            <option>{item.value}</option>
          </select>
        </label>
      ))}
    </div>
  );
}

function CommandCentreView({ snapshot }: { snapshot: FinanceCommandCentreSnapshot | null }) {
  return <CfoDashboardClient snapshot={snapshot} />;
}

function CategoryCards({
  title,
  description,
  cards,
}: {
  title: string;
  description: string;
  cards: Array<{ title: string; href: string; items: string[]; status?: string }>;
}) {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-[#008FD5]/40 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 group-hover:text-[#008FD5]">{card.title}</h2>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#008FD5]" />
            </div>
            <p className="mt-2 text-xs text-slate-500">{card.items.length} available reports</p>
            <p className="mt-1 text-[11px] text-slate-400">Last generated: — · Status: {card.status || 'Ready'} · Pending sign-off: 0</p>
            <ul className="mt-3 space-y-1">
              {card.items.slice(0, 5).map((item) => (
                <li key={item} className="truncate text-xs text-slate-600">• {item}</li>
              ))}
              {card.items.length > 5 ? <li className="text-xs text-slate-400">+ {card.items.length - 5} more</li> : null}
            </ul>
            <span className="mt-3 inline-flex text-xs font-semibold text-[#008FD5]">Open section</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AnalysisHub() {
  const workspaces = [
    { title: 'Performance', href: '/finance/analysis/performance', detail: 'Horizontal, vertical, trend, variance, ratios' },
    { title: 'Profitability', href: '/finance/analysis/profitability', detail: 'Customer, supplier, project, CVP' },
    { title: 'Working Capital', href: '/finance/analysis/working-capital', detail: 'DSO, DPO, inventory, CCC' },
    { title: 'Financial Ratios', href: '/finance/analysis/ratios', detail: 'Liquidity, profitability, leverage' },
    { title: 'Financial Modelling', href: '/finance/analysis/modelling', detail: 'Sensitivity, scenarios, what-if' },
    { title: 'Investment Analysis', href: '/finance/analysis/investment', detail: 'ROI, NPV, IRR, payback' },
  ];
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Analysis Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Six analytical workspaces with filters, charts, commentary and Sage X3 drill-down.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaces.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:border-[#008FD5]/40">
            <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
            <p className="mt-4 text-xs font-semibold text-[#008FD5]">Open workspace →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AnalysisWorkspace({ page }: { page: FinancePageMeta }) {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{page.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{page.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Export', 'Save analysis', 'Share analysis', 'Ask AI about result', 'Drill-down to Sage X3'].map((action) => (
            <button key={action} type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {action}
            </button>
          ))}
        </div>
      </header>
      <FilterBar period={new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })} currency="NGN" basis="Actual" />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Charts and visualisations"><EmptyChart label={page.title} /></Panel>
        <Panel title="Supporting values">
          <ul className="space-y-2 text-sm text-slate-600">
            {(page.features || ['Primary metric', 'Comparative period', 'Variance', 'Contribution']).map((item) => (
              <li key={item} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>{item}</span>
                <span className="font-semibold tabular-nums text-slate-400">—</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Commentary">
        <p className="text-sm text-slate-500">Add management commentary or ask Finance AI to draft an evidence-backed narrative for this analysis.</p>
      </Panel>
      {page.features?.length ? (
        <Panel title="Related analyses">
          <div className="flex flex-wrap gap-2">
            {page.features.map((feature) => (
              <span key={feature} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{feature}</span>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function AiCopilotView({ page }: { page: FinancePageMeta }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);

  const ask = (value: string) => {
    const q = value.trim();
    if (!q) return;
    setMessages((current) => [
      ...current,
      { role: 'user', text: q },
      {
        role: 'assistant',
        text: 'Finance AI is ready. Connect Sage X3 read-only integration to analyse live balances, journals and ageing. Human review is required before use in formal reporting.',
      },
    ]);
    setQuestion('');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
      <aside className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <button type="button" onClick={() => setMessages([])} className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#008FD5] px-3 py-2 text-sm font-semibold text-white">
          <MessageSquarePlus className="h-4 w-4" /> New analysis
        </button>
        {['Saved conversations', 'Recent questions', 'Shared analyses', 'Board commentary drafts', 'Management report drafts'].map((item) => (
          <button key={item} type="button" className="mb-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50">
            {item}
          </button>
        ))}
      </aside>

      <section className="flex min-h-[640px] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h1 className="text-xl font-semibold text-slate-900">{page.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{page.description}</p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {!messages.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTED_AI_QUESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => ask(item)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm text-slate-700 hover:border-[#008FD5]/40 hover:bg-[#EAF6FF]"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-xl px-3 py-2.5 text-sm ${message.role === 'user' ? 'ml-8 bg-[#EAF6FF] text-slate-800' : 'mr-8 bg-slate-50 text-slate-700'}`}
              >
                {message.text}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') ask(question);
              }}
              placeholder="Ask a finance question…"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-[#008FD5] focus:ring-2"
            />
            <button type="button" onClick={() => ask(question)} className="rounded-xl bg-[#008FD5] px-3.5 py-2.5 text-sm font-semibold text-white">
              Ask
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
            Source: Sage X3 Enterprise · Period analysed: {new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })} · Last data refresh: — · Confidence: Pending · Assumptions: View assumptions · Supporting calculations: View details.
            <strong className="mt-1 block">Human review required before use in formal reporting.</strong>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Evidence panel</h2>
        <dl className="mt-3 space-y-2 text-xs text-slate-600">
          {[
            ['Source system', 'Sage X3 Enterprise'],
            ['Sage company', 'DLE'],
            ['Tables / views', 'GL / AR / AP (mapped)'],
            ['Reporting period', new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })],
            ['Filters applied', 'Actual · NGN'],
            ['Assumptions', 'View assumptions'],
            ['Data freshness', 'Awaiting refresh'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-2.5 py-2">
              <dt className="font-medium text-slate-400">{label}</dt>
              <dd className="mt-0.5 text-slate-700">{value}</dd>
            </div>
          ))}
        </dl>
        <Link href="/finance/data-explorer/transactions" className="mt-3 inline-flex text-xs font-semibold text-[#008FD5]">
          Open drill-down links →
        </Link>
      </aside>
    </div>
  );
}

function ApprovalsDashboard({ snapshot }: { snapshot?: FinanceApprovalCentreSnapshot | null }) {
  const kpis = snapshot?.kpis || [
    { id: 'pending-mine', label: 'Pending My Approval', primary: '0', secondary: '₦0.00', tone: 'blue' as const },
    { id: 'pending-value', label: 'Total Pending Value', primary: '₦0.00', secondary: 'Across all stages', tone: 'teal' as const },
    { id: 'overdue', label: 'Overdue Approvals', primary: '0', secondary: '₦0.00', tone: 'orange' as const },
    { id: 'returned', label: 'Returned Requests', primary: '0', secondary: '₦0.00', tone: 'purple' as const },
    { id: 'high-value', label: 'High-Value Requests', primary: '0', secondary: 'Above approval limit', tone: 'red' as const },
    { id: 'awaiting-release', label: 'Payments Awaiting Final Release', primary: '0', secondary: '₦0.00', tone: 'blue' as const },
    { id: 'approved-today', label: 'Payments Approved Today', primary: '0', secondary: '₦0.00', tone: 'green' as const },
    { id: 'rejected-month', label: 'Rejected This Month', primary: '0', secondary: '₦0.00', tone: 'rose' as const },
  ];
  const kpiIcons: Record<string, { icon: typeof Inbox; wrap: string; color: string }> = {
    'pending-mine': { icon: Inbox, wrap: 'bg-blue-50', color: 'text-[#008FD5]' },
    'pending-value': { icon: Wallet, wrap: 'bg-teal-50', color: 'text-teal-600' },
    overdue: { icon: Clock3, wrap: 'bg-orange-50', color: 'text-orange-500' },
    returned: { icon: RotateCcw, wrap: 'bg-violet-50', color: 'text-violet-600' },
    'high-value': { icon: AlertTriangle, wrap: 'bg-rose-50', color: 'text-rose-600' },
    'awaiting-release': { icon: Send, wrap: 'bg-blue-50', color: 'text-[#008FD5]' },
    'approved-today': { icon: CheckCircle2, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    'rejected-month': { icon: XCircle, wrap: 'bg-rose-50', color: 'text-rose-700' },
  };

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-[28px]">Payment Approval Centre</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">
          Summary of payment approval activity. Action pending items in My Approval Inbox. Approved payments live under Payment Requests.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const meta = kpiIcons[kpi.id] || { icon: Inbox, wrap: 'bg-slate-50', color: 'text-slate-500' };
          const Icon = meta.icon;
          return (
            <article key={kpi.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{kpi.label}</p>
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${meta.wrap}`}>
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                </span>
              </div>
              <p className={`mt-2 text-[28px] font-semibold leading-none tabular-nums ${kpiToneClass[kpi.tone] || 'text-slate-900'}`}>
                {kpi.primary}
              </p>
              <p className="mt-2 text-xs font-medium text-slate-500">{kpi.secondary}</p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: '/finance/approvals/inbox', label: 'My Approval Inbox', detail: 'Action pending approvals', icon: BadgeCheck },
          { href: '/finance/approvals/payments', label: 'Payment Requests', detail: 'Approved & in-progress payments', icon: Send },
          { href: '/finance/approvals/my-requests', label: 'My Requests', detail: 'Requests you raised', icon: Inbox },
          { href: '/finance/approvals/treasury', label: 'Treasury Operations', detail: 'Pay and verify retirements', icon: Wallet },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#008FD5]/40 hover:bg-[#F8FBFF]"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF6FF] text-[#008FD5]">
              <item.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const INBOX_COLUMNS = [
  'Request Number',
  'Payment Type',
  'Beneficiary',
  'Description',
  'Amount',
  'Currency',
  'Department',
  'Project',
  'Submitted Date',
  'Current Stage',
  'Age',
  'Risk Flags',
  'Status',
] as const;

type InboxFilterId = 'pending' | 'value' | 'overdue' | 'returned' | 'approved' | 'rejected';

function ApprovalQueue({ page }: { page: FinancePageMeta }) {
  const isInbox = page.href === '/finance/approvals/inbox';
  const [activeFilter, setActiveFilter] = useState<InboxFilterId>('pending');
  const [query, setQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const filters: Array<{
    id: InboxFilterId;
    label: string;
    value: string;
    icon: typeof Inbox;
    iconWrap: string;
    iconColor: string;
  }> = [
    { id: 'pending', label: 'Pending', value: '0', icon: Inbox, iconWrap: 'bg-blue-50', iconColor: 'text-[#008FD5]' },
    { id: 'value', label: 'Total Value', value: '₦0.00', icon: Wallet, iconWrap: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { id: 'overdue', label: 'Overdue', value: '0', icon: Clock3, iconWrap: 'bg-orange-50', iconColor: 'text-orange-500' },
    { id: 'returned', label: 'Returned', value: '0', icon: RotateCcw, iconWrap: 'bg-violet-50', iconColor: 'text-violet-600' },
    { id: 'approved', label: 'Approved Today', value: '0', icon: CheckCircle2, iconWrap: 'bg-teal-50', iconColor: 'text-teal-600' },
    { id: 'rejected', label: 'Rejected This Month', value: '0', icon: XCircle, iconWrap: 'bg-rose-50', iconColor: 'text-rose-600' },
  ];

  const primaryActions = [
    { id: 'return', label: 'Return for Correction', icon: RotateCcw, className: 'border-[#BFDBFE] text-[#1D4ED8] hover:bg-blue-50' },
    { id: 'clarify', label: 'Request Clarification', icon: MessageSquare, className: 'border-[#BAE6FD] text-[#0369A1] hover:bg-sky-50' },
    { id: 'delegate', label: 'Delegate', icon: UserPlus, className: 'border-[#DDD6FE] text-[#6D28D9] hover:bg-violet-50' },
    { id: 'reject', label: 'Reject', icon: XCircle, className: 'border-[#FECDD3] text-[#BE123C] hover:bg-rose-50' },
    { id: 'approve', label: 'Approve', icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700' },
  ] as const;

  const secondaryActions = [
    { id: 'comment', label: 'Add Comment', icon: MessageSquare },
    { id: 'download', label: 'Download Documents', icon: Download },
    { id: 'sage', label: 'View Sage Source', icon: ExternalLink },
    { id: 'history', label: 'View Approval History', icon: History },
    { id: 'escalate', label: 'Escalate', icon: ArrowUpRight },
  ] as const;

  const columns = isInbox ? INBOX_COLUMNS : APPROVAL_COLUMNS;

  return (
    <div className="space-y-4 pb-2">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">{page.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{page.description || 'Requests awaiting your decision.'}</p>
      </header>

      {isInbox ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {filters.map((filter) => {
            const active = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`rounded-2xl border bg-white p-3.5 text-left shadow-sm transition ${
                  active
                    ? 'border-[#008FD5] ring-1 ring-[#008FD5]/30'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${filter.iconWrap}`}>
                    <filter.icon className={`h-4 w-4 ${filter.iconColor}`} />
                  </span>
                </div>
                <p className={`mt-3 text-2xl font-semibold tabular-nums ${active ? 'text-[#008FD5]' : 'text-slate-900'}`}>
                  {filter.value}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">{filter.label}</p>
                {active ? <span className="mt-2 block h-0.5 w-8 rounded-full bg-[#008FD5]" /> : <span className="mt-2 block h-0.5 w-8" />}
              </button>
            );
          })}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Approval Queue</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
            </button>
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search requests..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none ring-[#008FD5] placeholder:text-slate-400 focus:bg-white focus:ring-2 sm:w-56"
              />
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Queue settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <ScrollTable minWidth={960}><table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      {column}
                      {column === 'Submitted Date' ? <ChevronDown className="h-3 w-3 text-slate-400" /> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={columns.length} className="px-3 py-16 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center">
                    <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <FolderOpen className="h-8 w-8" />
                      <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-400 shadow-sm">
                        0
                      </span>
                    </span>
                    <p className="mt-4 text-base font-semibold text-slate-800">
                      {isInbox ? 'No requests in your inbox' : 'No records in this queue'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {isInbox
                        ? 'When Sage X3 or source systems assign payment approvals to you, they will appear here for decision.'
                        : 'Requests will appear here when matching workflows are submitted.'}
                    </p>
                    {isInbox ? (
                      <Link
                        href="/finance/approvals/payments"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#007bb8]"
                      >
                        View Other Requests
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            </tbody>
          </table></ScrollTable>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
          {selectedAction ? (
            <span className="text-xs font-medium text-slate-500">Selected: {selectedAction}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {primaryActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => setSelectedAction(action.label)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${action.className}`}
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          ))}
          {secondaryActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => setSelectedAction(action.label)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          ))}
        </div>
        <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          Rejection, return, delegation and escalation require a mandatory reason. High-value approvals require authentication confirmation.
        </p>
      </section>
    </div>
  );
}

function SectionDashboard({ page, childLinks }: { page: FinancePageMeta; childLinks: Props['childLinks'] }) {
  const links = childLinks?.length
    ? childLinks
    : (page.features || []).map((feature) => ({
        href: '#',
        title: feature,
        description: `Open ${feature}`,
      }));

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{page.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{page.description}</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => (
          <Link
            key={`${link.href}-${link.title}`}
            href={link.href === '#' ? page.href : link.href}
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-[#008FD5]/40"
          >
            <h2 className="text-sm font-semibold text-slate-900">{link.title}</h2>
            <p className="mt-1 text-xs text-slate-500">{link.description || 'Open workspace'}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function GenericWorkspace({ page }: { page: FinancePageMeta }) {
  const Icon =
    page.kind === 'explorer' ? Database
      : page.kind === 'audit' ? AlertTriangle
        : page.kind === 'distribution' ? Send
          : page.kind === 'configuration' ? CheckCircle2
            : FileBarChart;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-[#EAF6FF] p-2.5 text-[#008FD5]">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{page.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{page.description}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white">Open workspace</button>
          <Link href="/finance/configuration/sage-x3" className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700">Configure Sage X3</Link>
          <Link href="/finance/ai-copilot" className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700">Ask Finance AI</Link>
        </div>
      </header>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Workspace status">
          <p className="text-sm text-slate-600">Ready for Sage X3 read-only data. No live balances loaded yet.</p>
        </Panel>
        <Panel title="Controls">
          <ul className="space-y-1 text-sm text-slate-600">
            <li>• Company / entity filters</li>
            <li>• Reporting period</li>
            <li>• Actual / Budget / Forecast</li>
            <li>• Export and distribution</li>
          </ul>
        </Panel>
        <Panel title="Governance">
          <ul className="space-y-1 text-sm text-slate-600">
            <li>• Access logged</li>
            <li>• Drill-down audited</li>
            <li>• Human review for formal use</li>
          </ul>
        </Panel>
      </div>
      {page.features?.length ? (
        <Panel title="Included capabilities">
          <div className="flex flex-wrap gap-2">
            {page.features.map((feature) => (
              <span key={feature} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{feature}</span>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export default function FinanceWorkspaceClient({
  page,
  commandCentre,
  approvalCentre,
  employeePaymentDashboard,
  employeeName,
  paymentSelfService,
  paymentRequests,
  paymentListMode = 'default',
  initialPaymentType = 'All',
  approvalMatrix,
  approvalDelegations,
  cashAdvanceControls,
  treasuryWorkspace,
  financePostingWorkspace,
  childLinks,
}: Props) {
  const reportingCards = useMemo(
    () => [
      {
        title: 'Financial Statements',
        href: '/finance/reporting/statements',
        items: ['Statement of Financial Position', 'Profit or Loss', 'Cash Flows', 'Changes in Equity', 'Trial Balance', 'General Ledger'],
      },
      {
        title: 'Management Reporting',
        href: '/finance/reporting/management',
        items: ['Revenue', 'Expenses', 'EBITDA', 'Working Capital', 'Departmental Performance', 'Project Profitability'],
      },
      {
        title: 'Exposure Reporting',
        href: '/finance/reporting/exposure',
        items: ['Receivables', 'Payables', 'Customer Concentration', 'Supplier Concentration', 'Foreign Exchange', 'Tax Exposure'],
      },
      {
        title: 'Reporting Packs',
        href: '/finance/reporting/packs',
        items: ['Monthly Management Accounts', 'Executive Pack', 'Board Pack', 'Project Pack'],
      },
    ],
    [],
  );

  return (
    <div className={`mx-auto ${page.kind === 'command-centre' ? 'max-w-[1600px]' : 'max-w-[1400px]'}`}>
      {page.kind === 'command-centre' ? null : <FinanceBreadcrumbs items={page.breadcrumbs} />}
      {page.kind === 'command-centre' ? <CommandCentreView snapshot={commandCentre || null} /> : null}
      {page.kind === 'reporting-hub' ? (
        <CategoryCards
          title="Reporting Dashboard"
          description="Open a reporting category to access statements, management packs, exposure analysis and assembled packs."
          cards={reportingCards}
        />
      ) : null}
      {page.kind === 'analysis-hub' ? <AnalysisHub /> : null}
      {page.kind === 'analysis-workspace' ? <AnalysisWorkspace page={page} /> : null}
      {page.kind === 'ai-copilot' ? <AiCopilotView page={page} /> : null}
      {page.kind === 'approvals-dashboard' && employeePaymentDashboard
        ? <EmployeePaymentsDashboardClient dashboard={employeePaymentDashboard} employeeName={employeeName} />
        : null}
      {page.kind === 'approvals-dashboard' && !employeePaymentDashboard
        ? <ApprovalsDashboard snapshot={approvalCentre} />
        : null}
      {page.kind === 'payment-requests' && paymentRequests
        ? (
          <PaymentRequestsClient
            initialWorkspace={paymentRequests}
            selfServiceMode={paymentSelfService}
            listMode={paymentListMode}
            initialPaymentType={initialPaymentType}
          />
        )
        : null}
      {page.kind === 'cash-advance-controls' && cashAdvanceControls ? <CashAdvanceControlsClient initialWorkspace={cashAdvanceControls} /> : null}
      {page.kind === 'treasury-ops' && treasuryWorkspace ? <TreasuryOperationsClient initialWorkspace={treasuryWorkspace} /> : null}
      {page.kind === 'finance-posting' && financePostingWorkspace ? <FinancePostingClient initialWorkspace={financePostingWorkspace} /> : null}
      {page.kind === 'approval-matrix' && approvalMatrix ? <ApprovalMatrixClient initialWorkspace={approvalMatrix} /> : null}
      {page.kind === 'approval-limits' && approvalMatrix ? <ApprovalLimitsClient initialWorkspace={approvalMatrix} /> : null}
      {page.kind === 'delegation-rules' && approvalDelegations ? <DelegationRulesClient initialWorkspace={approvalDelegations} /> : null}
      {page.kind === 'approval-detail' ? <PaymentApprovalDetailClient /> : null}
      {page.kind === 'section-dashboard' ? <SectionDashboard page={page} childLinks={childLinks} /> : null}
      {!['command-centre', 'reporting-hub', 'analysis-hub', 'analysis-workspace', 'ai-copilot', 'approvals-dashboard', 'payment-requests', 'cash-advance-controls', 'treasury-ops', 'finance-posting', 'approval-matrix', 'approval-limits', 'delegation-rules', 'approval-queue', 'approval-detail', 'section-dashboard'].includes(page.kind)
        ? <GenericWorkspace page={page} />
        : null}
    </div>
  );
}
