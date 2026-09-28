'use client';
import React, { useEffect, useState } from 'react';
import { Badge, Button, Field, Modal, Table } from '../components/UI';
import { formatDisplayDate, usePortalData } from '../portal-data';

const emptyLine = (employee) => ({
  employeeCode: employee.employeeCode || employee.code,
  employeeName: employee.employeeName || employee.name,
  location: employee.location || '',
  workCenter: employee.workCenter || '',
  operationalStatus: employee.operationalStatus || 'Active on Crew',
  attendanceStatus: employee.attendanceStatus || '',
  attendanceNote: employee.attendanceNote || '',
  exceptional: Boolean(employee.exceptional),
  exceptionReason: employee.exceptionReason || '',
  nightSession: Boolean(employee.nightSession),
  nightStart: employee.nightStart || '',
  nightEnd: employee.nightEnd || '',
  nightNote: employee.nightNote || '',
  allocations: employee.allocations || [],
});

export default function Review() {
  const { snapshot, error } = usePortalData();
  const [periodId, setPeriodId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [results, setResults] = useState([]);
  const [settings, setSettings] = useState(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [lines, setLines] = useState([]);
  const [columns, setColumns] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [addingProject, setAddingProject] = useState(false);
  const [supervisors, setSupervisors] = useState([]);

  const openPeriods = snapshot.periods.filter((period) => period.status === 'Open' || period.status === 'Planned');
  const period = snapshot.periods.find((item) => item.id === periodId) || openPeriods[0] || snapshot.periods[0];

  useEffect(() => {
    if (!periodId && period) setPeriodId(period.id);
  }, [periodId, period]);

  useEffect(() => {
    const id = sessionStorage.getItem('ts-entry-focus');
    const submittedNotice = sessionStorage.getItem('ts-entry-notice');
    if (!id) return;
    sessionStorage.removeItem('ts-entry-focus');
    sessionStorage.removeItem('ts-entry-notice');
    openSheet(id, { keepNotice: true }).then(() => { if (submittedNotice) setNotice(submittedNotice); });
  }, []);

  useEffect(() => {
    if (!periodId) { setSupervisors([]); return undefined; }
    let cancelled = false;
    const params = new URLSearchParams({ mode: 'review-supervisors', periodId });
    if (workDate) params.set('workDate', workDate);
    fetch(`/api/timesheet-management/entry?${params}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        const names = Array.isArray(body.data) ? body.data : [];
        setSupervisors(names);
        setSupervisor((current) => names.includes(current) ? current : '');
      })
      .catch(() => { if (!cancelled) setSupervisors([]); });
    return () => { cancelled = true; };
  }, [periodId, workDate]);

  const visible = supervisor ? results.filter((item) => item.supervisor === supervisor) : results;

  const loadResults = async (selectedPeriod, date) => {
    const params = new URLSearchParams({ mode: 'review', periodId: selectedPeriod, workDate: date });
    const response = await fetch(`/api/timesheet-management/entry?${params}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'Search failed.');
    setResults(body.data?.timesheets || []);
    setSettings(body.data?.settings || null);
    setSearched(true);
    return body.data?.timesheets || [];
  };

  const search = async () => {
    if (!periodId || !workDate) {
      setPageError('Choose a period and a work date.');
      return;
    }
    if (dirty && !window.confirm('Leave this timesheet with unsaved changes?')) return;
    setSearching(true);
    setPageError('');
    setNotice('');
    setSheet(null);
    setLines([]);
    setDirty(false);
    try {
      const timesheets = await loadResults(periodId, workDate);
      if (timesheets.length === 1) await openSheet(timesheets[0].id, { skipConfirm: true });
    } catch (searchError) {
      setPageError(searchError.message);
    } finally {
      setSearching(false);
    }
  };

  const openSheet = async (id, options = {}) => {
    if (!options.skipConfirm && dirty && !window.confirm('Leave this timesheet with unsaved changes?')) return;
    setPageError('');
    if (!options.keepNotice) setNotice('');
    const response = await fetch(`/api/timesheet-management/entry?mode=sheet&id=${id}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.status === 'error' || !body.data) {
      setPageError(body.error || 'Timesheet was not found.');
      return;
    }
    const next = body.data;
    setPeriodId(next.periodId);
    setWorkDate(next.workDate);
    setSheet(next);
    setSettings(next.settings || settings);
    if (next.periodId && next.workDate) loadResults(next.periodId, next.workDate).catch(() => {});
    const nextLines = (next.lines || []).map(emptyLine);
    setLines(nextLines);
    const codes = new Map();
    nextLines.forEach((line) => line.allocations.forEach((item) => codes.set(item.projectCode, { code: item.projectCode, name: item.projectName || item.projectCode, kind: item.kind || 'Project' })));
    setColumns([...codes.values()]);
    setDirty(false);
  };

  return <>
    <div className="pageTitle"><div><span className="eyebrow">QUALITY GATE</span><h1>Timesheet Booking Review</h1><p>Review &amp; Validate submits the booking the first time. Resubmit is only for a later correction, and only until approval has started.</p></div></div>
    {(error || pageError) && <div className="success" style={{ background: '#fef2f2', color: '#991b1b' }}>{pageError || error}</div>}
    {notice && <div className="success">{notice} <button onClick={() => setNotice('')}>×</button></div>}
    <div className="filters six">
      <Field label="Timesheet Period"><select value={periodId} onChange={(event) => { setPeriodId(event.target.value); setSearched(false); }}><option value="">Select a period</option>{snapshot.periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Work Date"><input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} /></Field>
      <Field label="Supervisor"><select value={supervisor} onChange={(event) => setSupervisor(event.target.value)}><option value="">All supervisors</option>{supervisors.map((name) => <option key={name}>{name}</option>)}</select></Field>
      <div className="actions" style={{ alignSelf: 'end' }}><Button disabled={searching} onClick={() => search()}>{searching ? 'Searching…' : 'Find timesheet'}</Button></div>
    </div>
    {sheet ? <SheetEditor
      sheet={sheet}
      lines={lines}
      setLines={setLines}
      columns={columns}
      settings={settings}
      setDirty={setDirty}
      saving={saving}
      setSaving={setSaving}
      setNotice={setNotice}
      setPageError={setPageError}
      setSheet={setSheet}
      onBack={() => { if (dirty && !window.confirm('Leave this timesheet with unsaved changes?')) return; setSheet(null); setDirty(false); }}
      onAddProject={() => setAddingProject(true)}
    /> : <div className="panel">
      <div className="panelHead"><div><h3>{workDate ? formatDisplayDate(workDate) : 'Saved timesheets'}</h3><p>{searched ? `${visible.length} timesheet${visible.length === 1 ? '' : 's'} for this date.` : 'Choose a work date and find the timesheet.'}</p></div></div>
      <Table headers={['Reference', 'Supervisor', 'Shift', 'Crew', 'REG', 'OVT', 'Version', 'Status', '']} rows={visible.map((item) => [
        item.reference,
        item.supervisor,
        item.shift,
        item.crew,
        item.regularHours,
        item.ovtHours,
        `v${item.version}`,
        <Badge tone={item.editable ? 'green' : 'slate'}>{item.status}</Badge>,
        <Button kind="secondary" onClick={() => openSheet(item.id)}>{item.editable ? 'Edit' : 'View'}</Button>,
      ])} empty={searched ? 'No timesheet was saved for this date.' : 'Search by work date to open a timesheet.'} />
    </div>}
    {addingProject && <ProjectPicker onClose={() => setAddingProject(false)} onPick={(project) => { setColumns((current) => current.some((item) => item.code === project.code) ? current : [...current, project]); setAddingProject(false); }} />}
  </>;
}

function SheetEditor({ sheet, lines, setLines, columns, settings, setDirty, saving, setSaving, setNotice, setPageError, setSheet, onBack, onAddProject }) {
  const editable = Boolean(sheet.editable);
  const alreadySent = sheet.status === 'Submitted' || sheet.status === 'Returned';
  const sendLabel = alreadySent ? 'Resubmit' : 'Submit';
  const showSend = editable && (sheet.status !== 'Submitted' || dirty);
  const onApprovedLeave = (line) => line?.operationalStatus === 'Approved Leave' || line?.attendanceStatus === 'Approved Leave';
  const expectedFor = (line) => onApprovedLeave(line) && !/^C\d/i.test(line?.employeeCode || '') ? 0 : (settings?.expectedHours || 8);
  const leaveIdleLocked = (line) => onApprovedLeave(line) && /^C\d/i.test(line?.employeeCode || '');
  const capAllocations = (allocations, limit) => {
    let remaining = limit;
    return (allocations || []).map((item) => {
      const regularHours = Math.min(Math.max(0, Number(item.regularHours || 0)), remaining);
      remaining -= regularHours;
      return { ...item, regularHours };
    });
  };
  const updateAllocation = (employeeCode, projectCode, patch) => {
    const target = lines.find((line) => line.employeeCode === employeeCode);
    if (!editable || leaveIdleLocked(target)) return;
    setDirty(true);
    setLines((current) => current.map((line) => {
      if (line.employeeCode !== employeeCode || leaveIdleLocked(line)) return line;
      const nextPatch = Object.prototype.hasOwnProperty.call(patch, 'regularHours')
        ? { ...patch, regularHours: Math.min(Math.max(0, Number(patch.regularHours) || 0), expectedFor(line)) }
        : patch;
      const existing = line.allocations.find((item) => item.projectCode === projectCode);
      const allocations = existing
        ? line.allocations.map((item) => item.projectCode === projectCode ? { ...item, ...nextPatch } : item)
        : [...line.allocations, { projectCode, projectName: projectCode, kind: 'Project', regularHours: 0, ovtHours: 0, ...nextPatch }];
      return { ...line, allocations: Object.prototype.hasOwnProperty.call(patch, 'regularHours') ? capAllocations(allocations, expectedFor(line)) : allocations };
    }));
  };

  const persist = async (resubmit) => {
    setSaving(true);
    setPageError('');
    try {
      const response = await fetch('/api/timesheet-management/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          intent: 'save',
          periodId: sheet.periodId,
          workDate: sheet.workDate,
          supervisor: sheet.supervisor,
          location: sheet.location,
          workCenter: sheet.workCenter,
          shift: sheet.shift,
          lines: lines.map((line) => ({ ...line, allocations: capAllocations(line.allocations, expectedFor(line)) })),
        }),
      });
      const body = await response.json();
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'Save failed.');
      let saved = body.data;
      if (resubmit) {
        const submitResponse = await fetch('/api/timesheet-management/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit', id: saved.id }),
        });
        const submitBody = await submitResponse.json();
        if (!submitResponse.ok || submitBody.status === 'error') throw new Error(submitBody.error || 'Resubmit failed. The changes are saved as a draft.');
        saved = submitBody.data;
      }
      setSheet(saved);
      setLines((saved.lines || []).map(emptyLine));
      setDirty(false);
      setNotice(resubmit ? `${saved.reference} ${alreadySent ? 'resubmitted' : 'submitted'} · v${saved.version}` : `${saved.reference} saved as draft · v${saved.version}.`);
    } catch (saveError) {
      setPageError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="panel">
    <div className="panelHead"><div><h3>{sheet.reference} · {formatDisplayDate(sheet.workDate)}</h3><p>{sheet.supervisor} · {sheet.shift} · v{sheet.version} · {sheet.status}{sheet.dayKind ? ` · ${sheet.dayKind}` : ''}{sheet.holidayName ? ` · ${sheet.holidayName}` : ''}</p></div><div className="actions"><Button kind="secondary" onClick={onBack}>Back</Button>{editable && <Button kind="secondary" disabled={saving} onClick={() => persist(false)}>{saving ? 'Saving…' : 'Save'}</Button>}{showSend && <Button disabled={saving} onClick={() => persist(true)}>{sendLabel}</Button>}</div></div>
    {!editable && <div className="infoBox">Approval has started for this timesheet. The hours are read only.</div>}
    {editable && sheet.status === 'Submitted' && !dirty && <div className="infoBox">This timesheet is already submitted. Change the hours only if a correction is needed, then resubmit before approval starts.</div>}
    {editable && <div className="toolbar"><div /><div className="actions"><Button kind="secondary" onClick={onAddProject}>+ Add Project</Button></div></div>}
    <div className="tableWrap"><table><thead><tr><th>Employee</th><th>Attendance</th>{columns.map((column) => <th key={column.code}><span className="hourHead">{column.code}<small>{column.name && column.name !== column.code ? column.name : 'REG · OVT'}</small></span></th>)}<th>REG</th><th>OVT</th><th>Expected</th><th>Status</th></tr></thead><tbody>
      {lines.map((line) => {
        const expected = expectedFor(line);
        const capped = capAllocations(line.allocations, expected);
        const regular = capped.reduce((sum, item) => sum + Number(item.regularHours || 0), 0);
        const ovt = line.allocations.reduce((sum, item) => sum + Number(item.ovtHours || 0), 0);
        const unallocated = Math.max(0, expected - regular);
        const status = line.operationalStatus === 'Approved Leave' && regular > 0 && !/^C\d/i.test(line.employeeCode || '') ? 'Leave Conflict' : regular > expected ? 'Overbooked' : unallocated > 0 && expected > 0 ? 'Underbooked' : 'Balanced';
        return <tr key={line.employeeCode}><td><b>{line.employeeName}</b><small className="block">{line.employeeCode}</small></td><td><Badge tone={line.attendanceStatus ? 'green' : 'amber'}>{line.attendanceStatus || line.operationalStatus || '—'}</Badge></td>{columns.map((column) => {
          const allocation = line.allocations.find((item) => item.projectCode === column.code);
          const cappedItem = capped.find((item) => item.projectCode === column.code);
          const regularValue = Number(cappedItem?.regularHours || 0);
          const locked = !editable || leaveIdleLocked(line);
          const setHours = (field, value) => updateAllocation(line.employeeCode, column.code, { [field]: value, projectName: column.name, kind: column.kind || 'Project' });
          return <td key={column.code}><div className="hourPair"><label>REG<input className={locked ? 'locked' : undefined} type="number" min="0" max={expected} step="0.5" inputMode="decimal" readOnly={locked} value={locked ? regularValue : (regularValue || '')} onChange={(event) => { if (!locked) setHours('regularHours', Number(event.target.value) || 0); }} /></label><label>OVT<input className={locked ? 'locked' : undefined} type="number" min="0" step="0.5" inputMode="decimal" readOnly={locked} value={locked ? Number(allocation?.ovtHours || 0) : (allocation?.ovtHours || '')} onChange={(event) => { if (!locked) setHours('ovtHours', Number(event.target.value) || 0); }} /></label></div></td>;
        })}<td>{regular}</td><td>{ovt}</td><td>{expected}</td><td><Badge tone={status === 'Balanced' ? 'green' : 'amber'}>{status}</Badge></td></tr>;
      })}
      {!lines.length && <tr><td colSpan={6 + columns.length}>This timesheet has no employees.</td></tr>}
    </tbody></table></div>
  </div>;
}

function ProjectPicker({ onClose, onPick }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/timesheet-management/entry?mode=search&kind=project&q=${encodeURIComponent(query)}`).then((response) => response.json()).then((body) => setItems(body.data || []));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);
  return <Modal title="Add project" onClose={onClose} footer={<Button kind="secondary" onClick={onClose}>Close</Button>}><Field label="Search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code, name, client" /></Field><div className="pickerList">{items.map((item) => <button key={item.code} type="button" onClick={() => onPick(item)}><b>{item.code}</b><span>{item.name}</span></button>)}{!items.length && <span>No matches</span>}</div></Modal>;
}
