'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { supervisorCodesMatch } from '@/lib/timesheet-agege-blasting';
import { Badge, Button, Field, Modal, OptionCombo, SearchCombo, Table, Tabs, personDetail, personLabel } from '../components/UI';
import { formatDisplayDate, usePortalData } from '../portal-data';

const TABS = ['Crew Assignment', 'Reassignment & Transfer', 'Temporary Deployment', 'Operational Status', 'Assignment History', 'Removal Requests'];
const STATUSES = ['Active on Crew', 'Temporarily Not Reporting', 'Abscondment/No-Show – Pending HR', 'Returned to Crew', 'Temporarily Deployed', 'Transferred/Reassigned', 'Assignment Ended'];
const STATUS_FILTERS = ['Unassigned & Available', 'All statuses', 'Active', 'Temporarily Deployed', 'Offshore', 'On Approved Leave', 'Assigned (Different)', 'Not Reporting', 'Assignment Conflict'];

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const covers = (row, onDate) => row.status === 'Active' && row.effectiveFrom <= onDate && (!row.effectiveTo || row.effectiveTo >= onDate);
const sameName = (left, right) => {
  if (supervisorCodesMatch(left, right)) return true;
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  if (!a || !b || a === '—' || b === '—' || a === 'unassigned' || b === 'unassigned') return false;
  return a === b || a.includes(b) || b.includes(a);
};
const sameText = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
const toneFor = (status) => {
  if (status === 'Unassigned') return 'slate';
  if (status === 'On Approved Leave' || status === 'Not Reporting') return 'amber';
  if (status === 'Assigned (Different)' || status === 'Assignment Conflict') return 'purple';
  if (status === 'Offshore' || status === 'Temporarily Deployed') return 'blue';
  return 'green';
};

const searchLookup = (kind, query) => fetch(`/api/timesheet-management/entry?mode=search&kind=${kind}&q=${encodeURIComponent(query)}`, { cache: 'no-store' }).then((response) => response.json()).then((body) => body.data || []);

export default function CrewAssignments() {
  const { snapshot, loading, error, notice, setNotice, save } = usePortalData();
  const [tab, setTab] = useState(TABS[0]);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [location, setLocation] = useState('');
  const [workCenter, setWorkCenter] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All departments');
  const [employeeType, setEmployeeType] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('Unassigned & Available');
  const [selected, setSelected] = useState([]);
  const [assignedSelected, setAssignedSelected] = useState([]);
  const [availablePage, setAvailablePage] = useState(0);
  const [assignedPage, setAssignedPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(null);
  const [menu, setMenu] = useState(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [signals, setSignals] = useState({ leave: [], offshore: [] });
  const [departmentOptions, setDepartmentOptions] = useState(['All departments']);
  const directory = snapshot.directory;
  const assignments = snapshot.crewAssignments || [];
  const contextReady = Boolean(effectiveDate && location && workCenter && supervisor);

  useEffect(() => {
    if (!effectiveDate) return undefined;
    let cancelled = false;
    fetch(`/api/timesheet-management?signals=${encodeURIComponent(effectiveDate)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (!cancelled) setSignals(body.data || { leave: [], offshore: [] }); })
      .catch(() => { if (!cancelled) setSignals({ leave: [], offshore: [] }); });
    return () => { cancelled = true; };
  }, [effectiveDate, notice]);

  useEffect(() => {
    let cancelled = false;
    searchLookup('department', '').then((rows) => {
      if (cancelled) return;
      const names = [...new Set(['All departments', ...rows.map((row) => row.name).filter(Boolean), ...directory.employees.map((employee) => employee.department).filter(Boolean)])];
      names.sort((a, b) => a === 'All departments' ? -1 : b === 'All departments' ? 1 : a.localeCompare(b));
      setDepartmentOptions(names);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [directory.employees]);

  const changeContext = (apply) => {
    if ((selected.length || assignedSelected.length) && !window.confirm('You have a selection. Change this value and clear it?')) return;
    apply();
    setSelected([]);
    setAssignedSelected([]);
    setAvailablePage(0);
    setAssignedPage(0);
  };

  const leave = useMemo(() => new Set((signals.leave || []).map((code) => String(code).toUpperCase())), [signals]);
  const offshore = useMemo(() => new Map((signals.offshore || []).map((row) => [String(row.code).toUpperCase(), row])), [signals]);

  const releasedFromSupervisor = (code) => (snapshot.crewRemovals || []).some((row) => row.status === 'Confirmed' && String(row.employeeCode).toUpperCase() === String(code).toUpperCase() && sameName(row.supervisor, supervisor));

  const decorate = (employee) => {
    const code = employee.code.toUpperCase();
    const primaryRows = assignments.filter((row) => row.employeeCode === employee.code && row.assignmentType === 'Primary' && covers(row, effectiveDate));
    const temporary = assignments.find((row) => row.employeeCode === employee.code && row.assignmentType === 'Temporary' && covers(row, effectiveDate));
    const primary = primaryRows[0];
    const away = offshore.get(code);
    const released = releasedFromSupervisor(employee.code);
    const homeSupervisor = primary?.supervisor || temporary?.supervisor || employee.supervisor || '—';
    const onSelectedSupervisor = !released && sameName(homeSupervisor, supervisor);
    let badge = 'Unassigned';
    if (primaryRows.length > 1) badge = 'Assignment Conflict';
    else if (leave.has(code)) badge = 'On Approved Leave';
    else if (away) badge = 'Offshore';
    else if (temporary && !onSelectedSupervisor) badge = 'Temporarily Deployed';
    else if (primary?.operationalStatus?.includes('Not Reporting') || primary?.operationalStatus?.includes('Abscondment')) badge = 'Not Reporting';
    else if (onSelectedSupervisor) badge = 'Active';
    else if (primary || temporary) badge = 'Assigned (Different)';
    return {
      ...employee,
      badge,
      currentSupervisor: released ? '—' : homeSupervisor,
      currentLocation: primary?.location || employee.location || '—',
      currentWorkCenter: primary?.workCenter || employee.workCenter || '—',
      assignedFrom: primary?.effectiveFrom || '',
      assignmentId: primary?.id || '',
      temporary: Boolean(temporary),
      offshoreRef: away?.reference || '',
    };
  };

  const crew = useMemo(() => directory.employees.map(decorate), [directory.employees, assignments, effectiveDate, supervisor, leave, offshore, snapshot.crewRemovals]);
  const matchesQuery = (employee) => {
    const haystack = `${employee.code} ${employee.name}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  };
  const matchesSearch = (employee) => {
    if (!matchesQuery(employee)) return false;
    if (department !== 'All departments' && employee.department !== department) return false;
    if (employeeType !== 'All types' && employee.employeeType !== employeeType) return false;
    if (statusFilter !== 'All statuses' && statusFilter !== 'Unassigned & Available' && employee.badge !== statusFilter) return false;
    if (statusFilter === 'Unassigned & Available' && employee.badge !== 'Unassigned') return false;
    return true;
  };
  const onThisCrew = (employee) => sameName(employee.currentSupervisor, supervisor);
  const assigned = contextReady ? crew.filter((employee) => onThisCrew(employee) && matchesQuery(employee)) : [];
  const available = crew.filter((employee) => !onThisCrew(employee) && matchesSearch(employee));
  const locationCrew = contextReady ? assignments.filter((row) => row.assignmentType === 'Primary' && covers(row, effectiveDate) && sameText(row.location, location) && sameText(row.workCenter, workCenter)).length : 0;
  const types = ['All types', ...new Set(directory.employees.map((employee) => employee.employeeType).filter(Boolean))].sort((a, b) => a === 'All types' ? -1 : a.localeCompare(b));
  const picked = crew.filter((employee) => selected.includes(employee.code));
  const pickedAssigned = assigned.filter((employee) => assignedSelected.includes(employee.code));

  const history = (snapshot.crewEvents || []).filter((event) => {
    const haystack = `${event.employeeCode} ${event.employeeName} ${event.previousSupervisor} ${event.newSupervisor} ${event.location} ${event.workCenter}`.toLowerCase();
    return !historyQuery || haystack.includes(historyQuery.toLowerCase());
  });

  const openAssign = () => {
    if (!contextReady || !picked.length) return;
    setModal(tab === 'Crew Assignment' ? 'Assign' : tab);
  };

  return <div className="crewPage">
    <div className="pageTitle"><div><span className="eyebrow">TIMESHEET MANAGEMENT</span><h1>Crew & Assignments</h1><p>Manage home supervisor, location and work centre assignments. Project hours are recorded in Timesheet Entry.</p></div></div>
    {error && <div className="success" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
    {notice && <div className="success">{notice} <button onClick={() => setNotice('')}>×</button></div>}
    <Tabs items={TABS} active={tab} setActive={(next) => { setTab(next); setSelected([]); setAssignedSelected([]); }} />
    {tab === 'Assignment History' ? <History events={history} query={historyQuery} setQuery={setHistoryQuery} loading={loading} /> : tab === 'Removal Requests' ? <RemovalRequests requests={snapshot.crewRemovals || []} loading={loading} save={save} setNotice={setNotice} /> : <>
      <section className="crewFilters">
        <div className="crewFilter"><label>Effective Date <b>*</b></label><input type="date" value={effectiveDate} onChange={(event) => changeContext(() => setEffectiveDate(event.target.value))} /></div>
        <SearchCombo variant="crew" label="Location / Site" required placeholder="Search location" value={location} onSelect={(item) => changeContext(() => { setLocation(item?.name || ''); setWorkCenter(''); })} search={(q) => searchLookup('location', q)} labelOf={(item) => item.name} />
        <SearchCombo variant="crew" label="Work Centre" required placeholder="Search work centre" value={workCenter} onSelect={(item) => changeContext(() => setWorkCenter(item?.name || ''))} search={async (q) => {
          const items = await searchLookup('workcenter', q);
          if (!location) return items;
          const used = new Set(directory.employees.filter((employee) => sameText(employee.location, location)).map((employee) => employee.workCenter).filter(Boolean));
          const preferred = items.filter((item) => used.has(item.name));
          return preferred.length ? preferred : items;
        }} labelOf={(item) => item.name} />
        <SearchCombo variant="crew" label="Supervisor" required placeholder="Search supervisor" value={supervisor} onSelect={(item) => changeContext(() => setSupervisor(item ? `${item.code} - ${item.name}` : ''))} search={(q) => searchLookup('supervisor', q)} labelOf={personLabel} detailOf={personDetail} />
        <div className="crewSearchBox"><input value={query} onChange={(event) => { setQuery(event.target.value); setAvailablePage(0); }} placeholder="Search employee code or name..." /></div>
        <OptionCombo label="Department" value={department} options={departmentOptions} onChange={(name) => { setDepartment(name); setAvailablePage(0); }} />
        <OptionCombo label="Employee Type" value={employeeType} options={types} onChange={(name) => { setEmployeeType(name); setAvailablePage(0); }} />
        <OptionCombo label="Status" value={statusFilter} options={STATUS_FILTERS} onChange={(name) => { setStatusFilter(name); setAvailablePage(0); }} />
        <button className="resetBtn" type="button" onClick={() => { setQuery(''); setDepartment('All departments'); setEmployeeType('All types'); setStatusFilter('Unassigned & Available'); setAvailablePage(0); }}>Reset Filters</button>
      </section>
      <section className="crewInfo">
        <div className="crewInfoText"><span className="infoDot">i</span><div><b>{tab === 'Temporary Deployment' ? 'A temporary deployment does not replace the home supervisor, location or work centre.' : tab === 'Operational Status' ? 'Operational status is not employment status. This cannot terminate an employee.' : 'Assign employees to the selected supervisor to set their home supervisor, location and work centre.'}</b><small>This does not create project hours. Project hours are recorded in Timesheet Entry.</small></div></div>
        <div className="crewStat"><b>{available.length}</b><span>Available (Filtered)</span></div>
        <div className="crewStat orange"><b>{assigned.length}</b><span>Currently Assigned</span></div>
        <div className="crewStat green"><b>{locationCrew}</b><span>Total Crew (Location + Work Centre)</span></div>
      </section>
      <section className="crewDual">
        <CrewCard title="Available Employees" hint="Employees who can be assigned to the selected supervisor." rows={available} page={availablePage} setPage={setAvailablePage} pageSize={pageSize} setPageSize={setPageSize} selected={selected} setSelected={setSelected} loading={loading} kind="available" />
        <div className="crewTransfer">
          <button className="assignArrow" type="button" disabled={!contextReady || !picked.length || tab === 'Operational Status'} onClick={openAssign}><span>»</span><small>{tab === 'Temporary Deployment' ? 'Deploy' : tab === 'Reassignment & Transfer' ? 'Transfer' : 'Assign'}<br />Selected ({picked.length})</small></button>
          <button className="removeArrow" type="button" disabled={!pickedAssigned.length} onClick={() => setModal('Removal Request')}><span>«</span><small>Remove<br />Selected ({pickedAssigned.length})</small></button>
        </div>
        <CrewCard title="Assigned Crew" hint={supervisor ? `Employees currently assigned to ${supervisor}.` : 'Select a date, location, work centre and supervisor.'} rows={assigned} page={assignedPage} setPage={setAssignedPage} pageSize={pageSize} setPageSize={setPageSize} selected={assignedSelected} setSelected={setAssignedSelected} loading={loading} kind="assigned" menu={menu} setMenu={setMenu} onRemove={(row) => { setAssignedSelected([row.code]); setModal('Removal Request'); }} contextReady={contextReady} />
      </section>
      <div className="crewBottom">
        <Button kind="secondary" disabled={!pickedAssigned.length} onClick={() => setModal('Removal Request')}>Request Removal</Button>
        <Button disabled={!contextReady || (tab === 'Operational Status' ? !pickedAssigned.length : !picked.length)} onClick={() => setModal(tab === 'Operational Status' ? 'Operational Status' : tab === 'Crew Assignment' ? 'Assign' : tab)}>{tab === 'Operational Status' ? `Update Status (${pickedAssigned.length})` : 'Save Assignments'}</Button>
      </div>
    </>}
    {modal === 'Removal Request' && <RemovalRequestModal employees={pickedAssigned} onClose={() => setModal(null)} onSave={async (reason) => {
      const result = await save({ action: 'request-crew-removal', reason, employees: pickedAssigned.map((employee) => ({ code: employee.code, supervisor: employee.currentSupervisor })) });
      setNotice(`${result.requested || 0} removal request${result.requested === 1 ? '' : 's'} sent to the HR manager. The assignment stays until HR confirms.`);
      setAssignedSelected([]);
      setModal(null);
    }} />}
    {modal && modal !== 'Removal Request' && <AssignModal mode={modal} employees={modal === 'Operational Status' ? pickedAssigned : picked} supervisor={supervisor} location={location} workCenter={workCenter} effectiveDate={effectiveDate} onClose={() => setModal(null)} onSave={async (form) => {
      const action = modal === 'Operational Status' ? 'update-crew-status' : 'save-crew';
      const result = await save({
        action,
        employeeCodes: (modal === 'Operational Status' ? pickedAssigned : picked).map((employee) => employee.code),
        assignmentType: modal === 'Temporary Deployment' ? 'Temporary' : 'Primary',
        supervisor: form.supervisor || supervisor,
        location: form.location || location,
        workCenter: form.workCenter || workCenter,
        effectiveFrom: form.effectiveFrom || effectiveDate,
        effectiveTo: form.effectiveTo || '',
        operationalStatus: form.operationalStatus,
        reason: form.reason,
        notes: form.notes,
      });
      const count = result.created ?? result.updated ?? 0;
      setNotice(modal === 'Operational Status' ? `${count} operational status update${count === 1 ? '' : 's'} saved. Employment was not changed.` : `${count} assignment${count === 1 ? '' : 's'} saved. ${result.closed || 0} previous home assignment${result.closed === 1 ? '' : 's'} closed into history. No project hours were created.`);
      setSelected([]);
      setAssignedSelected([]);
      setModal(null);
    }} />}
  </div>;
}

function CrewCard({ title, hint, rows, page, setPage, pageSize, setPageSize, selected, setSelected, loading, kind, menu, setMenu, onRemove, contextReady }) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const allOn = rows.length > 0 && rows.every((row) => selected.includes(row.code));
  const toggle = (code) => setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  return <section className="crewCard">
    <div className="crewCardHead"><div><h3>{title}</h3><p>{hint}</p></div><div><b>{rows.length} employees</b><label><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? [] : rows.map((row) => row.code))} /> Select All</label></div></div>
    <div className="crewTableWrap"><table className="crewTable"><thead><tr><th /><th>Code</th><th>Employee Name</th><th>Type</th><th>Department</th>{kind === 'assigned' ? <th>Assigned From</th> : null}<th>Status</th>{kind === 'available' ? <th>Current Supervisor</th> : <th>Actions</th>}</tr></thead>
      <tbody>{visible.length ? visible.map((row) => <tr key={row.code}>
        <td><input type="checkbox" checked={selected.includes(row.code)} onChange={() => toggle(row.code)} /></td>
        <td>{row.code}</td>
        <td className="wrapCell">{row.name}</td>
        <td>{row.employeeType || '—'}</td>
        <td className="wrapCell">{row.department || '—'}</td>
        {kind === 'assigned' && <td>{row.assignedFrom ? formatDisplayDate(row.assignedFrom) : '—'}</td>}
        <td><Badge tone={toneFor(kind === 'assigned' && row.badge === 'Active' ? 'Active' : row.badge)}>{kind === 'assigned' && row.badge === 'Active' ? 'Active' : row.badge}{row.offshoreRef ? ` · ${row.offshoreRef}` : ''}</Badge></td>
        {kind === 'available' ? <td className="wrapCell">{row.currentSupervisor}</td> : <td className="kebabCell"><button type="button" className="kebab" onClick={() => setMenu(menu === row.code ? null : row.code)}>⋮</button>{menu === row.code && <div className="kebabMenu"><button type="button" onClick={() => onRemove(row)}>Request removal</button></div>}</td>}
      </tr>) : <tr><td colSpan={8}>{loading ? 'Loading…' : kind === 'assigned' && !contextReady ? 'Select the effective date, location, work centre and supervisor. The assigned crew loads on its own.' : 'No employees in this list.'}</td></tr>}</tbody>
    </table></div>
    <div className="crewPager"><span>Showing {rows.length ? safePage * pageSize + 1 : 0} to {Math.min(rows.length, safePage * pageSize + pageSize)} of {rows.length} employees</span><div><button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</button><span>{safePage + 1} / {pages}</span><button type="button" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>›</button><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select></div></div>
  </section>;
}

function AssignModal({ mode, employees, supervisor, location, workCenter, effectiveDate, onClose, onSave }) {
  const [form, setForm] = useState({ supervisor, location, workCenter, effectiveFrom: effectiveDate, effectiveTo: '', operationalStatus: 'Active on Crew', transferType: 'Home supervisor transfer', reason: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const temporary = mode === 'Temporary Deployment';
  const transfer = mode === 'Reassignment & Transfer';
  const statusMode = mode === 'Operational Status';
  const destination = form.supervisor || supervisor;
  const moves = employees.filter((employee) => employee.currentSupervisor && employee.currentSupervisor !== '—' && !sameName(employee.currentSupervisor, destination));
  const unassigned = employees.filter((employee) => employee.badge === 'Unassigned').length;
  const deployed = employees.filter((employee) => employee.temporary).length;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <Modal wide title={statusMode ? 'Update operational status' : temporary ? 'Temporary deployment' : transfer ? 'Reassignment and transfer' : 'Assign crew'} onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !employees.length} onClick={async () => { setSaving(true); setFormError(''); try { await onSave(form); } catch (saveError) { setFormError(saveError.message); } finally { setSaving(false); } }}>{saving ? 'Saving…' : statusMode ? `Update ${employees.length} Employees` : temporary ? `Deploy ${employees.length} Employees` : `Assign ${employees.length} Employees`}</Button></>}>
    {formError && <div className="validationError">{formError}</div>}
    <div className="confirmSummary">
      <p>Supervisor: {destination || '—'}</p>
      <p>Location: {form.location || location}</p>
      <p>Work Centre: {form.workCenter || workCenter}</p>
      <p>Effective From: {formatDisplayDate(form.effectiveFrom || effectiveDate)}</p>
      <p>Assignment Type: {temporary ? 'Temporary deployment' : 'Primary / Home crew'}</p>
      <p>Employees Selected: {employees.length}</p>
      {!statusMode && <p>{unassigned} Unassigned · {moves.length} Currently Assigned to Another Supervisor · {deployed} Temporarily Deployed</p>}
    </div>
    {moves.length > 0 && !temporary && !statusMode && <div className="infoBox">Confirming closes each previous home assignment the day before the new effective date and keeps it in history. {moves.slice(0, 6).map((employee) => `${employee.code}: ${employee.currentSupervisor} → ${destination}`).join('; ')}</div>}
    {temporary && <div className="infoBox">The home crew assignment stays in place. When the end date passes, the employee resolves back to that home crew.</div>}
    {statusMode && <div className="infoBox">This changes operational status only. It does not terminate employment.</div>}
    <div className="tableWrap"><table><thead><tr><th>Code</th><th>Name</th><th>Current supervisor</th><th>Status</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.code}><td>{employee.code}</td><td className="wrapCell">{employee.name}</td><td className="wrapCell">{employee.currentSupervisor}</td><td>{employee.badge}</td></tr>)}</tbody></table></div>
    <div className="formGrid">
      {(temporary || transfer) && <SearchCombo label="Supervisor" placeholder="Search supervisor" value={form.supervisor} onSelect={(item) => setForm((current) => ({ ...current, supervisor: item ? `${item.code} - ${item.name}` : '' }))} search={(q) => searchLookup('supervisor', q)} labelOf={personLabel} detailOf={personDetail} />}
      {(temporary || transfer) && <SearchCombo label="Location / Site" placeholder="Search location" value={form.location} onSelect={(item) => setForm((current) => ({ ...current, location: item?.name || '' }))} search={(q) => searchLookup('location', q)} labelOf={(item) => item.name} />}
      {(temporary || transfer) && <SearchCombo label="Work Centre" placeholder="Search work centre" value={form.workCenter} onSelect={(item) => setForm((current) => ({ ...current, workCenter: item?.name || '' }))} search={(q) => searchLookup('workcenter', q)} labelOf={(item) => item.name} />}
      {transfer && <Field label="Transfer type"><select value={form.transferType} onChange={set('transferType')}><option>Home supervisor transfer</option><option>Location transfer</option><option>Work centre transfer</option></select></Field>}
      {statusMode && <Field label="Operational status"><select value={form.operationalStatus} onChange={set('operationalStatus')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></Field>}
      <Field label="Effective from"><input type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} /></Field>
      {(temporary || statusMode) && <Field label={temporary ? 'Effective to' : 'Effective to (optional)'}><input type="date" value={form.effectiveTo} onChange={set('effectiveTo')} /></Field>}
      <Field label="Reason"><input value={form.reason} onChange={set('reason')} /></Field>
      <Field label="Notes"><textarea value={form.notes} onChange={set('notes')} /></Field>
    </div>
  </Modal>;
}

function RemovalRequestModal({ employees, onClose, onSave }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  return <Modal title="Request crew removal" onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !reason.trim() || !employees.length} onClick={async () => { setSaving(true); setFormError(''); try { await onSave(`${reason.trim()}${notes.trim() ? ` · ${notes.trim()}` : ''}`); } catch (saveError) { setFormError(saveError.message); } finally { setSaving(false); } }}>{saving ? 'Sending…' : `Request removal of ${employees.length}`}</Button></>}><p>The employee stays on the crew until an HR manager confirms. This does not delete history and does not make the employee inactive.</p>{formError && <div className="validationError">{formError}</div>}<div className="pickerList">{employees.map((employee) => <span key={employee.code}><b>{employee.code}</b><span>{employee.name} · {employee.currentSupervisor}</span></span>)}</div><Field label="Reason"><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this person should leave this crew" /></Field><Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></Modal>;
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
      {formError && <div className="validationError">{formError}</div>}
      <p>{decision.employeeCode} · {decision.employeeName} stays with {decision.supervisor} until you confirm. Confirmation ends that crew assignment only.</p>
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
    <div className="panelHead"><div><h3>Assignment history</h3><p>Effective-dated audit of every crew change. A later assignment does not rewrite these rows.</p></div><input className="searchInput" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or supervisor" /></div>
    <Table headers={['Employee', 'Assignment type', 'Previous supervisor', 'New supervisor', 'Location', 'Work centre', 'Effective from', 'Effective to', 'Operational status', 'Reason', 'Changed by', 'Changed date']} rows={events.map((event) => [`${event.employeeCode} · ${event.employeeName}`, event.assignmentType, event.previousSupervisor || '—', event.newSupervisor || '—', event.location || '—', event.workCenter || '—', formatDisplayDate(event.effectiveFrom), formatDisplayDate(event.effectiveTo), event.operationalStatus || '—', event.reason || '—', event.changedBy || '—', formatDisplayDate(event.changedAt)])} empty={loading ? 'Loading history…' : 'No crew changes have been saved.'} />
  </section>;
}
