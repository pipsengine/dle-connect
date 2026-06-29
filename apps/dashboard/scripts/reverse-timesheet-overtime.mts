/**
 * Reverse mistaken overtime bookings on a supervisor timesheet day.
 *
 * Example:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/reverse-timesheet-overtime.mts \
 *     --date=2026-06-05 --supervisor=P0072 --work-center=Welding --apply
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const apply = args.includes('--apply');
const date = getArg('date') || '2026-06-05';
const supervisor = (getArg('supervisor') || 'P0072').trim().toUpperCase();
const workCenter = (getArg('work-center') || 'Welding').trim();
const actor = getArg('actor') || 'System OT Reversal';

for (const file of [resolve('.env'), resolve('apps/dashboard/.env')]) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

process.chdir(resolve('apps/dashboard'));

const [
  { loadWorkspaceEnv },
  { readTimesheetData, writeTimesheetHeaderLines, isTimesheetPayrollReadyStatus, invalidateTimesheetDataCache, invalidateTimesheetApprovalWorkspaceCache, refreshTimesheetPayrollUpdatesForHeaders },
  { reverseOvertimeBookingOnLines, lineHasOvertimeBooking, overtimeProductiveHours },
  { timesheetDayRulesForDate },
] = await Promise.all([
  import('@/lib/dle-enterprise-db'),
  import('@/lib/timesheet-entry-store'),
  import('@/lib/timesheet-overtime-booking'),
  import('@/lib/timesheet-entry-shared'),
]);

loadWorkspaceEnv();

const norm = (value: unknown) => String(value || '').trim().toUpperCase();
const matchesSupervisor = (header: { supervisorId?: string; supervisorName?: string }) => {
  const id = norm(header.supervisorId);
  const name = norm(header.supervisorName);
  return id.includes(supervisor) || name.includes(supervisor) || supervisor.includes(id);
};

const { headers, lines } = await readTimesheetData();
const header = headers.find(
  (item) =>
    item.timesheetDate === date &&
    matchesSupervisor(item) &&
    norm(item.workCenterName) === norm(workCenter),
);

if (!header) {
  const candidates = headers
    .filter((item) => item.timesheetDate === date)
    .map((item) => `${item.supervisorId} | ${item.supervisorName} | ${item.workCenterName} | ${item.status}`);
  console.error(`No timesheet header found for ${date} / ${supervisor} / ${workCenter}.`);
  if (candidates.length) {
    console.error('Headers on that date:');
    for (const row of candidates) console.error(`  - ${row}`);
  }
  process.exit(1);
}

const holidayDates: string[] = [];
const dayContext = { date, holidayDates };
const dayRules = timesheetDayRulesForDate(date, holidayDates);
const headerLines = lines.filter((line) => line.headerId === header.id);
const reversedLines = reverseOvertimeBookingOnLines(headerLines, dayContext);

const changes = headerLines
  .map((before, index) => {
    const after = reversedLines[index];
    const beforeOt = overtimeProductiveHours(before.usedHours, dayRules.standardProductiveHours);
    const afterOt = overtimeProductiveHours(after.usedHours, dayRules.standardProductiveHours);
    if (!lineHasOvertimeBooking(before, dayRules.standardProductiveHours) && beforeOt <= afterOt + 0.001) return null;
    return {
      employee: before.employeeName,
      employeeNo: before.employeeNo,
      beforeUsed: before.usedHours,
      afterUsed: after.usedHours,
      beforeOt,
      afterOt,
      projectsBefore: before.projectAllocations.map((item) => `${item.projectCode}:${item.hours}${item.remarks ? ` (${item.remarks})` : ''}`).join(', ') || '(none)',
      projectsAfter: after.projectAllocations.map((item) => `${item.projectCode}:${item.hours}`).join(', ') || '(none)',
    };
  })
  .filter(Boolean);

console.log(`Timesheet: ${header.id}`);
console.log(`Date: ${date} | Supervisor: ${header.supervisorName} (${header.supervisorId}) | Work centre: ${header.workCenterName} | Status: ${header.status}`);
console.log(`Lines with overtime to reverse: ${changes.length}`);

for (const change of changes) {
  console.log(
    `  ${change.employee} (${change.employeeNo}): used ${change.beforeUsed}h -> ${change.afterUsed}h, OT ${change.beforeOt}h -> ${change.afterOt}h`,
  );
  console.log(`    projects: ${change.projectsBefore} -> ${change.projectsAfter}`);
}

if (!changes.length) {
  console.log('No overtime bookings found to reverse on this timesheet.');
  process.exit(0);
}

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to save changes.');
  process.exit(0);
}

const reversalEvent = {
  stage: 'Supervisor' as const,
  decision: 'Overtime Reversed',
  by: actor,
  actedAt: new Date().toISOString(),
  comment: `Reversed mistaken overtime booking for ${changes.length} employee(s) so hours can be rebooked.`,
};

const updatedHeader = {
  ...header,
  workflowHistory: [...(header.workflowHistory || []), reversalEvent],
};

await writeTimesheetHeaderLines(updatedHeader, reversedLines);
invalidateTimesheetDataCache();
invalidateTimesheetApprovalWorkspaceCache();

if (isTimesheetPayrollReadyStatus(header.status)) {
  await refreshTimesheetPayrollUpdatesForHeaders([header.id], actor);
  console.log('Payroll feed refreshed for this timesheet.');
}

console.log(`Reversed overtime on ${changes.length} line(s). You can rebook from the timesheet overtime bar.`);
