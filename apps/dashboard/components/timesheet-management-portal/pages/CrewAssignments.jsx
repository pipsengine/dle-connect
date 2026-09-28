'use client';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, Table, Tabs } from '../components/UI';
import { formatDisplayDate, usePortalData } from '../portal-data';

const TABS = ['Crew Assignment', 'Reassignment & Transfer', 'Temporary Deployment', 'Operational Status', 'Assignment History', 'Removal Requests'];
const STATUSES = ['Active on Crew', 'Temporarily Not Reporting', 'Abscondment/No-Show – Pending HR', 'Returned to Crew', 'Temporarily Deployed', 'Transferred/Reassigned', 'Assignment Ended'];
const PAGE_SIZE = 25;

const covers = (row, onDate) => row.status === 'Active' && row.effectiveFrom <= onDate && (!row.effectiveTo || row.effectiveTo >= onDate);

export default function CrewAssignments() {
  const { snapshot, loading, error, notice, setNotice, save } = usePortalData();
  const [tab, setTab] = useState(TABS[0]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [location, setLocation] = useState('');
  const [workCenter, setWorkCenter] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [employeeType, setEmployeeType] = useState('');
  const [selected, setSelected] = useState([]);
  const [availablePage, setAvailablePage] = useState(0);
  const [assignedPage, setAssignedPage] = useState(0);
  const [modal, setModal] = useState(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const directory = snapshot.directory;
  const assignments = snapshot.crewAssignments || [];
  const onDate = effectiveDate;

  const currentPrimary = (code) => assignments.find((row) => row.employeeCode === code && row.assignmentType === 'Primary' && covers(row, onDate));
  const decorate = (employee) => {
    const primary = onDate ? currentPrimary(employee.code) : null;
    return {
      ...employee,
      currentSupervisor: primary?.supervisor || employee.supervisor || '—',
      currentLocation: primary?.location || employee.location || '—',
      currentWorkCenter: primary?.workCenter || employee.workCenter || '—',
      operationalStatus: primary?.operationalStatus || 'Unassigned',
      assignmentId: primary?.id || '',
    };
  };
  const crew = useMemo(() => directory.employees.map(decorate), [directory.employees, assignments, onDate]);
  const matchesContext = (employee) => (!supervisor || employee.currentSupervisor === supervisor) && (!location || employee.currentLocation === location) && (!workCenter || employee.currentWorkCenter === workCenter);
  const matchesSearch = (employee) => {
    const haystack = `${employee.code} ${employee.name} ${employee.employeeType} ${employee.department} ${employee.currentSupervisor}`.toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (department && employee.department !== department) return false;
    if (employeeType && employee.employeeType !== employeeType) return false;
    return true;
  };
  const assigned = crew.filter((employee) => employee.assignmentId && matchesContext(employee) && matchesSearch(employee));
  const available = crew.filter((employee) => !assigned.some((item) => item.code === employee.code) && matchesSearch(employee));
  const departments = [...new Set(directory.employees.map((employee) => employee.department).filter(Boolean))].sort();
  const types = [...new Set(directory.employees.map((employee) => employee.employeeType).filter(Boolean))].sort();
  const selectedEmployees = crew.filter((employee) => selected.includes(employee.code));
  const toggle = (code) => setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  const toggleAll = (rows) => {
    const codes = rows.map((row) => row.code);
    const allOn = codes.every((code) => selected.includes(code));
    setSelected((current) => allOn ? current.filter((code) => !codes.includes(code)) : [...new Set([...current, ...codes])]);
  };

  const history = (snapshot.crewEvents || []).filter((event) => {
    const haystack = `${event.employeeCode} ${event.employeeName} ${event.previousSupervisor} ${event.newSupervisor} ${event.location} ${event.workCenter}`.toLowerCase();
    return !historyQuery || haystack.includes(historyQuery.toLowerCase());
  });

  return <>
    <div className="pageTitle"><div><span className="eyebrow">TIMESHEET MANAGEMENT</span><h1>Crew & Assignments</h1><p>Home supervisor, location, and work centre. Project hours stay in Timesheet Entry.</p></div></div>
    {error && <div className="success" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
    {notice && <div className="success">{notice} <button onClick={() => setNotice('')}>×</button></div>}
    <Tabs items={TABS} active={tab} setActive={(next) => { setTab(next); setSelected([]); }} />
    {tab === 'Assignment History' ? <History events={history} query={historyQuery} setQuery={setHistoryQuery} loading={loading} /> : tab === 'Removal Requests' ? <RemovalRequests requests={snapshot.crewRemovals || []} loading={loading} save={save} setNotice={setNotice} /> : <>
      <div className="filterRow">
        <Field label="Effective date"><input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></Field>
        <Field label="Location"><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All locations</option>{directory.locations.map((name) => <option key={name}>{name}</option>)}</select></Field>
        <Field label="Work centre"><select value={workCenter} onChange={(event) => setWorkCenter(event.target.value)}><option value="">All work centres</option>{directory.workCenters.map((name) => <option key={name}>{name}</option>)}</select></Field>
        <Field label="Supervisor"><select value={supervisor} onChange={(event) => setSupervisor(event.target.value)}><option value="">All supervisors</option>{directory.supervisors.map((name) => <option key={name}>{name}</option>)}</select></Field>
      </div>
      <div className="crewToolbar">
        <input className="searchInput" value={query} onChange={(event) => { setQuery(event.target.value); setAvailablePage(0); setAssignedPage(0); }} placeholder="Search code or name" />
        <Field label="Department"><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></Field>
        <Field label="Employee type"><select value={employeeType} onChange={(event) => setEmployeeType(event.target.value)}><option value="">All types</option>{types.map((name) => <option key={name}>{name}</option>)}</select></Field>
        <Button disabled={!selected.length || !effectiveDate} onClick={() => setModal(tab)}>{tab === 'Operational Status' ? 'Update status' : tab === 'Temporary Deployment' ? 'Deploy selected' : 'Assign to supervisor'} ({selected.length})</Button>
        <Button kind="secondary" disabled={!selectedEmployees.some((employee) => employee.currentSupervisor && employee.currentSupervisor !== '—' && employee.currentSupervisor !== 'Unassigned')} onClick={() => setModal('Removal Request')}>Request removal ({selectedEmployees.filter((employee) => employee.currentSupervisor && employee.currentSupervisor !== '—' && employee.currentSupervisor !== 'Unassigned').length})</Button>
      </div>
      <div className="crewSplit">
        <CrewList title="Available employees" rows={available} page={availablePage} setPage={setAvailablePage} selected={selected} onToggle={toggle} onToggleAll={() => toggleAll(available)} loading={loading} />
        <CrewList title="Assigned crew" rows={assigned} page={assignedPage} setPage={setAssignedPage} selected={selected} onToggle={toggle} onToggleAll={() => toggleAll(assigned)} loading={loading} />
      </div>
    </>}
    {modal === 'Removal Request' && <RemovalRequestModal employees={selectedEmployees.filter((employee) => employee.currentSupervisor && employee.currentSupervisor !== '—' && employee.currentSupervisor !== 'Unassigned')} onClose={() => setModal(null)} onSave={async (reason) => {
      const result = await save({ action: 'request-crew-removal', reason, employees: selectedEmployees.filter((employee) => employee.currentSupervisor && employee.currentSupervisor !== '—').map((employee) => ({ code: employee.code, supervisor: employee.currentSupervisor })) });
      setNotice(`${result.requested || 0} removal request${result.requested === 1 ? '' : 's'} sent to the HR manager. The employee stays on the crew until HR confirms.`);
      setSelected([]);
      setModal(null);
    }} />}
    {modal && modal !== 'Removal Request' && <CrewModal mode={modal} employees={selectedEmployees} directory={directory} effectiveDate={effectiveDate} onClose={() => setModal(null)} onSave={async (form) => {
      const action = modal === 'Operational Status' ? 'update-crew-status' : 'save-crew';
      const result = await save({ action, employeeCodes: selected, assignmentType: modal === 'Temporary Deployment' ? 'Temporary' : 'Primary', ...form });
      const detail = result.created != null ? `${result.created} saved, ${result.closed} previous assignment${result.closed === 1 ? '' : 's'} closed, ${result.skipped} already on this crew.` : `${result.updated} status updates saved.`;
      setNotice(detail);
      setSelected([]);
      setModal(null);
    }} />}
  </>;
}

function CrewList({ title, rows, page, setPage, selected, onToggle, onToggleAll, loading }) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const allOn = rows.length > 0 && rows.every((row) => selected.includes(row.code));
  return <section className="panel crewList">
    <div className="panelHead"><div><h3>{title}</h3><p>{loading ? 'Loading directory…' : `${rows.length} employees`}</p></div><label className="checkLine"><input type="checkbox" checked={allOn} onChange={onToggleAll} /> Select all filtered</label></div>
    <div className="tableWrap"><table><thead><tr><th /><th>Code</th><th>Name</th><th>Type</th><th>Department</th><th>Current supervisor</th><th>Location</th><th>Work centre</th><th>Status</th></tr></thead>
      <tbody>{visible.length ? visible.map((row) => <tr key={row.code}><td><input type="checkbox" checked={selected.includes(row.code)} onChange={() => onToggle(row.code)} /></td><td>{row.code}</td><td>{row.name}</td><td>{row.employeeType || '—'}</td><td>{row.department || '—'}</td><td>{row.currentSupervisor}</td><td>{row.currentLocation}</td><td>{row.currentWorkCenter}</td><td><Badge tone={row.operationalStatus === 'Unassigned' ? 'slate' : row.operationalStatus.includes('Pending') ? 'amber' : 'green'}>{row.operationalStatus}</Badge></td></tr>) : <tr><td colSpan={9}>{loading ? 'Loading…' : 'No employees in this list.'}</td></tr>}</tbody>
    </table></div>
    <div className="crewPager"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>{page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
  </section>;
}

function CrewModal({ mode, employees, directory, effectiveDate, onClose, onSave }) {
  const [form, setForm] = useState({ supervisor: '', location: '', workCenter: '', effectiveFrom: effectiveDate, effectiveTo: '', operationalStatus: 'Active on Crew', reason: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const moves = employees.filter((employee) => form.supervisor && employee.currentSupervisor !== '—' && employee.currentSupervisor !== form.supervisor);
  const temporary = mode === 'Temporary Deployment';
  const statusMode = mode === 'Operational Status';
  return <Modal wide title={mode} onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={async () => { setSaving(true); setFormError(''); try { await onSave(form); } catch (saveError) { setFormError(saveError.message); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Confirm'}</Button></>}>
    {formError && <div className="infoBox">{formError}</div>}
    <p>{employees.length} employee{employees.length === 1 ? '' : 's'} selected. Each person gets their own effective-dated record.</p>
    <div className="selectList">{employees.slice(0, 12).map((employee) => <span key={employee.code}>{employee.code} · {employee.name}</span>)}{employees.length > 12 && <span>+ {employees.length - 12} more</span>}</div>
    {!statusMode && moves.length > 0 && <div className="infoBox">{moves.length} already report to another supervisor. Confirming closes that home assignment the day before the new effective date and creates the new one. {moves.slice(0, 4).map((employee) => `${employee.currentSupervisor} → ${form.supervisor}`).join('; ')}</div>}
    <div className="formGrid">
      {!statusMode && <Field label="Supervisor"><select value={form.supervisor} onChange={set('supervisor')}><option value="">Select supervisor...</option>{directory.supervisors.map((name) => <option key={name}>{name}</option>)}</select></Field>}
      {!statusMode && <Field label="Location"><select value={form.location} onChange={set('location')}><option value="">Select location...</option>{directory.locations.map((name) => <option key={name}>{name}</option>)}</select></Field>}
      {!statusMode && <Field label="Work centre"><select value={form.workCenter} onChange={set('workCenter')}><option value="">Select work centre...</option>{directory.workCenters.map((name) => <option key={name}>{name}</option>)}</select></Field>}
      {statusMode && <Field label="Operational status"><select value={form.operationalStatus} onChange={set('operationalStatus')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field>}
      <Field label="Effective from"><input type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} /></Field>
      {(temporary || statusMode) && <Field label={temporary ? 'Effective to' : 'Effective to (optional)'}><input type="date" value={form.effectiveTo} onChange={set('effectiveTo')} /></Field>}
      {!statusMode && <Field label="Assignment type"><input readOnly value={temporary ? 'Temporary deployment' : 'Primary / Home crew'} /></Field>}
      <Field label="Reason"><input value={form.reason} onChange={set('reason')} /></Field>
      <Field label="Notes"><textarea value={form.notes} onChange={set('notes')} /></Field>
    </div>
    {temporary && <div className="infoBox">The home crew assignment stays in place. When the end date passes, the employee returns to that home crew.</div>}
    {statusMode && <div className="infoBox">This changes operational status only. It does not terminate employment.</div>}
  </Modal>;
}

function RemovalRequestModal({ employees, onClose, onSave }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  return <Modal title="Request crew removal" onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !reason.trim() || !employees.length} onClick={async () => { setSaving(true); setFormError(''); try { await onSave(reason.trim()); } catch (saveError) { setFormError(saveError.message); } finally { setSaving(false); } }}>{saving ? 'Sending…' : 'Send to HR'}</Button></>}><p>The employee stays on the crew until an HR manager confirms. This does not make the employee inactive.</p>{formError && <div className="infoBox">{formError}</div>}<div className="pickerList">{employees.map((employee) => <span key={employee.code}><b>{employee.code}</b><span>{employee.name} · {employee.currentSupervisor}</span></span>)}</div><Field label="Reason"><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this person should leave this crew" /></Field></Modal>;
}

function RemovalRequests({ requests, loading, save, setNotice }) {
  const [decision, setDecision] = useState(null);
  const [hrReason, setHrReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  return <section className="panel">
    <div className="panelHead"><div><h3>Removal requests</h3><p>Pending requests stay on the crew until an HR manager confirms them with a reason.</p></div></div>
    <Table headers={['Employee', 'Supervisor', 'Request reason', 'Status', 'Requested by', 'HR reason', '']} rows={requests.map((request) => [
      `${request.employeeCode} · ${request.employeeName}`,
      request.supervisor,
      request.requestReason || '—',
      <Badge tone={request.status === 'Confirmed' ? 'green' : request.status === 'Rejected' ? 'red' : 'amber'}>{request.status}</Badge>,
      request.requestedBy || '—',
      request.hrReason || '—',
      request.status === 'Pending HR' ? <Button kind="secondary" onClick={() => { setDecision(request); setHrReason(''); setFormError(''); }}>HR decision</Button> : '—',
    ])} empty={loading ? 'Loading requests…' : 'No removal requests yet.'} />
    {decision && <Modal title="HR manager decision" onClose={() => setDecision(null)} footer={<><Button kind="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button kind="secondary" disabled={saving || !hrReason.trim()} onClick={() => submit('reject')}>Reject</Button><Button disabled={saving || !hrReason.trim()} onClick={() => submit('confirm')}>{saving ? 'Saving…' : 'Confirm removal'}</Button></>}>
      {formError && <div className="infoBox">{formError}</div>}
      <p>{decision.employeeCode} · {decision.employeeName} stays with {decision.supervisor} until you confirm. Confirmation ends the crew assignment only.</p>
      <Field label="Supervisor request"><textarea readOnly value={decision.requestReason} /></Field>
      <Field label="HR reason"><textarea value={hrReason} onChange={(event) => setHrReason(event.target.value)} placeholder="Justification for confirming or rejecting" /></Field>
    </Modal>}
  </section>;

  async function submit(choice) {
    setSaving(true);
    setFormError('');
    try {
      await save({ action: 'decide-crew-removal', id: decision.id, decision: choice, hrReason: hrReason.trim() });
      setNotice(choice === 'confirm' ? 'HR confirmed the removal. The employee is off that crew and is still active.' : 'HR rejected the removal. The employee stays on the crew.');
      setDecision(null);
    } catch (saveError) {
      setFormError(saveError.message);
    } finally {
      setSaving(false);
    }
  }
}

function History({ events, query, setQuery, loading }) {
  return <section className="panel">
    <div className="panelHead"><div><h3>Assignment history</h3><p>Effective-dated audit of every crew change.</p></div><input className="searchInput" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or supervisor" /></div>
    <Table headers={['Employee', 'Assignment type', 'Previous supervisor', 'New supervisor', 'Location', 'Work centre', 'Effective from', 'Effective to', 'Operational status', 'Reason', 'Changed by', 'Changed date']} rows={events.map((event) => [`${event.employeeCode} · ${event.employeeName}`, event.assignmentType, event.previousSupervisor || '—', event.newSupervisor || '—', event.location || '—', event.workCenter || '—', formatDisplayDate(event.effectiveFrom), formatDisplayDate(event.effectiveTo), event.operationalStatus || '—', event.reason || '—', event.changedBy || '—', formatDisplayDate(event.changedAt)])} empty={loading ? 'Loading history…' : 'No crew changes have been saved.'} />
  </section>;
}
