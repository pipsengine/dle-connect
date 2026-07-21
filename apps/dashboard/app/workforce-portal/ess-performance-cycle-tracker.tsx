'use client';

import type { EssCycleStage } from '@/lib/ess-performance-workspace';

const stateStyles: Record<EssCycleStage['state'], string> = {
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  active: 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] ring-2 ring-[#BFDBFE]',
  upcoming: 'border-[#E2E8F0] bg-white text-[#64748B]',
  overdue: 'border-amber-300 bg-amber-50 text-amber-900',
  locked: 'border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]',
};

const stateLabel: Record<EssCycleStage['state'], string> = {
  completed: 'Completed',
  active: 'Active',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  locked: 'Locked',
};

type EssPerformanceCycleTrackerProps = {
  cycleName?: string;
  cycleStatus?: string;
  stages: EssCycleStage[];
};

export function EssPerformanceCycleTracker({ cycleName, cycleStatus, stages }: EssPerformanceCycleTrackerProps) {
  if (!stages.length) return null;

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2563EB]">Performance lifecycle</p>
          <h3 className="mt-1 text-sm font-black text-[#0F172A]">
            {cycleName || 'Active cycle'}
            {cycleStatus ? ` · ${cycleStatus}` : ''}
          </h3>
        </div>
        <p className="text-xs font-medium text-[#64748B]">Completed · Active · Upcoming · Overdue · Locked</p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {stages.map((stage, index) => (
          <li
            key={stage.id}
            className={`rounded-xl border px-3 py-2 ${stateStyles[stage.state]}`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
              {index + 1}. {stateLabel[stage.state]}
            </p>
            <p className="mt-1 text-xs font-bold leading-snug">{stage.label}</p>
            {stage.deadline ? (
              <p className="mt-1 text-[10px] font-semibold opacity-80">Due {stage.deadline}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
