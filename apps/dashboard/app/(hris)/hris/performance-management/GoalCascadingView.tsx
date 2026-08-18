'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  Clock3,
  Download,
  Filter,
  Layers,
  MoreVertical,
  Plus,
  Search,
  Target,
  X,
} from 'lucide-react';
import type { CompanyObjective, EmployeeGoal, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Cascade Overview',
  'Company Objectives',
  'Department Goals',
  'Team Goals',
  'Employee Goals',
  'Alignment Map',
  'Exceptions',
  'Audit & History',
] as const;

type TabId = (typeof TABS)[number];
type QueueFilter = 'All' | 'Not Started' | 'In Progress' | 'Awaiting Approval' | 'Completed';

type DeptCascadeStatus = 'Not Started' | 'In Progress' | 'Awaiting Approval' | 'Completed';

const safeFmtDate = (value?: string | null) => {
  if (!value) return '—';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  return fmtDate(day);
};

const daysLeft = (value?: string | null) => {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const diff = Math.ceil((new Date(`${day}T00:00:00`).getTime() - Date.now()) / 86_400_000);
  return diff;
};

const StatusPill = ({ label }: { label: string }) => {
  const key = label.toLowerCase();
  const style =
    key.includes('track') || key.includes('approved') || key.includes('completed') || key.includes('agreed')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('review') || key.includes('await') || key.includes('progress') || key.includes('assigned')
        ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
        : key.includes('risk') || key.includes('exception') || key.includes('not started')
          ? 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]'
          : 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>
      {label}
    </span>
  );
};

const MiniBar = ({ value, tone = 'blue' }: { value: number; tone?: 'blue' | 'green' | 'orange' }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#f2f4f7]">
      <div
        className={`h-full rounded-full ${tone === 'green' ? 'bg-[#12b76a]' : tone === 'orange' ? 'bg-[#f79009]' : 'bg-[#1570ef]'}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
    <span className="text-[10px] font-bold text-[#344054]">{value}%</span>
  </div>
);

const AlignmentDonut = ({ aligned, partial, unaligned }: { aligned: number; partial: number; unaligned: number }) => {
  const total = Math.max(aligned + partial + unaligned, 1);
  const a = (aligned / total) * 100;
  const p = (partial / total) * 100;
  const u = (unaligned / total) * 100;
  return (
    <div
      className="relative mx-auto grid h-[110px] w-[110px] place-items-center rounded-full"
      style={{
        background: `conic-gradient(#12b76a 0 ${a}%, #f79009 ${a}% ${a + p}%, #f04438 ${a + p}% ${a + p + u}%)`,
      }}
    >
      <span className="absolute inset-[18px] grid place-items-center rounded-full bg-white text-center">
        <b className="text-lg font-bold text-[#101828]">{Math.round((aligned / total) * 100)}%</b>
        <small className="text-[8px] font-semibold uppercase text-[#667085]">Aligned</small>
      </span>
    </div>
  );
};

function queueStatus(goals: EmployeeGoal[]): DeptCascadeStatus {
  if (!goals.length) return 'Not Started';
  if (goals.every((goal) => ['Agreed', 'Active', 'Completed'].includes(goal.status))) return 'Completed';
  if (goals.some((goal) => ['Pending Approval', 'Assigned', 'Discussion Requested', 'Resubmitted'].includes(goal.status))) return 'Awaiting Approval';
  if (goals.some((goal) => goal.progressPercent > 0 || goal.status === 'Draft' || goal.status === 'Agreed' || goal.status === 'Active')) return 'In Progress';
  return 'Not Started';
}

function objectiveProgress(goals: EmployeeGoal[]) {
  if (!goals.length) return 0;
  return Math.round(goals.reduce((sum, goal) => sum + (goal.progressPercent || 0), 0) / goals.length);
}

function objectiveStatusLabel(item: CompanyObjective, goals: EmployeeGoal[]) {
  if (item.status === 'Draft' || item.status === 'Pending Approval') return 'Draft';
  if (!goals.length) return 'Not Cascaded';
  const avg = objectiveProgress(goals);
  if (goals.every((goal) => ['Agreed', 'Active', 'Completed'].includes(goal.status))) return 'Approved';
  if (avg < 40) return 'Under Review';
  return 'On Track';
}

export default function GoalCascadingView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const isHrScope = payload.actor?.scope === 'global';
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Cascade Overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [ownerFilter, setOwnerFilter] = useState('All Owners');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    department: '',
    parentObjectiveId: '',
    weight: '20',
    ownerName: '',
  });

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const objectives = useMemo(
    () => (domain.companyObjectives || []).filter((item) => !cycleId || item.cycleId === cycleId),
    [domain.companyObjectives, cycleId],
  );
  const goals = useMemo(
    () => (domain.goals || []).filter((goal) => !cycleId || goal.cycleId === cycleId),
    [domain.goals, cycleId],
  );
  const eligibilityDepartments = useMemo(() => {
    const fromTasks = (domain.tasks || [])
      .map((task) => (task as { department?: string }).department)
      .filter(Boolean) as string[];
    return fromTasks;
  }, [domain.tasks]);

  const departments = useMemo(() => {
    const fromGoals = goals.map((goal) => goal.department).filter(Boolean);
    return Array.from(new Set([...fromGoals, ...eligibilityDepartments])).sort((a, b) => a.localeCompare(b));
  }, [goals, eligibilityDepartments]);

  const cascadeTree = useMemo(() => objectives.map((objective) => {
    const linked = goals.filter((goal) => goal.parentObjectiveId === objective.id);
    const byDept = Array.from(new Set(linked.map((goal) => goal.department).filter(Boolean))).map((department) => {
      const deptGoals = linked.filter((goal) => goal.department === department);
      const owner = deptGoals[0]?.managerName || deptGoals[0]?.employeeName || 'Unassigned';
      const weight = Math.min(100, deptGoals.reduce((sum, goal) => sum + Number(goal.weight || 0), 0) || Math.round(100 / Math.max(departments.length, 1)));
      return {
        department,
        owner,
        weight,
        status: queueStatus(deptGoals),
        progress: objectiveProgress(deptGoals),
        teamGoals: Math.max(1, new Set(deptGoals.map((goal) => goal.managerId || goal.managerName).filter(Boolean)).size),
        employeeGoals: deptGoals.length,
        goals: deptGoals,
      };
    });
    const alignedCount = byDept.filter((row) => row.status !== 'Not Started').length;
    return {
      objective,
      children: byDept,
      progress: objectiveProgress(linked),
      status: objectiveStatusLabel(objective, linked),
      alignedCount,
      alignedTotal: Math.max(byDept.length, 1),
      owner: objective.owner,
      linked,
    };
  }), [objectives, goals, departments.length]);

  const owners = useMemo(
    () => ['All Owners', ...Array.from(new Set(cascadeTree.map((row) => row.owner).filter(Boolean)))],
    [cascadeTree],
  );

  const filteredTree = useMemo(() => cascadeTree.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.objective.code} ${row.objective.title} ${row.owner} ${row.children.map((c) => c.department).join(' ')}`.toLowerCase().includes(q)) return false;
    if (statusFilter !== 'All Status' && row.status !== statusFilter) return false;
    if (ownerFilter !== 'All Owners' && row.owner !== ownerFilter) return false;
    return true;
  }), [cascadeTree, query, statusFilter, ownerFilter]);

  const workQueue = useMemo(() => {
    const rows: Array<{
      department: string;
      parentObjective: string;
      parentObjectiveId: string;
      owner: string;
      weight: number;
      teamGoals: number;
      employeeGoals: number;
      status: DeptCascadeStatus;
      deadline: string;
    }> = [];

    for (const department of departments) {
      const deptGoals = goals.filter((goal) => goal.department === department);
      const parent = objectives.find((objective) => deptGoals.some((goal) => goal.parentObjectiveId === objective.id)) || objectives[0];
      const status = queueStatus(deptGoals);
      rows.push({
        department,
        parentObjective: parent ? `${parent.code} ${parent.title}` : 'Unassigned',
        parentObjectiveId: parent?.id || '',
        owner: deptGoals[0]?.managerName || 'Department lead',
        weight: Math.min(100, deptGoals.reduce((sum, goal) => sum + Number(goal.weight || 0), 0) || 0),
        teamGoals: Math.max(1, new Set(deptGoals.map((goal) => goal.managerId || goal.managerName).filter(Boolean)).size || (deptGoals.length ? 1 : 0)),
        employeeGoals: deptGoals.length,
        status,
        deadline: activeCycle?.goalSettingEnd || activeCycle?.endDate || '',
      });
    }

    // Ensure at least the departments appearing under objectives are represented
    if (!rows.length) {
      for (const row of cascadeTree) {
        for (const child of row.children) {
          rows.push({
            department: child.department,
            parentObjective: `${row.objective.code} ${row.objective.title}`,
            parentObjectiveId: row.objective.id,
            owner: child.owner,
            weight: child.weight,
            teamGoals: child.teamGoals,
            employeeGoals: child.employeeGoals,
            status: child.status,
            deadline: activeCycle?.goalSettingEnd || activeCycle?.endDate || '',
          });
        }
      }
    }

    return rows;
  }, [departments, goals, objectives, activeCycle, cascadeTree]);

  const queueCounts = useMemo(() => ({
    All: workQueue.length,
    'Not Started': workQueue.filter((row) => row.status === 'Not Started').length,
    'In Progress': workQueue.filter((row) => row.status === 'In Progress').length,
    'Awaiting Approval': workQueue.filter((row) => row.status === 'Awaiting Approval').length,
    Completed: workQueue.filter((row) => row.status === 'Completed').length,
  }), [workQueue]);

  const filteredQueue = useMemo(
    () => workQueue.filter((row) => queueFilter === 'All' || row.status === queueFilter),
    [workQueue, queueFilter],
  );

  const alignedDepts = workQueue.filter((row) => row.status === 'Completed' || row.status === 'In Progress' || row.status === 'Awaiting Approval').length;
  const partialDepts = workQueue.filter((row) => row.status === 'In Progress' || row.status === 'Awaiting Approval').length;
  const unalignedDepts = workQueue.filter((row) => row.status === 'Not Started').length;
  const fullyAligned = workQueue.filter((row) => row.status === 'Completed').length;
  const cascadeCoverage = workQueue.length ? Math.round(((alignedDepts) / workQueue.length) * 100) : 0;
  const awaitingApproval = goals.filter((goal) => ['Assigned', 'Pending Approval', 'Discussion Requested', 'Resubmitted'].includes(goal.status)).length
    || workQueue.filter((row) => row.status === 'Awaiting Approval').length;
  const weightExceptions = workQueue.filter((row) => row.weight > 100).length;
  const noOwner = workQueue.filter((row) => !row.owner || /unassigned|department lead/i.test(row.owner)).length;
  const exceptionCount = unalignedDepts + weightExceptions + (noOwner ? 1 : 0);
  const cascadingDeadline = activeCycle?.goalSettingEnd || activeCycle?.endDate || '';
  const deadlineDays = daysLeft(cascadingDeadline);

  const cascadeAudit = useMemo(
    () => (domain.audit || []).filter((row) => ['EmployeeGoal', 'CompanyObjective', 'CheckIn'].includes(row.entityType)).slice(0, 50),
    [domain.audit],
  );

  const teamGroups = useMemo(() => {
    const map = new Map<string, { manager: string; department: string; goals: EmployeeGoal[] }>();
    for (const goal of goals) {
      const key = goal.managerName || goal.managerId || 'Unassigned manager';
      const existing = map.get(key);
      if (existing) existing.goals.push(goal);
      else map.set(key, { manager: key, department: goal.department || '—', goals: [goal] });
    }
    return Array.from(map.values()).sort((a, b) => a.manager.localeCompare(b.manager));
  }, [goals]);

  const exceptions = useMemo(() => {
    const rows: Array<{ severity: 'High' | 'Medium' | 'Low'; title: string; detail: string; action?: () => void }> = [];
    for (const row of workQueue) {
      if (row.status === 'Not Started') {
        rows.push({
          severity: 'High',
          title: `${row.department} has no cascaded goals`,
          detail: `Parent: ${row.parentObjective}`,
          action: () => {
            setForm({
              title: `${row.department} cascade goal`,
              department: row.department,
              parentObjectiveId: row.parentObjectiveId,
              weight: '20',
              ownerName: row.owner,
            });
            setCreating(true);
          },
        });
      }
      if (row.weight > 100) {
        rows.push({
          severity: 'Medium',
          title: `${row.department} weight exceeds 100%`,
          detail: `Current department weight total: ${row.weight}%`,
        });
      }
      if (!row.owner || /unassigned|department lead/i.test(row.owner)) {
        rows.push({
          severity: 'Medium',
          title: `${row.department} owner gap`,
          detail: 'Assign a department lead before cascading further.',
        });
      }
    }
    for (const objective of objectives) {
      const linked = goals.filter((goal) => goal.parentObjectiveId === objective.id);
      if (!linked.length) {
        rows.push({
          severity: 'High',
          title: `${objective.code} is not cascaded`,
          detail: objective.title,
          action: () => {
            setForm((current) => ({
              ...current,
              parentObjectiveId: objective.id,
              department: departments[0] || '',
              ownerName: payload.actor.fullName,
              title: `${objective.code} department outcome`,
            }));
            setCreating(true);
          },
        });
      }
    }
    const unlinkedGoals = goals.filter((goal) => !goal.parentObjectiveId);
    if (unlinkedGoals.length) {
      rows.push({
        severity: 'Low',
        title: `${unlinkedGoals.length} employee goal${unlinkedGoals.length === 1 ? '' : 's'} lack a parent objective`,
        detail: 'Link goals from OKR & KPI Management or create department cascades.',
      });
    }
    return rows;
  }, [workQueue, objectives, goals, departments, payload.actor.fullName]);

  const createDepartmentGoal = async () => {
    const parentId = form.parentObjectiveId || objectives[0]?.id || '';
    await onAction('goal.upsert', {
      cycleId: cycleId || activeCycle?.id,
      employeeId: payload.actor.employeeId,
      employeeCode: payload.actor.employeeCode,
      employeeName: form.ownerName || payload.actor.fullName,
      department: form.department || departments[0] || 'General',
      title: form.title || 'Department cascade goal',
      description: 'Department-level outcome aligned to company objective.',
      parentObjectiveId: parentId,
      weight: Number(form.weight || 20),
      keyResults: [
        { title: 'Primary department KPI', baseline: 0, target: 100, unit: '%', weight: 60 },
        { title: 'Delivery milestone', baseline: 0, target: 100, unit: '%', weight: 40 },
      ],
    });
    setCreating(false);
    setForm({ title: '', department: '', parentObjectiveId: '', weight: '20', ownerName: '' });
  };

  const queueActionLabel = (status: DeptCascadeStatus) => {
    if (status === 'Not Started') return 'Start Cascade';
    if (status === 'In Progress') return 'Continue Cascade';
    if (status === 'Awaiting Approval') return 'Review';
    return 'Open';
  };

  return (
    <div className="space-y-4 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Goal Cascading</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Align company strategy to department, team and employee outcomes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]"
          >
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
            {!cycles.length ? <option value="">No cycles</option> : null}
          </select>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            <Layers className="h-3.5 w-3.5" /> Bulk Cascade
          </button>
          {isHrScope || payload.actor?.scope === 'team' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setForm((current) => ({
                  ...current,
                  parentObjectiveId: objectives[0]?.id || '',
                  department: departments[0] || '',
                  ownerName: payload.actor.fullName,
                }));
                setCreating(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Create Department Goal
            </button>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold">{activeCycle?.name || 'No active cycle'}</h2>
              <span className="rounded-full border border-[#abefc6] bg-[#ecfdf3] px-2 py-0.5 text-[9px] font-semibold text-[#027a48]">
                {activeCycle?.status === 'Goal Setting' || /goal/i.test(activeCycle?.status || '') ? 'Goal Setting Open' : activeCycle?.status || 'Inactive'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-[#475467]">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-[#1570ef]" />
                Cycle Period ({activeCycle ? `${safeFmtDate(activeCycle.startDate)} – ${safeFmtDate(activeCycle.endDate)}` : '—'})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5 text-[#1570ef]" />
                Cascading Deadline ({safeFmtDate(cascadingDeadline)})
              </span>
            </div>
          </div>
          <div className="w-full max-w-xs">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
              <span className="text-[#667085]">Overall coverage</span>
              <span className="text-[#101828]">{cascadeCoverage}% cascade coverage</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
              <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${cascadeCoverage}%` }} />
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

      {activeTab === 'Cascade Overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { icon: Target, label: 'Company Objectives', value: String(objectives.length), tone: 'blue' as const },
              { icon: Building2, label: 'Departments Aligned', value: `${alignedDepts} of ${workQueue.length || departments.length || 0}`, tone: 'blue' as const },
              { icon: CircleGauge, label: 'Cascade Coverage', value: `${cascadeCoverage}%`, tone: 'blue' as const },
              { icon: Clock3, label: 'Awaiting Approval', value: String(awaitingApproval), tone: 'orange' as const },
              { icon: AlertTriangle, label: 'Exceptions', value: String(exceptionCount), tone: 'red' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#d92d20]' : kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#dc6803]' : 'bg-[#eff8ff] text-[#1570ef]'
                  }`}>
                    <kpi.icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
                  <h3 className="mr-auto text-sm font-bold">Objective Alignment & Cascading</h3>
                  <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
                    <Search className="h-3.5 w-3.5 text-[#667085]" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objectives..." className="w-full border-0 bg-transparent text-[11px] outline-none" />
                  </label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    <option>All Status</option>
                    <option>On Track</option>
                    <option>Approved</option>
                    <option>Under Review</option>
                    <option>Draft</option>
                    <option>Not Cascaded</option>
                  </select>
                  <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                  </select>
                  <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold text-[#344054]">
                    <Filter className="h-3.5 w-3.5" /> Filters
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[860px]">
                    <div className="grid grid-cols-[2fr_1fr_0.5fr_0.8fr_0.7fr_0.8fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                      <span>Objective / Department</span>
                      <span>Owner</span>
                      <span>Weight</span>
                      <span>Status</span>
                      <span>Depts. Aligned</span>
                      <span>Progress</span>
                    </div>
                    {filteredTree.map((row) => {
                      const open = expanded[row.objective.id] ?? true;
                      return (
                        <div key={row.objective.id}>
                          <div className="grid grid-cols-[2fr_1fr_0.5fr_0.8fr_0.7fr_0.8fr] items-center border-b border-[#eaecf0] bg-[#fbfdff] px-3 py-3">
                            <button type="button" onClick={() => setExpanded((current) => ({ ...current, [row.objective.id]: !open }))} className="flex min-w-0 items-start gap-2 text-left">
                              {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[#1570ef]" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#1570ef]" />}
                              <span className="min-w-0">
                                <span className="block text-[10px] font-bold text-[#1570ef]">{row.objective.code}</span>
                                <span className="block truncate text-[12px] font-bold text-[#101828]">{row.objective.title}</span>
                              </span>
                            </button>
                            <span className="truncate text-[11px] font-semibold">{row.owner}</span>
                            <span className="text-[11px] font-bold">{row.objective.weight}%</span>
                            <StatusPill label={row.status} />
                            <span className="text-[11px] font-semibold text-[#475467]">{row.alignedCount}/{row.alignedTotal}</span>
                            <MiniBar value={row.progress} />
                          </div>
                          {open ? row.children.map((child) => (
                            <div key={`${row.objective.id}-${child.department}`} className="grid grid-cols-[2fr_1fr_0.5fr_0.8fr_0.7fr_0.8fr] items-center border-b border-[#eaecf0] px-3 py-2.5">
                              <div className="flex min-w-0 items-center gap-2 pl-7">
                                <Building2 className="h-3.5 w-3.5 shrink-0 text-[#667085]" />
                                <span className="truncate text-[11px] font-semibold text-[#344054]">{child.department}</span>
                              </div>
                              <span className="truncate text-[11px] font-semibold text-[#475467]">{child.owner}</span>
                              <span className="text-[11px] font-bold">{child.weight}%</span>
                              <StatusPill label={child.status} />
                              <span className="text-[11px] font-semibold text-[#667085]">{child.employeeGoals} goals</span>
                              <MiniBar value={child.progress} tone={child.status === 'Completed' ? 'green' : child.status === 'Not Started' ? 'orange' : 'blue'} />
                            </div>
                          )) : null}
                          {open && !row.children.length ? (
                            <div className="border-b border-[#eaecf0] px-10 py-3 text-[11px] font-semibold text-[#98a2b3]">No department goals cascaded yet.</div>
                          ) : null}
                        </div>
                      );
                    })}
                    {!filteredTree.length ? (
                      <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No objectives match these filters.</div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
                <div className="border-b border-[#eaecf0] p-3">
                  <h3 className="text-sm font-bold">Department Cascading Work Queue</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.keys(queueCounts) as QueueFilter[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setQueueFilter(key)}
                        className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                          queueFilter === key ? 'border-[#1570ef] bg-[#eff8ff] text-[#1570ef]' : 'border-[#eaecf0] bg-white text-[#475467]'
                        }`}
                      >
                        {key} {queueCounts[key]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <div className="grid grid-cols-[1.1fr_1.4fr_1fr_0.55fr_0.55fr_0.6fr_0.85fr_0.7fr_0.9fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                      <span>Department</span>
                      <span>Parent Objective</span>
                      <span>Owner</span>
                      <span>Weight</span>
                      <span>Team</span>
                      <span>Employee</span>
                      <span>Approval</span>
                      <span>Deadline</span>
                      <span>Action</span>
                    </div>
                    {filteredQueue.map((row) => (
                      <div key={`${row.department}-${row.parentObjectiveId}`} className="grid grid-cols-[1.1fr_1.4fr_1fr_0.55fr_0.55fr_0.6fr_0.85fr_0.7fr_0.9fr] items-center border-b border-[#eaecf0] px-3 py-3">
                        <span className="truncate text-[11px] font-bold">{row.department}</span>
                        <span className="truncate text-[11px] font-semibold text-[#475467]">{row.parentObjective}</span>
                        <span className="truncate text-[11px] font-semibold">{row.owner}</span>
                        <span className="text-[11px] font-bold">{row.weight}%</span>
                        <span className="text-[11px] font-semibold">{row.teamGoals}</span>
                        <span className="text-[11px] font-semibold">{row.employeeGoals}</span>
                        <StatusPill label={row.status} />
                        <span className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.deadline)}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setForm({
                                title: `${row.department} cascade goal`,
                                department: row.department,
                                parentObjectiveId: row.parentObjectiveId,
                                weight: '20',
                                ownerName: row.owner,
                              });
                              if (row.status === 'Not Started') setCreating(true);
                              else setActiveTab('Department Goals');
                            }}
                            className="text-[10px] font-bold text-[#1570ef] hover:underline disabled:opacity-50"
                          >
                            {queueActionLabel(row.status)}
                          </button>
                          <button type="button" className="p-1 text-[#667085]" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                    {!filteredQueue.length ? (
                      <div className="px-4 py-10 text-center text-sm font-semibold text-[#667085]">No departments in this queue filter.</div>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Alignment Health</h3>
                <AlignmentDonut aligned={fullyAligned || alignedDepts} partial={partialDepts} unaligned={unalignedDepts} />
                <ul className="mt-4 space-y-2 text-[11px]">
                  {[
                    ['Aligned', fullyAligned || alignedDepts, '#12b76a'],
                    ['Partial', partialDepts, '#f79009'],
                    ['Unaligned', unalignedDepts, '#f04438'],
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
                <h3 className="mb-3 text-sm font-bold">Cascading Exceptions</h3>
                <ul className="space-y-3">
                  {[
                    { severity: 'High', text: `${unalignedDepts} department${unalignedDepts === 1 ? '' : 's'} have no aligned goals`, show: unalignedDepts > 0 },
                    { severity: 'Medium', text: `${weightExceptions} department weight${weightExceptions === 1 ? '' : 's'} exceed 100%`, show: weightExceptions > 0 },
                    { severity: 'Medium', text: `${noOwner} goal owner gap${noOwner === 1 ? '' : 's'} detected`, show: noOwner > 0 },
                    { severity: 'Low', text: 'Cascade coverage is healthy', show: exceptionCount === 0 },
                  ].filter((item) => item.show).map((item) => (
                    <li key={item.text} className="rounded-lg border border-[#eaecf0] bg-[#f9fafb] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <StatusPill label={item.severity} />
                          <p className="mt-2 text-[11px] font-semibold text-[#344054]">{item.text}</p>
                        </div>
                        <button type="button" onClick={() => setActiveTab('Exceptions')} className="text-[10px] font-bold text-[#1570ef]">Review</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Upcoming Deadlines</h3>
                {[
                  [cascadingDeadline, 'Department goals due'],
                  [activeCycle?.midYearStart, 'Mid-year cascade review'],
                  [activeCycle?.endDate, 'Employee goals lock'],
                ].filter(([date]) => Boolean(date)).map(([date, title]) => {
                  const left = daysLeft(String(date));
                  return (
                    <div key={String(title)} className="flex items-center justify-between gap-2 border-t border-[#eaecf0] py-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#1570ef]">{safeFmtDate(String(date))}</p>
                        <p className="truncate text-[11px] font-semibold text-[#344054]">{title}</p>
                      </div>
                      {left != null ? (
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                          left < 0 ? 'border-[#fecdca] bg-[#fef3f2] text-[#b42318]' : left <= 7 ? 'border-[#fedf89] bg-[#fffaeb] text-[#b54708]' : 'border-[#b2ddff] bg-[#eff8ff] text-[#175cd3]'
                        }`}>
                          {left < 0 ? `${Math.abs(left)}d overdue` : `${left} days left`}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                {deadlineDays != null && deadlineDays <= 14 ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#b54708]">
                    <AlertTriangle className="h-3.5 w-3.5" /> Cascading window closes soon
                  </p>
                ) : null}
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {activeTab === 'Company Objectives' ? (
        <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="border-b border-[#eaecf0] p-4">
            <h3 className="text-sm font-bold">Company objectives in cascade</h3>
            <p className="mt-1 text-[11px] font-medium text-[#667085]">Track which strategic objectives have been cascaded to departments and employees.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-[#f9fafb] text-[#667085]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Objective</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 font-semibold">Weight</th>
                  <th className="px-3 py-2.5 font-semibold">Cascade status</th>
                  <th className="px-3 py-2.5 font-semibold">Depts</th>
                  <th className="px-3 py-2.5 font-semibold">Goals</th>
                  <th className="px-3 py-2.5 font-semibold">Progress</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {cascadeTree.map((row) => (
                  <tr key={row.objective.id} className="border-t border-[#eaecf0]">
                    <td className="px-3 py-3">
                      <p className="font-bold text-[#1570ef]">{row.objective.code}</p>
                      <p className="font-bold text-[#101828]">{row.objective.title}</p>
                      <p className="text-[10px] font-medium text-[#667085]">{row.objective.strategicPillar}</p>
                    </td>
                    <td className="px-3 py-3 font-semibold">{row.owner}</td>
                    <td className="px-3 py-3 font-bold">{row.objective.weight}%</td>
                    <td className="px-3 py-3"><StatusPill label={row.status} /></td>
                    <td className="px-3 py-3 font-semibold">{row.alignedCount}/{row.alignedTotal}</td>
                    <td className="px-3 py-3 font-semibold">{row.linked.length}</td>
                    <td className="px-3 py-3"><MiniBar value={row.progress} /></td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            parentObjectiveId: row.objective.id,
                            department: departments[0] || '',
                            ownerName: payload.actor.fullName,
                            title: `${row.objective.code} department outcome`,
                          }));
                          setCreating(true);
                        }}
                        className="text-[10px] font-bold text-[#1570ef] hover:underline"
                      >
                        Cascade
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cascadeTree.length ? <p className="px-4 py-10 text-center text-sm font-semibold text-[#667085]">No company objectives for this cycle.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Department Goals' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Department goals</h3>
                <p className="mt-1 text-[11px] font-medium text-[#667085]">Work queue for cascading company strategy into department outcomes.</p>
              </div>
              {(isHrScope || payload.actor?.scope === 'team') ? (
                <button type="button" disabled={busy} onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                  <Plus className="h-3.5 w-3.5" /> Create Department Goal
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(queueCounts) as QueueFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQueueFilter(key)}
                  className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                    queueFilter === key ? 'border-[#1570ef] bg-[#eff8ff] text-[#1570ef]' : 'border-[#eaecf0] bg-white text-[#475467]'
                  }`}
                >
                  {key} {queueCounts[key]}
                </button>
              ))}
            </div>
          </section>
          <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[1.1fr_1.4fr_1fr_0.55fr_0.55fr_0.6fr_0.85fr_0.7fr_0.9fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                  <span>Department</span>
                  <span>Parent Objective</span>
                  <span>Owner</span>
                  <span>Weight</span>
                  <span>Team</span>
                  <span>Employee</span>
                  <span>Approval</span>
                  <span>Deadline</span>
                  <span>Action</span>
                </div>
                {filteredQueue.map((row) => (
                  <div key={`${row.department}-${row.parentObjectiveId}-dept`} className="grid grid-cols-[1.1fr_1.4fr_1fr_0.55fr_0.55fr_0.6fr_0.85fr_0.7fr_0.9fr] items-center border-b border-[#eaecf0] px-3 py-3">
                    <span className="truncate text-[11px] font-bold">{row.department}</span>
                    <span className="truncate text-[11px] font-semibold text-[#475467]">{row.parentObjective}</span>
                    <span className="truncate text-[11px] font-semibold">{row.owner}</span>
                    <span className="text-[11px] font-bold">{row.weight}%</span>
                    <span className="text-[11px] font-semibold">{row.teamGoals}</span>
                    <span className="text-[11px] font-semibold">{row.employeeGoals}</span>
                    <StatusPill label={row.status} />
                    <span className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.deadline)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setForm({
                          title: `${row.department} cascade goal`,
                          department: row.department,
                          parentObjectiveId: row.parentObjectiveId,
                          weight: '20',
                          ownerName: row.owner,
                        });
                        setCreating(true);
                      }}
                      className="text-left text-[10px] font-bold text-[#1570ef] hover:underline disabled:opacity-50"
                    >
                      {queueActionLabel(row.status)}
                    </button>
                  </div>
                ))}
                {!filteredQueue.length ? <div className="px-4 py-10 text-center text-sm font-semibold text-[#667085]">No departments in this queue filter.</div> : null}
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold">Department goal register</h3>
            <div className="mt-3 space-y-2">
              {goals.filter((goal) => Boolean(goal.department)).slice(0, 30).map((goal) => {
                const parent = objectives.find((item) => item.id === goal.parentObjectiveId);
                return (
                  <div key={goal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                    <div className="min-w-0">
                      <p className="font-bold">{goal.department} · {goal.title}</p>
                      <p className="text-[10px] font-semibold text-[#667085]">{parent ? `${parent.code} · ${parent.title}` : 'No parent objective'} · {goal.employeeName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <MiniBar value={goal.progressPercent || 0} />
                      <StatusPill label={goal.status} />
                    </div>
                  </div>
                );
              })}
              {!goals.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No department goals yet.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'Team Goals' ? (
        <div className="space-y-3">
          {teamGroups.map((team) => (
            <section key={team.manager} className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">{team.manager}</h3>
                  <p className="mt-1 text-[11px] font-semibold text-[#667085]">{team.department} · {team.goals.length} goal{team.goals.length === 1 ? '' : 's'}</p>
                </div>
                <StatusPill label={queueStatus(team.goals)} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="bg-[#f9fafb] text-[#667085]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Employee / Goal</th>
                      <th className="px-3 py-2 font-semibold">Parent</th>
                      <th className="px-3 py-2 font-semibold">Weight</th>
                      <th className="px-3 py-2 font-semibold">Progress</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.goals.map((goal) => {
                      const parent = objectives.find((item) => item.id === goal.parentObjectiveId);
                      return (
                        <tr key={goal.id} className="border-t border-[#eaecf0]">
                          <td className="px-3 py-2.5">
                            <p className="font-bold">{goal.employeeName}</p>
                            <p className="text-[10px] font-medium text-[#667085]">{goal.title}</p>
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-[#475467]">{parent ? parent.code : '—'}</td>
                          <td className="px-3 py-2.5 font-semibold">{goal.weight}%</td>
                          <td className="px-3 py-2.5"><MiniBar value={goal.progressPercent || 0} /></td>
                          <td className="px-3 py-2.5"><StatusPill label={goal.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!teamGroups.length ? <p className="rounded-xl border border-dashed border-[#eaecf0] bg-[#f8fafc] px-4 py-10 text-center text-sm font-semibold text-[#98a2b3]">No team goals for this cycle.</p> : null}
        </div>
      ) : null}

      {activeTab === 'Employee Goals' ? (
        <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-bold">Employee goals</h3>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">{goals.length} goals in {activeCycle?.name || 'this cycle'}</p>
            </div>
            <label className="flex h-9 min-w-[220px] items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5">
              <Search className="h-3.5 w-3.5 text-[#667085]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee or goal..." className="w-full border-0 bg-transparent text-[11px] outline-none" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-[#f9fafb] text-[#667085]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Goal</th>
                  <th className="px-3 py-2.5 font-semibold">Department</th>
                  <th className="px-3 py-2.5 font-semibold">Parent objective</th>
                  <th className="px-3 py-2.5 font-semibold">Weight</th>
                  <th className="px-3 py-2.5 font-semibold">Progress</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {goals
                  .filter((goal) => {
                    const q = query.trim().toLowerCase();
                    if (!q) return true;
                    return `${goal.employeeName} ${goal.title} ${goal.department} ${goal.employeeCode}`.toLowerCase().includes(q);
                  })
                  .map((goal) => {
                    const parent = objectives.find((item) => item.id === goal.parentObjectiveId);
                    return (
                      <tr key={goal.id} className="border-t border-[#eaecf0]">
                        <td className="px-3 py-3">
                          <p className="font-bold">{goal.employeeName}</p>
                          <p className="text-[10px] font-medium text-[#667085]">{goal.employeeCode}</p>
                        </td>
                        <td className="px-3 py-3 font-semibold">{goal.title}</td>
                        <td className="px-3 py-3 font-semibold text-[#475467]">{goal.department || '—'}</td>
                        <td className="px-3 py-3 font-semibold text-[#475467]">{parent ? `${parent.code}` : 'Unlinked'}</td>
                        <td className="px-3 py-3 font-bold">{goal.weight}%</td>
                        <td className="px-3 py-3"><MiniBar value={goal.progressPercent || 0} /></td>
                        <td className="px-3 py-3"><StatusPill label={goal.status} /></td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {['Assigned', 'Resubmitted', 'Discussion Requested'].includes(goal.status) ? (
                              <button type="button" disabled={busy} onClick={() => void onAction('goal.acknowledge', { id: goal.id })} className="rounded-lg bg-[#1570ef] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50">Acknowledge</button>
                            ) : null}
                            {['Assigned', 'Agreed', 'Active'].includes(goal.status) ? (
                              <button type="button" disabled={busy} onClick={() => void onAction('goal.request-discussion', { id: goal.id, comment: 'Please clarify cascade alignment' })} className="rounded-lg border border-[#d0d5dd] px-2 py-1 text-[10px] font-semibold disabled:opacity-50">Discuss</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {!goals.length ? <p className="px-4 py-10 text-center text-sm font-semibold text-[#667085]">No employee goals for this cycle.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Alignment Map' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Alignment map</h3>
                <p className="mt-1 text-[11px] font-medium text-[#667085]">Company → department → employee cascade paths for the selected cycle.</p>
              </div>
              <AlignmentDonut aligned={fullyAligned || alignedDepts} partial={partialDepts} unaligned={unalignedDepts} />
            </div>
          </section>
          <div className="space-y-3">
            {cascadeTree.map((row) => (
              <section key={row.objective.id} className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-[#1570ef]">{row.objective.code}</p>
                    <h3 className="mt-1 text-sm font-bold">{row.objective.title}</h3>
                    <p className="mt-1 text-[11px] font-semibold text-[#667085]">{row.owner} · Weight {row.objective.weight}%</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill label={row.status} />
                    <MiniBar value={row.progress} />
                  </div>
                </div>
                {row.children.length ? (
                  <div className="mt-4 space-y-3 border-l-2 border-[#d1e9ff] pl-4">
                    {row.children.map((child) => (
                      <div key={`${row.objective.id}-${child.department}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-[#1570ef]" />
                            <span className="text-[12px] font-bold">{child.department}</span>
                            <span className="text-[10px] font-semibold text-[#667085]">{child.owner}</span>
                          </div>
                          <StatusPill label={child.status} />
                        </div>
                        <ul className="mt-2 space-y-1.5 pl-6">
                          {child.goals.map((goal) => (
                            <li key={goal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f9fafb] px-3 py-2 text-[11px]">
                              <span className="font-semibold">{goal.employeeName} · {goal.title}</span>
                              <span className="inline-flex items-center gap-2">
                                <MiniBar value={goal.progressPercent || 0} />
                                <StatusPill label={goal.status} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-dashed border-[#eaecf0] bg-[#f8fafc] px-3 py-4 text-[11px] font-semibold text-[#98a2b3]">Not cascaded yet.</p>
                )}
              </section>
            ))}
            {!cascadeTree.length ? <p className="rounded-xl border border-dashed border-[#eaecf0] bg-[#f8fafc] px-4 py-10 text-center text-sm font-semibold text-[#98a2b3]">No objectives to map.</p> : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'Exceptions' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">Cascading exceptions</h3>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">{exceptions.length} issue{exceptions.length === 1 ? '' : 's'} requiring attention</p>
            </div>
            <span className="rounded-full border border-[#fecdca] bg-[#fef3f2] px-2.5 py-1 text-[10px] font-semibold text-[#b42318]">{exceptionCount} flagged</span>
          </div>
          <div className="mt-4 space-y-2">
            {exceptions.map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#eaecf0] px-3 py-3">
                <div>
                  <StatusPill label={item.severity} />
                  <p className="mt-2 text-[12px] font-bold">{item.title}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#667085]">{item.detail}</p>
                </div>
                {item.action ? (
                  <button type="button" onClick={item.action} className="inline-flex h-8 items-center rounded-lg bg-[#1570ef] px-2.5 text-[10px] font-semibold text-white">
                    Resolve
                  </button>
                ) : (
                  <button type="button" onClick={() => setActiveTab('Department Goals')} className="inline-flex h-8 items-center rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold">
                    Review
                  </button>
                )}
              </div>
            ))}
            {!exceptions.length ? (
              <div className="rounded-xl border border-[#abefc6] bg-[#ecfdf3] px-4 py-8 text-center text-[12px] font-semibold text-[#027a48]">
                No cascading exceptions — coverage looks healthy.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Audit & History' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Audit & history</h3>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Goal cascading and alignment actions for this workspace.</p>
          <div className="mt-4 space-y-2">
            {cascadeAudit.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{row.action}</p>
                  <span className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.at)}</span>
                </div>
                <p className="mt-1 font-semibold text-[#475467]">{row.actor} · {row.actorRole} · {row.entityType}/{row.entityId}</p>
                {row.after ? <p className="mt-1 text-[10px] font-semibold text-[#667085]">{row.after}</p> : null}
              </div>
            ))}
            {!cascadeAudit.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No cascade-related audit events yet.</p> : null}
          </div>
        </section>
      ) : null}

      {creating ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close create dialog" onClick={() => setCreating(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">Create Department Goal</h2>
                <p className="mt-1 text-xs text-[#667085]">Cascade a department outcome under a company objective.</p>
              </div>
              <button type="button" onClick={() => setCreating(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3">
              <label className="text-[11px] font-semibold text-[#344054]">Title
                <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Commercial pipeline contribution" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold text-[#344054]">Department
                  <select className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
                    <option value="">Select department</option>
                    {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                    {!departments.length ? <option value="General">General</option> : null}
                  </select>
                </label>
                <label className="text-[11px] font-semibold text-[#344054]">Weight %
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
                </label>
              </div>
              <label className="text-[11px] font-semibold text-[#344054]">Parent company objective
                <select className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm" value={form.parentObjectiveId} onChange={(e) => setForm((f) => ({ ...f, parentObjectiveId: e.target.value }))}>
                  <option value="">Select objective</option>
                  {objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.code} · {objective.title}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#344054]">Owner
                <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void createDepartmentGoal()} className="h-9 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50">Save department goal</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
