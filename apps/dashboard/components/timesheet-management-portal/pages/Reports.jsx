'use client';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Card, Field, Table, Tabs } from '../components/UI';
import { exportTimesheet } from '../lib/export';
import { bookingHasHours, usePortalData } from '../portal-data';

const dayKind = (value) => {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const day = date.getDay();
  if (Number.isNaN(date.getTime())) return 'weekday';
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
};

export default function Reports() {
  const { snapshot } = usePortalData();
  const [tab, setTab] = useState('Booking Summary');
  const [periodId, setPeriodId] = useState('');
  const selected = periodId || snapshot.periods[0]?.id || '';
  const period = snapshot.periods.find((item) => item.id === selected);
  const bookings = snapshot.bookings.filter((booking) => (!selected || booking.periodId === selected) && bookingHasHours(booking));
  const holidayDates = new Set(snapshot.records.filter((record) => record.area === 'configuration' && record.tab === 'Public Holidays' && record.workDate).map((record) => record.workDate));
  const rows = useMemo(() => {
    const byEmployee = new Map();
    for (const booking of bookings) {
      const current = byEmployee.get(booking.employeeCode) || { id: booking.employeeCode, name: booking.employeeName, weekdayHours: 0, weekdayOvt: 0, saturdayHours: 0, saturdayOvt: 0, sundayHours: 0, sundayOvt: 0, phHours: 0, phOvt: 0, night: 0, nightHours: 0, days: new Set(), status: 'Balanced' };
      const kind = holidayDates.has(booking.workDate) ? 'ph' : dayKind(booking.workDate);
      if (kind === 'saturday') { current.saturdayHours += Number(booking.regularHours || 0); current.saturdayOvt += Number(booking.ovtHours || 0); }
      else if (kind === 'sunday') { current.sundayHours += Number(booking.regularHours || 0); current.sundayOvt += Number(booking.ovtHours || 0); }
      else if (kind === 'ph') { current.phHours += Number(booking.regularHours || 0); current.phOvt += Number(booking.ovtHours || 0); }
      else { current.weekdayHours += Number(booking.regularHours || 0); current.weekdayOvt += Number(booking.ovtHours || 0); }
      if (Number(booking.nightHours) > 0) { current.night += 1; current.nightHours += Number(booking.nightHours); }
      current.days.add(booking.workDate);
      if (booking.status === 'Exception') current.status = 'Exception';
      byEmployee.set(booking.employeeCode, current);
    }
    return [...byEmployee.values()];
  }, [bookings, holidayDates]);
  const sum = (pick) => rows.reduce((total, row) => total + pick(row), 0);

  return <>
    <div className="pageTitle"><div><span className="eyebrow">RECONCILIATION & REPORTING</span><h1>Timesheet Reports</h1><p>The screen and the export use the same saved bookings.</p></div><Button onClick={() => exportTimesheet(rows.map((row) => ({ id: row.id, name: row.name, supervisor: '', reg: row.weekdayHours, ovt: row.weekdayOvt + row.saturdayOvt + row.sundayOvt + row.phOvt, night: row.nightHours })))}>Export</Button></div>
    <div className="filters">
      <Field label="Period"><select value={selected} onChange={(event) => setPeriodId(event.target.value)}>{snapshot.periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{!snapshot.periods.length && <option value="">No periods</option>}</select></Field>
      <Field label="From"><input type="date" value={period?.startDate || ''} readOnly /></Field>
      <Field label="To"><input type="date" value={period?.endDate || ''} readOnly /></Field>
    </div>
    <div className="kpis compact">
      <Card label="Employees" value={String(rows.length)} sub="Employees with hours" />
      <Card label="Worked Days" value={String(new Set(bookings.map((booking) => booking.workDate)).size)} sub="Distinct work dates" />
      <Card label="Weekday Hours" value={String(sum((row) => row.weekdayHours))} sub="Regular" />
      <Card label="Saturday Hours" value={String(sum((row) => row.saturdayHours))} sub="Regular" />
      <Card label="Sunday Hours" value={String(sum((row) => row.sundayHours))} sub="Regular" />
      <Card label="PH Hours" value={String(sum((row) => row.phHours))} sub="Dates saved as public holidays" />
      <Card label="Total OVT" value={String(sum((row) => row.weekdayOvt + row.saturdayOvt + row.sundayOvt + row.phOvt))} sub="All saved overtime" />
      <Card label="Night Sessions" value={String(sum((row) => row.night))} sub="Bookings with night hours" />
    </div>
    <Tabs items={['Booking Summary', 'Daily Detail', 'OVT', 'Night Work']} active={tab} setActive={setTab} />
    <div className="panel"><div className="panelHead"><div><h3>{tab}</h3><p>{period?.name || 'No period selected'}</p></div><Badge tone="green">DLE ENTERPRISE</Badge></div>
      {tab === 'Daily Detail' ? <Table headers={['Date', 'Code', 'Employee', 'REG', 'OVT', 'Night', 'Status']} rows={bookings.map((booking) => [booking.workDate, booking.employeeCode, booking.employeeName, booking.regularHours, booking.ovtHours, booking.nightHours, booking.status])} empty="No bookings saved." />
        : <Table headers={['Code', 'Employee', 'Days', 'Weekday Hrs', 'Weekday OVT', 'Sat Hrs', 'Sat OVT', 'Sun Hrs', 'Sun OVT', 'PH Hrs', 'PH OVT', 'Night', 'Night Hrs', 'Status']} rows={rows.filter((row) => (tab === 'OVT' ? row.weekdayOvt + row.saturdayOvt + row.sundayOvt + row.phOvt > 0 : tab === 'Night Work' ? row.night > 0 : true)).map((row) => [row.id, row.name, row.days.size, row.weekdayHours, row.weekdayOvt, row.saturdayHours, row.saturdayOvt, row.sundayHours, row.sundayOvt, row.phHours, row.phOvt, row.night, row.nightHours, <Badge tone={row.status === 'Exception' ? 'amber' : 'green'}>{row.status}</Badge>])} empty="No bookings saved for this period." />}
    </div>
  </>;
}
