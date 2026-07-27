'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardList,
  Clock3,
  Download,
  Filter,
  MoreVertical,
  Send,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import type { EmployeeGoal, PerformanceAssessment, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate, fmtDateTime } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Assessment Queue',
  'Goals & KPIs',
  'Competencies',
  'Contributor Inputs',
  'Review Discussion',
  'Development Actions',
  'Review & Submit',
  'Calibration',
  'History & Audit',
] as const;

type TabId = (typeof TABS)[number];
type QueueStatus = 'Awaiting Self-Appraisal' | 'Not Started' | 'In Progress' | 'Ready to Submit' | 'Overdue' | 'Submitted';

const VARIANCE_THRESHOLD = 0.4;

const safeFmtDate = (value?: string | null) => {
  if (!value) return '—';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  return fmtDate(day);
};

const daysRemaining = (value?: string | null) => {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return Math.ceil((new Date(`${day}T00:00:00`).getTime() - Date.now()) / 86_400_000);
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '—';

const avgRating = (assessment?: PerformanceAssessment | null, field: 'selfRating' | 'managerRating' = 'selfRating') => {
  const rated = (assessment?.items || []).map((item) => Number(item[field] || 0)).filter((n) => n > 0);
  if (!rated.length) return null;
  return Math.round((rated.reduce((sum, n) => sum + n, 0) / rated.length) * 10) / 10;
};

const StatusPill = ({ label }: { label: string }) => {
  const key = label.toLowerCase();
  const style =
    key.includes('submitted') || key.includes('ready') || key.includes('approved') || key.includes('within')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('progress') || key.includes('draft') || key.includes('review required') || key.includes('awaiting')
        ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
        : key.includes('overdue') || key.includes('high')
          ? 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]'
          : key.includes('not started') || key.includes('contributor')
            ? 'bg-[#f4f3ff] text-[#5925dc] border-[#d9d6fe]'
            : 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>;
};

const MiniBar = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#f2f4f7]">
      <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
    <span className="text-[10px] font-bold text-[#344054]">{value}%</span>
  </div>
);

const Donut = ({ value }: { value: number }) => (
  <div
    className="relative mx-auto grid h-[100px] w-[100px] place-items-center rounded-full"
    style={{ background: `conic-gradient(#1570ef ${Math.max(0, Math.min(100, value)) * 3.6}deg, #e4e7ec 0)` }}
  >
    <span className="absolute inset-[16px] grid place-items-center rounded-full bg-white text-center">
      <b className="text-lg font-bold">{value}%</b>
      <small className="text-[8px] font-semibold uppercase text-[#667085]">Overall</small>
    </span>
  </div>
);

function deriveQueueStatus(self?: PerformanceAssessment | null, manager?: PerformanceAssessment | null, deadline?: string): QueueStatus {
  const remaining = daysRemaining(deadline);
  const selfDone = self && ['Submitted', 'Pending Manager', 'Pending HR', 'Approved', 'Published', 'Closed'].includes(self.status);
  if (!selfDone && (!self || ['Draft', 'Not Started', 'Returned'].includes(self.status))) {
    if (remaining != null && remaining < 0) return 'Overdue';
    return 'Awaiting Self-Appraisal';
  }
  if (!manager || manager.status === 'Not Started') {
    if (remaining != null && remaining < 0) return 'Overdue';
    return 'Not Started';
  }
  if (['Draft', 'Returned'].includes(manager.status)) {
    if (remaining != null && remaining < 0) return 'Overdue';
    return 'In Progress';
  }
  if (manager.status === 'Submitted' || manager.status === 'Pending HR' || manager.status === 'Pending Calibration') return 'Ready to Submit';
  if (['Approved', 'Published', 'Closed'].includes(manager.status)) return 'Submitted';
  if (remaining != null && remaining < 0) return 'Overdue';
  return 'In Progress';
}

function completionPct(self?: PerformanceAssessment | null, manager?: PerformanceAssessment | null, goals: EmployeeGoal[] = []) {
  let score = 0;
  if (self && ['Submitted', 'Pending Manager', 'Pending HR', 'Approved', 'Published', 'Closed'].includes(self.status)) score += 40;
  else if (self) score += 15;
  if (manager) {
    const rated = manager.items.filter((item) => Number(item.managerRating || 0) > 0).length;
    const total = Math.max(manager.items.length || goals.length, 1);
    score += Math.round((rated / total) * 50);
    if (['Submitted', 'Pending HR', 'Approved', 'Published', 'Closed'].includes(manager.status)) score = Math.max(score, 95);
  }
  return Math.max(0, Math.min(100, score));
}

export default function ManagerAssessmentsView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const actor = payload.actor;
  const isHrScope = actor.scope === 'global';
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [varianceFilter, setVarianceFilter] = useState('All variance');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<string | null>(null);
  const pageSize = 5;

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const deadline = activeCycle?.yearEndEnd || activeCycle?.endDate || activeCycle?.midYearEnd || '';
  const remaining = daysRemaining(deadline);
  const reviewStart = activeCycle?.yearEndStart || activeCycle?.midYearStart || activeCycle?.startDate || '';
  const reviewEnd = deadline;

  const goals = useMemo(
    () => (domain.goals || []).filter((goal) => {
      if (cycleId && goal.cycleId !== cycleId) return false;
      if (isHrScope) return true;
      return goal.managerId === actor.employeeId || goal.managerName === actor.fullName;
    }),
    [domain.goals, cycleId, isHrScope, actor.employeeId, actor.fullName],
  );

  const assessments = useMemo(
    () => (domain.assessments || []).filter((item) => !cycleId || item.cycleId === cycleId),
    [domain.assessments, cycleId],
  );

  const queue = useMemo(() => {
    const byEmployee = new Map<string, {
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      department: string;
      jobTitle: string;
      goals: EmployeeGoal[];
    }>();

    for (const goal of goals) {
      const key = goal.employeeId || goal.employeeCode || goal.employeeName;
      const existing = byEmployee.get(key);
      if (existing) existing.goals.push(goal);
      else {
        byEmployee.set(key, {
          employeeId: goal.employeeId,
          employeeCode: goal.employeeCode,
          employeeName: goal.employeeName,
          department: goal.department || '—',
          jobTitle: 'Team member',
          goals: [goal],
        });
      }
    }

    return Array.from(byEmployee.values()).map((row) => {
      const self = assessments.find((item) => item.type === 'Self' && (item.employeeId === row.employeeId || item.employeeName === row.employeeName)) || null;
      const manager = assessments.find((item) => item.type === 'Manager' && (item.employeeId === row.employeeId || item.employeeName === row.employeeName)) || null;
      const employeeScore = avgRating(self, 'selfRating');
      const managerScore = avgRating(manager, 'managerRating');
      const variance = employeeScore != null && managerScore != null ? Math.round((managerScore - employeeScore) * 10) / 10 : null;
      const status = deriveQueueStatus(self, manager, deadline);
      const completion = completionPct(self, manager, row.goals);
      return {
        ...row,
        self,
        manager,
        employeeScore,
        managerScore,
        variance,
        status,
        completion,
        selfLabel: !self ? 'Not started' : ['Draft', 'Returned', 'Not Started'].includes(self.status) ? 'Draft' : 'Submitted',
        managerLabel: !manager ? 'Awaiting' : ['Draft', 'Returned', 'Not Started'].includes(manager.status) ? 'Draft' : ['Submitted', 'Pending HR', 'Pending Calibration'].includes(manager.status) ? 'Ready' : manager.status,
      };
    });
  }, [goals, assessments, deadline]);

  const departments = useMemo(
    () => ['All departments', ...Array.from(new Set(queue.map((row) => row.department).filter((d) => d && d !== '—'))).sort()],
    [queue],
  );

  const filtered = useMemo(() => queue.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.employeeName} ${row.employeeCode} ${row.department}`.toLowerCase().includes(q)) return false;
    if (statusFilter !== 'All statuses' && row.status !== statusFilter) return false;
    if (departmentFilter !== 'All departments' && row.department !== departmentFilter) return false;
    if (varianceFilter === 'High variance' && !(row.variance != null && Math.abs(row.variance) >= VARIANCE_THRESHOLD)) return false;
    if (varianceFilter === 'Within threshold' && !(row.variance != null && Math.abs(row.variance) < VARIANCE_THRESHOLD)) return false;
    return true;
  }), [queue, query, statusFilter, departmentFilter, varianceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const assigned = queue.length;
  const awaitingSelf = queue.filter((row) => row.status === 'Awaiting Self-Appraisal').length;
  const notStarted = queue.filter((row) => row.status === 'Not Started').length;
  const inProgress = queue.filter((row) => row.status === 'In Progress').length;
  const ready = queue.filter((row) => row.status === 'Ready to Submit' || row.status === 'Submitted').length;
  const overdue = queue.filter((row) => row.status === 'Overdue').length;
  const selfReceived = queue.filter((row) => row.selfLabel === 'Submitted').length;
  const highVariance = queue.filter((row) => row.variance != null && Math.abs(row.variance) >= VARIANCE_THRESHOLD).length;
  const withinThreshold = queue.filter((row) => row.variance != null && Math.abs(row.variance) < VARIANCE_THRESHOLD).length;
  const reviewRequired = queue.filter((row) => row.variance != null && Math.abs(row.variance) >= 0.25 && Math.abs(row.variance) < VARIANCE_THRESHOLD).length;
  const contributorPending = (domain.raters || []).filter((row) => ['Nominated', 'Invited', 'In Progress'].includes(row.status)).length;
  const readinessPct = assigned ? Math.round(((selfReceived * 0.4 + (assigned - notStarted - awaitingSelf) * 0.35 + ready * 0.25) / assigned) * 100) : 0;
  const validations = overdue + awaitingSelf + highVariance;
  const teamDepartment = departments.filter((d) => d !== 'All departments')[0] || 'Team';

  const openOrContinue = async (row: typeof queue[number]) => {
    if (row.status === 'Awaiting Self-Appraisal') return;
    if (!row.manager) {
      await onAction('assessment.save', {
        cycleId: cycleId || activeCycle?.id,
        type: 'Manager',
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        status: 'Draft',
        managerRating: 3,
      });
    }
    setDrawer(row.employeeId);
  };

  const submitManagerReview = async (managerId?: string) => {
    if (!managerId) return;
    await onAction('assessment.submit', { id: managerId });
  };

  const actionLabel = (status: QueueStatus) => {
    if (status === 'Awaiting Self-Appraisal') return 'Awaiting employee';
    if (status === 'Ready to Submit' || status === 'Submitted') return 'Review';
    if (status === 'In Progress' || status === 'Overdue') return 'Continue';
    return 'Start';
  };

  const selected = queue.find((row) => row.employeeId === drawer) || null;

  return (
    <div className="space-y-4 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Manager Assessments</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Review team performance, reconcile ratings and submit governed assessments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
          <button type="button" onClick={() => setActiveTab('Assessment Queue')} className="inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white">
            Open Assessment Queue
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#84caff] bg-white px-3 text-[11px] font-semibold text-[#175cd3]">
            <Send className="h-3.5 w-3.5" /> Send Reminders
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-[#b2ddff] bg-[#f5faff] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#1570ef] text-white">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Cycle', activeCycle?.name || '—'],
              ['Review Period', reviewStart && reviewEnd ? `${safeFmtDate(reviewStart)} – ${safeFmtDate(reviewEnd)}` : '—'],
              ['Manager', actor.fullName],
              ['Team / Department', teamDepartment],
              ['Review Deadline', remaining == null ? safeFmtDate(deadline) : remaining < 0 ? `${Math.abs(remaining)} days overdue` : `${remaining} days remaining`],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#667085]">{label}</p>
                <p className={`mt-1 text-[11px] font-bold ${label === 'Review Deadline' && remaining != null && remaining <= 14 ? 'text-[#b54708]' : 'text-[#101828]'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex gap-1 overflow-x-auto border-b border-[#eaecf0]">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold transition ${
              activeTab === tab ? 'border-b-2 border-[#1570ef] text-[#1570ef]' : 'text-[#475467] hover:text-[#1570ef]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' || activeTab === 'Assessment Queue' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { icon: Users, label: 'Assigned', value: String(assigned), sub: 'Total assessments', tone: 'blue' as const },
              { icon: Clock3, label: 'Awaiting Self-Appraisal', value: String(awaitingSelf), sub: 'Employees', tone: 'orange' as const },
              { icon: ClipboardList, label: 'Not Started', value: String(notStarted), sub: 'Employees', tone: 'purple' as const },
              { icon: CircleGauge, label: 'In Progress', value: String(inProgress), sub: 'Employees', tone: 'blue' as const },
              { icon: CheckCircle2, label: 'Ready to Submit', value: String(ready), sub: 'Employees', tone: 'green' as const },
              { icon: AlertTriangle, label: 'Overdue', value: String(overdue), sub: 'Employees', tone: 'red' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#dc6803]'
                      : kpi.tone === 'purple' ? 'bg-[#f4f3ff] text-[#6938ef]'
                        : kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]'
                          : kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#d92d20]'
                            : 'bg-[#eff8ff] text-[#1570ef]'
                  }`}>
                    <kpi.icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
                <p className="mt-1 text-[10px] font-semibold text-[#667085]">{kpi.sub}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
                  <h3 className="mr-auto text-sm font-bold">Team Assessment Queue</h3>
                  <label className="flex h-9 min-w-[160px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
                    <Filter className="h-3.5 w-3.5 text-[#667085]" />
                    <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employee" className="w-full border-0 bg-transparent text-[11px] outline-none" />
                  </label>
                  <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    <option>All statuses</option>
                    <option>Awaiting Self-Appraisal</option>
                    <option>Not Started</option>
                    <option>In Progress</option>
                    <option>Ready to Submit</option>
                    <option>Overdue</option>
                    <option>Submitted</option>
                  </select>
                  <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    {departments.map((item) => <option key={item} value={item}>{item === 'All departments' ? 'Department' : item}</option>)}
                  </select>
                  <select value={varianceFilter} onChange={(e) => { setVarianceFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    <option>All variance</option>
                    <option>Within threshold</option>
                    <option>High variance</option>
                  </select>
                  <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold">
                    <Download className="h-3.5 w-3.5" /> Export
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[1100px]">
                    <div className="grid grid-cols-[1.4fr_1fr_1fr_0.75fr_0.7fr_0.7fr_0.7fr_0.75fr_0.9fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                      <span>Employee</span>
                      <span>Self-Appraisal</span>
                      <span>Manager Review</span>
                      <span>Completion</span>
                      <span>Emp. Score</span>
                      <span>Mgr Score</span>
                      <span>Variance</span>
                      <span>Deadline</span>
                      <span>Action</span>
                    </div>
                    {rows.map((row) => (
                      <div key={row.employeeId} className="grid grid-cols-[1.4fr_1fr_1fr_0.75fr_0.7fr_0.7fr_0.7fr_0.75fr_0.9fr] items-center border-b border-[#eaecf0] px-3 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{initials(row.employeeName)}</span>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold">{row.employeeName}</p>
                            <p className="truncate text-[9px] font-semibold text-[#667085]">{row.employeeCode} · {row.department}</p>
                          </div>
                        </div>
                        <div>
                          <StatusPill label={row.selfLabel} />
                          <p className="mt-1 text-[9px] font-semibold text-[#667085]">{safeFmtDate(row.self?.submittedAt || row.self?.updatedAt)}</p>
                        </div>
                        <div>
                          <StatusPill label={row.managerLabel} />
                          <p className="mt-1 text-[9px] font-semibold text-[#667085]">{row.status === 'In Progress' ? 'In progress' : row.status === 'Ready to Submit' ? 'Ready to submit' : row.managerLabel}</p>
                        </div>
                        <MiniBar value={row.completion} />
                        <p className="text-[11px] font-bold">{row.employeeScore ?? '—'}</p>
                        <p className="text-[11px] font-bold">{row.managerScore ?? '—'}</p>
                        <p className={`text-[11px] font-bold ${
                          row.variance == null ? 'text-[#667085]'
                            : Math.abs(row.variance) >= VARIANCE_THRESHOLD ? 'text-[#b54708]'
                              : 'text-[#027a48]'
                        }`}>
                          {row.variance == null ? '—' : `${row.variance > 0 ? '+' : ''}${row.variance.toFixed(1)} ${Math.abs(row.variance) >= VARIANCE_THRESHOLD ? 'High' : 'Low'}`}
                        </p>
                        <p className={`text-[10px] font-semibold ${row.status === 'Overdue' ? 'text-[#b42318]' : 'text-[#b54708]'}`}>{safeFmtDate(deadline)}</p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy || row.status === 'Awaiting Self-Appraisal'}
                            onClick={() => void openOrContinue(row)}
                            className={`h-8 rounded-lg px-2.5 text-[10px] font-semibold disabled:opacity-50 ${
                              row.status === 'Ready to Submit' || row.status === 'Submitted'
                                ? 'bg-[#1570ef] text-white'
                                : 'border border-[#84caff] text-[#175cd3]'
                            }`}
                          >
                            {actionLabel(row.status)}
                          </button>
                          <button type="button" className="p-1 text-[#667085]" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                    {!rows.length ? (
                      <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No team assessments match these filters.</div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaecf0] px-3 py-2 text-[10px] text-[#667085]">
                  <span>
                    Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="grid h-7 w-7 place-items-center rounded bg-[#1570ef] text-white">{page}</span>
                    <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <select className="h-7 rounded border border-[#eaecf0] bg-white px-2" value={pageSize} disabled>
                      <option>5 / page</option>
                    </select>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <h3 className="mb-4 text-sm font-bold">Assessment Lifecycle</h3>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[
                      ['Awaiting Self', awaitingSelf],
                      ['Not Started', notStarted],
                      ['Manager Draft', inProgress],
                      ['Ready', ready],
                      ['Overdue', overdue],
                    ].map(([label, count], index) => (
                      <div key={String(label)} className="relative">
                        {index < 4 ? <i className="absolute left-1/2 top-4 z-0 h-0.5 w-full bg-[#d0d5dd]" /> : null}
                        <div className={`relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border ${
                          Number(count) > 0 ? 'border-[#1570ef] bg-[#1570ef] text-white' : 'border-[#d0d5dd] bg-white text-[#98a2b3]'
                        }`}>
                          <Users className="h-3.5 w-3.5" />
                        </div>
                        <p className="mt-2 text-[9px] font-bold">{label}</p>
                        <p className="text-[11px] font-bold text-[#1570ef]">{count}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-bold">Exceptions & Actions</h3>
                  <ul className="space-y-2">
                    {[
                      { label: `${overdue} Overdue assessment${overdue === 1 ? '' : 's'}`, tone: 'red', show: true },
                      { label: `${awaitingSelf} Missing self-appraisal${awaitingSelf === 1 ? '' : 's'}`, tone: 'orange', show: true },
                      { label: `${highVariance} High-rating variance${highVariance === 1 ? '' : 's'}`, tone: 'orange', show: true },
                      { label: `${contributorPending} Contributor inputs pending`, tone: 'purple', show: true },
                    ].filter((item) => item.show).map((item) => (
                      <li key={item.label} className="flex items-center justify-between gap-2 rounded-lg border border-[#eaecf0] bg-[#f9fafb] px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-[11px] font-semibold">
                          <AlertTriangle className={`h-3.5 w-3.5 ${item.tone === 'red' ? 'text-[#d92d20]' : item.tone === 'purple' ? 'text-[#6938ef]' : 'text-[#dc6803]'}`} />
                          {item.label}
                        </span>
                        <button type="button" onClick={() => setActiveTab('Assessment Queue')} className="text-[10px] font-bold text-[#1570ef]">View</button>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Review Readiness</h3>
                <Donut value={readinessPct} />
                <ul className="mt-3 space-y-2 text-[11px]">
                  {[
                    [`Self-appraisals received ${selfReceived}/${assigned || 0}`, selfReceived === assigned && assigned > 0],
                    [`Manager drafts started ${assigned - awaitingSelf - notStarted}/${assigned || 0}`, assigned - awaitingSelf - notStarted > 0],
                    [`Ready to submit ${ready}/${assigned || 0}`, ready > 0],
                  ].map(([label, ok]) => (
                    <li key={String(label)} className="flex items-center justify-between gap-2 border-t border-[#eaecf0] py-2">
                      <span className="font-semibold text-[#475467]">{label}</span>
                      {ok ? <CheckCircle2 className="h-4 w-4 text-[#12b76a]" /> : <AlertTriangle className="h-4 w-4 text-[#f79009]" />}
                    </li>
                  ))}
                </ul>
                {validations > 0 ? (
                  <div className="mt-3 rounded-lg border border-[#fedf89] bg-[#fffaeb] px-3 py-2 text-[11px] font-semibold text-[#b54708]">
                    {validations} validations require attention
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Rating Variance</h3>
                {[
                  ['Within threshold', withinThreshold, '#12b76a'],
                  ['Review required', reviewRequired, '#f79009'],
                  ['High variance', highVariance, '#f04438'],
                ].map(([label, count, color]) => {
                  const pct = assigned ? Math.round((Number(count) / assigned) * 100) : 0;
                  return (
                    <div key={String(label)} className="mb-3">
                      <div className="mb-1 flex justify-between text-[11px] font-semibold">
                        <span className="text-[#475467]">{label}</span>
                        <span>{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: String(color) }} />
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Upcoming Review Meetings</h3>
                {queue.slice(0, 4).map((row, index) => (
                  <div key={row.employeeId} className="flex items-center gap-2 border-t border-[#eaecf0] py-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{initials(row.employeeName)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold">{row.employeeName}</p>
                      <p className="text-[9px] font-semibold text-[#667085]">{row.department}</p>
                    </div>
                    <div className="text-right text-[9px] font-semibold text-[#667085]">
                      <p>{safeFmtDate(deadline)}</p>
                      <p>{`${10 + index}:00`}</p>
                    </div>
                  </div>
                ))}
                {!queue.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No meetings scheduled.</p> : null}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Recent Activity</h3>
                {(domain.audit || []).filter((event) => /assessment|appraisal|review/i.test(event.action)).slice(0, 5).map((event) => (
                  <div key={event.id} className="border-t border-[#eaecf0] py-2.5 text-[11px]">
                    <p className="font-semibold text-[#344054]">{event.action}</p>
                    <p className="text-[9px] font-semibold text-[#667085]">{event.actor} · {fmtDateTime(event.at)}</p>
                  </div>
                ))}
                {!(domain.audit || []).some((event) => /assessment|appraisal|review/i.test(event.action)) ? (
                  <p className="text-[11px] font-semibold text-[#98a2b3]">No recent assessment activity.</p>
                ) : null}
              </section>
            </aside>
          </div>
        </>
      ) : (
        <section className="rounded-xl border border-[#eaecf0] bg-white px-6 py-20 text-center shadow-sm">
          <Settings2 className="mx-auto h-11 w-11 text-[#1570ef]" />
          <h2 className="mt-4 text-xl font-bold">{activeTab}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[#667085]">
            This manager assessment workspace section is ready for {activeTab.toLowerCase()} detail content.
          </p>
          <button type="button" onClick={() => setActiveTab('Overview')} className="mt-6 inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-4 text-[11px] font-semibold text-white">
            Back to Overview
          </button>
        </section>
      )}

      {selected ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close drawer" onClick={() => setDrawer(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-white shadow-[-12px_0_40px_#0c111d22]">
            <div className="flex items-start justify-between border-b border-[#eaecf0] p-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#1570ef]">Manager review</p>
                <h2 className="mt-1 text-xl font-bold">{selected.employeeName}</h2>
                <p className="mt-1 text-sm text-[#667085]">{selected.department} · {selected.employeeCode}</p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-wrap gap-2">
                <StatusPill label={selected.status} />
                <StatusPill label={`Self: ${selected.selfLabel}`} />
              </div>
              <dl className="mt-5">
                {[
                  ['Completion', `${selected.completion}%`],
                  ['Employee score', selected.employeeScore ?? '—'],
                  ['Manager score', selected.managerScore ?? '—'],
                  ['Variance', selected.variance == null ? '—' : selected.variance.toFixed(1)],
                  ['Goals', String(selected.goals.length)],
                  ['Manager assessment', selected.manager?.status || 'Not created'],
                ].map(([dt, dd]) => (
                  <div key={dt} className="flex items-center justify-between border-b border-[#eaecf0] py-3 text-sm">
                    <dt className="text-[#667085]">{dt}</dt>
                    <dd className="font-semibold">{dd}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 space-y-2">
                {(selected.manager?.items || selected.goals.slice(0, 5)).map((item: any) => (
                  <div key={item.itemId || item.id} className="rounded-lg border border-[#eaecf0] p-3">
                    <p className="text-[11px] font-bold">{item.title}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#667085]">
                      Weight {item.weight}%
                      {item.selfRating != null ? ` · Self ${item.selfRating}` : ''}
                      {item.managerRating != null ? ` · Manager ${item.managerRating}` : ''}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {!selected.manager ? (
                  <button type="button" disabled={busy} onClick={() => void openOrContinue(selected)} className="h-9 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50">
                    Start manager draft
                  </button>
                ) : null}
                {selected.manager && ['Draft', 'Returned'].includes(selected.manager.status) ? (
                  <button type="button" disabled={busy} onClick={() => void submitManagerReview(selected.manager?.id)} className="h-9 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50">
                    Submit manager review
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#eaecf0] px-5 py-4">
              <button type="button" onClick={() => setDrawer(null)} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold">Close</button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
