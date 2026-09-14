/**
 * Take C2422 (Udeh Anthony David) off Akinsanya sheets when he is already
 * booked on Momoh Fitting for the same day.
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-udeh-momoh-timesheet-clash.mts
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-udeh-momoh-timesheet-clash.mts --apply
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { extractSupervisorEmployeeCode, supervisorCodesMatch, timesheetEmployeeRecordsMatch } from '../apps/dashboard/lib/timesheet-agege-blasting';
import {
  invalidateTimesheetApprovalWorkspaceCache,
  invalidateTimesheetDataCache,
  isTimesheetPayrollReadyStatus,
  readTimesheetData,
  writeTimesheetHeaderLines,
} from '../apps/dashboard/lib/timesheet-entry-store';
import { timesheetHeaderShiftKind, timesheetLineHasProductiveHours } from '../apps/dashboard/lib/timesheet-entry-shared';

const EMPLOYEE = { employeeNo: 'C2422', employeeId: 'C2422', employeeName: 'UDEH ANTHONY DAVID' };
const HOME_SUPERVISOR = 'C1882';

const main = async () => {
  loadWorkspaceEnv();
  const apply = process.argv.includes('--apply');
  const { headers, lines } = await readTimesheetData();

  const employeeLines = lines.filter((line) => timesheetEmployeeRecordsMatch(line, EMPLOYEE));
  const byDate = new Map<string, typeof employeeLines>();
  for (const line of employeeLines) {
    const header = headers.find((item) => item.id === line.headerId);
    if (!header) continue;
    const rows = byDate.get(header.timesheetDate) || [];
    rows.push(line);
    byDate.set(header.timesheetDate, rows);
  }

  const planned: Array<{
    date: string;
    home: string;
    removeFrom: string;
    status: string;
    hours: number;
    headerId: string;
    lineId: string;
  }> = [];
  const writes = new Map<string, { header: (typeof headers)[number]; lines: typeof lines }>();

  for (const [date, dateLines] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const homeLine = dateLines.find((line) => {
      const header = headers.find((item) => item.id === line.headerId);
      return Boolean(
        header
        && supervisorCodesMatch(extractSupervisorEmployeeCode(header.supervisorId) || header.supervisorId, HOME_SUPERVISOR)
        && /fitting/i.test(header.workCenterName || ''),
      );
    });
    if (!homeLine) continue;
    const homeHeader = headers.find((item) => item.id === homeLine.headerId);
    if (!homeHeader) continue;
    const homeKind = timesheetHeaderShiftKind(homeHeader.shiftLabel);

    for (const line of dateLines) {
      if (line.id === homeLine.id) continue;
      const header = headers.find((item) => item.id === line.headerId);
      if (!header) continue;
      if (timesheetHeaderShiftKind(header.shiftLabel) !== homeKind) continue;
      if (isTimesheetPayrollReadyStatus(header.status)) continue;
      const hasHours = timesheetLineHasProductiveHours(line) || Number(line.usedHours || 0) > 0.001 || Number(line.totalHours || 0) > 0.001;
      if (!hasHours && !String(line.clockIn || '').trim()) continue;

      planned.push({
        date,
        home: `${homeHeader.supervisorName} / ${homeHeader.workCenterName} (${homeHeader.status})`,
        removeFrom: `${header.supervisorName} / ${header.workCenterName} (${header.status})`,
        status: header.status,
        hours: Number(line.usedHours || 0),
        headerId: header.id,
        lineId: line.id,
      });

      const current = writes.get(header.id) || {
        header,
        lines: lines.filter((item) => item.headerId === header.id),
      };
      current.lines = current.lines.filter((item) => item.id !== line.id);
      writes.set(header.id, current);
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY RUN',
    employee: 'C2422 UDEH ANTHONY DAVID',
    homeSupervisor: 'C1882 MOMOH MOHAMMED / Fitting',
    changes: planned.length,
    planned,
  }, null, 2));

  if (!apply) {
    console.log('Re-run with --apply to remove C2422 from the leaked sheets.');
    return;
  }

  for (const update of writes.values()) {
    await writeTimesheetHeaderLines(update.header, update.lines);
  }
  invalidateTimesheetDataCache();
  invalidateTimesheetApprovalWorkspaceCache();
  console.log(`Removed C2422 from ${writes.size} timesheet(s).`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
