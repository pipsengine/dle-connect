'use client';

import PayrollPeriodContextBar from './PayrollPeriodContextBar';
import type { ComponentType, ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Coins,
  DatabaseZap,
  Download,
  FileSpreadsheet,
  GitBranch,
  Plus,
  RefreshCcw,
  Upload,
  Users,
} from 'lucide-react';

const SalaryStructureClient = dynamic(() => import('../payroll/salary-structure/SalaryStructureClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="salary structure" />,
});
const JobGradesClient = dynamic(() => import('../organization/job-grades/JobGradesClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="salary grades" />,
});
const EmployeeSalarySetupClient = dynamic(() => import('../payroll/employee-salary-setup/EmployeeSalarySetupClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="employee pay setup" />,
});
const SageMigrationReviewClient = dynamic(() => import('../payroll/sage-migration-review/SageMigrationReviewClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="Sage migration review" />,
});
const SageReconciliationClient = dynamic(() => import('../payroll/sage-reconciliation/SageReconciliationClient'), {
  ssr: false,
  loading: () => <WorkspaceLoading label="Sage reconciliation" />,
});

type SetupException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: 'Low' | 'Medium' | 'High';
  owner: string;
};

type SetupRecord = {
  employmentType: string;
  payrollGroup: string;
  paymentType?: string;
  isDailyRate?: boolean;
  salaryGrade: string;
  salaryStructure?: string;
  earningProfile?: string;
  payrollStatus: string;
  readinessStatus?: string;
  exceptionCount: number;
};

export type PaySetupPayload = {
  period: string;
  periodLabel: string;
  generatedAt: string;
  dataSource?: { source: string; employeeCount: number };
  periodRecord?: { status: string } | null;
  periods?: Array<{ period: string; periodLabel: string; status: string; isActive: boolean }>;
  summary: {
    totalEmployees: number;
    readinessReadyEmployees?: number;
    readinessAwaitingTimesheetEmployees?: number;
    readinessReviewEmployees?: number;
    readinessBlockedEmployees?: number;
    blockedEmployees: number;
    reviewEmployees: number;
    exceptionCount: number;
  };
  records: SetupRecord[];
  exceptions: SetupException[];
  permissions?: { canExport?: boolean };
};

export type PaySetupTabId =
  | 'overview'
  | 'salary-structure'
  | 'salary-grades'
  | 'employee-salary-setup'
  | 'sage-migration-review'
  | 'sage-reconciliation'
  | 'compensation-planning';

type Props = {
  payload: PaySetupPayload | null;
  activeTab: PaySetupTabId;
  loading: boolean;
  lastLoaded: string;
  viewPeriod: string | null;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onSelectTab: (tab: PaySetupTabId) => void;
  onViewException: (id: string) => void;
  onViewAllExceptions: () => void;
  onSelectPeriod: (period: string) => void;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(value);
const fmtDateTime = (value: string) => new Date(value).toLocaleString('en-GB');

const setupException = (issue: string) =>
  /salary|grade|setup|bank|pension|tax|nhf|payroll group|pay currency|gross pay|sage/i.test(issue);

const categoryForRecord = (record: SetupRecord) => {
  const text = `${record.employmentType} ${record.payrollGroup} ${record.paymentType || ''}`.toLowerCase();
  if (record.isDailyRate || /daily|day rate/.test(text)) return 'Daily Rate';
  if (/nysc/.test(text)) return 'NYSC';
  if (/\bit\b|intern/.test(text)) return 'IT';
  if (/lump/.test(text)) return 'Lumpsum';
  if (/contract/.test(text)) return 'Contract';
  if (/permanent/.test(text)) return 'Permanent';
  return record.employmentType || 'Other';
};

const readinessForRecord = (record: SetupRecord) => {
  if (record.readinessStatus === 'Ready' || record.payrollStatus === 'Ready') return 'ready';
  if (record.readinessStatus === 'Blocked' || record.payrollStatus === 'Blocked') return 'blocked';
  return 'review';
};

const tabs: { id: PaySetupTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'salary-structure', label: 'Salary Structure' },
  { id: 'salary-grades', label: 'Grades' },
  { id: 'employee-salary-setup', label: 'Employee Setup' },
  { id: 'sage-migration-review', label: 'Sage Migration' },
  { id: 'sage-reconciliation', label: 'Sage Reconciliation' },
  { id: 'compensation-planning', label: 'Compensation Planning' },
];

export default function PaySetupHub({
  payload,
  activeTab,
  loading,
  lastLoaded,
  viewPeriod,
  onRefresh,
  onExportCsv,
  onExportExcel,
  onSelectTab,
  onViewException,
  onViewAllExceptions,
  onSelectPeriod,
}: Props) {
  const records = payload?.records || [];
  const setupExceptions = (payload?.exceptions || []).filter((item) => setupException(item.issue));
  const structures = new Set(
    records.map((r) => r.salaryStructure || r.earningProfile).filter((value) => value && value !== 'Unassigned'),
  );
  const grades = new Set(records.map((r) => r.salaryGrade).filter((g) => g && g !== 'Unassigned'));

  const ready = payload?.summary.readinessReadyEmployees ?? 0;
  const review = (payload?.summary.readinessReviewEmployees ?? 0) + (payload?.summary.readinessAwaitingTimesheetEmployees ?? 0);
  const blocked = payload?.summary.readinessBlockedEmployees ?? payload?.summary.blockedEmployees ?? 0;
  const readinessTotal = Math.max(ready + review + blocked, 1);

  const categories = ['Permanent', 'Lumpsum', 'Daily Rate', 'Contract', 'NYSC', 'IT'];
  const categoryStats = categories.map((label) => {
    const rows = records.filter((record) => categoryForRecord(record) === label);
    const readyCount = rows.filter((record) => readinessForRecord(record) === 'ready').length;
    const pct = rows.length ? Math.round((readyCount / rows.length) * 100) : 0;
    return { label, count: rows.length, pct, readyCount };
  });

  const categoryTone = (pct: number, count: number) => {
    if (!count) return { label: 'No employees', chip: 'bg-slate-100 text-slate-600' };
    if (pct >= 80) return { label: 'Ready', chip: 'bg-emerald-100 text-emerald-800' };
    if (pct > 0) return { label: 'In progress', chip: 'bg-amber-100 text-amber-800' };
    return { label: 'Needs attention', chip: 'bg-red-100 text-red-800' };
  };

  const categoryBarColors = ['#2563EB', '#8B5CF6', '#F59E0B', '#06B6D4', '#10B981', '#0F172A'];
  const categoryMax = Math.max(...categoryStats.map((c) => c.count), 1);

  const severityData = [
    { label: 'High', value: setupExceptions.filter((e) => e.severity === 'High').length, color: '#EF4444' },
    { label: 'Medium', value: setupExceptions.filter((e) => e.severity === 'Medium').length, color: '#F59E0B' },
    { label: 'Low', value: setupExceptions.filter((e) => e.severity === 'Low').length, color: '#EAB308' },
  ];
  const severityTotal = Math.max(severityData.reduce((s, i) => s + i.value, 0), 1);

  const sageIssues = setupExceptions.filter((e) => /sage|variance|migration/i.test(e.issue)).length;

  const workspaces = [
    {
      tab: 'salary-structure' as const,
      title: 'Salary Structure',
      description: 'Configure salary bands, pay ranges, earnings profiles and compensation rules.',
      icon: GitBranch,
      status: structures.size > 0 ? 'Configured' : 'Needs Setup',
      tone: structures.size > 0 ? 'green' : 'amber',
    },
    {
      tab: 'salary-grades' as const,
      title: 'Salary Grades',
      description: 'Manage grades, hierarchy, promotion paths and eligibility.',
      icon: BarChart3,
      status: grades.size > 0 ? 'Configured' : 'Needs Setup',
      tone: grades.size > 0 ? 'green' : 'amber',
    },
    {
      tab: 'employee-salary-setup' as const,
      title: 'Employee Pay Setup',
      description: 'Manage employee salary profiles, payroll groups, deductions and statutory setup.',
      icon: Users,
      status: ready > 0 ? 'Configured' : 'Review Required',
      tone: ready > 0 ? 'green' : 'amber',
    },
    {
      tab: 'sage-migration-review' as const,
      title: 'Sage Migration Review',
      description: 'Validate migrated payroll setup data against HRIS values.',
      icon: DatabaseZap,
      status: sageIssues > 0 ? 'Review Required' : 'Configured',
      tone: sageIssues > 0 ? 'amber' : 'green',
    },
    {
      tab: 'sage-reconciliation' as const,
      title: 'Sage vs Enterprise Reconciliation',
      description: 'Compare Sage payslip totals and earning lines against the enterprise engine before release.',
      icon: DatabaseZap,
      status: sageIssues > 0 ? 'Review Required' : 'Configured',
      tone: sageIssues > 0 ? 'amber' : 'green',
    },
  ];

  let donutOffset = 0;
  const coverageSlices = [
    { label: 'Ready', value: ready, color: '#10B981' },
    { label: 'Review', value: review, color: '#F59E0B' },
    { label: 'Blocked', value: blocked, color: '#EF4444' },
  ].map((seg) => {
    const pct = seg.value / readinessTotal;
    const slice = { ...seg, pct, offset: donutOffset };
    donutOffset += pct;
    return slice;
  });

  let severityOffset = 0;
  const severitySlices = severityData.map((seg) => {
    const pct = seg.value / severityTotal;
    const slice = { ...seg, pct, offset: severityOffset };
    severityOffset += pct;
    return slice;
  });

  const quickActions: Array<
    | { label: string; tab: PaySetupTabId; icon: ComponentType<{ className?: string }> }
    | { label: string; action: 'export'; icon: ComponentType<{ className?: string }> }
  > = [
    { label: 'Add Salary Structure', tab: 'salary-structure', icon: Plus },
    { label: 'Add Salary Grade', tab: 'salary-grades', icon: Plus },
    { label: 'Import Salary Setup', tab: 'employee-salary-setup', icon: Upload },
    { label: 'Validate Payroll Setup', tab: 'employee-salary-setup', icon: AlertTriangle },
    { label: 'Review Sage Migration', tab: 'sage-migration-review', icon: DatabaseZap },
    { label: 'Sage Reconciliation', tab: 'sage-reconciliation', icon: DatabaseZap },
    { label: 'Export Setup Report', action: 'export', icon: FileSpreadsheet },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white">
              <Coins className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Pay Setup</h1>
              <p className="mt-1 text-sm text-[#64748B]">
                Manage salary structures, grades, employee pay setup, and payroll configuration readiness.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button type="button" onClick={onExportCsv} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button type="button" onClick={onExportExcel} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>
          </div>
        </div>

        <div className="mt-4">
          <PayrollPeriodContextBar payload={payload} viewPeriod={viewPeriod} onSelectPeriod={onSelectPeriod} showMetaBadges={false} />
        </div>

        <nav className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-xl border border-[#E5E7EB] bg-slate-50 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  activeTab === tab.id ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div className={`mx-auto max-w-[1400px] space-y-6 px-4 py-6 ${loading ? 'opacity-60' : ''}`}>
        {activeTab === 'overview' ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Employees" value={fmtNum(payload?.summary.totalEmployees || 0)} subtitle="Payroll population" tone="blue" icon={Users} onAction={() => onSelectTab('employee-salary-setup')} actionLabel="View setup" />
              <KpiCard title="Salary Structures" value={fmtNum(structures.size)} subtitle="Active earning profiles" tone="green" icon={GitBranch} onAction={() => onSelectTab('salary-structure')} actionLabel="View structures" />
              <KpiCard title="Grades" value={fmtNum(grades.size)} subtitle="Configured salary grades" tone="purple" icon={BarChart3} onAction={() => onSelectTab('salary-grades')} actionLabel="View grades" />
              <KpiCard title="Setup Exceptions" value={fmtNum(setupExceptions.length || payload?.summary.exceptionCount || 0)} subtitle={`${fmtNum(blocked)} blocked setup issues`} tone="danger" icon={AlertTriangle} onAction={onViewAllExceptions} actionLabel="Review issues" />
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {workspaces.map((item) => (
                <WorkspaceCard key={item.tab} {...item} onOpen={() => onSelectTab(item.tab)} />
              ))}
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Setup Health</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ChartCard title="Setup Coverage" actionLabel="View details" onAction={onViewAllExceptions}>
                  <div className="flex items-center gap-4">
                    <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90">
                      <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#E5E7EB" strokeWidth="4" />
                      {coverageSlices.map((slice) => (
                        <circle key={slice.label} cx="21" cy="21" r="15.9" fill="transparent" stroke={slice.color} strokeWidth="4" strokeDasharray={`${slice.pct * 100} ${100 - slice.pct * 100}`} strokeDashoffset={25 - slice.offset * 100} />
                      ))}
                    </svg>
                    <div className="space-y-2 text-xs">
                      {coverageSlices.map((seg) => (
                        <div key={seg.label} className="flex items-center gap-2 font-semibold text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
                          {seg.label}: {fmtNum(seg.value)}
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartCard>

                <ChartCard title="Employee Categories" actionLabel="View details" onAction={() => onSelectTab('employee-salary-setup')}>
                  <div className="flex h-36 items-end justify-center gap-2">
                    {categoryStats.map((cat, i) => (
                      <div key={cat.label} className="flex flex-col items-center gap-1">
                        <div className="flex h-28 w-8 items-end rounded-t bg-slate-100">
                          <div
                            className="w-full rounded-t transition-all"
                            style={{
                              height: cat.count ? `${Math.max(8, (cat.count / categoryMax) * 100)}%` : '4px',
                              background: categoryBarColors[i % categoryBarColors.length],
                              opacity: cat.count ? 1 : 0.35,
                            }}
                          />
                        </div>
                        <span className="max-w-[48px] truncate text-[9px] font-bold text-slate-600">{cat.label}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>

                <ChartCard title="Setup Exceptions" actionLabel="View details" onAction={onViewAllExceptions}>
                  <div className="flex items-center gap-4">
                    <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0 -rotate-90">
                      <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#E5E7EB" strokeWidth="4" />
                      {severitySlices.map((slice) => (
                        <circle key={slice.label} cx="21" cy="21" r="15.9" fill="transparent" stroke={slice.color} strokeWidth="4" strokeDasharray={`${slice.pct * 100} ${100 - slice.pct * 100}`} strokeDashoffset={25 - slice.offset * 100} />
                      ))}
                    </svg>
                    <div className="space-y-2 text-xs">
                      {severityData.map((seg) => (
                        <div key={seg.label} className="flex items-center gap-2 font-semibold text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
                          {seg.label}: {fmtNum(seg.value)}
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartCard>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Employee Category Readiness</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {categoryStats.map((cat) => {
                  const status = categoryTone(cat.pct, cat.count);
                  return (
                    <div key={cat.label} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-[#0F172A]">{cat.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.chip}`}>{status.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#64748B]">{fmtNum(cat.count)} employees</p>
                      <p className="mt-3 text-2xl font-bold text-[#2563EB]">{cat.pct}%</p>
                      <p className="text-xs font-semibold text-[#64748B]">Ready</p>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-[#10B981]" style={{ width: `${cat.pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Setup Exceptions</h2>
                <button type="button" onClick={onViewAllExceptions} className="text-sm font-semibold text-[#2563EB] hover:underline">
                  View all exceptions
                  <ChevronRight className="ml-1 inline h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {setupExceptions.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#0F172A]">{item.employeeName}</p>
                      <p className="text-xs text-[#64748B]">{item.employeeId}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.issue}</p>
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        {item.severity} · {item.owner}
                      </p>
                    </div>
                    <button type="button" onClick={() => onViewException(item.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#2563EB] hover:bg-blue-50">
                      View
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {!setupExceptions.length ? <p className="text-sm font-semibold text-emerald-700">No setup exceptions found.</p> : null}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Quick Actions</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {quickActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => ('action' in item ? onExportExcel() : onSelectTab(item.tab))}
                      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-4 text-center text-sm font-semibold text-slate-800 shadow-sm hover:border-blue-200 hover:bg-blue-50"
                    >
                      <Icon className="h-5 w-5 text-[#2563EB]" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <PaySetupTabPanel
            tab={activeTab}
            payload={payload}
            lastLoaded={lastLoaded}
            onBack={() => onSelectTab('overview')}
            onSelectTab={onSelectTab}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-sm font-semibold text-[#64748B] shadow-sm">
      Loading {label} workspace…
    </div>
  );
}

function PaySetupTabPanel({
  tab,
  payload,
  lastLoaded,
  onBack,
  onSelectTab,
}: {
  tab: PaySetupTabId;
  payload: PaySetupPayload | null;
  lastLoaded: string;
  onBack: () => void;
  onSelectTab: (tab: PaySetupTabId) => void;
}) {
  const tabMeta = tabs.find((item) => item.id === tab);
  const now = lastLoaded || new Date().toISOString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
          ← Back to Overview
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{tabMeta?.label || tab}</p>
      </div>

      {tab === 'salary-structure' ? <SalaryStructureClient initialNow={now} /> : null}
      {tab === 'salary-grades' ? <JobGradesClient /> : null}
      {tab === 'employee-salary-setup' ? <EmployeeSalarySetupClient initialNow={now} /> : null}
      {tab === 'sage-migration-review' ? <SageMigrationReviewClient initialNow={now} /> : null}
      {tab === 'sage-reconciliation' ? (
        <SageReconciliationClient initialReferencePeriod="2026-05" initialTargetPeriod="2026-06" />
      ) : null}
      {tab === 'compensation-planning' ? (
        <CompensationPlanningPanel payload={payload} onSelectTab={onSelectTab} />
      ) : null}
    </div>
  );
}

function CompensationPlanningPanel({
  payload,
  onSelectTab,
}: {
  payload: PaySetupPayload | null;
  onSelectTab: (tab: PaySetupTabId) => void;
}) {
  const records = payload?.records || [];
  const gradeMap = new Map<string, { count: number; ready: number; blocked: number; review: number }>();
  for (const record of records) {
    const grade = record.salaryGrade || 'Unassigned';
    const current = gradeMap.get(grade) || { count: 0, ready: 0, blocked: 0, review: 0 };
    current.count += 1;
    const readiness = readinessForRecord(record);
    if (readiness === 'ready') current.ready += 1;
    else if (readiness === 'blocked') current.blocked += 1;
    else current.review += 1;
    gradeMap.set(grade, current);
  }
  const gradeRows = Array.from(gradeMap.entries())
    .map(([grade, stats]) => ({ grade, ...stats }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const structureMap = new Map<string, number>();
  for (const record of records) {
    const structure = record.salaryStructure || record.earningProfile || 'Unassigned';
    structureMap.set(structure, (structureMap.get(structure) || 0) + 1);
  }
  const structureRows = Array.from(structureMap.entries())
    .map(([structure, count]) => ({ structure, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Compensation Planning</h2>
        <p className="mt-1 text-sm text-[#64748B]">
          Grade and structure distribution for salary review exercises, increment planning, and budget impact analysis.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Employees in scope</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{fmtNum(payload?.summary.totalEmployees || records.length)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Active grades</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{fmtNum(gradeRows.length)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Structures / profiles</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{fmtNum(structureRows.length)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onSelectTab('salary-structure')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#2563EB] hover:bg-blue-100">
            Open Salary Structure
          </button>
          <button type="button" onClick={() => onSelectTab('salary-grades')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#2563EB] hover:bg-blue-100">
            Open Grades
          </button>
          <button type="button" onClick={() => onSelectTab('employee-salary-setup')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#2563EB] hover:bg-blue-100">
            Open Employee Setup
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Grade Headcount</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Employees</th>
                  <th className="px-4 py-3">Ready</th>
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {gradeRows.map((row) => (
                  <tr key={row.grade} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.grade}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{fmtNum(row.count)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{fmtNum(row.ready)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-700">{fmtNum(row.review)}</td>
                    <td className="px-4 py-3 font-semibold text-red-700">{fmtNum(row.blocked)}</td>
                  </tr>
                ))}
                {!gradeRows.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                      No grade distribution available for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Structure / Profile Coverage</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Structure / Profile</th>
                  <th className="px-4 py-3">Employees</th>
                </tr>
              </thead>
              <tbody>
                {structureRows.map((row) => (
                  <tr key={row.structure} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.structure}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{fmtNum(row.count)}</td>
                  </tr>
                ))}
                {!structureRows.length ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                      No structure coverage available for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  tone,
  icon: Icon,
  actionLabel,
  onAction,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: 'blue' | 'green' | 'purple' | 'danger';
  icon: ComponentType<{ className?: string }>;
  actionLabel: string;
  onAction: () => void;
}) {
  const tones = {
    blue: { accent: '#2563EB', icon: 'bg-blue-50 text-[#2563EB]' },
    green: { accent: '#10B981', icon: 'bg-emerald-50 text-[#10B981]' },
    purple: { accent: '#8B5CF6', icon: 'bg-violet-50 text-[#8B5CF6]' },
    danger: { accent: '#EF4444', icon: 'bg-red-50 text-[#EF4444]' },
  };
  const palette = tones[tone];
  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm" style={{ borderTopWidth: 4, borderTopColor: palette.accent }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#64748B]">{title}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-[#0F172A]">{value}</p>
      <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
      <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
        {actionLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}

function WorkspaceCard({ title, description, icon: Icon, status, tone, onOpen }: { title: string; description: string; icon: ComponentType<{ className?: string }>; status: string; tone: string; onOpen: () => void }) {
  const badge = tone === 'green' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
  return (
    <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-[#2563EB]">
          <Icon className="h-5 w-5" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badge}`}>{status}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm text-[#64748B]">{description}</p>
      <button type="button" onClick={onOpen} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-[#2563EB] hover:bg-blue-100">
        Open Workspace
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}

function ChartCard({ title, actionLabel, onAction, children }: { title: string; actionLabel: string; onAction: () => void; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-4">{children}</div>
      <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
        {actionLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </article>
  );
}
