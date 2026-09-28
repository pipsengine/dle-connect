'use client';
import React from 'react';
import { Badge, Button, Card, Table } from '../components/UI';
import { bookedEmployeeGroups, formatDisplayDate, openPeriod, usePortalData } from '../portal-data';

export default function Dashboard({ setPage }) {
  const { snapshot, loading, error } = usePortalData();
  const period = openPeriod(snapshot.periods);
  const bookings = period ? snapshot.bookings.filter((booking) => booking.periodId === period.id) : [];
  const booked = bookedEmployeeGroups(bookings);
  const submitted = booked.filter((lines) => lines.every((line) => line.status === 'Submitted' || line.status === 'Approved')).length;
  const drafts = booked.filter((lines) => lines.some((line) => line.status === 'Draft')).length;
  const exceptions = booked.filter((lines) => lines.some((line) => line.status === 'Exception')).length + snapshot.records.filter((record) => record.periodId === period?.id && record.status === 'Exception').length;
  const pending = snapshot.records.filter((record) => record.area === 'approval' && record.periodId === period?.id && record.status !== 'Approved').length;
  const completion = booked.length ? Math.round((submitted / booked.length) * 1000) / 10 : 0;
  const supervisors = [...new Set(bookings.map((booking) => booking.supervisor).filter(Boolean))];
  const supervisorRows = supervisors.map((name) => {
    const rows = bookings.filter((booking) => booking.supervisor === name);
    const bookedRows = bookedEmployeeGroups(rows);
    const done = bookedRows.filter((lines) => lines.every((line) => line.status === 'Submitted' || line.status === 'Approved')).length;
    const draft = bookedRows.filter((lines) => lines.some((line) => line.status === 'Draft')).length;
    return [name, new Set(rows.map((row) => row.employeeCode)).size, bookedRows.length, done, draft, bookedRows.length ? `${Math.round((done / bookedRows.length) * 1000) / 10}%` : '0%'];
  });
  const stages = ['Supervisor', 'Cost Control', 'Project Manager', 'HR'];
  const bottlenecks = stages.map((stage) => snapshot.records.filter((record) => record.area === 'approval' && record.tab === stage && record.status !== 'Approved'));
  const ovtHours = bookings.reduce((sum, booking) => sum + Number(booking.ovtHours || 0), 0);
  const nightSessions = bookings.filter((booking) => Number(booking.nightHours) > 0).length;
  const offshore = snapshot.records.filter((record) => record.area === 'offshore' && record.status !== 'Approved' && record.tab !== 'History').length;

  return <>
    <div className="pageTitle"><div><span className="eyebrow">TIMESHEET MANAGEMENT</span><h1>Operations Dashboard</h1><p>Figures come from timesheet periods, bookings, and records stored in DLE Enterprise.</p></div><div><Button onClick={() => setPage('Timesheet Entry')}>+ New Timesheet</Button></div></div>
    {error && <div className="success" style={{ background: '#fef2f2', color: '#991b1b' }}>{error}</div>}
    <div className="periodBanner">
      <div><span>ACTIVE PERIOD</span><b>{loading ? 'Loading…' : period?.name || 'No period yet'}</b><small>{period ? `${formatDisplayDate(period.startDate)} — ${formatDisplayDate(period.endDate)}` : 'Create a period to begin'}</small></div>
      <Badge tone={period?.status === 'Open' ? 'green' : 'slate'}>{period?.status || 'EMPTY'}</Badge>
      <div className="progress"><span>Submission completion <b>{completion}%</b></span><i><em style={{ width: `${completion}%` }} /></i></div>
      <Button kind="secondary" onClick={() => setPage('Timesheet Periods')}>Manage Period</Button>
    </div>
    <div className="kpis">
      <Card label="Booked" value={String(booked.length)} sub="Employees with hours" />
      <Card label="Submitted" value={String(submitted)} sub={booked.length ? `${completion}% of employees booked` : 'Nothing submitted'} tone="good" />
      <Card label="Draft" value={String(drafts)} sub="Saved and not submitted" tone={drafts ? 'warn' : ''} />
      <Card label="Pending Approval" value={String(pending)} sub="Approval records still open" />
      <Card label="Exceptions" value={String(exceptions)} sub="Bookings and records" tone={exceptions ? 'bad' : ''} />
      <Card label="Payroll Ready" value={String(booked.filter((lines) => lines.every((line) => line.status === 'Approved')).length)} sub="Approved employees with hours" tone="good" />
    </div>
    <div className="two">
      <div className="panel"><div className="panelHead"><div><h3>Completion by Supervisor</h3><p>Saved bookings in the active period</p></div></div><Table headers={['Supervisor', 'Crew', 'Booked', 'Submitted', 'Draft', 'Completion']} rows={supervisorRows} empty="No bookings saved for this period." /></div>
      <div className="panel"><div className="panelHead"><div><h3>Approval Bottlenecks</h3><p>Open approval records</p></div></div><div className="feed">{bottlenecks.every((items) => !items.length) ? <div className="feedRow"><div><strong>No approval queue</strong><span>Submit a booking to create the first item.</span></div></div> : bottlenecks.map((items, index) => <Feed key={stages[index]} n={items.length} t={stages[index]} s={items.length ? `${items.length} open` : 'Clear'} />)}</div></div>
    </div>
    <div className="three">
      <Mini title="OVT this period" value={`${ovtHours} h`} text="Sum of overtime hours on saved bookings" />
      <Mini title="Night Work" value={`${nightSessions} sessions`} text="Bookings with night hours saved" />
      <Mini title="Offshore Crew" value={`${offshore} records`} text="Open mobilization records" />
    </div>
  </>;
}

function Feed({ n, t, s }) { return <div className="feedRow"><b>{n}</b><div><strong>{t}</strong><span>{s}</span></div></div>; }
function Mini({ title, value, text }) { return <div className="panel mini"><span>{title}</span><b>{value}</b><small>{text}</small></div>; }
