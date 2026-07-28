'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Download,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { displayScore } from '@/lib/performance-calculation';
import type { CalibrationCase, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate, fmtDateTime } from './performance-management-ui';

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

const THRESHOLD = 0.5;

const safeFmtDate = (value?: string | null) => {
  if (!value) return '—';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  return fmtDate(day);
};

const shortRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return '—';
  if (start && end) return `${safeFmtDate(start)} – ${safeFmtDate(end)}`;
  return safeFmtDate(start || end);
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
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [rejectReason, setRejectReason] = useState('');
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
  const eligibility = useMemo(
    () => (domain.eligibility || []).filter((row) => (!cycleId || row.cycleId === cycleId) && row.included),
    [domain.eligibility, cycleId],
  );

  const employeeDirectory = useMemo(() => {
    const map = new Map<string, { employeeId: string; employeeName: string; department: string; originalScore: number }>();
    for (const row of results) {
      map.set(row.employeeId || row.employeeName, {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        department: eligibility.find((item) => item.employeeId === row.employeeId)?.department || '',
        originalScore: row.finalScore,
      });
    }
    for (const row of eligibility) {
      const key = row.employeeId || row.fullName;
      if (map.has(key)) continue;
      map.set(key, {
        employeeId: row.employeeId,
        employeeName: row.fullName,
        department: row.department || '',
        originalScore: 0,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [results, eligibility]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employeeDirectory.slice(0, 30);
    return employeeDirectory
      .filter((row) => `${row.employeeName} ${row.employeeId} ${row.department}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [employeeDirectory, employeeQuery]);

  const steps = useMemo(() => [
    { name: 'Reviews Submitted', range: shortRange(activeCycle?.yearEndStart, activeCycle?.yearEndEnd) },
    { name: 'Data Validation', range: shortRange(activeCycle?.yearEndEnd, activeCycle?.calibrationStart) },
    { name: 'Calibration In Progress', range: shortRange(activeCycle?.calibrationStart, activeCycle?.calibrationEnd) },
    { name: 'Approval', range: shortRange(activeCycle?.calibrationEnd, activeCycle?.publicationDate) },
    { name: 'Results Publication', range: shortRange(activeCycle?.publicationDate, activeCycle?.endDate) },
  ], [activeCycle]);

  const departments = useMemo(
    () => ['All departments', ...Array.from(new Set([
      ...cases.map((row) => row.department).filter(Boolean),
      ...eligibility.map((row) => row.department).filter(Boolean),
    ])).sort()],
    [cases, eligibility],
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

  const eligibilityCount = eligibility.length || activeCycle?.eligibilityCount || 0;
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
    const tones = ['bg-[#f04438]', 'bg-[#f79009]', 'bg-[#fdb022]', 'bg-[#32d583]', 'bg-[#12b76a]'];
    const bands = [1, 2, 3, 4, 5];
    const total = Math.max(results.length || cases.length, 1);
    return bands.map((band, index) => {
      const count = results.length
        ? results.filter((row) => toBandScore(row.finalScore) === band).length
        : cases.filter((row) => toBandScore(row.originalScore) === band).length;
      const proposedCount = cases.length
        ? cases.filter((row) => toBandScore(row.proposedScore ?? row.originalScore) === band).length
        : count;
      const pct = Math.round((count / total) * 1000) / 10;
      return {
        band: `Band ${band}`,
        bandNum: band,
        count,
        proposed: proposedCount,
        pct,
        originalPct: pct,
        proposedPct: Math.round((proposedCount / total) * 1000) / 10,
        tone: tones[index] || 'bg-[#1570ef]',
      };
    });
  }, [results, cases]);

  const deptConsistency = useMemo(() => {
    const depts = Array.from(new Set([
      ...cases.map((row) => row.department).filter(Boolean),
      ...eligibility.map((row) => row.department).filter(Boolean),
    ]));
    return depts.slice(0, 8).map((dept) => {
      const deptCases = cases.filter((row) => row.department === dept);
      const approvedPct = deptCases.length
        ? Math.round((deptCases.filter((row) => row.status === 'Approved').length / deptCases.length) * 100)
        : 0;
      const avgScore = deptCases.length
        ? Math.round((deptCases.reduce((sum, row) => sum + (row.proposedScore ?? row.originalScore), 0) / deptCases.length) * 10) / 10
        : 0;
      return { dept, pct: approvedPct, cases: deptCases.length, avgScore };
    });
  }, [cases, eligibility]);

  const panelSessions = useMemo(() => {
    const byDept = new Map<string, typeof enriched>();
    for (const item of enriched.filter((row) => row.row.status === 'Open' || row.row.status === 'Proposed')) {
      const key = item.row.department || 'Organisation';
      const list = byDept.get(key) || [];
      list.push(item);
      byDept.set(key, list);
    }
    const sessions = Array.from(byDept.entries()).map(([department, items], index) => {
      const committee = Array.from(new Set(items.flatMap((item) => item.row.committee || []))).filter(Boolean);
      const avgVariance = items.length
        ? Math.round((items.reduce((sum, item) => sum + Math.abs(item.variance), 0) / items.length) * 10) / 10
        : 0;
      return {
        id: `panel-${department}-${index}`,
        title: department === 'Organisation' ? 'Organisation calibration panel' : `${department} calibration panel`,
        department,
        date: activeCycle?.calibrationStart || activeCycle?.calibrationEnd || items[0]?.due || '',
        time: index % 2 === 0 ? '09:30' : '14:00',
        status: items.some((item) => item.row.status === 'Proposed') ? 'In progress' : 'Scheduled',
        caseCount: items.length,
        avgVariance,
        committee: committee.length ? committee : ['HR Business Partner', 'People Ops'],
      };
    });
    if (!sessions.length && (activeCycle?.calibrationStart || cases.length)) {
      sessions.push({
        id: 'panel-cycle',
        title: 'Calibration panel',
        department: 'Organisation',
        date: activeCycle?.calibrationStart || activeCycle?.calibrationEnd || '',
        time: '09:30',
        status: proposed ? 'In progress' : approved ? 'Complete' : 'Scheduled',
        caseCount: cases.filter((row) => row.status === 'Open' || row.status === 'Proposed').length,
        avgVariance: 0,
        committee: Array.from(new Set(cases.flatMap((row) => row.committee || []))).slice(0, 5),
      });
    }
    return sessions;
  }, [enriched, cases, activeCycle, approved, proposed]);

  const decidedCases = useMemo(
    () => enriched.filter((item) => item.row.status === 'Approved' || item.row.status === 'Rejected'),
    [enriched],
  );
  const adjustmentQueue = useMemo(
    () => enriched.filter((item) => item.row.status === 'Proposed' || item.row.status === 'Open'),
    [enriched],
  );
  const exceptionRows = useMemo(() => {
    const rows: Array<{ row: CalibrationCase; variance: number; reason: string; severity: 'Critical' | 'High' | 'Medium' }> = [];
    for (const item of enriched) {
      if (item.highVariance && Math.abs(item.variance) > THRESHOLD * 30) {
        rows.push({
          row: item.row,
          variance: item.variance,
          reason: item.row.justification ? 'Critical variance with justification on file' : 'Critical variance — justification missing',
          severity: 'Critical',
        });
      } else if (item.highVariance) {
        rows.push({
          row: item.row,
          variance: item.variance,
          reason: `Proposed ${item.row.proposedScore != null ? displayScore(item.row.proposedScore) : '—'} from ${displayScore(item.row.originalScore)}`,
          severity: 'High',
        });
      } else if (item.row.status === 'Proposed' && !item.row.justification) {
        rows.push({
          row: item.row,
          variance: item.variance,
          reason: 'Panel cannot approve without evidence notes',
          severity: 'Medium',
        });
      }
    }
    return rows;
  }, [enriched]);

  const auditRows = useMemo(() => {
    const caseById = new Map(cases.map((row) => [row.id, row]));
    const caseIds = new Set(caseById.keys());
    const fromStore = (domain.audit || [])
      .filter((row) => row.entityType === 'CalibrationCase' || caseIds.has(row.entityId) || /calibration/i.test(row.action))
      .map((row) => {
        const linked = caseById.get(row.entityId);
        return {
          id: row.id,
          action: row.action,
          employeeName: linked?.employeeName || row.actor,
          department: linked?.department || '',
          detail: row.reason || row.after || row.before || '',
          status: linked?.status || 'Logged',
          at: row.at,
        };
      });
    if (fromStore.length) return fromStore.slice(0, 60);
    return [...enriched]
      .sort((a, b) => String(b.row.decidedAt || '').localeCompare(String(a.row.decidedAt || '')))
      .slice(0, 60)
      .map((item) => ({
        id: item.row.id,
        action: item.row.status === 'Approved' || item.row.status === 'Rejected'
          ? `Calibration ${item.row.status.toLowerCase()}`
          : item.row.status === 'Proposed' ? 'Calibration proposed' : 'Calibration case opened',
        employeeName: item.row.employeeName,
        department: item.row.department || '',
        detail: item.row.justification || '',
        status: item.row.status,
        at: item.row.decidedAt || '',
      }));
  }, [domain.audit, cases, enriched]);

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
      committee: Array.from(new Set(cases.flatMap((row) => row.committee || []))).slice(0, 4),
    });
    setCreating(false);
    setEmployeeQuery('');
    setForm({ employeeId: '', employeeName: '', department: '', originalScore: '', proposedScore: '', justification: '' });
    setActiveTab('Adjustment Review');
  };

  const selectEmployeeForSession = (row: { employeeId: string; employeeName: string; department: string; originalScore: number }) => {
    setForm((current) => ({
      ...current,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      department: row.department,
      originalScore: row.originalScore ? String(row.originalScore) : current.originalScore,
    }));
    setEmployeeQuery(row.employeeName);
  };

  const stepIndex = activeCycle?.status === 'Results Published' || activeCycle?.status === 'Closed' ? 4
    : activeCycle?.status === 'Calibration' || cases.length ? 2
      : 1;

  const CasesTable = ({ title }: { title: string }) => (
    <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
        <h3 className="mr-auto text-sm font-bold">{title}</h3>
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
            <span>Department / Band</span>
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
  );

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
          {steps.map((step, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'upcoming';
            return (
              <div key={step.name} className="relative flex-1 text-center">
                {index < steps.length - 1 ? <i className={`absolute left-1/2 top-4 z-0 h-0.5 w-full ${state === 'done' ? 'bg-[#12b76a]' : 'bg-[#d0d5dd]'}`} /> : null}
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
            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold transition ${
              activeTab === tab ? 'border-b-2 border-[#1570ef] text-[#1570ef]' : 'text-[#475467] hover:text-[#1570ef]'
            }`}
          >
            {tab}
            {tab === 'Exceptions' && exceptionRows.length ? (
              <span className="rounded-full bg-[#f04438] px-1.5 py-0.5 text-[9px] font-bold text-white">{exceptionRows.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' ? (
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
                      {filter === 'Department' ? departments.filter((d) => d !== 'All departments').map((d) => <option key={d}>{d}</option>) : null}
                    </select>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {distribution.map((item) => (
                  <div key={item.band} className="grid grid-cols-[88px_1fr_48px] items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#475467]">{item.band}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div className={`h-full rounded-full ${item.tone}`} style={{ width: `${Math.max(item.pct, item.count ? 4 : 0)}%` }} />
                    </div>
                    <span className="text-right text-[11px] font-bold">{item.count}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[10px] font-semibold text-[#667085]">
                Live distribution from submitted manager / matrix assessments for {activeCycle?.name || 'the active cycle'}.
              </p>
            </section>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Department consistency</h3>
                {deptConsistency.length ? deptConsistency.map((item) => (
                  <div key={item.dept} className="mb-3">
                    <div className="mb-1 flex justify-between text-[11px] font-semibold">
                      <span className="text-[#475467]">{item.dept}</span>
                      <span>{item.pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                )) : (
                  <p className="text-[11px] font-semibold text-[#667085]">No department calibration activity yet.</p>
                )}
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">Upcoming panel sessions</h3>
                  <button type="button" onClick={() => setActiveTab('Panel Sessions')} className="text-[10px] font-semibold text-[#1570ef]">View all</button>
                </div>
                {panelSessions.length ? panelSessions.slice(0, 3).map((session) => (
                  <div key={session.id} className="border-t border-[#eaecf0] py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold">{session.title}</p>
                        <p className="mt-1 text-[10px] font-semibold text-[#667085]">{safeFmtDate(session.date)} · {session.time}</p>
                      </div>
                      <StatusPill label={session.status} />
                    </div>
                    <div className="mt-2 flex -space-x-2">
                      {session.committee.slice(0, 3).map((name) => (
                        <span key={name} className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-[#eff8ff] text-[9px] font-bold text-[#175cd3]">{initials(name)}</span>
                      ))}
                    </div>
                  </div>
                )) : (
                  <p className="text-[11px] font-semibold text-[#667085]">No panel sessions scheduled from open cases.</p>
                )}
              </section>
            </aside>
          </div>

          <CasesTable title="Priority calibration cases" />
        </>
      ) : null}

      {activeTab === 'Calibration Cases' ? (
        <CasesTable title="Calibration cases" />
      ) : null}

      {activeTab === 'Distribution Analytics' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-bold">Organisation rating distribution</h3>
            <p className="mb-4 text-[11px] font-semibold text-[#667085]">
              Derived from submitted assessments for {activeCycle?.name || 'the active cycle'} ({inScope} employees in scope).
            </p>
            <div className="space-y-3">
              {distribution.map((item) => (
                <div key={item.band} className="grid grid-cols-[100px_1fr_56px_48px] items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#475467]">{item.band}</span>
                  <div className="h-3.5 overflow-hidden rounded-full bg-[#f2f4f7]">
                    <div className={`h-full rounded-full ${item.tone}`} style={{ width: `${Math.max(item.pct, item.count ? 4 : 0)}%` }} />
                  </div>
                  <span className="text-right text-[11px] font-bold">{item.count}</span>
                  <span className="text-right text-[10px] font-semibold text-[#667085]">{item.pct}%</span>
                </div>
              ))}
              {!distribution.some((d) => d.count) ? (
                <p className="py-8 text-center text-[12px] font-semibold text-[#667085]">No scored assessments available yet for distribution analytics.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-bold">Department consistency</h3>
            <p className="mb-4 text-[11px] font-semibold text-[#667085]">Share of decided cases by department.</p>
            {deptConsistency.length ? deptConsistency.map((item) => (
              <div key={item.dept} className="mb-3">
                <div className="mb-1 flex justify-between text-[11px] font-semibold">
                  <span className="text-[#475467]">{item.dept}</span>
                  <span>{item.pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#f2f4f7]">
                  <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            )) : (
              <p className="py-8 text-center text-[12px] font-semibold text-[#667085]">No decided cases yet to measure department consistency.</p>
            )}
          </section>

          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm xl:col-span-2">
            <h3 className="mb-3 text-sm font-bold">Band movement summary</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b border-[#eaecf0] text-[10px] uppercase tracking-wide text-[#667085]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Department</th>
                    <th className="px-3 py-2 font-semibold">Original</th>
                    <th className="px-3 py-2 font-semibold">Proposed</th>
                    <th className="px-3 py-2 font-semibold">Variance</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.filter((e) => e.row.proposedScore != null).slice(0, 20).map((item) => (
                    <tr key={item.row.id} className="border-b border-[#eaecf0]">
                      <td className="px-3 py-2.5 font-bold">{item.row.employeeName}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#475467]">{item.row.department || '—'}</td>
                      <td className="px-3 py-2.5">{item.row.originalBand} ({displayScore(item.row.originalScore)})</td>
                      <td className="px-3 py-2.5">{item.row.proposedBand || '—'} ({item.row.proposedScore != null ? displayScore(item.row.proposedScore) : '—'})</td>
                      <td className={`px-3 py-2.5 font-bold ${item.highVariance ? 'text-[#b42318]' : 'text-[#027a48]'}`}>
                        {item.variance > 0 ? '+' : ''}{item.variance}
                      </td>
                      <td className="px-3 py-2.5"><StatusPill label={item.row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!enriched.some((e) => e.row.proposedScore != null) ? (
                <p className="py-10 text-center text-[12px] font-semibold text-[#667085]">No proposed score movements yet.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'Adjustment Review' ? (
        <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="border-b border-[#eaecf0] p-4">
            <h3 className="text-sm font-bold">Adjustment review queue</h3>
            <p className="mt-1 text-[11px] font-semibold text-[#667085]">Open and proposed calibration adjustments awaiting panel decision.</p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.7fr_1.2fr_0.8fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#667085]">
                <span>Employee</span><span>Department</span><span>Original</span><span>Proposed</span><span>Variance</span><span>Justification</span><span>Action</span>
              </div>
              {adjustmentQueue.map((item) => (
                <div key={item.row.id} className="grid grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.7fr_1.2fr_0.8fr] items-center border-b border-[#eaecf0] px-3 py-3">
                  <div>
                    <p className="text-[11px] font-bold">{item.row.employeeName}</p>
                    <p className="text-[9px] font-semibold text-[#667085]">{item.row.employeeId}</p>
                  </div>
                  <p className="truncate text-[11px] font-semibold text-[#475467]">{item.row.department || '—'}</p>
                  <p className="text-[11px] font-bold">{displayScore(item.row.originalScore)}</p>
                  <p className="text-[11px] font-bold">{item.row.proposedScore != null ? displayScore(item.row.proposedScore) : '—'}</p>
                  <p className={`text-[11px] font-bold ${item.highVariance ? 'text-[#b42318]' : 'text-[#027a48]'}`}>
                    {item.row.proposedScore == null ? '—' : `${item.variance > 0 ? '+' : ''}${item.variance}`}
                  </p>
                  <p className="truncate text-[10px] font-semibold text-[#475467]">{item.row.justification || '—'}</p>
                  <button type="button" onClick={() => setDrawer(item.row)} className="h-8 rounded-lg border border-[#84caff] px-2.5 text-[10px] font-semibold text-[#175cd3]">
                    Review
                  </button>
                </div>
              ))}
              {!adjustmentQueue.length ? (
                <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No open or proposed adjustments in queue.</div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'Panel Sessions' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {panelSessions.map((session) => (
            <article key={session.id} className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold">{session.title}</h3>
                  <p className="mt-1 text-[11px] font-semibold text-[#667085]">{session.department}</p>
                </div>
                <StatusPill label={session.status} />
              </div>
              <div className="space-y-2 text-[11px] font-semibold text-[#475467]">
                <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-[#667085]" /> {safeFmtDate(session.date)} · {session.time}</p>
                <p>{session.caseCount} case{session.caseCount === 1 ? '' : 's'} · avg variance {session.avgVariance}</p>
              </div>
              <div className="mt-3 flex -space-x-2">
                {session.committee.slice(0, 4).map((name) => (
                  <span key={name} title={name} className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-[#eff8ff] text-[9px] font-bold text-[#175cd3]">{initials(name)}</span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDepartmentFilter(session.department === 'Organisation' ? 'All departments' : session.department);
                  setActiveTab('Calibration Cases');
                }}
                className="mt-4 h-8 w-full rounded-lg border border-[#84caff] text-[10px] font-semibold text-[#175cd3]"
              >
                Open related cases
              </button>
            </article>
          ))}
          {!panelSessions.length ? (
            <section className="rounded-xl border border-[#eaecf0] bg-white px-6 py-16 text-center shadow-sm md:col-span-2 xl:col-span-3">
              <CalendarDays className="mx-auto h-10 w-10 text-[#1570ef]" />
              <h2 className="mt-3 text-lg font-bold">No panel sessions yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[#667085]">
                Sessions appear when calibration cases have committee members and open or proposed status for the active cycle.
              </p>
              <button type="button" onClick={() => setCreating(true)} className="mt-5 inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-4 text-[11px] font-semibold text-white">
                + New calibration session
              </button>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'Exceptions' ? (
        <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="border-b border-[#eaecf0] p-4">
            <h3 className="text-sm font-bold">Calibration exceptions</h3>
            <p className="mt-1 text-[11px] font-semibold text-[#667085]">
              High-variance proposals and threshold breaches requiring HR justification (±{THRESHOLD}).
            </p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[1.3fr_1fr_0.7fr_1.2fr_0.8fr_0.8fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#667085]">
                <span>Employee</span><span>Department</span><span>Variance</span><span>Reason</span><span>Severity</span><span>Action</span>
              </div>
              {exceptionRows.map((item) => (
                <div key={item.row.id} className="grid grid-cols-[1.3fr_1fr_0.7fr_1.2fr_0.8fr_0.8fr] items-center border-b border-[#eaecf0] px-3 py-3">
                  <div>
                    <p className="text-[11px] font-bold">{item.row.employeeName}</p>
                    <p className="text-[9px] font-semibold text-[#667085]">{item.row.employeeId}</p>
                  </div>
                  <p className="truncate text-[11px] font-semibold text-[#475467]">{item.row.department || '—'}</p>
                  <p className="text-[11px] font-bold text-[#b42318]">{item.variance > 0 ? '+' : ''}{item.variance}</p>
                  <p className="truncate text-[10px] font-semibold text-[#475467]">{item.reason}</p>
                  <StatusPill label={item.severity} />
                  <button type="button" onClick={() => setDrawer(item.row)} className="h-8 rounded-lg border border-[#fecdca] bg-[#fef3f2] px-2.5 text-[10px] font-semibold text-[#b42318]">
                    Resolve
                  </button>
                </div>
              ))}
              {!exceptionRows.length ? (
                <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No calibration exceptions for this cycle.</div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'Decisions' ? (
        <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="border-b border-[#eaecf0] p-4">
            <h3 className="text-sm font-bold">Calibration decisions</h3>
            <p className="mt-1 text-[11px] font-semibold text-[#667085]">Approved and rejected calibration outcomes synced from the HRIS store.</p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-[1.3fr_1fr_0.7fr_0.7fr_0.8fr_1fr_0.9fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#667085]">
                <span>Employee</span><span>Department</span><span>Original</span><span>Final</span><span>Decision</span><span>Updated</span><span>Committee</span>
              </div>
              {decidedCases.map((item) => (
                <div key={item.row.id} className="grid grid-cols-[1.3fr_1fr_0.7fr_0.7fr_0.8fr_1fr_0.9fr] items-center border-b border-[#eaecf0] px-3 py-3">
                  <div>
                    <p className="text-[11px] font-bold">{item.row.employeeName}</p>
                    <p className="text-[9px] font-semibold text-[#667085]">{item.row.employeeId}</p>
                  </div>
                  <p className="truncate text-[11px] font-semibold text-[#475467]">{item.row.department || '—'}</p>
                  <p className="text-[11px] font-bold">{displayScore(item.row.originalScore)}</p>
                  <p className="text-[11px] font-bold">{item.row.proposedScore != null ? displayScore(item.row.proposedScore) : '—'}</p>
                  <StatusPill label={item.row.status} />
                  <p className="text-[10px] font-semibold text-[#667085]">{item.row.decidedAt ? fmtDateTime(item.row.decidedAt) : '—'}</p>
                  <p className="truncate text-[10px] font-semibold text-[#475467]">{(item.row.committee || []).join(', ') || '—'}</p>
                </div>
              ))}
              {!decidedCases.length ? (
                <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No approved or rejected decisions yet.</div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'Audit History' ? (
        <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
          <div className="border-b border-[#eaecf0] p-4">
            <h3 className="text-sm font-bold">Audit history</h3>
            <p className="mt-1 text-[11px] font-semibold text-[#667085]">Chronological trail of calibration proposals and decisions for the active cycle.</p>
          </div>
          <div className="divide-y divide-[#eaecf0]">
            {auditRows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold">{row.action}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-[#475467]">{row.employeeName} · {row.department || '—'}</p>
                  {row.detail ? <p className="mt-1 text-[10px] font-semibold text-[#667085]">{row.detail}</p> : null}
                </div>
                <div className="text-right">
                  <StatusPill label={row.status} />
                  <p className="mt-1 text-[10px] font-semibold text-[#667085]">{fmtDateTime(row.at)}</p>
                </div>
              </div>
            ))}
            {!auditRows.length ? (
              <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No calibration audit events for this cycle yet.</div>
            ) : null}
          </div>
        </section>
      ) : null}

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
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(480px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">New calibration session</h2>
                <p className="mt-1 text-xs text-[#667085]">Select an eligible employee and propose an adjustment with justification.</p>
              </div>
              <button type="button" onClick={() => setCreating(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3">
              <label className="text-[11px] font-semibold">
                Search employee
                <input
                  className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm"
                  value={employeeQuery}
                  onChange={(e) => setEmployeeQuery(e.target.value)}
                  placeholder="Name, employee ID or department"
                />
              </label>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-[#eaecf0]">
                {filteredEmployees.map((row) => (
                  <button
                    key={`${row.employeeId}-${row.employeeName}`}
                    type="button"
                    onClick={() => selectEmployeeForSession(row)}
                    className={`flex w-full items-center justify-between gap-2 border-b border-[#eaecf0] px-3 py-2 text-left last:border-0 ${
                      form.employeeId === row.employeeId ? 'bg-[#eff8ff]' : 'hover:bg-[#f9fafb]'
                    }`}
                  >
                    <span>
                      <span className="block text-[11px] font-bold">{row.employeeName}</span>
                      <span className="block text-[9px] font-semibold text-[#667085]">{row.employeeId} · {row.department || '—'}</span>
                    </span>
                    <span className="text-[10px] font-semibold text-[#475467]">{row.originalScore ? displayScore(row.originalScore) : '—'}</span>
                  </button>
                ))}
                {!filteredEmployees.length ? (
                  <p className="px-3 py-4 text-center text-[11px] font-semibold text-[#667085]">No eligible employees found for this cycle.</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold">Employee name<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-[#f9fafb] px-3 text-sm" value={form.employeeName} readOnly /></label>
                <label className="text-[11px] font-semibold">Employee ID<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-[#f9fafb] px-3 text-sm" value={form.employeeId} readOnly /></label>
              </div>
              <label className="text-[11px] font-semibold">Department<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-[#f9fafb] px-3 text-sm" value={form.department} readOnly /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold">Original score<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-[#f9fafb] px-3 text-sm" value={form.originalScore} readOnly /></label>
                <label className="text-[11px] font-semibold">Proposed score<input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.proposedScore} onChange={(e) => setForm((f) => ({ ...f, proposedScore: e.target.value }))} /></label>
              </div>
              <label className="text-[11px] font-semibold">Justification<textarea className="mt-1 min-h-[80px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm" value={form.justification} onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))} /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy || !form.employeeId} onClick={() => void createSession()} className="h-9 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50">Propose adjustment</button>
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
              {drawer.status === 'Proposed' || drawer.status === 'Open' ? (
                <div className="mt-5 space-y-3">
                  <label className="block text-[11px] font-semibold">
                    Reject reason
                    <textarea
                      className="mt-1 min-h-[64px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Required when rejecting"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAction('calibration.decide', { id: drawer.id, decision: 'Approved' }).then(() => { setDrawer(null); setRejectReason(''); })}
                      className="h-9 rounded-lg bg-[#1570ef] px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy || !rejectReason.trim()}
                      onClick={() => void onAction('calibration.decide', { id: drawer.id, decision: 'Rejected', reason: rejectReason.trim() }).then(() => { setDrawer(null); setRejectReason(''); })}
                      className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
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
