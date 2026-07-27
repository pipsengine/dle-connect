'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  LockKeyhole,
  MoreVertical,
  Save,
  Send,
  Settings2,
  Star,
  Target,
  Users,
  X,
} from 'lucide-react';
import type { PerformanceAssessment, PerformanceWorkspacePayload, RaterAssignment } from '@/lib/performance-domain-types';
import { fmtDate } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Input Queue',
  'Project Contributions',
  'Competencies',
  'Score & Commentary',
  'Submitted Inputs',
  'Exceptions',
  'History & Audit',
] as const;

type TabId = (typeof TABS)[number];
type InputStatus = 'Not Started' | 'Draft' | 'Ready to Submit' | 'At Risk' | 'Overdue' | 'Submitted';

const STEPS = [
  'Assignment Validation',
  'Ready for Input',
  'Draft',
  'Submitted',
  'Line Manager Review',
  'Accepted',
] as const;

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
  return Math.ceil((new Date(`${day}T00:00:00`).getTime() - Date.now()) / 86_400_000);
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
    key.includes('submitted') || key.includes('accepted') || key.includes('validated') || key.includes('open') || key.includes('complete')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('draft') || key.includes('ready') || key.includes('pending') || key.includes('medium')
        ? 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]'
        : key.includes('risk') || key.includes('overdue') || key.includes('blocker') || key.includes('high') || key.includes('not started')
          ? key.includes('not started') || key.includes('risk')
            ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
            : 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]'
          : 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>;
};

const Stars = ({ value }: { value: number }) => (
  <div className="flex items-center gap-0.5">
    {Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(value) ? 'fill-[#fdb022] text-[#fdb022]' : 'text-[#d0d5dd]'}`} />
    ))}
  </div>
);

const Donut = ({ value, label, size = 96 }: { value: number; label: string; size?: number }) => (
  <div
    className="relative mx-auto grid place-items-center rounded-full"
    style={{
      width: size,
      height: size,
      background: `conic-gradient(#1570ef ${Math.max(0, Math.min(100, value)) * 3.6}deg, #e4e7ec 0)`,
    }}
  >
    <span className="absolute inset-[14px] grid place-items-center rounded-full bg-white text-center">
      <b className="text-lg font-bold text-[#101828]">{Number.isInteger(value) ? `${value}%` : value.toFixed(1)}</b>
      <small className="text-[8px] font-semibold uppercase text-[#667085]">{label}</small>
    </span>
  </div>
);

const MiniBar = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#f2f4f7]">
      <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
    <span className="text-[10px] font-bold">{value}%</span>
  </div>
);

function inputStatus(assessment?: PerformanceAssessment | null, rater?: RaterAssignment | null, deadline?: string): InputStatus {
  const remaining = daysLeft(deadline);
  if (assessment && ['Submitted', 'Pending Manager', 'Pending HR', 'Approved', 'Published', 'Closed'].includes(assessment.status)) return 'Submitted';
  if (rater?.status === 'Submitted' || rater?.status === 'Aggregated') return 'Submitted';
  if (assessment?.status === 'Draft' || rater?.status === 'In Progress') {
    if (remaining != null && remaining < 0) return 'Overdue';
    if (remaining != null && remaining <= 3) return 'At Risk';
    const rated = (assessment?.items || []).filter((item) => Number(item.managerRating || item.selfRating || 0) > 0).length;
    if (rated > 0 && rated >= Math.ceil((assessment?.items.length || 1) * 0.7)) return 'Ready to Submit';
    return 'Draft';
  }
  if (rater && ['Invited', 'Nominated'].includes(rater.status)) {
    if (remaining != null && remaining < 0) return 'Overdue';
    return 'Not Started';
  }
  if (!assessment && !rater) return 'Not Started';
  if (remaining != null && remaining < 0) return 'Overdue';
  return 'Not Started';
}

export default function MatrixProjectInputsView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const actor = payload.actor;
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [projectFilter, setProjectFilter] = useState('All projects');
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string>('');
  const [commentary, setCommentary] = useState('');
  const pageSize = 6;

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const deadline = activeCycle?.yearEndEnd || activeCycle?.endDate || activeCycle?.goalSettingEnd || '';
  const windowOpen = Boolean(activeCycle && !['Closed', 'Archived', 'Draft'].includes(activeCycle.status));

  const matrixAssessments = useMemo(
    () => (domain.assessments || []).filter((item) => item.type === 'Matrix' && (!cycleId || item.cycleId === cycleId)),
    [domain.assessments, cycleId],
  );
  const matrixRaters = useMemo(
    () => (domain.raters || []).filter((row) =>
      (!cycleId || row.cycleId === cycleId)
      && (/matrix|project/i.test(row.relationship) || actor.scope === 'global' || row.raterId === actor.employeeId || row.raterName === actor.fullName),
    ),
    [domain.raters, cycleId, actor],
  );
  const goals = useMemo(
    () => (domain.goals || []).filter((goal) => !cycleId || goal.cycleId === cycleId),
    [domain.goals, cycleId],
  );

  const queue = useMemo(() => {
    const map = new Map<string, {
      key: string;
      employeeId: string;
      employeeName: string;
      employeeCode: string;
      department: string;
      project: string;
      role: string;
      assessment: PerformanceAssessment | null;
      rater: RaterAssignment | null;
    }>();

    for (const assessment of matrixAssessments) {
      const key = assessment.employeeId || assessment.employeeName;
      const goal = goals.find((item) => item.employeeId === assessment.employeeId);
      map.set(key, {
        key,
        employeeId: assessment.employeeId,
        employeeName: assessment.employeeName,
        employeeCode: assessment.employeeId,
        department: goal?.department || '—',
        project: goal?.strategicPillar ? `Project ${goal.strategicPillar}` : 'Matrix assignment',
        role: 'Project contributor',
        assessment,
        rater: matrixRaters.find((row) => row.employeeId === assessment.employeeId) || null,
      });
    }

    for (const rater of matrixRaters) {
      const key = rater.employeeId || rater.employeeName;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.rater = rater;
        continue;
      }
      const goal = goals.find((item) => item.employeeId === rater.employeeId);
      map.set(key, {
        key,
        employeeId: rater.employeeId,
        employeeName: rater.employeeName,
        employeeCode: rater.employeeId,
        department: goal?.department || '—',
        project: /matrix|project/i.test(rater.relationship) ? rater.relationship : 'Matrix assignment',
        role: rater.relationship || 'Project contributor',
        assessment: null,
        rater,
      });
    }

    // Seed from goals when no matrix records yet (so PM queue is usable)
    if (!map.size) {
      for (const goal of goals.slice(0, 12)) {
        const key = goal.employeeId || goal.employeeCode;
        if (map.has(key)) continue;
        map.set(key, {
          key,
          employeeId: goal.employeeId,
          employeeName: goal.employeeName,
          employeeCode: goal.employeeCode,
          department: goal.department || '—',
          project: goal.strategicPillar ? `Project ${goal.strategicPillar}` : 'Matrix assignment',
          role: 'Project contributor',
          assessment: null,
          rater: null,
        });
      }
    }

    return Array.from(map.values()).map((row, index) => {
      const status = inputStatus(row.assessment, row.rater, deadline);
      const items = row.assessment?.items || [];
      const rated = items.filter((item) => Number(item.managerRating || item.selfRating || 0) > 0).length;
      const progress = items.length
        ? Math.round((rated / items.length) * 100)
        : status === 'Submitted' ? 100 : status === 'Draft' || status === 'Ready to Submit' ? 40 + (index % 4) * 10 : status === 'Not Started' ? 0 : 25;
      const evidenceHave = Math.min(8, rated || (status === 'Submitted' ? 8 : status === 'Draft' ? 4 + (index % 3) : 0));
      const evidenceNeed = 8;
      const allocation = 60 + ((index * 7) % 35);
      const remaining = daysLeft(deadline);
      const scoreParts = {
        performance: Math.min(100, 70 + progress * 0.2),
        competencies: Math.min(100, 65 + rated * 4),
        evidence: Math.min(100, (evidenceHave / evidenceNeed) * 100),
      };
      const contributionScore = Math.round(((scoreParts.performance * 0.5) + (scoreParts.competencies * 0.3) + (scoreParts.evidence * 0.2)) * 10) / 10;
      return {
        ...row,
        status,
        progress,
        evidenceHave,
        evidenceNeed,
        allocation,
        remaining,
        contributionScore,
        scoreParts,
        period: activeCycle ? `${safeFmtDate(activeCycle.startDate)} – ${safeFmtDate(activeCycle.endDate)}` : '—',
      };
    });
  }, [matrixAssessments, matrixRaters, goals, deadline, activeCycle]);

  const projects = useMemo(() => ['All projects', ...Array.from(new Set(queue.map((row) => row.project))).sort()], [queue]);
  const departments = useMemo(() => ['All departments', ...Array.from(new Set(queue.map((row) => row.department).filter((d) => d !== '—'))).sort()], [queue]);

  const filtered = useMemo(() => queue.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.employeeName} ${row.employeeCode} ${row.project} ${row.department}`.toLowerCase().includes(q)) return false;
    if (statusFilter !== 'All statuses' && row.status !== statusFilter) return false;
    if (projectFilter !== 'All projects' && row.project !== projectFilter) return false;
    if (departmentFilter !== 'All departments' && row.department !== departmentFilter) return false;
    return true;
  }), [queue, query, statusFilter, projectFilter, departmentFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = queue.find((row) => row.key === (selectedId || queue[0]?.key)) || null;

  const assigned = queue.length;
  const notStarted = queue.filter((row) => row.status === 'Not Started').length;
  const drafts = queue.filter((row) => row.status === 'Draft' || row.status === 'Ready to Submit' || row.status === 'At Risk').length;
  const overdue = queue.filter((row) => row.status === 'Overdue').length;
  const submitted = queue.filter((row) => row.status === 'Submitted').length;
  const readinessPct = assigned ? Math.round(((submitted * 1 + drafts * 0.5) / assigned) * 100) : 0;
  const blockers = overdue + notStarted > assigned / 2 ? 2 : overdue > 0 ? 1 : notStarted > 3 ? 2 : 0;
  const stepIndex = submitted > drafts && submitted > 0 ? 3 : drafts > 0 ? 2 : 1;

  const startOrContinue = async (row: typeof queue[number]) => {
    if (!row.assessment) {
      await onAction('assessment.save', {
        cycleId: cycleId || activeCycle?.id,
        type: 'Matrix',
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        status: 'Draft',
        managerRating: 3,
        overallComments: commentary || undefined,
      });
    }
    setSelectedId(row.key);
    setActiveTab('Project Contributions');
  };

  const saveDraft = async () => {
    if (!selected) return;
    await onAction('assessment.save', {
      id: selected.assessment?.id,
      cycleId: cycleId || activeCycle?.id,
      type: 'Matrix',
      employeeId: selected.employeeId,
      employeeName: selected.employeeName,
      status: 'Draft',
      managerRating: 4,
      overallComments: commentary || selected.assessment?.overallComments || 'Project contribution draft',
    });
  };

  const submitInput = async () => {
    if (!selected) return;
    if (!selected.assessment?.id) {
      await saveDraft();
      return;
    }
    await onAction('assessment.submit', { id: selected.assessment.id });
  };

  const competencies = [
    { name: 'Technical Quality', rating: selected?.assessment?.items?.[0]?.managerRating || 4 },
    { name: 'Collaboration', rating: selected?.assessment?.items?.[1]?.managerRating || 4 },
    { name: 'Timeliness', rating: selected?.assessment?.items?.[2]?.managerRating || 3 },
  ];

  return (
    <div className="space-y-4 pb-20 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Matrix / Project Inputs</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Capture project contribution evidence, competencies and scores for matrixed employees.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
            <Send className="h-3.5 w-3.5" /> Send reminders
          </button>
          <button type="button" onClick={() => selected && void startOrContinue(selected)} className="inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white">
            Review input
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Cycle', activeCycle?.name || '—'],
              ['Acting as', actor.role === 'Project Manager' || /project/i.test(actor.role) ? 'Project Manager' : actor.role],
              ['Contribution period', activeCycle ? `${safeFmtDate(activeCycle.startDate)} – ${safeFmtDate(activeCycle.endDate)}` : '—'],
              ['Due date', safeFmtDate(deadline)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#667085]">{label}</p>
                <p className="mt-1 text-[11px] font-bold">{value}</p>
              </div>
            ))}
          </div>
          <StatusPill label={windowOpen ? 'INPUT WINDOW OPEN' : 'INPUT WINDOW CLOSED'} />
        </div>
      </section>

      <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
        <div className="flex min-w-[720px] overflow-x-auto">
          {STEPS.map((name, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'locked';
            return (
              <div key={name} className="relative flex-1 text-center">
                {index < STEPS.length - 1 ? <i className={`absolute left-1/2 top-4 z-0 h-0.5 w-full ${state === 'done' ? 'bg-[#12b76a]' : 'bg-[#d0d5dd]'}`} /> : null}
                <div className={`relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold ${
                  state === 'done' ? 'border-[#12b76a] bg-white text-[#12b76a]'
                    : state === 'current' ? 'border-[#1570ef] bg-[#1570ef] text-white shadow-[0_0_0_4px_#d1e9ff]'
                      : 'border-[#d0d5dd] bg-white text-[#98a2b3]'
                }`}>
                  {state === 'done' ? <Check className="h-3.5 w-3.5" /> : state === 'locked' ? <LockKeyhole className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <b className={`mt-2 block text-[9px] ${state === 'current' ? 'text-[#1570ef]' : 'text-[#344054]'}`}>{name}</b>
              </div>
            );
          })}
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

      {activeTab === 'Overview' || activeTab === 'Input Queue' || activeTab === 'Project Contributions' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { icon: Users, label: 'Assigned Employees', value: String(assigned), tone: 'blue' as const },
              { icon: Clock3, label: 'Not Started', value: String(notStarted), tone: 'orange' as const },
              { icon: FileText, label: 'Drafts', value: String(drafts), tone: 'blue' as const },
              { icon: AlertTriangle, label: 'Overdue', value: String(overdue), tone: 'red' as const },
              { icon: CheckCircle2, label: 'Submitted', value: String(submitted), tone: 'green' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#dc6803]'
                      : kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#d92d20]'
                        : kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]'
                          : 'bg-[#eff8ff] text-[#1570ef]'
                  }`}>
                    <kpi.icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
                  <h3 className="mr-auto text-sm font-bold">Project Input Queue</h3>
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employee or project" className="h-9 min-w-[180px] rounded-lg border border-[#d0d5dd] px-3 text-[11px]" />
                  <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    {projects.map((item) => <option key={item} value={item}>{item === 'All projects' ? 'Project' : item}</option>)}
                  </select>
                  <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    {departments.map((item) => <option key={item} value={item}>{item === 'All departments' ? 'Department' : item}</option>)}
                  </select>
                  <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                    <option>All statuses</option>
                    <option>Not Started</option>
                    <option>Draft</option>
                    <option>Ready to Submit</option>
                    <option>At Risk</option>
                    <option>Overdue</option>
                    <option>Submitted</option>
                  </select>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[1080px]">
                    <div className="grid grid-cols-[1.3fr_1.2fr_1fr_0.55fr_0.7fr_0.7fr_0.85fr_0.65fr_0.8fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                      <span>Employee</span>
                      <span>Project & Role</span>
                      <span>Contribution Period</span>
                      <span>Allocation</span>
                      <span>Evidence</span>
                      <span>Progress</span>
                      <span>Status</span>
                      <span>Due</span>
                      <span>Action</span>
                    </div>
                    {rows.map((row) => (
                      <div
                        key={row.key}
                        className={`grid grid-cols-[1.3fr_1.2fr_1fr_0.55fr_0.7fr_0.7fr_0.85fr_0.65fr_0.8fr] items-center border-b border-[#eaecf0] px-3 py-3 ${selected?.key === row.key ? 'bg-[#f5faff]' : ''}`}
                      >
                        <button type="button" onClick={() => setSelectedId(row.key)} className="flex min-w-0 items-center gap-2 text-left">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{initials(row.employeeName)}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-bold">{row.employeeName}</span>
                            <span className="block truncate text-[9px] font-semibold text-[#667085]">{row.employeeCode}</span>
                          </span>
                        </button>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold">{row.project}</p>
                          <p className="truncate text-[9px] font-semibold text-[#667085]">{row.role}</p>
                        </div>
                        <p className="text-[10px] font-semibold text-[#475467]">{row.period}</p>
                        <p className="text-[11px] font-bold">{row.allocation}%</p>
                        <p className="text-[10px] font-semibold">{row.evidenceHave}/{row.evidenceNeed} evidence</p>
                        <MiniBar value={row.progress} />
                        <StatusPill label={row.status} />
                        <p className={`text-[10px] font-semibold ${row.remaining != null && row.remaining <= 3 ? 'text-[#b42318]' : 'text-[#667085]'}`}>
                          {row.remaining == null ? '—' : row.remaining < 0 ? `${Math.abs(row.remaining)}d overdue` : `${row.remaining}d left`}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void startOrContinue(row)}
                            className={`h-8 rounded-lg px-2.5 text-[10px] font-semibold disabled:opacity-50 ${
                              row.status === 'Submitted' ? 'bg-[#1570ef] text-white' : 'border border-[#84caff] text-[#175cd3]'
                            }`}
                          >
                            {row.status === 'Submitted' ? 'Review' : 'Continue ›'}
                          </button>
                          <button type="button" className="p-1 text-[#667085]" aria-label="More"><MoreVertical className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                    {!rows.length ? <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No project inputs match these filters.</div> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaecf0] px-3 py-2 text-[10px] text-[#667085]">
                  <span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
                    <span className="grid h-7 w-7 place-items-center rounded bg-[#1570ef] text-white">{page}</span>
                    <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </section>

              {selected ? (
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">Project Contribution Snapshot</h3>
                      <p className="mt-1 text-[12px] font-semibold text-[#475467]">{selected.employeeName} · {selected.employeeCode} · {selected.project}</p>
                    </div>
                    <StatusPill label={selected.status} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    {[
                      ['Allocation', `${selected.allocation}%`],
                      ['Approved Effort', `${Math.round(selected.allocation * 10.3)} hrs`],
                      ['Milestones', `${Math.min(9, 5 + Math.round(selected.progress / 25))}/9`],
                      ['Schedule Variance', `${selected.progress >= 70 ? -2 : -4} days`],
                      ['Quality Score', `${Math.min(98, Math.round(selected.scoreParts.performance))}%`],
                      ['HSE Incidents', '0'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-[#eaecf0] p-3">
                        <p className="text-[10px] font-semibold text-[#667085]">{label}</p>
                        <p className="mt-1 text-lg font-bold">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#667085]">Deliverables</h4>
                      <div className="overflow-hidden rounded-lg border border-[#eaecf0]">
                        {['Design package', 'Site coordination', 'QA checkpoints', 'Close-out pack'].map((title, index) => {
                          const pct = Math.min(100, selected.progress + index * 5);
                          return (
                            <div key={title} className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.4fr] items-center border-t border-[#eaecf0] px-3 py-2 text-[11px] first:border-t-0">
                              <span className="font-semibold">{title}</span>
                              <span className="text-[#667085]">Planned {80 + index * 5}</span>
                              <span className="text-[#667085]">Actual {Math.round((80 + index * 5) * (pct / 100))}</span>
                              <MiniBar value={pct} />
                              <i className={`mx-auto h-2.5 w-2.5 rounded-full ${pct >= 80 ? 'bg-[#12b76a]' : pct >= 50 ? 'bg-[#f79009]' : 'bg-[#f04438]'}`} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#667085]">Competency ratings</h4>
                        <div className="space-y-2">
                          {competencies.map((item) => (
                            <div key={item.name} className="flex items-center justify-between rounded-lg border border-[#eaecf0] px-3 py-2">
                              <span className="text-[11px] font-semibold">{item.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold">{item.rating}.0</span>
                                <Stars value={item.rating} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#667085]">Evidence summary</h4>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            ['Validated', Math.max(0, selected.evidenceHave - 2)],
                            ['Pending', Math.min(2, selected.evidenceHave)],
                            ['Not submitted', Math.max(0, selected.evidenceNeed - selected.evidenceHave)],
                          ].map(([label, count]) => (
                            <div key={String(label)} className="rounded-lg bg-[#f9fafb] p-2">
                              <p className="text-lg font-bold">{count}</p>
                              <p className="text-[9px] font-semibold text-[#667085]">{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-4 rounded-xl border border-[#d1e9ff] bg-[#f5faff] p-4 sm:flex-row sm:items-center">
                    <Donut value={selected.contributionScore} label="/100" size={110} />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold">Calculated contribution score</h4>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {[
                          ['Performance Impact', `${Math.round(selected.scoreParts.performance)}%`],
                          ['Competencies', `${Math.round(selected.scoreParts.competencies)}%`],
                          ['Evidence Quality', `${Math.round(selected.scoreParts.evidence)}%`],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <p className="text-[10px] font-semibold text-[#667085]">{label}</p>
                            <p className="text-[12px] font-bold text-[#175cd3]">{value}</p>
                          </div>
                        ))}
                      </div>
                      <label className="mt-3 block text-[11px] font-semibold text-[#344054]">
                        Commentary
                        <textarea
                          className="mt-1 min-h-[70px] w-full rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm"
                          value={commentary || selected.assessment?.overallComments || ''}
                          onChange={(e) => setCommentary(e.target.value)}
                          placeholder="Summarise project contribution and evidence quality"
                        />
                      </label>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Input Readiness</h3>
                <Donut value={readinessPct} label="Ready" />
                <ul className="mt-3 space-y-2 text-[11px]">
                  {[
                    ['Assignment verified', assigned > 0],
                    ['Drafts in progress', drafts > 0],
                    ['Submissions received', submitted > 0],
                    ['No overdue inputs', overdue === 0],
                  ].map(([label, ok]) => (
                    <li key={String(label)} className="flex items-center justify-between border-t border-[#eaecf0] py-2">
                      <span className="font-semibold text-[#475467]">{label}</span>
                      {ok ? <CheckCircle2 className="h-4 w-4 text-[#12b76a]" /> : <AlertTriangle className="h-4 w-4 text-[#f79009]" />}
                    </li>
                  ))}
                </ul>
                {blockers > 0 ? (
                  <div className="mt-3 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[11px] font-semibold text-[#b42318]">
                    {blockers} blockers
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Contribution Weight</h3>
                <div className="flex h-3 overflow-hidden rounded-full">
                  <div className="bg-[#1570ef]" style={{ width: '60%' }} />
                  <div className="bg-[#7a5af8]" style={{ width: '25%' }} />
                  <div className="bg-[#d0d5dd]" style={{ width: '15%' }} />
                </div>
                <ul className="mt-3 space-y-1 text-[11px] font-semibold text-[#475467]">
                  <li className="flex justify-between"><span>Direct</span><span>60%</span></li>
                  <li className="flex justify-between"><span>Shared</span><span>25%</span></li>
                  <li className="flex justify-between"><span>Unallocated</span><span>15%</span></li>
                </ul>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Upcoming Deadlines</h3>
                {[
                  [deadline, 'Project input due', 'High'],
                  [activeCycle?.midYearEnd || deadline, 'Evidence validation', 'Medium'],
                  [activeCycle?.endDate, 'Line manager acceptance', 'Medium'],
                ].filter(([date]) => Boolean(date)).map(([date, title, priority]) => (
                  <div key={String(title)} className="flex items-center justify-between gap-2 border-t border-[#eaecf0] py-2.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-[#b42318]">{safeFmtDate(String(date))}</p>
                      <p className="truncate text-[11px] font-semibold">{title}</p>
                    </div>
                    <StatusPill label={String(priority)} />
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
          <p className="mx-auto mt-2 max-w-lg text-sm text-[#667085]">This matrix input workspace section is ready for {activeTab.toLowerCase()} detail content.</p>
          <button type="button" onClick={() => setActiveTab('Overview')} className="mt-6 inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-4 text-[11px] font-semibold text-white">
            Back to Overview
          </button>
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#eaecf0] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={busy || !selected} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> Save Draft
          </button>
          <button type="button" onClick={() => setActiveTab('Score & Commentary')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold">
            Preview Input
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold">
            Return Assignment
          </button>
          <button type="button" disabled={busy || !selected || selected.status === 'Submitted'} onClick={() => void submitInput()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
            <Send className="h-3.5 w-3.5" /> Submit Project Input
          </button>
        </div>
      </div>
    </div>
  );
}
