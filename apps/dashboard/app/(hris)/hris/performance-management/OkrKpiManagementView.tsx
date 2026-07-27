'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Filter,
  MoreVertical,
  Plus,
  Scale,
  Search,
  Settings2,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import type { EmployeeGoal, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Employee Goals',
  'Key Results',
  'KPI Setup',
  'Alignment',
  'Progress & Check-ins',
  'Approvals',
  'Changes & Versions',
  'Exceptions',
  'Audit & History',
] as const;

type TabId = (typeof TABS)[number];
type HealthStatus = 'On Track' | 'At Risk' | 'Overdue' | 'Not Started' | 'Completed';

const safeFmtDate = (value?: string | null) => {
  if (!value) return '—';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  return fmtDate(day);
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '—';

const primaryKr = (goal: EmployeeGoal) => goal.keyResults[0];

const healthOf = (goal: EmployeeGoal, today = new Date()): HealthStatus => {
  if (['Completed', 'Archived'].includes(goal.status)) return 'Completed';
  if (['Draft', 'Pending Approval'].includes(goal.status) && goal.progressPercent <= 0) return 'Not Started';
  const due = goal.dueDate?.slice(0, 10);
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due) && new Date(`${due}T00:00:00`) < today && goal.progressPercent < 100) return 'Overdue';
  if (goal.progressPercent < 35 || goal.status === 'Discussion Requested') return 'At Risk';
  return 'On Track';
};

const approvalOf = (goal: EmployeeGoal) => {
  if (goal.acknowledgedAt || ['Agreed', 'Active', 'Completed'].includes(goal.status)) return 'Acknowledged';
  if (['Assigned', 'Resubmitted'].includes(goal.status)) return 'Awaiting employee';
  if (goal.status === 'Pending Approval') return 'Manager pending';
  if (goal.status === 'Discussion Requested') return 'In discussion';
  return goal.status;
};

const StatusPill = ({ label }: { label: string }) => {
  const key = label.toLowerCase();
  const style =
    key.includes('track') || key.includes('acknowledged') || key.includes('validated') || key.includes('completed') || key.includes('approved')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('risk') || key.includes('await') || key.includes('discussion') || key.includes('medium')
        ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
        : key.includes('overdue') || key.includes('high') || key.includes('exception') || key.includes('exceed')
          ? 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]'
          : key.includes('alignment') || key.includes('check')
            ? 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]'
            : 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>;
};

const MiniBar = ({ value, dual }: { value: number; dual?: boolean }) => (
  <div className="flex items-center gap-2">
    <div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-[#f2f4f7]">
      <div className="h-full bg-[#1570ef]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      {dual ? <div className="h-full bg-[#d0d5dd]" style={{ width: `${Math.max(0, 100 - value)}%` }} /> : null}
    </div>
    <span className="text-[10px] font-bold text-[#344054]">{value}%</span>
  </div>
);

const Sparkline = ({ value }: { value: number }) => {
  const points = [12, 18, 14, 22, 20, 28, Math.max(8, Math.round(value / 4))].map((y, i) => `${i * 10},${32 - Math.min(28, y)}`).join(' ');
  return (
    <svg width="64" height="32" viewBox="0 0 60 32" className="text-[#1570ef]">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
    </svg>
  );
};

const HealthDonut = ({ onTrack, atRisk, overdue, notStarted }: { onTrack: number; atRisk: number; overdue: number; notStarted: number }) => {
  const total = Math.max(onTrack + atRisk + overdue + notStarted, 1);
  const a = (onTrack / total) * 100;
  const b = (atRisk / total) * 100;
  const c = (overdue / total) * 100;
  const healthy = Math.round((onTrack / total) * 100);
  return (
    <div
      className="relative mx-auto grid h-[120px] w-[120px] place-items-center rounded-full"
      style={{
        background: `conic-gradient(#12b76a 0 ${a}%, #f79009 ${a}% ${a + b}%, #f04438 ${a + b}% ${a + b + c}%, #98a2b3 ${a + b + c}% 100%)`,
      }}
    >
      <span className="absolute inset-[20px] grid place-items-center rounded-full bg-white text-center">
        <b className="text-xl font-bold text-[#101828]">{healthy}%</b>
        <small className="text-[8px] font-semibold uppercase text-[#667085]">Healthy</small>
      </span>
    </div>
  );
};

export default function OkrKpiManagementView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const isHrScope = payload.actor?.scope === 'global';
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All departments');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [healthFilter, setHealthFilter] = useState('Alignment health');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<EmployeeGoal | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [form, setForm] = useState({
    employeeName: '',
    employeeId: '',
    employeeCode: '',
    title: '',
    department: '',
    parentObjectiveId: '',
    weight: '100',
  });
  const pageSize = 8;

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const objectives = useMemo(
    () => (domain.companyObjectives || []).filter((item) => !cycleId || item.cycleId === cycleId),
    [domain.companyObjectives, cycleId],
  );
  const goals = useMemo(
    () => (domain.goals || []).filter((goal) => !cycleId || goal.cycleId === cycleId),
    [domain.goals, cycleId],
  );
  const checkIns = useMemo(
    () => (domain.checkIns || []).filter((item) => !cycleId || item.cycleId === cycleId),
    [domain.checkIns, cycleId],
  );

  const departments = useMemo(
    () => ['All departments', ...Array.from(new Set(goals.map((goal) => goal.department).filter(Boolean))).sort()],
    [goals],
  );

  const objectiveById = useMemo(() => {
    const map = new Map(objectives.map((item) => [item.id, item]));
    return map;
  }, [objectives]);

  const enriched = useMemo(() => goals.map((goal) => {
    const parent = goal.parentObjectiveId ? objectiveById.get(goal.parentObjectiveId) : undefined;
    const health = healthOf(goal);
    const kr = primaryKr(goal);
    const actual = kr?.actual != null ? Number(kr.actual) : Math.round((goal.progressPercent / 100) * Number(kr?.target || 100));
    return {
      goal,
      health,
      approval: approvalOf(goal),
      alignment: parent ? `${parent.code} → ${goal.department || 'Team'} → ${goal.employeeName}` : `${goal.department || 'Unassigned'} → ${goal.employeeName}`,
      kpiLabel: kr ? `${kr.title}: ${actual}/${kr.target}${kr.unit}` : 'No KPI linked',
      nextUpdate: checkIns.find((item) => item.employeeId === goal.employeeId)?.date || goal.dueDate,
    };
  }), [goals, objectiveById, checkIns]);

  const filtered = useMemo(() => enriched.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.goal.employeeName} ${row.goal.title} ${row.goal.department} ${row.kpiLabel}`.toLowerCase().includes(q)) return false;
    if (department !== 'All departments' && row.goal.department !== department) return false;
    if (statusFilter !== 'All statuses' && row.health !== statusFilter && row.goal.status !== statusFilter) return false;
    if (healthFilter !== 'Alignment health') {
      if (healthFilter === 'Aligned' && !row.goal.parentObjectiveId) return false;
      if (healthFilter === 'Orphaned' && row.goal.parentObjectiveId) return false;
      if (['On Track', 'At Risk', 'Overdue', 'Not Started', 'Completed'].includes(healthFilter) && row.health !== healthFilter) return false;
    }
    return true;
  }), [enriched, query, department, statusFilter, healthFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const weightsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const goal of goals) {
      if (['Cancelled', 'Archived'].includes(goal.status)) continue;
      const key = goal.employeeId || goal.employeeCode || goal.employeeName;
      map.set(key, (map.get(key) || 0) + Number(goal.weight || 0));
    }
    return map;
  }, [goals]);

  const employeesAt100 = Array.from(weightsByEmployee.values()).filter((weight) => Math.abs(weight - 100) < 0.01).length;
  const employeesOver = Array.from(weightsByEmployee.values()).filter((weight) => weight > 100.01).length;
  const orphaned = goals.filter((goal) => !goal.parentObjectiveId).length;
  const awaitingAck = goals.filter((goal) => ['Assigned', 'Resubmitted'].includes(goal.status) && !goal.acknowledgedAt).length;
  const atRisk = enriched.filter((row) => row.health === 'At Risk').length;
  const overdue = enriched.filter((row) => row.health === 'Overdue').length;
  const completed = enriched.filter((row) => row.health === 'Completed').length;
  const onTrack = enriched.filter((row) => row.health === 'On Track').length;
  const notStarted = enriched.filter((row) => row.health === 'Not Started').length;
  const weightExceptions = employeesOver;
  const overallProgress = goals.length ? Math.round(goals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0) / goals.length) : 0;
  const alignedPct = goals.length ? Math.round(((goals.length - orphaned) / goals.length) * 100) : 0;
  const weightsValidated = employeesOver === 0 && goals.length > 0;
  const managerApprovedPct = goals.length
    ? Math.round((goals.filter((goal) => ['Agreed', 'Active', 'Completed', 'Assigned', 'Resubmitted'].includes(goal.status)).length / goals.length) * 100)
    : 0;
  const employeeAckPct = goals.length
    ? Math.round((goals.filter((goal) => Boolean(goal.acknowledgedAt) || ['Agreed', 'Active', 'Completed'].includes(goal.status)).length / goals.length) * 100)
    : 0;
  const hrExceptionsPct = goals.length ? Math.min(100, Math.round((weightExceptions / Math.max(goals.length, 1)) * 100)) : 0;
  const exceptionCount = weightExceptions + orphaned + overdue;
  const nextCheckIn = activeCycle?.goalSettingEnd || checkIns[0]?.date || activeCycle?.midYearStart || '';

  const keyResults = useMemo(() => {
    const items = goals.flatMap((goal) => goal.keyResults.map((kr) => ({
      goal,
      kr,
      actual: kr.actual != null ? Number(kr.actual) : Math.round((goal.progressPercent / 100) * Number(kr.target || 100)),
      pct: (() => {
        const target = Number(kr.target) || 0;
        if (target <= 0) return 0;
        const actual = kr.actual != null ? Number(kr.actual) : Math.round((goal.progressPercent / 100) * target);
        return Math.max(0, Math.min(100, Math.round((actual / target) * 100)));
      })(),
    })));
    return items.slice(0, 6);
  }, [goals]);

  const assignGoal = async () => {
    await onAction('goal.upsert', {
      cycleId: cycleId || activeCycle?.id,
      employeeId: form.employeeId || payload.actor.employeeId,
      employeeCode: form.employeeCode || payload.actor.employeeCode,
      employeeName: form.employeeName || payload.actor.fullName,
      department: form.department || 'General',
      title: form.title || 'Employee objective',
      description: '',
      parentObjectiveId: form.parentObjectiveId || undefined,
      weight: Number(form.weight || 100),
      keyResults: [
        { title: 'Primary KPI', baseline: 0, target: 100, unit: '%', weight: 60 },
        { title: 'Quality milestone', baseline: 0, target: 100, unit: '%', weight: 40 },
      ],
    });
    setAssigning(false);
    setForm({ employeeName: '', employeeId: '', employeeCode: '', title: '', department: '', parentObjectiveId: '', weight: '100' });
  };

  const pct = (count: number) => (goals.length ? Math.round((count / goals.length) * 100) : 0);

  return (
    <div className="space-y-4 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">OKR & KPI Management</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Assign measurable goals, track key results, and govern acknowledgement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
            {!cycles.length ? <option value="">No cycles</option> : null}
          </select>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            <FileText className="h-3.5 w-3.5" /> Goal templates
          </button>
          {(isHrScope || payload.actor?.scope === 'team') ? (
            <button type="button" disabled={busy} onClick={() => setAssigning(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Assign goal
            </button>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl border border-[#84caff] bg-[#0b4a9b] p-4 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-bold">{activeCycle?.name || 'Goal'} Goal Governance · {activeCycle?.status || 'Inactive'}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill label={weightsValidated ? 'Weights validated' : 'Weights need review'} />
              <span className="inline-flex items-center rounded-full border border-[#b2ddff] bg-[#175cd3] px-2 py-0.5 text-[10px] font-semibold text-white">Alignment {alignedPct}%</span>
              <span className="inline-flex items-center rounded-full border border-[#b2ddff] bg-[#175cd3] px-2 py-0.5 text-[10px] font-semibold text-white">Next check-in {safeFmtDate(nextCheckIn)}</span>
            </div>
          </div>
          <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                <span className="text-[#b2ddff]">Overall progress</span>
                <span>{overallProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1849a9]">
                <div className="h-full rounded-full bg-[#84caff]" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>
            <button type="button" onClick={() => setActiveTab('Exceptions')} className="h-9 shrink-0 rounded-lg bg-white px-3 text-[11px] font-semibold text-[#175cd3]">
              Review exceptions
            </button>
          </div>
        </div>
      </section>

      <div className="flex gap-1 overflow-x-auto border-b border-[#eaecf0]">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold transition ${
              activeTab === tab ? 'border-b-2 border-[#1570ef] text-[#1570ef]' : 'text-[#475467] hover:text-[#1570ef]'
            }`}
          >
            {tab}
            {tab === 'Exceptions' && exceptionCount > 0 ? (
              <span className="rounded-full bg-[#f04438] px-1.5 py-0.5 text-[9px] font-bold text-white">{exceptionCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { icon: Target, label: 'Total goals', value: String(goals.length), sub: 'In selected cycle', tone: 'blue' as const },
              { icon: Clock3, label: 'Awaiting acknowledgement', value: String(awaitingAck), sub: `${pct(awaitingAck)}%`, tone: 'yellow' as const },
              { icon: AlertTriangle, label: 'At risk', value: String(atRisk), sub: `${pct(atRisk)}%`, tone: 'orange' as const },
              { icon: XCircle, label: 'Overdue', value: String(overdue), sub: `${pct(overdue)}%`, tone: 'red' as const },
              { icon: CheckCircle2, label: 'Completed', value: String(completed), sub: `${pct(completed)}%`, tone: 'green' as const },
              { icon: Scale, label: 'Weight exceptions', value: String(weightExceptions), sub: weightExceptions ? 'Require attention' : 'Clear', tone: 'purple' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    kpi.tone === 'yellow' ? 'bg-[#fffaeb] text-[#dc6803]'
                      : kpi.tone === 'orange' ? 'bg-[#fff6ed] text-[#dc6803]'
                        : kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#d92d20]'
                          : kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]'
                            : kpi.tone === 'purple' ? 'bg-[#f4f3ff] text-[#6938ef]'
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
                  <h3 className="mr-auto text-sm font-bold">Employee Goal Register</h3>
                  <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
                    <Search className="h-3.5 w-3.5 text-[#667085]" />
                    <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employees or goals..." className="w-full border-0 bg-transparent text-[11px] outline-none" />
                  </label>
                  <select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    <option>All statuses</option>
                    <option>On Track</option>
                    <option>At Risk</option>
                    <option>Overdue</option>
                    <option>Not Started</option>
                    <option>Completed</option>
                    <option>Assigned</option>
                    <option>Agreed</option>
                  </select>
                  <select value={healthFilter} onChange={(e) => { setHealthFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    <option>Alignment health</option>
                    <option>Aligned</option>
                    <option>Orphaned</option>
                    <option>On Track</option>
                    <option>At Risk</option>
                  </select>
                  <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold text-[#344054]">
                    <Filter className="h-3.5 w-3.5" /> Filters
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[1100px]">
                    <div className="grid grid-cols-[1.5fr_1.3fr_1.1fr_0.45fr_0.7fr_0.7fr_0.85fr_0.7fr_0.45fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                      <span>Employee & Goal</span>
                      <span>Alignment Path</span>
                      <span>KPI / Target</span>
                      <span>Weight</span>
                      <span>Progress</span>
                      <span>Status</span>
                      <span>Approval</span>
                      <span>Next Update</span>
                      <span>Actions</span>
                    </div>
                    {rows.map((row) => (
                      <div key={row.goal.id} className="grid grid-cols-[1.5fr_1.3fr_1.1fr_0.45fr_0.7fr_0.7fr_0.85fr_0.7fr_0.45fr] items-center border-b border-[#eaecf0] px-3 py-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{initials(row.goal.employeeName)}</span>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold">{row.goal.employeeName}</p>
                            <p className="truncate text-[10px] font-semibold text-[#667085]">{row.goal.title}</p>
                          </div>
                        </div>
                        <p className="truncate text-[10px] font-semibold text-[#475467]">{row.alignment}</p>
                        <p className="truncate text-[10px] font-semibold text-[#344054]">{row.kpiLabel}</p>
                        <p className="text-[11px] font-bold">{row.goal.weight}%</p>
                        <MiniBar value={row.goal.progressPercent} dual />
                        <StatusPill label={row.health} />
                        <StatusPill label={row.approval} />
                        <p className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.nextUpdate)}</p>
                        <button type="button" onClick={() => setDrawer(row.goal)} className="p-1 text-[#667085]" aria-label="Open goal">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {!rows.length ? (
                      <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No employee goals match these filters.</div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaecf0] px-3 py-2 text-[10px] text-[#667085]">
                  <span>
                    Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    {Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1).map((num) => (
                      <button key={num} type="button" onClick={() => setPage(num)} className={`grid h-7 w-7 place-items-center rounded ${page === num ? 'bg-[#1570ef] text-white' : 'border border-[#eaecf0]'}`}>
                        {num}
                      </button>
                    ))}
                    {pageCount > 3 ? <span className="px-1">… {pageCount}</span> : null}
                    <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">Goal Weight & Alignment Validation</h3>
                  <button type="button" onClick={() => setActiveTab('Exceptions')} className="h-8 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold text-[#344054]">
                    Resolve validation issues
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-[#abefc6] bg-[#ecfdf3] p-3">
                    <div className="flex items-center gap-2 text-[#027a48]"><CheckCircle2 className="h-4 w-4" /><span className="text-[11px] font-bold">Balanced weights</span></div>
                    <p className="mt-2 text-2xl font-bold text-[#027a48]">{employeesAt100}</p>
                    <p className="text-[10px] font-semibold text-[#027a48]">Employees at 100% weight</p>
                  </div>
                  <div className="rounded-lg border border-[#fecdca] bg-[#fef3f2] p-3">
                    <div className="flex items-center gap-2 text-[#b42318]"><XCircle className="h-4 w-4" /><span className="text-[11px] font-bold">Over weight</span></div>
                    <p className="mt-2 text-2xl font-bold text-[#b42318]">{employeesOver}</p>
                    <p className="text-[10px] font-semibold text-[#b42318]">Employees exceeding 100%</p>
                  </div>
                  <div className="rounded-lg border border-[#fedf89] bg-[#fffaeb] p-3">
                    <div className="flex items-center gap-2 text-[#b54708]"><AlertTriangle className="h-4 w-4" /><span className="text-[11px] font-bold">Orphaned goals</span></div>
                    <p className="mt-2 text-2xl font-bold text-[#b54708]">{orphaned}</p>
                    <p className="text-[10px] font-semibold text-[#b54708]">No parent company objective</p>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
                <div className="border-b border-[#eaecf0] px-4 py-3">
                  <h3 className="text-sm font-bold">Key Result Performance</h3>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.7fr_0.7fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                      <span>Key Result</span>
                      <span>Actual vs Target</span>
                      <span>Progress</span>
                      <span>Trend</span>
                      <span>Status</span>
                    </div>
                    {keyResults.map(({ goal, kr, actual, pct: krPct }) => (
                      <div key={`${goal.id}-${kr.id}`} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.7fr_0.7fr] items-center border-b border-[#eaecf0] px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold">{kr.title}</p>
                          <p className="truncate text-[9px] font-semibold text-[#667085]">{goal.employeeName}</p>
                        </div>
                        <p className="text-[11px] font-semibold">{actual} / {kr.target}{kr.unit}</p>
                        <MiniBar value={krPct} />
                        <Sparkline value={krPct} />
                        <StatusPill label={krPct >= 85 ? 'On Track' : krPct >= 50 ? 'At Risk' : 'Behind'} />
                      </div>
                    ))}
                    {!keyResults.length ? <div className="px-4 py-8 text-center text-sm font-semibold text-[#667085]">No key results yet.</div> : null}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Exceptions Requiring Attention</h3>
                <ul className="space-y-2">
                  {[
                    { severity: 'High', text: `${employeesOver} employee${employeesOver === 1 ? '' : 's'} with overweight goals`, show: employeesOver > 0 },
                    { severity: 'High', text: `${overdue} overdue goal${overdue === 1 ? '' : 's'}`, show: overdue > 0 },
                    { severity: 'Medium', text: `${orphaned} orphaned goal${orphaned === 1 ? '' : 's'} without parent objective`, show: orphaned > 0 },
                    { severity: 'Medium', text: `${awaitingAck} goal${awaitingAck === 1 ? '' : 's'} awaiting acknowledgement`, show: awaitingAck > 0 },
                    { severity: 'Low', text: 'No critical goal exceptions', show: exceptionCount === 0 },
                  ].filter((item) => item.show).map((item) => (
                    <li key={item.text} className="flex items-center justify-between gap-3 rounded-lg border border-[#eaecf0] bg-[#f9fafb] px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <StatusPill label={item.severity} />
                        <span className="text-[11px] font-semibold text-[#344054]">{item.text}</span>
                      </div>
                      <button type="button" onClick={() => setActiveTab('Exceptions')} className="text-[10px] font-bold text-[#1570ef]">Review</button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Goal Health</h3>
                <HealthDonut onTrack={onTrack} atRisk={atRisk} overdue={overdue} notStarted={notStarted} />
                <ul className="mt-4 space-y-2 text-[11px]">
                  {[
                    ['On track', onTrack, '#12b76a'],
                    ['At risk', atRisk, '#f79009'],
                    ['Overdue', overdue, '#f04438'],
                    ['Not started', notStarted, '#98a2b3'],
                  ].map(([label, count, color]) => (
                    <li key={String(label)} className="flex items-center justify-between border-t border-[#eaecf0] py-2">
                      <span className="inline-flex items-center gap-2 font-semibold text-[#475467]">
                        <i className="h-2.5 w-2.5 rounded-full" style={{ background: String(color) }} />
                        {label}
                      </span>
                      <b>{count}</b>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Approval & Acknowledgement</h3>
                {[
                  ['Manager approval', managerApprovedPct],
                  ['Employee acknowledgement', employeeAckPct],
                  ['HR exceptions', hrExceptionsPct],
                ].map(([label, value]) => (
                  <div key={String(label)} className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-[#475467]">{label}</span>
                      <span>{value}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div className={`h-full rounded-full ${label === 'HR exceptions' ? 'bg-[#f04438]' : 'bg-[#1570ef]'}`} style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Upcoming Deadlines</h3>
                {[
                  [nextCheckIn, 'Check-in window closes'],
                  [activeCycle?.midYearStart, 'Goal change cutoff'],
                  [activeCycle?.midYearStart || activeCycle?.yearEndStart, 'Mid-year review opens'],
                ].filter(([date]) => Boolean(date)).map(([date, title]) => (
                  <div key={String(title)} className="flex items-center gap-2 border-t border-[#eaecf0] py-2.5">
                    <CalendarDays className="h-3.5 w-3.5 text-[#1570ef]" />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-[#344054]">{title}</p>
                      <p className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(String(date))}</p>
                    </div>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        </>
      ) : (
        <section className="rounded-xl border border-[#eaecf0] bg-white px-6 py-20 text-center shadow-sm">
          <Settings2 className="mx-auto h-11 w-11 text-[#1570ef]" />
          <h2 className="mt-4 text-xl font-bold">{activeTab}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[#667085]">
            This OKR workspace section is ready for {activeTab.toLowerCase()} detail content.
          </p>
          <button type="button" onClick={() => setActiveTab('Overview')} className="mt-6 inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-4 text-[11px] font-semibold text-white">
            Back to Overview
          </button>
        </section>
      )}

      {assigning ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close assign dialog" onClick={() => setAssigning(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">Assign goal</h2>
                <p className="mt-1 text-xs text-[#667085]">Create a measurable employee objective with key results.</p>
              </div>
              <button type="button" onClick={() => setAssigning(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3">
              <label className="text-[11px] font-semibold text-[#344054]">Goal title
                <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Deliver assigned annual workplan outcomes" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold text-[#344054]">Employee name
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.employeeName} onChange={(e) => setForm((f) => ({ ...f, employeeName: e.target.value }))} />
                </label>
                <label className="text-[11px] font-semibold text-[#344054]">Employee ID
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold text-[#344054]">Department
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                </label>
                <label className="text-[11px] font-semibold text-[#344054]">Weight %
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
                </label>
              </div>
              <label className="text-[11px] font-semibold text-[#344054]">Parent company objective
                <select className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm" value={form.parentObjectiveId} onChange={(e) => setForm((f) => ({ ...f, parentObjectiveId: e.target.value }))}>
                  <option value="">Optional</option>
                  {objectives.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAssigning(false)} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void assignGoal()} className="h-9 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50">Assign goal</button>
            </div>
          </div>
        </>
      ) : null}

      {drawer ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close drawer" onClick={() => setDrawer(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-white shadow-[-12px_0_40px_#0c111d22]">
            <div className="flex items-start justify-between border-b border-[#eaecf0] p-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#1570ef]">{drawer.employeeName}</p>
                <h2 className="mt-1 text-xl font-bold">{drawer.title}</h2>
                <p className="mt-1 text-sm text-[#667085]">{drawer.department || '—'} · v{drawer.version}</p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-wrap gap-2">
                <StatusPill label={healthOf(drawer)} />
                <StatusPill label={approvalOf(drawer)} />
              </div>
              <dl className="mt-5">
                {[
                  ['Weight', `${drawer.weight}%`],
                  ['Progress', `${drawer.progressPercent}%`],
                  ['Status', drawer.status],
                  ['Due', safeFmtDate(drawer.dueDate)],
                  ['Key results', String(drawer.keyResults.length)],
                ].map(([dt, dd]) => (
                  <div key={dt} className="flex items-center justify-between border-b border-[#eaecf0] py-3 text-sm">
                    <dt className="text-[#667085]">{dt}</dt>
                    <dd className="font-semibold">{dd}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 space-y-2">
                {drawer.keyResults.map((kr) => (
                  <div key={kr.id} className="rounded-lg border border-[#eaecf0] p-3">
                    <p className="text-[11px] font-bold">{kr.title}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#667085]">Target {kr.target}{kr.unit} · Weight {kr.weight}%</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {['Assigned', 'Resubmitted'].includes(drawer.status) ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void onAction('goal.request-discussion', { id: drawer.id, comment: 'Please clarify targets' })} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-xs font-semibold disabled:opacity-50">
                      Request discussion
                    </button>
                    <button type="button" disabled={busy} onClick={() => void onAction('goal.acknowledge', { id: drawer.id })} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge
                    </button>
                  </>
                ) : null}
                {drawer.status === 'Discussion Requested' ? (
                  <button type="button" disabled={busy} onClick={() => void onAction('goal.upsert', { id: drawer.id, title: drawer.title, reason: 'Manager response / revision' })} className="h-9 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50">
                    Resubmit after discussion
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
