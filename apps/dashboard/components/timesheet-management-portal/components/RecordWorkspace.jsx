'use client';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Field, Modal, Table, Tabs } from './UI';
import { formatDisplayDate, usePortalData } from '../portal-data';

const toneFor = (status) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('exception') || value.includes('block')) return 'red';
  if (value.includes('pending') || value.includes('review') || value.includes('open') || value.includes('draft')) return 'amber';
  if (value.includes('active') || value.includes('approved') || value.includes('complete') || value.includes('reconcil') || value.includes('valid')) return 'green';
  return 'slate';
};

export default function RecordWorkspace({ area, title, description, tabs, headers, mapRow }) {
  const { snapshot, loading, error, notice, setNotice, save } = usePortalData();
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [modal, setModal] = useState(false);
  const [query, setQuery] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const directory = snapshot.directory;
  const records = snapshot.records.filter((record) => record.area === area && record.tab === activeTab);
  const filtered = useMemo(() => records.filter((record) => {
    const haystack = [record.reference, record.employeeCode, record.employeeName, record.projectCode, record.supervisor, record.location, record.status].join(' ').toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (periodId && record.periodId !== periodId) return false;
    if (supervisor && record.supervisor !== supervisor) return false;
    if (location && record.location !== location) return false;
    if (status && record.status !== status) return false;
    return true;
  }), [records, query, periodId, supervisor, location, status]);
  const actionCount = filtered.filter((record) => /pending|review|open|draft|exception/i.test(record.status)).length;
  const exceptionCount = filtered.filter((record) => /exception/i.test(record.status)).length;

  return <>
    <div className="pageTitle"><div><span className="eyebrow">TIMESHEET MANAGEMENT</span><h1>{title}</h1><p>{description}</p></div><div className="actions"><Button onClick={() => { setFormError(''); setModal(true); }}>+ New {activeTab}</Button></div></div>
    {error && <div className="success" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
    {notice && <div className="success">{notice} <button onClick={() => setNotice('')}>×</button></div>}
    <Tabs items={tabs} active={activeTab} setActive={setActiveTab} />
    <section className="metricGrid">
      <div className="metric"><span>Total Records</span><b>{loading ? '…' : filtered.length}</b><small>Saved in DLE Enterprise</small></div>
      <div className="metric"><span>Requires Action</span><b>{actionCount}</b><small>Open, draft, or review</small></div>
      <div className="metric"><span>Completed</span><b>{Math.max(0, filtered.length - actionCount)}</b><small>No action outstanding</small></div>
      <div className="metric"><span>Exceptions</span><b>{exceptionCount}</b><small>Marked exception</small></div>
    </section>
    <section className="panel">
      <div className="panelHead"><div><h3>{activeTab}</h3><p>{snapshot.periods[0]?.name || 'No period created yet'} · records stored in DLE Enterprise</p></div><input className="searchInput" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, project, reference..." /></div>
      <div className="filterRow">
        <Field label="Timesheet Period"><select value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">All Periods</option>{snapshot.periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></Field>
        <Field label="Supervisor"><select value={supervisor} onChange={(event) => setSupervisor(event.target.value)}><option value="">All Supervisors</option>{directory.supervisors.map((name) => <option key={name}>{name}</option>)}</select></Field>
        <Field label="Location"><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="">All Locations</option>{directory.locations.map((name) => <option key={name}>{name}</option>)}</select></Field>
        <Field label="Status"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All Statuses</option><option>Open</option><option>Active</option><option>Pending</option><option>Approved</option><option>Exception</option></select></Field>
      </div>
      <Table headers={headers} rows={filtered.map((record) => mapRow(record, { formatDisplayDate, badge: (value) => <Badge tone={toneFor(value)}>{value || '—'}</Badge> }))} empty={loading ? 'Loading records from DLE Enterprise…' : 'No records saved yet. Use New to write the first one.'} />
    </section>
    {modal && <RecordModal
      title={`New ${activeTab}`}
      directory={directory}
      periods={snapshot.periods}
      saving={saving}
      formError={formError}
      onClose={() => setModal(false)}
      onSave={async (form) => {
        setSaving(true);
        setFormError('');
        try {
          const employee = directory.employees.find((item) => item.code === form.employeeCode);
          await save({
            action: 'create-record',
            record: {
              area,
              tab: activeTab,
              periodId: form.periodId,
              employeeCode: form.employeeCode,
              employeeName: employee?.name || form.employeeName,
              supervisor: form.supervisor || employee?.supervisor || '',
              location: form.location || employee?.location || '',
              workCenter: form.workCenter || employee?.workCenter || '',
              projectCode: form.projectCode,
              workDate: form.workDate,
              effectiveFrom: form.effectiveFrom || form.workDate,
              effectiveTo: form.effectiveTo,
              status: form.status || 'Open',
              payload: form.payload,
            },
          });
          setNotice(`${activeTab} saved to DLE Enterprise.`);
          setModal(false);
        } catch (saveError) {
          setFormError(saveError.message);
        } finally {
          setSaving(false);
        }
      }}
    />}
  </>;
}

function RecordModal({ title, directory, periods, saving, formError, onClose, onSave }) {
  const [form, setForm] = useState({
    periodId: periods.find((period) => period.status === 'Open')?.id || periods[0]?.id || '',
    employeeCode: '',
    projectCode: '',
    workDate: '',
    effectiveTo: '',
    supervisor: '',
    location: '',
    workCenter: '',
    status: 'Open',
    reason: '',
    notes: '',
    value: '',
  });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return <Modal title={title} onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => onSave({ ...form, effectiveFrom: form.workDate, payload: { reason: form.reason, notes: form.notes, value: form.value } })}>{saving ? 'Saving…' : 'Save'}</Button></>}>
    {formError && <div className="infoBox">{formError}</div>}
    <div className="formGrid">
      <Field label="Timesheet Period"><select value={form.periodId} onChange={set('periodId')}><option value="">Select period...</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></Field>
      <Field label="Employee"><select value={form.employeeCode} onChange={set('employeeCode')}><option value="">Select employee...</option>{directory.employees.map((employee) => <option key={employee.code} value={employee.code}>{employee.code} · {employee.name}</option>)}</select></Field>
      <Field label="Work Date"><input type="date" value={form.workDate} onChange={set('workDate')} /></Field>
      <Field label="Project"><select value={form.projectCode} onChange={set('projectCode')}><option value="">Select project...</option>{directory.projects.map((project) => <option key={project.code} value={project.code}>{project.code} · {project.name}</option>)}</select></Field>
      <Field label="Supervisor"><select value={form.supervisor} onChange={set('supervisor')}><option value="">From employee record</option>{directory.supervisors.map((name) => <option key={name}>{name}</option>)}</select></Field>
      <Field label="Location"><select value={form.location} onChange={set('location')}><option value="">From employee record</option>{directory.locations.map((name) => <option key={name}>{name}</option>)}</select></Field>
      <Field label="Work Centre"><select value={form.workCenter} onChange={set('workCenter')}><option value="">From employee record</option>{directory.workCenters.map((name) => <option key={name}>{name}</option>)}</select></Field>
      <Field label="Status"><select value={form.status} onChange={set('status')}><option>Open</option><option>Active</option><option>Pending</option><option>Approved</option><option>Exception</option></select></Field>
      <Field label="Value / Reference"><input value={form.value} onChange={set('value')} placeholder="Hours, rule, or reference" /></Field>
      <Field label="Reason"><input value={form.reason} onChange={set('reason')} placeholder="Required where applicable" /></Field>
      <Field label="Notes"><textarea value={form.notes} onChange={set('notes')} placeholder="Operational comments" /></Field>
    </div>
  </Modal>;
}
