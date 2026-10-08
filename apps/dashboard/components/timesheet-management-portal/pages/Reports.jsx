'use client';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Card, DetailModal, Field, Table, Tabs } from '../components/UI';
import { buildBookingSummary } from '../lib/booking-summary';
import { exportTimesheet } from '../lib/export';
import { bookingHasHours, formatDisplayDate, usePortalData } from '../portal-data';

const nightDetail = (booking) => {
  if (String(booking.shift || '').trim().toLowerCase() === 'night') {
    const hours = Number(booking.regularHours || 0) + Number(booking.ovtHours || 0);
    return hours || '';
  }
  return Number(booking.nightHours) > 0 ? 'Yes' : '';
};

export default function Reports() {
  const { snapshot } = usePortalData();
  const [tab, setTab] = useState('Booking Summary');
  const [periodId, setPeriodId] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [detail, setDetail] = useState(null);
  const selected = periodId || snapshot.periods[0]?.id || '';
  const period = snapshot.periods.find((item) => item.id === selected);
  const periodBookings = snapshot.bookings.filter((booking) => (!selected || booking.periodId === selected) && bookingHasHours(booking));
  const supervisors = [...new Set(periodBookings.map((booking) => booking.supervisor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const bookings = supervisor ? periodBookings.filter((booking) => booking.supervisor === supervisor) : periodBookings;
  const holidayDates = useMemo(() => {
    const dates = new Set((snapshot.publicHolidays || []).map((date) => String(date).slice(0, 10)));
    for (const record of snapshot.records || []) {
      if (record.area !== 'configuration' || record.tab !== 'Public Holidays') continue;
      for (const value of [record.workDate, record.effectiveFrom, record.payload?.date]) {
        const date = String(value || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date);
      }
    }
    return dates;
  }, [snapshot.publicHolidays, snapshot.records]);
  const rows = useMemo(
    () => buildBookingSummary(bookings, holidayDates, snapshot.standardHours || 8),
    [bookings, holidayDates, snapshot.standardHours],
  );
  const sum = (pick) => rows.reduce((total, row) => total + pick(row), 0);
  const overtimeHours = (row) => row.weekdayOvt + row.saturdayOvt + row.sundayOvt + row.phOvt;
  const visibleRows = rows.filter((row) => {
    if (tab === 'OVT') return overtimeHours(row) > 0;
    if (tab === 'Night Work') return row.night > 0;
    return true;
  });
  const listedCount = tab === 'Daily Detail' ? bookings.length : visibleRows.length;
  const pageCount = Math.max(1, Math.ceil(listedCount / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const detailPage = bookings.slice(start, start + pageSize);
  const summaryPage = visibleRows.slice(start, start + pageSize);
  const from = listedCount ? start + 1 : 0;
  const to = Math.min(listedCount, start + pageSize);
  const changePeriod = (event) => { setPeriodId(event.target.value); setSupervisor(''); setPage(1); };
  const changeSupervisor = (event) => { setSupervisor(event.target.value); setPage(1); };
  const changeTab = (next) => { setTab(next); setPage(1); };
  const changePageSize = (event) => { setPageSize(Number(event.target.value)); setPage(1); };
  const exportReport = () => exportTimesheet(rows.map((row) => ({
    Code: row.id,
    Employee: row.name,
    Days: row.days.size,
    'Weekday Hrs': row.weekdayHours,
    'Weekday OVT': row.weekdayOvt,
    'Sat Hrs': row.saturdayHours,
    'Sat OVT': row.saturdayOvt,
    'Sun Hrs': row.sundayHours,
    'Sun OVT': row.sundayOvt,
    'PH Hrs': row.phHours,
    'PH OVT': row.phOvt,
    Night: row.night,
    'Night Hrs': row.nightHours,
    Status: row.status,
  })));

  return <>
    <div className="pageTitle"><div><span className="eyebrow">RECONCILIATION & REPORTING</span><h1>Timesheet Reports</h1><p>The screen and the export use the same saved bookings.</p></div><Button onClick={exportReport}>Export</Button></div>
    <div className="filters">
      <Field label="Period"><select value={selected} onChange={changePeriod}>{snapshot.periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{!snapshot.periods.length && <option value="">No periods</option>}</select></Field>
      <Field label="From"><input type="date" value={period?.startDate || ''} readOnly /></Field>
      <Field label="To"><input type="date" value={period?.endDate || ''} readOnly /></Field>
      <Field label="Supervisor"><select value={supervisor} onChange={changeSupervisor}><option value="">All supervisors</option>{supervisors.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>
    </div>
    <div className="kpis compact">
      <Card label="Employees" value={String(rows.length)} sub="Employees with hours" onClick={() => setDetail({ title: 'Employees with hours', headers: summaryHeaders, rows: rows.map(summaryCells) })} />
      <Card label="Worked Days" value={String(new Set(bookings.map((booking) => booking.workDate)).size)} sub="Distinct work dates" onClick={() => setDetail({ title: 'Worked days', headers: ['Date', 'Employees', 'REG', 'OVT'], rows: workedDayRows(bookings) })} />
      <Card label="Weekday Hours" value={String(sum((row) => row.weekdayHours))} sub="Regular" onClick={() => setDetail({ title: 'Weekday hours', headers: ['Code', 'Employee', 'Weekday Hrs', 'Weekday OVT', 'Status'], rows: rows.filter((row) => row.weekdayHours > 0).map((row) => [row.id, row.name, row.weekdayHours, row.weekdayOvt, row.status]) })} />
      <Card label="Saturday Hours" value={String(sum((row) => row.saturdayHours))} sub="Regular" onClick={() => setDetail({ title: 'Saturday hours', headers: ['Code', 'Employee', 'Sat Hrs', 'Sat OVT', 'Status'], rows: rows.filter((row) => row.saturdayHours > 0).map((row) => [row.id, row.name, row.saturdayHours, row.saturdayOvt, row.status]) })} />
      <Card label="Sunday Hours" value={String(sum((row) => row.sundayHours))} sub="Regular" onClick={() => setDetail({ title: 'Sunday hours', headers: ['Code', 'Employee', 'Sun Hrs', 'Sun OVT', 'Status'], rows: rows.filter((row) => row.sundayHours > 0).map((row) => [row.id, row.name, row.sundayHours, row.sundayOvt, row.status]) })} />
      <Card label="PH Hours" value={String(sum((row) => row.phHours))} sub="Regular hours on public holidays" onClick={() => setDetail({ title: 'Public holiday hours', headers: ['Code', 'Employee', 'PH Hrs', 'PH OVT', 'Status'], rows: rows.filter((row) => row.phHours + row.phOvt > 0).map((row) => [row.id, row.name, row.phHours, row.phOvt, row.status]) })} />
      <Card label="Total OVT" value={String(sum(overtimeHours))} sub="All saved overtime" onClick={() => setDetail({ title: 'Overtime', headers: ['Code', 'Employee', 'Weekday', 'Saturday', 'Sunday', 'PH', 'Total'], rows: rows.filter((row) => overtimeHours(row) > 0).map((row) => [row.id, row.name, row.weekdayOvt, row.saturdayOvt, row.sundayOvt, row.phOvt, overtimeHours(row)]) })} />
      <Card label="Night Sessions" value={String(sum((row) => row.night))} sub="Dates with a night session" onClick={() => setDetail({ title: 'Night sessions', headers: ['Code', 'Employee', 'Nights', 'Night Hrs', 'Status'], rows: rows.filter((row) => row.night > 0).map((row) => [row.id, row.name, row.night, row.nightHours, row.status]) })} />
    </div>
    <Tabs items={['Booking Summary', 'Daily Detail', 'OVT', 'Night Work']} active={tab} setActive={changeTab} />
    <div className="panel reportSheet"><div className="panelHead"><div><h3>{tab}</h3><p>{period?.name || 'No period selected'}</p></div><Badge tone="green">DLE ENTERPRISE</Badge></div>
      {tab === 'Daily Detail'
        ? <Table headers={['Date', 'Code', 'Employee', 'REG', 'OVT', 'Night', 'Status']} rows={detailPage.map((booking) => [booking.workDate, booking.employeeCode, booking.employeeName, booking.regularHours, booking.ovtHours, nightDetail(booking), booking.status])} empty="No bookings saved." />
        : <Table headers={['Code', 'Employee', 'Days', 'Weekday Hrs', 'Weekday OVT', 'Sat Hrs', 'Sat OVT', 'Sun Hrs', 'Sun OVT', 'PH Hrs', 'PH OVT', 'Night', 'Night Hrs', 'Status']} rows={summaryPage.map((row) => [row.id, row.name, row.days.size, row.weekdayHours, row.weekdayOvt, row.saturdayHours, row.saturdayOvt, row.sundayHours, row.sundayOvt, row.phHours, row.phOvt, row.night, row.nightHours, <Badge tone={row.status === 'Exception' ? 'amber' : 'green'}>{row.status}</Badge>])} empty="No bookings saved for this period." />}
      <div className="crewPager"><span>Showing {from} to {to} of {listedCount}</span><div><button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button><span>{safePage} / {pageCount}</span><button type="button" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>›</button><select value={pageSize} onChange={changePageSize}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select></div></div>
    </div>
    {detail && <DetailModal title={detail.title} headers={detail.headers} rows={detail.rows} onClose={() => setDetail(null)} />}
  </>;
}

const summaryHeaders = ['Code', 'Employee', 'Days', 'Weekday', 'Sat', 'Sun', 'PH', 'OVT', 'Night', 'Status'];
const summaryCells = (row) => [row.id, row.name, row.days.size, row.weekdayHours, row.saturdayHours, row.sundayHours, row.phHours, row.weekdayOvt + row.saturdayOvt + row.sundayOvt + row.phOvt, row.night, row.status];
const workedDayRows = (bookings) => {
  const byDate = new Map();
  for (const booking of bookings) {
    const date = String(booking.workDate || '').slice(0, 10);
    const current = byDate.get(date) || { people: new Set(), regular: 0, ovt: 0 };
    if (booking.employeeCode) current.people.add(booking.employeeCode);
    if (String(booking.shift || '').toLowerCase() !== 'night') {
      current.regular += Number(booking.regularHours || 0);
      current.ovt += Number(booking.ovtHours || 0);
    }
    byDate.set(date, current);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, item]) => [formatDisplayDate(date), item.people.size, item.regular, item.ovt]);
};
