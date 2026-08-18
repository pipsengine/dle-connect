'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
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
  Star,
  Target,
  Users,
} from 'lucide-react';
import type {
  AssessmentItem,
  PerformanceAssessment,
  PerformanceWorkspacePayload,
  RaterAssignment,
} from '@/lib/performance-domain-types';
import { fmtDate, fmtDateTime } from './performance-management-ui';

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
type InputStatus = 'Not Started' | 'Draft' | 'Ready to Submit' | 'At Risk' | 'Overdue' | 'Submitted' | 'Returned';
type ItemDraft = { rating: string; narrative: string; evidence: string };

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
        : key.includes('risk') || key.includes('overdue') || key.includes('blocker') || key.includes('high') || key.includes('not started') || key.includes('returned')
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
  if (assessment?.status === 'Returned') return 'Returned';
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

function bandLabel(score: number) {
  if (score >= 4.5) return 'Outstanding';
  if (score >= 3.5) return 'Exceeds Expectations';
  if (score >= 2.5) return 'Meets Expectations';
  if (score >= 1.5) return 'Needs Improvement';
  return 'Unsatisfactory';
}

export default function MatrixProjectInputsView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const actor = payload.actor;
  const cycles = domain.cycles || [];
  const behaviours = domain.config?.behaviourIndicators || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [projectFilter, setProjectFilter] = useState('All projects');
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [commentary, setCommentary] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const [returnReason, setReturnReason] = useState('');
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
      && (/matrix|project/i.test(row.relationship)
        || actor.scope === 'global'
        || row.raterId === actor.employeeId
        || row.raterName === actor.fullName),
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
      const employeeGoals = goals.filter((item) => item.employeeId === assessment.employeeId || item.employeeName === assessment.employeeName);
      const goal = employeeGoals[0];
      map.set(key, {
        key,
        employeeId: assessment.employeeId,
        employeeName: assessment.employeeName,
        employeeCode: goal?.employeeCode || assessment.employeeId,
        department: goal?.department || '—',
        project: goal?.strategicPillar
          ? `Project ${goal.strategicPillar}`
          : goal?.title
            ? goal.title
            : 'Matrix assignment',
        role: 'Project contributor',
        assessment,
        rater: matrixRaters.find((row) => row.employeeId === assessment.employeeId) || null,
      });
    }

    for (const rater of matrixRaters) {
      const key = rater.employeeId || rater.employeeName;
      if (map.has(key)) {
        map.get(key)!.rater = rater;
        continue;
      }
      const goal = goals.find((item) => item.employeeId === rater.employeeId);
      map.set(key, {
        key,
        employeeId: rater.employeeId,
        employeeName: rater.employeeName,
        employeeCode: goal?.employeeCode || rater.employeeId,
        department: goal?.department || '—',
        project: /matrix|project/i.test(rater.relationship) ? rater.relationship : 'Matrix assignment',
        role: rater.relationship || 'Project contributor',
        assessment: null,
        rater,
      });
    }

    return Array.from(map.values()).map((row) => {
      const status = inputStatus(row.assessment, row.rater, deadline);
      const items = row.assessment?.items || [];
      const rated = items.filter((item) => Number(item.managerRating || item.selfRating || 0) > 0).length;
      const progress = items.length
        ? Math.round((rated / items.length) * 100)
        : status === 'Submitted' ? 100 : 0;
      const evidenceHave = items.filter((item) => Boolean(item.evidence?.trim())).length;
      const evidenceNeed = Math.max(items.length, 1);
      const employeeGoals = goals.filter((goal) => goal.employeeId === row.employeeId || goal.employeeName === row.employeeName);
      const allocation = employeeGoals.length
        ? Math.min(100, Math.round(employeeGoals.reduce((sum, goal) => sum + Number(goal.weight || 0), 0)))
        : 0;
      const remaining = daysLeft(deadline);
      const weighted = items.reduce((sum, item) => {
        const rating = Number(item.managerRating || item.selfRating || 0);
        const weight = Number(item.weight || 0) || 1;
        return rating > 0 ? sum + rating * weight : sum;
      }, 0);
      const weightSum = items.reduce((sum, item) => {
        const rating = Number(item.managerRating || item.selfRating || 0);
        return rating > 0 ? sum + (Number(item.weight || 0) || 1) : sum;
      }, 0);
      const avgRating = weightSum ? weighted / weightSum : 0;
      const contributionScore = Math.round(avgRating * 20);
      const okrItems = items.filter((item) => item.itemType === 'okr');
      const behaviourItems = items.filter((item) => item.itemType === 'behaviour');
      const scoreParts = {
        performance: okrItems.length
          ? Math.round((okrItems.filter((item) => Number(item.managerRating || item.selfRating || 0) > 0).length / okrItems.length) * 100)
          : 0,
        competencies: behaviourItems.length
          ? Math.round((behaviourItems.filter((item) => Number(item.managerRating || item.selfRating || 0) > 0).length / behaviourItems.length) * 100)
          : 0,
        evidence: Math.round((evidenceHave / evidenceNeed) * 100),
      };
      return {
        ...row,
        status,
        progress,
        evidenceHave,
        evidenceNeed,
        allocation,
        remaining,
        contributionScore,
        avgRating: Math.round(avgRating * 100) / 100,
        scoreParts,
        employeeGoals,
        period: activeCycle ? `${safeFmtDate(activeCycle.startDate)} – ${safeFmtDate(activeCycle.endDate)}` : '—',
      };
    });
  }, [matrixAssessments, matrixRaters, goals, deadline, activeCycle]);

  const projects = useMemo(() => ['All projects', ...Array.from(new Set(queue.map((row) => row.project))).sort()], [queue]);
  const departments = useMemo(
    () => ['All departments', ...Array.from(new Set(queue.map((row) => row.department).filter((d) => d !== '—'))).sort()],
    [queue],
  );

  const filtered = useMemo(() => queue.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.employeeName} ${row.employeeCode} ${row.project} ${row.department}`.toLowerCase().includes(q)) return false;
    if (statusFilter !== 'All statuses' && row.status !== statusFilter) return false;
    if (projectFilter !== 'All projects' && row.project !== projectFilter) return false;
    if (departmentFilter !== 'All departments' && row.department !== departmentFilter) return false;
    return true;
  }), [queue, query, statusFilter, projectFilter, departmentFilter]);

  const selected = queue.find((row) => row.key === (selectedId || queue[0]?.key)) || null;

  useEffect(() => {
    if (!selected?.assessment) return;
    setCommentary(selected.assessment.overallComments || '');
    setStrengths(selected.assessment.strengths || '');
    setImprovements(selected.assessment.improvements || '');
  }, [selected?.assessment?.id, selected?.assessment?.updatedAt]);

  const draftFor = (item: AssessmentItem): ItemDraft => ({
    rating: itemDrafts[item.itemId]?.rating ?? (item.managerRating != null ? String(item.managerRating) : item.selfRating != null ? String(item.selfRating) : ''),
    narrative: itemDrafts[item.itemId]?.narrative ?? item.managerNarrative ?? item.selfNarrative ?? '',
    evidence: itemDrafts[item.itemId]?.evidence ?? item.evidence ?? '',
  });

  const patchItemDraft = (itemId: string, patch: Partial<ItemDraft>, fallback?: Partial<ItemDraft>) => {
    setItemDrafts((current) => ({
      ...current,
      [itemId]: {
        rating: current[itemId]?.rating ?? fallback?.rating ?? '',
        narrative: current[itemId]?.narrative ?? fallback?.narrative ?? '',
        evidence: current[itemId]?.evidence ?? fallback?.evidence ?? '',
        ...patch,
      },
    }));
  };

  const contributionItems = useMemo(() => {
    if (!selected) return [] as Array<{ item: AssessmentItem; goalTitle?: string; progress?: number }>;
    const assessmentItems = selected.assessment?.items?.filter((item) => item.itemType === 'okr') || [];
    if (assessmentItems.length) {
      return assessmentItems.map((item) => {
        const goal = selected.employeeGoals.find((row) => row.id === item.itemId || row.title === item.title);
        return { item, goalTitle: goal?.title, progress: goal?.progressPercent ?? item.achievement };
      });
    }
    return selected.employeeGoals.map((goal) => ({
      item: {
        itemId: goal.id,
        itemType: 'okr' as const,
        title: goal.title,
        weight: goal.weight,
        selfRating: undefined,
        selfNarrative: undefined,
        managerRating: undefined,
        managerNarrative: undefined,
        achievement: goal.progressPercent,
        evidence: undefined,
      } satisfies AssessmentItem,
      goalTitle: goal.title,
      progress: goal.progressPercent,
    }));
  }, [selected]);

  const competencyItems = useMemo(() => {
    const fromAssessment = selected?.assessment?.items?.filter((item) => item.itemType === 'behaviour') || [];
    if (fromAssessment.length) return fromAssessment;
    return behaviours.map((ind) => ({
      itemId: ind.id,
      itemType: 'behaviour' as const,
      title: ind.name,
      weight: ind.weight,
      managerRating: undefined,
      managerNarrative: ind.description,
      evidence: undefined,
    } satisfies AssessmentItem));
  }, [selected, behaviours]);

  const assigned = queue.length;
  const notStarted = queue.filter((row) => row.status === 'Not Started').length;
  const drafts = queue.filter((row) => ['Draft', 'Ready to Submit', 'At Risk'].includes(row.status)).length;
  const overdue = queue.filter((row) => row.status === 'Overdue').length;
  const submitted = queue.filter((row) => row.status === 'Submitted').length;
  const returned = queue.filter((row) => row.status === 'Returned').length;
  const readinessPct = assigned ? Math.round(((submitted + drafts * 0.5) / assigned) * 100) : 0;
  const blockers = overdue + returned + (notStarted > Math.max(assigned / 2, 0) ? 1 : 0);
  const stepIndex = submitted > 0 && submitted >= drafts ? 3 : drafts > 0 ? 2 : assigned > 0 ? 1 : 0;

  const canEditSelected = Boolean(
    selected
    && windowOpen
    && (!selected.assessment || ['Draft', 'Returned', 'Not Started'].includes(selected.assessment.status)),
  );

  const buildItemsForSave = (): AssessmentItem[] => {
    const okr = contributionItems.map(({ item, progress }) => {
      const draft = draftFor(item);
      const rating = Number(draft.rating || 0) || undefined;
      return {
        itemId: item.itemId,
        itemType: 'okr' as const,
        title: item.title,
        weight: item.weight,
        managerRating: rating,
        managerNarrative: draft.narrative,
        achievement: progress ?? item.achievement,
        evidence: draft.evidence,
      };
    });
    const behaviour = competencyItems.map((item) => {
      const draft = draftFor(item);
      return {
        itemId: item.itemId,
        itemType: 'behaviour' as const,
        title: item.title,
        weight: item.weight,
        managerRating: Number(draft.rating || 0) || undefined,
        managerNarrative: draft.narrative || item.managerNarrative,
        evidence: draft.evidence,
      };
    });
    return [...okr, ...behaviour];
  };

  const startOrContinue = async (row: typeof queue[number]) => {
    if (!row.assessment) {
      await onAction('assessment.save', {
        cycleId: cycleId || activeCycle?.id,
        type: 'Matrix',
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        status: 'Draft',
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
      items: buildItemsForSave(),
      overallComments: commentary,
      strengths,
      improvements,
    });
  };

  const submitInput = async () => {
    if (!selected) return;
    await saveDraft();
    if (selected.assessment?.id) {
      await onAction('assessment.submit', { id: selected.assessment.id });
    }
  };

  const returnAssignment = async () => {
    if (!selected?.assessment?.id || !returnReason.trim()) return;
    await onAction('assessment.return', { id: selected.assessment.id, reason: returnReason.trim() });
    setReturnReason('');
  };

  const sendReminders = async () => {
    const targets = queue.filter((row) => ['Not Started', 'Draft', 'At Risk', 'Overdue'].includes(row.status));
    for (const row of targets) {
      if (row.rater?.id && ['Nominated', 'Invited'].includes(row.rater.status)) {
        await onAction('rater.invite', { id: row.rater.id });
      }
    }
  };

  const exceptionRows = useMemo(() => {
    const rows: Array<{ severity: 'High' | 'Medium'; title: string; detail: string; key: string }> = [];
    for (const row of queue) {
      if (row.status === 'Overdue') {
        rows.push({ severity: 'High', title: `${row.employeeName} · overdue input`, detail: `Due ${safeFmtDate(deadline)} · ${row.project}`, key: `od-${row.key}` });
      }
      if (row.status === 'Returned') {
        rows.push({ severity: 'High', title: `${row.employeeName} · returned for revision`, detail: row.assessment?.returnedReason || 'Awaiting resubmission', key: `ret-${row.key}` });
      }
      if (row.status === 'Draft' && row.progress < 50) {
        rows.push({ severity: 'Medium', title: `${row.employeeName} · incomplete draft`, detail: `${row.progress}% of items rated`, key: `draft-${row.key}` });
      }
      if (row.status === 'Not Started') {
        rows.push({ severity: 'Medium', title: `${row.employeeName} · not started`, detail: row.project, key: `ns-${row.key}` });
      }
    }
    if (activeCycle && activeCycle.enableMatrix === false) {
      rows.push({ severity: 'High', title: 'Matrix inputs disabled for cycle', detail: activeCycle.name, key: 'matrix-off' });
    }
    return rows;
  }, [queue, deadline, activeCycle]);

  const auditRows = useMemo(() => {
    const matrixIds = new Set([
      ...matrixAssessments.map((item) => item.id),
      ...matrixRaters.map((item) => item.id),
    ]);
    const fromAudit = (domain.audit || []).filter((row) =>
      (row.entityType === 'PerformanceAssessment' || row.entityType === 'RaterAssignment')
      && (matrixIds.has(row.entityId) || /matrix|project/i.test(`${row.action} ${row.after || ''}`)),
    );
    const fromHistory = matrixAssessments.flatMap((assessment) =>
      (assessment.history || []).map((event) => ({
        id: `${assessment.id}-${event.version}-${event.at}`,
        at: event.at,
        actor: event.actor,
        actorRole: 'Matrix',
        action: event.change,
        entityType: 'PerformanceAssessment',
        entityId: assessment.id,
        after: event.reason,
      })),
    );
    return [...fromAudit, ...fromHistory]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 60);
  }, [domain.audit, matrixAssessments, matrixRaters]);

  const submittedRows = queue.filter((row) => row.status === 'Submitted');
  const sectionWeights = activeCycle?.sectionWeights || domain.config.sectionWeights;
  const selectedWeightedScore = selected?.avgRating || 0;

  const QueueTable = ({ source }: { source: typeof filtered }) => {
    const pageRows = source.slice((page - 1) * pageSize, page * pageSize);
    const pages = Math.max(1, Math.ceil(source.length / pageSize));
    return (
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
            <option>Returned</option>
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
            {pageRows.map((row) => (
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
                <p className="text-[10px] font-semibold">{row.evidenceHave}/{row.evidenceNeed}</p>
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
            {!pageRows.length ? (
              <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">
                No matrix / project inputs for this cycle. Nominate matrix raters or start an input for an assigned employee.
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaecf0] px-3 py-2 text-[10px] text-[#667085]">
          <span>Showing {source.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, source.length)} of {source.length}</span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="grid h-7 w-7 place-items-center rounded bg-[#1570ef] text-white">{page}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>
    );
  };

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
          <button type="button" disabled={busy} onClick={() => void sendReminders()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold disabled:opacity-50">
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
            {tab === 'Exceptions' && exceptionRows.length ? (
              <span className="ml-1 rounded-full bg-[#f04438] px-1.5 py-0.5 text-[9px] font-bold text-white">{exceptionRows.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' ? (
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

          <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <QueueTable source={filtered} />
              {selected ? (
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">Project Contribution Snapshot</h3>
                      <p className="mt-1 text-[12px] font-semibold text-[#475467]">{selected.employeeName} · {selected.employeeCode} · {selected.project}</p>
                    </div>
                    <StatusPill label={selected.status} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      ['Goal weight allocation', `${selected.allocation}%`],
                      ['Items rated', `${selected.progress}%`],
                      ['Evidence linked', `${selected.evidenceHave}/${selected.evidenceNeed}`],
                      ['Avg rating', selected.avgRating ? selected.avgRating.toFixed(2) : '—'],
                      ['Contribution score', selected.contributionScore ? `${selected.contributionScore}/100` : '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-[#eaecf0] p-3">
                        <p className="text-[10px] font-semibold text-[#667085]">{label}</p>
                        <p className="mt-1 text-lg font-bold">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#667085]">Live goals</h4>
                      <div className="space-y-2">
                        {selected.employeeGoals.map((goal) => (
                          <div key={goal.id} className="rounded-lg border border-[#eaecf0] px-3 py-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold">{goal.title}</p>
                              <span className="font-semibold text-[#667085]">{goal.progressPercent}%</span>
                            </div>
                            <MiniBar value={goal.progressPercent} />
                          </div>
                        ))}
                        {!selected.employeeGoals.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No linked employee goals in this cycle.</p> : null}
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#667085]">Competency ratings</h4>
                      <div className="space-y-2">
                        {competencyItems.slice(0, 5).map((item) => {
                          const rating = Number(draftFor(item).rating || 0);
                          return (
                            <div key={item.itemId} className="flex items-center justify-between rounded-lg border border-[#eaecf0] px-3 py-2">
                              <span className="text-[11px] font-semibold">{item.title}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold">{rating || '—'}</span>
                                <Stars value={rating} />
                              </div>
                            </div>
                          );
                        })}
                        {!competencyItems.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No competency indicators configured.</p> : null}
                      </div>
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
                    {blockers} blocker group{blockers === 1 ? '' : 's'}
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Section weights</h3>
                <ul className="space-y-1 text-[11px] font-semibold text-[#475467]">
                  <li className="flex justify-between"><span>Company objectives</span><span>{sectionWeights.companyObjectives}%</span></li>
                  <li className="flex justify-between"><span>Individual OKRs</span><span>{sectionWeights.individualOkrs}%</span></li>
                  <li className="flex justify-between"><span>Behavioural</span><span>{sectionWeights.behavioural}%</span></li>
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
      ) : null}

      {activeTab === 'Input Queue' ? <QueueTable source={filtered} /> : null}

      {activeTab === 'Project Contributions' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Project Contributions</h2>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">
                {selected
                  ? `Rate and document contributions for ${selected.employeeName} · ${selected.project}`
                  : 'Select an employee from the input queue to capture contributions.'}
              </p>
            </div>
            {selected ? <StatusPill label={selected.status} /> : null}
          </div>
          {!selected ? (
            <p className="mt-8 text-center text-sm font-semibold text-[#667085]">No matrix assignment selected.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {contributionItems.map(({ item, progress }) => {
                const draft = draftFor(item);
                return (
                  <article key={item.itemId} className="rounded-xl border border-[#eaecf0] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Target className="h-4 w-4 text-[#1570ef]" />
                          <p className="text-[13px] font-bold">{item.title}</p>
                          <StatusPill label={`Weight ${item.weight}%`} />
                        </div>
                        <p className="mt-1 text-[10px] font-semibold text-[#667085]">Live goal progress {progress ?? 0}%</p>
                      </div>
                      <select
                        disabled={!canEditSelected}
                        className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px] disabled:opacity-50"
                        value={draft.rating}
                        onChange={(e) => patchItemDraft(item.itemId, { rating: e.target.value }, {
                          narrative: item.managerNarrative || item.selfNarrative || '',
                          evidence: item.evidence || '',
                        })}
                      >
                        <option value="">Rate 1–5</option>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="mt-2"><MiniBar value={Number(progress || 0)} /></div>
                    <label className="mt-3 block text-[11px] font-semibold text-[#344054]">
                      Contribution narrative
                      <textarea
                        disabled={!canEditSelected}
                        className="mt-1 min-h-[72px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]"
                        value={draft.narrative}
                        onChange={(e) => patchItemDraft(item.itemId, { narrative: e.target.value }, {
                          rating: item.managerRating != null ? String(item.managerRating) : '',
                          evidence: item.evidence || '',
                        })}
                        placeholder="What was delivered on this project objective?"
                      />
                    </label>
                    <label className="mt-2 block text-[11px] font-semibold text-[#344054]">
                      Evidence notes / links
                      <textarea
                        disabled={!canEditSelected}
                        className="mt-1 min-h-[56px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]"
                        value={draft.evidence}
                        onChange={(e) => patchItemDraft(item.itemId, { evidence: e.target.value }, {
                          rating: item.managerRating != null ? String(item.managerRating) : '',
                          narrative: item.managerNarrative || '',
                        })}
                        placeholder="Deliverables, dates, or https:// links"
                      />
                    </label>
                  </article>
                );
              })}
              {!contributionItems.length ? (
                <p className="rounded-xl border border-dashed border-[#d0d5dd] px-4 py-10 text-center text-sm font-semibold text-[#667085]">
                  No project goals linked for this employee. Assign goals in OKR &amp; KPI Management, then continue here.
                </p>
              ) : null}
              <button type="button" disabled={busy || !canEditSelected} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Save contributions
              </button>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'Competencies' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Competencies</h2>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">
            {selected ? `Behavioural ratings for ${selected.employeeName}` : 'Select a matrix assignment to rate competencies.'}
          </p>
          <div className="mt-4 space-y-3">
            {competencyItems.map((item) => {
              const draft = draftFor(item);
              return (
                <div key={item.itemId} className="rounded-lg border border-[#eaecf0] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-bold">{item.title}</p>
                      <p className="mt-1 text-[10px] font-semibold text-[#667085]">Weight {item.weight}%</p>
                    </div>
                    <select
                      disabled={!canEditSelected}
                      className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px] disabled:opacity-50"
                      value={draft.rating}
                      onChange={(e) => patchItemDraft(item.itemId, { rating: e.target.value }, {
                        narrative: item.managerNarrative || '',
                        evidence: item.evidence || '',
                      })}
                    >
                      <option value="">Rate 1–5</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <label className="mt-2 block text-[11px] font-semibold text-[#344054]">
                    Comment
                    <textarea
                      disabled={!canEditSelected}
                      className="mt-1 min-h-[56px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]"
                      value={draft.narrative}
                      onChange={(e) => patchItemDraft(item.itemId, { narrative: e.target.value }, {
                        rating: item.managerRating != null ? String(item.managerRating) : '',
                        evidence: item.evidence || '',
                      })}
                    />
                  </label>
                </div>
              );
            })}
            {!competencyItems.length ? <p className="text-sm font-semibold text-[#667085]">No competency indicators configured in HRIS.</p> : null}
          </div>
          <button type="button" disabled={busy || !canEditSelected || !selected} onClick={() => void saveDraft()} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> Save competency ratings
          </button>
        </section>
      ) : null}

      {activeTab === 'Score & Commentary' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Score & Commentary</h2>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">
            {selected ? `Review calculated score and commentary for ${selected.employeeName}` : 'Select an assignment to preview scores.'}
          </p>
          {selected ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="rounded-xl border border-[#d1e9ff] bg-[#f5faff] p-4 text-center">
                <Donut value={selected.contributionScore} label="/100" size={120} />
                <p className="mt-3 text-2xl font-bold">{selectedWeightedScore ? selectedWeightedScore.toFixed(2) : '—'} / 5</p>
                <p className="mt-1 text-sm font-bold text-[#175cd3]">{selectedWeightedScore ? bandLabel(selectedWeightedScore) : 'Pending ratings'}</p>
              </div>
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ['OKR completion', `${selected.scoreParts.performance}%`],
                    ['Competency completion', `${selected.scoreParts.competencies}%`],
                    ['Evidence coverage', `${selected.scoreParts.evidence}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#eaecf0] p-3">
                      <p className="text-[10px] font-semibold text-[#667085]">{label}</p>
                      <p className="mt-1 text-lg font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <label className="block text-[11px] font-semibold text-[#344054]">Overall commentary
                  <textarea disabled={!canEditSelected} className="mt-1 min-h-[80px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]" value={commentary} onChange={(e) => setCommentary(e.target.value)} />
                </label>
                <label className="block text-[11px] font-semibold text-[#344054]">Strengths
                  <textarea disabled={!canEditSelected} className="mt-1 min-h-[60px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]" value={strengths} onChange={(e) => setStrengths(e.target.value)} />
                </label>
                <label className="block text-[11px] font-semibold text-[#344054]">Improvements
                  <textarea disabled={!canEditSelected} className="mt-1 min-h-[60px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm disabled:bg-[#f9fafb]" value={improvements} onChange={(e) => setImprovements(e.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || !canEditSelected} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold disabled:opacity-50">
                    <Save className="h-3.5 w-3.5" /> Save draft
                  </button>
                  <button type="button" disabled={busy || !selected.assessment?.id || selected.status === 'Submitted'} onClick={() => void submitInput()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                    <Send className="h-3.5 w-3.5" /> Submit project input
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-8 text-center text-sm font-semibold text-[#667085]">No assignment selected.</p>
          )}
        </section>
      ) : null}

      {activeTab === 'Submitted Inputs' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Submitted Inputs</h2>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">{submittedRows.length} submitted matrix / project assessment{submittedRows.length === 1 ? '' : 's'}.</p>
          <div className="mt-4 space-y-2">
            {submittedRows.map((row) => (
              <div key={row.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eaecf0] px-3 py-3">
                <div>
                  <p className="text-[12px] font-bold">{row.employeeName} · {row.project}</p>
                  <p className="mt-1 text-[10px] font-semibold text-[#667085]">
                    Submitted {safeFmtDate(row.assessment?.submittedAt)} · Avg {row.avgRating ? row.avgRating.toFixed(2) : '—'} · Evidence {row.evidenceHave}/{row.evidenceNeed}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setSelectedId(row.key); setActiveTab('Score & Commentary'); }} className="h-8 rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold">Open</button>
                  {actor.scope === 'global' && row.assessment?.id ? (
                    <button type="button" disabled={busy} onClick={() => { setSelectedId(row.key); setActiveTab('Exceptions'); }} className="h-8 rounded-lg bg-[#1570ef] px-2.5 text-[10px] font-semibold text-white disabled:opacity-50">Return</button>
                  ) : null}
                </div>
              </div>
            ))}
            {!submittedRows.length ? <p className="py-10 text-center text-sm font-semibold text-[#667085]">No submitted matrix inputs yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Exceptions' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Exceptions</h2>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">{exceptionRows.length} issue{exceptionRows.length === 1 ? '' : 's'} requiring attention</p>
          <div className="mt-4 space-y-2">
            {exceptionRows.map((row) => (
              <div key={row.key} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#eaecf0] px-3 py-3">
                <div>
                  <StatusPill label={row.severity} />
                  <p className="mt-2 text-[12px] font-bold">{row.title}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#667085]">{row.detail}</p>
                </div>
                <button type="button" onClick={() => setActiveTab('Input Queue')} className="h-8 rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold">Open queue</button>
              </div>
            ))}
            {!exceptionRows.length ? (
              <div className="rounded-xl border border-[#abefc6] bg-[#ecfdf3] px-4 py-8 text-center text-[12px] font-semibold text-[#027a48]">
                No matrix input exceptions.
              </div>
            ) : null}
          </div>
          {selected?.assessment?.id && selected.status === 'Submitted' && actor.scope === 'global' ? (
            <div className="mt-4 rounded-xl border border-[#eaecf0] p-4">
              <h3 className="text-sm font-bold">Return selected assignment</h3>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">{selected.employeeName} · {selected.project}</p>
              <textarea className="mt-2 min-h-[70px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Reason for return" />
              <button type="button" disabled={busy || !returnReason.trim()} onClick={() => void returnAssignment()} className="mt-2 inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                Return assignment
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'History & Audit' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">History & Audit</h2>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Matrix assessment and rater events from the HRIS audit trail.</p>
          <div className="mt-4 space-y-2">
            {auditRows.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{row.action}</p>
                  <span className="text-[10px] font-semibold text-[#667085]">{fmtDateTime(row.at)}</span>
                </div>
                <p className="mt-1 font-semibold text-[#475467]">{row.actor} · {row.actorRole} · {row.entityType}/{row.entityId}</p>
                {row.after ? <p className="mt-1 text-[10px] font-semibold text-[#667085]">{row.after}</p> : null}
              </div>
            ))}
            {!auditRows.length ? <p className="py-10 text-center text-sm font-semibold text-[#667085]">No matrix audit history yet.</p> : null}
          </div>
        </section>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#eaecf0] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-[#667085]">
            {selected ? `${selected.employeeName} · ${selected.project}` : 'No assignment selected'}
            {selected ? ` · ${selected.evidenceHave} evidence linked` : ''}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" disabled={busy || !selected || !canEditSelected} onClick={() => void saveDraft()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save Draft
            </button>
            <button type="button" onClick={() => setActiveTab('Score & Commentary')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold">
              <ClipboardList className="h-3.5 w-3.5" /> Preview Input
            </button>
            <button
              type="button"
              disabled={busy || !selected?.assessment?.id || selected.status !== 'Submitted' || actor.scope !== 'global'}
              onClick={() => setActiveTab('Exceptions')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold disabled:opacity-50"
            >
              Return Assignment
            </button>
            <button type="button" disabled={busy || !selected || selected.status === 'Submitted' || !canEditSelected} onClick={() => void submitInput()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
              <Send className="h-3.5 w-3.5" /> Submit Project Input
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
