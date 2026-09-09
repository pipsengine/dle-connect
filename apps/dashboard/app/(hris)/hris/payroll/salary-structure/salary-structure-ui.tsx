'use client';

import type { ComponentType, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SetupTone } from '../employee-salary-setup/salary-setup-ui';
import { setupToneStyles } from '../employee-salary-setup/salary-setup-ui';

export type StructureTone = SetupTone;

export function HealthScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone = clamped >= 85 ? '#10B981' : clamped >= 70 ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill="none" stroke="#E5E7EB" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 4}
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeDasharray={`${(clamped / 100) * 2 * Math.PI * (size / 2 - 4)} ${2 * Math.PI * (size / 2 - 4)}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-[#0F172A]">{Math.round(clamped)}%</span>
    </div>
  );
}

export function GovernanceWorkflow({
  stages,
  ribbon,
}: {
  stages: Array<{
    id: string;
    label: string;
    count: number;
    owner: string;
    status: 'completed' | 'waiting' | 'pending';
    duration?: string;
  }>;
  ribbon: { slaBreaches: number; avgTime: string; longestWaiting: string; estimatedCompletion: string };
}) {
  return (
    <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#0F172A]">Salary Governance Workflow</h3>
          <p className="text-xs text-[#64748B]">Compensation approval pipeline across HR, Finance, and Executive sign-off</p>
        </div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[920px] items-start gap-0">
          {stages.map((stage, index) => {
            const statusColor =
              stage.status === 'completed' ? 'bg-emerald-500 border-emerald-200' : stage.status === 'waiting' ? 'bg-amber-400 border-amber-200' : 'bg-slate-200 border-slate-300';
            return (
              <div key={stage.id} className="flex flex-1 items-start">
                <div className="flex min-w-0 flex-1 flex-col items-center px-1 text-center">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold text-white ${statusColor}`}>{stage.count}</span>
                  <p className="mt-2 text-xs font-semibold text-[#0F172A]">{stage.label}</p>
                  <p className="mt-0.5 truncate text-[10px] text-[#64748B]">{stage.owner}</p>
                  {stage.duration ? <p className="mt-1 text-[10px] font-medium text-[#94A3B8]">{stage.duration}</p> : null}
                </div>
                {index < stages.length - 1 ? <div className="mt-5 h-0.5 w-full min-w-[12px] flex-1 bg-[#E5E7EB]" /> : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-xs md:grid-cols-4">
        <div><span className="font-semibold text-[#94A3B8]">SLA BREACHES</span><p className="font-bold text-red-600">{ribbon.slaBreaches}</p></div>
        <div><span className="font-semibold text-[#94A3B8]">AVG. TIME AT STAGE</span><p className="font-bold text-[#0F172A]">{ribbon.avgTime}</p></div>
        <div><span className="font-semibold text-[#94A3B8]">LONGEST WAITING</span><p className="font-bold text-[#0F172A]">{ribbon.longestWaiting}</p></div>
        <div><span className="font-semibold text-[#94A3B8]">EST. COMPLETION</span><p className="font-bold text-[#2563EB]">{ribbon.estimatedCompletion}</p></div>
      </div>
    </div>
  );
}

export function AiCompensationInsights({
  items,
}: {
  items: Array<{ label: string; count: number; severity: 'high' | 'medium' | 'low' }>;
}) {
  const severityStyles = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-800 border-amber-200',
    low: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[#0F172A]">AI Compensation Insights</h3>
        <button type="button" className="text-xs font-semibold text-[#2563EB] hover:underline">View All</button>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
            <span className="min-w-0 flex-1 text-xs font-medium text-[#475569]">{item.label}</span>
            <span className="shrink-0 text-sm font-bold text-[#0F172A]">{item.count}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${severityStyles[item.severity]}`}>{item.severity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuickActionToolbar({ actions }: { actions: Array<{ id: string; label: string; icon: ComponentType<{ className?: string }>; primary?: boolean }> }) {
  return (
    <div className="sticky top-0 z-20 max-w-full -mx-1 flex flex-wrap gap-2 rounded-[16px] border border-[#E5E7EB] bg-white/95 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)] backdrop-blur-sm">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all hover:-translate-y-px sm:text-sm ${
              action.primary
                ? 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8] hover:shadow-[0_8px_20px_rgba(37,99,235,0.2)]'
                : 'border border-[#E5E7EB] bg-white text-[#475569] hover:border-[#93C5FD] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
            }`}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export function VerticalBarChart({ rows, formatValue }: { rows: Array<{ label: string; value: number }>; formatValue?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = formatValue || ((v: number) => String(v));
  return (
    <div className="flex h-48 items-end justify-between gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-lg bg-gradient-to-t from-[#1D4ED8] to-[#2563EB] transition-all duration-300"
              style={{ height: `${Math.max(8, (row.value / max) * 100)}%` }}
              title={fmt(row.value)}
            />
          </div>
          <span className="truncate text-[10px] font-medium text-[#64748B]">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DualLineChart({
  labels,
  seriesA,
  seriesB,
  nameA,
  nameB,
}: {
  labels: string[];
  seriesA: number[];
  seriesB: number[];
  nameA: string;
  nameB: string;
}) {
  const all = [...seriesA, ...seriesB];
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const range = max - min || 1;
  const toY = (v: number) => 100 - ((v - min) / range) * 80 - 10;
  const toX = (i: number) => (labels.length <= 1 ? 50 : (i / (labels.length - 1)) * 100);
  const path = (series: number[]) =>
    series.map((value, index) => `${toX(index)},${toY(value)}`).join(' ');

  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-44 w-full" preserveAspectRatio="none">
        <polyline fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" points={path(seriesA)} />
        <polyline fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" points={path(seriesB)} />
      </svg>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-[#64748B]">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2563EB]" />{nameA}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#10B981]" />{nameB}</span>
      </div>
    </div>
  );
}

export function StructureAccordion({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] open:bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <div>
          <p className="text-sm font-semibold text-[#0F172A]">{title}</p>
          {subtitle ? <p className="text-xs text-[#64748B]">{subtitle}</p> : null}
        </div>
        <ChevronDown className="h-4 w-4 text-[#64748B] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#E5E7EB] px-4 py-3">{children}</div>
    </details>
  );
}

export function SeverityInsightRow({ label, count, severity }: { label: string; count: number; severity: StructureTone }) {
  const styles = setupToneStyles[severity];
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
      <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: styles.accent }} />
      <span className="flex-1 text-[#475569]">{label}</span>
      <span className="font-bold text-[#0F172A]">{count}</span>
    </div>
  );
}
