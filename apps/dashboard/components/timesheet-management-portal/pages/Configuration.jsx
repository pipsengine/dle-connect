'use client';
import React, { useEffect, useState } from 'react';
import { Button, Field, Table } from '../components/UI';
import RecordWorkspace from '../components/RecordWorkspace';

const TABS = ['Work Calendar', 'Public Holidays', 'Shifts', 'Locations', 'OVT Rules', 'Night Work Rules', 'Internal Activities', 'Submission Rules', 'Approval Rules', 'Exception Rules', 'Biometric Mapping'];
const HEADERS = ['Rule', 'Scope', 'Current Value', 'Effective From', 'Effective To', 'Reference', 'Owner', 'Last Updated', 'Status'];

function HolidayCalendar() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', date: '', holidayType: 'Declared', scope: 'National', region: '', source: '' });
  const [message, setMessage] = useState('');
  const load = () => fetch('/api/timesheet-management/entry?mode=holidays').then((response) => response.json()).then((body) => setRows(body.data || []));
  useEffect(() => { load(); }, []);
  return <section className="panel" style={{ marginBottom: 16 }}><div className="panelHead"><div><h3>Nigeria public holiday calendar</h3><p>Active holidays classify the work date. Submitted timesheets keep the classification they were saved with.</p></div></div>
    {message && <div className="infoBox">{message}</div>}
    <div className="formGrid"><Field label="Name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Date"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="Type"><select value={form.holidayType} onChange={(event) => setForm({ ...form, holidayType: event.target.value })}><option>Fixed</option><option>Movable</option><option>Substitute</option><option>Declared</option></select></Field><Field label="Scope"><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}><option>National</option><option>Regional</option></select></Field><Field label="State / region"><input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></Field><Field label="Source"><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></Field></div>
    <Button onClick={async () => { const response = await fetch('/api/timesheet-management/entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-holiday', ...form }) }); const body = await response.json(); if (body.status === 'error') setMessage(body.error); else { setRows(body.data.holidays || []); setMessage('Holiday saved.'); setForm({ ...form, name: '', date: '' }); } }}>Save holiday</Button>
    <Table headers={['Holiday', 'Date', 'Type', 'Scope', 'Region', 'Year', 'Status']} rows={rows.map((row) => [row.name, row.date, row.holidayType, row.scope, row.region || '—', row.year, row.status])} empty="No holidays saved." />
  </section>;
}

export default function Configuration() {
  return <><HolidayCalendar /><RecordWorkspace
    area="configuration"
    title="Configuration"
    description="Configuration rules saved in DLE Enterprise. No company rules are seeded."
    tabs={TABS}
    headers={HEADERS}
    mapRow={(record, { formatDisplayDate, badge }) => [
      record.payload.reason || record.tab,
      record.location || record.workCenter || 'Company',
      record.payload.value || '—',
      formatDisplayDate(record.effectiveFrom || record.workDate),
      formatDisplayDate(record.effectiveTo),
      record.reference,
      record.createdBy || '—',
      formatDisplayDate(record.updatedAt),
      badge(record.status),
    ]}
  /></>;
}
