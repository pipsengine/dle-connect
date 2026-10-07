'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnchoredMenu, Badge, Button, Field, Modal, Table } from '../components/UI';
import { formatDisplayDate, usePortalData } from '../portal-data';

const emptyLine = (employee) => ({
  employeeCode: employee.employeeCode || employee.code,
  employeeName: employee.employeeName || employee.name,
  location: employee.location || '',
  workCenter: employee.workCenter || '',
  operationalStatus: employee.operationalStatus || 'Active on Crew',
  attendanceStatus: employee.attendanceStatus || '',
  attendanceNote: '',
  exceptional: Boolean(employee.exceptional),
  exceptionReason: employee.exceptionReason || '',
  nightSession: (employee.operationalStatus || '') === 'Approved Leave' ? false : Boolean(employee.nightSession),
  nightStart: (employee.operationalStatus || '') === 'Approved Leave' ? '' : (employee.nightStart || ''),
  nightEnd: (employee.operationalStatus || '') === 'Approved Leave' ? '' : (employee.nightEnd || ''),
  nightNote: (employee.operationalStatus || '') === 'Approved Leave' ? '' : (employee.nightNote || ''),
  allocations: Array.isArray(employee.allocations) ? employee.allocations : [],
});

export default function Entry({ setPage }) {
  const { snapshot } = usePortalData();
  const [workspace, setWorkspace] = useState('New Booking');
  const [periodId, setPeriodId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [supervisor, setSupervisor] = useState(null);
  const [location, setLocation] = useState('');
  const [workCenter, setWorkCenter] = useState('');
  const [shift, setShift] = useState('Day');
  const [context, setContext] = useState(null);
  const [lines, setLines] = useState([]);
  const [offshoreCrew, setOffshoreCrew] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const loadedKey = useRef('');

  const periods = Array.isArray(snapshot?.periods) ? snapshot.periods : [];
  const openPeriods = periods.filter((period) => period.status === 'Open' || period.status === 'Planned');
  const period = periods.find((item) => item.id === periodId) || context?.period;
  const defaultPeriodId = openPeriods[0]?.id || '';

  useEffect(() => {
    if (!periodId && defaultPeriodId) setPeriodId(defaultPeriodId);
  }, [periodId, defaultPeriodId]);

  useEffect(() => {
    if (!periodId || !workDate || !supervisor?.name) return;
    const key = `${periodId}|${workDate}|${supervisor.code || supervisor.name}|${shift}`;
    if (loadedKey.current === key) return;
    if (dirty && !window.confirm('You have unsaved booking changes. Load the selected crew and discard them?')) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ mode: 'resolve', periodId, workDate, supervisor: supervisor.name, supervisorCode: supervisor.code || '', shift });
    fetch(`/api/timesheet-management/entry?${params}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        if (body.status === 'error') throw new Error(body.error);
        const data = body.data;
        setContext(data);
        const nextLines = (data.timesheet ? data.timesheet.lines : (data.crew || [])).map(emptyLine).filter((line) => /^C\d/i.test(line.employeeCode || ''));
        setLines(nextLines);
        setOffshoreCrew(Array.isArray(data.offshoreCrew) ? data.offshoreCrew : []);
        const codes = new Map();
        nextLines.forEach((line) => (Array.isArray(line.allocations) ? line.allocations : []).forEach((item) => {
          const code = item && typeof item === 'object' ? String(item.projectCode || '') : '';
          if (code) codes.set(code, { code, name: String(item.projectName || code), kind: String(item.kind || 'Project') });
        }));
        setColumns([...codes.values()]);
        setDirty(false);
        loadedKey.current = key;
      })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [periodId, workDate, supervisor, shift]);

  useEffect(() => {
    if (workspace === 'New Booking') return;
    const status = workspace === 'Drafts' ? 'Draft' : workspace === 'Returned' ? 'Returned' : '';
    fetch(`/api/timesheet-management/entry?mode=list&status=${encodeURIComponent(status)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => setSheets(body.data || []))
      .catch(() => setSheets([]));
  }, [workspace]);

  const onApprovedLeave = (line) => line?.operationalStatus === 'Approved Leave' || line?.attendanceStatus === 'Approved Leave';
  const regularLimit = (line) => onApprovedLeave(line) && !/^C\d/i.test(line?.employeeCode || '') ? 0 : (context?.settings?.expectedHours || 8);
  const leaveIdleLocked = (line) => onApprovedLeave(line) && /^C\d/i.test(line?.employeeCode || '');
  const capAllocations = (allocations, limit) => {
    let remaining = limit;
    return (allocations || []).map((item) => {
      const regularHours = Math.min(Math.max(0, Number(item.regularHours || 0)), remaining);
      remaining -= regularHours;
      return { ...item, regularHours };
    });
  };
  const namesMatch = (left, right) => {
    const a = String(left || '').trim().toLowerCase();
    const b = String(right || '').trim().toLowerCase();
    if (!a || !b || a === '—' || b === '—' || a === 'unassigned' || b === 'unassigned') return false;
    return a === b || a.includes(b) || b.includes(a);
  };
  const siteExact = (site) => String(site || '').trim().toLowerCase() === String(location || '').trim().toLowerCase();
  const offshoreHere = location ? offshoreCrew.filter((row) => siteExact(row.site) && namesMatch(row.supervisor, supervisor?.name || '')) : [];
  const viewingOffshore = Boolean(location) && offshoreCrew.some((row) => siteExact(row.site));
  const visible = (viewingOffshore
    ? offshoreHere.map((row) => {
      const existing = lines.find((line) => line.employeeCode === row.employeeCode);
      if (existing) return existing;
      const onLeave = (context?.classification?.dayKind || 'Weekday') === 'Weekday' && (context?.approvedLeaveCodes || []).includes(String(row.employeeCode || '').toUpperCase());
      const expected = context?.settings?.expectedHours || 8;
      return emptyLine({
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        location: row.site,
        operationalStatus: onLeave ? 'Approved Leave' : 'Mobilized Offshore',
        attendanceStatus: onLeave ? 'Approved Leave' : '',
        allocations: onLeave ? [{ projectCode: 'DL1949', projectName: 'IDLE TIME', kind: 'Project', regularHours: expected, ovtHours: 0, comment: 'Approved paid leave' }] : [],
      });
    })
    : lines.filter((line) => (!location || line.location === location) && (!workCenter || line.workCenter === workCenter))
  ).filter((line) => /^C\d/i.test(line.employeeCode || ''));
  const employeeNeedle = employeeQuery.trim().toLowerCase();
  const shown = employeeNeedle
    ? visible.filter((line) => `${line.employeeName} ${line.employeeCode}`.toLowerCase().includes(employeeNeedle))
    : visible;
  const totals = useMemo(() => visible.reduce((sum, line) => {
    const limit = onApprovedLeave(line) && !/^C\d/i.test(line?.employeeCode || '') ? 0 : (context?.settings?.expectedHours || 8);
    const regular = capAllocations(line.allocations, limit).reduce((inner, item) => inner + Number(item.regularHours || 0), 0);
    const ovt = line.allocations.reduce((inner, item) => inner + Number(item.ovtHours || 0), 0);
    return {
      regular: sum.regular + regular,
      ovt: sum.ovt + ovt,
      night: sum.night + (line.nightSession && line.operationalStatus !== 'Approved Leave' ? 1 : 0),
      leave: sum.leave + (onApprovedLeave(line) ? 1 : 0),
      offshore: sum.offshore + (line.operationalStatus === 'Mobilized Offshore' ? 1 : 0),
      missing: sum.missing + (!line.attendanceStatus && line.operationalStatus !== 'Approved Leave' ? 1 : 0),
      unallocated: sum.unallocated + Math.max(0, limit - regular),
    };
  }, { regular: 0, ovt: 0, night: 0, leave: 0, offshore: 0, missing: 0, unallocated: 0 }), [visible, context]);

  const persist = async (intent) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/timesheet-management/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', intent, periodId, workDate, supervisor: supervisor?.name, location, workCenter, shift, lines: lines.map((line) => ({ ...line, allocations: capAllocations(line.allocations, regularLimit(line)) })) }),
      });
      const body = await response.json();
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'Save failed.');
      let saved = body.data;
      if (intent === 'review') {
        const submitResponse = await fetch('/api/timesheet-management/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit', id: saved.id }),
        });
        const submitBody = await submitResponse.json();
        if (!submitResponse.ok || submitBody.status === 'error') throw new Error(submitBody.error || 'Submit failed. The hours are saved as a draft.');
        saved = submitBody.data;
      }
      setLines((saved?.lines || []).map(emptyLine));
      setContext((current) => ({ ...(current || {}), timesheet: saved }));
      setDirty(false);
      setNotice(intent === 'review' ? `${saved?.reference || ''} submitted · v${saved?.version || 1}` : `Draft saved · ${saved?.reference || ''} · v${saved?.version || 1}`);
      if (intent === 'review') {
        sessionStorage.setItem('ts-entry-focus', saved.id);
        sessionStorage.setItem('ts-entry-notice', `${saved.reference} submitted · v${saved.version}`);
        setPage('Timesheet Review');
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const updateAllocation = (employeeCode, projectCode, patch) => {
    const currentLine = lines.find((line) => line.employeeCode === employeeCode) || visible.find((line) => line.employeeCode === employeeCode);
    if (leaveIdleLocked(currentLine)) return;
    setDirty(true);
    setLines((current) => {
      const base = current.some((line) => line.employeeCode === employeeCode) ? current : [...current, emptyLine(currentLine || { employeeCode, operationalStatus: 'Mobilized Offshore', location })];
      return base.map((line) => {
        if (line.employeeCode !== employeeCode || leaveIdleLocked(line)) return line;
        const nextPatch = Object.prototype.hasOwnProperty.call(patch, 'regularHours')
          ? { ...patch, regularHours: Math.min(Math.max(0, Number(patch.regularHours) || 0), regularLimit(line)) }
          : patch;
        const existing = line.allocations.find((item) => item.projectCode === projectCode);
        const allocations = existing
          ? line.allocations.map((item) => item.projectCode === projectCode ? { ...item, ...nextPatch } : item)
          : [...line.allocations, { projectCode, projectName: projectCode, kind: 'Project', regularHours: 0, ovtHours: 0, ...nextPatch }];
        return { ...line, allocations: Object.prototype.hasOwnProperty.call(patch, 'regularHours') ? capAllocations(allocations, regularLimit(line)) : allocations };
      });
    });
  };

  const addColumn = (project) => {
    setColumns((current) => current.some((item) => item.code === project.code) ? current : [...current, project]);
    setModal(null);
  };

  return <>
    <div className="pageTitle"><div><span className="eyebrow">CAPTURE</span><h1>Timesheet Entry</h1><p>The crew for the work date loads from the supervisor assignment. Projects are added only for this timesheet.</p></div><div className="actions"><Button kind="secondary" disabled={saving || !lines.length} onClick={() => persist('save')}>Save Draft</Button><Button disabled={saving || !lines.length} onClick={() => persist('review')}>Review & Validate</Button></div></div>
    <div className="tabs">{['New Booking', 'Drafts', 'Previous Bookings', 'Returned'].map((item) => <button key={item} className={workspace === item ? 'active' : ''} onClick={() => { if (dirty && !window.confirm('Leave this booking with unsaved changes?')) return; setWorkspace(item); }}>{item}</button>)}</div>
    {(error || notice) && <div className="success" style={error ? { background: '#fef2f2', color: '#991b1b' } : undefined}>{error || notice} <button onClick={() => { setError(''); setNotice(''); }}>×</button></div>}
    {workspace !== 'New Booking' ? <SheetList sheets={sheets} onOpen={async (sheet) => {
      const response = await fetch(`/api/timesheet-management/entry?mode=sheet&id=${sheet.id}`);
      const body = await response.json();
      if (body.status === 'error') { setError(body.error); return; }
      setPeriodId(body.data.periodId);
      setWorkDate(body.data.workDate);
      setSupervisor({ code: '', name: body.data.supervisor });
      setShift(body.data.shift || 'Day');
      setLines(body.data.lines.map(emptyLine));
      setContext({ timesheet: body.data, dateAllowed: true, bookingAllowed: body.data.status === 'Draft', classification: { dayKind: body.data.dayKind, holidayName: body.data.holidayName }, settings: context?.settings });
      loadedKey.current = `${body.data.periodId}|${body.data.workDate}|${body.data.supervisor}|${body.data.shift || 'Day'}`;
      setWorkspace('New Booking');
      setDirty(false);
    }} /> : <>
      <div className="filters six">
        <Field label="Timesheet Period"><select value={periodId} onChange={(event) => { loadedKey.current = ''; setPeriodId(event.target.value); }}><option value="">Open periods</option>{openPeriods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{openPeriods.length === 0 && periods.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></Field>
        <Field label="Work Date"><input type="date" value={workDate} onChange={(event) => { loadedKey.current = ''; setWorkDate(event.target.value); }} /></Field>
        <Combo label="Supervisor" placeholder="Search supervisor code or name" selected={supervisor} onSelect={(value) => { loadedKey.current = ''; setSupervisor(value); }} search={(q) => fetch(`/api/timesheet-management/entry?mode=search&kind=supervisor&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={(item) => item.code ? `${item.code} - ${item.name}${item.crew ? ` (${item.crew})` : ''}` : item.name} />
        <Combo label="Location / Site" placeholder="Search location" selected={location ? { name: location } : null} onSelect={(value) => setLocation(value?.name || '')} search={(q) => fetch(`/api/timesheet-management/entry?mode=search&kind=location&workDate=${workDate}&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={(item) => item.name} />
        <Combo label="Work Centre" placeholder="Search work centre" selected={workCenter ? { name: workCenter } : null} onSelect={(value) => setWorkCenter(value?.name || '')} search={(q) => fetch(`/api/timesheet-management/entry?mode=search&kind=workCenter&q=${encodeURIComponent(q)}`).then((response) => response.json()).then((body) => body.data || [])} labelOf={(item) => item.name} />
        <Field label="Shift"><select value={shift} onChange={(event) => { loadedKey.current = ''; setShift(event.target.value); }}><option>Day</option><option>Night</option></select></Field>
      </div>
      {period && <div className="periodBanner"><div><span>PERIOD</span><b>{period.name?.replace(' Period', '')}</b><small>{formatDisplayDate(period.startDate)} – {formatDisplayDate(period.endDate)}</small></div><Badge tone={period.status === 'Open' ? 'green' : 'slate'}>{period.status}</Badge>{context?.classification?.dayKind === 'Public Holiday' && <div><span>PUBLIC HOLIDAY</span><b>{context.classification.holidayName}</b></div>}{context?.classification && context.classification.dayKind !== 'Public Holiday' && <div><span>DAY TYPE</span><b>{context.classification.dayKind}</b></div>}{context?.timesheet && <div><span>SAVED TIMESHEET</span><b>{context.timesheet.reference} · v{context.timesheet.version}</b><small>{context.timesheet.status} · {context.timesheet.updatedBy || ''}</small></div>}</div>}
      {context?.message && <div className="infoBox">{context.message}</div>}
      {viewingOffshore && <div className="infoBox">These employees are mobilized to this offshore site. Hours stay empty until they are booked here. Mobilization does not create attendance or payable hours, and the Nigeria calendar classification is unchanged.</div>}
      <div className="summaryStrip"><span><b>{visible.length}</b> Crew</span><span><b>{visible.length - totals.missing}</b> With status</span><span><b>{totals.missing}</b> Missing evidence</span><span><b>{totals.leave}</b> Leave</span><span><b>{totals.offshore}</b> Offshore</span><span><b>{totals.regular}h</b> REG</span><span><b>{totals.ovt}h</b> {context?.classification?.dayKind === 'Public Holiday' ? 'PH OVT' : context?.classification?.dayKind === 'Saturday' ? 'Sat OVT' : context?.classification?.dayKind === 'Sunday' ? 'Sun OVT' : 'OVT'}</span><span><b>{totals.night}</b> Night</span><span><b>{totals.unallocated}h</b> Unallocated</span></div>
      <div className="toolbar"><input className="searchInput" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search employee code or name" aria-label="Search employee" /><div className="actions"><Button kind="secondary" onClick={() => setModal('project')}>+ Add Project</Button><Button kind="secondary" onClick={() => setModal('activity')}>+ Internal Activity</Button><Button kind="secondary" onClick={() => setModal('ovt')}>Bulk Project OVT</Button><Button kind="secondary" onClick={() => setModal('night')}>Book Night Work</Button><Button kind="secondary" onClick={() => setModal('employee')}>+ Add Employee</Button></div></div>
      <div className="panel matrix"><div className="tableWrap"><table><thead><tr><th>Employee</th><th>Attendance</th>{columns.map((column) => <th key={column.code}><span className="hourHead">{column.code}<small>{column.name && column.name !== column.code ? column.name : 'REG · OVT'}</small></span></th>)}<th>REG</th><th>OVT</th><th>Night</th><th>Total</th><th>Expected</th><th>Unallocated</th><th>Status</th></tr></thead><tbody>
        {loading && <tr><td colSpan={8 + columns.length}>Resolving crew for this supervisor and date…</td></tr>}
        {!loading && shown.map((line, rowIndex) => {
          const expected = regularLimit(line);
          const cappedAllocations = capAllocations(line.allocations, expected);
          const regular = cappedAllocations.reduce((sum, item) => sum + Number(item.regularHours || 0), 0);
          const ovt = line.allocations.reduce((sum, item) => sum + Number(item.ovtHours || 0), 0);
          const unallocated = Math.max(0, expected - regular);
          const status = line.operationalStatus === 'Approved Leave' && regular > 0 && !/^C\d/i.test(line.employeeCode || '') ? 'Leave Conflict' : regular > expected ? 'Overbooked' : unallocated > 0 && expected > 0 ? 'Underbooked' : 'Balanced';
          const focusHours = (employeeCode, projectCode, field) => {
            const node = document.querySelector(`[data-hour="${employeeCode}|${projectCode}|${field}"]`);
            if (node instanceof HTMLInputElement) { node.focus(); node.select(); }
          };
          const moveHours = (event, columnIndex, field) => {
            if (event.key !== 'Tab' && event.key !== 'Enter') return;
            const backward = event.shiftKey;
            const column = columns[columnIndex];
            let next = null;
            if (event.key === 'Enter') {
              const nextRow = rowIndex + (backward ? -1 : 1);
              if (nextRow >= 0 && nextRow < shown.length) next = [shown[nextRow].employeeCode, column.code, field];
            } else if (!backward) {
              if (field === 'reg') next = [line.employeeCode, column.code, 'ovt'];
              else if (rowIndex + 1 < shown.length) next = [shown[rowIndex + 1].employeeCode, column.code, 'reg'];
              else if (columnIndex + 1 < columns.length) next = [shown[0].employeeCode, columns[columnIndex + 1].code, 'reg'];
            } else if (field === 'ovt') next = [line.employeeCode, column.code, 'reg'];
            else if (rowIndex > 0) next = [shown[rowIndex - 1].employeeCode, column.code, 'ovt'];
            else if (columnIndex > 0) next = [shown[shown.length - 1].employeeCode, columns[columnIndex - 1].code, 'ovt'];
            if (!next) return;
            event.preventDefault();
            focusHours(next[0], next[1], next[2]);
          };
          return <tr key={line.employeeCode}><td><b>{line.employeeName}</b><small className="block">{line.employeeCode}{line.exceptional ? ' · exception' : ''}</small></td><td><Badge tone={line.attendanceStatus ? 'green' : line.operationalStatus === 'Approved Leave' ? 'blue' : 'amber'}>{line.attendanceStatus || line.operationalStatus || 'Missing Evidence'}</Badge></td>{columns.map((column, columnIndex) => {
            const allocation = line.allocations.find((item) => item.projectCode === column.code);
            const capped = cappedAllocations.find((item) => item.projectCode === column.code);
            const regularValue = Number(capped?.regularHours || 0);
            const regularRoom = regularValue + Math.max(0, expected - regular);
            const locked = leaveIdleLocked(line);
            const setHours = (field, value) => updateAllocation(line.employeeCode, column.code, { [field]: value, projectName: column.name, kind: column.kind || 'Project' });
            return <td key={column.code}><div className="hourPair"><label>REG<input className={locked ? 'locked' : undefined} data-hour={`${line.employeeCode}|${column.code}|reg`} type="number" min="0" max={regularRoom} step="0.5" inputMode="decimal" readOnly={locked} aria-label={`${column.code} regular hours for ${line.employeeName}${locked ? ', approved leave, read only' : `, maximum ${regularRoom}`}`} title={locked ? 'Approved leave hours cannot be changed' : `Regular hours cannot pass ${expected} for this day`} value={locked ? regularValue : (regularValue || '')} onChange={(event) => { if (!locked) setHours('regularHours', Number(event.target.value) || 0); }} onKeyDown={(event) => moveHours(event, columnIndex, 'reg')} /></label><label>OVT<input className={locked ? 'locked' : undefined} data-hour={`${line.employeeCode}|${column.code}|ovt`} type="number" min="0" step="0.5" inputMode="decimal" readOnly={locked} aria-label={`${column.code} overtime hours for ${line.employeeName}${locked ? ', approved leave, read only' : ''}`} title={locked ? 'Approved leave hours cannot be changed' : undefined} value={locked ? Number(allocation?.ovtHours || 0) : (allocation?.ovtHours || '')} onChange={(event) => { if (!locked) setHours('ovtHours', Number(event.target.value) || 0); }} onKeyDown={(event) => moveHours(event, columnIndex, 'ovt')} /></label></div></td>;
          })}<td>{regular}</td><td>{ovt}</td><td>{line.nightSession && line.operationalStatus !== 'Approved Leave' ? `${line.nightStart || context?.settings?.nightStart || '18:00'}–${line.nightEnd || ''}` : '—'}</td><td>{regular + ovt}</td><td>{expected}</td><td className={unallocated ? 'red' : ''}>{unallocated}</td><td><Badge tone={status === 'Balanced' ? 'green' : 'amber'}>{status}</Badge></td></tr>;
        })}
        {!loading && !shown.length && <tr><td colSpan={8 + columns.length}>{employeeNeedle ? 'No employee matches that search.' : supervisor ? 'No eligible crew for this supervisor on the selected date.' : 'Search for a supervisor to load the crew.'}</td></tr>}
      </tbody></table></div></div>
    </>}
    {modal === 'project' && <SearchModal title="Add project" kind="project" onClose={() => setModal(null)} onPick={addColumn} />}
    {modal === 'activity' && <SearchModal title="Add internal activity" kind="activity" onClose={() => setModal(null)} onPick={addColumn} />}
    {modal === 'employee' && <ExceptionModal onClose={() => setModal(null)} onAdd={(employee) => { setLines((current) => current.some((line) => line.employeeCode === employee.code) ? current : [...current, emptyLine({ ...employee, employeeCode: employee.code, employeeName: employee.name, exceptional: false, operationalStatus: 'Active on Crew' })]); setDirty(true); setModal(null); }} />}
    {modal === 'ovt' && <BulkModal title="Bulk project OVT" columns={columns} employees={visible} onClose={() => setModal(null)} onApply={(projectCode, employeeCodes, ovtHours, reason) => { employeeCodes.forEach((code) => updateAllocation(code, projectCode, { ovtHours, ovtReason: reason })); setModal(null); }} />}
    {modal === 'night' && <NightModal employees={visible} workDate={workDate} location={location} workCenter={workCenter} nightStart={context?.settings?.nightStart || '18:00'} allowance={context?.settings?.nightAllowance || 1500} onClose={() => setModal(null)} onApply={({ picked, added, start, end, note }) => {
      const shown = new Set(visible.filter((line) => line.operationalStatus !== 'Approved Leave').map((line) => line.employeeCode));
      setLines((current) => {
        const next = current.map((line) => {
          if (line.operationalStatus === 'Approved Leave') return { ...line, nightSession: false, nightStart: '', nightEnd: '', nightNote: '' };
          if (picked.includes(line.employeeCode)) return { ...line, nightSession: true, nightStart: start, nightEnd: end, nightNote: note };
          if (shown.has(line.employeeCode)) return { ...line, nightSession: false, nightStart: '', nightEnd: '', nightNote: '' };
          return line;
        });
        picked.forEach((code) => {
          if (next.some((line) => line.employeeCode === code)) return;
          const row = offshoreCrew.find((item) => item.employeeCode === code);
          next.push(emptyLine({ employeeCode: code, employeeName: row?.employeeName || code, location: row?.site || location, operationalStatus: row ? 'Mobilized Offshore' : 'Active on Crew', nightSession: true, nightStart: start, nightEnd: end, nightNote: note }));
        });
        added.forEach((person) => {
          if (!picked.includes(person.code) || person.onLeave || next.some((line) => line.employeeCode === person.code)) return;
          next.push(emptyLine({ employeeCode: person.code, employeeName: person.name, location: person.location || location, workCenter: workCenter, operationalStatus: 'Active on Crew', nightSession: true, nightStart: start, nightEnd: end, nightNote: note }));
        });
        return next;
      });
      setDirty(true);
      setModal(null);
    }} />}
  </>;
}

function Combo({ label, placeholder, selected, onSelect, search, labelOf }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(false);
  const anchorRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handle = setTimeout(() => {
      setPending(true);
      search(query).then((rows) => setItems(rows)).catch(() => setItems([])).finally(() => setPending(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);
  return <Field label={label}><div className={open ? 'combo open' : 'combo'} ref={anchorRef}><input value={open ? query : (selected ? labelOf(selected) : '')} placeholder={placeholder} onFocus={() => { setOpen(true); setQuery(''); }} onBlur={() => setTimeout(() => setOpen(false), 180)} onChange={(event) => setQuery(event.target.value)} />{selected && !open && <button type="button" className="link" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(null)}>Clear</button>}<AnchoredMenu open={open} anchorRef={anchorRef}>{pending && <span>Searching…</span>}{!pending && !items.length && <span>No matches</span>}{items.map((item) => <button type="button" key={item.code || item.name} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(item); setOpen(false); }}><b>{labelOf(item)}</b>{item.title || item.department ? <small>{[item.title, item.department].filter(Boolean).join(' · ')}</small> : null}</button>)}</AnchoredMenu></div></Field>;
}

function SearchModal({ title, kind, onClose, onPick }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/timesheet-management/entry?mode=search&kind=${kind}&q=${encodeURIComponent(query)}`).then((response) => response.json()).then((body) => setItems(body.data || []));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, kind]);
  return <Modal title={title} onClose={onClose} footer={<Button kind="secondary" onClick={onClose}>Close</Button>}><Field label="Search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code, name, client" /></Field><div className="pickerList">{items.map((item) => <button key={item.code} type="button" onClick={() => onPick(item)}><b>{item.code}</b><span>{item.name}{item.client ? ` · ${item.client}` : ''}</span></button>)}{!items.length && <span>No matches</span>}</div></Modal>;
}

function ExceptionModal({ onClose, onAdd }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [employee, setEmployee] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/timesheet-management/entry?mode=search&kind=employee&q=', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (!cancelled) setItems(body.data || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);
  const needle = query.trim().toLowerCase();
  const visible = needle ? items.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(needle)) : items;
  return <Modal title="Add employee for this date" onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { if (!employee) return; onAdd(employee); }}>Add</Button></>}><p>Active C-code employees from the directory can be added directly. This does not change the employee’s home supervisor.</p><Field label="Search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="C-code or name" /></Field><div className="pickerList">{visible.map((item) => <button key={item.code} type="button" className={employee?.code === item.code ? 'on' : ''} onClick={() => setEmployee(item)}><b>{item.code}</b><span>{item.name}</span></button>)}{!visible.length && <span>No active C-code employees match.</span>}</div><Field label="Selected"><input readOnly value={employee ? `${employee.code} · ${employee.name}` : ''} /></Field></Modal>;
}

function NightModal({ employees, workDate, location, workCenter, nightStart, allowance, onClose, onApply }) {
  const eligible = employees.filter((line) => line.operationalStatus !== 'Approved Leave');
  const [roster, setRoster] = useState(() => eligible.map((line) => ({ code: line.employeeCode, name: line.employeeName, location: line.location || location || '', workCenter: line.workCenter || workCenter || '', onLeave: false, added: false })));
  const [picked, setPicked] = useState(() => eligible.filter((line) => line.nightSession).map((line) => line.employeeCode));
  const [directory, setDirectory] = useState([]);
  const [query, setQuery] = useState('');
  const [start, setStart] = useState(nightStart || '18:00');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ mode: 'search', kind: 'employee', q: '', workDate: workDate || '' });
    fetch(`/api/timesheet-management/entry?${params}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (!cancelled) setDirectory(body.data || []); })
      .catch(() => { if (!cancelled) setDirectory([]); });
    return () => { cancelled = true; };
  }, [workDate]);
  const needle = query.trim().toLowerCase();
  const rosterCodes = new Set(roster.map((person) => person.code));
  const matches = needle
    ? directory.filter((item) => !item.onLeave && !rosterCodes.has(item.code) && `${item.code} ${item.name}`.toLowerCase().includes(needle))
    : [];
  const toggle = (code) => setPicked((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  const addPerson = (item) => {
    if (!item?.code || item.onLeave || rosterCodes.has(item.code)) return;
    setRoster((current) => [...current, { code: item.code, name: item.name, location: item.location || location || '', workCenter: workCenter || '', onLeave: false, added: true }]);
    setPicked((current) => current.includes(item.code) ? current : [...current, item.code]);
    setQuery('');
  };
  const removePerson = (person) => {
    setPicked((current) => current.filter((code) => code !== person.code));
    if (person.added) setRoster((current) => current.filter((item) => item.code !== person.code));
  };
  return <Modal wide title="Book night work" onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onApply({ picked, added: roster.filter((person) => person.added), start, end, note })}>Apply</Button></>}><div className="formGrid"><Field label="Note"><input value={note} onChange={(event) => setNote(event.target.value)} /></Field><Field label="Start"><input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label="Expected end"><input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></Field></div><div className="infoBox">Night work from {nightStart}. The allowance is ₦{Number(allowance).toLocaleString()} per eligible session, not per hour. Tick a person to book the session and remove them to take it off. Someone on approved leave cannot be booked.</div><Field label="Add employee"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an active C-code to add" /></Field>{needle && <div className="pickerList">{matches.slice(0, 12).map((item) => <button key={item.code} type="button" onClick={() => addPerson(item)}><b>{item.code}</b><span>{item.name}</span></button>)}{!matches.length && <span>No active C-code employees match, or they are already listed or on leave.</span>}</div>}<div className="nightList">{roster.map((person) => <div className="nightRow" key={person.code}><label><input type="checkbox" checked={picked.includes(person.code)} onChange={() => toggle(person.code)} /> {person.code} · {person.name}{person.added ? ' · added' : ''}</label><button type="button" className="link" onClick={() => removePerson(person)}>Remove</button></div>)}{!roster.length && <span>No employees can be booked for night work on this date.</span>}</div></Modal>;
}

function BulkModal({ title, columns, employees, onClose, onApply }) {
  const [projectCode, setProjectCode] = useState(columns[0]?.code || '');
  const [picked, setPicked] = useState([]);
  const [hours, setHours] = useState(2);
  const [reason, setReason] = useState('');
  return <Modal wide title={title} onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onApply(projectCode, picked, Number(hours) || 0, reason)}>Apply</Button></>}><div className="formGrid"><Field label="Project"><select value={projectCode} onChange={(event) => setProjectCode(event.target.value)}>{columns.map((column) => <option key={column.code}>{column.code}</option>)}</select></Field><Field label="OVT hours"><input value={hours} onChange={(event) => setHours(event.target.value)} /></Field><Field label="Reason"><input value={reason} onChange={(event) => setReason(event.target.value)} /></Field></div><div className="pickerList">{employees.map((employee) => <label key={employee.employeeCode}><input type="checkbox" checked={picked.includes(employee.employeeCode)} onChange={() => setPicked((current) => current.includes(employee.employeeCode) ? current.filter((code) => code !== employee.employeeCode) : [...current, employee.employeeCode])} /> {employee.employeeCode} · {employee.employeeName}</label>)}</div></Modal>;
}

function SheetList({ sheets, onOpen }) {
  return <div className="panel"><Table headers={['Reference', 'Work date', 'Supervisor', 'Location', 'Crew', 'Version', 'Status', 'Last saved']} rows={sheets.map((sheet) => [sheet.reference, formatDisplayDate(sheet.workDate), sheet.supervisor, sheet.location || '—', sheet.crew, sheet.version, <button className="link" onClick={() => onOpen(sheet)}>{sheet.status}</button>, sheet.updatedAt ? new Date(sheet.updatedAt).toLocaleString() : '—'])} empty="No timesheets in this list." /></div>;
}
