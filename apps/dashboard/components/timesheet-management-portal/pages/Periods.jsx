'use client';
import React, { useState } from 'react';
import { Badge, Button, Card, DetailModal, Field, Modal, Table } from '../components/UI';
import { EMPLOYEE_HOUR_HEADERS, bookedEmployeeGroups, bookingGroupRows, formatDisplayDate, usePortalData } from '../portal-data';

const STATES = ['Planned', 'Open', 'Capture Closed', 'Approval in Progress', 'Payroll Locked', 'Closed'];

export default function Periods() {
  const { snapshot, error, notice, setNotice, save } = usePortalData();
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const current = snapshot.periods.find((period) => period.status === 'Open') || snapshot.periods[0];
  const bookings = current ? snapshot.bookings.filter((booking) => booking.periodId === current.id) : [];
  const booked = bookedEmployeeGroups(bookings);
  const drafts = booked.filter((lines) => lines.some((line) => line.status === 'Draft')).length;
  const submitted = booked.filter((lines) => lines.every((line) => line.status !== 'Draft')).length;
  const exceptions = booked.filter((lines) => lines.some((line) => line.status === 'Exception')).length;

  return <>
    <div className="pageTitle"><div><span className="eyebrow">CONTROL</span><h1>Timesheet Periods</h1><p>Periods are stored in DLE Enterprise. The register starts empty.</p></div><Button onClick={() => setModal('create')}>+ Create Period</Button></div>
    {(error || notice) && <div className="success">{error || notice} <button onClick={() => setNotice('')}>×</button></div>}
    <div className="lifecycle">{STATES.map((state) => <Step key={state} t={state} on={current?.status === state} />)}</div>
    <div className="kpis compact">
      <Card label="Current Period" value={current?.name || 'None'} sub={current ? `${formatDisplayDate(current.startDate)} — ${formatDisplayDate(current.endDate)}` : 'Create the first period'} onClick={() => setDetail({ title: current?.name || 'Current period', headers: ['Period', 'From', 'To', 'Status', 'Notes'], rows: current ? [[current.name, formatDisplayDate(current.startDate), formatDisplayDate(current.endDate), current.status, current.notes || '—']] : [] })} />
      <Card label="Booked" value={String(booked.length)} sub="Employees with hours" onClick={() => setDetail({ title: 'Booked employees', headers: EMPLOYEE_HOUR_HEADERS, rows: bookingGroupRows(booked) })} />
      <Card label="Draft" value={String(drafts)} sub="Not submitted" tone={drafts ? 'warn' : ''} onClick={() => setDetail({ title: 'Draft employees', headers: EMPLOYEE_HOUR_HEADERS, rows: bookingGroupRows(booked.filter((lines) => lines.some((line) => line.status === 'Draft'))) })} />
      <Card label="Exceptions" value={String(exceptions)} sub="Marked exception" tone={exceptions ? 'bad' : ''} onClick={() => setDetail({ title: 'Exception employees', headers: EMPLOYEE_HOUR_HEADERS, rows: bookingGroupRows(booked.filter((lines) => lines.some((line) => line.status === 'Exception'))) })} />
      <Card label="Submitted" value={String(submitted)} sub="Submitted or later" tone="good" onClick={() => setDetail({ title: 'Submitted employees', headers: EMPLOYEE_HOUR_HEADERS, rows: bookingGroupRows(booked.filter((lines) => lines.every((line) => line.status !== 'Draft'))) })} />
    </div>
    <div className="panel"><div className="panelHead"><div><h3>Period Register</h3><p>Status changes are written back to DLE Enterprise.</p></div></div>
      <Table headers={['Period', 'Date Range', 'Status', 'Booked', 'Draft', 'Submitted', 'Exceptions', 'Actions']} rows={snapshot.periods.map((period) => {
        const groups = bookedEmployeeGroups(snapshot.bookings.filter((booking) => booking.periodId === period.id));
        return [period.name, `${formatDisplayDate(period.startDate)} — ${formatDisplayDate(period.endDate)}`, <Badge tone={period.status === 'Open' ? 'green' : 'slate'}>{period.status}</Badge>, groups.length, groups.filter((lines) => lines.some((line) => line.status === 'Draft')).length, groups.filter((lines) => lines.every((line) => line.status !== 'Draft')).length, groups.filter((lines) => lines.some((line) => line.status === 'Exception')).length, <button onClick={() => { setSelected(period); setModal('manage'); }}>Manage</button>];
      })} empty="No timesheet periods have been created." />
    </div>
    {detail && <DetailModal title={detail.title} headers={detail.headers} rows={detail.rows} onClose={() => setDetail(null)} />}
    {modal === 'create' && <CreatePeriod onClose={() => setModal(null)} onSave={async (form) => { await save({ action: 'create-period', ...form }); setNotice('Period created in DLE Enterprise.'); setModal(null); }} />}
    {modal === 'manage' && selected && <ManagePeriod period={selected} onClose={() => setModal(null)} onSave={async (status) => { await save({ action: 'update-period', id: selected.id, status }); setNotice('Period status updated.'); setModal(null); }} />}
  </>;
}

function Step({ t, on }) { return <div className={on ? 'done' : ''}><i>{on ? '✓' : ''}</i><span>{t}</span></div>; }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const reviewMonth = (date = new Date()) => {
  let month = date.getMonth();
  let year = date.getFullYear();
  if (date.getDate() >= 16) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return { month, year };
};
const periodBounds = (year, month) => {
  const start = new Date(year, month - 1, 16);
  const end = new Date(year, month, 15);
  const iso = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return { name: `${MONTHS[month]} ${year} Period`, startDate: iso(start), endDate: iso(end) };
};

function CreatePeriod({ onClose, onSave }) {
  const initial = reviewMonth();
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const bounds = periodBounds(year, month);
  return <Modal title="Create Timesheet Period" onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={async () => { setSaving(true); setFormError(''); try { await onSave({ ...bounds, notes }); } catch (saveError) { setFormError(saveError.message); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Save'}</Button></>}>
    {formError && <div className="infoBox">{formError}</div>}
    <div className="formGrid">
      <Field label="Month under review"><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></Field>
      <Field label="Year"><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{[year - 1, year, year + 1, year + 2].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Period name"><input value={bounds.name} readOnly /></Field>
      <Field label="Date range"><input value={`${bounds.startDate} to ${bounds.endDate}`} readOnly /></Field>
      <Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
    </div>
  </Modal>;
}

function ManagePeriod({ period, onClose, onSave }) {
  const [status, setStatus] = useState(period.status);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  return <Modal title="Manage Period Status" onClose={onClose} footer={<><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={async () => { setSaving(true); setFormError(''); try { await onSave(status); } catch (saveError) { setFormError(saveError.message); } finally { setSaving(false); } }}>Save</Button></>}>
    {formError && <div className="infoBox">{formError}</div>}
    <Field label="Status"><select value={status} onChange={(event) => setStatus(event.target.value)}>{STATES.map((state) => <option key={state}>{state}</option>)}</select></Field>
  </Modal>;
}
