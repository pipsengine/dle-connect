'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Filter,
  ListChecks,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { CompetencyIndicator, PerformanceWorkspacePayload } from '@/lib/performance-domain-types';
import { fmtDate, fmtDateTime } from './performance-management-ui';

type Props = {
  payload: PerformanceWorkspacePayload;
  onAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  busy?: boolean;
};

const TABS = [
  'Overview',
  'Competency Library',
  'Framework Builder',
  'Role Mapping',
  'Proficiency Levels',
  'Versions & Approvals',
  'Audit History',
] as const;

type TabId = (typeof TABS)[number];
type CompetencyStatus = NonNullable<CompetencyIndicator['status']>;
type CompetencyType = NonNullable<CompetencyIndicator['type']>;

const FAMILY_TONES: Record<string, string> = {
  Leadership: 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]',
  'Core Values': 'bg-[#f4f3ff] text-[#5925dc] border-[#d9d6fe]',
  Technical: 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]',
  Functional: 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]',
  'HSE & Compliance': 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]',
  Digital: 'bg-[#f0f9ff] text-[#026aa2] border-[#b9e6fe]',
  Operations: 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]',
  Commercial: 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]',
};

const inferType = (category: string, explicit?: CompetencyType): CompetencyType => {
  if (explicit) return explicit;
  const key = category.toLowerCase();
  if (key.includes('tech') || key.includes('ops') || key.includes('digital')) return 'Technical';
  if (key.includes('commercial') || key.includes('finance') || key.includes('functional')) return 'Functional';
  if (key.includes('core') || key.includes('value') || key.includes('hse') || key.includes('compliance')) return 'Core';
  return 'Behavioural';
};

const StatusPill = ({ status }: { status: string }) => {
  const key = status.toLowerCase();
  const style =
    key === 'active' || key === 'published'
      ? 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]'
      : key === 'draft'
        ? 'bg-[#fffaeb] text-[#b54708] border-[#fedf89]'
        : key === 'review' || key === 'pending'
          ? 'bg-[#f4f3ff] text-[#5925dc] border-[#d9d6fe]'
          : key === 'retired'
            ? 'bg-[#f8fafc] text-[#475467] border-[#e4e7ec]'
            : 'bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{status}</span>;
};

const emptyForm = () => ({
  name: '',
  code: '',
  category: 'Leadership',
  type: 'Behavioural' as CompetencyType,
  status: 'Draft' as CompetencyStatus,
  levels: '5',
  weight: '20',
  description: '',
  rolesMapped: '0',
});

export default function CompetencyFrameworkView({ payload, onAction, busy }: Props) {
  const domain = payload.domain;
  const isHrScope = payload.actor?.scope === 'global';
  const [activeTab, setActiveTab] = useState<TabId>('Overview');
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('All families');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CompetencyIndicator | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const pageSize = 5;

  const roleUniverse = useMemo(() => {
    const jobs = new Set(
      (domain.eligibility || [])
        .filter((row) => row.included)
        .map((row) => row.jobTitle || row.department)
        .filter(Boolean),
    );
    return Math.max(jobs.size, 1);
  }, [domain.eligibility]);

  const usageByCompetency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const assessment of domain.assessments || []) {
      for (const item of assessment.items || []) {
        if (item.itemType !== 'behaviour') continue;
        const set = map.get(item.itemId) || new Set<string>();
        set.add(assessment.employeeId || assessment.employeeName);
        map.set(item.itemId, set);
      }
    }
    return map;
  }, [domain.assessments]);

  const competencies = useMemo(() => {
    return (domain.config?.behaviourIndicators || []).map((item) => {
      const used = usageByCompetency.get(item.id)?.size || 0;
      const rolesMapped = item.rolesMapped != null ? Number(item.rolesMapped) : used;
      const levels = item.levels || Math.max(item.anchors?.length || 0, 5);
      const status = item.status || 'Active';
      const type = inferType(item.category, item.type);
      const coverage = Math.round((Math.min(rolesMapped, roleUniverse) / roleUniverse) * 100);
      return {
        ...item,
        type,
        status,
        levels,
        rolesMapped,
        coverage,
        updatedAt: item.updatedAt || '',
      };
    });
  }, [domain.config?.behaviourIndicators, usageByCompetency, roleUniverse]);

  const families = useMemo(
    () => ['All families', ...Array.from(new Set(competencies.map((item) => item.category).filter(Boolean))).sort()],
    [competencies],
  );
  const types = useMemo(
    () => ['All types', ...Array.from(new Set(competencies.map((item) => item.type).filter(Boolean))).sort()],
    [competencies],
  );

  const filtered = useMemo(() => competencies.filter((item) => {
    const q = query.trim().toLowerCase();
    if (q && !`${item.name} ${item.code || ''} ${item.category} ${item.type}`.toLowerCase().includes(q)) return false;
    if (familyFilter !== 'All families' && item.category !== familyFilter) return false;
    if (typeFilter !== 'All types' && item.type !== typeFilter) return false;
    if (statusFilter !== 'All statuses' && item.status !== statusFilter) return false;
    return true;
  }), [competencies, query, familyFilter, typeFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const total = competencies.length;
  const familyCount = families.length - 1;
  const mappedRoles = competencies.reduce((sum, item) => sum + Number(item.rolesMapped || 0), 0);
  const roleCoverage = Math.round((Math.min(mappedRoles, roleUniverse * total || 1) / Math.max(roleUniverse * Math.max(total, 1), 1)) * 100);
  const avgCoverage = total
    ? Math.round(competencies.reduce((sum, item) => sum + item.coverage, 0) / total)
    : 0;
  const mappingGaps = competencies.filter((item) => item.rolesMapped <= 0 || item.coverage < 85).length;
  const pendingApproval = competencies.filter((item) => item.status === 'Draft' || item.status === 'Review').length;
  const definitionsReview = competencies.filter((item) => item.status === 'Review' || !item.description).length;

  const familyCards = useMemo(() => {
    const map = new Map<string, { count: number; coverage: number }>();
    for (const item of competencies) {
      const current = map.get(item.category) || { count: 0, coverage: 0 };
      current.count += 1;
      current.coverage += item.coverage;
      map.set(item.category, current);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        count: value.count,
        coverage: value.count ? Math.round(value.coverage / value.count) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [competencies]);

  const gradeCoverage = useMemo(() => {
    const buckets = [
      { label: 'Executive', match: /director|executive|chief|gm|general manager/i },
      { label: 'Management', match: /manager|head|lead|supervisor/i },
      { label: 'Professional', match: /engineer|analyst|specialist|officer|consultant/i },
      { label: 'Technical', match: /technician|operator|artisan|welder|fitter/i },
      { label: 'Support', match: /admin|assistant|clerk|coordinator|support/i },
    ];
    const eligible = (domain.eligibility || []).filter((row) => row.included);
    return buckets.map((bucket) => {
      const roles = eligible.filter((row) => bucket.match.test(`${row.jobTitle} ${row.department}`));
      const totalRoles = roles.length || Math.max(1, Math.round(eligible.length / buckets.length));
      const mapped = Math.min(
        totalRoles,
        Math.round((avgCoverage / 100) * totalRoles),
      );
      const pct = Math.round((mapped / Math.max(totalRoles, 1)) * 100);
      return { label: bucket.label, pct, mapped, total: totalRoles };
    });
  }, [domain.eligibility, avgCoverage]);

  const auditRows = useMemo(
    () => (domain.audit || [])
      .filter((row) => row.entityType === 'CompetencyIndicator' || row.entityType === 'PerformanceConfig' || /competenc/i.test(row.action))
      .slice(0, 60),
    [domain.audit],
  );

  const createdEvents = auditRows.filter((row) => /created competency/i.test(row.action)).length;
  const versionMajor = 3;
  const versionMinor = Math.max(0, competencies.filter((item) => item.status === 'Active').length);
  const frameworkLabel = `Framework v${versionMajor}.${Math.min(versionMinor, 9)}`;
  const lastPublished = competencies
    .filter((item) => item.status === 'Active' && item.updatedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setCreating(true);
  };

  const openEdit = (item: typeof competencies[number]) => {
    setEditing(item);
    setForm({
      name: item.name,
      code: item.code || '',
      category: item.category || 'Leadership',
      type: item.type,
      status: item.status,
      levels: String(item.levels),
      weight: String(item.weight || 20),
      description: item.description || '',
      rolesMapped: String(item.rolesMapped || 0),
    });
    setFormError('');
    setCreating(true);
  };

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setFormError('');
    setForm(emptyForm());
  };

  const saveCompetency = async () => {
    if (!form.name.trim()) {
      setFormError('Competency name is required.');
      return;
    }
    if (!form.category.trim()) {
      setFormError('Family is required.');
      return;
    }
    const weight = Number(form.weight);
    const levels = Number(form.levels);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      setFormError('Weight must be between 1 and 100.');
      return;
    }
    if (!Number.isFinite(levels) || levels < 1 || levels > 5) {
      setFormError('Levels must be between 1 and 5.');
      return;
    }
    setFormError('');
    try {
      await onAction('competency.upsert', {
        id: editing?.id,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        category: form.category.trim(),
        type: form.type,
        status: form.status,
        levels,
        weight,
        description: form.description.trim(),
        rolesMapped: Number(form.rolesMapped || 0),
      });
      closeModal();
      setActiveTab('Competency Library');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save competency.');
    }
  };

  const RegisterTable = ({ title }: { title: string }) => (
    <section className="overflow-hidden rounded-xl border border-[#eaecf0] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#eaecf0] p-3 lg:flex-row lg:items-center">
        <div className="mr-auto flex items-center gap-2">
          <h3 className="text-sm font-bold text-[#101828]">{title}</h3>
          <Settings2 className="h-3.5 w-3.5 text-[#98a2b3]" />
        </div>
        <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[#d0d5dd] px-2.5 lg:max-w-xs">
          <Search className="h-3.5 w-3.5 text-[#667085]" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search competencies..."
            className="w-full border-0 bg-transparent text-[11px] outline-none"
          />
        </label>
        <select value={familyFilter} onChange={(e) => { setFamilyFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
          {families.map((item) => <option key={item} value={item}>{item === 'All families' ? 'Family' : item}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
          {types.map((item) => <option key={item} value={item}>{item === 'All types' ? 'Type' : item}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#d0d5dd] bg-white px-2 text-[11px]">
          <option>All statuses</option>
          <option>Active</option>
          <option>Draft</option>
          <option>Review</option>
          <option>Retired</option>
        </select>
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d0d5dd] px-3 text-[11px] font-semibold text-[#344054]">
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[1.5fr_1fr_0.9fr_0.7fr_0.8fr_0.7fr_0.8fr_0.8fr] border-b border-[#eaecf0] bg-[#f9fafb] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
            <span>Competency</span>
            <span>Family</span>
            <span>Type</span>
            <span>Levels</span>
            <span>Roles Mapped</span>
            <span>Status</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          {rows.map((item) => (
            <div key={item.id} className="grid grid-cols-[1.5fr_1fr_0.9fr_0.7fr_0.8fr_0.7fr_0.8fr_0.8fr] items-center border-b border-[#eaecf0] px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold text-[#101828]">{item.name}</p>
                <p className="truncate text-[9px] font-semibold text-[#667085]">{item.code || item.id}</p>
              </div>
              <p className="truncate text-[11px] font-semibold text-[#475467]">{item.category}</p>
              <p className="text-[11px] font-semibold text-[#475467]">{item.type}</p>
              <p className="text-[11px] font-bold">{item.levels} levels</p>
              <p className="text-[11px] font-bold">{item.rolesMapped} roles</p>
              <StatusPill status={item.status} />
              <p className="text-[10px] font-semibold text-[#667085]">{item.updatedAt ? fmtDate(item.updatedAt.slice(0, 10)) : '—'}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => openEdit(item)} className="h-8 rounded-lg border border-[#84caff] px-2.5 text-[10px] font-semibold text-[#175cd3]">
                  Open
                </button>
                {isHrScope && item.status !== 'Retired' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAction('competency.retire', { id: item.id }).catch((err) => setFormError(err instanceof Error ? err.message : 'Retire failed'))}
                    className="h-8 rounded-lg border border-[#d0d5dd] px-2 text-[10px] font-semibold text-[#667085] disabled:opacity-50"
                  >
                    Retire
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!rows.length ? (
            <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">
              {total ? 'No competencies match these filters.' : 'No competencies configured yet. Create the first competency to populate the framework.'}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaecf0] px-3 py-2 text-[10px] text-[#667085]">
        <span>
          Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} competencies
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
    <div className="space-y-4 pb-10 text-[#101828]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#1570ef] text-white">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">Competency Framework</h1>
              <span className="rounded-full border border-[#abefc6] bg-[#ecfdf3] px-2 py-0.5 text-[10px] font-semibold text-[#027a48]">
                {frameworkLabel} · Active
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-[#667085]">
              Design, govern and map enterprise competencies across roles, grades and departments.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#84caff] bg-white px-3 text-[11px] font-semibold text-[#175cd3]">
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#84caff] bg-white px-3 text-[11px] font-semibold text-[#175cd3]">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          {isHrScope ? (
            <button type="button" disabled={busy} onClick={openCreate} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> New Competency
            </button>
          ) : null}
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

      {formError && !creating ? (
        <div className="rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[11px] font-semibold text-[#b42318]">{formError}</div>
      ) : null}

      {activeTab === 'Overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { icon: ListChecks, label: 'Total Competencies', value: String(total), sub: createdEvents ? `↑ ${createdEvents} created in audit` : '— Live framework', tone: 'blue' as const },
              { icon: Users, label: 'Competency Families', value: String(familyCount), sub: '— No change', tone: 'purple' as const },
              { icon: ShieldCheck, label: 'Role Coverage', value: `${avgCoverage}%`, sub: `↑ vs ${roleCoverage}% mapped capacity`, tone: 'green' as const },
              { icon: AlertTriangle, label: 'Mapping Gaps', value: String(mappingGaps), sub: mappingGaps ? 'Requires role mapping' : 'No open gaps', tone: 'orange' as const },
              { icon: Clock3, label: 'Pending Approval', value: String(pendingApproval), sub: `${definitionsReview} definitions in review`, tone: 'red' as const },
            ].map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-[#eaecf0] bg-white p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#667085]">{kpi.label}</p>
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                    kpi.tone === 'purple' ? 'bg-[#f4f3ff] text-[#6938ef]'
                      : kpi.tone === 'green' ? 'bg-[#ecfdf3] text-[#039855]'
                        : kpi.tone === 'orange' ? 'bg-[#fffaeb] text-[#dc6803]'
                          : kpi.tone === 'red' ? 'bg-[#fef3f2] text-[#d92d20]'
                            : 'bg-[#eff8ff] text-[#1570ef]'
                  }`}>
                    <kpi.icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
                <p className={`mt-1 text-[10px] font-semibold ${kpi.tone === 'orange' || kpi.tone === 'red' ? 'text-[#b42318]' : 'text-[#027a48]'}`}>{kpi.sub}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <RegisterTable title="Competency Framework Register" />

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">Competency Families</h3>
                  <button type="button" onClick={() => setActiveTab('Competency Library')} className="text-[10px] font-semibold text-[#1570ef]">View all families</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {familyCards.slice(0, 6).map((family) => (
                    <article key={family.name} className={`rounded-xl border p-3 ${FAMILY_TONES[family.name] || 'border-[#eaecf0] bg-[#f9fafb] text-[#344054]'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold">{family.name}</p>
                        <span className="text-[11px] font-bold">{family.count}</span>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
                        <div className="h-full rounded-full bg-current opacity-70" style={{ width: `${family.coverage}%` }} />
                      </div>
                      <p className="mt-1 text-[9px] font-semibold opacity-80">{family.coverage}% coverage</p>
                    </article>
                  ))}
                  {!familyCards.length ? <p className="text-[11px] font-semibold text-[#667085]">No competency families yet.</p> : null}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Framework Coverage</h3>
                {gradeCoverage.map((item) => (
                  <div key={item.label} className="mb-3">
                    <div className="mb-1 flex justify-between text-[11px] font-semibold">
                      <span className="text-[#475467]">{item.label}</span>
                      <span>{item.pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f2f4f7]">
                      <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex gap-3 text-[9px] font-semibold text-[#667085]">
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#1570ef]" /> Mapped</span>
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#e4e7ec]" /> Gap</span>
                </div>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Governance Alerts</h3>
                <ul className="space-y-2">
                  {[
                    { label: `${mappingGaps} roles have mapping gaps`, tab: 'Role Mapping' as TabId },
                    { label: `${pendingApproval} competencies awaiting approval`, tab: 'Versions & Approvals' as TabId },
                    { label: `${definitionsReview} definitions require review`, tab: 'Competency Library' as TabId },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center justify-between gap-2 rounded-lg border border-[#eaecf0] bg-[#f9fafb] px-3 py-2">
                      <span className="inline-flex items-center gap-2 text-[11px] font-semibold">
                        <AlertTriangle className="h-3.5 w-3.5 text-[#dc6803]" />
                        {item.label}
                      </span>
                      <button type="button" onClick={() => setActiveTab(item.tab)} className="text-[10px] font-bold text-[#1570ef]">View</button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-[#eaecf0] bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold">Approval Workflow</h3>
                {[
                  { step: 1, label: 'Draft Definition', state: 'done' as const, detail: '' },
                  { step: 2, label: 'HR Review', state: 'current' as const, detail: `${pendingApproval} pending` },
                  { step: 3, label: 'Functional Owner Approval', state: 'upcoming' as const, detail: '' },
                  { step: 4, label: 'Published', state: 'upcoming' as const, detail: '' },
                ].map((item) => (
                  <div key={item.step} className="mb-3 flex items-start gap-3">
                    <span className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full border text-[10px] font-bold ${
                      item.state === 'done' ? 'border-[#12b76a] bg-[#ecfdf3] text-[#027a48]'
                        : item.state === 'current' ? 'border-[#f79009] bg-[#fffaeb] text-[#b54708]'
                          : 'border-[#d0d5dd] bg-white text-[#98a2b3]'
                    }`}>
                      {item.state === 'done' ? <Check className="h-3 w-3" /> : item.step}
                    </span>
                    <div>
                      <p className="text-[11px] font-bold">{item.label}</p>
                      {item.state === 'current' ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#fedf89] bg-[#fffaeb] px-1.5 py-0.5 text-[9px] font-semibold text-[#b54708]">
                          Current{item.detail ? ` · ${item.detail}` : ''}
                        </span>
                      ) : item.detail ? (
                        <p className="mt-0.5 text-[9px] font-semibold text-[#667085]">{item.detail}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </section>
            </aside>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-[#667085]">
            <span>
              Last published: {lastPublished?.updatedAt ? fmtDate(lastPublished.updatedAt.slice(0, 10)) : '—'}
              {lastPublished?.updatedBy ? ` by ${lastPublished.updatedBy}` : ' by HR Administrator'}
            </span>
            <span>Version {versionMajor}.{Math.min(versionMinor, 9)}</span>
          </div>
        </>
      ) : null}

      {activeTab === 'Competency Library' ? <RegisterTable title="Competency Library" /> : null}

      {activeTab === 'Framework Builder' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Framework Builder</h2>
              <p className="mt-1 text-[11px] font-medium text-[#667085]">Compose families and proficiency anchors for the active competency set.</p>
            </div>
            {isHrScope ? (
              <button type="button" onClick={openCreate} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1570ef] px-3 text-[11px] font-semibold text-white">
                <Plus className="h-3.5 w-3.5" /> Add competency
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {familyCards.map((family) => (
              <article key={family.name} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{family.name}</h3>
                  <StatusPill status={`${family.count} comps`} />
                </div>
                <ul className="mt-3 space-y-1">
                  {competencies.filter((item) => item.category === family.name).slice(0, 5).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#344054]">{item.name}</span>
                      <StatusPill status={item.status} />
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            {!familyCards.length ? <p className="text-sm font-semibold text-[#667085]">Create competencies to build the framework tree.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Role Mapping' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">Role Mapping</h2>
          <p className="mb-4 text-[11px] font-medium text-[#667085]">
            Coverage derived from HRIS eligibility roles ({roleUniverse}) and assessment usage of each competency.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b border-[#eaecf0] text-[10px] uppercase tracking-wide text-[#667085]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Competency</th>
                  <th className="px-3 py-2 font-semibold">Family</th>
                  <th className="px-3 py-2 font-semibold">Roles mapped</th>
                  <th className="px-3 py-2 font-semibold">Coverage</th>
                  <th className="px-3 py-2 font-semibold">Gap</th>
                </tr>
              </thead>
              <tbody>
                {competencies.map((item) => (
                  <tr key={item.id} className="border-b border-[#eaecf0]">
                    <td className="px-3 py-2.5 font-bold">{item.name}</td>
                    <td className="px-3 py-2.5 font-semibold text-[#475467]">{item.category}</td>
                    <td className="px-3 py-2.5 font-bold">{item.rolesMapped}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#f2f4f7]">
                          <div className="h-full rounded-full bg-[#1570ef]" style={{ width: `${item.coverage}%` }} />
                        </div>
                        <span className="font-bold">{item.coverage}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {item.coverage < 85 ? <StatusPill status="Gap" /> : <StatusPill status="Mapped" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!competencies.length ? <p className="py-10 text-center text-sm font-semibold text-[#667085]">No competencies to map.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Proficiency Levels' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">Proficiency Levels</h2>
          <p className="mb-4 text-[11px] font-medium text-[#667085]">Behavioural anchors used when rating each competency (1–5).</p>
          <div className="space-y-3">
            {competencies.map((item) => (
              <article key={item.id} className="rounded-xl border border-[#eaecf0] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-bold">{item.name}</p>
                    <p className="text-[10px] font-semibold text-[#667085]">{item.category} · {item.levels} levels</p>
                  </div>
                  <StatusPill status={item.type} />
                </div>
                <ol className="mt-3 space-y-1">
                  {(item.anchors?.length ? item.anchors : ['No anchors configured']).map((anchor, index) => (
                    <li key={`${item.id}-${index}`} className="text-[11px] font-semibold text-[#475467]">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#eff8ff] text-[10px] font-bold text-[#175cd3]">{index + 1}</span>
                      {anchor}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
            {!competencies.length ? <p className="text-sm font-semibold text-[#667085]">No proficiency definitions yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Versions & Approvals' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">Versions & Approvals</h2>
          <p className="mb-4 text-[11px] font-medium text-[#667085]">Draft and review-state competencies awaiting publication into the active framework.</p>
          <div className="space-y-2">
            {competencies.filter((item) => item.status === 'Draft' || item.status === 'Review').map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#eaecf0] px-3 py-3">
                <div>
                  <p className="text-[12px] font-bold">{item.name}</p>
                  <p className="text-[10px] font-semibold text-[#667085]">{item.category} · {item.type} · Updated {item.updatedAt ? fmtDate(item.updatedAt.slice(0, 10)) : '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={item.status} />
                  {isHrScope ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAction('competency.upsert', {
                        id: item.id,
                        name: item.name,
                        code: item.code,
                        category: item.category,
                        type: item.type,
                        status: 'Active',
                        levels: item.levels,
                        weight: item.weight,
                        description: item.description,
                        rolesMapped: item.rolesMapped,
                      })}
                      className="h-8 rounded-lg bg-[#1570ef] px-2.5 text-[10px] font-semibold text-white disabled:opacity-50"
                    >
                      Approve & publish
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!pendingApproval ? (
              <div className="rounded-xl border border-[#abefc6] bg-[#ecfdf3] px-4 py-8 text-center text-[12px] font-semibold text-[#027a48]">
                No competencies pending approval.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'Audit History' ? (
        <section className="rounded-xl border border-[#eaecf0] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold">Audit History</h2>
          <p className="mb-4 text-[11px] font-medium text-[#667085]">Governed changes to the competency framework configuration.</p>
          <div className="divide-y divide-[#eaecf0] rounded-xl border border-[#eaecf0]">
            {auditRows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[12px] font-bold">{row.action}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-[#475467]">{row.actor} · {row.actorRole} · {row.entityType}/{row.entityId}</p>
                  {row.after ? <p className="mt-1 text-[10px] font-semibold text-[#667085]">{row.after}</p> : null}
                </div>
                <p className="text-[10px] font-semibold text-[#667085]">{fmtDateTime(row.at)}</p>
              </div>
            ))}
            {!auditRows.length ? (
              <div className="px-4 py-12 text-center text-sm font-semibold text-[#667085]">No competency audit events yet.</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {creating ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-[#0c111d80]" aria-label="Close create dialog" onClick={closeModal} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(520px,94vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#eaecf0] bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">{editing ? 'Edit Competency' : 'New Competency'}</h2>
                <p className="mt-1 text-xs text-[#667085]">Persist competency definitions into the HRIS performance configuration store.</p>
              </div>
              <button type="button" onClick={closeModal} className="grid h-8 w-8 place-items-center rounded-lg text-[#667085] hover:bg-[#f9fafb]"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold">Code
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="CMP-LED-01" />
                </label>
                <label className="text-[11px] font-semibold">Weight %
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
                </label>
              </div>
              <label className="text-[11px] font-semibold">Name
                <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Strategic Leadership" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold">Family
                  <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} list="competency-families" />
                  <datalist id="competency-families">
                    {families.filter((item) => item !== 'All families').map((item) => <option key={item} value={item} />)}
                    {['Leadership', 'Core Values', 'Technical', 'Functional', 'HSE & Compliance', 'Digital', 'Operations', 'Commercial'].map((item) => (
                      <option key={`std-${item}`} value={item} />
                    ))}
                  </datalist>
                </label>
                <label className="text-[11px] font-semibold">Type
                  <select className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CompetencyType }))}>
                    <option>Behavioural</option>
                    <option>Technical</option>
                    <option>Functional</option>
                    <option>Core</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] font-semibold">Levels
                  <select className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm" value={form.levels} onChange={(e) => setForm((f) => ({ ...f, levels: e.target.value }))}>
                    {[3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-semibold">Status
                  <select className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] bg-white px-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CompetencyStatus }))}>
                    <option>Draft</option>
                    <option>Review</option>
                    <option>Active</option>
                    <option>Retired</option>
                  </select>
                </label>
              </div>
              <label className="text-[11px] font-semibold">Roles mapped
                <input className="mt-1 h-9 w-full rounded-lg border border-[#d0d5dd] px-3 text-sm" value={form.rolesMapped} onChange={(e) => setForm((f) => ({ ...f, rolesMapped: e.target.value }))} inputMode="numeric" />
              </label>
              <label className="text-[11px] font-semibold">Description
                <textarea className="mt-1 min-h-[80px] w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
              {formError ? <p className="rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[11px] font-semibold text-[#b42318]">{formError}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeModal} className="h-9 rounded-lg border border-[#d0d5dd] px-3 text-sm font-semibold">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void saveCompetency()} className="h-9 rounded-lg bg-[#1570ef] px-3 text-sm font-semibold text-white disabled:opacity-50">
                {editing ? 'Save changes' : 'Save competency'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
