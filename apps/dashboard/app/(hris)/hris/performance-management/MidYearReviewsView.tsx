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
  Filter,
  MoreVertical,
  Plus,
  Search,
  Target,
  Users,
  X,
} from 'lucide-react';
import type { EmployeeGoal, PerformanceAssessment, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Review Register',
  'Goal Assessment',
  'Competencies',
  'Evidence',
  'Change Requests',
  'Approvals',
  'Exceptions',
  'Audit & History',
] as const;

type TabId = (typeof TABS)[number];
type RowStatus = 'Completed' | 'Awaiting employee' | 'Awaiting manager' | 'Overdue' | 'Blocked' | 'Not started';

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

const StatusPill = ({ label }: { label: string }) => {
  const key = label.toLowerCase();
  const style =
    key.includes('completed') || key.includes('approved') || key.includes('on track') || key.includes('submitted') || key.includes('valid')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('awaiting employee') || key.includes('in progress') || key.includes('pending') || key.includes('manager review')
        ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
        : key.includes('awaiting manager') || key.includes('hr review')
          ? 'bg-[#f4f3ff] text-[#5925dc] border-[#d9d6fe]'
          : key.includes('overdue') || key.includes('blocked') || key.includes('high')
            ? 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]'
            : 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>;
};

const ReadinessDonut = ({ value }: { value: number }) => (
  <div
    className="relative mx-auto grid h-[110px] w-[110px] place-items-center rounded-full"
    style={{ background: `conic-gradient(#1570ef ${Math.max(0, Math.min(100, value)) * 3.6}deg, #e4e7ec 0)` }}
  >
    <span className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center">
      <b className="text-xl font-bold text-[#101828]">{value}%</b>
      <small className="text-[8px] font-semibold uppercase text-[#667085]">Ready</small>
    </span>
  </div>
);

function reviewStage(assessment?: PerformanceAssessment): { employee: string; manager: string; status: RowStatus } {
  if (!assessment) return { employee: 'Not started', manager: 'Not started', status: 'Not started' };
  if (['Approved', 'Published', 'Closed'].includes(assessment.status)) {
    return { employee: `Submitted ${safeFmtDate(assessment.submittedAt)}`, manager: 'Completed', status: 'Completed' };
  }
  if (assessment.status === 'Pending Manager' || assessment.status === 'Pending HR' || assessment.status === 'Pending Calibration') {
    return { employee: `Submitted ${safeFmtDate(assessment.submittedAt)}`, manager: 'In progress', status: 'Awaiting manager' };
  }
  if (assessment.status === 'Returned') {
    return { employee: 'Returned', manager: 'Returned', status: 'Blocked' };
  }
  if (['Draft', 'Not Started'].includes(assessment.status)) {
    return { employee: 'In progress', manager: 'Not started', status: 'Awaiting employee' };
  }
  if (assessment.status === 'Submitted') {
    return { employee: `Submitted ${safeFmtDate(assessment.submittedAt)}`, manager: 'In progress', status: 'Awaiting manager' };
  }
  return { employee: assessment.status, manager: assessment.status, status: 'Awaiting manager' };
}

export default function MidYearReviewsView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const isHrScope = payload.actor?.scope === 'global';
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [managerFilter, setManagerFilter] = useState('All managers');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<{ employeeId: string; employeeName: string; department: string } | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeGoalId, setChangeGoalId] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const pageSize = 10;

  const eligibility = useMemo(
    () => (domain.eligibility || []).filter((row) => (!cycleId || row.cycleId === cycleId) && row.included),
    [domain.eligibility, cycleId],
  );
  const midYearAudit = useMemo(
    () => (domain.audit || []).filter((row) => ['PerformanceAssessment', 'EmployeeGoal', 'PerformanceTask'].includes(row.entityType)
      && /mid[- ]?year|assessment|goal/i.test(`${row.action} ${row.entityType}`)).slice(0, 50),
    [domain.audit],
  );
  const behaviours = domain.config?.behaviourIndicators || [];

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const goals = useMemo(
    () => (domain.goals || []).filter((goal) => !cycleId || goal.cycleId === cycleId),
    [domain.goals, cycleId],
  );
  const assessments = useMemo(
    () => (domain.assessments || []).filter((item) => item.type === 'Mid-Year' && (!cycleId || item.cycleId === cycleId)),
    [domain.assessments, cycleId],
  );
  const changeTasks = useMemo(
    () => (domain.tasks || []).filter((task) => task.type === 'Mid-Year Change' && (!cycleId || !task.cycleId || task.cycleId === cycleId)),
    [domain.tasks, cycleId],
  );

  const windowStart = activeCycle?.midYearStart || activeCycle?.startDate || '';
  const windowEnd = activeCycle?.midYearEnd || activeCycle?.goalSettingEnd || activeCycle?.endDate || '';
  const windowOpen = Boolean(activeCycle && !['Closed', 'Archived', 'Draft'].includes(activeCycle.status));

  const register = useMemo(() => {
    const byEmployee = new Map<string, {
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      department: string;
      managerName: string;
      goals: EmployeeGoal[];
    }>();

    for (const row of eligibility) {
      byEmployee.set(row.employeeId, {
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        employeeName: row.fullName,
        department: row.department || '—',
        managerName: row.managerName || '—',
        goals: [],
      });
    }

    for (const goal of goals) {
      const key = goal.employeeId || goal.employeeCode || goal.employeeName;
      const existing = byEmployee.get(key);
      if (existing) {
        existing.goals.push(goal);
        if (!existing.department || existing.department === '—') existing.department = goal.department || existing.department;
        if (!existing.managerName || existing.managerName === '—') existing.managerName = goal.managerName || existing.managerName;
        if (!existing.employeeCode) existing.employeeCode = goal.employeeCode;
      } else {
        byEmployee.set(key, {
          employeeId: goal.employeeId,
          employeeCode: goal.employeeCode,
          employeeName: goal.employeeName,
          department: goal.department || '—',
          managerName: goal.managerName || '—',
          goals: [goal],
        });
      }
    }

    for (const assessment of assessments) {
      const key = assessment.employeeId || assessment.employeeName;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employeeId: assessment.employeeId,
          employeeCode: assessment.employeeId,
          employeeName: assessment.employeeName,
          department: '—',
          managerName: '—',
          goals: [],
        });
      }
    }

    const today = new Date();
    return Array.from(byEmployee.values()).map((row) => {
      const assessment = assessments.find((item) => item.employeeId === row.employeeId || item.employeeName === row.employeeName);
      const stage = reviewStage(assessment);
      const weight = row.goals.filter((goal) => !['Cancelled', 'Archived'].includes(goal.status)).reduce((sum, goal) => sum + Number(goal.weight || 0), 0);
      const due = windowEnd || row.goals[0]?.dueDate || '';
      const dueDate = due?.slice(0, 10);
      const isOverdue = Boolean(dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && new Date(`${dueDate}T00:00:00`) < today && stage.status !== 'Completed');
      const blocked = stage.status === 'Blocked' || row.goals.some((goal) => goal.status === 'Discussion Requested');
      let status: RowStatus = stage.status;
      if (blocked) status = 'Blocked';
      else if (isOverdue && status !== 'Completed') status = 'Overdue';
      return {
        ...row,
        assessment,
        stage,
        status,
        weight,
        goalCount: row.goals.length,
        due,
        readinessOk: row.goals.length > 0 && Math.abs(weight - 100) < 0.01,
      };
    });
  }, [eligibility, goals, assessments, windowEnd]);

  const departments = useMemo(
    () => ['All departments', ...Array.from(new Set(register.map((row) => row.department).filter((d) => d && d !== '—'))).sort()],
    [register],
  );
  const managers = useMemo(
    () => ['All managers', ...Array.from(new Set(register.map((row) => row.managerName).filter((d) => d && d !== '—'))).sort()],
    [register],
  );

  const filtered = useMemo(() => register.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.employeeName} ${row.employeeCode} ${row.department} ${row.managerName}`.toLowerCase().includes(q)) return false;
    if (statusFilter !== 'All statuses' && row.status !== statusFilter) return false;
    if (departmentFilter !== 'All departments' && row.department !== departmentFilter) return false;
    if (managerFilter !== 'All managers' && row.managerName !== managerFilter) return false;
    return true;
  }), [register, query, statusFilter, departmentFilter, managerFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const eligible = register.length;
  const completed = register.filter((row) => row.status === 'Completed').length;
  const awaitingEmployee = register.filter((row) => row.status === 'Awaiting employee' || row.status === 'Not started').length;
  const awaitingManager = register.filter((row) => row.status === 'Awaiting manager').length;
  const overdue = register.filter((row) => row.status === 'Overdue').length;
  const blocked = register.filter((row) => row.status === 'Blocked').length;
  const completePct = eligible ? Math.round((completed / eligible) * 100) : 0;
  const goalsValid = register.filter((row) => row.goalCount > 0).length;
  const weightsOk = register.filter((row) => row.readinessOk).length;
  const managersAssigned = register.filter((row) => row.managerName && row.managerName !== '—').length;
  const readinessPct = eligible
    ? Math.round((((goalsValid / eligible) + (weightsOk / eligible) + (managersAssigned / eligible) + (completed / Math.max(eligible, 1))) / 4) * 100)
    : 0;

  const changeRequests = useMemo(() => {
    const fromTasks = changeTasks.map((task) => {
      const goal = goals.find((item) => item.employeeId === task.employeeId && task.title.includes(item.title.slice(0, 12)))
        || goals.find((item) => item.employeeId === task.employeeId);
      return {
        id: task.id,
        goalTitle: goal?.title || task.title.replace('Review mid-year goal change: ', ''),
        employeeName: task.employeeName,
        employeeId: task.employeeId,
        employeeCode: goal?.employeeCode || task.employeeId,
        change: goal?.discussionComment || 'Target / scope adjustment',
        impact: Math.abs((goal?.weight || 0) - 20) > 30 ? 'High' : (goal?.weight || 0) >= 25 ? 'Medium' : 'Low',
        submitted: task.createdAt || task.dueDate,
        status: task.status === 'Completed' ? 'Approved' : task.status === 'In Progress' ? 'HR review' : 'Manager review',
        goalId: goal?.id || '',
      };
    });
    const fromGoals = goals
      .filter((goal) => goal.status === 'Discussion Requested')
      .filter((goal) => !fromTasks.some((row) => row.goalId === goal.id))
      .map((goal) => ({
        id: `goal-${goal.id}`,
        goalTitle: goal.title,
        employeeName: goal.employeeName,
        employeeId: goal.employeeId,
        employeeCode: goal.employeeCode,
        change: goal.discussionComment || 'Mid-year change requested',
        impact: Math.abs((goal?.weight || 0) - 20) > 30 ? 'High' : (goal?.weight || 0) >= 25 ? 'Medium' : 'Low',
        submitted: goal.updatedAt,
        status: 'Manager review',
        goalId: goal.id,
      }));
    return [...fromTasks, ...fromGoals];
  }, [changeTasks, goals]);

  const pendingManagerChanges = changeRequests.filter((row) => row.status === 'Manager review').length;
  const hrReviewChanges = changeRequests.filter((row) => row.status === 'HR review').length;
  const approvedChanges = changeRequests.filter((row) => row.status === 'Approved').length;

  const populationBase = Math.max(eligibility.length, activeCycle?.eligibilityCount || 0, eligible);
  const populationPct = populationBase ? Math.round((eligible / populationBase) * 100) : 0;
  const evidenceConfigured = assessments.some((row) => row.items.some((item) => Boolean(item.evidence))) || behaviours.length > 0;

  const startReview = async (employeeId?: string, employeeName?: string) => {
    const targetId = employeeId || payload.actor.employeeId;
    const targetName = employeeName || payload.actor.fullName;
    const employeeGoals = goals.filter((goal) => goal.employeeId === targetId);
    if (!employeeGoals.length) return;
    await onAction('assessment.save', {
      cycleId: cycleId || activeCycle?.id,
      type: 'Mid-Year',
      employeeId: targetId,
      employeeName: targetName,
      status: 'Draft',
      items: employeeGoals.slice(0, 8).map((goal) => ({
        itemId: goal.id,
        itemType: 'okr',
        title: goal.title,
        weight: goal.weight,
        achievement: goal.achievementScore ?? goal.progressPercent,
      })),
    });
  };

  const submitChangeRequest = async () => {
    if (!changeGoalId) return;
    await onAction('midyear.change-request', { goalId: changeGoalId, reason: changeReason.trim() || 'Requested mid-year goal change' });
    setChangeOpen(false);
    setChangeGoalId('');
    setChangeReason('');
  };

  const goalAssessmentRows = useMemo(() => {
    return assessments.flatMap((assessment) => assessment.items.filter((item) => item.itemType === 'okr').map((item) => ({
      assessment,
      item,
      goal: goals.find((goal) => goal.id === item.itemId),
    })));
  }, [assessments, goals]);

  const competencyRows = useMemo(() => {
    const fromAssessments = assessments.flatMap((assessment) => assessment.items.filter((item) => item.itemType === 'behaviour').map((item) => ({
      assessment,
      item,
    })));
    if (fromAssessments.length) return fromAssessments;
    return behaviours.map((ind) => ({
      assessment: undefined as PerformanceAssessment | undefined,
      item: { itemId: ind.id, itemType: 'behaviour' as const, title: ind.name, weight: ind.weight },
    }));
  }, [assessments, behaviours]);

  const evidenceRows = useMemo(() => assessments.flatMap((assessment) => assessment.items
    .filter((item) => Boolean(item.evidence) || Boolean(item.selfNarrative) || Boolean(item.managerNarrative))
    .map((item) => ({ assessment, item }))), [assessments]);

  const pct = (count: number) => (eligible ? Math.round((count / eligible) * 100) : 0);

  return (
    <div className="space-y-4 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Mid-Year Reviews</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Governed interim assessment, feedback, evidence and goal-change control.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
            {!cycles.length ? <option value="">No cycles</option> : null}
          </select>
          <span className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold ${windowOpen ? 'border-[#abefc6] bg-[#ecfdf3] text-[#027a48]' : 'border-[#eaecf0] bg-[#f9fafb] text-[#667085]'}`}>
            <i className={`h-2 w-2 rounded-full ${windowOpen ? 'bg-[#12b76a]' : 'bg-[#98a2b3]'}`} />
            {windowOpen ? 'Review window open' : 'Review window closed'}
          </span>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" disabled={busy || !windowOpen} onClick={() => void startReview()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
            Start review
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-[#b2ddff] bg-[#f5faff] p-4">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_180px] lg:items-center">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#1570ef] text-white">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#175cd3]">Mid-year review window</p>
              <p className="mt-1 text-[12px] font-bold text-[#101828]">
                {windowStart && windowEnd ? `${safeFmtDate(windowStart)} – ${safeFmtDate(windowEnd)}` : 'Dates not configured'}
              </p>
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-2xl font-bold text-[#101828]">{eligible}</p>
                <p className="text-[11px] font-semibold text-[#667085]">eligible employees</p>
              </div>
              <p className="text-[12px] font-bold text-[#1570ef]">{completePct}% complete</p>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#d1e9ff]">
              <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${completePct}%` }} />
            </div>
          </div>
          <div className="flex gap-4 lg:justify-end">
            <div className="text-center">
              <p className="text-lg font-bold text-[#b42318]">{overdue}</p>
              <p className="text-[10px] font-semibold text-[#b42318]">Overdue</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-[#b54708]">{blocked}</p>
              <p className="text-[10px] font-semibold text-[#b54708]">Blocked</p>
            </div>
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

      {activeTab === 'Overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { icon: Users, label: 'Eligible employees', value: String(eligible), sub: `${populationPct}% of population (${populationBase})`, tone: 'blue' as const },
              { icon: CheckCircle2, label: 'Reviews completed', value: String(completed), sub: `${completePct}% · ${completed ? 'On track' : 'Not started'}`, tone: 'green' as const },
              { icon: Clock3, label: 'Awaiting employee', value: String(awaitingEmployee), sub: `${pct(awaitingEmployee)}% · Employee action needed`, tone: 'orange' as const },
              { icon: Target, label: 'Awaiting manager', value: String(awaitingManager), sub: `${pct(awaitingManager)}% · Manager action needed`, tone: 'purple' as const },
              { icon: AlertTriangle, label: 'Overdue / blocked', value: `${overdue} / ${blocked}`, sub: overdue || blocked ? 'Requires attention' : 'Clear', tone: 'red' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]'
                      : kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#dc6803]'
                        : kpi.tone === 'purple' ? 'bg-[#f4f3ff] text-[#6938ef]'
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

          <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_280px]">
            <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
                <h3 className="mr-auto text-sm font-bold">Mid-year review register</h3>
                <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
                  <Search className="h-3.5 w-3.5 text-[#667085]" />
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employee, ID or department" className="w-full border-0 bg-transparent text-[11px] outline-none" />
                </label>
                <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                  <option>All statuses</option>
                  <option>Completed</option>
                  <option>Awaiting employee</option>
                  <option>Awaiting manager</option>
                  <option>Overdue</option>
                  <option>Blocked</option>
                  <option>Not started</option>
                </select>
                <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                  {departments.map((item) => <option key={item} value={item}>{item === 'All departments' ? 'Department' : item}</option>)}
                </select>
                <select value={managerFilter} onChange={(e) => { setManagerFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                  {managers.map((item) => <option key={item} value={item}>{item === 'All managers' ? 'Manager' : item}</option>)}
                </select>
                <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold text-[#344054]">
                  <Filter className="h-3.5 w-3.5" /> More filters
                </button>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1080px]">
                  <div className="grid grid-cols-[1.4fr_0.9fr_1fr_1fr_0.9fr_0.8fr_0.9fr_0.85fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                    <span>Employee</span>
                    <span>Department</span>
                    <span>Goal readiness</span>
                    <span>Employee review</span>
                    <span>Manager review</span>
                    <span>Due date</span>
                    <span>Status</span>
                    <span>Action</span>
                  </div>
                  {rows.map((row) => (
                    <div key={`${row.employeeId}-${row.employeeName}`} className="grid grid-cols-[1.4fr_0.9fr_1fr_1fr_0.9fr_0.8fr_0.9fr_0.85fr] items-center border-b border-[#eaecf0] px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{initials(row.employeeName)}</span>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold">{row.employeeName}</p>
                          <p className="truncate text-[9px] font-semibold text-[#667085]">{row.employeeCode || row.employeeId}</p>
                        </div>
                      </div>
                      <p className="truncate text-[11px] font-semibold text-[#475467]">{row.department}</p>
                      <p className={`text-[11px] font-semibold ${row.readinessOk ? 'text-[#027a48]' : 'text-[#b54708]'}`}>
                        {row.goalCount} goals · {row.weight}% weight
                      </p>
                      <p className="text-[10px] font-semibold text-[#344054]">{row.stage.employee}</p>
                      <p className="text-[10px] font-semibold text-[#344054]">{row.stage.manager}</p>
                      <div>
                        <p className="text-[10px] font-semibold">{safeFmtDate(row.due)}</p>
                        {row.status === 'Overdue' ? <span className="text-[9px] font-bold text-[#b42318]">Overdue</span> : row.status === 'Completed' ? <span className="text-[9px] font-bold text-[#027a48]">On track</span> : null}
                      </div>
                      <StatusPill label={row.status} />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy || (!row.assessment && !row.goals.length)}
                          onClick={() => {
                            setDrawer({ employeeId: row.employeeId, employeeName: row.employeeName, department: row.department });
                            if (!row.assessment && row.goals.length) void startReview(row.employeeId, row.employeeName);
                          }}
                          className="text-[10px] font-bold text-[#1570ef] hover:underline disabled:opacity-50"
                        >
                          {row.status === 'Completed' ? 'View review' : row.assessment ? 'Open review' : 'Start review'}
                        </button>
                        <button type="button" className="p-1 text-[#667085]" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                  {!rows.length ? (
                    <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No mid-year reviews match these filters.</div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaecf0] px-3 py-2 text-[10px] text-[#667085]">
                <span>
                  Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="grid h-7 w-7 place-items-center rounded bg-[#1570ef] text-white">{page}</span>
                  <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Review readiness</h3>
                <ReadinessDonut value={readinessPct} />
                <ul className="mt-4 space-y-2 text-[11px]">
                  {[
                    [`Goals valid (${goalsValid}/${eligible || 0})`, goalsValid === eligible && eligible > 0],
                    [`Weights equal 100% (${weightsOk}/${eligible || 0})`, weightsOk === eligible && eligible > 0],
                    [`Manager assigned (${managersAssigned}/${eligible || 0})`, managersAssigned === eligible && eligible > 0],
                    ['Evidence available', evidenceConfigured],
                  ].map(([label, ok]) => (
                    <li key={String(label)} className="flex items-center justify-between gap-2 border-t border-[#eaecf0] py-2">
                      <span className="font-semibold text-[#475467]">{label}</span>
                      {ok ? <CheckCircle2 className="h-4 w-4 text-[#12b76a]" /> : <AlertTriangle className="h-4 w-4 text-[#f79009]" />}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold">Key deadlines</h3>
                </div>
                {[
                  [windowEnd, 'Employee submission deadline', 'red'],
                  [activeCycle?.midYearEnd || windowEnd, 'Manager assessment deadline', 'orange'],
                  [activeCycle?.endDate, 'HR exception closure', 'blue'],
                ].filter(([date]) => Boolean(date)).map(([date, title, tone]) => (
                  <div key={String(title)} className="flex items-start gap-2 border-t border-[#eaecf0] py-2.5">
                    <CalendarDays className={`mt-0.5 h-3.5 w-3.5 ${tone === 'red' ? 'text-[#f04438]' : tone === 'orange' ? 'text-[#f79009]' : 'text-[#1570ef]'}`} />
                    <div>
                      <p className="text-[11px] font-semibold text-[#344054]">{title}</p>
                      <p className={`text-[10px] font-bold ${tone === 'red' ? 'text-[#b42318]' : tone === 'orange' ? 'text-[#b54708]' : 'text-[#175cd3]'}`}>
                        {safeFmtDate(String(date))}
                      </p>
                    </div>
                  </div>
                ))}
              </section>
            </aside>
          </div>

          <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#eaecf0] p-4 lg:flex-row lg:items-center">
              <div className="mr-auto">
                <h3 className="text-sm font-bold">Goal change requests</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill label={`Pending manager (${pendingManagerChanges})`} />
                  <StatusPill label={`HR review (${hrReviewChanges})`} />
                  <StatusPill label={`Approved (${approvedChanges})`} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChangeGoalId(goals[0]?.id || '');
                  setChangeOpen(true);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#84caff] bg-white px-3 text-[11px] font-semibold text-[#175cd3]"
              >
                <Plus className="h-3.5 w-3.5" /> New change request
              </button>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[1.3fr_1.2fr_1.3fr_0.6fr_0.7fr_0.8fr_0.8fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                  <span>Goal</span>
                  <span>Employee</span>
                  <span>Requested change</span>
                  <span>Impact</span>
                  <span>Submitted</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>
                {changeRequests.slice(0, 8).map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.3fr_1.2fr_1.3fr_0.6fr_0.7fr_0.8fr_0.8fr] items-center border-b border-[#eaecf0] px-3 py-3">
                    <p className="truncate text-[11px] font-bold">{row.goalTitle}</p>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#eff8ff] text-[9px] font-bold text-[#175cd3]">{initials(row.employeeName)}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold">{row.employeeName}</p>
                        <p className="truncate text-[9px] text-[#667085]">{row.employeeCode}</p>
                      </div>
                    </div>
                    <p className="truncate text-[11px] font-semibold text-[#475467]">{row.change}</p>
                    <p className="text-[11px] font-semibold">{row.impact}</p>
                    <p className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.submitted)}</p>
                    <StatusPill label={row.status} />
                    <button type="button" onClick={() => setActiveTab('Change Requests')} className="text-left text-[10px] font-bold text-[#1570ef]">Review request</button>
                  </div>
                ))}
                {!changeRequests.length ? (
                  <div className="px-4 py-10 text-center text-sm font-semibold text-[#667085]">No mid-year goal change requests yet.</div>
                ) : null}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'Review Register' ? (
        <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
            <h3 className="mr-auto text-sm font-bold">Review register</h3>
            <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
              <Search className="h-3.5 w-3.5 text-[#667085]" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employee, ID or department" className="w-full border-0 bg-transparent text-[11px] outline-none" />
            </label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
              <option>All statuses</option>
              <option>Completed</option>
              <option>Awaiting employee</option>
              <option>Awaiting manager</option>
              <option>Overdue</option>
              <option>Blocked</option>
              <option>Not started</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-[#f9fafb] text-[#667085]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Department</th>
                  <th className="px-3 py-2.5 font-semibold">Manager</th>
                  <th className="px-3 py-2.5 font-semibold">Goals</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Due</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={`reg-${row.employeeId}`} className="border-t border-[#eaecf0]">
                    <td className="px-3 py-3 font-bold">{row.employeeName}<p className="text-[10px] font-medium text-[#667085]">{row.employeeCode}</p></td>
                    <td className="px-3 py-3 font-semibold">{row.department}</td>
                    <td className="px-3 py-3 font-semibold">{row.managerName}</td>
                    <td className="px-3 py-3 font-semibold">{row.goalCount} · {row.weight}%</td>
                    <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                    <td className="px-3 py-3 font-semibold">{safeFmtDate(row.due)}</td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => setDrawer({ employeeId: row.employeeId, employeeName: row.employeeName, department: row.department })} className="text-[10px] font-bold text-[#1570ef]">Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <p className="px-4 py-10 text-center text-sm font-semibold text-[#667085]">No employees in register.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Goal Assessment' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Goal assessment</h3>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">OKR items captured on mid-year assessments.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-[#f9fafb] text-[#667085]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Goal / Item</th>
                  <th className="px-3 py-2.5 font-semibold">Weight</th>
                  <th className="px-3 py-2.5 font-semibold">Achievement</th>
                  <th className="px-3 py-2.5 font-semibold">Self</th>
                  <th className="px-3 py-2.5 font-semibold">Manager</th>
                  <th className="px-3 py-2.5 font-semibold">Review status</th>
                </tr>
              </thead>
              <tbody>
                {goalAssessmentRows.map(({ assessment, item, goal }) => (
                  <tr key={`${assessment.id}-${item.itemId}`} className="border-t border-[#eaecf0]">
                    <td className="px-3 py-3 font-bold">{assessment.employeeName}</td>
                    <td className="px-3 py-3 font-semibold">{item.title || goal?.title}</td>
                    <td className="px-3 py-3 font-semibold">{item.weight}%</td>
                    <td className="px-3 py-3 font-semibold">{item.achievement ?? goal?.progressPercent ?? '—'}</td>
                    <td className="px-3 py-3 font-semibold">{item.selfRating ?? '—'}</td>
                    <td className="px-3 py-3 font-semibold">{item.managerRating ?? '—'}</td>
                    <td className="px-3 py-3"><StatusPill label={assessment.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!goalAssessmentRows.length ? <p className="px-3 py-10 text-center text-[11px] font-semibold text-[#98a2b3]">No mid-year goal assessments yet. Start a review to create drafts.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Competencies' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Competencies</h3>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Behavioural indicators from mid-year reviews and organisation config.</p>
          <div className="mt-4 space-y-2">
            {competencyRows.map(({ assessment, item }, index) => (
              <div key={`${assessment?.id || 'cfg'}-${item.itemId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                <div>
                  <p className="font-bold">{item.title}</p>
                  <p className="text-[10px] font-semibold text-[#667085]">{assessment ? assessment.employeeName : 'Catalogue'} · Weight {item.weight}%</p>
                </div>
                <div className="flex items-center gap-2">
                  {'selfRating' in item && item.selfRating != null ? <StatusPill label={`Self ${item.selfRating}`} /> : null}
                  {'managerRating' in item && item.managerRating != null ? <StatusPill label={`Manager ${item.managerRating}`} /> : null}
                  {!assessment ? <StatusPill label="Configured" /> : <StatusPill label={assessment.status} />}
                </div>
              </div>
            ))}
            {!competencyRows.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No competency indicators configured.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Evidence' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Evidence</h3>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Narratives and evidence captured on mid-year assessment items.</p>
          <div className="mt-4 space-y-2">
            {evidenceRows.map(({ assessment, item }) => (
              <article key={`${assessment.id}-${item.itemId}-ev`} className="rounded-xl border border-[#eaecf0] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] font-bold">{assessment.employeeName} · {item.title}</p>
                  <StatusPill label={assessment.status} />
                </div>
                {item.evidence ? <p className="mt-2 text-[11px] font-semibold text-[#344054]">{item.evidence}</p> : null}
                {item.selfNarrative ? <p className="mt-1 text-[10px] font-medium text-[#667085]">Self: {item.selfNarrative}</p> : null}
                {item.managerNarrative ? <p className="mt-1 text-[10px] font-medium text-[#667085]">Manager: {item.managerNarrative}</p> : null}
              </article>
            ))}
            {!evidenceRows.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No evidence recorded yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Change Requests' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">Change requests</h3>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">{changeRequests.length} mid-year goal change request{changeRequests.length === 1 ? '' : 's'}</p>
            </div>
            <button type="button" onClick={() => { setChangeGoalId(goals[0]?.id || ''); setChangeOpen(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white">
              <Plus className="h-3.5 w-3.5" /> New change request
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {changeRequests.map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#eaecf0] px-3 py-3 text-[11px]">
                <div>
                  <p className="font-bold">{row.goalTitle}</p>
                  <p className="mt-1 font-semibold text-[#667085]">{row.employeeName} · {row.change}</p>
                  <p className="mt-1 text-[10px] font-semibold text-[#475467]">Impact {row.impact} · {safeFmtDate(row.submitted)}</p>
                </div>
                <StatusPill label={row.status} />
              </div>
            ))}
            {!changeRequests.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No change requests.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Approvals' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold">Awaiting manager ({awaitingManager})</h3>
            <div className="mt-3 space-y-2">
              {register.filter((row) => row.status === 'Awaiting manager').map((row) => (
                <div key={`ap-${row.employeeId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                  <div>
                    <p className="font-bold">{row.employeeName}</p>
                    <p className="text-[10px] font-semibold text-[#667085]">{row.department} · {row.stage.employee}</p>
                  </div>
                  {row.assessment ? (
                    <button type="button" onClick={() => setDrawer({ employeeId: row.employeeId, employeeName: row.employeeName, department: row.department })} className="rounded-lg bg-[#1570ef] px-2 py-1 text-[10px] font-semibold text-white">Review</button>
                  ) : null}
                </div>
              ))}
              {!awaitingManager ? <p className="text-[11px] font-semibold text-[#98a2b3]">No reviews awaiting manager.</p> : null}
            </div>
          </section>
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold">Completed ({completed})</h3>
            <div className="mt-3 space-y-2">
              {register.filter((row) => row.status === 'Completed').map((row) => (
                <div key={`done-${row.employeeId}`} className="flex items-center justify-between rounded-lg border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                  <p className="font-bold">{row.employeeName}</p>
                  <StatusPill label="Completed" />
                </div>
              ))}
              {!completed ? <p className="text-[11px] font-semibold text-[#98a2b3]">No completed mid-year reviews yet.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'Exceptions' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Exceptions</h3>
          <div className="mt-4 space-y-2">
            {register.filter((row) => ['Overdue', 'Blocked'].includes(row.status) || !row.readinessOk).map((row) => (
              <div key={`ex-${row.employeeId}`} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#eaecf0] px-3 py-3 text-[11px]">
                <div>
                  <StatusPill label={row.status === 'Overdue' || row.status === 'Blocked' ? 'High' : 'Medium'} />
                  <p className="mt-2 font-bold">{row.employeeName} · {row.department}</p>
                  <p className="mt-1 font-semibold text-[#667085]">
                    {row.status === 'Overdue' ? `Overdue since ${safeFmtDate(row.due)}`
                      : row.status === 'Blocked' ? 'Blocked by returned review or goal discussion'
                        : `${row.goalCount} goals · ${row.weight}% weight (expected 100%)`}
                  </p>
                </div>
                <button type="button" onClick={() => setDrawer({ employeeId: row.employeeId, employeeName: row.employeeName, department: row.department })} className="inline-flex h-8 items-center rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold">Open</button>
              </div>
            ))}
            {!register.some((row) => ['Overdue', 'Blocked'].includes(row.status) || !row.readinessOk) ? (
              <div className="rounded-xl border border-[#abefc6] bg-[#ecfdf3] px-4 py-8 text-center text-[12px] font-semibold text-[#027a48]">No mid-year exceptions.</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Audit & History' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Audit & history</h3>
          <div className="mt-4 space-y-2">
            {midYearAudit.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{row.action}</p>
                  <span className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.at)}</span>
                </div>
                <p className="mt-1 font-semibold text-[#475467]">{row.actor} · {row.actorRole} · {row.entityType}/{row.entityId}</p>
              </div>
            ))}
            {!midYearAudit.length ? (
              <div className="space-y-2">
                {assessments.map((row) => (
                  <div key={row.id} className="rounded-xl border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                    <p className="font-bold">{row.employeeName} · Mid-Year · {row.status}</p>
                    <p className="mt-1 font-semibold text-[#667085]">Submitted {safeFmtDate(row.submittedAt)} · v{row.version}</p>
                  </div>
                ))}
                {!assessments.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No mid-year audit events yet.</p> : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {changeOpen ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close change request" onClick={() => setChangeOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">New change request</h2>
                <p className="mt-1 text-xs text-[#667085]">Request a mid-year goal adjustment for manager acknowledgement.</p>
              </div>
              <button type="button" onClick={() => setChangeOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3">
              <label className="text-[11px] font-semibold text-[#344054]">Goal
                <select className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm" value={changeGoalId} onChange={(e) => setChangeGoalId(e.target.value)}>
                  <option value="">Select goal</option>
                  {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.employeeName} · {goal.title}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#344054]">Reason
                <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setChangeOpen(false)} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy || !changeGoalId} onClick={() => void submitChangeRequest()} className="h-9 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50">Submit request</button>
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
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#1570ef]">Mid-year review</p>
                <h2 className="mt-1 text-xl font-bold">{drawer.employeeName}</h2>
                <p className="mt-1 text-sm text-[#667085]">{drawer.department}</p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {(() => {
                const assessment = assessments.find((item) => item.employeeId === drawer.employeeId || item.employeeName === drawer.employeeName);
                const employeeGoals = goals.filter((goal) => goal.employeeId === drawer.employeeId);
                return (
                  <>
                    <StatusPill label={assessment ? reviewStage(assessment).status : 'Not started'} />
                    <dl className="mt-5">
                      {[
                        ['Assessment', assessment?.status || 'Not created'],
                        ['Goals', String(employeeGoals.length)],
                        ['Submitted', safeFmtDate(assessment?.submittedAt)],
                        ['Version', assessment ? `v${assessment.version}` : '—'],
                      ].map(([dt, dd]) => (
                        <div key={dt} className="flex items-center justify-between border-b border-[#eaecf0] py-3 text-sm">
                          <dt className="text-[#667085]">{dt}</dt>
                          <dd className="font-semibold">{dd}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-5 space-y-2">
                      {employeeGoals.slice(0, 6).map((goal) => (
                        <div key={goal.id} className="rounded-lg border border-[#eaecf0] p-3">
                          <p className="text-[11px] font-bold">{goal.title}</p>
                          <p className="mt-1 text-[10px] font-semibold text-[#667085]">Weight {goal.weight}% · {goal.status} · Progress {goal.progressPercent}%</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {!assessment ? (
                        <button type="button" disabled={busy} onClick={() => void startReview(drawer.employeeId, drawer.employeeName)} className="h-9 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50">
                          Create draft review
                        </button>
                      ) : null}
                      {assessment && ['Draft', 'Returned'].includes(assessment.status) ? (
                        <button type="button" disabled={busy} onClick={() => void onAction('assessment.submit', { id: assessment.id })} className="h-9 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50">
                          Submit review
                        </button>
                      ) : null}
                      {isHrScope || payload.actor.scope === 'team' ? (
                        <button type="button" onClick={() => { setChangeGoalId(employeeGoals[0]?.id || ''); setChangeOpen(true); }} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-xs font-semibold">
                          Request goal change
                        </button>
                      ) : null}
                    </div>
                  </>
                );
              })()}
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
