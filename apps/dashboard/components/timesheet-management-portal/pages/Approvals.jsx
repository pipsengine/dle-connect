'use client';
import React, { useEffect, useState } from 'react';
import { Badge, Button, Field, Modal, SearchCombo, Tabs, personDetail, personLabel } from '../components/UI';
import { formatDisplayDate, usePortalData } from '../portal-data';

const TABS = ['Supervisor', 'Cost Control', 'Project Manager', 'Consolidation', 'HR', 'Payroll Readiness'];
const weekday = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { weekday: 'short' });
};
const toneFor = (status) => status === 'Approved' || status === 'Payroll Ready' ? 'green' : status === 'Returned' ? 'amber' : status === 'Overdue' ? 'red' : 'blue';

const lookup = (kind, query) => fetch(`/api/timesheet-management/entry?mode=search&kind=${kind}&q=${encodeURIComponent(query)}`, { cache: 'no-store' }).then((response) => response.json()).then((body) => body.data || []);

export default function Approvals() {
  const { snapshot } = usePortalData();
  const [tab, setTab] = useState('Supervisor');
  const [draft, setDraft] = useState({ periodId: '', supervisor: '', location: '', status: '', q: '', workDate: '', project: '' });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [queue, setQueue] = useState({ rows: [], total: 0, kpis: {}, returnReasons: [] });
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async (next = filters, nextPage = page) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ stage: tab, page: String(nextPage), pageSize: String(pageSize), periodId: next.periodId, supervisor: next.supervisor, location: next.location, status: next.status, q: next.q, workDate: next.workDate, project: next.project });
    try {
      const response = await fetch(`/api/timesheet-management/approvals?${params}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.status === 'error') throw new Error(body.error || 'Unable to load approvals.');
      setQueue(body.data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(filters, page); }, [tab, page, pageSize]);

  const apply = (next) => { setFilters(next); setDraft(next); setPage(1); setSelected([]); load(next, 1); };
  const rows = queue.rows || [];
  const kpis = queue.kpis || {};
  const allOn = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const picked = rows.filter((row) => selected.includes(row.id));
  const pages = Math.max(1, Math.ceil((queue.total || 0) / pageSize));
  const period = snapshot.periods.find((item) => item.id === filters.periodId);

  const act = async (action, reason, comment) => {
    const response = await fetch('/api/timesheet-management/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected, action, reason, comment }) });
    const body = await response.json();
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'Approval failed.');
    setNotice(action === 'approve' ? `${body.data.updated} item${body.data.updated === 1 ? '' : 's'} approved. The next stage was opened where required. Hours were not changed.` : `${body.data.updated} item${body.data.updated === 1 ? '' : 's'} returned for correction.`);
    setSelected([]);
    setConfirm(null);
    setDetail(null);
    await load();
  };

  return <>
    <div className="pageTitle"><div><span className="eyebrow">TIMESHEET MANAGEMENT</span><h1>Approvals</h1><p>Approval items are created when a reviewed timesheet is submitted. The queue stays empty until that happens.</p></div></div>
    {error && <div className="success" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
    {notice && <div className="success">{notice} <button onClick={() => setNotice('')}>×</button></div>}
    <Tabs items={TABS} active={tab} setActive={(next) => { setTab(next); setPage(1); setSelected([]); }} />
    <section className="approvalStats">
      {[['pending', 'Pending Approval', 'Awaiting your action', 'blue'], ['approved', 'Approved', 'This stage', 'green'], ['returned', 'Returned', 'Needs correction', 'orange'], ['overdue', 'Overdue', `Past ${queue.slaDays || 3} day SLA`, 'red'], ['total', 'Total Records', 'This stage', 'slate']].map(([key, label, sub, tone]) => <button key={key} className={`approvalStat ${tone} ${filters.status === (key === 'pending' ? 'Pending' : key === 'total' ? '' : key[0].toUpperCase() + key.slice(1)) ? 'on' : ''}`} onClick={() => apply({ ...filters, status: key === 'total' ? '' : key === 'pending' ? 'Pending' : key[0].toUpperCase() + key.slice(1) })}><b>{kpis[key] || 0}</b><strong>{label}</strong><span>{sub}</span></button>)}
    </section>
    <section className="panel approvalFiltersPanel"><div className="approvalFilterGrid">
      <Field label="Timesheet Period"><select value={draft.periodId} onChange={(event) => setDraft({ ...draft, periodId: event.target.value })}><option value="">All periods</option>{snapshot.periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <SearchCombo label="Supervisor" placeholder="All supervisors" value={draft.supervisor} onSelect={(item) => setDraft({ ...draft, supervisor: item ? `${item.code} - ${item.name}` : '' })} search={(q) => lookup('supervisor', q)} labelOf={personLabel} detailOf={personDetail} />
      <SearchCombo label="Location / Site" placeholder="All locations" value={draft.location} onSelect={(item) => setDraft({ ...draft, location: item?.name || '' })} search={(q) => lookup('location', q)} labelOf={(item) => item.name} />
      <Field label="Status"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">All Statuses</option>{['Pending', 'Approved', 'Returned', 'Overdue', 'Payroll Ready'].map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Search"><input value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Reference, employee, project..." /></Field>
      <Field label="Work Date"><input type="date" value={draft.workDate} onChange={(event) => setDraft({ ...draft, workDate: event.target.value })} /></Field>
      <SearchCombo label="Project" placeholder="All projects" value={draft.project} onSelect={(item) => setDraft({ ...draft, project: item?.code || '' })} search={(q) => lookup('project', q)} labelOf={(item) => `${item.code} — ${item.name}`} />
      <div className="approvalFilterActions"><Button kind="secondary" onClick={() => apply({ periodId: '', supervisor: '', location: '', status: '', q: '', workDate: '', project: '' })}>Reset Filters</Button><Button onClick={() => apply(draft)}>Search</Button></div>
    </div>{period && <p className="muted">{formatDisplayDate(period.startDate)} – {formatDisplayDate(period.endDate)} ({period.status})</p>}</section>
    <section className="panel approvalQueue">
      <div className="approvalQueueHead"><div><h3>Approval Queue</h3><p>{tab} items. Approving does not change booked hours, attendance or project allocation.</p></div><div className="approvalBulk"><Button kind="secondary" disabled={!picked.length} onClick={() => setConfirm('approve')}>Approve ({picked.length})</Button><Button kind="secondary" disabled={!picked.length} onClick={() => setConfirm('return')}>Return ({picked.length})</Button><Button kind="secondary" disabled={picked.length !== 1} onClick={() => openDetail(picked[0].id)}>View Details</Button></div></div>
      <div className="tableWrap"><table><thead><tr><th><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? [] : rows.map((row) => row.id))} /></th><th>Reference</th><th>Employee</th><th>Work Date</th><th>Project</th><th>Value</th><th>Reason</th><th>Current Stage</th><th>Location</th><th>Status</th><th>Days</th><th /></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}><td><input type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td><td><button className="link" onClick={() => openDetail(row.id)}>{row.reference}</button><small className="block">v{row.version}</small></td><td className="wrapCell"><b>{row.kind === 'Mobilization' ? `Multiple (${row.employees})` : `${row.employees} employee${row.employees === 1 ? '' : 's'}`}</b><small className="block">{row.supervisor || (row.kind === 'Mobilization' ? 'Mobilization' : 'Timesheet')}</small></td><td><b>{formatDisplayDate(row.workDate)}</b><small className="block">{weekday(row.workDate)}</small></td><td><b>{row.projectCode || 'Multiple'}</b><small className="block">{row.projectName || row.summary}</small></td><td><b>{row.kind === 'Mobilization' ? '—' : `${row.regular}h`}</b></td><td>{row.summary || '—'}</td><td>{row.stage}</td><td>{row.location || '—'}</td><td><Badge tone={toneFor(row.status)}>{row.status}</Badge></td><td className={row.age >= (queue.slaDays || 3) ? 'dangerText' : ''}>{row.storedStatus === 'Pending' ? row.age : '—'}</td><td><button className="link" onClick={() => openDetail(row.id)}>View</button></td></tr>)}
        {!loading && !rows.length && <tr><td colSpan={12}><div className="emptyState"><b>No {tab} approvals {filters.status ? filters.status.toLowerCase() : 'pending'}</b><span>New timesheets appear here after Timesheet Review and submission.</span></div></td></tr>}
      </tbody></table></div>
      <div className="approvalPager"><span>Showing {queue.total ? (page - 1) * pageSize + 1 : 0} to {Math.min(queue.total || 0, page * pageSize)} of {queue.total || 0} records</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select></div></div>
    </section>
    {detail && <Detail item={detail} onClose={() => setDetail(null)} onAct={(action) => { setSelected([detail.item.id]); setConfirm(action); }} />}
    {confirm && <ActionDialog action={confirm} items={picked.length ? picked : detail ? [detail.item] : []} reasons={queue.returnReasons || []} onClose={() => setConfirm(null)} onConfirm={act} />}
  </>;

  async function openDetail(id) {
    const response = await fetch(`/api/timesheet-management/approvals?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.status === 'error') { setError(body.error || 'Unable to open the item.'); return; }
    setDetail(body.data);
  }
}

function Detail({ item, onClose, onAct }) {
  const [section, setSection] = useState('Summary');
  const record = item.item;
  const sheet = item.sheet || {};
  const sections = record.kind === 'Mobilization' ? ['Summary', 'Employees', 'Approval History'] : ['Summary', 'Employees', 'Projects', 'Attendance', 'OVT', 'Night Work', 'Offshore', 'Exceptions', 'Approval History'];
  return <div className="overlay" onClick={onClose}><aside className="approvalDrawer" onClick={(event) => event.stopPropagation()}>
    <div className="modalHead"><div><span className="eyebrow">{record.stage}</span><h3>{record.reference}</h3><p>{record.kind === 'Mobilization' ? 'Mobilization acknowledgement does not create hours.' : `${sheet.dayKind || 'Unclassified'}${sheet.holidayName ? ` · ${sheet.holidayName}` : ''} · v${record.version}`}</p></div><button onClick={onClose}>×</button></div>
    <div className="tabs">{sections.map((name) => <button key={name} className={section === name ? 'active' : ''} onClick={() => setSection(name)}>{name}</button>)}</div>
    <div className="modalBody">
      {section === 'Summary' && <div className="confirmSummary"><p>Period: {sheet.periodId || record.periodId || '—'}</p><p>Work date: {formatDisplayDate(record.workDate)}</p><p>Captured by: {sheet.capturedBy || '—'}</p><p>Supervisor: {record.supervisor || '—'}</p><p>Location: {record.location || '—'}</p><p>Work centre: {record.workCenter || sheet.workCenter || '—'}</p><p>Stage: {record.status === 'Pending' ? record.stage : record.status}</p><p>REG {record.regular}h · OVT {record.ovt}h · Night sessions {record.nights} · Employees {record.employees}</p>{item.projectProgress?.total > 0 && <p>{item.projectProgress.approved} of {item.projectProgress.total} projects approved</p>}</div>}
      {section === 'Employees' && <div className="tableWrap"><table><thead><tr><th>Employee</th><th>Attendance</th><th>REG</th><th>OVT</th><th>Night</th><th>Projects</th><th>Exception</th></tr></thead><tbody>{(item.employees || []).map((employee) => <tr key={employee.code}><td><b>{employee.name}</b><small className="block">{employee.code}</small></td><td>{employee.attendance || employee.status || '—'}</td><td>{employee.regular ?? '—'}</td><td>{employee.ovt ?? '—'}</td><td>{employee.night ? 'Yes' : employee.night === false ? 'No' : '—'}</td><td>{(employee.projects || []).join(', ') || employee.exception || '—'}</td><td>{employee.exception || '—'}</td></tr>)}</tbody></table></div>}
      {section === 'Projects' && <div className="tableWrap"><table><thead><tr><th>Project</th><th>Employees</th><th>REG</th><th>OVT</th><th>Approval</th></tr></thead><tbody>{(item.projects || []).map((project) => <tr key={project.code}><td><b>{project.code}</b><small className="block">{project.name}</small></td><td>{project.employees}</td><td>{project.regular}</td><td>{project.ovt}</td><td>{project.approval || '—'}</td></tr>)}{!(item.projects || []).length && <tr><td colSpan={5}>No project hours on this item.</td></tr>}</tbody></table></div>}
      {section === 'Attendance' && <p>Attendance status is shown on each employee. This approval does not rewrite clocking or biometric evidence.</p>}
      {section === 'OVT' && <p>Overtime stays on the employee, date and project. Weekday, Saturday, Sunday and public-holiday overtime follow the frozen Nigeria calendar classification{sheet.dayKind ? ` (${sheet.dayKind}${sheet.holidayName ? `, ${sheet.holidayName}` : ''})` : ''}. A late clock-out is not approved overtime by itself.</p>}
      {section === 'Night Work' && <p>{record.nights} night session{record.nights === 1 ? '' : 's'}. The allowance is ₦{Number(item.settings?.nightAllowance || 1500).toLocaleString()} for an eligible session, not an hourly rate.</p>}
      {section === 'Offshore' && <p>{record.kind === 'Mobilization' ? `${record.reference} · ${record.projectCode || ''} · ${record.location}. ${record.employees} employees. Mobilization is authority to be offshore, not proof that hours were worked.` : 'Offshore employees on this timesheet keep their home crew. Hours on this booking are the only worked time.'}</p>}
      {section === 'Exceptions' && <p>{record.exceptions ? `${record.exceptions} exception${record.exceptions === 1 ? '' : 's'} block approval of the whole timesheet. Return it for correction.` : 'No blocking exceptions on this item.'}</p>}
      {section === 'Approval History' && <div className="tableWrap"><table><thead><tr><th>When</th><th>Action</th><th>By</th><th>Reason</th></tr></thead><tbody>{(item.history || []).map((row) => <tr key={row.id}><td>{row.at ? new Date(row.at).toLocaleString() : '—'}</td><td>{row.action}</td><td>{row.actor}{row.role ? ` · ${row.role}` : ''}</td><td>{row.reason || row.comment || '—'}</td></tr>)}{!(item.history || []).length && <tr><td colSpan={4}>No approval events yet.</td></tr>}</tbody></table></div>}
    </div>
    {record.storedStatus === 'Pending' && <div className="modalFoot"><Button kind="secondary" onClick={() => onAct('return')}>Return for correction</Button><Button onClick={() => onAct('approve')}>Approve</Button></div>}
  </aside></div>;
}

function ActionDialog({ action, items, reasons, onClose, onConfirm }) {
  const [reason, setReason] = useState(reasons[0] || '');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const regular = items.reduce((sum, item) => sum + Number(item.regular || 0), 0);
  const ovt = items.reduce((sum, item) => sum + Number(item.ovt || 0), 0);
  const nights = items.reduce((sum, item) => sum + Number(item.nights || 0), 0);
  const employees = items.reduce((sum, item) => sum + Number(item.employees || 0), 0);
  const exceptions = items.reduce((sum, item) => sum + Number(item.exceptions || 0), 0);
  return <Modal title={action === 'approve' ? `Approve ${items.length} item${items.length === 1 ? '' : 's'}?` : `Return ${items.length} item${items.length === 1 ? '' : 's'}`} onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={async () => { setSaving(true); setError(''); try { await onConfirm(action, reason, comment); } catch (saveError) { setError(saveError.message); } finally { setSaving(false); } }}>{saving ? 'Saving…' : action === 'approve' ? 'Confirm approval' : 'Confirm return'}</Button></>}>
    {error && <div className="validationError">{error}</div>}
    <div className="confirmSummary"><p>Employees: {employees}</p><p>REG hours: {regular}h</p><p>OVT: {ovt}h</p><p>Night sessions: {nights}</p><p>Exceptions: {exceptions}</p></div>
    {action === 'approve' && <p>Approval moves the item to the next stage. It does not change hours, attendance or project lines.</p>}
    {action === 'return' && <div className="formGrid"><Field label="Return reason"><select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Comment"><textarea value={comment} onChange={(event) => setComment(event.target.value)} /></Field></div>}
    {action === 'return' && <p>The timesheet goes back to Timesheet Review as Returned. The submitted version stays in history. Correction creates the next version.</p>}
  </Modal>;
}
