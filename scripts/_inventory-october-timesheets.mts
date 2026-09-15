import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { calculateTimesheetPeriod } from '../apps/dashboard/lib/timesheet-entry-store';
import { readTimesheetHeadersForWorkDates } from '../apps/dashboard/lib/timesheet-entry-store';

loadWorkspaceEnv();
const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dates: string[] = [];
for (let cursor = new Date('2026-09-16T00:00:00'); cursor <= new Date('2026-10-15T00:00:00'); cursor.setDate(cursor.getDate() + 1)) {
  dates.push(iso(new Date(cursor)));
}
const { headers, lines } = await readTimesheetHeadersForWorkDates(dates);
const booked = (headerId: string) => lines
  .filter((line) => line.headerId === headerId)
  .reduce((sum, line) => sum + Number(line.usedHours || 0), 0);
const rows = headers
  .map((header) => ({
    id: header.id,
    date: header.timesheetDate,
    periodId: header.periodId,
    period: calculateTimesheetPeriod(header.timesheetDate).id,
    status: header.status,
    supervisor: header.supervisorName,
    workCenter: header.workCenterName,
    location: header.locationName,
    hours: Math.round(booked(header.id) * 10) / 10,
    crew: lines.filter((line) => line.headerId === header.id && Number(line.usedHours || 0) > 0).length,
  }))
  .filter((row) => row.hours > 0.001)
  .sort((a, b) => a.date.localeCompare(b.date) || a.supervisor.localeCompare(b.supervisor));
console.log(JSON.stringify({
  currentPeriod: calculateTimesheetPeriod(new Date()),
  totalHeaders: headers.length,
  bookedHeaders: rows.length,
  byStatus: rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {}),
  rows,
}, null, 2));
const pool = await getDleEnterpriseDbPool();
if (pool) await pool.close();
