'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ItSupportBreadcrumbs } from '../../it-support-portal-shell';
import {
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  INSPECTION_RESULTS,
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  SCHEDULE_FREQUENCIES,
  type InspectionDirectoryOption,
  type InspectionFinding,
  type InspectionRecord,
  type InspectionSchedule,
  type InspectionWorkspace as WorkspaceData,
} from '@/lib/it-support/inspection-types';

type Section = 'dashboard' | 'inspections' | 'schedules' | 'findings' | 'reports';

const emptyWorkspace = (): WorkspaceData => ({
  schedules: [],
  inspections: [],
  findings: [],
  directory: { departments: [], locations: [], employees: [] },
  locations: [],
  actions: [],
  hazid: [],
  bbs: [],
  drills: [],
  ewaste: [],
  assets: [],
});

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';
const primaryBtn = 'inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60';
const secondaryBtn = 'inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';

const today = () => new Date().toISOString().slice(0, 10);

const isOverdueInspection = (row: InspectionRecord) =>
  Boolean(row.scheduledDate && row.scheduledDate < today() && (row.status === 'Scheduled' || row.status === 'In Progress'));

const isOverdueSchedule = (row: InspectionSchedule) =>
  Boolean(row.nextDueDate && row.nextDueDate < today() && row.status === 'Active');

async function apiGet() {
  const res = await fetch('/api/it-support/inspection-management', { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || json.status === 'error') throw new Error(json.error || 'Failed to load inspections');
  return json.data as WorkspaceData;
}

async function apiPost(action: string, payload: Record<string, unknown>) {
  const res = await fetch('/api/it-support/inspection-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!res.ok || json.status === 'error') throw new Error(json.error || 'Save failed');
  return json.data as WorkspaceData & { id?: string };
}

const titles: Record<Section, { crumb: string; title: string; detail: string }> = {
  dashboard: {
    crumb: 'Dashboard',
    title: 'Inspection Management',
    detail: 'Operational view of inspection schedules, completed checks, and open findings. Records are stored in DLE_Enterprise.',
  },
  inspections: {
    crumb: 'Inspections',
    title: 'Inspections',
    detail: 'Raise and close inspection records. Completed inspections require a result.',
  },
  schedules: {
    crumb: 'Schedules',
    title: 'Inspection schedules',
    detail: 'Recurring plans that drive the inspection register.',
  },
  findings: {
    crumb: 'Findings',
    title: 'Findings',
    detail: 'Defects and observations raised against an inspection.',
  },
  reports: {
    crumb: 'Reports',
    title: 'Inspection reports',
    detail: 'Completion, overdue work, and open findings calculated from the same DLE_Enterprise records.',
  },
};

export function InspectionWorkspace({ section }: { section: Section }) {
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'inspection' | 'schedule' | 'finding' | null>(null);
  const [inspectionForm, setInspectionForm] = useState<Partial<InspectionRecord>>({ status: 'Scheduled', inspectionType: INSPECTION_TYPES[0] });
  const [scheduleForm, setScheduleForm] = useState<Partial<InspectionSchedule>>({ status: 'Active', frequency: 'Monthly', inspectionType: INSPECTION_TYPES[0] });
  const [findingForm, setFindingForm] = useState<Partial<InspectionFinding>>({ severity: 'Medium', status: 'Open' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await apiGet());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inspections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const openFindings = data.findings.filter((row) => row.status !== 'Closed');
    const completed = data.inspections.filter((row) => row.status === 'Completed').length;
    return {
      inspections: data.inspections.length,
      completed,
      overdue: data.inspections.filter(isOverdueInspection).length + data.schedules.filter(isOverdueSchedule).length,
      openFindings: openFindings.length,
      critical: openFindings.filter((row) => row.severity === 'Critical' || row.severity === 'High').length,
      schedules: data.schedules.filter((row) => row.status === 'Active').length,
    };
  }, [data]);

  const q = search.trim().toLowerCase();
  const inspections = data.inspections.filter((row) => !q || [row.inspectionId, row.title, row.location, row.inspectorName, row.status].some((value) => String(value || '').toLowerCase().includes(q)));
  const schedules = data.schedules.filter((row) => !q || [row.scheduleId, row.title, row.location, row.ownerName, row.frequency].some((value) => String(value || '').toLowerCase().includes(q)));
  const findings = data.findings.filter((row) => !q || [row.findingId, row.title, row.ownerName, row.severity, row.inspectionId].some((value) => String(value || '').toLowerCase().includes(q)));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (modal === 'inspection') setData(await apiPost('upsert-inspection', inspectionForm));
      if (modal === 'schedule') setData(await apiPost('upsert-schedule', scheduleForm));
      if (modal === 'finding') setData(await apiPost('upsert-finding', findingForm));
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind: 'inspection' | 'schedule' | 'finding', id: string) => {
    if (!window.confirm('Delete this record from DLE_Enterprise?')) return;
    setError('');
    try {
      setData(await apiPost('delete', { kind, id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const copy = titles[section];

  return (
    <div className="space-y-5">
      <ItSupportBreadcrumbs items={['Inspection Management', copy.crumb]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">{copy.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{copy.detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryBtn} onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</button>
          {section === 'inspections' || section === 'dashboard' ? (
            <button type="button" className={primaryBtn} onClick={() => { setInspectionForm({ status: 'Scheduled', inspectionType: INSPECTION_TYPES[0], scheduledDate: today() }); setModal('inspection'); }}>
              <Plus className="h-4 w-4" /> New inspection
            </button>
          ) : null}
          {section === 'schedules' ? (
            <button type="button" className={primaryBtn} onClick={() => { setScheduleForm({ status: 'Active', frequency: 'Monthly', inspectionType: INSPECTION_TYPES[0], nextDueDate: today() }); setModal('schedule'); }}>
              <Plus className="h-4 w-4" /> New schedule
            </button>
          ) : null}
          {section === 'findings' ? (
            <button type="button" className={primaryBtn} onClick={() => { setFindingForm({ severity: 'Medium', status: 'Open', inspectionId: data.inspections[0]?.inspectionId || '' }); setModal('finding'); }}>
              <Plus className="h-4 w-4" /> New finding
            </button>
          ) : null}
        </div>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading from DLE_Enterprise…
        </div>
      ) : (
        <>
          {(section === 'dashboard' || section === 'reports') ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Inspections', stats.inspections],
                ['Completed', stats.completed],
                ['Overdue', stats.overdue],
                ['Open findings', stats.openFindings],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {section === 'dashboard' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Recent inspections">
                <SimpleTable
                  headers={['No', 'Title', 'Status', 'Due']}
                  rows={data.inspections.slice(0, 6).map((row) => [row.inspectionId, row.title, row.status, row.scheduledDate || '—'])}
                  empty="No inspections recorded yet."
                />
              </Panel>
              <Panel title="Open findings">
                <SimpleTable
                  headers={['No', 'Title', 'Severity', 'Owner']}
                  rows={data.findings.filter((row) => row.status !== 'Closed').slice(0, 6).map((row) => [row.findingId, row.title, row.severity, row.ownerName || '—'])}
                  empty="No open findings."
                />
              </Panel>
            </div>
          ) : null}

          {section === 'reports' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Inspections by status">
                <SimpleTable
                  headers={['Status', 'Count']}
                  rows={INSPECTION_STATUSES.map((status) => [status, String(data.inspections.filter((row) => row.status === status).length)])}
                  empty="No inspections."
                />
              </Panel>
              <Panel title="Open findings by severity">
                <SimpleTable
                  headers={['Severity', 'Open']}
                  rows={FINDING_SEVERITIES.map((severity) => [severity, String(data.findings.filter((row) => row.severity === severity && row.status !== 'Closed').length)])}
                  empty="No findings."
                />
              </Panel>
              <Panel title="Overdue schedules">
                <SimpleTable
                  headers={['Schedule', 'Due', 'Owner']}
                  rows={data.schedules.filter(isOverdueSchedule).map((row) => [row.title, row.nextDueDate || '—', row.ownerName || '—'])}
                  empty="No overdue schedules."
                />
              </Panel>
              <Panel title="Completion">
                <p className="text-sm text-slate-700">
                  {stats.inspections ? Math.round((stats.completed / stats.inspections) * 100) : 0}% of inspections are completed.
                  {' '}{stats.critical} high or critical findings remain open. Active schedules: {stats.schedules}.
                </p>
              </Panel>
            </div>
          ) : null}

          {section === 'inspections' ? (
            <Register
              search={search}
              onSearch={setSearch}
              placeholder="Search inspections…"
            >
              <DataTable
                headers={['No', 'Title', 'Type', 'Inspector', 'Date', 'Status', 'Result', '']}
                rows={inspections.map((row) => (
                  <tr key={row.inspectionId} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold text-teal-800">{row.inspectionId}</td>
                    <td className="px-3 py-3">
                      <button type="button" className="font-semibold text-slate-900 hover:underline" onClick={() => { setInspectionForm(row); setModal('inspection'); }}>{row.title}</button>
                      <div className="text-xs text-slate-500">{row.location || '—'} · {row.department || '—'}</div>
                    </td>
                    <td className="px-3 py-3">{row.inspectionType}</td>
                    <td className="px-3 py-3">{row.inspectorName || '—'}</td>
                    <td className="px-3 py-3">{row.scheduledDate || '—'}</td>
                    <td className="px-3 py-3">{isOverdueInspection(row) ? 'Overdue' : row.status}</td>
                    <td className="px-3 py-3">{row.result || '—'}</td>
                    <td className="px-3 py-3">
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => void remove('inspection', row.inspectionId)} aria-label="Delete inspection"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
                empty="No inspections match this search."
              />
            </Register>
          ) : null}

          {section === 'schedules' ? (
            <Register search={search} onSearch={setSearch} placeholder="Search schedules…">
              <DataTable
                headers={['No', 'Title', 'Frequency', 'Next due', 'Owner', 'Status', '']}
                rows={schedules.map((row) => (
                  <tr key={row.scheduleId} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold text-teal-800">{row.scheduleId}</td>
                    <td className="px-3 py-3">
                      <button type="button" className="font-semibold text-slate-900 hover:underline" onClick={() => { setScheduleForm(row); setModal('schedule'); }}>{row.title}</button>
                      <div className="text-xs text-slate-500">{row.inspectionType} · {row.location || '—'}</div>
                    </td>
                    <td className="px-3 py-3">{row.frequency}</td>
                    <td className="px-3 py-3">{row.nextDueDate || '—'}</td>
                    <td className="px-3 py-3">{row.ownerName || '—'}</td>
                    <td className="px-3 py-3">{isOverdueSchedule(row) ? 'Overdue' : row.status}</td>
                    <td className="px-3 py-3">
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => void remove('schedule', row.scheduleId)} aria-label="Delete schedule"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
                empty="No schedules match this search."
              />
            </Register>
          ) : null}

          {section === 'findings' ? (
            <Register search={search} onSearch={setSearch} placeholder="Search findings…">
              <DataTable
                headers={['No', 'Title', 'Inspection', 'Severity', 'Status', 'Owner', 'Due', '']}
                rows={findings.map((row) => (
                  <tr key={row.findingId} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-semibold text-teal-800">{row.findingId}</td>
                    <td className="px-3 py-3">
                      <button type="button" className="font-semibold text-slate-900 hover:underline" onClick={() => { setFindingForm(row); setModal('finding'); }}>{row.title}</button>
                    </td>
                    <td className="px-3 py-3">{row.inspectionId}</td>
                    <td className="px-3 py-3">{row.severity}</td>
                    <td className="px-3 py-3">{row.status}</td>
                    <td className="px-3 py-3">{row.ownerName || '—'}</td>
                    <td className="px-3 py-3">{row.dueDate || '—'}</td>
                    <td className="px-3 py-3">
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => void remove('finding', row.findingId)} aria-label="Delete finding"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
                empty="No findings match this search."
              />
            </Register>
          ) : null}
        </>
      )}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4">
          <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-black text-slate-950">
                {modal === 'inspection' ? 'Inspection' : modal === 'schedule' ? 'Schedule' : 'Finding'}
              </h2>
            </div>
            <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
              {modal === 'inspection' ? (
                <>
                  <Field label="Title *" className="sm:col-span-2"><input className={inputClass} value={inspectionForm.title || ''} onChange={(e) => setInspectionForm((f) => ({ ...f, title: e.target.value }))} /></Field>
                  <Field label="Type"><Select value={inspectionForm.inspectionType || ''} options={INSPECTION_TYPES} onChange={(value) => setInspectionForm((f) => ({ ...f, inspectionType: value }))} /></Field>
                  <Field label="Status"><Select value={inspectionForm.status || 'Scheduled'} options={INSPECTION_STATUSES} onChange={(value) => setInspectionForm((f) => ({ ...f, status: value }))} /></Field>
                  <DirectorySelect label="Location" value={inspectionForm.location || ''} options={data.directory?.locations || []} placeholder="Search locations…" onChange={(value) => setInspectionForm((f) => ({ ...f, location: value }))} />
                  <DirectorySelect label="Department" value={inspectionForm.department || ''} options={data.directory?.departments || []} placeholder="Search departments…" onChange={(value) => setInspectionForm((f) => ({ ...f, department: value }))} />
                  <DirectorySelect label="Inspector" value={inspectionForm.inspectorName || ''} options={data.directory?.employees || []} placeholder="Search employees…" onChange={(value) => setInspectionForm((f) => ({ ...f, inspectorName: value }))} />
                  <Field label="Schedule"><Select value={inspectionForm.scheduleId || ''} options={['', ...data.schedules.map((row) => row.scheduleId)]} onChange={(value) => setInspectionForm((f) => ({ ...f, scheduleId: value }))} /></Field>
                  <Field label="Scheduled date"><input type="date" className={inputClass} value={inspectionForm.scheduledDate || ''} onChange={(e) => setInspectionForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></Field>
                  <Field label="Completed date"><input type="date" className={inputClass} value={inspectionForm.completedDate || ''} onChange={(e) => setInspectionForm((f) => ({ ...f, completedDate: e.target.value }))} /></Field>
                  <Field label="Result"><Select value={inspectionForm.result || ''} options={['', ...INSPECTION_RESULTS]} onChange={(value) => setInspectionForm((f) => ({ ...f, result: value }))} /></Field>
                  <Field label="Notes" className="sm:col-span-2"><textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={inspectionForm.notes || ''} onChange={(e) => setInspectionForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
                </>
              ) : null}
              {modal === 'schedule' ? (
                <>
                  <Field label="Title *" className="sm:col-span-2"><input className={inputClass} value={scheduleForm.title || ''} onChange={(e) => setScheduleForm((f) => ({ ...f, title: e.target.value }))} /></Field>
                  <Field label="Type"><Select value={scheduleForm.inspectionType || ''} options={INSPECTION_TYPES} onChange={(value) => setScheduleForm((f) => ({ ...f, inspectionType: value }))} /></Field>
                  <Field label="Frequency"><Select value={scheduleForm.frequency || 'Monthly'} options={SCHEDULE_FREQUENCIES} onChange={(value) => setScheduleForm((f) => ({ ...f, frequency: value }))} /></Field>
                  <DirectorySelect label="Location" value={scheduleForm.location || ''} options={data.directory?.locations || []} placeholder="Search locations…" onChange={(value) => setScheduleForm((f) => ({ ...f, location: value }))} />
                  <DirectorySelect label="Department" value={scheduleForm.department || ''} options={data.directory?.departments || []} placeholder="Search departments…" onChange={(value) => setScheduleForm((f) => ({ ...f, department: value }))} />
                  <DirectorySelect label="Owner" value={scheduleForm.ownerName || ''} options={data.directory?.employees || []} placeholder="Search employees…" onChange={(value) => setScheduleForm((f) => ({ ...f, ownerName: value }))} />
                  <Field label="Next due"><input type="date" className={inputClass} value={scheduleForm.nextDueDate || ''} onChange={(e) => setScheduleForm((f) => ({ ...f, nextDueDate: e.target.value }))} /></Field>
                  <Field label="Status"><Select value={scheduleForm.status || 'Active'} options={['Active', 'Paused']} onChange={(value) => setScheduleForm((f) => ({ ...f, status: value }))} /></Field>
                  <Field label="Notes" className="sm:col-span-2"><textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={scheduleForm.notes || ''} onChange={(e) => setScheduleForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
                </>
              ) : null}
              {modal === 'finding' ? (
                <>
                  <Field label="Title *" className="sm:col-span-2"><input className={inputClass} value={findingForm.title || ''} onChange={(e) => setFindingForm((f) => ({ ...f, title: e.target.value }))} /></Field>
                  <Field label="Inspection *" className="sm:col-span-2">
                    <select className={inputClass} value={findingForm.inspectionId || ''} onChange={(e) => setFindingForm((f) => ({ ...f, inspectionId: e.target.value }))}>
                      <option value="">Select inspection</option>
                      {data.inspections.map((row) => <option key={row.inspectionId} value={row.inspectionId}>{row.inspectionId} — {row.title}</option>)}
                    </select>
                  </Field>
                  <Field label="Severity"><Select value={findingForm.severity || 'Medium'} options={FINDING_SEVERITIES} onChange={(value) => setFindingForm((f) => ({ ...f, severity: value }))} /></Field>
                  <Field label="Status"><Select value={findingForm.status || 'Open'} options={FINDING_STATUSES} onChange={(value) => setFindingForm((f) => ({ ...f, status: value }))} /></Field>
                  <DirectorySelect label="Owner" value={findingForm.ownerName || ''} options={data.directory?.employees || []} placeholder="Search employees…" onChange={(value) => setFindingForm((f) => ({ ...f, ownerName: value }))} />
                  <Field label="Due date"><input type="date" className={inputClass} value={findingForm.dueDate || ''} onChange={(e) => setFindingForm((f) => ({ ...f, dueDate: e.target.value }))} /></Field>
                  <Field label="Description" className="sm:col-span-2"><textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={findingForm.description || ''} onChange={(e) => setFindingForm((f) => ({ ...f, description: e.target.value }))} /></Field>
                  <Field label="Resolution" className="sm:col-span-2"><textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={findingForm.resolution || ''} onChange={(e) => setFindingForm((f) => ({ ...f, resolution: e.target.value }))} /></Field>
                </>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" className={secondaryBtn} onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className={primaryBtn} disabled={saving} onClick={() => void save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DirectorySelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: InspectionDirectoryOption[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const choices = useMemo(() => {
    const list = [...options];
    if (value && !list.some((option) => option.value === value)) list.unshift({ value, label: value });
    return list;
  }, [options, value]);
  const selected = choices.find((option) => option.value === value) || null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = !needle ? choices : choices.filter((option) => `${option.label} ${option.hint || ''}`.toLowerCase().includes(needle));
    return source.slice(0, 40);
  }, [choices, query]);

  return (
    <label className={`relative block ${open ? 'z-20' : ''}`}>
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        value={open ? query : (selected?.label || value)}
        placeholder={options.length ? placeholder : 'Loading directory…'}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value) onChange('');
        }}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length ? filtered.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-teal-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                {option.hint ? <span className="block text-xs text-slate-500">{option.hint}</span> : null}
              </button>
            </li>
          )) : <li className="px-3 py-2 text-sm text-slate-500">No matches.</li>}
        </ul>
      ) : null}
    </label>
  );
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function Select({ value, options, onChange }: { value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => <option key={option || 'blank'} value={option}>{option || '—'}</option>)}
    </select>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-black text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <table className="min-w-full text-sm">
      <thead className="text-xs font-bold uppercase tracking-wide text-slate-500">
        <tr>{headers.map((header) => <th key={header} className="px-2 py-2 text-left">{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row[0]}-${index}`} className="border-t border-slate-100">
            {row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-2">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Register({ search, onSearch, placeholder, children }: { search: string; onSearch: (value: string) => void; placeholder: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-3">
        <input className={inputClass} value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} />
      </div>
      {children}
    </section>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>{headers.map((header) => <th key={header || 'actions'} className="px-3 py-3 text-left">{header}</th>)}</tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      {!rows.length ? <p className="py-10 text-center text-sm text-slate-500">{empty}</p> : null}
    </div>
  );
}
