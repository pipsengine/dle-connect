'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ItSupportBreadcrumbs } from '../../it-support-portal-shell';
import { actionBucket, carAging, ewasteRate, highRisks, isActionOverdue, monthlyCompliance, riskByLocation } from '@/lib/it-support/inspection-analytics';
import {
  DRILL_TYPES,
  EWASTE_STATUSES,
  EWASTE_TYPES,
  type InspectionAssetOption,
  HAZID_CATEGORIES,
  IMS_ACTION_STATUSES,
  IMS_CHECK_STATUSES,
  IMS_FREQUENCIES,
  IMS_PRIORITIES,
  IMS_RISKS,
  IMS_VISIT_TYPES,
  type BbsObservation,
  type EmergencyDrill,
  type EWasteRecord,
  type HazidReport,
  type ImsAction,
  type ImsLocation,
  type InspectionChecklistItem,
  type InspectionDirectoryOption,
  type InspectionRecord,
  type InspectionWorkspace,
} from '@/lib/it-support/inspection-types';

export type ImsSection = 'dashboard' | 'inspections' | 'actions' | 'hazid' | 'bbs' | 'drills' | 'ewaste' | 'records' | 'locations';

const BASE = '/it-support/inspection-management';
const emptyWorkspace = (): InspectionWorkspace => ({
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
const areaClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';
const primaryBtn = 'inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60';
const secondaryBtn = 'inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const COLORS = ['#0f766e', '#0369a1', '#b45309', '#b91c1c', '#64748b'];

const TITLES: Record<ImsSection, string> = {
  dashboard: 'Dashboard',
  inspections: 'Inspections',
  actions: 'Corrective Actions',
  hazid: 'HAZID',
  bbs: 'Behaviour Based Safety',
  drills: 'Emergency Drills',
  ewaste: 'E-Waste',
  records: 'Records',
  locations: 'Inspection Schedules',
};

const checklistFromLocation = (location: ImsLocation): InspectionChecklistItem[] =>
  location.categories.flatMap((category) =>
    category.items.map((item) => ({
      categoryId: category.id,
      categoryName: category.name,
      itemId: item.id,
      itemName: item.name,
      itemDescription: item.description,
      status: 'Compliant',
      comment: '',
      risk: 'Low',
    })),
  );

const postIms = async (action: string, payload: unknown) => {
  const response = await fetch('/api/it-support/inspection-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status === 'error') throw new Error(body.error || 'Inspection Management could not finish that request.');
  return body.data as InspectionWorkspace;
};

const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const lines = [
    keys.join(','),
    ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export function ImsPortal({ section }: { section: ImsSection }) {
  const [data, setData] = useState<InspectionWorkspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<string | null>(null);
  const [expanded, setExpanded] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/it-support/inspection-management', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'Failed to load inspection management.');
      setData({ ...emptyWorkspace(), ...body.data });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load inspection management.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (action: string, payload: unknown) => {
    setBusy(true);
    setError('');
    try {
      const next = await postIms(action, payload);
      setData({ ...emptyWorkspace(), ...next });
      setModal(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kind: string, id: string) => {
    if (!window.confirm('Delete this record?')) return;
    await save('delete-ims', { kind, id });
  };

  const scored = data.inspections.filter((row) => row.checklist.length);
  const checklistItems = scored.flatMap((row) => row.checklist);
  const compliant = checklistItems.filter((item) => item.status === 'Compliant').length;
  const completion = checklistItems.length ? Math.round((compliant / checklistItems.length) * 100) : 0;
  const closed = data.actions.filter((row) => row.status === 'Closed').length;
  const closure = data.actions.length ? Math.round((closed / data.actions.length) * 100) : 0;
  const overdue = data.actions.filter(isActionOverdue).length;
  const drillAssigned = data.drills.reduce((sum, row) => sum + row.assignedPersonnel, 0);
  const drillPeople = data.drills.reduce((sum, row) => sum + row.participants, 0);
  const participation = drillAssigned ? Math.round((drillPeople / drillAssigned) * 100) : 0;
  const risks = highRisks(scored);

  const reminders = [
    ...data.locations
      .filter((row) => row.nextInspectionDate && row.nextInspectionDate <= plusDays(7))
      .map((row) => ({
        id: `loc-${row.locationId}`,
        text: `${row.name} inspection is ${row.nextInspectionDate! < today() ? 'overdue' : 'due'} ${row.nextInspectionDate}.`,
      })),
    ...data.actions.filter(isActionOverdue).map((row) => ({
      id: `car-${row.actionId}`,
      text: `Corrective action ${row.actionId} is overdue (${row.dueDate}).`,
    })),
  ].filter((row) => !dismissed.includes(row.id));

  const visibleInspections = data.inspections.filter((row) => !locationFilter || row.location === locationFilter || row.locationId === locationFilter);
  const visibleActions = data.actions.filter((row) => {
    if (statusFilter && actionBucket(row) !== statusFilter) return false;
    if (priorityFilter && row.priority !== priorityFilter) return false;
    if (overdueOnly && !isActionOverdue(row)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <ItSupportBreadcrumbs items={['Inspection Management', TITLES[section]]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{TITLES[section]}</h1>
          <p className="text-sm text-slate-500">Checklist inspections, corrective actions, and HSE records stored in DLE_Enterprise.</p>
        </div>
        <button type="button" className={secondaryBtn} onClick={() => void load()} disabled={loading || busy}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {section === 'dashboard' ? (
        <Dashboard
          completion={completion}
          closure={closure}
          overdue={overdue}
          ewaste={ewasteRate(data.ewaste)}
          hazid={data.hazid.length}
          bbs={data.bbs.length}
          participation={participation}
          risks={risks.length}
          reminders={reminders}
          onDismiss={(id) => setDismissed((current) => [...current, id])}
          inspections={scored}
          actions={data.actions}
          locations={data.locations}
          ewasteRows={data.ewaste}
        />
      ) : null}

      {section === 'locations' ? (
        <LocationsTable
          locations={data.locations}
          onCreate={() => setModal('schedule')}
          onEdit={(locationId) => setModal(locationId)}
        />
      ) : null}

      {section === 'inspections' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <select className={inputClass} style={{ maxWidth: 280 }} value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              <option value="">All locations</option>
              {data.locations.map((row) => <option key={row.locationId} value={row.name}>{row.name}</option>)}
            </select>
            <button type="button" className={primaryBtn} onClick={() => setModal('inspection')}>
              <Plus className="h-4 w-4" /> Record inspection
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  {['Inspection', 'Date', 'Location', 'Inspector', 'Type', 'Result', ''].map((heading) => <th key={heading} className="px-2 py-2">{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleInspections.map((row) => (
                  <InspectionRows
                    key={row.inspectionId}
                    row={row}
                    open={expanded === row.inspectionId}
                    actions={data.actions.filter((action) => action.inspectionId === row.inspectionId)}
                    onToggle={() => setExpanded(expanded === row.inspectionId ? '' : row.inspectionId)}
                    onEdit={() => setModal(row.inspectionId)}
                  />
                ))}
                {!visibleInspections.length ? <tr><td colSpan={7} className="px-2 py-6 text-slate-500">No inspections recorded yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === 'actions' ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <select className={inputClass} style={{ maxWidth: 180 }} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {[...IMS_ACTION_STATUSES, 'Overdue'].map((status) => <option key={status}>{status}</option>)}
            </select>
            <select className={inputClass} style={{ maxWidth: 180 }} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="">All priorities</option>
              {IMS_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
              Overdue only
            </label>
            <button type="button" className={`${primaryBtn} ml-auto`} onClick={() => setModal('action')} disabled={!data.inspections.length}>
              <Plus className="h-4 w-4" /> Add action
            </button>
          </div>
          <SimpleTable
            headers={['Action', 'Inspection', 'Location', 'Assigned', 'Priority', 'Status', 'Due', '']}
            rows={visibleActions.map((row) => [
              row.description,
              row.inspectionId,
              row.locationName || '—',
              row.assignedTo || '—',
              row.priority,
              actionBucket(row),
              row.dueDate || '—',
              <RowActions key={row.actionId} onEdit={() => setModal(row.actionId)} onDelete={() => void remove('action', row.actionId)} />,
            ])}
            empty="No corrective actions."
          />
        </section>
      ) : null}

      {section === 'hazid' ? (
        <Register
          title="Hazard reports"
          onAdd={() => setModal('hazid')}
          headers={['Report', 'Date', 'Location', 'Category', 'Risk', 'Status', '']}
          rows={data.hazid.map((row) => [row.reportId, row.date || '—', row.location || '—', row.category, row.riskLevel, row.status, <RowActions key={row.reportId} onEdit={() => setModal(row.reportId)} onDelete={() => void remove('hazid', row.reportId)} />])}
          empty="No HAZID reports."
        />
      ) : null}
      {section === 'bbs' ? (
        <Register
          title="Observations"
          onAdd={() => setModal('bbs')}
          headers={['Observation', 'Date', 'Observer', 'Department', 'Status', '']}
          rows={data.bbs.map((row) => [row.observationId, row.date || '—', row.observer || '—', row.department || '—', row.status, <RowActions key={row.observationId} onEdit={() => setModal(row.observationId)} onDelete={() => void remove('bbs', row.observationId)} />])}
          empty="No BBS observations."
        />
      ) : null}
      {section === 'drills' ? (
        <Register
          title="Drills"
          onAdd={() => setModal('drill')}
          headers={['Drill', 'Date', 'Type', 'Location', 'Participants', '']}
          rows={data.drills.map((row) => [row.drillId, row.date || '—', row.drillType, row.location || '—', `${row.participants}/${row.assignedPersonnel}`, <RowActions key={row.drillId} onEdit={() => setModal(row.drillId)} onDelete={() => void remove('drill', row.drillId)} />])}
          empty="No emergency drills."
        />
      ) : null}
      {section === 'ewaste' ? (
        <Register
          title="Disposal records"
          onAdd={() => setModal('ewaste')}
          headers={['Asset', 'Type', 'Location', 'Status', 'Certificate', '']}
          rows={data.ewaste.map((row) => [row.assetTag, row.assetType, row.location || '—', row.approvalStatus, row.certificateNumber || '—', <RowActions key={row.recordId} onEdit={() => setModal(row.recordId)} onDelete={() => void remove('ewaste', row.recordId)} />])}
          empty="No e-waste records."
        />
      ) : null}
      {section === 'records' ? <Records data={data} /> : null}

      {modal === 'inspection' || data.inspections.some((row) => row.inspectionId === modal) ? (
        <InspectionForm
          busy={busy}
          locations={data.locations}
          directory={data.directory}
          initial={data.inspections.find((row) => row.inspectionId === modal) || null}
          onClose={() => setModal(null)}
          onSave={(payload) => void save('upsert-ims-inspection', payload)}
        />
      ) : null}
      {modal === 'action' || data.actions.some((row) => row.actionId === modal) ? (
        <ActionForm
          busy={busy}
          inspections={data.inspections}
          employees={data.directory.employees}
          initial={data.actions.find((row) => row.actionId === modal) || null}
          onClose={() => setModal(null)}
          onSave={(payload) => void save('upsert-action', payload)}
        />
      ) : null}
      {modal === 'hazid' || data.hazid.some((row) => row.reportId === modal) ? (
        <HazidForm busy={busy} locations={data.locations} directory={data.directory} initial={data.hazid.find((row) => row.reportId === modal) || null} onClose={() => setModal(null)} onSave={(payload) => void save('upsert-hazid', payload)} />
      ) : null}
      {modal === 'bbs' || data.bbs.some((row) => row.observationId === modal) ? (
        <BbsForm busy={busy} directory={data.directory} initial={data.bbs.find((row) => row.observationId === modal) || null} onClose={() => setModal(null)} onSave={(payload) => void save('upsert-bbs', payload)} />
      ) : null}
      {modal === 'drill' || data.drills.some((row) => row.drillId === modal) ? (
        <DrillForm busy={busy} locations={data.locations} directory={data.directory} initial={data.drills.find((row) => row.drillId === modal) || null} onClose={() => setModal(null)} onSave={(payload) => void save('upsert-drill', payload)} />
      ) : null}
      {section === 'locations' && (modal === 'schedule' || data.locations.some((row) => row.locationId === modal)) ? (
        <ScheduleForm
          key={modal || 'schedule'}
          busy={busy}
          locations={data.locations}
          directory={data.directory}
          initial={data.locations.find((row) => row.locationId === modal) || null}
          onClose={() => setModal(null)}
          onSave={(payload) => void save('upsert-location-schedule', payload)}
        />
      ) : null}
      {modal === 'ewaste' || data.ewaste.some((row) => row.recordId === modal) ? (
        <WasteForm busy={busy} locations={data.locations} directory={data.directory} assets={data.assets} initial={data.ewaste.find((row) => row.recordId === modal) || null} onClose={() => setModal(null)} onSave={(payload) => void save('upsert-ewaste', payload)} />
      ) : null}
    </div>
  );
}

function Dashboard({
  completion, closure, overdue, ewaste, hazid, bbs, participation, risks, reminders, onDismiss, inspections, actions, locations, ewasteRows,
}: {
  completion: number;
  closure: number;
  overdue: number;
  ewaste: number;
  hazid: number;
  bbs: number;
  participation: number;
  risks: number;
  reminders: Array<{ id: string; text: string }>;
  onDismiss: (id: string) => void;
  inspections: InspectionRecord[];
  actions: ImsAction[];
  locations: ImsLocation[];
  ewasteRows: EWasteRecord[];
}) {
  const cards = [
    ['Inspection completion', `${completion}%`, `${BASE}/inspections`],
    ['CAR closure rate', `${closure}%`, `${BASE}/corrective-actions`],
    ['Overdue actions', String(overdue), `${BASE}/corrective-actions`],
    ['E-waste compliance', `${ewaste}%`, `${BASE}/ewaste`],
    ['HAZID reports', String(hazid), `${BASE}/hazid`],
    ['BBS observations', String(bbs), `${BASE}/bbs`],
    ['Drill participation', `${participation}%`, `${BASE}/emergency-drills`],
    ['High & critical risks', String(risks), `${BASE}/inspections`],
  ];
  const status = ['Open', 'In Progress', 'Closed', 'Overdue'].map((name) => ({
    name,
    value: actions.filter((row) => actionBucket(row) === name).length,
  }));
  const waste = EWASTE_STATUSES.map((name) => ({ name, value: ewasteRows.filter((row) => row.approvalStatus === name).length }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
            {label === 'CAR closure rate' ? <div className="mt-1 text-xs text-slate-500">Target 95%</div> : null}
          </Link>
        ))}
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Reminders</h2>
        {reminders.length ? reminders.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 text-sm">
            <span>{row.text}</span>
            <button type="button" className="text-xs font-semibold text-teal-700" onClick={() => onDismiss(row.id)}>Dismiss</button>
          </div>
        )) : <p className="text-sm text-slate-500">No inspections due in the next 7 days and no overdue actions.</p>}
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Monthly compliance">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyCompliance(inspections)}>
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="compliance" fill="#0f766e" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="CAR status">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={status} dataKey="value" nameKey="name" outerRadius={80} label>
                {status.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="CAR aging">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={carAging(actions)}>
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#0369a1" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="High and critical risk by location">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={riskByLocation(inspections, locations)}>
              <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} height={50} />
              <YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#b45309" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="E-waste status">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={waste} dataKey="value" nameKey="name" outerRadius={80} label>
                {waste.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function LocationsTable({ locations, onCreate, onEdit }: { locations: ImsLocation[]; onCreate: () => void; onEdit: (locationId: string) => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Location checklist schedule</h2>
        <button type="button" className={primaryBtn} onClick={onCreate}><Plus className="h-4 w-4" /> New schedule</button>
      </div>
      <SimpleTable
        headers={['Location', 'Frequency', 'Last inspection', 'Next inspection', '']}
        rows={locations.map((row) => [
          row.name,
          row.frequency,
          row.lastInspectionDate || '—',
          <span key={row.locationId} className={row.nextInspectionDate && row.nextInspectionDate < today() ? 'font-semibold text-red-700' : ''}>{row.nextInspectionDate || '—'}</span>,
          <button key={`${row.locationId}-edit`} type="button" className="text-xs font-semibold text-teal-700" onClick={() => onEdit(row.locationId)}>Edit</button>,
        ])}
        empty="No schedules yet. Create one for a location."
      />
    </section>
  );
}

function ScheduleForm({ busy, locations, directory, initial, onClose, onSave }: {
  busy: boolean;
  locations: ImsLocation[];
  directory: InspectionWorkspace['directory'];
  initial: ImsLocation | null;
  onClose: () => void;
  onSave: (payload: unknown) => void;
}) {
  const [form, setForm] = useState({
    locationId: initial?.locationId || '',
    name: initial?.name || '',
    frequency: initial?.frequency || 'Monthly',
    nextInspectionDate: initial?.nextInspectionDate || plusDays(30),
    templateId: locations.find((row) => row.categories.length)?.locationId || '',
  });
  const matched = locations.find((row) => row.name === form.name);
  const creating = !initial && !matched;
  return (
    <Modal title={initial || matched ? 'Edit schedule' : 'New schedule'} onClose={onClose}>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            locationId: initial?.locationId || matched?.locationId || '',
            name: form.name,
            frequency: form.frequency,
            nextInspectionDate: form.nextInspectionDate,
            templateId: creating ? form.templateId : '',
          });
        }}
      >
        <DirectorySelect label="Location" value={form.name} options={locationOptionsFor(locations, directory.locations)} placeholder="Search locations" onChange={(name) => setForm({ ...form, name })} />
        <Field label="Frequency">
          <select className={inputClass} value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>
            {IMS_FREQUENCIES.map((frequency) => <option key={frequency}>{frequency}</option>)}
          </select>
        </Field>
        <Field label="Next inspection">
          <input type="date" className={inputClass} value={form.nextInspectionDate} onChange={(event) => setForm({ ...form, nextInspectionDate: event.target.value })} required />
        </Field>
        {creating ? (
          <Field label="Checklist">
            <select className={inputClass} value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })} required>
              {locations.filter((row) => row.categories.length).map((row) => <option key={row.locationId} value={row.locationId}>{row.name}</option>)}
            </select>
          </Field>
        ) : null}
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy || !form.name}>{initial || matched ? 'Save schedule' : 'Create schedule'}</button>
        </div>
      </form>
    </Modal>
  );
}

function InspectionRows({
  row, open, actions, onToggle, onEdit,
}: {
  row: InspectionRecord;
  open: boolean;
  actions: ImsAction[];
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-2 py-2 font-medium">{row.inspectionId}</td>
        <td className="px-2 py-2">{row.completedDate || row.scheduledDate || '—'}</td>
        <td className="px-2 py-2">{row.location || '—'}</td>
        <td className="px-2 py-2">{row.inspectorName || '—'}</td>
        <td className="px-2 py-2">{row.visitType || row.inspectionType}</td>
        <td className="px-2 py-2">{row.result || row.status}</td>
        <td className="px-2 py-2 text-right">
          <button type="button" className="mr-3 text-xs font-semibold text-teal-700" onClick={onToggle}>{open ? 'Hide' : 'Checklist'}</button>
          {row.checklist.length ? <button type="button" className="text-xs font-semibold text-slate-600" onClick={onEdit}>Edit</button> : null}
        </td>
      </tr>
      {open ? (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-3 py-3">
            {row.checklist.length ? row.checklist.map((item) => (
              <div key={item.itemId} className="grid gap-2 border-b border-slate-200 py-2 text-xs md:grid-cols-4">
                <span className="font-medium text-slate-700">{item.categoryName}: {item.itemName}</span>
                <span>{item.status}</span>
                <span>{item.risk}</span>
                <span className="text-slate-500">{item.comment || item.itemDescription}</span>
              </div>
            )) : <p className="text-xs text-slate-500">This earlier inspection has no checklist scores.</p>}
            {actions.length ? <p className="mt-2 text-xs text-slate-600">Actions: {actions.map((action) => `${action.actionId} (${actionBucket(action)})`).join(', ')}</p> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Register({ title, onAdd, headers, rows, empty }: { title: string; onAdd: () => void; headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <button type="button" className={primaryBtn} onClick={onAdd}><Plus className="h-4 w-4" /> Add</button>
      </div>
      <SimpleTable headers={headers} rows={rows} empty={empty} />
    </section>
  );
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>{headers.map((heading) => <th key={heading} className="px-2 py-2">{heading}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index} className="border-t border-slate-100">
              {cells.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-2 align-top">{cell}</td>)}
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={headers.length} className="px-2 py-6 text-slate-500">{empty}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="inline-flex gap-2">
      <button type="button" className="text-xs font-semibold text-teal-700" onClick={onEdit}>Edit</button>
      <button type="button" className="text-xs font-semibold text-red-700" onClick={onDelete}><Trash2 className="inline h-3 w-3" /></button>
    </span>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="my-6 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className={labelClass}>{label}</span>{children}</label>;
}

function DirectorySelect({ label, value, options, placeholder, onChange }: {
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
  const filtered = choices.filter((option) => `${option.label} ${option.hint || ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40);
  return (
    <label className={`relative block ${open ? 'z-20' : ''}`}>
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        value={open ? query : (choices.find((option) => option.value === value)?.label || value)}
        placeholder={placeholder}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); if (!event.target.value) onChange(''); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-teal-50"
              onMouseDown={(event) => { event.preventDefault(); onChange(option.value); setOpen(false); }}
            >
              <span className="block">{option.label}</span>
              {option.hint ? <span className="block text-xs text-slate-500">{option.hint}</span> : null}
            </button>
          ))}
          {!filtered.length ? <div className="px-3 py-2 text-sm text-slate-500">No matches</div> : null}
        </div>
      ) : null}
    </label>
  );
}

function InspectionForm({
  busy, locations, directory, initial, onClose, onSave,
}: {
  busy: boolean;
  locations: ImsLocation[];
  directory: InspectionWorkspace['directory'];
  initial: InspectionRecord | null;
  onClose: () => void;
  onSave: (payload: unknown) => void;
}) {
  const [form, setForm] = useState({
    inspectionId: initial?.inspectionId || '',
    locationId: initial?.locationId || locations[0]?.locationId || '',
    department: initial?.department || '',
    inspectorName: initial?.inspectorName || '',
    scheduledDate: initial?.completedDate || initial?.scheduledDate || today(),
    visitType: initial?.visitType || 'Scheduled',
    notes: initial?.notes || '',
    checklist: initial?.checklist?.length ? initial.checklist : (locations[0] ? checklistFromLocation(locations[0]) : []),
  });
  const chooseLocation = (locationId: string) => {
    const location = locations.find((row) => row.locationId === locationId);
    setForm((current) => ({ ...current, locationId, checklist: location ? checklistFromLocation(location) : [] }));
  };
  return (
    <Modal title={initial ? 'Update inspection' : 'Record inspection'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Date">
            <input type="date" className={inputClass} value={form.scheduledDate} onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })} required />
          </Field>
          <Field label="Visit type">
            <select className={inputClass} value={form.visitType} onChange={(event) => setForm({ ...form, visitType: event.target.value })}>
              {IMS_VISIT_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Checklist location">
            <select className={inputClass} value={form.locationId} onChange={(event) => chooseLocation(event.target.value)} required>
              {locations.map((row) => <option key={row.locationId} value={row.locationId}>{row.name}</option>)}
            </select>
          </Field>
          <DirectorySelect label="Department" value={form.department} options={directory.departments} placeholder="Search departments" onChange={(department) => setForm({ ...form, department })} />
          <DirectorySelect label="Inspector" value={form.inspectorName} options={directory.employees} placeholder="Search employees" onChange={(inspectorName) => setForm({ ...form, inspectorName })} />
        </div>
        <div className="max-h-80 space-y-3 overflow-auto rounded-lg border border-slate-200 p-3">
          {form.checklist.map((item, index) => (
            <div key={item.itemId} className="grid gap-2 border-b border-slate-100 pb-3 md:grid-cols-4">
              <div className="md:col-span-4">
                <div className="text-xs font-semibold text-teal-800">{item.categoryName}</div>
                <div className="text-sm font-medium text-slate-800">{item.itemName}</div>
                <div className="text-xs text-slate-500">{item.itemDescription}</div>
              </div>
              <select className={inputClass} value={item.status} onChange={(event) => {
                const checklist = [...form.checklist];
                checklist[index] = { ...item, status: event.target.value };
                setForm({ ...form, checklist });
              }}>
                {IMS_CHECK_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
              <select className={inputClass} value={item.risk} onChange={(event) => {
                const checklist = [...form.checklist];
                checklist[index] = { ...item, risk: event.target.value };
                setForm({ ...form, checklist });
              }}>
                {IMS_RISKS.map((risk) => <option key={risk}>{risk}</option>)}
              </select>
              <input className={`${inputClass} md:col-span-2`} placeholder="Comment" value={item.comment} onChange={(event) => {
                const checklist = [...form.checklist];
                checklist[index] = { ...item, comment: event.target.value };
                setForm({ ...form, checklist });
              }} />
            </div>
          ))}
          {!form.checklist.length ? <p className="text-sm text-slate-500">Checklist locations load from DLE_Enterprise.</p> : null}
        </div>
        <textarea className={areaClass} rows={2} placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy}>{busy ? 'Saving…' : 'Save inspection'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ActionForm({ busy, inspections, employees, initial, onClose, onSave }: {
  busy: boolean;
  inspections: InspectionRecord[];
  employees: InspectionDirectoryOption[];
  initial: ImsAction | null;
  onClose: () => void;
  onSave: (payload: unknown) => void;
}) {
  const [form, setForm] = useState({
    actionId: initial?.actionId || '',
    inspectionId: initial?.inspectionId || inspections[0]?.inspectionId || '',
    description: initial?.description || '',
    assignedTo: initial?.assignedTo || '',
    priority: initial?.priority || 'Medium',
    status: initial?.status || 'Open',
    dueDate: initial?.dueDate || plusDays(7),
    closureDate: initial?.closureDate || '',
    verificationComments: initial?.verificationComments || '',
  });
  return (
    <Modal title={initial ? 'Update corrective action' : 'Add corrective action'} onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <Field label="Related inspection">
          <select className={inputClass} value={form.inspectionId} onChange={(event) => setForm({ ...form, inspectionId: event.target.value })} required>
            {inspections.map((row) => <option key={row.inspectionId} value={row.inspectionId}>{row.inspectionId} · {row.location || row.title}</option>)}
          </select>
        </Field>
        <Field label="Description"><textarea className={areaClass} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <DirectorySelect label="Assigned to" value={form.assignedTo} options={employees} placeholder="Search employees" onChange={(assignedTo) => setForm({ ...form, assignedTo })} />
          <Field label="Priority">
            <select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {IMS_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {IMS_ACTION_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Due date"><input type="date" className={inputClass} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></Field>
          <Field label="Verification comments"><input className={inputClass} value={form.verificationComments} onChange={(event) => setForm({ ...form, verificationComments: event.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy}>Save action</button>
        </div>
      </form>
    </Modal>
  );
}

function HazidForm({ busy, locations, directory, initial, onClose, onSave }: {
  busy: boolean;
  locations: ImsLocation[];
  directory: InspectionWorkspace['directory'];
  initial: HazidReport | null;
  onClose: () => void;
  onSave: (payload: unknown) => void;
}) {
  const locationOptions = locationOptionsFor(locations, directory.locations);
  const [form, setForm] = useState({
    reportId: initial?.reportId || '',
    date: initial?.date || today(),
    reporter: initial?.reporter || '',
    category: initial?.category || HAZID_CATEGORIES[0],
    description: initial?.description || '',
    riskLevel: initial?.riskLevel || 'Medium',
    correctiveAction: initial?.correctiveAction || '',
    status: initial?.status || 'Open',
    location: initial?.location || '',
  });
  return (
    <Modal title={initial ? 'Update HAZID' : 'New HAZID report'} onClose={onClose}>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></Field>
        <DirectorySelect label="Reporter" value={form.reporter} options={directory.employees} placeholder="Search employees" onChange={(reporter) => setForm({ ...form, reporter })} />
        <DirectorySelect label="Location" value={form.location} options={locationOptions} placeholder="Search locations" onChange={(location) => setForm({ ...form, location })} />
        <Field label="Category">
          <select className={inputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {HAZID_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
          </select>
        </Field>
        <Field label="Risk">
          <select className={inputClass} value={form.riskLevel} onChange={(event) => setForm({ ...form, riskLevel: event.target.value })}>
            {IMS_RISKS.map((risk) => <option key={risk}>{risk}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {IMS_ACTION_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </Field>
        <label className="md:col-span-2"><span className={labelClass}>Description</span><textarea className={areaClass} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label>
        <label className="md:col-span-2"><span className={labelClass}>Corrective action</span><textarea className={areaClass} rows={2} value={form.correctiveAction || ''} onChange={(event) => setForm({ ...form, correctiveAction: event.target.value })} /></label>
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy}>Save report</button>
        </div>
      </form>
    </Modal>
  );
}

function BbsForm({ busy, directory, initial, onClose, onSave }: {
  busy: boolean;
  directory: InspectionWorkspace['directory'];
  initial: BbsObservation | null;
  onClose: () => void;
  onSave: (payload: unknown) => void;
}) {
  const [form, setForm] = useState({
    observationId: initial?.observationId || '',
    observer: initial?.observer || '',
    date: initial?.date || today(),
    safeBehaviour: initial?.safeBehaviour || '',
    unsafeBehaviour: initial?.unsafeBehaviour || '',
    comments: initial?.comments || '',
    recommendedAction: initial?.recommendedAction || '',
    status: initial?.status || 'Open',
    department: initial?.department || '',
  });
  return (
    <Modal title={initial ? 'Update observation' : 'New observation'} onClose={onClose}>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></Field>
        <DirectorySelect label="Observer" value={form.observer} options={directory.employees} placeholder="Search employees" onChange={(observer) => setForm({ ...form, observer })} />
        <DirectorySelect label="Department" value={form.department} options={directory.departments} placeholder="Search departments" onChange={(department) => setForm({ ...form, department })} />
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {IMS_ACTION_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </Field>
        <label className="md:col-span-2"><span className={labelClass}>Safe behaviour</span><textarea className={areaClass} rows={2} value={form.safeBehaviour || ''} onChange={(event) => setForm({ ...form, safeBehaviour: event.target.value })} /></label>
        <label className="md:col-span-2"><span className={labelClass}>Unsafe behaviour</span><textarea className={areaClass} rows={2} value={form.unsafeBehaviour || ''} onChange={(event) => setForm({ ...form, unsafeBehaviour: event.target.value })} /></label>
        <label className="md:col-span-2"><span className={labelClass}>Comments</span><textarea className={areaClass} rows={2} value={form.comments || ''} onChange={(event) => setForm({ ...form, comments: event.target.value })} /></label>
        <label className="md:col-span-2"><span className={labelClass}>Recommended action</span><textarea className={areaClass} rows={2} value={form.recommendedAction || ''} onChange={(event) => setForm({ ...form, recommendedAction: event.target.value })} /></label>
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy}>Save observation</button>
        </div>
      </form>
    </Modal>
  );
}

function DrillForm({ busy, locations, directory, initial, onClose, onSave }: {
  busy: boolean;
  locations: ImsLocation[];
  directory: InspectionWorkspace['directory'];
  initial: EmergencyDrill | null;
  onClose: () => void;
  onSave: (payload: unknown) => void;
}) {
  const [form, setForm] = useState({
    drillId: initial?.drillId || '',
    date: initial?.date || today(),
    drillType: initial?.drillType || DRILL_TYPES[0],
    participants: initial?.participants || 0,
    assignedPersonnel: initial?.assignedPersonnel || 0,
    outcome: initial?.outcome || '',
    findings: initial?.findings || '',
    correctiveActions: initial?.correctiveActions || '',
    duration: initial?.duration || 0,
    location: initial?.location || '',
  });
  const invalid = form.participants > form.assignedPersonnel || form.participants < 0 || form.assignedPersonnel < 0;
  return (
    <Modal title={initial ? 'Update drill' : 'Record drill'} onClose={onClose}>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!invalid) onSave(form); }}>
        <Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></Field>
        <Field label="Drill type">
          <select className={inputClass} value={form.drillType} onChange={(event) => setForm({ ...form, drillType: event.target.value })}>
            {DRILL_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Participants"><input type="number" min={0} className={inputClass} value={form.participants} onChange={(event) => setForm({ ...form, participants: Number(event.target.value) })} required /></Field>
        <Field label="Assigned personnel"><input type="number" min={0} className={inputClass} value={form.assignedPersonnel} onChange={(event) => setForm({ ...form, assignedPersonnel: Number(event.target.value) })} required /></Field>
        <Field label="Duration (minutes)"><input type="number" min={0} className={inputClass} value={form.duration} onChange={(event) => setForm({ ...form, duration: Number(event.target.value) })} /></Field>
        <DirectorySelect label="Location" value={form.location} options={locationOptionsFor(locations, directory.locations)} placeholder="Search locations" onChange={(location) => setForm({ ...form, location })} />
        <label className="md:col-span-2"><span className={labelClass}>Outcome</span><textarea className={areaClass} rows={2} value={form.outcome || ''} onChange={(event) => setForm({ ...form, outcome: event.target.value })} required /></label>
        <label className="md:col-span-2"><span className={labelClass}>Findings</span><textarea className={areaClass} rows={2} value={form.findings || ''} onChange={(event) => setForm({ ...form, findings: event.target.value })} required /></label>
        <label className="md:col-span-2"><span className={labelClass}>Corrective actions</span><textarea className={areaClass} rows={2} value={form.correctiveActions || ''} onChange={(event) => setForm({ ...form, correctiveActions: event.target.value })} /></label>
        {invalid ? <p className="md:col-span-2 text-sm text-red-600">Participants cannot exceed assigned personnel, and counts cannot be negative.</p> : null}
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy || invalid}>Save drill</button>
        </div>
      </form>
    </Modal>
  );
}

const ewasteTypeFor = (asset: InspectionAssetOption) => {
  const text = `${asset.category} ${asset.subCategory || ''} ${asset.name} ${asset.model || ''}`.toLowerCase();
  if (text.includes('laptop')) return 'Laptops';
  if (text.includes('printer')) return 'Printers';
  if (text.includes('ups')) return 'UPS Systems';
  if (text.includes('batter')) return 'Batteries';
  if (text.includes('monitor') || text.includes('display')) return 'Monitors';
  if (text.includes('server')) return 'Servers';
  if (/(network|switch|router|firewall)/.test(text)) return 'Network Equipment';
  if (text.includes('phone') || text.includes('mobile')) return 'Mobile Devices';
  if (/(storage|disk|nas|tape)/.test(text)) return 'Storage Media';
  if (/(mouse|keyboard|peripheral)/.test(text)) return 'Peripherals';
  return 'Computers';
};

function WasteForm({ busy, locations, directory, assets, initial, onClose, onSave }: {
  busy: boolean;
  locations: ImsLocation[];
  directory: InspectionWorkspace['directory'];
  assets: InspectionAssetOption[];
  initial: EWasteRecord | null;
  onClose: () => void;
  onSave: (payload: unknown) => void;
}) {
  const [form, setForm] = useState({
    recordId: initial?.recordId || '',
    assetTag: initial?.assetTag || '',
    serialNumber: initial?.serialNumber || '',
    assetDescription: initial?.assetDescription || '',
    assetType: initial?.assetType || EWASTE_TYPES[0],
    location: initial?.location || '',
    disposalReason: initial?.disposalReason || '',
    disposalDate: initial?.disposalDate || today(),
    approvalStatus: initial?.approvalStatus || 'Pending',
    vendor: initial?.vendor || '',
    certificateNumber: initial?.certificateNumber || '',
    workflowStep: initial?.workflowStep || 1,
  });
  const assetOptions = assets.map((asset) => ({
    value: asset.assetTag,
    label: `${asset.assetTag} — ${asset.name}`,
    hint: [asset.serialNumber, asset.subCategory || asset.category, asset.location].filter(Boolean).join(' · ') || undefined,
  }));
  const chooseAsset = (assetTag: string) => {
    const asset = assets.find((row) => row.assetTag === assetTag);
    if (!asset) {
      setForm((current) => ({ ...current, assetTag, serialNumber: assetTag ? current.serialNumber : '', assetDescription: assetTag ? current.assetDescription : '' }));
      return;
    }
    setForm((current) => ({
      ...current,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber || '',
      assetDescription: [asset.name, asset.model].filter(Boolean).join(' · '),
      assetType: ewasteTypeFor(asset),
      location: asset.location || current.location,
    }));
  };
  return (
    <Modal title={initial ? 'Update asset' : 'Add e-waste asset'} onClose={onClose}>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="md:col-span-2">
          <DirectorySelect label="IT asset" value={form.assetTag} options={assetOptions} placeholder="Search asset tag or name" onChange={chooseAsset} />
        </div>
        <Field label="Asset tag"><input className={`${inputClass} bg-slate-50`} value={form.assetTag} readOnly required placeholder="Select an IT asset" /></Field>
        <Field label="Serial number"><input className={`${inputClass} bg-slate-50`} value={form.serialNumber || ''} readOnly placeholder="Filled from the asset register" /></Field>
        <Field label="Description"><input className={inputClass} value={form.assetDescription} onChange={(event) => setForm({ ...form, assetDescription: event.target.value })} required /></Field>
        <Field label="Asset type">
          <select className={inputClass} value={form.assetType} onChange={(event) => setForm({ ...form, assetType: event.target.value })}>
            {EWASTE_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <DirectorySelect label="Location" value={form.location} options={locationOptionsFor(locations, directory.locations)} placeholder="Search locations" onChange={(location) => setForm({ ...form, location })} />
        <Field label="Disposal reason"><input className={inputClass} value={form.disposalReason || ''} onChange={(event) => setForm({ ...form, disposalReason: event.target.value })} required /></Field>
        <Field label="Disposal date"><input type="date" className={inputClass} value={form.disposalDate || ''} onChange={(event) => setForm({ ...form, disposalDate: event.target.value })} required /></Field>
        <Field label="Vendor"><input className={inputClass} value={form.vendor || ''} onChange={(event) => setForm({ ...form, vendor: event.target.value })} required /></Field>
        <Field label="Certificate number"><input className={inputClass} value={form.certificateNumber || ''} onChange={(event) => setForm({ ...form, certificateNumber: event.target.value })} /></Field>
        <Field label="Approval status">
          <select className={inputClass} value={form.approvalStatus} onChange={(event) => setForm({ ...form, approvalStatus: event.target.value })}>
            {EWASTE_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </Field>
        <Field label="Workflow step"><input type="number" min={1} className={inputClass} value={form.workflowStep} onChange={(event) => setForm({ ...form, workflowStep: Number(event.target.value) || 1 })} /></Field>
        <div className="md:col-span-2 flex justify-end gap-2">
          <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryBtn} disabled={busy}>Save asset</button>
        </div>
      </form>
    </Modal>
  );
}

function Records({ data }: { data: InspectionWorkspace }) {
  const sets: Array<[string, string, Array<Record<string, unknown>>]> = [
    ['inspections.csv', 'Inspections', data.inspections.map((row) => ({ id: row.inspectionId, date: row.completedDate, location: row.location, inspector: row.inspectorName, type: row.visitType || row.inspectionType, result: row.result, items: row.checklist.length }))],
    ['corrective-actions.csv', 'Corrective actions', data.actions.map((row) => ({ ...row }))],
    ['hazid.csv', 'HAZID', data.hazid.map((row) => ({ ...row }))],
    ['bbs.csv', 'BBS', data.bbs.map((row) => ({ ...row }))],
    ['drills.csv', 'Emergency drills', data.drills.map((row) => ({ ...row }))],
    ['ewaste.csv', 'E-waste', data.ewaste.map((row) => ({ ...row }))],
  ];
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {sets.map(([filename, label, rows]) => (
        <div key={filename} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <div className="font-semibold text-slate-800">{label}</div>
            <div className="text-sm text-slate-500">{rows.length} records</div>
          </div>
          <button type="button" className={secondaryBtn} disabled={!rows.length} onClick={() => downloadCsv(filename, rows)}>
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      ))}
    </section>
  );
}

function locationOptionsFor(locations: ImsLocation[], directory: InspectionDirectoryOption[]) {
  const values = new Map<string, InspectionDirectoryOption>();
  for (const location of locations) values.set(location.name, { value: location.name, label: location.name, hint: location.frequency });
  for (const option of directory) if (!values.has(option.value)) values.set(option.value, option);
  return [...values.values()];
}
