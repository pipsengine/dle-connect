'use client';

import Link from 'next/link';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TenderOpportunity } from '@/lib/commercial/tender-types';
import { daysUntil } from '@/lib/commercial/tender-present';
import { formatWhen, money } from './tender-api';

export function Crumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <div className="text-[12px] text-slate-400">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 ? <span className="px-1">›</span> : null}
          {item.href ? <Link href={item.href} className="hover:text-slate-700">{item.label}</Link> : <span className={index === items.length - 1 ? 'font-semibold text-slate-600' : ''}>{item.label}</span>}
        </span>
      ))}
    </div>
  );
}

export function OpportunitySelect({ rows, value, onChange }: { rows: TenderOpportunity[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 max-w-xs rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700" aria-label="Open opportunity">
      {rows.length === 0 ? <option value="">No opportunities</option> : rows.map((row) => <option key={row.id} value={row.id}>{row.referenceNo} · {row.title}</option>)}
    </select>
  );
}

export function RecordHeader({
  icon: Icon,
  title,
  subtitle,
  opportunity,
  status,
  extra,
  actions,
  steps,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  opportunity?: TenderOpportunity | null;
  status?: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode;
  steps: Array<{ label: string; state: 'Completed' | 'In Progress' | 'Pending'; date?: string }>;
}) {
  const days = opportunity ? daysUntil(opportunity.submissionDeadline || opportunity.closingDate) : null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white"><Icon className="h-6 w-6" /></span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-black leading-tight text-slate-950">{title}</h1>
            <p className="text-[13px] text-slate-500">{subtitle}</p>
            <p className="mt-1 text-[12px] text-slate-500">
              {opportunity ? <>{opportunity.title} · Client: <b className="text-slate-700">{opportunity.clientName || '—'}</b> · Ref: <b className="text-slate-700">{opportunity.referenceNo}</b> · Sector: <b className="text-slate-700">{opportunity.category || '—'}</b> · Estimated Value: <b className="text-slate-700">{money(opportunity.estimatedValue, opportunity.currency)}</b></> : 'Open an opportunity to work this record.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status}
          {extra || (opportunity ? (
            <div className="rounded-xl border border-slate-200 px-3 py-1.5">
              <div className="text-[11px] text-slate-400">Submission Deadline</div>
              <div className="text-[13px] font-bold text-slate-800">{formatWhen(opportunity.submissionDeadline || opportunity.closingDate)} {days == null ? null : <span className="font-semibold text-rose-500">{days} days left</span>}</div>
            </div>
          ) : null)}
          {actions}
        </div>
      </div>
      <ol className="mt-5 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        {steps.map((step, index) => (
          <li key={step.label} className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${step.state === 'Pending' ? 'bg-slate-100 text-slate-400' : 'bg-[#2563eb] text-white'}`}>{index + 1}</span>
              {index < steps.length - 1 ? <span className="hidden h-px flex-1 bg-slate-200 xl:block" /> : null}
            </div>
            <div className="mt-1 truncate text-[12px] font-bold text-slate-800">{step.label}</div>
            <div className={`text-[11px] font-semibold ${step.state === 'Completed' ? 'text-emerald-600' : step.state === 'In Progress' ? 'text-blue-600' : 'text-slate-400'}`}>{step.state}</div>
            <div className="text-[10px] text-slate-400">{step.date || ''}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TabBar({ tabs, tab, onTab }: { tabs: readonly string[]; tab: string; onTab: (tab: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 pt-1 shadow-sm">
      {tabs.map((item) => (
        <button key={item} type="button" onClick={() => onTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold ${tab === item ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500'}`}>{item}</button>
      ))}
    </div>
  );
}

export function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ActionsMenu({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white">Actions <ChevronDown className="h-4 w-4" /></button>
      {open ? <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">{children}</div> : null}
    </div>
  );
}

export function stepState(index: number, current: number): 'Completed' | 'In Progress' | 'Pending' {
  if (index < current) return 'Completed';
  if (index === current) return 'In Progress';
  return 'Pending';
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
