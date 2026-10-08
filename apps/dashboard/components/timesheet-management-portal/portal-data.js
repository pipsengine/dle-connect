'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const PortalDataContext = createContext(null);

const emptySnapshot = {
  directory: { employees: [], projects: [], locations: [], workCenters: [], supervisors: [] },
  periods: [],
  bookings: [],
  records: [],
  publicHolidays: [],
  standardHours: 8,
  crewAssignments: [],
  crewEvents: [],
  crewRemovals: [],
};

export function PortalDataProvider({ children }) {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    const response = await fetch('/api/timesheet-management', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'Unable to load timesheet management data.');
    setSnapshot(body.data || emptySnapshot);
    setError('');
  }, []);

  useEffect(() => {
    let active = true;
    reload()
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const save = useCallback(async (payload) => {
    const response = await fetch('/api/timesheet-management', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status === 'error') throw new Error(body.error || 'Save failed.');
    if (body.data?.snapshot) setSnapshot(body.data.snapshot);
    else await reload();
    return body.data;
  }, [reload]);

  const value = useMemo(() => ({ snapshot, loading, error, notice, setNotice, save, reload }), [snapshot, loading, error, notice, save, reload]);
  return <PortalDataContext.Provider value={value}>{children}</PortalDataContext.Provider>;
}

export function usePortalData() {
  const value = useContext(PortalDataContext);
  if (!value) throw new Error('Timesheet data is not available.');
  return value;
}

export const formatDisplayDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const openPeriod = (periods) => periods.find((period) => period.status === 'Open') || periods[0] || null;

export const bookingHasHours = (booking) => Number(booking?.regularHours || 0) + Number(booking?.ovtHours || 0) + Number(booking?.nightHours || 0) > 0;

export const bookingGroupStatus = (lines) => {
  if ((lines || []).some((line) => line.status === 'Exception')) return 'Exception';
  if ((lines || []).some((line) => line.status === 'Draft')) return 'Draft';
  if ((lines || []).every((line) => line.status === 'Approved')) return 'Approved';
  if ((lines || []).every((line) => line.status === 'Submitted' || line.status === 'Approved')) return 'Submitted';
  return 'Saved';
};

export const bookingGroupRows = (groups) => (groups || []).map((lines) => {
  const first = lines[0] || {};
  const regular = lines.reduce((sum, line) => sum + Number(line.regularHours || 0), 0);
  const ovt = lines.reduce((sum, line) => sum + Number(line.ovtHours || 0), 0);
  return [first.employeeCode || '', first.employeeName || '', new Set(lines.map((line) => line.workDate)).size, regular, ovt, bookingGroupStatus(lines)];
});

export const EMPLOYEE_HOUR_HEADERS = ['Code', 'Employee', 'Dates', 'REG', 'OVT', 'Status'];

export const bookedEmployeeGroups = (bookings) => {
  const byCode = new Map();
  for (const booking of bookings || []) {
    if (!bookingHasHours(booking)) continue;
    const code = booking.employeeCode || booking.employeeName;
    if (!code) continue;
    const current = byCode.get(code) || [];
    current.push(booking);
    byCode.set(code, current);
  }
  return [...byCode.values()];
};
