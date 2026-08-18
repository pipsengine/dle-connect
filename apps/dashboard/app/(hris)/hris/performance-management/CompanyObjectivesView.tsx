'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Filter,
  MoreVertical,
  Network,
  Plus,
  Scale,
  Search,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import type { CompanyObjective, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Objectives',
  'Alignment & Cascading',
  'Progress Updates',
  'Scoring',
  'Approvals',
  'Versions & Changes',
  'Audit',
] as const;

type TabId = (typeof TABS)[number];

type ObjectiveStatus = 'On Track' | 'At Risk' | 'Awaiting Score' | 'Draft';

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

const actualValue = (item: CompanyObjective) =>
  item.corporateAchievement != null ? Number(item.corporateAchievement) : Number(item.baseline || 0);

const progressPct = (item: CompanyObjective) => {
  const target = Number(item.target) || 0;
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((actualValue(item) / target) * 100)));
};

const deriveStatus = (item: CompanyObjective): ObjectiveStatus => {
  if (item.status === 'Draft' || item.status === 'Pending Approval') return 'Draft';
  const pct = progressPct(item);
  if (pct < 85) return 'At Risk';
  return 'On Track';
};

const StatusPill = ({ status }: { status: ObjectiveStatus }) => {
  const styles: Record<ObjectiveStatus, string> = {
    'On Track': 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]',
    'At Risk': 'bg-[#fff6ed] text-[#c4320a] border-[#f9dbaf]',
    'Awaiting Score': 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]',
    Draft: 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>
      <i className={`h-1.5 w-1.5 rounded-full ${status === 'At Risk' ? 'bg-[#f79009]' : status === 'On Track' ? 'bg-[#12b76a]' : 'bg-[#2e90fa]'}`} />
      {status}
    </span>
  );
};

const Donut = ({ value, color, label }: { value: number; color: string; label: string }) => (
  <div className="relative mx-auto grid h-[88px] w-[88px] place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${Math.max(0, Math.min(100, value)) * 3.6}deg, #e4e7ec 0)` }}>
    <span className="absolute inset-[12px] grid place-items-center rounded-full bg-white text-center">
      <b className="block text-lg font-bold text-[#101828]">{value}%</b>
      <small className="text-[8px] font-semibold uppercase tracking-wide text-[#667085]">{label}</small>
    </span>
  </div>
);

const DEFAULT_PILLARS = [
  'Revenue & Growth',
  'Operational Excellence',
  'Customer Experience',
  'People & Culture',
  'Financial Discipline',
  'Innovation & Technology',
  'Health, Safety & Environment',
] as const;

const emptyForm = () => ({
  code: '',
  title: '',
  weight: '10',
  kpi: '',
  target: '100',
  baseline: '0',
  unit: '%',
  owner: '',
  ownerId: '',
  strategicPillar: '',
  description: '',
});

const nextObjectiveCode = (existing: CompanyObjective[]) => {
  const used = new Set(existing.map((row) => row.code.toUpperCase()));
  for (let n = 1; n <= 999; n += 1) {
    const code = `CO-REV-${String(n).padStart(2, '0')}`;
    if (!used.has(code)) return code;
  }
  return `CO-${Date.now().toString(36).toUpperCase()}`;
};

export default function CompanyObjectivesView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const isHrScope = payload.actor?.scope === 'global';
  const cycles = domain.cycles || [];
  const [cycleId, setCycleId] = useState(domain.activeCycleId || cycles[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [pillarFilter, setPillarFilter] = useState('All pillars');
  const [ownerFilter, setOwnerFilter] = useState('All owners');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<CompanyObjective | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [ownerQuery, setOwnerQuery] = useState('');
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [scoreDraft, setScoreDraft] = useState('');
  const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const pageSize = 10;

  const activeCycle = cycles.find((cycle) => cycle.id === cycleId) || cycles.find((cycle) => cycle.id === domain.activeCycleId) || cycles[0];
  const objectives = useMemo(
    () => (domain.companyObjectives || []).filter((item) => !cycleId || item.cycleId === cycleId),
    [domain.companyObjectives, cycleId],
  );
  const goals = useMemo(
    () => (domain.goals || []).filter((goal) => !cycleId || goal.cycleId === cycleId),
    [domain.goals, cycleId],
  );
  const eligibility = useMemo(
    () => (domain.eligibility || []).filter((row) => (!cycleId || row.cycleId === cycleId) && row.included),
    [domain.eligibility, cycleId],
  );
  const checkIns = useMemo(
    () => (domain.checkIns || []).filter((row) => !cycleId || row.cycleId === cycleId).slice(0, 40),
    [domain.checkIns, cycleId],
  );
  const objectiveAudit = useMemo(
    () => (domain.audit || []).filter((row) => row.entityType === 'CompanyObjective').slice(0, 50),
    [domain.audit],
  );

  const ownerDirectory = useMemo(() => {
    const map = new Map<string, { employeeId: string; employeeCode: string; fullName: string; department: string; jobTitle: string }>();
    for (const row of eligibility) {
      const key = row.employeeId || row.employeeCode || row.fullName;
      if (!key || map.has(key)) continue;
      map.set(key, {
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        fullName: row.fullName,
        department: row.department || '',
        jobTitle: row.jobTitle || '',
      });
    }
    return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [eligibility]);

  const filteredOwners = useMemo(() => {
    const q = ownerQuery.trim().toLowerCase();
    if (!q) return ownerDirectory.slice(0, 40);
    return ownerDirectory
      .filter((row) => `${row.fullName} ${row.employeeCode} ${row.employeeId} ${row.department} ${row.jobTitle}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [ownerDirectory, ownerQuery]);

  const pillarOptions = useMemo(() => {
    const fromData = objectives.map((item) => item.strategicPillar).filter(Boolean);
    return Array.from(new Set([...DEFAULT_PILLARS, ...fromData])).sort((a, b) => a.localeCompare(b));
  }, [objectives]);

  const pillars = useMemo(() => ['All pillars', ...Array.from(new Set(objectives.map((item) => item.strategicPillar).filter(Boolean)))], [objectives]);
  const owners = useMemo(() => ['All owners', ...Array.from(new Set(objectives.map((item) => item.owner).filter(Boolean)))], [objectives]);

  const enriched = useMemo(() => objectives.map((item) => {
    const linked = goals.filter((goal) => goal.parentObjectiveId === item.id);
    const departments = new Set(linked.map((goal) => goal.department).filter(Boolean)).size;
    const pct = progressPct(item);
    const status = deriveStatus(item);
    return {
      item,
      actual: actualValue(item),
      pct,
      status,
      alignedDepartments: departments,
      alignedGoals: linked.length,
      lastUpdate: item.scoredAt || item.publishedAt || '',
    };
  }), [objectives, goals]);

  const filtered = useMemo(() => enriched.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.item.code} ${row.item.title} ${row.item.strategicPillar} ${row.item.owner}`.toLowerCase().includes(q)) return false;
    if (statusFilter !== 'All statuses' && row.status !== statusFilter) return false;
    if (pillarFilter !== 'All pillars' && row.item.strategicPillar !== pillarFilter) return false;
    if (ownerFilter !== 'All owners' && row.item.owner !== ownerFilter) return false;
    return true;
  }), [enriched, query, statusFilter, pillarFilter, ownerFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalWeight = objectives.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const remainingWeight = Math.max(0, Math.round((100 - totalWeight) * 10) / 10);
  const onTrack = enriched.filter((row) => row.status === 'On Track').length;
  const atRisk = enriched.filter((row) => row.status === 'At Risk').length;
  const awaitingScore = enriched.filter((row) => row.item.status === 'Published' && row.item.corporateAchievement == null).length;
  const alignedGoalCount = goals.filter((goal) => Boolean(goal.parentObjectiveId)).length;
  const alignmentCoverage = goals.length ? Math.round((alignedGoalCount / goals.length) * 100) : 0;
  const ownersAssigned = objectives.filter((item) => Boolean(item.owner)).length;
  const published = objectives.some((item) => ['Published', 'Scored', 'Locked'].includes(item.status));
  const maxVersion = Math.max(1, ...objectives.map((item) => item.version || 1));
  const setStatusLabel = published ? 'Published' : objectives.some((item) => item.status === 'Pending Approval') ? 'Pending Approval' : 'Draft';

  const closeCreate = () => {
    setCreating(false);
    setOwnerPickerOpen(false);
    setOwnerQuery('');
    setFormError('');
    setForm(emptyForm());
  };

  const openCreate = () => {
    const suggestedWeight = remainingWeight > 0 ? String(Math.min(10, remainingWeight)) : '10';
    setForm({
      ...emptyForm(),
      code: nextObjectiveCode(objectives),
      weight: suggestedWeight,
    });
    setOwnerQuery('');
    setFormError('');
    setOwnerPickerOpen(false);
    setCreating(true);
  };

  const selectOwner = (row: { employeeId: string; fullName: string }) => {
    setForm((current) => ({ ...current, owner: row.fullName, ownerId: row.employeeId }));
    setOwnerQuery(row.fullName);
    setOwnerPickerOpen(false);
  };

  const createObjective = async () => {
    const title = form.title.trim();
    const code = form.code.trim();
    const kpi = form.kpi.trim();
    const owner = form.owner.trim();
    const strategicPillar = form.strategicPillar.trim();
    const weight = Number(form.weight);
    const target = Number(form.target);
    const baseline = Number(form.baseline || 0);

    if (!cycleId && !activeCycle?.id) {
      setFormError('Select an active performance cycle first.');
      return;
    }
    if (!code) {
      setFormError('Objective code is required.');
      return;
    }
    if (objectives.some((row) => row.code.toLowerCase() === code.toLowerCase())) {
      setFormError(`Code ${code} already exists in this cycle.`);
      return;
    }
    if (!title) {
      setFormError('Title is required.');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      setFormError('Weight must be between 1 and 100.');
      return;
    }
    if (totalWeight + weight > 100) {
      setFormError(`Weight exceeds remaining budget (${remainingWeight}%).`);
      return;
    }
    if (!kpi) {
      setFormError('KPI is required.');
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setFormError('Target must be a positive number.');
      return;
    }
    if (!owner) {
      setFormError('Select an owner from the HRIS eligibility directory.');
      return;
    }
    if (!strategicPillar) {
      setFormError('Strategic pillar is required.');
      return;
    }

    setFormError('');
    try {
      await onAction('company-objective.upsert', {
        cycleId: cycleId || activeCycle?.id,
        code,
        title,
        description: form.description.trim(),
        weight,
        kpi,
        baseline,
        target,
        unit: form.unit.trim() || '%',
        owner,
        strategicPillar,
      });
      closeCreate();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save objective.');
    }
  };

  const setOwnerLabel = objectives.find((item) => Boolean(item.owner))?.owner
    || activeCycle?.createdBy
    || payload.actor.fullName
    || '—';

  const cascadeByObjective = useMemo(() => objectives.map((item) => {
    const linked = goals.filter((goal) => goal.parentObjectiveId === item.id);
    const departments = Array.from(new Set(linked.map((goal) => goal.department).filter(Boolean)));
    return { item, linked, departments };
  }), [objectives, goals]);

  const pendingApproval = objectives.filter((item) => item.status === 'Draft' || item.status === 'Pending Approval');
  const publishedObjectives = objectives.filter((item) => ['Published', 'Scored', 'Locked'].includes(item.status));
  const scoredObjectives = objectives.filter((item) => item.corporateAchievement != null || item.status === 'Locked' || item.status === 'Scored');

  const objectiveRegister = (
    <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
        <h3 className="mr-auto text-sm font-bold text-[#101828]">Objective Register</h3>
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
          <Search className="h-3.5 w-3.5 text-[#667085]" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search objectives..."
            className="w-full border-0 bg-transparent text-[11px] outline-none"
          />
        </label>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
          <option>All statuses</option>
          <option>On Track</option>
          <option>At Risk</option>
          <option>Awaiting Score</option>
          <option>Draft</option>
        </select>
        <select value={pillarFilter} onChange={(e) => { setPillarFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
          {pillars.map((item) => <option key={item} value={item}>{item === 'All pillars' ? 'Strategic Pillar' : item}</option>)}
        </select>
        <select value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
          {owners.map((item) => <option key={item} value={item}>{item === 'All owners' ? 'Owner' : item}</option>)}
        </select>
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[1.7fr_1fr_0.45fr_1.1fr_0.55fr_0.7fr_1fr_0.7fr_0.7fr] items-center border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
            <span>Code & Objective</span>
            <span>Owner</span>
            <span>Weight</span>
            <span>Actual vs Target</span>
            <span>Progress %</span>
            <span>Status</span>
            <span>Aligned</span>
            <span>Last Update</span>
            <span>Actions</span>
          </div>
          {rows.map((row) => (
            <div key={row.item.id} className="grid grid-cols-[1.7fr_1fr_0.45fr_1.1fr_0.55fr_0.7fr_1fr_0.7fr_0.7fr] items-center border-b border-[#eaecf0] px-3 py-3">
              <div className="min-w-0 pr-2">
                <p className="text-[10px] font-bold text-[#1570ef]">{row.item.code}</p>
                <p className="mt-0.5 truncate text-[12px] font-bold text-[#101828]">{row.item.title}</p>
                <span className="mt-1 inline-flex rounded border border-[#eaecf0] bg-[#f9fafb] px-1.5 py-0.5 text-[9px] font-semibold text-[#475467]">{row.item.strategicPillar || 'General'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{initials(row.item.owner)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-[#101828]">{row.item.owner}</p>
                  <p className="truncate text-[9px] text-[#667085]">Objective owner</p>
                </div>
              </div>
              <p className="text-[11px] font-bold">{row.item.weight}%</p>
              <div>
                <div className="mb-1 flex justify-between text-[9px] font-semibold text-[#475467]">
                  <span>{row.actual} / {row.item.target}{row.item.unit ? ` ${row.item.unit}` : ''}</span>
                  <span>{row.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#f2f4f7]">
                  <div className={`h-full rounded-full ${row.status === 'At Risk' ? 'bg-[#f79009]' : 'bg-[#1570ef]'}`} style={{ width: `${row.pct}%` }} />
                </div>
              </div>
              <p className="text-[11px] font-bold">{row.pct}%</p>
              <StatusPill status={row.status} />
              <p className="text-[10px] font-semibold text-[#475467]">{row.alignedDepartments} depts / {row.alignedGoals} goals</p>
              <p className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.lastUpdate)}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => { setDrawer(row.item); setScoreDraft(row.item.corporateAchievement != null ? String(row.item.corporateAchievement) : ''); }} className="h-8 rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold text-[#344054]">
                  Open
                </button>
                <button type="button" className="p-1 text-[#667085]" aria-label="More actions"><MoreVertical className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {!rows.length ? (
            <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No company objectives for this cycle.</div>
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
          <span className="grid h-7 w-7 place-items-center rounded bg-[#1570ef] text-white">{page}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-7 w-7 place-items-center rounded border border-[#eaecf0] disabled:opacity-40">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-4 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#101828]">Company Objectives</h1>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Define, align, monitor and govern enterprise objectives.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cycleId}
            onChange={(e) => { setCycleId(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]"
          >
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
            ))}
            {!cycles.length ? <option value="">No cycles</option> : null}
          </select>
          {isHrScope ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => openCreate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Create Objective
            </button>
          ) : null}
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] bg-white px-3 text-[11px] font-semibold text-[#344054]">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-[#d0d5dd] bg-white text-[#667085]" aria-label="More">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

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
          <section className="overflow-hidden rounded-xl border border-[#b2ddff] bg-[#f5faff]">
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-[#101828]">{activeCycle ? `${activeCycle.name.replace(/Performance Cycle/i, '').trim() || activeCycle.name} Objective Set` : 'Objective Set'}</h2>
                  <span className="rounded-full border border-[#abefc6] bg-[#ecfdf3] px-2 py-0.5 text-[9px] font-semibold text-[#027a48]">{setStatusLabel}</span>
                  {activeCycle && !['Closed', 'Archived', 'Draft'].includes(activeCycle.status) ? (
                    <span className="rounded-full border border-[#b2ddff] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#175cd3]">Active</span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Duration', activeCycle ? `${safeFmtDate(activeCycle.startDate)} – ${safeFmtDate(activeCycle.endDate)}` : '—'],
                    ['Owner', setOwnerLabel],
                    ['Version', `v${maxVersion}.0`],
                    ['Next Review', activeCycle?.midYearStart ? safeFmtDate(activeCycle.midYearStart) : activeCycle?.goalSettingEnd ? safeFmtDate(activeCycle.goalSettingEnd) : '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] font-medium text-[#667085]">{label}</p>
                      <p className="mt-1 text-[11px] font-bold text-[#101828]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!objectives.length}
                onClick={() => setDrawer(objectives[0] || null)}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#84caff] bg-white px-3 text-[11px] font-semibold text-[#175cd3] disabled:opacity-50"
              >
                Review objective set <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[#d1e9ff] bg-white/70 px-4 py-2.5">
              {[
                [`Weights ${totalWeight}%`, totalWeight === 100],
                [`${ownersAssigned}/${objectives.length || 0} owners assigned`, ownersAssigned === objectives.length && objectives.length > 0],
                ['KPIs validated', objectives.every((item) => Boolean(item.kpi))],
                ['Approval completed', published],
              ].map(([label, ok]) => (
                <span key={String(label)} className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${ok ? 'text-[#027a48]' : 'text-[#b54708]'}`}>
                  {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {label}
                </span>
              ))}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { icon: Target, label: 'Total Objectives', value: String(objectives.length), delta: 'No change', tone: 'blue' as const },
              { icon: Scale, label: 'Total Weight', value: `${totalWeight}%`, delta: totalWeight === 100 ? 'Balanced' : 'Needs balance', tone: 'blue' as const },
              { icon: Network, label: 'Alignment Coverage', value: `${alignmentCoverage}%`, delta: alignedGoalCount ? `${alignedGoalCount} goals linked` : 'No links yet', tone: 'blue' as const },
              { icon: TrendingUp, label: 'On Track', value: String(onTrack), delta: onTrack ? `↑ ${onTrack} current` : 'No change', tone: 'green' as const },
              { icon: AlertTriangle, label: 'At Risk', value: String(atRisk), delta: atRisk ? 'Needs attention' : 'No change', tone: 'orange' as const },
              { icon: ClipboardList, label: 'Score Awaiting Review', value: String(awaitingScore), delta: awaitingScore ? `↑ ${awaitingScore}` : 'Clear', tone: 'blue' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    kpi.tone === 'orange' ? 'bg-[#fff6ed] text-[#dc6803]' : kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]' : 'bg-[#eff8ff] text-[#1570ef]'
                  }`}>
                    <kpi.icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-[#101828]">{kpi.value}</p>
                <p className={`mt-1 text-[10px] font-semibold ${kpi.tone === 'orange' && atRisk ? 'text-[#dc6803]' : 'text-[#667085]'}`}>{kpi.delta}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 wide:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              {objectiveRegister}

              <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold">Objective Performance Snapshot</h3>
                    <div className="flex items-center gap-3 text-[10px] font-semibold text-[#667085]">
                      <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#1570ef]" /> Actual</span>
                      <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#d0d5dd]" /> Remaining to Target</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {enriched.slice(0, 6).map((row) => (
                      <div key={row.item.id}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate font-semibold text-[#344054]">{row.item.code} · {row.item.title}</span>
                          <span className="shrink-0 font-bold text-[#101828]">{row.pct}%</span>
                        </div>
                        <div className="flex h-3 overflow-hidden rounded-md bg-[#f2f4f7]">
                          <div className="h-full bg-[#1570ef]" style={{ width: `${row.pct}%` }} />
                          <div className="h-full bg-[#d0d5dd]" style={{ width: `${100 - row.pct}%` }} />
                        </div>
                      </div>
                    ))}
                    {!enriched.length ? <p className="text-sm font-semibold text-[#98a2b3]">No objectives to chart.</p> : null}
                  </div>
                </section>

                <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-bold">Governed Actions</h3>
                  <div className="space-y-2">
                    {(
                      [
                        { label: 'Open Objective', action: () => setDrawer(objectives[0] || null) },
                        { label: 'Submit Progress Update', action: () => setActiveTab('Progress Updates') },
                        { label: 'Review Score', action: () => setActiveTab('Scoring') },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.action}
                        className="flex h-11 w-full items-center justify-between rounded-lg border border-[#d0d5dd] px-3 text-[12px] font-semibold text-[#344054] hover:border-[#84caff] hover:bg-[#f5faff]"
                      >
                        {item.label}
                        <ChevronRight className="h-4 w-4 text-[#1570ef]" />
                      </button>
                    ))}
                    {isHrScope ? (
                      <button
                        type="button"
                        disabled={busy || !cycleId || totalWeight !== 100}
                        onClick={() => void onAction('company-objective.publish', { cycleId })}
                        className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-[#1570ef] text-[12px] font-semibold text-white disabled:opacity-50"
                      >
                        Publish objective set
                      </button>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Publication & Weight Readiness</h3>
                <Donut value={Math.min(100, totalWeight === 100 ? 100 : Math.round((totalWeight / 100) * 100))} color="#12b76a" label="Ready" />
                <ul className="mt-3 space-y-2 text-[11px]">
                  {[
                    [`Weights total ${totalWeight}%`, totalWeight === 100],
                    [`Owners ${ownersAssigned}/${objectives.length || 0}`, ownersAssigned === objectives.length && objectives.length > 0],
                    ['Set published', published],
                  ].map(([label, ok]) => (
                    <li key={String(label)} className="flex items-center justify-between gap-2 border-t border-[#eaecf0] py-2">
                      <span className="text-[#475467]">{label}</span>
                      {ok ? <CheckCircle2 className="h-4 w-4 text-[#12b76a]" /> : <AlertTriangle className="h-4 w-4 text-[#f79009]" />}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Alignment Health</h3>
                <Donut value={alignmentCoverage} color="#7a5af8" label="Cascaded" />
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-[#f9fafb] p-2">
                    <p className="text-lg font-bold text-[#101828]">{new Set(goals.map((g) => g.department).filter(Boolean)).size}</p>
                    <p className="text-[9px] font-semibold text-[#667085]">Aligned Depts</p>
                  </div>
                  <div className="rounded-lg bg-[#f9fafb] p-2">
                    <p className="text-lg font-bold text-[#101828]">{alignedGoalCount}</p>
                    <p className="text-[9px] font-semibold text-[#667085]">Downstream Goals</p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[#f9dbaf] bg-[#fffaf5] p-4">
                <h3 className="mb-2 text-sm font-bold text-[#9a3412]">Attention Required</h3>
                <ul className="space-y-2 text-[11px] font-semibold text-[#9a3412]">
                  <li className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {atRisk} objective{atRisk === 1 ? '' : 's'} at risk</li>
                  <li className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {awaitingScore} score{awaitingScore === 1 ? '' : 's'} awaiting review</li>
                  <li className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {totalWeight === 100 ? 'Weights balanced' : `Weights total ${totalWeight}% (need 100%)`}</li>
                </ul>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Upcoming Governance Dates</h3>
                {[
                  [activeCycle?.goalSettingEnd, 'Progress update due'],
                  [activeCycle?.midYearStart, 'Mid-year objective review'],
                  [activeCycle?.endDate, 'Final scoring window'],
                ].filter(([date]) => Boolean(date)).map(([date, title]) => (
                  <div key={String(title)} className="flex items-center gap-2 border-t border-[#eaecf0] py-2.5 text-[11px]">
                    <CalendarDays className="h-3.5 w-3.5 text-[#1570ef]" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[#101828]">{title}</p>
                      <p className="text-[10px] text-[#667085]">{safeFmtDate(String(date))}</p>
                    </div>
                  </div>
                ))}
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {activeTab === 'Objectives' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Objective catalogue</h3>
                <p className="mt-1 text-[11px] font-medium text-[#667085]">Maintain the corporate objective register for {activeCycle?.name || 'this cycle'}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${totalWeight === 100 ? 'border-[#abefc6] bg-[#ecfdf3] text-[#027a48]' : 'border-[#fedf89] bg-[#fffaeb] text-[#b54708]'}`}>
                  Weights {totalWeight}%
                </span>
                {isHrScope ? (
                  <button type="button" disabled={busy} onClick={() => openCreate()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" /> Create Objective
                  </button>
                ) : null}
              </div>
            </div>
          </section>
          {objectiveRegister}
        </div>
      ) : null}

      {activeTab === 'Alignment & Cascading' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Alignment coverage', `${alignmentCoverage}%`],
              ['Downstream goals', String(alignedGoalCount)],
              ['Departments cascaded', String(new Set(goals.map((g) => g.department).filter(Boolean)).size)],
            ].map(([label, value]) => (
              <article key={label} className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold text-[#667085]">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
              </article>
            ))}
          </div>
          <div className="space-y-3">
            {cascadeByObjective.map(({ item, linked, departments }) => (
              <section key={item.id} className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-[#1570ef]">{item.code}</p>
                    <h3 className="mt-1 text-sm font-bold">{item.title}</h3>
                    <p className="mt-1 text-[11px] font-semibold text-[#667085]">{item.strategicPillar} · Weight {item.weight}%</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#eaecf0] bg-[#f9fafb] px-2 py-0.5 text-[10px] font-semibold text-[#475467]">{departments.length} depts</span>
                    <span className="rounded-full border border-[#b2ddff] bg-[#eff8ff] px-2 py-0.5 text-[10px] font-semibold text-[#175cd3]">{linked.length} goals</span>
                  </div>
                </div>
                {linked.length ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-[11px]">
                      <thead className="bg-[#f9fafb] text-[#667085]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Employee / Goal</th>
                          <th className="px-3 py-2 font-semibold">Department</th>
                          <th className="px-3 py-2 font-semibold">Weight</th>
                          <th className="px-3 py-2 font-semibold">Progress</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linked.map((goal) => (
                          <tr key={goal.id} className="border-t border-[#eaecf0]">
                            <td className="px-3 py-2.5">
                              <p className="font-bold text-[#101828]">{goal.employeeName}</p>
                              <p className="text-[10px] font-medium text-[#667085]">{goal.title}</p>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-[#475467]">{goal.department || '—'}</td>
                            <td className="px-3 py-2.5 font-semibold">{goal.weight}%</td>
                            <td className="px-3 py-2.5 font-semibold">{goal.progressPercent}%</td>
                            <td className="px-3 py-2.5"><span className="rounded-full border border-[#eaecf0] bg-[#f9fafb] px-2 py-0.5 text-[10px] font-semibold">{goal.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-dashed border-[#eaecf0] bg-[#f8fafc] px-3 py-4 text-[11px] font-semibold text-[#98a2b3]">No cascaded goals linked yet. Assign employee goals under this objective from Goal Cascading or OKR & KPI Management.</p>
                )}
              </section>
            ))}
            {!cascadeByObjective.length ? (
              <p className="rounded-xl border border-dashed border-[#eaecf0] bg-[#f8fafc] px-4 py-10 text-center text-sm font-semibold text-[#98a2b3]">
                No company objectives yet. Create objectives, then cascade employee goals from Goal Cascading / OKR Management.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'Progress Updates' ? (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold">Corporate progress updates</h3>
            <p className="mt-1 text-[11px] font-medium text-[#667085]">Capture interim actuals against each published objective KPI.</p>
            <div className="mt-4 space-y-3">
              {objectives.map((item) => {
                const canScore = isHrScope && (item.status === 'Published' || item.status === 'Scored');
                const draft = progressDrafts[item.id] ?? (item.corporateAchievement != null ? String(item.corporateAchievement) : '');
                return (
                  <article key={item.id} className="rounded-xl border border-[#eaecf0] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold text-[#1570ef]">{item.code}</p>
                        <h4 className="text-[12px] font-bold">{item.title}</h4>
                        <p className="mt-1 text-[10px] font-semibold text-[#667085]">{item.kpi} · Target {item.target}{item.unit}</p>
                      </div>
                      <StatusPill status={deriveStatus(item)} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="min-w-[140px] flex-1 text-[10px] font-semibold text-[#344054]">
                        Actual / achievement
                        <input
                          className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-[11px]"
                          value={draft}
                          disabled={!canScore}
                          onChange={(e) => setProgressDrafts((current) => ({ ...current, [item.id]: e.target.value }))}
                          placeholder={String(item.baseline || 0)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy || !canScore}
                        onClick={() => void onAction('company-objective.score', { id: item.id, corporateAchievement: Number(draft || 0) })}
                        className="inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        Save update
                      </button>
                    </div>
                    {!canScore ? <p className="mt-2 text-[10px] font-semibold text-[#b54708]">Publish the objective set before locking progress scores.</p> : null}
                  </article>
                );
              })}
              {!objectives.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No objectives available.</p> : null}
            </div>
          </section>
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold">Recent check-ins</h3>
            <p className="mt-1 text-[11px] font-medium text-[#667085]">Team progress signals feeding corporate monitoring.</p>
            <div className="mt-4 space-y-2">
              {checkIns.map((row) => (
                <div key={row.id} className="rounded-lg border border-[#eaecf0] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold">{row.employeeName}</p>
                    <span className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.date)}</span>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-[#475467]">{row.progressPercent}% · {row.status}</p>
                  {row.sharedNotes ? <p className="mt-1 text-[10px] font-medium text-[#667085] line-clamp-2">{row.sharedNotes}</p> : null}
                </div>
              ))}
              {!checkIns.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No check-ins recorded for this cycle.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'Scoring' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">Corporate scoring</h3>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">Lock achievement scores that feed final result computation.</p>
            </div>
            <span className="rounded-full border border-[#eaecf0] bg-[#f9fafb] px-2.5 py-1 text-[10px] font-semibold text-[#475467]">
              {scoredObjectives.length}/{objectives.length} scored
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-[#f9fafb] text-[#667085]">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Objective</th>
                  <th className="px-3 py-2.5 font-semibold">Weight</th>
                  <th className="px-3 py-2.5 font-semibold">KPI / Target</th>
                  <th className="px-3 py-2.5 font-semibold">Achievement</th>
                  <th className="px-3 py-2.5 font-semibold">Lifecycle</th>
                  <th className="px-3 py-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {objectives.map((item) => {
                  const canScore = isHrScope && (item.status === 'Published' || item.status === 'Scored');
                  const draft = scoreDrafts[item.id] ?? (item.corporateAchievement != null ? String(item.corporateAchievement) : '');
                  return (
                    <tr key={item.id} className="border-t border-[#eaecf0]">
                      <td className="px-3 py-3">
                        <p className="font-bold text-[#101828]">{item.code}</p>
                        <p className="text-[10px] font-medium text-[#667085]">{item.title}</p>
                      </td>
                      <td className="px-3 py-3 font-semibold">{item.weight}%</td>
                      <td className="px-3 py-3 font-semibold text-[#475467]">{item.kpi} · {item.target}{item.unit}</td>
                      <td className="px-3 py-3">
                        <input
                          className="h-9 w-28 rounded-lg border border-[#d0d5dd] px-2 text-[11px]"
                          value={draft}
                          disabled={!canScore}
                          onChange={(e) => setScoreDrafts((current) => ({ ...current, [item.id]: e.target.value }))}
                        />
                      </td>
                      <td className="px-3 py-3"><span className="rounded-full border border-[#eaecf0] bg-[#f9fafb] px-2 py-0.5 text-[10px] font-semibold">{item.status}</span></td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={busy || !canScore}
                          onClick={() => void onAction('company-objective.score', { id: item.id, corporateAchievement: Number(draft || 0) })}
                          className="inline-flex h-8 items-center rounded-lg bg-[#1570ef] px-2.5 text-[10px] font-semibold text-white disabled:opacity-50"
                        >
                          Lock score
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!objectives.length ? <p className="px-3 py-10 text-center text-[11px] font-semibold text-[#98a2b3]">No objectives to score.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Approvals' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Objective set approval</h3>
                <p className="mt-1 text-[11px] font-medium text-[#667085]">Validate weights, ownership and KPI completeness before publication.</p>
              </div>
              {isHrScope ? (
                <button
                  type="button"
                  disabled={busy || !cycleId || totalWeight !== 100 || !objectives.length}
                  onClick={() => void onAction('company-objective.publish', { cycleId })}
                  className="inline-flex h-9 items-center rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  Publish objective set
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [`Weights ${totalWeight}%`, totalWeight === 100],
                [`Owners ${ownersAssigned}/${objectives.length || 0}`, ownersAssigned === objectives.length && objectives.length > 0],
                ['KPIs validated', objectives.every((item) => Boolean(item.kpi))],
                ['Already published', published],
              ].map(([label, ok]) => (
                <div key={String(label)} className={`rounded-lg border px-3 py-3 text-[11px] font-semibold ${ok ? 'border-[#abefc6] bg-[#ecfdf3] text-[#027a48]' : 'border-[#fedf89] bg-[#fffaeb] text-[#b54708]'}`}>
                  <span className="inline-flex items-center gap-1.5">{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{label}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold">Pending approval ({pendingApproval.length})</h3>
              <div className="mt-3 space-y-2">
                {pendingApproval.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                    <div>
                      <p className="font-bold">{item.code} · {item.title}</p>
                      <p className="text-[10px] font-semibold text-[#667085]">{item.owner} · {item.weight}%</p>
                    </div>
                    <span className="rounded-full border border-[#fedf89] bg-[#fffaeb] px-2 py-0.5 text-[10px] font-semibold text-[#b54708]">{item.status}</span>
                  </div>
                ))}
                {!pendingApproval.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No draft objectives awaiting approval.</p> : null}
              </div>
            </section>
            <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold">Published ({publishedObjectives.length})</h3>
              <div className="mt-3 space-y-2">
                {publishedObjectives.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                    <div>
                      <p className="font-bold">{item.code} · {item.title}</p>
                      <p className="text-[10px] font-semibold text-[#667085]">Approved by {item.approvedBy || '—'} · {safeFmtDate(item.publishedAt)}</p>
                    </div>
                    <span className="rounded-full border border-[#abefc6] bg-[#ecfdf3] px-2 py-0.5 text-[10px] font-semibold text-[#027a48]">{item.status}</span>
                  </div>
                ))}
                {!publishedObjectives.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No published objectives yet.</p> : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === 'Versions & Changes' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Versions & changes</h3>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Objective set currently at v{maxVersion}.0 for {activeCycle?.name || 'the active cycle'}.</p>
          <div className="mt-4 space-y-3">
            {objectives.map((item) => (
              <article key={item.id} className="rounded-xl border border-[#eaecf0] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-bold">{item.code} · {item.title}</p>
                    <p className="text-[10px] font-semibold text-[#667085]">v{item.version}.0 · {item.status} · Weight {item.weight}%</p>
                  </div>
                  <button type="button" onClick={() => setDrawer(item)} className="inline-flex h-8 items-center rounded-lg border border-[#d0d5dd] px-2.5 text-[10px] font-semibold">Open</button>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-3 text-[10px] font-semibold text-[#475467]">
                  <div><dt className="text-[#98a2b3]">Created by</dt><dd>{item.createdBy}</dd></div>
                  <div><dt className="text-[#98a2b3]">Published</dt><dd>{safeFmtDate(item.publishedAt)}</dd></div>
                  <div><dt className="text-[#98a2b3]">Scored</dt><dd>{safeFmtDate(item.scoredAt)}{item.scoredBy ? ` · ${item.scoredBy}` : ''}</dd></div>
                </dl>
              </article>
            ))}
            {!objectives.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No version history yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Audit' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">Audit</h3>
          <p className="mt-1 text-[11px] font-medium text-[#667085]">Governed actions against company objectives.</p>
          <div className="mt-4 space-y-2">
            {objectiveAudit.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#eaecf0] px-3 py-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{row.action}</p>
                  <span className="text-[10px] font-semibold text-[#667085]">{safeFmtDate(row.at)}</span>
                </div>
                <p className="mt-1 font-semibold text-[#475467]">{row.actor} · {row.actorRole} · {row.entityId}</p>
                {row.after ? <p className="mt-1 text-[10px] font-semibold text-[#667085]">{row.after}</p> : null}
              </div>
            ))}
            {!objectiveAudit.length ? <p className="text-[11px] font-semibold text-[#98a2b3]">No company objective audit events yet.</p> : null}
          </div>
        </section>
      ) : null}

      {creating ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close create dialog" onClick={closeCreate} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(520px,94vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#101828]">Create Objective</h2>
                <p className="mt-1 text-xs text-[#667085]">
                  Add a corporate objective to {activeCycle?.name || 'the selected cycle'}. Remaining weight budget: {remainingWeight}%.
                </p>
              </div>
              <button type="button" onClick={closeCreate} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold text-[#344054]">
                  Code
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="CO-REV-01"
                  />
                </label>
                <label className="text-[11px] font-semibold text-[#344054]">
                  Weight %
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm"
                    value={form.weight}
                    onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                    inputMode="decimal"
                    placeholder="10"
                  />
                </label>
              </div>

              <label className="text-[11px] font-semibold text-[#344054]">
                Title
                <input
                  className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Improve customer satisfaction"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold text-[#344054]">
                  KPI
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm"
                    value={form.kpi}
                    onChange={(e) => setForm((f) => ({ ...f, kpi: e.target.value }))}
                    placeholder="e.g. CSAT score"
                  />
                </label>
                <label className="text-[11px] font-semibold text-[#344054]">
                  Target
                  <input
                    className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm"
                    value={form.target}
                    onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                    inputMode="decimal"
                    placeholder="100"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-[11px] font-semibold text-[#344054]">
                    Owner
                    <div className="relative mt-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#98a2b3]" />
                      <input
                        className="h-9 w-full rounded-lg border border-[#d0d5dd] py-2 pl-9 pr-3 text-sm"
                        value={ownerQuery}
                        placeholder={ownerDirectory.length ? 'Search HRIS employee…' : 'No eligible employees'}
                        onFocus={() => setOwnerPickerOpen(true)}
                        onChange={(e) => {
                          setOwnerQuery(e.target.value);
                          setOwnerPickerOpen(true);
                          setForm((f) => ({ ...f, owner: '', ownerId: '' }));
                        }}
                        onBlur={() => {
                          window.setTimeout(() => setOwnerPickerOpen(false), 150);
                        }}
                      />
                    </div>
                  </label>
                  {ownerPickerOpen ? (
                    <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-[#eaecf0] bg-white shadow-lg">
                      {filteredOwners.map((row) => (
                        <button
                          key={`${row.employeeId}-${row.employeeCode}`}
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 border-b border-[#f2f4f7] px-3 py-2 text-left hover:bg-[#f9fafb]"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectOwner(row)}
                        >
                          <span className="text-[12px] font-bold text-[#101828]">{row.fullName}</span>
                          <span className="text-[10px] font-semibold text-[#667085]">
                            {row.employeeCode || row.employeeId}
                            {row.department ? ` · ${row.department}` : ''}
                            {row.jobTitle ? ` · ${row.jobTitle}` : ''}
                          </span>
                        </button>
                      ))}
                      {!filteredOwners.length ? (
                        <p className="px-3 py-4 text-[11px] font-semibold text-[#667085]">
                          {ownerDirectory.length
                            ? 'No employees match that search.'
                            : 'No eligible employees in this cycle. Refresh eligibility from HRIS first.'}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {form.owner ? (
                    <p className="mt-1 text-[10px] font-semibold text-[#027a48]">Selected: {form.owner}</p>
                  ) : null}
                </div>

                <label className="text-[11px] font-semibold text-[#344054]">
                  Strategic pillar
                  <select
                    className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm"
                    value={form.strategicPillar}
                    onChange={(e) => setForm((f) => ({ ...f, strategicPillar: e.target.value }))}
                  >
                    <option value="">Select pillar</option>
                    {pillarOptions.map((pillar) => (
                      <option key={pillar} value={pillar}>{pillar}</option>
                    ))}
                  </select>
                </label>
              </div>

              {formError ? (
                <p className="rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[11px] font-semibold text-[#b42318]">{formError}</p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeCreate} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold text-[#344054]">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createObjective()}
                className="h-9 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save objective
              </button>
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
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#1570ef]">{drawer.code}</p>
                <h2 className="mt-1 text-xl font-bold">{drawer.title}</h2>
                <p className="mt-1 text-sm text-[#667085]">{drawer.strategicPillar} · Weight {drawer.weight}%</p>
              </div>
              <button type="button" onClick={() => setDrawer(null)} className="grid h-9 w-9 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <StatusPill status={deriveStatus(drawer)} />
              <dl className="mt-5">
                {[
                  ['Owner', drawer.owner],
                  ['KPI', drawer.kpi],
                  ['Baseline', `${drawer.baseline}${drawer.unit}`],
                  ['Target', `${drawer.target}${drawer.unit}`],
                  ['Actual', `${actualValue(drawer)}${drawer.unit}`],
                  ['Progress', `${progressPct(drawer)}%`],
                  ['Status', drawer.status],
                  ['Version', `v${drawer.version}.0`],
                ].map(([dt, dd]) => (
                  <div key={dt} className="flex items-center justify-between border-b border-[#eaecf0] py-3 text-sm">
                    <dt className="text-[#667085]">{dt}</dt>
                    <dd className="font-semibold text-[#101828]">{dd}</dd>
                  </div>
                ))}
              </dl>
              {isHrScope && (drawer.status === 'Published' || drawer.status === 'Scored') ? (
                <div className="mt-5 rounded-xl border border-[#d1e9ff] bg-[#f5faff] p-4">
                  <h3 className="text-sm font-bold">Lock corporate achievement</h3>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="h-10 flex-1 rounded-lg border border-[#d0d5dd] px-3 text-sm"
                      placeholder="Achievement score"
                      value={scoreDraft}
                      onChange={(e) => setScoreDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAction('company-objective.score', { id: drawer.id, corporateAchievement: Number(scoreDraft || 0) })}
                      className="h-10 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Lock score
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
