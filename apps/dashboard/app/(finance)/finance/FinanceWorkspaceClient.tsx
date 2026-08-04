'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Database,
  FileBarChart,
  Filter,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { FinancePageMeta } from '@/lib/finance-intelligence/nav';
import type { FinanceCommandCentreSnapshot } from '@/lib/finance-intelligence/store';
import { FinanceBreadcrumbs } from './finance-portal-shell';

type Props = {
  page: FinancePageMeta;
  commandCentre?: FinanceCommandCentreSnapshot | null;
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
  'Request number',
  'Payment type',
  'Beneficiary',
  'Description',
  'Amount',
  'Currency',
  'Department',
  'Project',
  'Cost centre',
  'Requester',
  'Submitted date',
  'Current stage',
  'Current approver',
  'Age',
  'Risk flags',
  'Status',
] as const;

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

function CommandCentreView({ snapshot }: { snapshot: FinanceCommandCentreSnapshot }) {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#008FD5]">Overview</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Finance Command Centre</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Financial reporting, analytics, AI-assisted insights and payment approvals integrated with Sage X3 Enterprise.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/finance/configuration/sage-x3" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCcw className="h-4 w-4" /> Refresh Sage Data
          </Link>
          <Link href="/finance/reporting/builder/report-builder" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FileBarChart className="h-4 w-4" /> Generate Report
          </Link>
          <Link href="/finance/ai-copilot" className="inline-flex items-center gap-2 rounded-xl bg-[#008FD5] px-3 py-2 text-sm font-semibold text-white hover:bg-[#007bb8]">
            <Sparkles className="h-4 w-4" /> Ask Finance AI
          </Link>
          <Link href="/finance/approvals/inbox" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <BadgeCheck className="h-4 w-4" /> View Approval Inbox
          </Link>
        </div>
      </header>

      <FilterBar period={snapshot.filters.period} currency={snapshot.filters.currency} basis={snapshot.filters.basis} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.kpis.map((kpi) => (
          <article key={kpi.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
              {kpi.unit === 'currency' ? fmtMoney(kpi.value) : kpi.value}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">Sage X3 · {snapshot.filters.basis}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Revenue and expense trend"><EmptyChart label="Revenue / expense trend" /></Panel>
        <Panel title="Cash-flow outlook"><EmptyChart label="Cash-flow outlook" /></Panel>
        <Panel title="Budget versus actual"><EmptyChart label="Budget vs actual" /></Panel>
        <Panel title="Receivable ageing"><EmptyChart label="Receivable ageing" /></Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Panel title="Pending approvals" action={<Link href="/finance/approvals" className="text-xs font-semibold text-[#008FD5]">Open</Link>}>
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{snapshot.pendingApprovals}</p>
          <p className="mt-1 text-xs text-slate-500">{snapshot.overdueApprovals} overdue</p>
        </Panel>
        <Panel title="Project profitability"><EmptyChart label="Project margins" /></Panel>
        <Panel title="Financial exceptions" action={<Link href="/finance/audit/exceptions" className="text-xs font-semibold text-[#008FD5]">Register</Link>}>
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{snapshot.exceptions}</p>
          <p className="mt-1 text-xs text-slate-500">Open governance exceptions</p>
        </Panel>
        <Panel title="AI-generated finance summary" action={<Link href="/finance/ai-copilot" className="text-xs font-semibold text-[#008FD5]">Ask AI</Link>}>
          <p className="text-sm text-slate-600">
            Connect Sage X3 to generate period commentary with confidence scoring and source evidence.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Panel title="Recent reports" action={<Link href="/finance/reporting" className="text-xs font-semibold text-[#008FD5]">All</Link>}>
          <p className="text-sm text-slate-500">No reports generated yet.</p>
        </Panel>
        <Panel title="Scheduled reports" action={<Link href="/finance/distribution/scheduled" className="text-xs font-semibold text-[#008FD5]">Schedule</Link>}>
          <p className="text-sm text-slate-500">{snapshot.badges.scheduledReports} scheduled</p>
        </Panel>
        <Panel title="Data integration health">
          <p className="text-sm font-semibold text-slate-800">{snapshot.integrationStatus}</p>
          <p className="mt-1 text-xs text-slate-500">Last refresh: {fmtDateTime(snapshot.lastRefreshAt)}</p>
        </Panel>
        <Panel title="Period reporting status">
          <p className="text-sm text-slate-600">{snapshot.filters.period} · {snapshot.filters.basis}</p>
          <p className="mt-1 text-xs text-slate-500">Source: {snapshot.source}</p>
        </Panel>
      </div>
    </div>
  );
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

function ApprovalsDashboard() {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Payment Approval Centre</h1>
        <p className="mt-1 text-sm text-slate-500">
          Receive approval requests from Sage X3 or source systems. DLE Connect owns workflow, evidence and audit — not GL posting.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          'Pending my approval',
          'Total pending value',
          'Overdue approvals',
          'Returned requests',
          'High-value requests',
          'Payments awaiting final release',
          'Payments approved today',
          'Rejected this month',
        ].map((label) => (
          <article key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">0</p>
          </article>
        ))}
      </div>
      <Panel
        title="Approval queue"
        action={<Link href="/finance/approvals/inbox" className="text-xs font-semibold text-[#008FD5]">Open inbox</Link>}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                {APPROVAL_COLUMNS.map((column) => (
                  <th key={column} className="whitespace-nowrap px-2 py-2 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={APPROVAL_COLUMNS.length} className="px-2 py-10 text-center text-slate-500">
                  No approval requests yet. Requests will appear here when Sage X3 or source systems submit payment workflows.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { href: '/finance/approvals/inbox', label: 'My Approval Inbox', icon: BadgeCheck },
          { href: '/finance/approvals/payments', label: 'Payment Requests', icon: Send },
          { href: '/finance/approvals/batches', label: 'Payment Batches', icon: Workflow },
          { href: '/finance/approvals/other', label: 'Other Finance Requests', icon: FileBarChart },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#008FD5]/40">
            <item.icon className="h-5 w-5 text-[#008FD5]" />
            <span className="text-sm font-semibold text-slate-800">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ApprovalQueue({ page }: { page: FinancePageMeta }) {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{page.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{page.description}</p>
      </header>
      <Panel title="Queue">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                {APPROVAL_COLUMNS.map((column) => (
                  <th key={column} className="whitespace-nowrap px-2 py-2 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={APPROVAL_COLUMNS.length} className="px-2 py-10 text-center text-slate-500">
                  No records in this queue.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="sticky bottom-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {['Return for Correction', 'Request Clarification', 'Delegate', 'Reject', 'Approve'].map((action) => (
            <button
              key={action}
              type="button"
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${action === 'Approve' ? 'bg-emerald-600 text-white' : action === 'Reject' ? 'bg-rose-600 text-white' : 'border border-slate-200 text-slate-700'}`}
            >
              {action}
            </button>
          ))}
          {['Add Comment', 'Download Documents', 'View Sage Source', 'View Approval History', 'Escalate'].map((action) => (
            <button key={action} type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
              {action}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Rejection, return, delegation and escalation require a mandatory reason. High-value approvals require authentication confirmation.</p>
      </div>
    </div>
  );
}

function ApprovalDetail() {
  return (
    <div className="space-y-4 pb-24">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Approval Detail</h1>
        <p className="mt-1 text-sm text-slate-500">Request summary, financial context, supporting records and configurable workflow stages.</p>
      </header>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Request summary">
          <ul className="space-y-1.5 text-sm text-slate-600">
            {['Request number', 'Title', 'Request type', 'Beneficiary', 'Bank details summary', 'Amount', 'Currency', 'Description', 'Payment due date', 'Payment priority', 'Sage X3 reference', 'Source document number'].map((item) => (
              <li key={item} className="flex justify-between gap-3 border-b border-slate-50 py-1.5"><span>{item}</span><span className="text-slate-400">—</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Financial context">
          <ul className="space-y-1.5 text-sm text-slate-600">
            {['Available budget', 'Budget consumption', 'Previous payments to beneficiary', 'Outstanding supplier balance', 'Purchase-order amount', 'Invoice amount', 'Retention amount', 'Tax deduction', 'Net payable amount', 'Cash-flow impact', 'Project margin impact'].map((item) => (
              <li key={item} className="flex justify-between gap-3 border-b border-slate-50 py-1.5"><span>{item}</span><span className="text-slate-400">—</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Supporting records">
          <ul className="space-y-1.5 text-sm text-slate-600">
            {['Supplier invoice', 'Purchase order', 'Goods received note', 'Contract', 'Payment certificate', 'Tax calculation', 'Bank details', 'Approval memo', 'Other attachments'].map((item) => (
              <li key={item} className="rounded-lg bg-slate-50 px-3 py-2">{item}</li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Workflow">
        <div className="flex flex-wrap gap-2">
          {['Initiator', 'Reviewer', 'Project Manager', 'Department Head', 'Finance', 'Finance Manager', 'CFO', 'Managing Director', 'Payment release'].map((stage, index) => (
            <span key={stage} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{index + 1}</span>
              {stage}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Stages remain configurable by payment type and amount in Finance Configuration → Approval Matrix.</p>
      </Panel>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:left-[270px]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap gap-2">
          {['Return for Correction', 'Request Clarification', 'Delegate', 'Reject', 'Approve'].map((action) => (
            <button key={action} type="button" className={`rounded-xl px-3 py-2 text-xs font-semibold ${action === 'Approve' ? 'bg-emerald-600 text-white' : action === 'Reject' ? 'bg-rose-600 text-white' : 'border border-slate-200 text-slate-700'}`}>
              {action}
            </button>
          ))}
        </div>
      </div>
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

export default function FinanceWorkspaceClient({ page, commandCentre, childLinks }: Props) {
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
    <div className="mx-auto max-w-[1400px]">
      <FinanceBreadcrumbs items={page.breadcrumbs} />
      {page.kind === 'command-centre' && commandCentre ? <CommandCentreView snapshot={commandCentre} /> : null}
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
      {page.kind === 'approvals-dashboard' ? <ApprovalsDashboard /> : null}
      {page.kind === 'approval-queue' ? <ApprovalQueue page={page} /> : null}
      {page.kind === 'approval-detail' ? <ApprovalDetail /> : null}
      {page.kind === 'section-dashboard' ? <SectionDashboard page={page} childLinks={childLinks} /> : null}
      {!['command-centre', 'reporting-hub', 'analysis-hub', 'analysis-workspace', 'ai-copilot', 'approvals-dashboard', 'approval-queue', 'approval-detail', 'section-dashboard'].includes(page.kind)
        ? <GenericWorkspace page={page} />
        : null}
    </div>
  );
}
