'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, SearchCombo, personDetail, personLabel } from '../components/UI';
import { formatDisplayDate, usePortalData } from '../portal-data';

const TABS = ['Mobilized Crew', 'New Mobilization', 'Demobilization', 'Returning Crew', 'History', 'Exceptions'];
const OPEN = ['Planned', 'Mobilized', 'Extended'];
const PAGE_SIZE = 15;
const toneFor = (status) => {
  const value = String(status || '');
  if (/overdue|block|conflict|inactive/i.test(value)) return 'red';
  if (/extended|ending|warning|planned/i.test(value)) return 'amber';
  if (/returned|demobilized|eligible/i.test(value)) return 'green';
  if (/mobilized/i.test(value)) return 'blue';
  return 'slate';
};

const post = async (payload) => {
  const response = await fetch('/api/timesheet-management/mobilization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status === 'error') throw new Error(body.error || 'Request failed.');
  return body.data;
};

export default function OffshoreMobilization() {
  const { snapshot } = usePortalData();
  const [tab, setTab] = useState(TABS[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [periodId, setPeriodId] = useState('');
  const [project, setProject] = useState('');
  const [site, setSite] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [workspace, setWorkspace] = useState({ kpis: {}, rows: [], tomorrow: '', week: '' });
  const [history, setHistory] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'employeeName', dir: 1 });
  const [returnWindow, setReturnWindow] = useState('All');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: 'workspace', date, periodId, project, site, supervisor, status, q: query });
      const response = await fetch(`/api/timesheet-management/mobilization?${params}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'Unable to load mobilization.');
      setWorkspace(body.data || { kpis: {}, rows: [] });
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(handle);
  }, [date, periodId, project, site, supervisor, status, query]);
  useEffect(() => {
    if (tab === 'History') fetch('/api/timesheet-management/mobilization?mode=history', { cache: 'no-store' }).then((response) => response.json()).then((body) => setHistory(body.data || [])).catch(() => setHistory([]));
    if (tab === 'Exceptions') fetch('/api/timesheet-management/mobilization?mode=exceptions', { cache: 'no-store' }).then((response) => response.json()).then((body) => setExceptions(body.data || [])).catch(() => setExceptions([]));
  }, [tab, notice]);

  const rows = workspace.rows || [];
  const view = useMemo(() => {
    let next = rows;
    if (tab === 'Mobilized Crew' && !status) next = rows.filter((row) => OPEN.includes(row.status));
    if (tab === 'Demobilization') next = rows.filter((row) => OPEN.includes(row.status) && row.effectiveFrom <= date);
    if (tab === 'Returning Crew') {
      next = rows.filter((row) => OPEN.includes(row.status));
      if (returnWindow === 'Today') next = next.filter((row) => row.expectedReturn === date);
      if (returnWindow === 'Tomorrow') next = next.filter((row) => row.expectedReturn === workspace.tomorrow);
      if (returnWindow === 'This week') next = next.filter((row) => row.expectedReturn > date && row.expectedReturn <= workspace.week);
      if (returnWindow === 'Overdue') next = next.filter((row) => row.expectedReturn < date);
    }
    if (tab === 'New Mobilization') next = [];
    return [...next].sort((a, b) => String(a[sort.key] || '').localeCompare(String(b[sort.key] || '')) * sort.dir);
  }, [rows, tab, status, date, workspace.tomorrow, workspace.week, sort, returnWindow]);
  const pageCount = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const visible = view.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const kpis = workspace.kpis || {};

  const run = async (payload, success) => {
    setError('');
    const result = await post(payload);
    setNotice(success(result));
    setModal(null);
    setPicked([]);
    await load();
  };

  return <>
    <div className="pageTitle"><div><span className="eyebrow">TIMESHEET MANAGEMENT</span><h1>Offshore & Mobilization</h1><p>Mobilization establishes an authorized temporary offshore assignment. It does not create attendance or worked or payable hours.</p></div><div className="actions"><Button onClick={() => setModal('create')}>+ New Mobilization</Button></div></div>
    {(error || notice) && <div className="success" style={error ? { background: '#fef2f2', color: '#991b1b' } : undefined}>{error || notice} <button onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
    <div className="tabs">{TABS.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setPage(1); if (item === 'New Mobilization') setModal('create'); }}>{item}</button>)}</div>
    <section className="metricGrid offshoreMetrics">
      <div className="metric"><span>Currently Mobilized</span><b>{loading ? '…' : kpis.mobilized || 0}</b><small>Authorized offshore on {formatDisplayDate(date)}</small></div>
      <div className="metric"><span>Mobilizing Today</span><b>{kpis.mobilizingToday || 0}</b><small>Effective from this date</small></div>
      <div className="metric"><span>Returning Today</span><b>{kpis.returningToday || 0}</b><small>Expected back today</small></div>
      <div className="metric"><span>Overdue Return</span><b>{kpis.overdue || 0}</b><small>Still offshore after the expected return</small></div>
      <div className="metric"><span>Active Offshore Projects</span><b>{kpis.projects || 0}</b><small>Projects with mobilized crew</small></div>
      <div className="metric"><span>Exceptions</span><b>{kpis.exceptions || 0}</b><small>Open conflicts on this date</small></div>
    </section>
    {tab === 'History' ? <HistoryTable rows={history} onOpen={(id) => setModal({ type: 'batch', id })} /> : tab === 'Exceptions' ? <ExceptionTable rows={exceptions} onAcknowledge={(row) => run({ action: 'acknowledge', employeeRowId: row.employeeRowId, issue: row.key }, () => `${row.issue} acknowledged. Timesheet and payroll rows were not changed.`)} /> : <>
      <section className="panel">
        <div className="panelHead"><div><h3>{tab}</h3><p>Effective-dated offshore records. Home crew, location, and work centre stay unchanged.</p></div><input className="searchInput" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search employee, project, site..." /></div>
        <div className="filterRow offshoreFilters">
          <Field label="Timesheet Period"><select value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">All periods</option>{snapshot.periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          <SearchCombo label="Project" placeholder="All projects" value={project} onSelect={(item) => setProject(item?.code || '')} search={(q) => fetch(`/api/timesheet-management/entry?mode=search&kind=project&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={(item) => `${item.code} — ${item.name}`} />
          <SearchCombo label="Offshore Location / Site" placeholder="All sites" value={site} onSelect={(item) => setSite(item?.name || '')} search={(q) => fetch(`/api/timesheet-management/mobilization?mode=search&kind=site&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={(item) => item.name} />
          <SearchCombo label="Supervisor" placeholder="All supervisors" value={supervisor} onSelect={(item) => setSupervisor(item?.name || '')} search={(q) => fetch(`/api/timesheet-management/entry?mode=search&kind=supervisor&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={personLabel} detailOf={personDetail} />
          <Field label="Mobilization Status"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['Planned', 'Mobilized', 'Extended', 'Demobilized', 'Returned to Base', 'Cancelled', 'Medical Return', 'Transferred'].map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
        {tab === 'Demobilization' && <div className="toolbar"><div /><div className="actions"><Button kind="secondary" disabled={!picked.length} onClick={() => setModal({ type: 'demobilize', ids: picked })}>Demobilize selected ({picked.length})</Button></div></div>}
        {tab === 'Returning Crew' && <div className="returningFilters">{['All', 'Today', 'Tomorrow', 'This week', 'Overdue'].map((label) => <button key={label} className={returnWindow === label ? 'active' : ''} onClick={() => { setReturnWindow(label); setPage(1); }}>{label}</button>)}</div>}
        <div className="tableWrap"><table><thead><tr>{tab === 'Demobilization' && <th></th>}<th><button className="link" onClick={() => setSort({ key: 'employeeName', dir: sort.dir * -1 })}>Employee</button></th><th>Code</th><th>Offshore Project</th><th>Offshore Site</th><th>Offshore Supervisor</th><th><button className="link" onClick={() => setSort({ key: 'effectiveFrom', dir: sort.dir * -1 })}>Mobilized From</button></th><th><button className="link" onClick={() => setSort({ key: 'expectedReturn', dir: sort.dir * -1 })}>Expected Return</button></th><th>Actual Return</th><th>Status</th><th>Timesheet</th><th></th></tr></thead><tbody>
          {visible.map((row) => <tr key={row.id}>
            {tab === 'Demobilization' && <td><input type="checkbox" checked={picked.includes(row.id)} onChange={() => setPicked((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td>}
            <td className="wrapCell"><b>{row.employeeName}</b></td>
            <td>{row.employeeCode}</td>
            <td className="wrapCell"><b>{row.projectCode}</b><small className="block">{row.projectName}</small></td>
            <td className="wrapCell">{row.site}</td>
            <td className="wrapCell">{row.offshoreSupervisor}</td>
            <td>{formatDisplayDate(row.effectiveFrom)}</td>
            <td>{formatDisplayDate(row.expectedReturn)}{row.revisedExpectedReturn ? <small className="block">Revised</small> : null}</td>
            <td>{row.actualReturn ? formatDisplayDate(row.actualReturn) : '—'}</td>
            <td><Badge tone={toneFor(row.status)}>{row.status}</Badge>{row.exceptionStatus && !row.exceptionStatus.startsWith('ack:') ? <small className="block">{row.exceptionStatus}</small> : null}</td>
            <td>{row.attendanceStatus || 'No timesheet hours'}</td>
            <td className="rowActions"><button className="link" onClick={() => setModal({ type: 'batch', id: row.mobilizationId })}>View</button>{OPEN.includes(row.status) && <button className="link" onClick={() => setModal({ type: 'extend', ids: [row.id], current: row.expectedReturn })}>Extend</button>}{OPEN.includes(row.status) && <button className="link" onClick={() => setModal({ type: 'demobilize', ids: [row.id] })}>Demobilize</button>}{['Mobilized', 'Extended', 'Demobilized'].includes(row.status) && <button className="link" onClick={() => setModal({ type: 'return', ids: [row.id] })}>Confirm return</button>}{OPEN.includes(row.status) && <button className="link" onClick={() => setModal({ type: 'status', ids: [row.id] })}>Other status</button>}</td>
          </tr>)}
          {!loading && !visible.length && <tr><td colSpan={12}><div className="emptyState"><b>No mobilization records found</b><span>Adjust the filters or create a mobilization.</span></div></td></tr>}
        </tbody></table></div>
        <div className="pager"><span>{view.length} employees</span><button className="link" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>{page} / {pageCount}</span><button className="link" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>
      </section>
    </>}
    {modal === 'create' && <CreateModal periods={snapshot.periods} onClose={() => setModal(null)} onCreated={async (result) => { setNotice(`${result.mobilizationNo} created successfully for ${result.employees} employee${result.employees === 1 ? '' : 's'}.`); setModal(null); setTab('Mobilized Crew'); await load(); }} />}
    {modal?.type === 'demobilize' && <ActionModal title="Demobilize" onClose={() => setModal(null)} onSave={(form) => run({ action: 'demobilize', employeeRowIds: modal.ids, ...form }, (result) => `${result.updated} employee${result.updated === 1 ? '' : 's'} demobilized. Home crew is unchanged and no hours were created.`)} fields={[{ name: 'demobilizationDate', label: 'Actual demobilization date', type: 'date' }, { name: 'returnDate', label: 'Actual return date', type: 'date' }, { name: 'destination', label: 'Destination / home location' }, { name: 'reason', label: 'Reason' }, { name: 'notes', label: 'Notes' }]} />}
    {modal?.type === 'extend' && <ActionModal title="Extend mobilization" onClose={() => setModal(null)} onSave={(form) => run({ action: 'extend', employeeRowIds: modal.ids, ...form }, (result) => `${result.updated} mobilization${result.updated === 1 ? '' : 's'} extended. The previous return date stays in history.`)} fields={[{ name: 'expectedReturn', label: `New expected return${modal.current ? ` (current ${formatDisplayDate(modal.current)})` : ''}`, type: 'date' }, { name: 'reason', label: 'Extension reason' }, { name: 'authorizationRef', label: 'Authorization / reference' }, { name: 'notes', label: 'Notes' }]} />}
    {modal?.type === 'return' && <ActionModal title="Confirm return to base" onClose={() => setModal(null)} onSave={(form) => run({ action: 'return', employeeRowIds: modal.ids, ...form }, (result) => `${result.updated} employee${result.updated === 1 ? '' : 's'} returned to the home crew. No new supervisor assignment was created.`)} fields={[{ name: 'returnDate', label: 'Return date', type: 'date' }, { name: 'reason', label: 'Notes' }]} />}
    {modal?.type === 'status' && <ActionModal title="Exceptional status" onClose={() => setModal(null)} onSave={(form) => run({ action: 'status', employeeRowIds: modal.ids, ...form }, (result) => `${result.updated} employee${result.updated === 1 ? '' : 's'} marked ${result.status}. The mobilization record is kept.`)} fields={[{ name: 'status', label: 'Status', type: 'select', options: ['Cancelled', 'Medical Return', 'Transferred'] }, { name: 'effectiveDate', label: 'Effective date', type: 'date' }, { name: 'reason', label: 'Reason' }]} />}
    {modal?.type === 'batch' && <BatchModal id={modal.id} onClose={() => setModal(null)} />}
  </>;
}

function CreateModal({ periods, onClose, onCreated }) {
  const [step, setStep] = useState('edit');
  const [periodId, setPeriodId] = useState(periods.find((item) => item.status === 'Open')?.id || periods[0]?.id || '');
  const [project, setProject] = useState(null);
  const [site, setSite] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [expected, setExpected] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [transport, setTransport] = useState('Company arranged');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const [selected, setSelected] = useState([]);
  const [validation, setValidation] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/timesheet-management/mobilization?mode=search&kind=employee&q=${encodeURIComponent(query)}`, { cache: 'no-store' }).then((response) => response.json()).then((body) => setFound(body.data || [])).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);
  const review = async () => {
    setError('');
    const missing = [
      !project?.code && 'Offshore project',
      !site && 'Offshore location / site',
      !from && 'Mobilization date',
      !expected && 'Expected return',
      !supervisor && 'Offshore supervisor',
      !reason && 'Reason',
      !selected.length && 'At least one employee',
    ].filter(Boolean);
    if (missing.length) { setError(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`); return; }
    if (expected < from) { setError('Expected return cannot be earlier than the mobilization date.'); return; }
    try {
      const result = await post({ action: 'validate', employeeCodes: selected.map((item) => item.code), effectiveFrom: from, expectedReturn: expected });
      setValidation(result);
      setStep('confirm');
    } catch (reviewError) {
      setError(reviewError.message);
    }
  };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await post({ action: 'create', periodId, projectCode: project.code, projectName: project.name, site, supervisor, effectiveFrom: from, expectedReturn: expected, authorizationRef: reference, reason, transport, notes, employeeCodes: selected.map((item) => item.code) });
      onCreated(result);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  const blocked = validation?.employees?.filter((item) => item.issues.some((issue) => issue.severity === 'block')) || [];
  return <div className="overlay"><div className="modal mobilizationModal"><div className="modalHead"><div><span className="eyebrow">OFFSHORE & MOBILIZATION</span><h3>New crew mobilization</h3><p>One mobilization can include many employees. Their home supervisor, location, and work centre are not changed.</p></div><button onClick={onClose}>×</button></div>
    <div className="modalBody">
      {error && <div className="validationError">{error}</div>}
      <div className="infoBox"><b>Mobilization establishes temporary offshore eligibility only.</b> It does not create attendance, project hours, overtime, night work, or payable days.</div>
      {step === 'edit' ? <>
        <div className="formGrid">
          <Field label="Timesheet Period"><select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>{periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <SearchCombo required label="Offshore project" placeholder="Search project code or name" value={project ? `${project.code} — ${project.name}` : ''} onSelect={setProject} search={(q) => fetch(`/api/timesheet-management/entry?mode=search&kind=project&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={(item) => `${item.code} — ${item.name}`} />
          <SearchCombo required label="Offshore location / site" placeholder="Search site" value={site} onSelect={(item) => setSite(item?.name || '')} search={(q) => fetch(`/api/timesheet-management/mobilization?mode=search&kind=site&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={(item) => item.name} />
          <Field required label="Mobilization date"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field required label="Expected return"><input type="date" value={expected} min={from} onChange={(event) => setExpected(event.target.value)} /></Field>
          <SearchCombo required label="Offshore supervisor" placeholder="Search supervisor" value={supervisor} onSelect={(item) => setSupervisor(item?.name || '')} search={(q) => fetch(`/api/timesheet-management/entry?mode=search&kind=supervisor&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={personLabel} detailOf={personDetail} />
          <Field label="Authorization / reference"><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="MOB/OPS/2026/091" /></Field>
          <Field required label="Reason"><select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Select reason</option>{['Project requirement', 'Offshore campaign', 'Maintenance shutdown', 'Client request', 'Emergency deployment'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Transport / movement"><select value={transport} onChange={(event) => setTransport(event.target.value)}>{['Company arranged', 'Client arranged', 'Marine transfer', 'Helicopter transfer', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
        <div className="crewPicker">
          <div className="crewPickerHead"><div><b>Select employees</b><span>Search the employee directory. One transaction covers everyone selected.</span></div><Badge tone={selected.length ? 'blue' : 'slate'}>{selected.length} employees selected</Badge></div>
          <div className="crewSearch"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code, first name, middle name, surname, department, work centre, or supervisor" /><button type="button" className="link" onClick={() => setSelected((current) => {
            const visibleCodes = new Set(found.map((item) => item.code));
            const allOn = found.length > 0 && found.every((item) => current.some((picked) => picked.code === item.code));
            return allOn ? current.filter((item) => !visibleCodes.has(item.code)) : [...current, ...found.filter((item) => !current.some((picked) => picked.code === item.code))];
          })}>{found.length > 0 && found.every((item) => selected.some((picked) => picked.code === item.code)) ? 'Clear visible' : 'Select all visible'}</button></div>
          <div className="crewRows">{found.map((item) => <label key={item.code} className={selected.some((picked) => picked.code === item.code) ? 'crewRow chosen' : 'crewRow'}><input type="checkbox" checked={selected.some((picked) => picked.code === item.code)} onChange={() => setSelected((current) => current.some((picked) => picked.code === item.code) ? current.filter((picked) => picked.code !== item.code) : [...current, item])} /><div><b>{item.name}</b><span>{item.code} · {item.department || item.workCenter || '—'}</span></div><div><b>{item.supervisor || 'No supervisor'}</b><span>{item.location || '—'}</span></div></label>)}{!found.length && <span>No employees match.</span>}</div>
          {selected.length > 0 && <div className="tableWrap"><table><thead><tr><th>Code</th><th>Name</th><th>Current supervisor</th><th>Home location</th><th>Work centre</th><th></th></tr></thead><tbody>{selected.map((item) => <tr key={item.code}><td>{item.code}</td><td>{item.name}</td><td>{item.supervisor || '—'}</td><td>{item.location || '—'}</td><td>{item.workCenter || '—'}</td><td><button className="link" onClick={() => setSelected((current) => current.filter((picked) => picked.code !== item.code))}>Remove</button></td></tr>)}</tbody></table></div>}
        </div>
        <Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Operational instructions, client requirements, or logistics" /></Field>
      </> : <div className="confirmSummary"><h3>New offshore mobilization</h3><p>Project: {project?.code} — {project?.name}</p><p>Site: {site}</p><p>Mobilization date: {formatDisplayDate(from)}</p><p>Expected return: {formatDisplayDate(expected)}</p><p>Offshore supervisor: {supervisor}</p><p>Employees selected: {selected.length}</p><p>Eligible: {validation?.eligible || 0}</p><p>Already mobilized: {validation?.alreadyMobilized || 0}</p><p>On approved leave: {validation?.onLeave || 0}</p><p>Assignment warnings: {validation?.conflicts || 0}</p>{blocked.length > 0 && <div className="validationError">{blocked.map((item) => <div key={item.code}>{item.code} · {item.name}: {item.issues.filter((issue) => issue.severity === 'block').map((issue) => issue.message).join(' ')}</div>)}<button className="link" onClick={() => { const blockedCodes = new Set(blocked.map((item) => item.code)); setSelected((current) => current.filter((item) => !blockedCodes.has(item.code))); setStep('edit'); }}>Remove blocking employees</button></div>}</div>}
    </div>
    <div className="modalFoot"><div className="footSummary"><b>{selected.length}</b><span> selected</span>{project ? <span> · {project.code}</span> : null}{site ? <span> · {site}</span> : null}</div><Button kind="secondary" onClick={step === 'confirm' ? () => setStep('edit') : onClose}>{step === 'confirm' ? 'Back' : 'Cancel'}</Button>{step === 'edit' ? <Button onClick={review}>Review</Button> : <Button disabled={saving || blocked.length > 0} onClick={save}>{saving ? 'Saving…' : `Mobilize ${selected.length} employee${selected.length === 1 ? '' : 's'}`}</Button>}</div>
  </div></div>;
}

function ActionModal({ title, fields, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  return <Modal title={title} onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button onClick={async () => { try { await onSave(form); } catch (saveError) { setError(saveError.message); } }}>Confirm</Button></>}><div className="infoBox">This updates the mobilization lifecycle only. It does not change the home crew and does not create timesheet hours.</div>{error && <div className="validationError">{error}</div>}<div className="formGrid">{fields.map((field) => <Field key={field.name} label={field.label}>{field.type === 'date' ? <input type="date" value={form[field.name] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} /> : field.type === 'select' ? <select value={form[field.name] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}><option value="">Select</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input value={form[field.name] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />}</Field>)}</div></Modal>;
}

function BatchModal({ id, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => { fetch(`/api/timesheet-management/mobilization?mode=batch&id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then((response) => response.json()).then((body) => setData(body.data || null)); }, [id]);
  const header = data?.rows?.[0];
  return <Modal wide title={header ? header.mobilizationNo : 'Mobilization'} onClose={onClose} footer={<Button kind="secondary" onClick={onClose}>Close</Button>}><div className="infoBox">{header ? `${header.projectCode} · ${header.site} · ${header.offshoreSupervisor}` : 'Loading mobilization…'}</div><div className="tableWrap"><table><thead><tr><th>Employee</th><th>Home supervisor</th><th>From</th><th>Expected</th><th>Revised</th><th>Actual return</th><th>Status</th></tr></thead><tbody>{(data?.rows || []).map((row) => <tr key={row.id}><td><b>{row.employeeName}</b><small className="block">{row.employeeCode}</small></td><td>{row.homeSupervisor || '—'}</td><td>{formatDisplayDate(row.effectiveFrom)}</td><td>{formatDisplayDate(row.originalExpectedReturn)}</td><td>{row.revisedExpectedReturn ? formatDisplayDate(row.revisedExpectedReturn) : '—'}</td><td>{row.actualReturn ? formatDisplayDate(row.actualReturn) : '—'}</td><td><Badge tone={toneFor(row.status)}>{row.status}</Badge></td></tr>)}</tbody></table></div><h3>Audit</h3><div className="tableWrap"><table><thead><tr><th>When</th><th>Action</th><th>Employee</th><th>Previous</th><th>New</th><th>By</th></tr></thead><tbody>{(data?.audit || []).map((row) => <tr key={row.id}><td>{row.at ? new Date(row.at).toLocaleString() : '—'}</td><td>{row.action}</td><td>{row.employeeCode || 'Batch'}</td><td>{row.previousValue || '—'}</td><td>{row.newValue || '—'}</td><td>{row.actor}{row.role ? ` · ${row.role}` : ''}</td></tr>)}</tbody></table></div></Modal>;
}

function HistoryTable({ rows, onOpen }) {
  return <section className="panel"><div className="panelHead"><div><h3>History</h3><p>Creation, extension, demobilization, and return stay on the mobilization. Nothing is deleted.</p></div></div><div className="tableWrap"><table><thead><tr><th>Mobilization</th><th>Employee</th><th>Project</th><th>Site</th><th>From</th><th>Original return</th><th>Revised return</th><th>Actual return</th><th>Action</th><th>By</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.mobilizationNo}</td><td>{row.employeeName || row.employeeCode || 'Batch'}</td><td>{row.projectCode}</td><td>{row.site}</td><td>{formatDisplayDate(row.effectiveFrom)}</td><td>{formatDisplayDate(row.originalExpectedReturn)}</td><td>{row.revisedExpectedReturn ? formatDisplayDate(row.revisedExpectedReturn) : '—'}</td><td>{row.actualReturn ? formatDisplayDate(row.actualReturn) : '—'}</td><td>{row.action}</td><td>{row.actor}</td><td><button className="link" onClick={() => onOpen(row.mobilizationId)}>View</button></td></tr>)}{!rows.length && <tr><td colSpan={11}>No mobilization history yet.</td></tr>}</tbody></table></div></section>;
}

function ExceptionTable({ rows, onAcknowledge }) {
  return <section className="panel"><div className="panelHead"><div><h3>Exceptions</h3><p>Conflicts are shown here. Payroll-affecting timesheet rows are not changed automatically.</p></div></div><div className="tableWrap"><table><thead><tr><th>Severity</th><th>Employee</th><th>Date</th><th>Issue</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Badge tone={toneFor(row.severity)}>{row.severity}</Badge></td><td><b>{row.employeeName}</b><small className="block">{row.employeeCode}</small></td><td>{formatDisplayDate(row.date)}</td><td>{row.issue}</td><td>{row.source}</td><td>{row.status}</td><td>{row.employeeRowId && <button className="link" onClick={() => onAcknowledge(row)}>Acknowledge</button>}</td></tr>)}{!rows.length && <tr><td colSpan={7}>No open mobilization exceptions.</td></tr>}</tbody></table></div></section>;
}
