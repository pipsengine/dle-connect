'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Stage = 'Active' | 'Supervisor Evaluation' | 'HOD Approval' | 'HR Review' | 'Confirmed' | 'Extended' | 'Termination Review' | 'Overdue';
type Rating = 'Unsatisfactory' | 'Average' | 'Above Average' | 'Not Applicable' | 'Not Observed' | '';
type Recommendation = 'Confirm Employment' | 'Extend Probation' | 'Recommend Termination' | '';
type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  initials: string;
  jobTitle: string;
  department: string;
  supervisor: string;
  hod: string;
  appointmentDate: string;
  probationStart: string;
  evaluationTrigger: string;
  probationEnd: string;
  daysRemaining: number;
  stage: string;
  recommendation: Recommendation | string;
  progress: number;
  cycleNo: number;
};
type Settings = {
  probationMonths: number;
  triggerMonth: number;
  extensionMonths: number;
  supervisorSlaDays: number;
  reminderDay: number;
  escalationDay: number;
  autoInitiate: boolean;
  skipDuplicateHod: boolean;
};
type EventRow = { id: string; caseId: string; action: string; fromStage: string; toStage: string; actor: string; comment: string; at: string };
type Tab = 'Dashboard' | 'Probation Employees' | 'Workflow & Approvals' | 'History' | 'Settings';

const tabs: Tab[] = ['Dashboard', 'Probation Employees', 'Workflow & Approvals', 'History', 'Settings'];
const labels = ['Quality of Work', 'Ability to be Trained', 'Attitude toward Job', 'Professional Appearance', 'Attendance', 'Punctuality', 'Relations with Others'];
const ratings: Rating[] = ['Unsatisfactory', 'Average', 'Above Average', 'Not Applicable', 'Not Observed'];
const recommendations: Recommendation[] = ['Confirm Employment', 'Extend Probation', 'Recommend Termination'];
const fmt = (value: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const statusClass = (stage: string) => stage.toLowerCase().replaceAll(' ', '-');

export default function ProbationSetupClient() {
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All Statuses');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [decision, setDecision] = useState<Employee | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const response = await fetch('/api/hris/onboarding/probation-setup', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'Unable to load probation records.');
    setEmployees(body.data.employees || []);
    setEvents(body.data.events || []);
    setSettings(body.data.settings);
  };

  useEffect(() => {
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load probation records.')).finally(() => setLoading(false));
  }, []);

  const save = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/hris/onboarding/probation-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'Save failed.');
    setEmployees(body.data.employees || []);
    setEvents(body.data.events || []);
    setSettings(body.data.settings);
  };

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };

  const visible = useMemo(() => employees.filter((employee) => `${employee.name} ${employee.employeeCode} ${employee.department}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All Statuses' || employee.stage === status)), [employees, query, status]);
  const count = (stage: string) => employees.filter((employee) => employee.stage === stage).length;
  const waiting = employees.filter((employee) => ['Supervisor Evaluation', 'HOD Approval', 'HR Review', 'Overdue'].includes(employee.stage));
  const active = employees.filter((employee) => !['Confirmed', 'Termination Review'].includes(employee.stage));

  return <div className="pm-page">
    {toast && <div className="pm-toast">✓ {toast}</div>}
    {error && <div className="pm-error">{error}</div>}
    <div className="pm-top"><div><div className="pm-breadcrumb">HRIS <span>/</span> Onboarding <span>/</span> Probation Setup</div><h1>Probation Management</h1><p>Six-month probation records read from the HRIS employee directory. No sample employees are loaded.</p></div><div className="pm-top-actions"><button className="pm-btn primary" onClick={() => setTab('Probation Employees')}>View Employees</button></div></div>
    <div className="pm-rule-banner"><div className="pm-rule-icon">⟳</div><div><b>Automated Probation Rule</b><p>{settings ? `${settings.probationMonths}-month probation · Evaluation auto-generated at end of Month ${settings.triggerMonth} · Supervisor/Line Manager → HOD → HR` : 'Loading rules…'}</p></div><span className="pm-live">● HRIS</span></div>
    <div className="pm-tabs">{tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Workflow & Approvals' && waiting.length > 0 && <em>{waiting.length}</em>}</button>)}</div>
    {loading && <section className="pm-card"><p>Loading probation records from HRIS…</p></section>}
    {!loading && tab === 'Dashboard' && <Dashboard employees={employees} active={active.length} due={count('Supervisor Evaluation')} supervisor={count('Supervisor Evaluation')} hod={count('HOD Approval')} hr={count('HR Review')} overdue={employees.filter((employee) => employee.daysRemaining < 0 && employee.stage !== 'Confirmed').length} onEvaluate={setSelected} onTab={setTab} />}
    {!loading && tab === 'Probation Employees' && <Employees employees={visible} query={query} setQuery={setQuery} status={status} setStatus={setStatus} onEvaluate={setSelected} />}
    {!loading && tab === 'Workflow & Approvals' && <Workflow employees={waiting} skipDuplicate={Boolean(settings?.skipDuplicateHod)} onEvaluate={setSelected} onDecision={setDecision} onRemind={async (employee) => { await save({ action: 'advance', caseId: employee.id, decision: 'remind', comment: 'Reminder recorded from Probation Setup.' }); flash(`Reminder recorded for ${employee.name}`); }} />}
    {!loading && tab === 'History' && <History employees={employees} events={events} />}
    {!loading && tab === 'Settings' && settings && <SettingsSummary settings={settings} onEdit={() => setSettingsOpen(true)} />}
    {selected && <EvaluationModal employee={selected} onClose={() => setSelected(null)} onSubmit={async (evaluation, recommendation) => { await save({ action: 'submit-evaluation', caseId: selected.id, evaluation, recommendation }); flash('Evaluation submitted and saved to HRIS.'); setSelected(null); }} />}
    {decision && <DecisionModal employee={decision} onClose={() => setDecision(null)} onSave={async (choice, comment) => { await save({ action: 'advance', caseId: decision.id, decision: choice, comment }); flash('Probation decision saved to HRIS.'); setDecision(null); }} />}
    {settingsOpen && settings && <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} onSave={async (next) => { await save({ action: 'save-settings', settings: next }); flash('Probation settings saved.'); setSettingsOpen(false); }} />}
  </div>;
}

function Dashboard({ employees, active, due, supervisor, hod, hr, overdue, onEvaluate, onTab }: { employees: Employee[]; active: number; due: number; supervisor: number; hod: number; hr: number; overdue: number; onEvaluate: (employee: Employee) => void; onTab: (tab: Tab) => void }) {
  const kpis: Array<[string, number, string, string]> = [['On Probation', active, 'Currently active', 'users'], ['Evaluation Due', due, 'Supervisor action', 'clock'], ['Awaiting Supervisor', supervisor, 'Action required', 'clipboard'], ['Awaiting HOD', hod, 'Pending approval', 'branch'], ['Awaiting HR', hr, 'Final review', 'shield'], ['Overdue', overdue, 'Requires attention', 'alert']];
  const attention = employees.filter((employee) => ['Active', 'Overdue', 'Supervisor Evaluation', 'HOD Approval', 'HR Review'].includes(employee.stage)).slice(0, 5);
  const total = Math.max(employees.length, 1);
  const pipeline: Array<[string, number]> = [['Supervisor Evaluation', supervisor], ['HOD Approval', hod], ['HR Final Review', hr], ['Completed', employees.filter((employee) => employee.stage === 'Confirmed').length]];
  return <>
    <div className="pm-kpis">{kpis.map(([name, value, subtitle, icon]) => <div className="pm-kpi" key={name}><div><span>{name}</span><strong>{value}</strong><small>{subtitle}</small></div><div className={`pm-kpi-icon ${icon}`}>{icon === 'alert' ? '!' : icon === 'clock' ? '◷' : icon === 'shield' ? '◇' : icon === 'branch' ? '⌘' : icon === 'clipboard' ? '▤' : '♙'}</div></div>)}</div>
    <div className="pm-grid-main"><section className="pm-card"><div className="pm-card-head"><div><h2>Probation Requiring Attention</h2><p>Employees approaching completion or awaiting workflow action.</p></div><button className="pm-link" onClick={() => onTab('Probation Employees')}>View all →</button></div><EmployeeTable employees={attention} onEvaluate={onEvaluate} /></section><aside className="pm-card"><div className="pm-card-head"><div><h2>Workflow Overview</h2><p>Current evaluation pipeline</p></div></div><div className="pm-pipeline">{pipeline.map(([name, value]) => <div key={name}><div><span>{name}</span><b>{value}</b></div><i><u style={{ width: `${Math.round((value / total) * 100)}%` }} /></i></div>)}</div><div className="pm-divider" /><h3 className="pm-mini-title">Upcoming evaluation triggers</h3>{employees.filter((employee) => employee.stage === 'Active').slice(0, 3).map((employee) => <div className="pm-upcoming" key={employee.id}><div className="pm-avatar">{employee.initials}</div><div><b>{employee.name}</b><small>{employee.department}</small></div><span>{fmt(employee.evaluationTrigger)}</span></div>)}{!employees.some((employee) => employee.stage === 'Active') && <p>No upcoming triggers.</p>}</aside></div>
    <section className="pm-card pm-timeline-card"><div className="pm-card-head"><div><h2>How the automated lifecycle works</h2><p>Records are created from HRIS employment probation dates. No sample data is added.</p></div></div><div className="pm-lifecycle">{[['01', 'Employee on probation', 'HRIS employment dates create the record'], ['02', 'End of Month 5', 'Evaluation becomes due automatically'], ['03', 'Supervisor / Line Manager', 'Completes evaluation within the SLA'], ['04', 'HOD', 'Reviews and approves or returns'], ['05', 'HR', 'Final review and outcome processing'], ['06', 'Outcome', 'Confirm · Extend · Termination review']].map(([number, title, copy], index) => <React.Fragment key={number}><div><b>{number}</b><strong>{title}</strong><small>{copy}</small></div>{index < 5 && <span>→</span>}</React.Fragment>)}</div></section>
  </>;
}

function Employees({ employees, query, setQuery, status, setStatus, onEvaluate }: { employees: Employee[]; query: string; setQuery: (value: string) => void; status: string; setStatus: (value: string) => void; onEvaluate: (employee: Employee) => void }) {
  return <section className="pm-card"><div className="pm-card-head"><div><h2>Probation Employees</h2><p>Probation records stored in HRIS.</p></div><span className="pm-count">{employees.length} records</span></div><div className="pm-toolbar"><div className="pm-search">⌕ <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, code or department…" /></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All Statuses</option>{['Active', 'Supervisor Evaluation', 'HOD Approval', 'HR Review', 'Extended', 'Confirmed', 'Termination Review', 'Overdue'].map((item) => <option key={item}>{item}</option>)}</select></div><EmployeeTable employees={employees} onEvaluate={onEvaluate} expanded /></section>;
}

function EmployeeTable({ employees, onEvaluate, expanded = false }: { employees: Employee[]; onEvaluate: (employee: Employee) => void; expanded?: boolean }) {
  return <div className="pm-table-wrap"><table className="pm-table"><thead><tr><th>Employee</th><th>Department</th><th>Supervisor</th>{expanded && <th>Probation Period</th>}<th>Probation End</th><th>Days Left</th><th>Status</th><th>Action</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td><div className="pm-person"><div className="pm-avatar">{employee.initials}</div><div><b>{employee.name}</b><small>{employee.employeeCode} · {employee.jobTitle || '—'}</small></div></div></td><td>{employee.department || '—'}</td><td>{employee.supervisor || '—'}</td>{expanded && <td><div className="pm-progress"><span><i style={{ width: `${employee.progress}%` }} /></span><small>{fmt(employee.probationStart)} → {fmt(employee.probationEnd)}</small></div></td>}<td>{fmt(employee.probationEnd)}</td><td><b className={employee.daysRemaining < 0 ? 'danger' : employee.daysRemaining <= 14 ? 'warn' : ''}>{employee.daysRemaining < 0 ? `${Math.abs(employee.daysRemaining)} overdue` : employee.daysRemaining}</b></td><td><span className={`pm-status ${statusClass(employee.stage)}`}>{employee.stage}</span></td><td><button className="pm-row-action" onClick={() => onEvaluate(employee)}>{employee.stage === 'Active' ? 'Open' : 'Review'} →</button></td></tr>)}{!employees.length && <tr><td colSpan={expanded ? 8 : 7}>No employees on probation were found in HRIS.</td></tr>}</tbody></table></div>;
}

function Workflow({ employees, skipDuplicate, onEvaluate, onDecision, onRemind }: { employees: Employee[]; skipDuplicate: boolean; onEvaluate: (employee: Employee) => void; onDecision: (employee: Employee) => void; onRemind: (employee: Employee) => Promise<void> }) {
  return <div className="pm-workflow-layout"><section className="pm-card"><div className="pm-card-head"><div><h2>Workflow & Approvals</h2><p>Items currently requiring approval or intervention.</p></div></div>{employees.map((employee) => <div className="pm-approval-item" key={employee.id}><div className="pm-avatar lg">{employee.initials}</div><div className="grow"><div className="pm-approval-title"><h3>{employee.name}</h3><span className={`pm-status ${statusClass(employee.stage)}`}>{employee.stage}</span></div><p>{employee.employeeCode} · {employee.jobTitle || '—'} · {employee.department || '—'}</p><div className="pm-approval-meta"><span><small>Supervisor</small><b>{employee.supervisor || '—'}</b></span><span><small>HOD</small><b>{employee.hod || '—'}</b></span><span><small>Recommendation</small><b>{employee.recommendation || 'Pending'}</b></span></div></div><div className="pm-stack-actions"><button className="pm-btn primary" onClick={() => onEvaluate(employee)}>Review Evaluation</button><button className="pm-btn secondary" onClick={() => onDecision(employee)}>Decision</button><button className="pm-btn ghost" onClick={() => { onRemind(employee).catch(() => undefined); }}>Send Reminder</button></div></div>)}{!employees.length && <p>No evaluations are waiting.</p>}</section><aside className="pm-card"><div className="pm-card-head"><div><h2>Approval Rules</h2><p>Current routing configuration</p></div></div><div className="pm-route-vertical"><div className="done"><b>1</b><span><strong>Supervisor / Line Manager</strong><small>Evaluate and recommend</small></span></div><i /><div><b>2</b><span><strong>Head of Department</strong><small>Approve or return</small></span></div><i /><div><b>3</b><span><strong>Human Resources</strong><small>Final review and processing</small></span></div></div><div className="pm-note"><b>Smart routing</b><br />{skipDuplicate ? 'Where the Supervisor and HOD are the same person, the duplicate HOD stage is skipped.' : 'The HOD stage is always required.'}</div></aside></div>;
}

function History({ employees, events }: { employees: Employee[]; events: EventRow[] }) {
  const cards: Array<[string, number, string]> = [['Confirmed', employees.filter((employee) => employee.stage === 'Confirmed').length, 'Stored in HRIS'], ['Extended', employees.filter((employee) => employee.stage === 'Extended').length, 'Stored in HRIS'], ['Termination Review', employees.filter((employee) => employee.stage === 'Termination Review').length, 'Stored in HRIS'], ['Audit events', events.length, 'Latest 200']];
  return <section className="pm-card"><div className="pm-card-head"><div><h2>Probation History</h2><p>Completed, extended and closed probation cycles with the audit written to HRIS.</p></div></div><div className="pm-history-grid">{cards.map(([label, value, caption]) => <div key={label}><span>{label}</span><b>{value}</b><small>{caption}</small></div>)}</div><div className="pm-table-wrap"><table className="pm-table"><thead><tr><th>When</th><th>Action</th><th>From</th><th>To</th><th>Actor</th><th>Comment</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.at ? new Date(event.at).toLocaleString() : '—'}</td><td>{event.action}</td><td>{event.fromStage || '—'}</td><td>{event.toStage || '—'}</td><td>{event.actor}</td><td>{event.comment || '—'}</td></tr>)}{!events.length && <tr><td colSpan={6}>No probation actions have been recorded.</td></tr>}</tbody></table></div></section>;
}

function SettingsSummary({ settings, onEdit }: { settings: Settings; onEdit: () => void }) {
  return <section className="pm-card pm-settings"><div className="pm-card-head"><div><h2>Probation Settings</h2><p>HR-controlled automation, duration and escalation rules stored in HRIS.</p></div><button className="pm-btn primary" onClick={onEdit}>Edit settings</button></div><div className="pm-settings-section"><h3>Lifecycle Rules</h3><div className="pm-form-grid three"><label>Probation period (months)<input value={settings.probationMonths} readOnly /></label><label>Evaluation trigger (month)<input value={settings.triggerMonth} readOnly /></label><label>Extension period (months)<input value={settings.extensionMonths} readOnly /></label></div></div><div className="pm-settings-section"><h3>Reminder & Escalation</h3><div className="pm-form-grid three"><label>Supervisor SLA (working days)<input value={settings.supervisorSlaDays} readOnly /></label><label>Reminder after (working days)<input value={settings.reminderDay} readOnly /></label><label>Escalate after (working days)<input value={settings.escalationDay} readOnly /></label></div></div><div className="pm-settings-section"><h3>Automation</h3><p>{settings.autoInitiate ? 'Records are created automatically for employees on probation.' : 'Automatic record creation is off.'}</p><p>{settings.skipDuplicateHod ? 'The HOD stage is skipped when the supervisor and HOD are the same person.' : 'The HOD stage is always required.'}</p></div></section>;
}

function EvaluationModal({ employee, onClose, onSubmit }: { employee: Employee; onClose: () => void; onSubmit: (evaluation: unknown, recommendation: string) => Promise<void> }) {
  const [criteria, setCriteria] = useState(labels.map((label, index) => ({ id: `c${index}`, label, rating: '' as Rating, comment: '' })));
  const [overall, setOverall] = useState('');
  const [generalComments, setGeneralComments] = useState('');
  const [developmentAreas, setDevelopmentAreas] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation>('');
  const [discussed, setDiscussed] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const validate = () => {
    for (const item of criteria) {
      if (!item.rating) return `Select a rating for ${item.label}.`;
      if ((item.rating === 'Unsatisfactory' || item.rating === 'Above Average') && !item.comment.trim()) return `A comment is required for ${item.label} because it is marked ${item.rating}.`;
    }
    if (!overall) return 'Select the overall evaluation.';
    if (!recommendation) return 'Select a recommendation.';
    if (!declared) return 'Confirm the supervisor declaration before submission.';
    return '';
  };
  return <div className="pm-modal-backdrop" role="dialog" aria-modal="true"><div className="pm-modal"><div className="pm-modal-head"><div><span className="pm-eyebrow">DL-HRD-F-008 · Digital Workflow</span><h2>Employee Probationary Evaluation</h2><p>Supervisor evaluation · Month 5 trigger · 6-month probation</p></div><button className="pm-icon-btn" onClick={onClose}>×</button></div><div className="pm-stepper"><button className={step === 1 ? 'active' : ''} onClick={() => setStep(1)}><b>1</b> Employee</button><span /><button className={step === 2 ? 'active' : ''} onClick={() => setStep(2)}><b>2</b> Evaluation</button><span /><button className={step === 3 ? 'active' : ''} onClick={() => setStep(3)}><b>3</b> Recommendation</button></div><div className="pm-modal-body">
    {step === 1 && <><div className="pm-person-banner"><div className="pm-avatar lg">{employee.initials}</div><div><h3>{employee.name}</h3><p>{employee.employeeCode} · {employee.jobTitle || '—'}</p></div><span className={`pm-status ${statusClass(employee.stage)}`}>{employee.stage}</span></div><div className="pm-info-grid">{[['Department', employee.department || '—'], ['Supervisor / Line Manager', employee.supervisor || '—'], ['HOD', employee.hod || '—'], ['Date Appointed', fmt(employee.appointmentDate)], ['Evaluation Trigger', fmt(employee.evaluationTrigger)], ['Probation End', fmt(employee.probationEnd)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="pm-note"><b>Automated workflow:</b> This evaluation routes Supervisor/Line Manager → HOD → HR and is saved to HRIS.</div></>}
    {step === 2 && <><div className="pm-section-title"><div><h3>Performance Assessment</h3><p>Complete every criterion. Comments are mandatory for Above Average or Unsatisfactory.</p></div></div><div className="pm-eval-table"><div className="pm-eval-row header"><span>Evaluation criterion</span><span>Rating</span><span>Supervisor comment</span></div>{criteria.map((item) => <div className="pm-eval-row" key={item.id}><strong>{item.label}</strong><select value={item.rating} onChange={(event) => setCriteria((current) => current.map((row) => row.id === item.id ? { ...row, rating: event.target.value as Rating } : row))}><option value="">Select rating</option>{ratings.map((rating) => <option key={rating}>{rating}</option>)}</select><textarea rows={2} value={item.comment} onChange={(event) => setCriteria((current) => current.map((row) => row.id === item.id ? { ...row, comment: event.target.value } : row))} placeholder={item.rating === 'Unsatisfactory' || item.rating === 'Above Average' ? 'Required comment' : 'Optional comment'} /></div>)}</div><div className="pm-form-grid two"><label>Overall Evaluation<select value={overall} onChange={(event) => setOverall(event.target.value)}><option value="">Select outcome</option><option>Satisfactory</option><option>Unsatisfactory</option></select></label><label>General Comments<textarea rows={3} value={generalComments} onChange={(event) => setGeneralComments(event.target.value)} /></label></div><label className="pm-field">Areas requiring development and suggestions<textarea rows={3} value={developmentAreas} onChange={(event) => setDevelopmentAreas(event.target.value)} /></label></>}
    {step === 3 && <><div className="pm-section-title"><div><h3>Recommendation & Submission</h3><p>The recommendation is stored on the HRIS probation record and routed to the next approver.</p></div></div><div className="pm-recommendations">{recommendations.map((item) => <button key={item} type="button" onClick={() => setRecommendation(item)} className={recommendation === item ? 'selected' : ''}><span className="pm-radio">{recommendation === item ? '●' : '○'}</span><div><b>{item}</b><small>{item === 'Confirm Employment' ? 'Employee has satisfactorily completed probation.' : item === 'Extend Probation' ? 'Start the approved extension cycle.' : 'Forward recommendation for controlled HR review.'}</small></div></button>)}</div><label className="pm-check"><input type="checkbox" checked={discussed} onChange={(event) => setDiscussed(event.target.checked)} /><span>I have discussed this evaluation with the employee.</span></label><label className="pm-check"><input type="checkbox" checked={declared} onChange={(event) => setDeclared(event.target.checked)} /><span>I confirm that this evaluation is accurate and ready for submission.</span></label><div className="pm-route"><span className="done">Supervisor / Line Manager</span><i>→</i><span>HOD Approval</span><i>→</i><span>HR Final Review</span></div></>}
    {error && <div className="pm-error">{error}</div>}
  </div><div className="pm-modal-foot"><button className="pm-btn ghost" onClick={onClose}>Close</button><div>{step > 1 && <button className="pm-btn secondary" onClick={() => setStep(step - 1)}>Back</button>}{step < 3 ? <button className="pm-btn primary" onClick={() => setStep(step + 1)}>Continue</button> : <button className="pm-btn primary" disabled={saving} onClick={async () => { const message = validate(); if (message) { setError(message); setStep(2); return; } setSaving(true); try { await onSubmit({ criteria, overall, generalComments, developmentAreas, discussedWithEmployee: discussed, supervisorDeclaration: declared }, recommendation); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Save failed.'); } finally { setSaving(false); } }}>{saving ? 'Submitting…' : 'Submit'}</button>}</div></div></div></div>;
}

function SettingsModal({ settings, onClose, onSave }: { settings: Settings; onClose: () => void; onSave: (settings: Settings) => Promise<void> }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setNumber = (key: keyof Settings) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(event.target.value) });
  return <div className="pm-modal-backdrop" role="dialog" aria-modal="true"><div className="pm-modal"><div className="pm-modal-head"><div><h2>Probation settings</h2><p>These values are stored in HRIS and applied to new probation records.</p></div><button className="pm-icon-btn" onClick={onClose}>×</button></div><div className="pm-modal-body"><div className="pm-form-grid three"><label>Probation period (months)<input type="number" value={form.probationMonths} onChange={setNumber('probationMonths')} /></label><label>Evaluation trigger (month)<input type="number" value={form.triggerMonth} onChange={setNumber('triggerMonth')} /></label><label>Extension period (months)<input type="number" value={form.extensionMonths} onChange={setNumber('extensionMonths')} /></label><label>Supervisor SLA (working days)<input type="number" value={form.supervisorSlaDays} onChange={setNumber('supervisorSlaDays')} /></label><label>Reminder after (working days)<input type="number" value={form.reminderDay} onChange={setNumber('reminderDay')} /></label><label>Escalate after (working days)<input type="number" value={form.escalationDay} onChange={setNumber('escalationDay')} /></label></div><label className="pm-toggle-row"><span><b>Automatic evaluation initiation</b><small>Create a probation record for every employee whose HRIS status or dates show they are on probation.</small></span><input type="checkbox" checked={form.autoInitiate} onChange={(event) => setForm({ ...form, autoInitiate: event.target.checked })} /></label><label className="pm-toggle-row"><span><b>Skip duplicate HOD stage</b><small>Skip HOD approval when the supervisor and HOD are the same person.</small></span><input type="checkbox" checked={form.skipDuplicateHod} onChange={(event) => setForm({ ...form, skipDuplicateHod: event.target.checked })} /></label>{error && <div className="pm-error">{error}</div>}</div><div className="pm-modal-foot"><button className="pm-btn ghost" onClick={onClose}>Cancel</button><button className="pm-btn primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(form); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Save failed.'); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Save'}</button></div></div></div>;
}

function DecisionModal({ employee, onClose, onSave }: { employee: Employee; onClose: () => void; onSave: (decision: string, comment: string) => Promise<void> }) {
  const [choice, setChoice] = useState('approve');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <div className="pm-modal-backdrop" role="dialog" aria-modal="true"><div className="pm-modal"><div className="pm-modal-head"><div><h2>Probation decision</h2><p>{employee.name} is at {employee.stage}.</p></div><button className="pm-icon-btn" onClick={onClose}>×</button></div><div className="pm-modal-body"><label>Decision<select value={choice} onChange={(event) => setChoice(event.target.value)}><option value="approve">Approve and move forward</option><option value="return">Return to supervisor</option><option value="confirm">Confirm employment</option><option value="extend">Extend probation</option><option value="terminate">Recommend termination review</option><option value="remind">Record a reminder</option></select></label><label>Comment<textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></label>{error && <div className="pm-error">{error}</div>}</div><div className="pm-modal-foot"><button className="pm-btn ghost" onClick={onClose}>Cancel</button><button className="pm-btn primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(choice, comment); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Save failed.'); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Save'}</button></div></div></div>;
}
