'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Briefcase, ChevronDown, Database, Download, Eye, Layers3, MoreVertical, Pencil, Plus, RotateCcw, Search, Target, Upload, UserRound, Users } from 'lucide-react';
import type { HealthStatus, JobTitleRecord, StructureInsight } from '@/lib/organization-data';
import './job-titles.css';

type Payload = {
  generatedAt: string;
  permissions: { canEdit: boolean; canExport: boolean; canViewCosts: boolean };
  dataSource?: {
    source: string;
    databaseAvailable: boolean;
    warning: string | null;
    employeeCount: number;
    structureSource: string;
    migratedTitleCount: number;
    migrationWarning: string | null;
    independence: string;
  };
  summary: {
    totalTitles: number;
    totalEmployees: number;
    totalOpenPositions: number;
    avgSuccessionCoverage: number;
    titlesNeedingReview: number;
    titleVariants: number;
  };
  filterOptions: {
    families: string[];
    levels: string[];
    grades: string[];
    reportingLevels: string[];
    standardizationStatuses: string[];
    healthStatuses: HealthStatus[];
  };
  titles: JobTitleRecord[];
  insights: StructureInsight[];
};

const emptyFilters = {
  query: '',
  family: 'All',
  level: 'All',
  grade: 'All',
  reporting: 'All',
  standardization: 'All',
  health: 'All',
  sort: 'employeeCount',
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

const badgeClass = (status: string) => {
  if (status === 'Standard' || status === 'Healthy') return 'good';
  if (status === 'Critical') return 'bad';
  return 'warn';
};

export default function JobTitlesClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<JobTitleRecord | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'add'>('view');
  const [checked, setChecked] = useState<string[]>([]);
  const [menuId, setMenuId] = useState('');
  const [notice, setNotice] = useState('');
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/hris/organization/job-titles', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load job titles');
      setPayload(json.data as Payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load job titles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Job Titles | DLE Digital Enterprise';
    void load();
  }, []);

  const visible = useMemo(() => {
    const titles = payload?.titles || [];
    const query = filters.query.trim().toLowerCase();
    const filtered = titles.filter((title) => {
      if (filters.family !== 'All' && title.family !== filters.family) return false;
      if (filters.level !== 'All' && title.level !== filters.level) return false;
      if (filters.grade !== 'All' && title.gradeCode !== filters.grade) return false;
      if (filters.reporting !== 'All' && title.reportingLevel !== filters.reporting) return false;
      if (filters.standardization !== 'All' && title.standardizationStatus !== filters.standardization) return false;
      if (filters.health !== 'All' && title.healthStatus !== filters.health) return false;
      if (!query) return true;
      return [title.code, title.title, title.family, title.level, title.gradeCode, title.gradeName, title.benchmarkPosition, title.departments.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    filtered.sort((a, b) => {
      if (filters.sort === 'openPositions') return b.openPositions - a.openPositions;
      if (filters.sort === 'successionCoveragePct') return b.successionCoveragePct - a.successionCoveragePct;
      return b.employeeCount - a.employeeCount;
    });
    return filtered;
  }, [payload, filters]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  const rows = visible.slice(start, start + pageSize);
  const setFilter = (key: keyof typeof emptyFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const header = ['Code', 'Title', 'Grade', 'Family', 'Level', 'Employees', 'Open Roles', 'Standardization', 'Health'];
    const lines = visible.map((title) => [title.code, title.title, title.gradeName || title.gradeCode, title.family, title.level, title.employeeCount, title.openPositions, title.standardizationStatus, title.healthStatus]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'job-titles.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const openTitle = (title: JobTitleRecord | null, nextMode: 'view' | 'edit' | 'add') => {
    setSelected(title);
    setMode(nextMode);
    setMenuId('');
  };

  const pageList = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
    return [1, 2, 3, 4, 5, '…', pages] as Array<number | '…'>;
  };

  const summary = payload?.summary;
  const source = payload?.dataSource;
  const warning = source?.warning || source?.migrationWarning || '';
  const coverage = summary ? (Number.isInteger(summary.avgSuccessionCoverage) ? `${summary.avgSuccessionCoverage}%` : `${summary.avgSuccessionCoverage.toFixed(1)}%`) : '—';
  const cards = [
    [Briefcase, 'Total job titles', summary ? formatNumber(summary.totalTitles) : '—', 'Tracked standardized titles', 'k0'],
    [Users, 'Employees', summary ? formatNumber(summary.totalEmployees) : '—', 'Title-mapped workforce', 'k1'],
    [UserRound, 'Open roles', summary ? formatNumber(summary.totalOpenPositions) : '—', 'Approved title vacancies', 'k2'],
    [Target, 'Succession coverage', coverage, 'Average title readiness', 'k3'],
    [AlertTriangle, 'Needs review', summary ? formatNumber(summary.titlesNeedingReview) : '—', 'Titles needing architecture review', 'k4'],
    [Layers3, 'Variants', summary ? formatNumber(summary.titleVariants) : '—', 'Naming or scope variants', 'k5'],
  ] as const;
  const pageChecked = rows.length > 0 && rows.every((title) => checked.includes(title.id));

  return (
    <div className="jt-pro">
      <div className="crumb">HRIS › Organization › <b>Job Titles</b></div>
      <div className="hero">
        <div className="hero-title">
          <div className="hero-icon"><Briefcase size={26} /></div>
          <div>
            <h1>Job Titles</h1>
            <p>Review the organization&apos;s title architecture, grade alignment, workforce concentration, hiring demand, and title standardization posture.</p>
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport}><Download size={16} />Export <ChevronDown size={14} /></button>
          <button type="button" onClick={() => document.getElementById('job-title-import')?.click()}><Upload size={16} />Import</button>
          <input id="job-title-import" type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; setNotice(file ? `${file.name} was not imported. Job titles are produced from the employee register.` : ''); event.target.value = ''; }} />
          <button type="button" className="primary" onClick={() => openTitle(null, 'add')}><Plus size={16} />Add Job Title</button>
        </div>
      </div>
      {notice ? <p className="empty">{notice}</p> : null}

      <section className="kpis">
        {cards.map(([Icon, label, value, detail, tone]) => (
          <article className={`kpi ${tone}`} key={label}>
            <div className="kicon"><Icon size={20} /></div>
            <div><small>{label.toUpperCase()}</small><h2>{value}</h2><p>{detail}</p></div>
          </article>
        ))}
      </section>

      {source ? (
        <section className={warning ? 'alert' : 'alert ok'}>
          <div className="db"><Database size={22} /></div>
          <div>
            <b>Job title migration source</b>
            <p>{source.structureSource} from {source.source}; {formatNumber(source.employeeCount)} employee records produced {formatNumber(source.migratedTitleCount)} HRIS job title records.</p>
            <strong>{warning || source.independence}</strong>
          </div>
          <div className="alert-tags">
            <span><i className="dot" />HRIS DB: {source.databaseAvailable ? 'Available' : 'Unavailable'}</span>
            <span>Generated: {payload ? new Date(payload.generatedAt).toLocaleString() : '—'}</span>
          </div>
        </section>
      ) : null}

      <section className="filters">
        <label className="search"><Search size={16} /><input value={filters.query} onChange={(event) => setFilter('query', event.target.value)} placeholder="Search job title, code, grade, family, department..." /></label>
        <select value={filters.family} onChange={(event) => setFilter('family', event.target.value)}><option value="All">All Families</option>{(payload?.filterOptions.families || []).map((item) => <option key={item}>{item}</option>)}</select>
        <select value={filters.level} onChange={(event) => setFilter('level', event.target.value)}><option value="All">All Levels</option>{(payload?.filterOptions.levels || []).map((item) => <option key={item}>{item}</option>)}</select>
        <select value={filters.grade} onChange={(event) => setFilter('grade', event.target.value)}><option value="All">All Grades</option>{(payload?.filterOptions.grades || []).map((item) => <option key={item}>{item}</option>)}</select>
        <select value={filters.health} onChange={(event) => setFilter('health', event.target.value)}><option value="All">All Health States</option>{(payload?.filterOptions.healthStatuses || []).map((item) => <option key={item}>{item}</option>)}</select>
        <select value={filters.reporting} onChange={(event) => setFilter('reporting', event.target.value)}><option value="All">All Reporting Levels</option>{(payload?.filterOptions.reportingLevels || []).map((item) => <option key={item}>{item}</option>)}</select>
        <select value={filters.standardization} onChange={(event) => setFilter('standardization', event.target.value)}><option value="All">All Standardization</option>{(payload?.filterOptions.standardizationStatuses || []).map((item) => <option key={item}>{item}</option>)}</select>
        <select value={filters.sort} onChange={(event) => setFilter('sort', event.target.value)}>
          <option value="employeeCount">Sort: Employee Count</option>
          <option value="openPositions">Sort: Open Roles</option>
          <option value="successionCoveragePct">Sort: Succession</option>
        </select>
        <button type="button" className="reset" onClick={() => { setFilters(emptyFilters); setPage(1); }}><RotateCcw size={16} />Reset Filters</button>
      </section>

      <section className="registry">
        <div className="reg-head">
          <div><b>Job Title Registry</b><p>Searchable audit table of all visible job titles and their architecture mapping.</p></div>
          <div className="pager">
            <span>Showing {visible.length ? start + 1 : 0} - {Math.min(start + pageSize, visible.length)} of {visible.length}</span>
            <button type="button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
            {pageList().map((item, index) => item === '…'
              ? <button type="button" className="gap" key={`gap-${index}`} disabled>…</button>
              : <button type="button" key={item} className={item === safePage ? 'current' : ''} onClick={() => setPage(item)}>{item}</button>)}
            <button type="button" aria-label="Next page" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>›</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" checked={pageChecked} onChange={() => setChecked(pageChecked ? checked.filter((id) => !rows.some((title) => title.id === id)) : Array.from(new Set([...checked, ...rows.map((title) => title.id)])))} /></th>
                {['Code', 'Job Title', 'Grade', 'Family', 'Level', 'Employees', 'Open Roles', 'Standardization', 'Health', 'Actions'].map((heading) => <th key={heading}>{heading.toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={11}>Loading job titles…</td></tr> : rows.map((title) => (
                <tr key={title.id} className={selected?.id === title.id ? 'selected' : ''} onClick={() => openTitle(title, 'view')}>
                  <td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={checked.includes(title.id)} onChange={() => setChecked((current) => current.includes(title.id) ? current.filter((id) => id !== title.id) : [...current, title.id])} /></td>
                  <td>{title.code}</td>
                  <td><b>{title.title}</b><small>{title.benchmarkPosition || title.code}</small></td>
                  <td>{title.gradeName || title.gradeCode}</td>
                  <td>{title.family}</td>
                  <td>{title.level}</td>
                  <td>{formatNumber(title.employeeCount)}</td>
                  <td>{formatNumber(title.openPositions)}</td>
                  <td><span className={`badge ${badgeClass(title.standardizationStatus)}`}>{title.standardizationStatus}</span></td>
                  <td><span className={`badge ${badgeClass(title.healthStatus)}`}>{title.healthStatus}</span></td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="row-actions">
                      <button type="button" className="icon-btn" aria-label={`View ${title.title}`} onClick={() => openTitle(title, 'view')}><Eye size={15} /></button>
                      <button type="button" className="icon-btn" aria-label={`Edit ${title.title}`} onClick={() => openTitle(title, 'edit')}><Pencil size={15} /></button>
                      <div className="menu">
                        <button type="button" className="icon-btn" aria-label={`More actions for ${title.title}`} onClick={() => setMenuId(menuId === title.id ? '' : title.id)}><MoreVertical size={15} /></button>
                        {menuId === title.id ? <div className="menu-list"><button type="button" onClick={() => openTitle(title, 'view')}>View details</button></div> : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && error ? <p className="error">{error}</p> : null}
          {!loading && !error && !rows.length ? <p className="empty">No job titles match these filters.</p> : null}
        </div>
      </section>

      {selected || mode === 'add' ? (
        <div className="backdrop" onClick={() => { setSelected(null); setMode('view'); }} role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="job-title-detail" onClick={(event) => event.stopPropagation()}>
            <h2 id="job-title-detail">{mode === 'add' ? 'Add Job Title' : selected?.title}</h2>
            <p>{mode === 'view' ? selected?.jobPurpose : 'Maintain the standardized title architecture and mapping.'}</p>
            {mode === 'view' && selected ? (
              <div className="form">
                {[
                  ['Code', selected.code],
                  ['Grade', `${selected.gradeCode} · ${selected.gradeName}`],
                  ['Family', selected.family],
                  ['Level', selected.level],
                  ['Reporting level', selected.reportingLevel],
                  ['Employees', formatNumber(selected.employeeCount)],
                  ['Open roles', formatNumber(selected.openPositions)],
                  ['Standardization', selected.standardizationStatus],
                  ['Health', selected.healthStatus],
                ].map(([label, value]) => <label key={label}>{label}<span>{value}</span></label>)}
              </div>
            ) : (
              <div className="form">
                <label>Code<input defaultValue={selected?.code || ''} /></label>
                <label>Job Title<input defaultValue={selected?.title || ''} /></label>
                <label>Grade<input defaultValue={selected?.gradeName || selected?.gradeCode || ''} /></label>
                <label>Family<input defaultValue={selected?.family || ''} /></label>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => { setSelected(null); setMode('view'); }}>Cancel</button>
              <button type="button" className="primary" onClick={() => { setNotice(mode === 'view' ? '' : 'Job titles are produced from the employee register, so this change is not stored.'); setSelected(null); setMode('view'); }}>{mode === 'view' ? 'Close' : 'Save Job Title'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
