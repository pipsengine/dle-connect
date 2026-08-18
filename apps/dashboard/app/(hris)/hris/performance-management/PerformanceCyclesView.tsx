'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  HelpCircle,
  LockKeyhole,
  MoreVertical,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Users,
  X,
} from 'lucide-react';
import type { PerformanceCycle, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import type { PerformanceCycleRecord, PerformanceCyclesPageData } from '@/lib/performance-management-types';
import { performanceRouteHref } from '@/lib/performance-management-menu-config';
import { fmtDate, fmtDateTime } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Configuration',
  'Eligibility',
  'Objectives & Weights',
  'Workflow & Schedule',
  'Progress',
  'Exceptions',
  'Audit & History',
] as const;

type TabId = (typeof TABS)[number];

const LIFECYCLE = [
  'Draft',
  'Approval',
  'Published',
  'Goal Setting',
  'Acknowledgement',
  'Active Performance',
  'Mid-Year',
  'Self-Appraisal',
  'Manager Review',
  'Calibration',
  'Results',
  'Closed',
] as const;

const stageLabel = (workflow: string) => {
  const value = String(workflow || '').toLowerCase();
  if (value.includes('draft')) return 'DRAFT';
  if (value.includes('pending') || value.includes('approval')) return 'APPROVAL';
  if (value.includes('goal')) return 'GOAL SETTING';
  if (value.includes('mid')) return 'MID-YEAR';
  if (value.includes('year-end') || value.includes('self') || value.includes('manager')) return 'YEAR-END';
  if (value.includes('calibrat')) return 'CALIBRATION';
  if (value.includes('result')) return 'RESULTS';
  if (value.includes('closed') || value.includes('archiv')) return 'CLOSED';
  if (value.includes('active') || value.includes('publish')) return 'ACTIVE';
  return String(workflow || 'ACTIVE').toUpperCase();
};

const accentFor = (status: PerformanceCycleRecord['status'], workflow: string) => {
  const label = stageLabel(workflow);
  if (status === 'Closed' || label === 'CLOSED') return 'green' as const;
  if (status === 'Draft' || status === 'Upcoming' || label === 'DRAFT' || label === 'APPROVAL') return 'orange' as const;
  return 'blue' as const;
};

const Ring = ({ value, color = '#1465f3' }: { value: number; color?: string }) => (
  <div
    className="relative grid h-12 w-12 place-items-center rounded-full"
    style={{ background: `conic-gradient(${color} ${Math.max(0, Math.min(100, value)) * 3.6}deg, #e2e6eb 0)` }}
  >
    <span className="absolute inset-[6px] grid place-items-center rounded-full bg-white text-[10px] font-bold text-[#162238]">
      {value}%
    </span>
  </div>
);

const KpiCard = ({
  icon: Icon,
  title,
  value,
  link,
  tone,
  href,
}: {
  icon: typeof CalendarDays;
  title: string;
  value: string | number;
  link: string;
  tone: 'blue' | 'green' | 'red';
  href?: string;
}) => {
  const tones = {
    blue: 'bg-gradient-to-br from-[#70a3ff] to-[#1465f3]',
    green: 'bg-gradient-to-br from-[#35b461] to-[#0c8b3e]',
    red: 'bg-gradient-to-br from-[#fb625a] to-[#d7221b]',
  };
  return (
    <article className="flex h-24 items-center gap-5 rounded-lg border border-[#d8dee8] bg-white px-4">
      <div className={`grid h-12 w-12 place-items-center rounded-full text-white ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <span className="block text-[10px] font-medium text-[#59677d]">{title}</span>
        <strong className="mt-1 block text-2xl font-bold text-[#162238]">{value}</strong>
        {href ? (
          <Link href={href} className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#0962ec] hover:underline">
            {link} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#0962ec]">
            {link} <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </article>
  );
};

export default function PerformanceCyclesView({ payload, onAction, busy }: Props) {
  const data = (payload.cyclesPage || null) as PerformanceCyclesPageData | null;
  const domainCycles = payload.domain?.cycles || [];
  const isHrScope = payload.actor?.scope === 'global';
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [year, setYear] = useState('All years');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [drawer, setDrawer] = useState<PerformanceCycleRecord | null>(null);
  const [page, setPage] = useState(1);
  const [eligQuery, setEligQuery] = useState('');
  const [eligDept, setEligDept] = useState('All departments');
  const [configForm, setConfigForm] = useState({
    name: '',
    type: 'Annual',
    description: '',
    populationRule: '',
    startDate: '',
    endDate: '',
    goalSettingStart: '',
    goalSettingEnd: '',
    midYearStart: '',
    midYearEnd: '',
    yearEndStart: '',
    yearEndEnd: '',
    calibrationStart: '',
    calibrationEnd: '',
    publicationDate: '',
    appealDeadline: '',
    companyObjectives: '40',
    individualOkrs: '40',
    behavioural: '20',
    achievementCap: '120',
    enable360: true,
    enableMatrix: true,
    enableCalibration: true,
    enableForcedDistribution: false,
  });
  const pageSize = 10;

  const cycles = data?.cycles || [];
  const activeSummary = data?.activeCycle || {
    name: 'None',
    period: '—',
    employees: 0,
    departments: 0,
    reviewers: 0,
    progress: 0,
  };
  const activeDomain = domainCycles.find((cycle) => cycle.id === payload.domain?.activeCycleId) || domainCycles.find((cycle) => !['Closed', 'Archived', 'Draft'].includes(cycle.status));

  useEffect(() => {
    if (!activeDomain) return;
    setConfigForm({
      name: activeDomain.name,
      type: activeDomain.type,
      description: activeDomain.description || '',
      populationRule: activeDomain.populationRule || '',
      startDate: activeDomain.startDate || '',
      endDate: activeDomain.endDate || '',
      goalSettingStart: activeDomain.goalSettingStart || '',
      goalSettingEnd: activeDomain.goalSettingEnd || '',
      midYearStart: activeDomain.midYearStart || '',
      midYearEnd: activeDomain.midYearEnd || '',
      yearEndStart: activeDomain.yearEndStart || '',
      yearEndEnd: activeDomain.yearEndEnd || '',
      calibrationStart: activeDomain.calibrationStart || '',
      calibrationEnd: activeDomain.calibrationEnd || '',
      publicationDate: activeDomain.publicationDate || '',
      appealDeadline: activeDomain.appealDeadline || '',
      companyObjectives: String(activeDomain.sectionWeights.companyObjectives),
      individualOkrs: String(activeDomain.sectionWeights.individualOkrs),
      behavioural: String(activeDomain.sectionWeights.behavioural),
      achievementCap: String(activeDomain.achievementCap),
      enable360: activeDomain.enable360,
      enableMatrix: activeDomain.enableMatrix,
      enableCalibration: activeDomain.enableCalibration,
      enableForcedDistribution: activeDomain.enableForcedDistribution,
    });
  }, [activeDomain?.id, activeDomain?.updatedAt]);

  const safeFmtDate = (value?: string | null) => {
    if (!value) return '—';
    const day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
    return fmtDate(day);
  };

  const eligibilityRows = useMemo(() => {
    const rows = (payload.domain?.eligibility || []).filter((row) => !activeDomain || row.cycleId === activeDomain.id);
    return rows;
  }, [payload.domain?.eligibility, activeDomain?.id]);

  const eligDepartments = useMemo(
    () => ['All departments', ...Array.from(new Set(eligibilityRows.map((row) => row.department).filter(Boolean))).sort()],
    [eligibilityRows],
  );

  const filteredEligibility = useMemo(() => eligibilityRows.filter((row) => {
    const q = eligQuery.trim().toLowerCase();
    if (q && !`${row.fullName} ${row.employeeCode} ${row.department} ${row.jobTitle} ${row.managerName}`.toLowerCase().includes(q)) return false;
    if (eligDept !== 'All departments' && row.department !== eligDept) return false;
    return true;
  }), [eligibilityRows, eligQuery, eligDept]);

  const cycleObjectives = useMemo(
    () => (payload.domain?.companyObjectives || []).filter((item) => !activeDomain || item.cycleId === activeDomain.id),
    [payload.domain?.companyObjectives, activeDomain?.id],
  );

  const cycleGoals = useMemo(
    () => (payload.domain?.goals || []).filter((goal) => !activeDomain || goal.cycleId === activeDomain.id),
    [payload.domain?.goals, activeDomain?.id],
  );

  const cycleAssessments = useMemo(
    () => (payload.domain?.assessments || []).filter((item) => !activeDomain || item.cycleId === activeDomain.id),
    [payload.domain?.assessments, activeDomain?.id],
  );

  const cycleAudit = useMemo(
    () => (payload.domain?.audit || []).filter((event) =>
      !activeDomain
      || event.entityId === activeDomain.id
      || /cycle/i.test(event.entityType)
      || /cycle/i.test(event.action),
    ).slice(0, 50),
    [payload.domain?.audit, activeDomain?.id],
  );

  const weightTotal = Number(configForm.companyObjectives || 0) + Number(configForm.individualOkrs || 0) + Number(configForm.behavioural || 0);

  const saveCycleConfig = async (extra?: Partial<PerformanceCycle> & { sectionWeights?: { companyObjectives: number; individualOkrs: number; behavioural: number } }) => {
    if (!activeDomain || !isHrScope) return;
    await onAction('cycle.update', {
      cycleId: activeDomain.id,
      name: configForm.name,
      type: configForm.type,
      description: configForm.description,
      populationRule: configForm.populationRule,
      startDate: configForm.startDate,
      endDate: configForm.endDate,
      goalSettingStart: configForm.goalSettingStart,
      goalSettingEnd: configForm.goalSettingEnd,
      midYearStart: configForm.midYearStart,
      midYearEnd: configForm.midYearEnd,
      yearEndStart: configForm.yearEndStart,
      yearEndEnd: configForm.yearEndEnd,
      calibrationStart: configForm.calibrationStart,
      calibrationEnd: configForm.calibrationEnd,
      publicationDate: configForm.publicationDate,
      appealDeadline: configForm.appealDeadline,
      enable360: configForm.enable360,
      enableMatrix: configForm.enableMatrix,
      enableCalibration: configForm.enableCalibration,
      enableForcedDistribution: configForm.enableForcedDistribution,
      achievementCap: Number(configForm.achievementCap || 0),
      sectionWeights: {
        companyObjectives: Number(configForm.companyObjectives || 0),
        individualOkrs: Number(configForm.individualOkrs || 0),
        behavioural: Number(configForm.behavioural || 0),
      },
      ...extra,
    });
  };

  const field = (key: keyof typeof configForm, value: string | boolean) => setConfigForm((current) => ({ ...current, [key]: value }));

  const inputClass = 'mt-1 h-9 w-full rounded-lg border border-[#ccd4df] px-3 text-sm font-semibold outline-none focus:border-[#0962ec]';
  const labelClass = 'text-[10px] font-bold uppercase tracking-wide text-[#66738a]';
  const cardClass = 'rounded-lg border border-[#d8dee8] bg-white p-4';

  const years = useMemo(() => {
    const values = Array.from(new Set(cycles.flatMap((cycle) => {
      const match = cycle.period.match(/\d{4}/g) || [];
      return match;
    }))).sort((a, b) => b.localeCompare(a));
    return ['All years', ...values];
  }, [cycles]);

  const types = useMemo(() => ['All types', ...Array.from(new Set(cycles.map((cycle) => cycle.type).filter(Boolean)))], [cycles]);

  const filtered = useMemo(() => {
    return cycles.filter((cycle) => {
      const q = query.trim().toLowerCase();
      if (q && !`${cycle.name} ${cycle.id} ${cycle.type} ${cycle.period}`.toLowerCase().includes(q)) return false;
      if (status !== 'All statuses') {
        const label = stageLabel(cycle.workflow || cycle.status);
        if (status === 'GOAL SETTING' && label !== 'GOAL SETTING' && cycle.status !== 'Active') return false;
        if (status === 'DRAFT' && cycle.status !== 'Draft' && label !== 'DRAFT') return false;
        if (status === 'CLOSED' && cycle.status !== 'Closed' && label !== 'CLOSED') return false;
        if (!['GOAL SETTING', 'DRAFT', 'CLOSED'].includes(status) && cycle.status !== status) return false;
      }
      if (year !== 'All years' && !cycle.period.includes(year)) return false;
      if (typeFilter !== 'All types' && cycle.type !== typeFilter) return false;
      return true;
    });
  }, [cycles, query, status, year, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const lifecycleStates = useMemo(() => {
    const current = stageLabel(activeDomain?.status || activeSummary?.name || 'Goal Setting');
    const currentIndex = Math.max(
      0,
      LIFECYCLE.findIndex((stage) => current.includes(stage.toUpperCase().replace(' ', '-')) || stage.toUpperCase() === current || current.includes(stage.split(' ')[0].toUpperCase())),
    );
    // Prefer Goal Setting when active cycle is in goal-setting phase
    const idx = current.includes('GOAL') ? 3
      : current.includes('DRAFT') ? 0
        : current.includes('APPROVAL') || current.includes('PENDING') ? 1
          : current.includes('ACTIVE') ? 5
            : current.includes('MID') ? 6
              : current.includes('CALIBR') ? 9
                : current.includes('RESULT') ? 10
                  : current.includes('CLOSED') ? 11
                    : Math.min(currentIndex, LIFECYCLE.length - 1);
    return LIFECYCLE.map((name, i) => ({
      name,
      date: i <= 2 ? 'Complete' : i === idx ? 'Current' : 'Scheduled',
      state: i < idx ? 'done' : i === idx ? 'current' : 'locked',
    }));
  }, [activeDomain?.status, activeSummary?.name]);

  const quickFor = (cycle: PerformanceCycleRecord) => {
    const goalsForCycle = (payload.domain?.goals || []).filter((goal) => goal.cycleId === cycle.id);
    const agreed = goalsForCycle.filter((goal) => ['Agreed', 'Active', 'Completed'].includes(goal.status)).length;
    const ackPct = goalsForCycle.length ? Math.round((agreed / goalsForCycle.length) * 100) : 0;
    const assessmentsForCycle = (payload.domain?.assessments || []).filter((item) => item.cycleId === cycle.id);
    const checkInPct = assessmentsForCycle.length
      ? Math.round((assessmentsForCycle.filter((item) => ['Submitted', 'Approved', 'Published'].includes(item.status)).length / Math.max(cycle.employees || assessmentsForCycle.length, 1)) * 100)
      : 0;
    return [
      Math.max(0, Math.min(100, cycle.progress)),
      Math.max(0, Math.min(100, ackPct)),
      Math.max(0, Math.min(100, checkInPct)),
    ];
  };

  const exceptionsCount = Math.max(0, payload.domain?.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length || 0);
  const canAdvance = Boolean(isHrScope && activeDomain && !['Closed', 'Archived', 'Results Published'].includes(activeDomain.status) && exceptionsCount === 0);

  const openCycleAction = (cycle: PerformanceCycleRecord) => {
    if (cycle.status === 'Draft') return 'Continue setup';
    if (cycle.status === 'Closed' || cycle.status === 'Completed') return 'View results';
    return 'Open Cycle';
  };

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8dee8] bg-white px-6 py-16 text-center">
        <Settings2 className="mx-auto h-10 w-10 text-[#0962ec]" />
        <h2 className="mt-4 text-lg font-bold text-[#162238]">Performance cycles unavailable</h2>
        <p className="mt-2 text-sm text-[#66738a]">Cycle analytics have not been loaded for this session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-[#162238]">
      <div>
        <h1 className="text-xl font-bold text-[#162238]">Performance Cycle Management</h1>
        <p className="mt-1 text-[11px] font-medium text-[#66738a]">Configure, govern and monitor enterprise performance cycles</p>
      </div>

      {/* Active cycle banner + tabs */}
      <section className="overflow-hidden rounded-lg border border-[#d8dee8] bg-white">
        <div className="grid gap-4 p-4 lg:grid-cols-[240px_1fr_160px] lg:items-center">
          <div className="flex gap-3.5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#ccdae9] text-[#1265ee]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-bold leading-tight">{activeSummary.name !== 'None' ? activeSummary.name : 'No active cycle'}</h2>
                {activeSummary.name !== 'None' ? (
                  <span className="rounded border border-[#b8d0ff] bg-[#eaf2ff] px-2 py-0.5 text-[9px] font-semibold text-[#1561d8]">
                    {stageLabel(activeDomain?.status || 'Goal Setting')}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[10px] text-[#66738a]">Cycle period</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold">
                <CalendarDays className="h-3.5 w-3.5" />
                {activeSummary.period}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 sm:divide-x sm:divide-[#d8dee8]">
            <div className="sm:px-4">
              <span className="flex items-center gap-1.5 text-[10px] text-[#66738a]"><BriefcaseBusiness className="h-3.5 w-3.5" /> Scope</span>
              <b className="mt-2 block text-[11px] font-bold">
                {activeDomain?.populationRule || payload.dataSource?.employeeDirectorySource || payload.dataSource?.source || 'HRIS employee directory'}
              </b>
            </div>
            <div className="sm:px-4">
              <span className="flex items-center gap-1.5 text-[10px] text-[#66738a]"><Clock3 className="h-3.5 w-3.5" /> Next deadline</span>
              <b className="mt-2 block text-[11px] font-bold">
                {payload.activeCycle?.deadline ? `Goal acknowledgement · ${safeFmtDate(payload.activeCycle.deadline)}` : 'No deadline set'}
              </b>
            </div>
            <div className="sm:px-4">
              <span className="text-[10px] text-[#66738a]">Overall completion</span>
              <b className="mt-2 block text-[11px] font-bold">{activeSummary.progress}%</b>
              <i className="mt-2 block h-1.5 overflow-hidden rounded bg-[#dfe3e8]">
                <em className="block h-full rounded bg-[#1265ee]" style={{ width: `${activeSummary.progress}%` }} />
              </i>
            </div>
          </div>

          <button
            type="button"
            disabled={!activeDomain}
            onClick={() => activeDomain && setDrawer(cycles.find((c) => c.id === activeDomain.id) || cycles[0] || null)}
            className="inline-flex h-9 items-center justify-center rounded bg-[#0962ec] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            Open active cycle ↗
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-t border-[#d8dee8]">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-5 py-3 text-[10px] font-semibold transition ${
                activeTab === tab ? 'border-b-2 border-[#075fe8] text-[#075fe8]' : 'text-[#3c4d67] hover:text-[#075fe8]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'Overview' ? (
        <>
          <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_239px]">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard icon={CalendarDays} title="Active cycles" value={data.summary.activeCycles} link="View active cycle" tone="blue" />
                <KpiCard icon={Users} title="Eligible employees" value={data.summary.employeesCovered.toLocaleString()} link="View eligibility" tone="green" href={performanceRouteHref('planning/performance-cycles')} />
                <KpiCard icon={CircleGauge} title="Overall completion" value={`${data.summary.completionRate}%`} link="View progress" tone="blue" />
                <KpiCard icon={AlertTriangle} title="Critical exceptions" value={exceptionsCount} link="View exceptions" tone="red" />
              </div>

              <section className="overflow-hidden rounded-lg border border-[#d8dee8] bg-white">
                <div className="grid gap-2 border-b border-[#d8dee8] p-3 md:grid-cols-2 xl:grid-cols-[1.6fr_0.85fr_1.05fr_1.15fr_1.15fr_auto_auto]">
                  <label className="flex h-9 items-center gap-2 rounded border border-[#ccd4df] px-2">
                    <Search className="h-3.5 w-3.5 text-[#66738a]" />
                    <input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                      placeholder="Search cycles..."
                      className="w-full border-0 bg-transparent text-[10px] outline-none"
                    />
                  </label>
                  <select value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }} className="h-9 rounded border border-[#ccd4df] bg-white px-2 text-[10px] text-[#2e3b51]">
                    {years.map((item) => <option key={item} value={item}>{item === 'All years' ? 'Year' : item}</option>)}
                  </select>
                  <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded border border-[#ccd4df] bg-white px-2 text-[10px] text-[#2e3b51]">
                    <option>All statuses</option>
                    <option>GOAL SETTING</option>
                    <option>DRAFT</option>
                    <option>CLOSED</option>
                    <option>Active</option>
                    <option>Completed</option>
                  </select>
                  <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-9 rounded border border-[#ccd4df] bg-white px-2 text-[10px] text-[#2e3b51]">
                    {types.map((item) => <option key={item} value={item}>{item === 'All types' ? 'Cycle type' : item}</option>)}
                  </select>
                  <select className="h-9 rounded border border-[#ccd4df] bg-white px-2 text-[10px] text-[#2e3b51]">
                    <option>All</option>
                    <option>DLE</option>
                  </select>
                  <button type="button" className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-[#ccd4df] bg-white px-3 text-[10px] font-semibold text-[#2e3b51]">
                    <Bookmark className="h-3.5 w-3.5" /> Saved views <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {isHrScope ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAction('cycle.create', { name: `Performance Cycle ${new Date().getFullYear()}`, type: 'Annual' })}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded bg-[#0962ec] px-3 text-[10px] font-semibold text-white disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create Cycle
                    </button>
                  ) : <span />}
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <div className="grid h-8 grid-cols-[2.15fr_0.58fr_1.05fr_1.15fr_0.85fr_1.15fr_0.86fr] items-center border-b border-[#d8dee8] bg-[#f7f8fa] text-[9px] font-semibold uppercase tracking-wide text-[#46546b]">
                      <span className="px-3">Cycle & Scope</span>
                      <span className="px-3">Progress</span>
                      <span className="px-3">Approval</span>
                      <span className="px-3">Next Deadline</span>
                      <span className="px-3">Exceptions</span>
                      <span className="px-3">Quick Status</span>
                      <span className="px-3">Action</span>
                    </div>

                    {rows.map((cycle) => {
                      const accent = accentFor(cycle.status, cycle.workflow);
                      const label = stageLabel(cycle.workflow || cycle.status);
                      const quick = quickFor(cycle);
                      const ringColor = accent === 'green' ? '#13964b' : '#1465f3';
                      return (
                        <div key={cycle.id} className="grid min-h-[91px] grid-cols-[2.15fr_0.58fr_1.05fr_1.15fr_0.85fr_1.15fr_0.86fr] items-center border-b border-[#d8dee8]">
                          <div className="flex gap-3 px-3">
                            <input type="checkbox" aria-label={`Select ${cycle.name}`} className="mt-1 h-3.5 w-3.5" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <b className="text-xs font-bold">{cycle.name}</b>
                                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                                  label.includes('GOAL') || label.includes('ACTIVE')
                                    ? 'border-[#b8d0ff] bg-[#eaf2ff] text-[#1561d8]'
                                    : 'border-[#d5dae1] bg-[#f0f2f5] text-[#536078]'
                                }`}>
                                  {label}
                                </span>
                              </div>
                              <small className="mt-1 block text-[9px] text-[#5f6e85]">{cycle.id}</small>
                              <small className="mt-1 flex items-center gap-1 text-[9px] text-[#5f6e85]">
                                <Users className="h-3 w-3" /> All employees · {cycle.employees.toLocaleString()} eligible
                              </small>
                            </div>
                          </div>
                          <div className="px-3"><Ring value={cycle.progress} color={ringColor} /></div>
                          <div className={`min-h-[57px] border-l border-[#d8dee8] px-3 ${accent === 'orange' ? 'text-[#db6b00]' : 'text-[#0b963e]'}`}>
                            <div className="flex items-center gap-1.5">
                              {accent === 'orange' ? <Clock3 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              <b className="text-[10px] font-bold">{accent === 'orange' ? 'Pending' : cycle.status === 'Closed' || cycle.status === 'Completed' ? 'Completed' : 'Approved'}</b>
                            </div>
                            <small className="mt-1 block whitespace-pre-line pl-5 text-[9px]">
                              {accent === 'orange' ? 'HR validation' : `by ${cycle.owner || 'HR'}\non ${safeFmtDate(cycle.lastUpdated)}`}
                            </small>
                          </div>
                          <div className={`min-h-[57px] border-l border-[#d8dee8] px-3 ${accent === 'orange' ? 'text-[#db6b00]' : ''}`}>
                            <b className="whitespace-pre-line text-[10px] font-bold">
                              {accent === 'orange' ? 'Eligibility snapshot\nrequired' : `Goal acknowledgement\n${safeFmtDate(cycle.endDate)}`}
                            </b>
                            <small className="mt-1 block text-[9px] text-[#075fe8]">{accent === 'orange' ? 'See blocker' : 'Track deadline'}</small>
                          </div>
                          <div className={`min-h-[57px] border-l border-[#d8dee8] px-3 ${accent === 'green' ? 'text-[#0b963e]' : accent === 'orange' ? 'text-[#db6b00]' : 'text-[#e03127]'}`}>
                            <b className="text-[10px] font-bold">{accent === 'green' ? 'No exceptions' : `${Math.max(0, payload.domain?.tasks.filter((task) => task.cycleId === cycle.id && !['Completed', 'Cancelled'].includes(task.status)).length || 0)} open tasks`}</b>
                            <button type="button" onClick={() => setDrawer(cycle)} className="mt-1 block text-[10px] font-semibold text-[#075fe8]">
                              View details <ChevronRight className="inline h-3 w-3" />
                            </button>
                          </div>
                          <div className="px-3">
                            {['Goals', 'Acknowledged', 'Check-ins'].map((labelText, index) => (
                              <div key={labelText} className="my-1.5 grid grid-cols-[48px_1fr_24px] items-center gap-1">
                                <span className="text-[8px] font-medium text-[#59677d]">{labelText}</span>
                                <i className="block h-1 overflow-hidden rounded bg-[#dfe3e7]">
                                  <em className={`block h-full rounded ${index === 0 ? 'bg-[#0a9b4d]' : 'bg-[#0962ec]'}`} style={{ width: `${quick[index]}%` }} />
                                </i>
                                <b className="text-right text-[8px] font-medium">{quick[index]}%</b>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 px-3">
                            <button
                              type="button"
                              onClick={() => setDrawer(cycle)}
                              className="h-8 whitespace-nowrap rounded border border-[#1769ee] px-3 text-[9px] font-semibold text-[#075fe8]"
                            >
                              {openCycleAction(cycle)}
                            </button>
                            <button type="button" className="p-1 text-[#66738a]" aria-label="More actions">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {!rows.length ? (
                      <div className="px-4 py-10 text-center text-sm font-semibold text-[#66738a]">No cycles match these filters.</div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d8dee8] px-3 py-2 text-[9px] text-[#66738a]">
                  <span>
                    Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} cycles
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="grid h-7 w-7 place-items-center rounded border border-[#d8dee8] bg-white disabled:opacity-40">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="grid h-7 w-7 place-items-center rounded bg-[#1265ee] text-white">{page}</button>
                    <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded border border-[#d8dee8] bg-white disabled:opacity-40">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <select className="h-7 rounded border border-[#d8dee8] bg-white px-2 text-[9px]" value={pageSize} disabled>
                      <option>10 / page</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>

            <aside className="h-fit rounded-lg border border-[#d8dee8] bg-white p-3.5">
              <h3 className="mb-3 text-[13px] font-bold">Cycle Health & Governance</h3>
              {[
                [CalendarDays, 'Dates valid', 'Valid'],
                [Activity, 'Weights total', '100%'],
                [Users, 'Eligibility snapshot', activeSummary.employees ? 'Complete' : 'Pending'],
                [ShieldCheck, 'Approval', activeDomain && !['Draft', 'Pending Approval'].includes(activeDomain.status) ? 'Complete' : 'Pending'],
              ].map(([Icon, labelText, value]) => (
                <div key={String(labelText)} className="grid h-12 grid-cols-[21px_1fr_auto_17px] items-center gap-2 border-t border-[#e2e5e9] text-[11px]">
                  <Icon className="h-4 w-4 text-[#66738a]" />
                  <span>{String(labelText)}</span>
                  <b className="text-[10px] text-[#0b963e]">{String(value)}</b>
                  <CheckCircle2 className="h-4 w-4 text-[#0b963e]" />
                </div>
              ))}
              <div className="mt-2 grid grid-cols-[21px_1fr_auto_17px] items-center gap-2 border-t border-[#e2e5e9] py-3 text-[11px] text-[#e02e23]">
                <AlertTriangle className="h-4 w-4" />
                <span>Unresolved exceptions</span>
                <b className="text-[10px]">{exceptionsCount}</b>
                <ChevronRight className="h-4 w-4" />
              </div>
              <button
                type="button"
                disabled={!canAdvance || busy || !activeDomain}
                onClick={() => {
                  if (!activeDomain) return;
                  const next =
                    activeDomain.status === 'Goal Setting' ? 'Active'
                      : activeDomain.status === 'Active' ? 'Mid-Year Review'
                        : activeDomain.status === 'Mid-Year Review' ? 'Year-End Review'
                          : activeDomain.status === 'Year-End Review' ? 'Calibration'
                            : activeDomain.status === 'Calibration' ? 'Results Published'
                              : null;
                  if (next) void onAction('cycle.advance-status', { cycleId: activeDomain.id, status: next });
                }}
                className="mt-8 flex h-10 w-full items-center justify-center gap-2 rounded border border-[#ccd1d8] text-[11px] font-semibold disabled:opacity-60"
              >
                <span>Advance lifecycle</span>
                <LockKeyhole className="h-3.5 w-3.5" />
              </button>
              <p className="mt-3 flex items-center gap-1.5 text-[10px] text-[#56647a]">
                <HelpCircle className="h-4 w-4 text-[#32639e]" /> Resolve blockers before transition
              </p>
            </aside>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
            <section className="rounded-lg border border-[#d8dee8] bg-white p-3.5">
              <h3 className="text-[13px] font-bold">Performance Cycle Lifecycle</h3>
              <div className="mt-6 flex items-start overflow-x-auto pb-2">
                <div className="flex min-w-[900px] flex-1">
                  {lifecycleStates.map((stage, index) => (
                    <div key={stage.name} className="relative flex-1 text-center">
                      {index < lifecycleStates.length - 1 ? (
                        <i className={`absolute left-1/2 top-4 z-0 h-0.5 w-full ${stage.state === 'done' ? 'bg-[#0a9b4d]' : 'bg-[#bac4d0]'}`} />
                      ) : null}
                      <div className={`relative z-[1] mx-auto grid h-8 w-8 place-items-center rounded-full border ${
                        stage.state === 'done' ? 'border-[#0a9b4d] text-[#0a9b4d] bg-white'
                          : stage.state === 'current' ? 'border-[5px] border-[#1265ee] bg-[#1265ee] text-white shadow-[0_0_0_4px_#ccdcff]'
                            : 'border-[#b7c1cf] bg-white text-[#7d899b]'
                      }`}>
                        {stage.state === 'done' ? <Check className="h-3.5 w-3.5" /> : stage.state === 'current' ? <Target className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
                      </div>
                      <b className={`mt-2 block text-[8px] ${stage.state === 'current' ? 'text-[#075fe8]' : 'text-[#162238]'}`}>{stage.name}</b>
                      {stage.state === 'current' ? <span className="mx-auto mt-1 inline-block rounded border border-[#bfd0ef] px-1.5 py-0.5 text-[7px] text-[#075fe8]">CURRENT</span> : null}
                      <small className="mt-2 block text-[8px] text-[#59677d]">{stage.date}</small>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-[#d8dee8] bg-white p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-bold">Upcoming Deadlines</h3>
                <button type="button" className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#0962ec]">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              {[
                [payload.activeCycle?.deadline ? safeFmtDate(payload.activeCycle.deadline) : '—', 'Goal acknowledgement', 'Employees'],
                ['TBD', 'First check-in', 'Managers'],
                ['TBD', 'Mid-year review', 'Managers'],
                ['TBD', 'Self-appraisal', 'Employees'],
                [activeSummary.period.includes('→') ? safeFmtDate(activeSummary.period.split('→')[1]?.trim() || '') : '—', 'Manager review', 'Managers'],
              ].map(([date, title, audience]) => (
                <div key={`${date}-${title}`} className="grid h-9 grid-cols-[19px_82px_1fr_75px] items-center gap-1 border-t border-[#e0e4ea] text-[9px]">
                  <CalendarDays className="h-3.5 w-3.5 text-[#0962ec]" />
                  <b className="font-bold text-[#0962ec]">{date}</b>
                  <span>{title}</span>
                  <small className="text-right text-[#66738a]">{audience}</small>
                </div>
              ))}
            </section>
          </div>
        </>
      ) : activeTab === 'Configuration' ? (
        <section className="space-y-4">
          {!activeDomain ? (
            <div className={`${cardClass} py-12 text-center text-sm font-semibold text-[#66738a]`}>Select or create an active cycle to configure.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">Cycle configuration</h2>
                  <p className="mt-1 text-[11px] font-medium text-[#66738a]">Identity, population rule, core dates and feature toggles for {activeDomain.name}.</p>
                </div>
                {isHrScope ? (
                  <button type="button" disabled={busy} onClick={() => void saveCycleConfig()} className="inline-flex h-9 items-center gap-1.5 rounded bg-[#0962ec] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                    <Save className="h-3.5 w-3.5" /> Save configuration
                  </button>
                ) : null}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className={cardClass}>
                  <h3 className="mb-3 text-sm font-bold">Identity</h3>
                  <div className="grid gap-3">
                    <label className={labelClass}>Cycle name<input className={inputClass} disabled={!isHrScope} value={configForm.name} onChange={(e) => field('name', e.target.value)} /></label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={labelClass}>Type<input className={inputClass} disabled={!isHrScope} value={configForm.type} onChange={(e) => field('type', e.target.value)} /></label>
                      <label className={labelClass}>Status<input className={inputClass} value={activeDomain.status} disabled /></label>
                    </div>
                    <label className={labelClass}>Description<textarea className={`${inputClass} min-h-[72px] py-2`} disabled={!isHrScope} value={configForm.description} onChange={(e) => field('description', e.target.value)} /></label>
                    <label className={labelClass}>Population rule<input className={inputClass} disabled={!isHrScope} value={configForm.populationRule} onChange={(e) => field('populationRule', e.target.value)} /></label>
                  </div>
                </div>
                <div className={cardClass}>
                  <h3 className="mb-3 text-sm font-bold">Core dates</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['startDate', 'Start date'],
                      ['endDate', 'End date'],
                      ['goalSettingStart', 'Goal setting start'],
                      ['goalSettingEnd', 'Goal setting end'],
                    ].map(([key, label]) => (
                      <label key={key} className={labelClass}>{label}
                        <input type="date" className={inputClass} disabled={!isHrScope} value={String(configForm[key as keyof typeof configForm] || '')} onChange={(e) => field(key as keyof typeof configForm, e.target.value)} />
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2">
                    {[
                      ['enable360', 'Enable 360 feedback'],
                      ['enableMatrix', 'Enable matrix / project inputs'],
                      ['enableCalibration', 'Enable calibration'],
                      ['enableForcedDistribution', 'Forced distribution'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[#e8edf3] px-3 py-2 text-[12px] font-semibold">
                        <span>{label}</span>
                        <input type="checkbox" disabled={!isHrScope} checked={Boolean(configForm[key as keyof typeof configForm])} onChange={(e) => field(key as keyof typeof configForm, e.target.checked)} />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      ) : activeTab === 'Eligibility' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Eligibility snapshot</h2>
              <p className="mt-1 text-[11px] font-medium text-[#66738a]">
                {eligibilityRows.filter((row) => row.included).length} included · {eligibilityRows.length} in snapshot
                {activeDomain ? ` · ${activeDomain.populationRule}` : ''}
                {payload.dataSource?.employeeDirectorySource || payload.dataSource?.source
                  ? ` · Source: ${payload.dataSource?.employeeDirectorySource || payload.dataSource?.source}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isHrScope && activeDomain && !['Closed', 'Archived'].includes(activeDomain.status) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAction('cycle.refresh-eligibility', { cycleId: activeDomain.id })}
                  className="inline-flex h-9 items-center rounded border border-[#ccd4df] bg-white px-3 text-[11px] font-semibold text-[#2e3b51] disabled:opacity-50"
                >
                  Refresh from HRIS
                </button>
              ) : null}
              {isHrScope && activeDomain && ['Draft', 'Pending Approval'].includes(activeDomain.status) ? (
                <button type="button" disabled={busy} onClick={() => void onAction('cycle.approve-publish', { cycleId: activeDomain.id })} className="inline-flex h-9 items-center rounded bg-[#0962ec] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                  Publish & snapshot eligibility
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Eligible employees', eligibilityRows.filter((row) => row.included).length],
              ['Departments', new Set(eligibilityRows.map((row) => row.department).filter(Boolean)).size],
              ['Managers', new Set(eligibilityRows.map((row) => row.managerName || row.managerId).filter(Boolean)).size],
            ].map(([label, value]) => (
              <div key={String(label)} className={cardClass}>
                <p className="text-[10px] font-semibold text-[#66738a]">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className={`${cardClass} !p-0 overflow-hidden`}>
            <div className="flex flex-wrap gap-2 border-b border-[#d8dee8] p-3">
              <input value={eligQuery} onChange={(e) => setEligQuery(e.target.value)} placeholder="Search employee, code or department" className="h-9 min-w-[220px] flex-1 rounded-lg border border-[#ccd4df] px-3 text-[11px]" />
              <select value={eligDept} onChange={(e) => setEligDept(e.target.value)} className="h-9 rounded-lg border border-[#ccd4df] bg-white px-2 text-[11px]">
                {eligDepartments.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr_0.7fr] border-b border-[#d8dee8] bg-[#f7f8fa] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#46546b]">
                  <span>Employee</span>
                  <span>Department</span>
                  <span>Job title</span>
                  <span>Manager</span>
                  <span>Status</span>
                </div>
                {filteredEligibility.slice(0, 100).map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.3fr_1fr_1fr_1fr_0.7fr] items-center border-b border-[#d8dee8] px-3 py-2.5 text-[11px]">
                    <div>
                      <p className="font-bold">{row.fullName}</p>
                      <p className="text-[9px] font-semibold text-[#66738a]">{row.employeeCode}</p>
                    </div>
                    <span className="font-semibold text-[#475467]">{row.department || '—'}</span>
                    <span className="font-semibold text-[#475467]">{row.jobTitle || '—'}</span>
                    <span className="font-semibold text-[#475467]">{row.managerName || '—'}</span>
                    <span className={`font-bold ${row.included ? 'text-[#0b963e]' : 'text-[#db6b00]'}`}>{row.included ? 'Included' : 'Excluded'}</span>
                  </div>
                ))}
                {!filteredEligibility.length ? (
                  <div className="px-4 py-10 text-center text-sm font-semibold text-[#66738a]">
                    No eligibility rows for this cycle yet. Use <b>Refresh from HRIS</b> to snapshot active employees from the payroll directory.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : activeTab === 'Objectives & Weights' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Objectives & weights</h2>
              <p className="mt-1 text-[11px] font-medium text-[#66738a]">Section weights must total 100%. Company objectives inherit the active cycle.</p>
            </div>
            {isHrScope ? (
              <button type="button" disabled={busy || weightTotal !== 100} onClick={() => void saveCycleConfig()} className="inline-flex h-9 items-center gap-1.5 rounded bg-[#0962ec] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Save weights
              </button>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-bold">Section weights</h3>
              <div className="grid gap-3">
                {[
                  ['companyObjectives', 'Company objectives'],
                  ['individualOkrs', 'Individual OKRs'],
                  ['behavioural', 'Behavioural'],
                ].map(([key, label]) => (
                  <label key={key} className={labelClass}>{label}
                    <input className={inputClass} disabled={!isHrScope} value={String(configForm[key as keyof typeof configForm])} onChange={(e) => field(key as keyof typeof configForm, e.target.value)} />
                  </label>
                ))}
                <label className={labelClass}>Achievement cap %
                  <input className={inputClass} disabled={!isHrScope} value={configForm.achievementCap} onChange={(e) => field('achievementCap', e.target.value)} />
                </label>
                <p className={`text-[11px] font-bold ${weightTotal === 100 ? 'text-[#0b963e]' : 'text-[#e03127]'}`}>Total: {weightTotal}% {weightTotal === 100 ? '(valid)' : '(must equal 100%)'}</p>
              </div>
              <div className="mt-4">
                <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#66738a]">Rating bands</h4>
                <div className="space-y-2">
                  {(activeDomain?.ratingBands || payload.domain?.config.ratingBands || []).map((band) => (
                    <div key={band.label} className="flex items-center justify-between rounded-lg border border-[#e8edf3] px-3 py-2 text-[11px] font-semibold">
                      <span>{band.label}</span>
                      <span className="text-[#66738a]">{band.min} – {band.max}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={cardClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">Company objectives</h3>
                <Link href={performanceRouteHref('planning/corporate-goals')} className="text-[10px] font-bold text-[#0962ec]">Open Company Objectives →</Link>
              </div>
              <div className="space-y-2">
                {cycleObjectives.map((item) => (
                  <div key={item.id} className="rounded-lg border border-[#e8edf3] px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-bold">{item.code} · {item.title}</p>
                      <span className="text-[10px] font-bold text-[#0962ec]">{item.weight}%</span>
                    </div>
                    <p className="mt-1 text-[10px] font-semibold text-[#66738a]">{item.owner} · {item.status} · {item.strategicPillar}</p>
                  </div>
                ))}
                {!cycleObjectives.length ? <p className="py-8 text-center text-sm font-semibold text-[#66738a]">No company objectives for this cycle yet.</p> : null}
              </div>
            </div>
          </div>
        </section>
      ) : activeTab === 'Workflow & Schedule' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Workflow & schedule</h2>
              <p className="mt-1 text-[11px] font-medium text-[#66738a]">Governed milestones for mid-year, year-end, calibration and publication.</p>
            </div>
            {isHrScope ? (
              <button type="button" disabled={busy || !activeDomain} onClick={() => void saveCycleConfig()} className="inline-flex h-9 items-center gap-1.5 rounded bg-[#0962ec] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Save schedule
              </button>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-bold">Milestone dates</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['midYearStart', 'Mid-year start'],
                  ['midYearEnd', 'Mid-year end'],
                  ['yearEndStart', 'Year-end start'],
                  ['yearEndEnd', 'Year-end end'],
                  ['calibrationStart', 'Calibration start'],
                  ['calibrationEnd', 'Calibration end'],
                  ['publicationDate', 'Publication date'],
                  ['appealDeadline', 'Appeal deadline'],
                ].map(([key, label]) => (
                  <label key={key} className={labelClass}>{label}
                    <input type="date" className={inputClass} disabled={!isHrScope} value={String(configForm[key as keyof typeof configForm] || '')} onChange={(e) => field(key as keyof typeof configForm, e.target.value)} />
                  </label>
                ))}
              </div>
            </div>
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-bold">Lifecycle track</h3>
              <div className="space-y-2">
                {lifecycleStates.map((stage) => (
                  <div key={stage.name} className="flex items-center justify-between rounded-lg border border-[#e8edf3] px-3 py-2 text-[11px]">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      {stage.state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-[#0b963e]" /> : stage.state === 'current' ? <Target className="h-3.5 w-3.5 text-[#0962ec]" /> : <LockKeyhole className="h-3.5 w-3.5 text-[#94a3b8]" />}
                      {stage.name}
                    </span>
                    <span className={`font-bold ${stage.state === 'current' ? 'text-[#0962ec]' : 'text-[#66738a]'}`}>{stage.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : activeTab === 'Progress' ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-bold">Cycle progress</h2>
            <p className="mt-1 text-[11px] font-medium text-[#66738a]">Live completion across goals, assessments and workflow health.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Overall completion', `${activeSummary.progress}%`],
              ['Goals', String(cycleGoals.length)],
              ['Assessments', String(cycleAssessments.length)],
              ['Results', String((payload.domain?.results || []).filter((row) => !activeDomain || row.cycleId === activeDomain.id).length)],
            ].map(([label, value]) => (
              <div key={label} className={cardClass}>
                <p className="text-[10px] font-semibold text-[#66738a]">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-bold">Workflow health</h3>
              <div className="space-y-3">
                {(data?.workflowHealth || []).map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 flex justify-between text-[11px] font-semibold">
                      <span>{item.label}</span>
                      <span>{item.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#e8edf3]">
                      <div className="h-full rounded-full bg-[#0962ec]" style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
                {!data?.workflowHealth?.length ? <p className="text-sm font-semibold text-[#66738a]">No workflow health metrics yet.</p> : null}
              </div>
            </div>
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-bold">Goal status mix</h3>
              <div className="space-y-2">
                {['Draft', 'Assigned', 'Agreed', 'Active', 'Completed'].map((statusLabel) => {
                  const count = cycleGoals.filter((goal) => goal.status === statusLabel).length;
                  const pct = cycleGoals.length ? Math.round((count / cycleGoals.length) * 100) : 0;
                  return (
                    <div key={statusLabel} className="flex items-center justify-between rounded-lg border border-[#e8edf3] px-3 py-2 text-[11px] font-semibold">
                      <span>{statusLabel}</span>
                      <span>{count} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : activeTab === 'Exceptions' ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-bold">Exceptions</h2>
            <p className="mt-1 text-[11px] font-medium text-[#66738a]">Open workflow tasks and governance blockers for the active cycle.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Open tasks', exceptionsCount],
              ['Weight imbalance', weightTotal === 100 ? 0 : 1],
              ['Missing eligibility', eligibilityRows.length ? 0 : 1],
            ].map(([label, value]) => (
              <div key={String(label)} className={cardClass}>
                <p className="text-[10px] font-semibold text-[#66738a]">{label}</p>
                <p className={`mt-2 text-2xl font-bold ${Number(value) > 0 ? 'text-[#e03127]' : 'text-[#0b963e]'}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className={cardClass}>
            <h3 className="mb-3 text-sm font-bold">Open tasks</h3>
            <div className="space-y-2">
              {(payload.domain?.tasks || []).filter((task) => !['Completed', 'Cancelled'].includes(task.status)).slice(0, 20).map((task) => (
                <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e8edf3] px-3 py-2.5">
                  <div>
                    <p className="text-[11px] font-bold">{task.title}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#66738a]">{task.employeeName} · {task.type} · due {safeFmtDate(task.dueDate)}</p>
                  </div>
                  <span className="text-[10px] font-bold text-[#db6b00]">{task.status}</span>
                </div>
              ))}
              {!exceptionsCount ? <p className="py-8 text-center text-sm font-semibold text-[#66738a]">No critical exceptions for this cycle.</p> : null}
            </div>
          </div>
        </section>
      ) : activeTab === 'Audit & History' ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-bold">Audit & history</h2>
            <p className="mt-1 text-[11px] font-medium text-[#66738a]">Governed actions affecting cycles and related performance entities.</p>
          </div>
          <div className={cardClass}>
            <div className="space-y-2">
              {cycleAudit.map((event) => (
                <div key={event.id} className="rounded-lg border border-[#e8edf3] px-3 py-2.5 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{event.action}</p>
                    <span className="font-semibold text-[#66738a]">{fmtDateTime(event.at)}</span>
                  </div>
                  <p className="mt-1 font-semibold text-[#66738a]">{event.actor} · {event.actorRole} · {event.entityType}/{event.entityId}</p>
                  {event.reason ? <p className="mt-1 text-[#975000]">{event.reason}</p> : null}
                </div>
              ))}
              {!cycleAudit.length ? <p className="py-8 text-center text-sm font-semibold text-[#66738a]">No audit events for this cycle yet.</p> : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-[#d8dee8] bg-white px-6 py-20 text-center">
          <Settings2 className="mx-auto h-11 w-11 text-[#0962ec]" />
          <h2 className="mt-4 text-xl font-bold">{activeTab}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[#66738a]">This governed workspace is ready for the corresponding cycle configuration and operational content.</p>
          <button type="button" onClick={() => setActiveTab('Overview')} className="mt-6 inline-flex h-9 items-center rounded bg-[#0962ec] px-4 text-[11px] font-semibold text-white">
            Back to Overview
          </button>
        </section>
      )}

      {drawer ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#061a3480]" aria-label="Close drawer" onClick={() => setDrawer(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[430px] flex-col bg-white shadow-[-15px_0_40px_#071b3833]">
            <div className="flex items-start justify-between border-b border-[#d8dee8] p-6">
              <div>
                <small className="text-[11px] font-bold uppercase tracking-wide text-[#0962ec]">Performance Cycle</small>
                <h2 className="mt-2 text-xl font-bold">{drawer.name}</h2>
                <p className="mt-1 text-sm text-[#66738a]">{drawer.id}</p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="grid h-9 w-9 place-items-center rounded-lg text-[#66738a] hover:bg-[#f5f7fa]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <span className="rounded border border-[#b8d0ff] bg-[#eaf2ff] px-2 py-1 text-[9px] font-semibold text-[#1561d8]">
                {stageLabel(drawer.workflow || drawer.status)}
              </span>
              <h3 className="mt-7 text-sm font-bold">Cycle summary</h3>
              <dl className="mt-2">
                {[
                  ['Population', `${drawer.employees.toLocaleString()} eligible`],
                  ['Completion', `${drawer.progress}%`],
                  ['Approval', drawer.status],
                  ['Period', drawer.period],
                ].map(([dt, dd]) => (
                  <div key={dt} className="flex items-center justify-between border-b border-[#d8dee8] py-3.5 text-sm">
                    <dt className="text-[#66738a]">{dt}</dt>
                    <dd className="font-semibold">{dd}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-7 text-sm font-bold">Next action</h3>
              <div className="mt-3 flex gap-3 rounded-md bg-[#fff7eb] p-3.5 text-sm text-[#975000]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Resolve validation blockers before advancing this cycle. Use Create / Publish / Advance from HR controls when ready.</span>
              </div>
              {isHrScope ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {drawer.status === 'Draft' ? (
                    <button type="button" disabled={busy} className="rounded border border-[#d8dee8] px-3 py-2 text-xs font-semibold" onClick={() => void onAction('cycle.submit-approval', { cycleId: drawer.id })}>
                      Submit approval
                    </button>
                  ) : null}
                  {['Draft', 'Upcoming'].includes(drawer.status) ? (
                    <button type="button" disabled={busy} className="rounded bg-[#0962ec] px-3 py-2 text-xs font-semibold text-white" onClick={() => void onAction('cycle.approve-publish', { cycleId: drawer.id })}>
                      Publish
                    </button>
                  ) : null}
                  <button type="button" disabled={busy} className="rounded border border-[#d8dee8] px-3 py-2 text-xs font-semibold" onClick={() => void onAction('cycle.clone', { cycleId: drawer.id })}>
                    Clone
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-auto flex justify-end gap-2 border-t border-[#d8dee8] px-6 py-4">
              <button type="button" onClick={() => setDrawer(null)} className="h-9 rounded border border-[#d8dee8] bg-white px-3.5 text-sm font-semibold">
                Close
              </button>
              <button type="button" onClick={() => setDrawer(null)} className="h-9 rounded bg-[#0962ec] px-3.5 text-sm font-semibold text-white">
                Open full workspace
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
