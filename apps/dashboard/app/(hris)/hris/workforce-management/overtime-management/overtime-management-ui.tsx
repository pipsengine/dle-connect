'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderOpen,
  MoreHorizontal,
  TimerReset,
} from 'lucide-react';
import { PremiumKpiCard, StatusPill, type SetupTone } from '../../payroll/employee-salary-setup/salary-setup-ui';

export type OvertimeDisplayStatus =
  | 'Pending Supervisor'
  | 'Pending HR'
  | 'Payroll Ready'
  | 'Approved'
  | 'Returned'
  | 'Rejected'
  | 'Blocked'
  | 'Closed'
  | 'Draft'
  | 'Submitted';

const statusStyles: Record<string, { label: string; tone: SetupTone }> = {
  Draft: { label: 'Draft', tone: 'slate' },
  Submitted: { label: 'Pending Supervisor', tone: 'green' },
  'Supervisor Approved': { label: 'Pending HR', tone: 'amber' },
  'HR Approved': { label: 'Payroll Ready', tone: 'blue' },
  'Payroll Ready': { label: 'Payroll Ready', tone: 'blue' },
  'Payroll Posted': { label: 'Approved', tone: 'green' },
  Returned: { label: 'Returned', tone: 'red' },
  Rejected: { label: 'Rejected', tone: 'red' },
  Blocked: { label: 'Blocked', tone: 'red' },
  'MD Approved': { label: 'Approved', tone: 'green' },
  'Project Manager Approved': { label: 'Pending GM Operations', tone: 'violet' },
  'GM Operations Approved': { label: 'Pending HR', tone: 'amber' },
  Cancelled: { label: 'Closed', tone: 'slate' },
};

export const overtimeStatusDisplay = (status: string) =>
  statusStyles[status] || { label: status, tone: 'slate' as SetupTone };

export function OvertimeStatusBadge({ status }: { status: string }) {
  const { label, tone } = overtimeStatusDisplay(status);
  return <StatusPill label={label} tone={tone} />;
}

export function OvertimeWorkflowProgress({
  workflow,
}: {
  workflow: Array<{ stage: string; status: string; owner?: string; actedAt?: string | null }>;
}) {
  const stages = workflow.length
    ? workflow
    : [
        { stage: 'Submitted', status: 'Pending' },
        { stage: 'Supervisor', status: 'Pending' },
        { stage: 'HR', status: 'Pending' },
        { stage: 'Payroll', status: 'Pending' },
        { stage: 'Posted', status: 'Pending' },
      ];

  const nodeColor = (status: string) => {
    if (status === 'Completed') return 'bg-[#10B981] border-[#A7F3D0] text-white';
    if (status === 'Rejected' || status === 'Blocked') return 'bg-[#EF4444] border-[#FECACA] text-white';
    if (status === 'Returned') return 'bg-[#F59E0B] border-[#FCD34D] text-white';
    if (status === 'Pending') return 'bg-[#2563EB] border-[#93C5FD] text-white';
    return 'bg-[#CBD5E1] border-[#E5E7EB] text-[#64748B]';
  };

  return (
    <div className="flex min-w-[180px] items-center gap-0">
      {stages.map((step, index) => (
        <div key={`${step.stage}-${index}`} className="flex items-center">
          <span
            title={`${step.stage}${step.owner ? ` — ${step.owner}` : ''}`}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-bold ${nodeColor(step.status)}`}
          >
            {step.status === 'Completed' ? '✓' : index + 1}
          </span>
          {index < stages.length - 1 ? <span className="mx-0.5 h-0.5 w-3 bg-[#E5E7EB]" /> : null}
        </div>
      ))}
    </div>
  );
}

export function OvertimeFormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">{hint}</p> : null}
    </label>
  );
}

export function OvertimePanel({
  title,
  subtitle,
  children,
  actions,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)] ${className}`}>
      <div className="flex flex-col gap-2 border-b border-[#EDF2F7] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs font-medium text-[#64748B]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function OvertimeKpiStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    subtitle: string;
    icon: ComponentType<{ className?: string }>;
    tone: SetupTone;
    trend?: number | null;
  }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <PremiumKpiCard key={item.label} {...item} />
      ))}
    </div>
  );
}

export function OvertimeEmptyState({
  title = 'No overtime requests found.',
  description = 'Try adjusting your filters or create a new overtime request.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F5F3FF] text-[#7C3AED]">
        <FolderOpen className="h-7 w-7" />
      </span>
      <p className="mt-4 text-base font-semibold text-[#0F172A]">{title}</p>
      <p className="mt-2 max-w-md text-sm font-medium text-[#64748B]">{description}</p>
    </div>
  );
}

export function OvertimeQuickLinks() {
  const links = [
    { href: '#', label: 'Overtime Policy', icon: BookOpen },
    { href: '#', label: 'Approval Workflow', icon: ClipboardList },
    { href: '/hris/workforce-management/reports-and-analytics', label: 'Reporting Dashboard', icon: BarChart3 },
    { href: '/hris/time-and-logs/timesheet-entry', label: 'Timesheet Entry', icon: FileText },
  ];
  return (
    <ul className="space-y-1">
      {links.map((link) => (
        <li key={link.label}>
          <Link
            href={link.href}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
          >
            <link.icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EmployeeAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-bold text-[#2563EB]">
      {initials || '?'}
    </span>
  );
}

export function RowActionsButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
      aria-label="Row actions"
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}

export function OvertimePageIcon() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#7C3AED] text-white shadow-[0_8px_20px_rgba(124,58,237,0.25)]">
      <TimerReset className="h-6 w-6" />
    </span>
  );
}

export function OvertimeSummaryList({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: SetupTone }>;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-[#EDF2F7] bg-[#F8FAFC] px-3 py-2.5">
          <span className="text-xs font-medium text-[#64748B]">{item.label}</span>
          <span className="text-sm font-bold text-[#0F172A]">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function ValidationOkBanner() {
  return (
    <p className="flex items-center gap-1.5 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-xs font-semibold text-[#047857]">
      <CheckCircle2 className="h-3.5 w-3.5" />
      No overtime exceptions detected.
    </p>
  );
}
