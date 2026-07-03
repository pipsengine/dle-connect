'use client';

import type { PerformanceMenuItem } from '@/lib/performance-management-types';

type PerformanceSectionViewProps = {
  item: PerformanceMenuItem;
  readOnly?: boolean;
};

export default function PerformanceSectionView({ item, readOnly }: PerformanceSectionViewProps) {
  const Icon = item.icon;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Performance Management</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">{item.label}</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Enterprise workspace for {item.label.toLowerCase()}. This module is wired into the Performance Management navigation
              framework and is ready for domain-specific workflows, approvals, and reporting.
            </p>
            {readOnly ? (
              <p className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                Read-only executive view
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {['Workflow', 'Data & Records', 'Analytics'].map((panel) => (
          <div key={panel} className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5">
            <h3 className="text-sm font-bold text-slate-800">{panel}</h3>
            <p className="mt-2 text-sm text-slate-600">
              Connect live performance data, approval chains, and KPI tracking for {item.label.toLowerCase()}.
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
