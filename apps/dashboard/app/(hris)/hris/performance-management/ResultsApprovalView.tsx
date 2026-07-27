'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Globe2,
  Info,
  Play,
  Search,
  Users,
} from 'lucide-react';
import { displayScore } from '@/lib/performance-calculation';
import type { PerformanceResult, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Computation Queue',
  'Result Breakdown',
  'Validation Review',
  'Approvals',
  'Publication',
  'Acknowledgements',
  'Appeals',
  'Versions & Recomputations',
  'Audit History',
] as const;

type TabId = (typeof TABS)[number];

const STEPS = [
  'Ready to Compute',
  'Computed',
  'Validation Review',
  'Pending Approval',
  'Approved',
  'Published',
  'Acknowledged',
  'Closed',
] as const;

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
    key.includes('ready') || key.includes('approved') || key.includes('published') || key.includes('acknowledged') || key.includes('complete')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('computed') || key.includes('review') || key.includes('scheduled') || key.includes('validation')
        ? 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]'
        : key.includes('await') || key.includes('pending') || key.includes('overdue')
          ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
          : key.includes('block') || key.includes('critical') || key.includes('appeal') || key.includes('reject')
            ? 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]'
            : 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{label}</span>;
};

const Donut = ({ value, label }: { value: number; label: string }) => (
  <div
    className="relative mx-auto grid h-[100px] w-[100px] place-items-center rounded-full"
    style={{ background: `conic-gradient(#1570ef ${Math.max(0, Math.min(100, value)) * 3.6}deg, #e4e7ec 0)` }}
  >
    <span className="absolute inset-[16px] grid place-items-center rounded-full bg-white text-center">
      <b className="text-lg font-bold">{value}%</b>
      <small className="text-[8px] font-semibold uppercase text-[#667085]">{label}</small>
    </span>
  </div>
);

type QueueRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  result?: PerformanceResult;
  readinessLabel: string;
  blockers: string[];
  calibrationLabel: string;
  approvalLabel: string;
  publicationLabel: string;
  nextAction: 'compute' | 'resolve' | 'publish' | 'acknowledge' | 'appeal' | 'none';
  nextLabel: string;
};

export default function ResultsApprovalView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [actionFilter, setActionFilter] = useState('All next actions');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const pageSize = 6;

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const weights = activeCycle?.sectionWeights || domain.config.sectionWeights;

  const results = useMemo(
    () => (domain.results || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.results, cycleId],
  );
  const eligibility = useMemo(
    () => (domain.eligibility || []).filter((row) => (!cycleId || row.cycleId === cycleId) && row.included),
    [domain.eligibility, cycleId],
  );
  const goals = useMemo(
    () => (domain.goals || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.goals, cycleId],
  );
  const assessments = useMemo(
    () => (domain.assessments || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.assessments, cycleId],
  );
  const calibration = useMemo(
    () => (domain.calibration || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.calibration, cycleId],
  );
  const appeals = useMemo(
    () => (domain.appeals || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.appeals, cycleId],
  );
  const audit = useMemo(
    () => (domain.audit || []).filter((row) => {
      if (!['PerformanceResult', 'AppealCase', 'CalibrationCase'].includes(row.entityType)) return false;
      return true;
    }).slice(0, 40),
    [domain.audit],
  );

  const population = useMemo(() => {
    const byId = new Map<string, { employeeId: string; employeeName: string; employeeCode: string; department: string }>();
    eligibility.forEach((row) => {
      byId.set(row.employeeId, {
        employeeId: row.employeeId,
        employeeName: row.fullName,
        employeeCode: row.employeeCode,
        department: row.department || '—',
      });
    });
    goals.forEach((row) => {
      if (!byId.has(row.employeeId)) {
        byId.set(row.employeeId, {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          employeeCode: row.employeeCode,
          department: row.department || '—',
        });
      }
    });
    results.forEach((row) => {
      if (!byId.has(row.employeeId)) {
        byId.set(row.employeeId, {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          employeeCode: row.employeeId,
          department: '—',
        });
      }
    });
    return Array.from(byId.values());
  }, [eligibility, goals, results]);

  const queue = useMemo<QueueRow[]>(() => population.map((person) => {
    const result = results.find((row) => row.employeeId === person.employeeId);
    const employeeGoals = goals.filter((row) => row.employeeId === person.employeeId && ['Agreed', 'Active', 'Completed'].includes(row.status));
    const managerAssessment = assessments.find((row) => row.employeeId === person.employeeId && row.type === 'Manager' && ['Submitted', 'Approved', 'Published'].includes(row.status));
    const openCal = calibration.find((row) => row.employeeId === person.employeeId && (row.status === 'Open' || row.status === 'Proposed'));
    const approvedCal = calibration.find((row) => row.employeeId === person.employeeId && row.status === 'Approved');
    const appeal = appeals.find((row) => row.employeeId === person.employeeId && !['Closed', 'Rejected', 'Upheld'].includes(row.status));

    const blockers: string[] = [];
    if (!employeeGoals.length) blockers.push('Goals incomplete');
    if (!managerAssessment) blockers.push('Manager assessment missing');
    if (openCal) blockers.push('Calibration incomplete');

    let readinessLabel = 'Ready';
    if (result) {
      if (result.status === 'Draft') readinessLabel = 'Computed';
      else if (result.status === 'Approved') readinessLabel = 'Validated';
      else if (result.status === 'Published') readinessLabel = result.acknowledgedAt ? 'Acknowledged' : 'Published';
      else if (result.status === 'Appealed') readinessLabel = 'Appealed';
      else if (result.status === 'Amended') readinessLabel = 'Amended';
      else readinessLabel = result.status;
    } else if (blockers.length) {
      readinessLabel = `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`;
    }

    const calibrationLabel = approvedCal
      ? `Approved ${approvedCal.id}`
      : openCal
        ? openCal.status === 'Proposed' ? 'Panel review' : 'Open'
        : 'Not required';

    const approvalLabel = result
      ? result.status === 'Approved' || result.status === 'Amended'
        ? 'Ready to publish'
        : result.status === 'Published'
          ? 'Approved'
          : result.status === 'Draft'
            ? 'HR validation'
            : result.status
      : blockers.length
        ? 'Blocked'
        : 'Pending compute';

    const publicationLabel = result?.publishedAt
      ? `Published ${safeFmtDate(result.publishedAt)}`
      : result && ['Approved', 'Amended'].includes(result.status)
        ? activeCycle?.publicationDate
          ? `Scheduled ${safeFmtDate(activeCycle.publicationDate)}`
          : 'Ready to schedule'
        : '—';

    let nextAction: QueueRow['nextAction'] = 'none';
    let nextLabel = 'View';
    if (!result && blockers.length) {
      nextAction = 'resolve';
      nextLabel = 'Resolve blockers';
    } else if (!result) {
      nextAction = 'compute';
      nextLabel = 'Compute result';
    } else if (result.status === 'Draft' || result.status === 'Amended') {
      nextAction = 'publish';
      nextLabel = 'Review & approve';
    } else if (result.status === 'Approved') {
      nextAction = 'publish';
      nextLabel = 'Publish';
    } else if (result.status === 'Published' && !result.acknowledgedAt) {
      nextAction = 'acknowledge';
      nextLabel = 'Acknowledge';
    } else if (result.status === 'Published' && appeal) {
      nextAction = 'appeal';
      nextLabel = 'Review appeal';
    }

    return {
      key: result?.id || person.employeeId,
      employeeId: person.employeeId,
      employeeName: person.employeeName,
      employeeCode: person.employeeCode,
      department: person.department,
      result,
      readinessLabel,
      blockers,
      calibrationLabel,
      approvalLabel,
      publicationLabel,
      nextAction,
      nextLabel,
    };
  }), [population, results, goals, assessments, calibration, appeals, activeCycle]);

  const departments = useMemo(
    () => ['All departments', ...Array.from(new Set(queue.map((row) => row.department).filter((d) => d && d !== '—'))).sort()],
    [queue],
  );

  const filtered = useMemo(() => queue.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.employeeName} ${row.employeeId} ${row.employeeCode} ${row.department}`.toLowerCase().includes(q)) return false;
    if (departmentFilter !== 'All departments' && row.department !== departmentFilter) return false;
    if (statusFilter !== 'All statuses') {
      const status = row.result?.status || (row.blockers.length ? 'Blocked' : 'Ready');
      if (status !== statusFilter && row.readinessLabel !== statusFilter && row.approvalLabel !== statusFilter) return false;
    }
    if (actionFilter !== 'All next actions' && row.nextLabel !== actionFilter) return false;
    return true;
  }), [queue, query, departmentFilter, statusFilter, actionFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const focused = useMemo(() => {
    if (focusKey) return queue.find((row) => row.key === focusKey) || filtered[0] || queue[0];
    return filtered[0] || queue[0];
  }, [focusKey, queue, filtered]);

  const eligibleCount = Math.max(population.length, activeCycle?.eligibilityCount || 0);
  const computedCount = results.length;
  const blockedCount = queue.filter((row) => row.blockers.length && !row.result).length;
  const criticalBlockers = queue.filter((row) => row.blockers.length >= 2 && !row.result).length;
  const awaitingApproval = results.filter((row) => row.status === 'Draft' || row.status === 'Amended').length;
  const readyToPublish = results.filter((row) => row.status === 'Approved').length;
  const approvedCount = results.filter((row) => ['Approved', 'Amended', 'Published'].includes(row.status)).length;
  const publishedCount = results.filter((row) => row.status === 'Published').length;
  const acknowledgedCount = results.filter((row) => Boolean(row.acknowledgedAt)).length;
  const readyCount = queue.filter((row) => !row.blockers.length || Boolean(row.result)).length;
  const readinessPct = eligibleCount ? Math.round((readyCount / eligibleCount) * 100) : 0;
  const computedPct = eligibleCount ? Math.round((computedCount / eligibleCount) * 100) : 0;
  const approvedPct = eligibleCount ? Math.round((approvedCount / eligibleCount) * 100) : 0;
  const ackPct = publishedCount ? Math.round((acknowledgedCount / publishedCount) * 100) : 0;
  const openAppeals = appeals.filter((row) => !['Closed', 'Rejected', 'Upheld'].includes(row.status)).length;

  const topBlockers = useMemo(() => {
    const counts = new Map<string, number>();
    queue.forEach((row) => row.blockers.forEach((b) => counts.set(b, (counts.get(b) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [queue]);

  const ratingDistribution = useMemo(() => {
    const bands = (activeCycle?.ratingBands || domain.config.ratingBands || []).map((band) => band.label);
    const labels = bands.length
      ? bands
      : ['Outstanding', 'Exceeds Expectations', 'Meets Expectations', 'Needs Improvement', 'Unsatisfactory'];
    const total = Math.max(results.length, 1);
    return labels.map((label) => {
      const count = results.filter((row) => row.ratingBand === label).length;
      return { label, count, pct: Math.round((count / total) * 1000) / 10 };
    });
  }, [results, activeCycle, domain.config.ratingBands]);

  const distributionOk = ratingDistribution.every((row) => row.pct <= 40);

  const stepIndex = useMemo(() => {
    const status = activeCycle?.status;
    if (status === 'Closed' || status === 'Archived') return 7;
    if (status === 'Appeal Window' && acknowledgedCount) return 6;
    if (status === 'Results Published' || publishedCount) return publishedCount && ackPct >= 70 ? 6 : 5;
    if (status === 'Approved' || (approvedCount && approvedCount === results.length && results.length)) return 4;
    if (awaitingApproval) return 3;
    if (computedCount) return 2;
    if (readyCount) return 1;
    return 0;
  }, [activeCycle, acknowledgedCount, publishedCount, ackPct, approvedCount, results.length, awaitingApproval, computedCount, readyCount]);

  const publicationWindow = activeCycle?.publicationDate
    ? safeFmtDate(activeCycle.publicationDate)
    : activeCycle?.endDate
      ? safeFmtDate(activeCycle.endDate)
      : '—';

  const selectedApprovals = selectedIds.length
    ? results.filter((row) => selectedIds.includes(row.id) && ['Approved', 'Amended'].includes(row.status))
    : results.filter((row) => row.status === 'Approved').slice(0, 5);

  const runReadiness = async () => {
    const ready = queue.filter((row) => !row.result && !row.blockers.length).slice(0, 8);
    for (const row of ready) {
      await onAction('result.compute', {
        cycleId: cycleId || activeCycle?.id,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
      });
    }
  };

  const runNext = async (row: QueueRow) => {
    setFocusKey(row.key);
    if (row.nextAction === 'compute') {
      await onAction('result.compute', {
        cycleId: cycleId || activeCycle?.id,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
      });
      return;
    }
    if (row.nextAction === 'publish' && row.result) {
      if (row.result.status === 'Approved' || row.result.status === 'Amended') {
        await onAction('result.publish', { id: row.result.id });
      }
      return;
    }
    if (row.nextAction === 'acknowledge' && row.result) {
      await onAction('result.acknowledge', { id: row.result.id });
      return;
    }
    if (row.nextAction === 'resolve') {
      setActiveTab('Validation Review');
    }
  };

  const publishSelected = async () => {
    for (const row of selectedApprovals) {
      await onAction('result.publish', { id: row.id });
    }
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const focusedBreakdown = focused?.result
    ? [
        { component: 'Company objectives', score: focused.result.sectionScores.companyObjectives, weight: weights.companyObjectives },
        { component: 'Individual OKRs', score: focused.result.sectionScores.individualOkrs, weight: weights.individualOkrs },
        { component: 'Behavioural', score: focused.result.sectionScores.behavioural, weight: weights.behavioural },
      ].map((row) => ({
        ...row,
        weighted: Math.round((row.score * row.weight) / 100 * 100) / 100,
      }))
    : [];

  const showQueue = activeTab === 'Overview' || activeTab === 'Computation Queue' || activeTab === 'Validation Review' || activeTab === 'Approvals' || activeTab === 'Publication';
  const showBreakdown = activeTab === 'Overview' || activeTab === 'Result Breakdown';
  const showSidePanels = activeTab === 'Overview' || activeTab === 'Validation Review' || activeTab === 'Approvals' || activeTab === 'Publication' || activeTab === 'Acknowledgements';

  return (
    <div className="space-y-4 pb-16 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Results Approval</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Validate, compute, approve and publish final employee performance results</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cycleId}
            onChange={(e) => { setCycleId(e.target.value); setPage(1); setSelectedIds([]); }}
            className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold"
          >
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runReadiness()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> Run readiness validation
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-bold">{activeCycle?.name || 'Performance cycle'}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill label={`Scoring model: ${activeCycle?.templateId || activeCycle?.type || 'Cycle'} v${activeCycle?.version || 1}`} />
              <StatusPill label={`Approval stage: ${STEPS[Math.min(stepIndex, STEPS.length - 1)]}`} />
              <StatusPill label={`Publication window: ${publicationWindow}`} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label="Results governance active" />
            <StatusPill label={`Acting as ${payload.actor.fullName} • ${payload.actor.role}`} />
          </div>
        </div>
        <div className="mt-4 flex min-w-[720px] overflow-x-auto">
          {STEPS.map((step, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'upcoming';
            return (
              <div key={step} className="relative flex-1 text-center">
                {index < STEPS.length - 1 ? <i className={`absolute left-1/2 top-4 z-0 h-0.5 w-full ${state === 'done' ? 'bg-[#12b76a]' : 'bg-[#d0d5dd]'}`} /> : null}
                <div className={`relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold ${
                  state === 'done' ? 'border-[#12b76a] bg-white text-[#12b76a]'
                    : state === 'current' ? 'border-[#1570ef] bg-[#1570ef] text-white shadow-[0_0_0_4px_#d1e9ff]'
                      : 'border-[#d0d5dd] bg-white text-[#98a2b3]'
                }`}>
                  {state === 'done' ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <b className={`mt-2 block text-[9px] ${state === 'current' ? 'text-[#1570ef]' : 'text-[#344054]'}`}>{step}</b>
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

      {(activeTab === 'Overview' || activeTab === 'Computation Queue') ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { icon: Users, label: 'Eligible Results', value: String(eligibleCount || 0), sub: `${readinessPct}% readiness`, tone: 'blue' as const },
            { icon: Calculator, label: 'Computed', value: String(computedCount), sub: `${computedPct}%`, tone: 'teal' as const },
            { icon: AlertTriangle, label: 'Blocked', value: String(blockedCount), sub: `${criticalBlockers} critical`, tone: 'red' as const },
            { icon: Clock3, label: 'Awaiting Approval', value: String(awaitingApproval), sub: `${readyToPublish} ready to publish · ${openAppeals} appeals`, tone: 'orange' as const },
            { icon: CheckCircle2, label: 'Approved', value: String(approvedCount), sub: `${approvedPct}%`, tone: 'green' as const },
            { icon: Globe2, label: 'Published', value: String(publishedCount), sub: `${ackPct}% acknowledged`, tone: 'purple' as const },
          ].map((kpi) => (
            <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                <span className={`grid h-7 w-7 place-items-center rounded-lg ${
                  kpi.tone === 'blue' ? 'bg-[#eff8ff] text-[#175cd3]'
                    : kpi.tone === 'teal' ? 'bg-[#f0fdfa] text-[#0f766e]'
                      : kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#b42318]'
                        : kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#b54708]'
                          : kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#027a48]'
                            : 'bg-[#f4f3ff] text-[#5925dc]'
                }`}>
                  <kpi.icon className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight">{kpi.value}</p>
              <p className="mt-1 text-[10px] font-semibold text-[#667085]">{kpi.sub}</p>
            </article>
          ))}
        </div>
      ) : null}

      {showQueue ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-[#eaecf0] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-bold">Results computation & approval queue</h3>
              <p className="text-[10px] font-medium text-[#667085]">{filtered.length} employees in current filters</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#98a2b3]" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder="Search employee"
                  className="h-9 w-44 rounded-lg border border-[#d0d5dd] bg-white pl-8 pr-3 text-[11px] font-semibold outline-none focus:border-[#1570ef]"
                />
              </label>
              <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
                {departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
                {['All statuses', 'Ready', 'Blocked', 'Draft', 'Approved', 'Published', 'Appealed', 'Amended'].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
                {['All next actions', 'Compute result', 'Resolve blockers', 'Publish', 'Review & approve', 'Acknowledge'].map((action) => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-[#f9fafb] text-[#667085]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Readiness</th>
                  <th className="px-3 py-2.5 font-semibold">Score</th>
                  <th className="px-3 py-2.5 font-semibold">Calibration</th>
                  <th className="px-3 py-2.5 font-semibold">Approval</th>
                  <th className="px-3 py-2.5 font-semibold">Publication</th>
                  <th className="px-3 py-2.5 font-semibold">Next action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setFocusKey(row.key)}
                    className={`cursor-pointer border-t border-[#eaecf0] hover:bg-[#f8fafc] ${focusKey === row.key ? 'bg-[#eff8ff]' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(row.result && selectedIds.includes(row.result.id))}
                        disabled={!row.result}
                        onChange={() => row.result && toggleSelect(row.result.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d1e9ff] text-[10px] font-bold text-[#175cd3]">{initials(row.employeeName)}</span>
                        <div>
                          <p className="font-bold text-[#101828]">{row.employeeName}</p>
                          <p className="text-[10px] font-medium text-[#667085]">{row.employeeCode} · {row.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusPill label={row.readinessLabel} /></td>
                    <td className="px-3 py-3 font-semibold">
                      {row.result ? `${displayScore(row.result.finalScore)} / 100` : '—'}
                      {row.result ? <p className="text-[10px] font-medium text-[#667085]">{row.result.ratingBand}</p> : null}
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#475467]">{row.calibrationLabel}</td>
                    <td className="px-3 py-3"><StatusPill label={row.approvalLabel} /></td>
                    <td className="px-3 py-3 font-semibold text-[#475467]">{row.publicationLabel}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={busy || row.nextAction === 'none'}
                        onClick={(e) => { e.stopPropagation(); void runNext(row); }}
                        className="inline-flex h-8 items-center rounded-lg bg-[#1570ef] px-2.5 text-[10px] font-semibold text-white disabled:opacity-40"
                      >
                        {row.nextLabel}
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-[11px] font-semibold text-[#98a2b3]">No employees match the current filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#eaecf0] px-4 py-3 text-[11px] font-semibold text-[#667085]">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d0d5dd] disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d0d5dd] disabled:opacity-40">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showBreakdown || showSidePanels ? (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          {showBreakdown ? (
            <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">Transparent result breakdown</h3>
                  <p className="text-[10px] font-medium text-[#667085]">
                    {focused ? `${focused.employeeName} · ${focused.employeeCode}` : 'Select an employee from the queue'}
                  </p>
                </div>
                {focused?.result ? <StatusPill label={`v${focused.result.version} · ${focused.result.status}`} /> : null}
              </div>

              {focused?.result ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-[11px]">
                      <thead className="bg-[#f9fafb] text-[#667085]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Component</th>
                          <th className="px-3 py-2 font-semibold">Employee score</th>
                          <th className="px-3 py-2 font-semibold">Weight</th>
                          <th className="px-3 py-2 font-semibold">Weighted score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {focusedBreakdown.map((row) => (
                          <tr key={row.component} className="border-t border-[#eaecf0]">
                            <td className="px-3 py-2.5 font-semibold">{row.component}</td>
                            <td className="px-3 py-2.5 font-semibold">{displayScore(row.score)}</td>
                            <td className="px-3 py-2.5 font-semibold">{row.weight}%</td>
                            <td className="px-3 py-2.5 font-semibold">{displayScore(row.weighted)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-xl border border-[#d1e9ff] bg-[#eff8ff] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#175cd3]">Final score</p>
                    <p className="mt-2 text-3xl font-bold text-[#101828]">{displayScore(focused.result.finalScore)} <span className="text-base font-semibold text-[#667085]">/ 100</span></p>
                    <p className="mt-2 text-sm font-bold text-[#027a48]">{focused.result.ratingBand}</p>
                    {focused.result.managerComments ? <p className="mt-3 text-[11px] font-medium text-[#475467]">{focused.result.managerComments}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-dashed border-[#eaecf0] bg-[#f8fafc] px-4 py-10 text-center text-[11px] font-semibold text-[#98a2b3]">
                  {focused?.blockers.length
                    ? `Blocked: ${focused.blockers.join(', ')}. Resolve blockers before computing.`
                    : 'No computed result yet for this employee.'}
                </p>
              )}
            </section>
          ) : <div />}

          {showSidePanels ? (
            <div className="space-y-4">
              {(activeTab === 'Overview' || activeTab === 'Validation Review') ? (
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold">Population readiness</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                    <Donut value={readinessPct} label="Ready" />
                    <div>
                      <p className="text-[11px] font-semibold text-[#344054]">Top blockers</p>
                      <ul className="mt-2 space-y-1.5">
                        {topBlockers.length ? topBlockers.map(([label, count]) => (
                          <li key={label} className="flex items-center justify-between text-[11px] font-semibold text-[#475467]">
                            <span>{label}</span>
                            <span className="text-[#b42318]">{count}</span>
                          </li>
                        )) : <li className="text-[11px] font-semibold text-[#027a48]">No blockers detected</li>}
                      </ul>
                    </div>
                  </div>
                </section>
              ) : null}

              {(activeTab === 'Overview' || activeTab === 'Approvals') ? (
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">Rating distribution</h3>
                    {distributionOk ? <StatusPill label="Within threshold" /> : <StatusPill label="Review distribution" />}
                  </div>
                  <div className="mt-3 space-y-2">
                    {ratingDistribution.map((row) => (
                      <div key={row.label}>
                        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#475467]">
                          <span>{row.label}</span>
                          <span>{row.count} · {row.pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
                          <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${Math.min(100, row.pct)}%` }} />
                        </div>
                      </div>
                    ))}
                    {!results.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No computed results yet.</p> : null}
                  </div>
                </section>
              ) : null}

              {(activeTab === 'Overview' || activeTab === 'Publication' || activeTab === 'Approvals' || activeTab === 'Acknowledgements') ? (
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold">Approval & publication controls</h3>
                  <div className="mt-3 space-y-2">
                    {[
                      ['Manager', focused?.result ? 'Complete' : 'Pending'],
                      ['Dept Head', focused?.result ? 'Complete' : 'Pending'],
                      ['HR', focused?.approvalLabel || 'Pending'],
                      ['Executive', focused?.result?.status === 'Published' ? 'Published' : 'Queued'],
                    ].map(([label, status]) => (
                      <div key={label} className="flex items-center justify-between rounded-lg border border-[#eaecf0] px-3 py-2 text-[11px] font-semibold">
                        <span>{label}</span>
                        <StatusPill label={status} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg border border-[#fedf89] bg-[#fffaeb] px-3 py-2 text-[11px] font-semibold text-[#b54708]">
                    Due {publicationWindow}
                    {blockedCount ? ` · ${blockedCount} results blocked` : ''}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      disabled={busy || !selectedApprovals.length}
                      onClick={() => void publishSelected()}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      Submit selected for approval ({selectedApprovals.length || 'auto'})
                    </button>
                    <button
                      type="button"
                      disabled={busy || !results.some((row) => row.status === 'Approved')}
                      onClick={() => void publishSelected()}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold disabled:opacity-50"
                    >
                      Schedule publication
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2 rounded-lg border border-[#b2ddff] bg-[#eff8ff] px-3 py-2 text-[10px] font-semibold text-[#175cd3]">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Approved results cannot be overwritten; recomputation creates a new version.
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'Acknowledgements' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Acknowledgements</h3>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">{acknowledgedCount} of {publishedCount} published results acknowledged ({ackPct}%).</p>
          <div className="mt-4 space-y-2">
            {results.filter((row) => row.status === 'Published').map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eaecf0] px-3 py-2.5">
                <div>
                  <p className="text-[12px] font-bold">{row.employeeName}</p>
                  <p className="text-[10px] font-semibold text-[#667085]">{displayScore(row.finalScore)} · {row.ratingBand}</p>
                </div>
                {row.acknowledgedAt ? (
                  <StatusPill label={`Acknowledged ${safeFmtDate(row.acknowledgedAt)}`} />
                ) : (
                  <button type="button" disabled={busy} onClick={() => void onAction('result.acknowledge', { id: row.id })} className="inline-flex h-8 items-center rounded-lg bg-[#1570ef] px-2.5 text-[10px] font-semibold text-white disabled:opacity-50">
                    Acknowledge
                  </button>
                )}
              </div>
            ))}
            {!publishedCount ? <p className="text-[11px] font-semibold text-[#98a2b3]">No published results yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Appeals' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Appeals</h3>
          <div className="mt-4 space-y-2">
            {appeals.map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#eaecf0] px-3 py-3">
                <div>
                  <p className="text-[12px] font-bold">{row.employeeName}</p>
                  <p className="text-[11px] font-semibold text-[#667085]">{row.reason}</p>
                  <p className="mt-1 text-[10px] font-semibold text-[#475467]">Requested: {row.requestedOutcome}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={row.status} />
                  {['Submitted', 'HR Review', 'Panel', 'Manager Responded'].includes(row.status) ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => void onAction('appeal.decide', { id: row.id, decision: 'Amended', newScore: 80, panelDecision: 'Score amended after evidence review' })} className="inline-flex h-8 items-center rounded-lg bg-[#1570ef] px-2.5 text-[10px] font-semibold text-white disabled:opacity-50">Amend</button>
                      <button type="button" disabled={busy} onClick={() => void onAction('appeal.decide', { id: row.id, decision: 'Rejected', panelDecision: 'Original rating upheld' })} className="inline-flex h-8 items-center rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold disabled:opacity-50">Reject</button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            {!appeals.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No appeals submitted for this cycle.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Versions & Recomputations' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Versions & recomputations</h3>
          <div className="mt-4 space-y-3">
            {results.map((row) => (
              <article key={row.id} className="rounded-xl border border-[#eaecf0] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-bold">{row.employeeName}</p>
                    <p className="text-[10px] font-semibold text-[#667085]">Current v{row.version} · {displayScore(row.finalScore)} · {row.ratingBand}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAction('result.compute', { cycleId: row.cycleId, employeeId: row.employeeId, employeeName: row.employeeName })}
                    className="inline-flex h-8 items-center rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold disabled:opacity-50"
                  >
                    Recompute
                  </button>
                </div>
                <ul className="mt-3 space-y-1">
                  {row.history.slice().reverse().map((entry) => (
                    <li key={`${row.id}-${entry.version}`} className="text-[10px] font-semibold text-[#475467]">
                      v{entry.version} · {displayScore(entry.score)} · {entry.band} · {entry.actor} · {safeFmtDate(entry.at)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            {!results.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No version history yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Audit History' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Audit history</h3>
          <div className="mt-4 space-y-2">
            {audit.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{row.action}</p>
                  <span className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.at)}</span>
                </div>
                <p className="mt-1 font-semibold text-[#475467]">{row.actor} · {row.actorRole} · {row.entityType}/{row.entityId}</p>
                {row.after ? <p className="mt-1 text-[10px] font-semibold text-[#667085]">{row.after}</p> : null}
              </div>
            ))}
            {!audit.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No result-related audit events yet.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
