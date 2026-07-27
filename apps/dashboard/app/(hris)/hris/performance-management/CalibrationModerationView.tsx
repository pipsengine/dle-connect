'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Download,
  Plus,
  Search,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import { displayScore } from '@/lib/performance-calculation';
import type { CalibrationCase, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Calibration Cases',
  'Distribution Analytics',
  'Adjustment Review',
  'Panel Sessions',
  'Exceptions',
  'Decisions',
  'Audit History',
] as const;

type TabId = (typeof TABS)[number];

const STEPS = [
  { name: 'Reviews Submitted', range: '01–15 Jul' },
  { name: 'Data Validation', range: '16–20 Jul' },
  { name: 'Calibration In Progress', range: '21–31 Jul' },
  { name: 'Approval', range: '01–05 Aug' },
  { name: 'Results Publication', range: '06–10 Aug' },
] as const;

const THRESHOLD = 0.5;

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

const toBandScore = (score: number) => {
  // Domain scores are typically 0–100; map to 1–5 for distribution
  if (score <= 5) return Math.max(1, Math.min(5, Math.round(score)));
  return Math.max(1, Math.min(5, Math.round(score / 20)));
};

const StatusPill = ({ label }: { label: string }) => {
  const key = label.toLowerCase();
  const style =
    key.includes('approved') || key.includes('complete') || key.includes('confirmed') || key.includes('ready')
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key.includes('proposed') || key.includes('panel') || key.includes('scheduled') || key.includes('progress')
        ? 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]'
        : key.includes('justification') || key.includes('missing') || key.includes('pending') || key.includes('open')
          ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
          : key.includes('critical') || key.includes('reject') || key.includes('exception') || key.includes('blocker')
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

export default function CalibrationModerationView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All departments');
  const [varianceFilter, setVarianceFilter] = useState('All variance');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<CalibrationCase | null>(null);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    employeeName: '',
    department: '',
    originalScore: '',
    proposedScore: '',
    justification: '',
  });
  const pageSize = 6;

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const cases = useMemo(
    () => (domain.calibration || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.calibration, cycleId],
  );
  const results = useMemo(
    () => (domain.results || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.results, cycleId],
  );
  const assessments = useMemo(
    () => (domain.assessments || []).filter((row) => !cycleId || row.cycleId === cycleId),
    [domain.assessments, cycleId],
  );

  const departments = useMemo(
    () => ['All departments', ...Array.from(new Set(cases.map((row) => row.department).filter(Boolean))).sort()],
    [cases],
  );

  const enriched = useMemo(() => cases.map((row) => {
    const variance = row.proposedScore != null ? Math.round((row.proposedScore - row.originalScore) * 10) / 10 : 0;
    const evidenceComplete = Boolean(row.justification) && Math.abs(variance) <= THRESHOLD * 20;
    const panelStatus =
      row.status === 'Approved' ? 'Approved'
        : row.status === 'Rejected' ? 'Rejected'
          : row.status === 'Proposed' && Math.abs(variance) > THRESHOLD * 20 ? 'Justification required'
            : row.status === 'Proposed' ? 'Panel review'
              : 'Open';
    return {
      row,
      variance,
      evidenceLabel: evidenceComplete ? 'Complete' : Math.abs(variance) > THRESHOLD * 20 ? '2 items missing' : 'Pending',
      panelStatus,
      due: activeCycle?.calibrationEnd || activeCycle?.endDate || '',
      highVariance: Math.abs(variance) > THRESHOLD * 20,
    };
  }), [cases, activeCycle]);

  const filtered = useMemo(() => enriched.filter((item) => {
    const q = query.trim().toLowerCase();
    if (q && !`${item.row.employeeName} ${item.row.department} ${item.row.employeeId}`.toLowerCase().includes(q)) return false;
    if (departmentFilter !== 'All departments' && item.row.department !== departmentFilter) return false;
    if (statusFilter !== 'All statuses' && item.row.status !== statusFilter && item.panelStatus !== statusFilter) return false;
    if (varianceFilter === 'High variance' && !item.highVariance) return false;
    if (varianceFilter === 'Within threshold' && item.highVariance) return false;
    return true;
  }), [enriched, query, departmentFilter, statusFilter, varianceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const eligibilityCount = useMemo(
    () => (domain.eligibility || []).filter((row) => (!cycleId || row.cycleId === cycleId) && row.included).length
      || activeCycle?.eligibilityCount
      || 0,
    [domain.eligibility, cycleId, activeCycle?.eligibilityCount],
  );
  const inScope = Math.max(eligibilityCount, results.length, assessments.length, cases.length);
  const pending = cases.filter((row) => row.status === 'Open' || row.status === 'Proposed').length;
  const highVariance = enriched.filter((item) => item.highVariance && item.row.status !== 'Approved').length;
  const proposed = cases.filter((row) => row.status === 'Proposed').length;
  const awaitingEvidence = enriched.filter((item) => item.evidenceLabel !== 'Complete' && item.row.status === 'Proposed').length;
  const approved = cases.filter((row) => row.status === 'Approved').length;
  const distributionExceptions = enriched.filter((item) => item.highVariance).length;
  const criticalExceptions = enriched.filter((item) => item.highVariance && Math.abs(item.variance) > THRESHOLD * 30).length;
  const progressPct = cases.length ? Math.round((approved / cases.length) * 100) : 0;
  const submittedReviews = assessments.filter((a) => ['Submitted', 'Pending Manager', 'Pending HR', 'Approved', 'Published', 'Closed'].includes(a.status)).length;
  const reviewsReady = inScope ? Math.round((Math.min(inScope, submittedReviews) / Math.max(inScope, 1)) * 100) : 0;

  const distribution = useMemo(() => {
    const bands = [1, 2, 3, 4, 5];
    return bands.map((band) => {
      const original = results.length
        ? results.filter((row) => toBandScore(row.finalScore) === band).length
        : cases.filter((row) => toBandScore(row.originalScore) === band).length;
      const proposedCount = cases.length
        ? cases.filter((row) => toBandScore(row.proposedScore ?? row.originalScore) === band).length
        : original;
      const total = Math.max(results.length || cases.length, 1);
      return {
        band,
        originalPct: Math.round((original / total) * 1000) / 10,
        proposedPct: Math.round((proposedCount / total) * 1000) / 10,
        original,
        proposed: proposedCount,
      };
    });
  }, [results, cases]);

  const top5 = distribution.find((row) => row.band === 5);
  const top5Proposed = top5?.proposedPct || 0;
  const top5TargetMid = activeCycle?.enableForcedDistribution ? 10 : Math.max(top5Proposed, 0);
  const top5Variance = Math.round((top5Proposed - top5TargetMid) * 10) / 10;

  const deptConsistency = useMemo(() => {
    const depts = Array.from(new Set([
      ...cases.map((row) => row.department).filter(Boolean),
      ...(domain.eligibility || []).filter((row) => (!cycleId || row.cycleId === cycleId) && row.included).map((row) => row.department).filter(Boolean),
    ]));
    return depts.slice(0, 6).map((dept) => {
      const deptCases = cases.filter((row) => row.department === dept);
      const approvedPct = deptCases.length
        ? Math.round((deptCases.filter((row) => row.status === 'Approved').length / deptCases.length) * 100)
        : 0;
      return { dept, pct: approvedPct };
    });
  }, [cases, domain.eligibility, cycleId]);

  const readinessChecks = [
    ['Manager reviews', `${submittedReviews}/${inScope || 0}`, inScope === 0 || submittedReviews >= inScope],
    ['Evidence complete', `${Math.max(0, cases.length - awaitingEvidence)}/${cases.length || 0}`, cases.length === 0 || awaitingEvidence === 0],
    ['Variances justified', `${Math.max(0, highVariance - awaitingEvidence)}/${highVariance || 0}`, highVariance === 0 || awaitingEvidence === 0],
    ['Conflicts resolved', `${approved}/${proposed + approved || 0}`, proposed === 0],
  ] as const;
  const readinessPct = readinessChecks.length
    ? Math.round((readinessChecks.filter(([, , ok]) => ok).length / readinessChecks.length) * 100)
    : 0;
  const blockers = readinessChecks.filter(([, , ok]) => !ok).length;
  const thresholdBreaches = enriched.filter((item) => Math.abs(item.variance) > THRESHOLD * 20 && item.row.status !== 'Rejected').length;

  const createSession = async () => {
    if (!form.employeeId.trim() || !form.employeeName.trim()) return;
    await onAction('calibration.propose', {
      cycleId: cycleId || activeCycle?.id,
      employeeId: form.employeeId.trim(),
      employeeName: form.employeeName.trim(),
      department: form.department.trim() || undefined,
      originalScore: Number(form.originalScore || 0),
      proposedScore: Number(form.proposedScore || 0),
      justification: form.justification.trim() || 'Calibration adjustment proposed.',
    });
    setCreating(false);
  };

  const stepIndex = activeCycle?.status === 'Results Published' || activeCycle?.status === 'Closed' ? 4
    : activeCycle?.status === 'Calibration' || cases.length ? 2
      : 1;

  return (
    <div className="space-y-4 pb-16 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold">Calibration & Moderation</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Govern rating consistency, fairness and evidence-based decisions across the organisation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cycleId} onChange={(e) => { setCycleId(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white">
            <Plus className="h-3.5 w-3.5" /> New calibration session
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
        <div className="flex min-w-[720px] overflow-x-auto">
          {STEPS.map((step, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'upcoming';
            return (
              <div key={step.name} className="relative flex-1 text-center">
                {index < STEPS.length - 1 ? <i className={`absolute left-1/2 top-4 z-0 h-0.5 w-full ${state === 'done' ? 'bg-[#12b76a]' : 'bg-[#d0d5dd]'}`} /> : null}
                <div className={`relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold ${
                  state === 'done' ? 'border-[#12b76a] bg-white text-[#12b76a]'
                    : state === 'current' ? 'border-[#1570ef] bg-[#1570ef] text-white shadow-[0_0_0_4px_#d1e9ff]'
                      : 'border-[#d0d5dd] bg-white text-[#98a2b3]'
                }`}>
                  {state === 'done' ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <b className={`mt-2 block text-[9px] ${state === 'current' ? 'text-[#1570ef]' : 'text-[#344054]'}`}>{step.name}</b>
                <small className="mt-1 block text-[8px] font-semibold text-[#667085]">{step.range}</small>
                {state === 'current' ? <small className="mt-1 block text-[8px] font-bold text-[#1570ef]">In progress</small> : null}
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

      {activeTab === 'Overview' || activeTab === 'Calibration Cases' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { icon: Users, label: 'Employees in scope', value: String(inScope), sub: `${reviewsReady}% reviews ready`, tone: 'blue' as const },
              { icon: AlertTriangle, label: 'Pending cases', value: String(pending), sub: `${highVariance} high variance`, tone: 'orange' as const },
              { icon: CircleGauge, label: 'Proposed adjustments', value: String(proposed), sub: `${awaitingEvidence} awaiting evidence`, tone: 'purple' as const },
              { icon: CheckCircle2, label: 'Approved adjustments', value: String(approved), sub: 'Synced decisions', tone: 'green' as const },
              { icon: AlertTriangle, label: 'Distribution exceptions', value: String(distributionExceptions), sub: `${criticalExceptions} critical`, tone: 'red' as const },
              { icon: CircleGauge, label: 'Calibration progress', value: `${progressPct}%`, sub: 'Cases decided', tone: 'blue' as const, ring: progressPct },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  {kpi.ring != null ? (
                    <div className="relative grid h-9 w-9 place-items-center rounded-full" style={{ background: `conic-gradient(#1570ef ${kpi.ring * 3.6}deg, #e4e7ec 0)` }}>
                      <span className="absolute inset-[5px] rounded-full bg-white" />
                    </div>
                  ) : (
                    <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                      kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#dc6803]'
                        : kpi.tone === 'purple' ? 'bg-[#f4f3ff] text-[#6938ef]'
                          : kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]'
                            : kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#d92d20]'
                              : 'bg-[#eff8ff] text-[#1570ef]'
                    }`}>
                      <kpi.icon className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
                <p className={`mt-1 text-[10px] font-semibold ${kpi.tone === 'orange' ? 'text-[#b54708]' : kpi.tone === 'red' ? 'text-[#b42318]' : 'text-[#667085]'}`}>{kpi.sub}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)_260px]">
            <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">Rating distribution & moderation</h3>
                <div className="flex flex-wrap gap-2">
                  {['Organisation', 'Department', 'Grade', 'Location'].map((filter) => (
                    <select key={filter} className="h-8 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[10px]">
                      <option>{filter}</option>
                    </select>
                  ))}
                </div>
              </div>
              <div className="flex h-44 items-end gap-3 px-2">
                {distribution.map((item) => (
                  <div key={item.band} className="flex flex-1 flex-col items-center gap-1">
                    <div className="relative flex h-32 w-full items-end justify-center gap-1">
                      <div className="absolute inset-x-1 bottom-0 top-[20%] rounded border border-dashed border-[#d0d5dd]" />
                      <div className="relative z-[1] w-3 rounded-t bg-[#1849a9]" style={{ height: `${Math.max(8, item.originalPct * 2.2)}%` }} title={`Original ${item.originalPct}%`} />
                      <div className="relative z-[1] w-3 rounded-t border-2 border-[#84caff] bg-[#eff8ff]" style={{ height: `${Math.max(8, item.proposedPct * 2.2)}%` }} title={`Proposed ${item.proposedPct}%`} />
                    </div>
                    <span className="text-[10px] font-bold text-[#475467]">{item.band}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] font-semibold text-[#667085]">
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[#1849a9]" /> Original ratings</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border-2 border-[#84caff] bg-[#eff8ff]" /> Proposed ratings</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-4 rounded-sm border border-dashed border-[#d0d5dd]" /> Target range</span>
              </div>
              <div className="mt-4 grid gap-2 rounded-lg bg-[#f9fafb] p-3 text-[11px] sm:grid-cols-3">
                <div><p className="font-semibold text-[#667085]">Top rating 5 (proposed)</p><p className="mt-1 font-bold">{top5Proposed}%</p></div>
                <div><p className="font-semibold text-[#667085]">Target range</p><p className="mt-1 font-bold">5–10%</p></div>
                <div><p className="font-semibold text-[#667085]">Variance vs target</p><p className={`mt-1 font-bold ${top5Variance > 0 ? 'text-[#b54708]' : 'text-[#027a48]'}`}>{top5Variance > 0 ? '+' : ''}{top5Variance}%</p></div>
              </div>
            </section>

            <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold">Calibration readiness</h3>
              <Donut value={readinessPct} label="Ready" />
              <ul className="mt-3 space-y-2 text-[11px]">
                {readinessChecks.map(([label, count, ok]) => (
                  <li key={label} className="flex items-center justify-between gap-2 border-t border-[#eaecf0] py-2">
                    <span className="font-semibold text-[#475467]">{label} <span className="text-[#98a2b3]">({count})</span></span>
                    {ok ? <CheckCircle2 className="h-4 w-4 text-[#12b76a]" /> : <AlertTriangle className="h-4 w-4 text-[#f79009]" />}
                  </li>
                ))}
              </ul>
              {blockers > 0 ? (
                <div className="mt-3 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[11px] font-semibold text-[#b42318]">
                  {blockers} blockers require attention.
                </div>
              ) : null}
            </section>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Department consistency</h3>
                {deptConsistency.map((item) => (
                  <div key={item.dept} className="mb-3">
                    <div className="mb-1 flex justify-between text-[11px] font-semibold">
                      <span className="text-[#475467]">{item.dept}</span>
                      <span>{item.pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Upcoming panel sessions</h3>
                {[
                  ['Calibration panel A', activeCycle?.calibrationStart || activeCycle?.endDate, '09:30', 'Scheduled'],
                  ['Moderation review', activeCycle?.calibrationEnd || activeCycle?.endDate, '14:00', 'Confirmed'],
                ].map(([title, date, time, status]) => (
                  <div key={String(title)} className="border-t border-[#eaecf0] py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold">{title}</p>
                        <p className="mt-1 text-[10px] font-semibold text-[#667085]">{safeFmtDate(String(date))} · {time}</p>
                      </div>
                      <StatusPill label={String(status)} />
                    </div>
                    <div className="mt-2 flex -space-x-2">
                      {(cases[0]?.committee || ['HR', 'Ops', 'Fin']).slice(0, 3).map((name) => (
                        <span key={name} className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#eff8ff] text-[9px] font-bold text-[#175cd3]">{initials(name)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            </aside>
          </div>

          <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
              <h3 className="mr-auto text-sm font-bold">Priority calibration cases</h3>
              <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
                <Search className="h-3.5 w-3.5 text-[#667085]" />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employee" className="w-full border-0 bg-transparent text-[11px] outline-none" />
              </label>
              <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                {departments.map((item) => <option key={item} value={item}>{item === 'All departments' ? 'Department' : item}</option>)}
              </select>
              <select value={varianceFilter} onChange={(e) => { setVarianceFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                <option>All variance</option>
                <option>High variance</option>
                <option>Within threshold</option>
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
                <option>All statuses</option>
                <option>Open</option>
                <option>Proposed</option>
                <option>Approved</option>
                <option>Rejected</option>
                <option>Panel review</option>
                <option>Justification required</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[1080px]">
                <div className="grid grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.7fr_0.9fr_1fr_0.7fr_0.8fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                  <span>Employee</span>
                  <span>Department / Grade</span>
                  <span>Original</span>
                  <span>Proposed</span>
                  <span>Variance</span>
                  <span>Evidence</span>
                  <span>Panel status</span>
                  <span>Due</span>
                  <span>Action</span>
                </div>
                {rows.map((item) => (
                  <div key={item.row.id} className="grid grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.7fr_0.9fr_1fr_0.7fr_0.8fr] items-center border-b border-[#eaecf0] px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{initials(item.row.employeeName)}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold">{item.row.employeeName}</p>
                        <p className="truncate text-[9px] font-semibold text-[#667085]">{item.row.employeeId}</p>
                      </div>
                    </div>
                    <p className="truncate text-[11px] font-semibold text-[#475467]">{item.row.department || '—'} · {item.row.originalBand}</p>
                    <p className="text-[11px] font-bold">{displayScore(item.row.originalScore)}</p>
                    <p className="text-[11px] font-bold">{item.row.proposedScore != null ? displayScore(item.row.proposedScore) : '—'}</p>
                    <p className={`text-[11px] font-bold ${item.highVariance ? 'text-[#b42318]' : item.variance < 0 ? 'text-[#b54708]' : 'text-[#027a48]'}`}>
                      {item.row.proposedScore == null ? '—' : `${item.variance > 0 ? '+' : ''}${item.variance}`}
                    </p>
                    <StatusPill label={item.evidenceLabel} />
                    <StatusPill label={item.panelStatus} />
                    <p className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(item.due)}</p>
                    <button type="button" onClick={() => setDrawer(item.row)} className="h-8 rounded-lg border border-[#84caff] px-2.5 text-[10px] font-semibold text-[#175cd3]">
                      Review case
                    </button>
                  </div>
                ))}
                {!rows.length ? (
                  <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No calibration cases match these filters.</div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaecf0] px-3 py-2 text-[10px] text-[#667085]">
              <span>
                Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} cases
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
        </>
      ) : (
        <section className="rounded-xl border border-[#eaecf0] bg-white px-6 py-20 text-center shadow-sm">
          <Settings2 className="mx-auto h-11 w-11 text-[#1570ef]" />
          <h2 className="mt-4 text-xl font-bold">{activeTab}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[#667085]">This calibration workspace section is ready for {activeTab.toLowerCase()} detail content.</p>
          <button type="button" onClick={() => setActiveTab('Overview')} className="mt-6 inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-4 text-[11px] font-semibold text-white">
            Back to Overview
          </button>
        </section>
      )}

      {bannerOpen && thresholdBreaches > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#fecdca] bg-[#fef3f2] px-4 py-3">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] font-semibold text-[#b42318]">
              {thresholdBreaches} calibration decision{thresholdBreaches === 1 ? '' : 's'} exceed the configured ± {THRESHOLD} threshold and require HR justification and panel approval.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setActiveTab('Exceptions')} className="h-8 rounded-lg bg-[#d92d20] px-3 text-[11px] font-semibold text-white">
                Review exceptions
              </button>
              <button type="button" onClick={() => setBannerOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#b42318]" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {creating ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close create" onClick={() => setCreating(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">New calibration session</h2>
                <p className="mt-1 text-xs text-[#667085]">Propose an adjustment with mandatory justification.</p>
              </div>
              <button type="button" onClick={() => setCreating(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold">Employee name<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.employeeName} onChange={(e) => setForm((f) => ({ ...f, employeeName: e.target.value }))} /></label>
                <label className="text-[11px] font-semibold">Employee ID<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} /></label>
              </div>
              <label className="text-[11px] font-semibold">Department<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold">Original score<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.originalScore} onChange={(e) => setForm((f) => ({ ...f, originalScore: e.target.value }))} /></label>
                <label className="text-[11px] font-semibold">Proposed score<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.proposedScore} onChange={(e) => setForm((f) => ({ ...f, proposedScore: e.target.value }))} /></label>
              </div>
              <label className="text-[11px] font-semibold">Justification<textarea className="mt-1 min-h-[80px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm" value={form.justification} onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))} /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void createSession()} className="h-9 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50">Propose adjustment</button>
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
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#1570ef]">Calibration case</p>
                <h2 className="mt-1 text-xl font-bold">{drawer.employeeName}</h2>
                <p className="mt-1 text-sm text-[#667085]">{drawer.department} · {drawer.employeeId}</p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <StatusPill label={drawer.status} />
              <dl className="mt-5">
                {[
                  ['Original score', `${displayScore(drawer.originalScore)} (${drawer.originalBand})`],
                  ['Proposed score', drawer.proposedScore != null ? `${displayScore(drawer.proposedScore)} (${drawer.proposedBand || '—'})` : '—'],
                  ['Approved score', drawer.approvedScore != null ? `${displayScore(drawer.approvedScore)} (${drawer.approvedBand || '—'})` : '—'],
                  ['Justification', drawer.justification || '—'],
                  ['Committee', (drawer.committee || []).join(', ') || '—'],
                ].map(([dt, dd]) => (
                  <div key={dt} className="border-b border-[#eaecf0] py-3 text-sm">
                    <dt className="text-[11px] font-semibold text-[#667085]">{dt}</dt>
                    <dd className="mt-1 font-semibold text-[#101828]">{dd}</dd>
                  </div>
                ))}
              </dl>
              {drawer.status === 'Proposed' ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void onAction('calibration.decide', { id: drawer.id, decision: 'Approved' })} className="h-9 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50">
                    Approve
                  </button>
                  <button type="button" disabled={busy} onClick={() => void onAction('calibration.decide', { id: drawer.id, decision: 'Rejected', reason: 'Insufficient evidence' })} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-xs font-semibold disabled:opacity-50">
                    Reject
                  </button>
                </div>
              ) : null}
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
