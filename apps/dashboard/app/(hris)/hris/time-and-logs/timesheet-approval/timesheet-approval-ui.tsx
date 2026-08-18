'use client';

import type { ReactNode } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import {
  AccordionSection,
  DonutChart,
  HorizontalBarChart,
  InsightCard,
  PremiumKpiCard,
  SetupTone,
  StatusPill,
  WorkflowTimeline,
  WorkspaceTabs,
  setupToneStyles,
} from '@/app/(hris)/hris/payroll/employee-salary-setup/salary-setup-ui';

export {
  AccordionSection,
  DonutChart,
  FilterSelect,
  HorizontalBarChart,
  InsightCard,
  MetadataPill,
  PanelShell,
  PremiumKpiCard,
  Sparkline,
  StatusPill,
  WorkflowTimeline,
  WorkspaceTabs,
  setupToneStyles,
} from '@/app/(hris)/hris/payroll/employee-salary-setup/salary-setup-ui';

export type { SetupTone } from '@/app/(hris)/hris/payroll/employee-salary-setup/salary-setup-ui';

export function ValidationRing({ score }: { score: number }) {
  const circumference = 113;
  const tone = score >= 90 ? '#10B981' : score >= 75 ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r="18" fill="none" stroke="#E5E7EB" strokeWidth="4" />
        <circle cx="22" cy="22" r="18" fill="none" stroke={tone} strokeWidth="4" strokeDasharray={`${(score / 100) * circumference} ${circumference}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#0F172A]">{score}%</span>
    </div>
  );
}

export function SlaPill({ sla }: { sla: 'On Track' | 'At Risk' | 'Breached' }) {
  const tone: SetupTone = sla === 'Breached' ? 'red' : sla === 'At Risk' ? 'amber' : 'green';
  const label = sla === 'Breached' ? 'Breached' : sla === 'At Risk' ? 'At risk' : 'On track';
  return <StatusPill label={label} tone={tone} />;
}

type PipelineStage = {
  id: string;
  label: string;
  count: number;
  active: boolean;
  completed: boolean;
  filterStage?: string;
};

export function ApprovalPipeline({
  stages,
  summary,
  onStageSelect,
}: {
  stages: PipelineStage[];
  summary: Array<{ label: string; value: string }>;
  onStageSelect?: (stage: PipelineStage) => void;
}) {
  return (
    <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="dle-scroll-x flex flex-wrap items-center gap-2 overflow-x-auto pb-2">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex min-w-[120px] flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onStageSelect?.(stage)}
              className={`flex min-w-[108px] flex-col rounded-xl border px-3 py-2 text-left transition hover:border-[#2563EB] ${stage.active ? 'border-[#2563EB] bg-blue-50' : stage.completed ? 'border-emerald-200 bg-emerald-50' : 'border-[#E5E7EB] bg-[#F8FAFC]'}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{stage.label}</p>
              <p className="mt-1 text-lg font-bold text-[#0F172A]">{stage.count}</p>
              <p className="text-[10px] font-medium text-[#64748B]">{stage.active ? 'Current' : stage.completed ? 'Completed' : 'Waiting'}</p>
            </button>
            {index < stages.length - 1 ? <ChevronRight className="h-4 w-4 shrink-0 text-[#94A3B8]" /> : null}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-[#E5E7EB] pt-4 text-xs font-semibold text-[#475569]">
        {summary.map((item) => (
          <span key={item.label}>
            <span className="text-[#94A3B8]">{item.label}:</span> {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AiInsightsPanel({ items, onViewAll }: { items: Array<{ text: string; severity: 'High' | 'Medium' | 'Low' }>; onViewAll?: () => void }) {
  const severityTone = (severity: string): SetupTone => (severity === 'High' ? 'red' : severity === 'Medium' ? 'amber' : 'blue');
  return (
    <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#7C3AED]" />
          <h3 className="text-base font-semibold text-[#0F172A]">AI Insights</h3>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="text-xs font-semibold text-[#2563EB] hover:underline">
            View all
          </button>
        ) : null}
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.text} className="flex items-start justify-between gap-3 rounded-xl bg-[#F8FAFC] px-3 py-2">
            <span className="text-xs font-medium text-[#475569]">{item.text}</span>
            <StatusPill label={item.severity} tone={severityTone(item.severity)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalyticsCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
