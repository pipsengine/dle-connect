/**
 * September 2026 timesheet corrections from stored rows only.
 * Dry run by default. Apply with --apply.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/correct-september-timesheet-attendance.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/correct-september-timesheet-attendance.mts --apply
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { readTimesheetData, writeTimesheetHeaderLines, type TimesheetHeader, type TimesheetLine } from '../apps/dashboard/lib/timesheet-entry-store';
import {
  isInactiveTimesheetEmployeeStatus,
  isManualOffshoreLine,
  isOffshoreLocationName,
  isOffshoreWorkCenterName,
  stripMisplacedYardOffshoreStamp,
  timesheetLineHasBookedHours,
} from '../apps/dashboard/lib/timesheet-entry-shared';
import { mobilizationCoversDate, readTimesheetMobilizations } from '../apps/dashboard/lib/timesheet-mobilization-store';
import { supervisorCodesMatch } from '../apps/dashboard/lib/timesheet-agege-blasting';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const FROM = '2026-08-16';
const TO = '2026-09-15';

const codeKey = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const lineCodes = (line: TimesheetLine) => [line.employeeNo, line.employeeId].map(codeKey).filter(Boolean);

const samePerson = (left: TimesheetLine, right: TimesheetLine) =>
  lineCodes(left).some((code) => lineCodes(right).some((other) => supervisorCodesMatch(code, other) || code === other));

const emptyRosterLine = (line: TimesheetLine) =>
  !String(line.clockIn || '').trim()
  && Number(line.attendanceDuration || 0) <= 0.001
  && !timesheetLineHasBookedHours(line)
  && Number(line.offshoreAllowanceHours || 0) <= 0.001;

const offshoreHeader = (header: TimesheetHeader) =>
  isOffshoreLocationName(header.locationName) || isOffshoreWorkCenterName(header.workCenterName);

const main = async () => {
  const [{ headers, lines }, employees, mobilizations] = await Promise.all([
    readTimesheetData(),
    readPayrollEmployees().then((source) => source.employees),
    readTimesheetMobilizations(),
  ]);
  const headerById = new Map(headers.map((header) => [header.id, header]));
  const periodHeaders = headers.filter((header) => header.timesheetDate >= FROM && header.timesheetDate <= TO);
  const periodHeaderIds = new Set(periodHeaders.map((header) => header.id));
  const periodLines = lines.filter((line) => periodHeaderIds.has(line.headerId));
  const employeesByCode = new Map<string, (typeof employees)[number]>();
  for (const employee of employees) {
    for (const value of [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId]) {
      const key = codeKey(value);
      if (key) employeesByCode.set(key, employee);
    }
  }
  const employeeForLine = (line: TimesheetLine) => {
    for (const code of lineCodes(line)) {
      const employee = employeesByCode.get(code);
      if (employee) return employee;
    }
    return null;
  };
  const mobilizedOnDate = (line: TimesheetLine, date: string) =>
    mobilizations.some((item) =>
      lineCodes(line).some((code) => supervisorCodesMatch(item.employeeCode, code) || codeKey(item.employeeCode) === code)
      && mobilizationCoversDate(item, date),
    );

  const dropIds = new Set<string>();
  const stripIds = new Set<string>();
  const inactiveWithHours: Array<Record<string, unknown>> = [];
  const offshoreOnYardOnly: Array<Record<string, unknown>> = [];
  const offshoreGaps: Array<Record<string, unknown>> = [];

  for (const line of periodLines) {
    const header = headerById.get(line.headerId);
    if (!header) continue;
    const employee = employeeForLine(line);
    const inactive = !employee || isInactiveTimesheetEmployeeStatus(employee.status);
    if (inactive && emptyRosterLine(line)) dropIds.add(line.id);
    if (inactive && !emptyRosterLine(line) && (timesheetLineHasBookedHours(line) || String(line.clockIn || '').trim() || Number(line.attendanceDuration || 0) > 0)) {
      inactiveWithHours.push({
        code: line.employeeNo || line.employeeId,
        name: line.employeeName,
        date: header.timesheetDate,
        status: employee?.status || 'Missing from directory',
        contractEnd: employee?.contractEndDate || '',
        usedHours: line.usedHours,
        location: header.locationName,
      });
    }
  }

  const bookedByPersonDate = new Map<string, TimesheetLine[]>();
  for (const line of periodLines) {
    const header = headerById.get(line.headerId);
    if (!header) continue;
    const code = lineCodes(line)[0];
    if (!code) continue;
    const key = `${code}|${header.timesheetDate}`;
    const group = bookedByPersonDate.get(key) || [];
    group.push(line);
    bookedByPersonDate.set(key, group);
  }
  for (const group of bookedByPersonDate.values()) {
    if (group.length < 2) continue;
    const withHours = group.filter((line) => timesheetLineHasBookedHours(line));
    if (!withHours.length) continue;
    for (const line of group) {
      if (withHours.includes(line)) continue;
      if (timesheetLineHasBookedHours(line)) continue;
      if (Number(line.offshoreAllowanceHours || 0) > 0) continue;
      dropIds.add(line.id);
    }
  }

  for (const line of periodLines) {
    const header = headerById.get(line.headerId);
    if (!header || offshoreHeader(header) || dropIds.has(line.id)) continue;
    if (!isManualOffshoreLine(line) && Number(line.offshoreAllowanceHours || 0) <= 0.001) continue;
    const mobilized = mobilizedOnDate(line, header.timesheetDate);
    const offshoreTwin = periodLines.some((other) => {
      if (other.id === line.id) return false;
      const otherHeader = headerById.get(other.headerId);
      if (!otherHeader || otherHeader.timesheetDate !== header.timesheetDate || !offshoreHeader(otherHeader)) return false;
      return samePerson(line, other);
    });
    if (!mobilized || offshoreTwin) stripIds.add(line.id);
    else {
      offshoreOnYardOnly.push({
        code: line.employeeNo || line.employeeId,
        name: line.employeeName,
        date: header.timesheetDate,
        location: header.locationName,
        usedHours: line.usedHours,
        allowance: line.offshoreAllowanceHours || 0,
      });
    }
  }

  const offshoreLinesByCodeDate = new Set<string>();
  for (const line of periodLines) {
    const header = headerById.get(line.headerId);
    if (!header || !offshoreHeader(header) || !timesheetLineHasBookedHours(line)) continue;
    for (const code of lineCodes(line)) offshoreLinesByCodeDate.add(`${code}|${header.timesheetDate}`);
  }
  for (const item of mobilizations) {
    if (item.status === 'Cancelled') continue;
    const start = item.startDate < FROM ? FROM : item.startDate;
    const end = !item.endDate || item.endDate > TO ? TO : item.endDate;
    if (end < FROM || start > TO) continue;
    const missing: string[] = [];
    const cursor = new Date(`${start}T12:00:00Z`);
    const last = new Date(`${end}T12:00:00Z`);
    while (cursor <= last) {
      const date = cursor.toISOString().slice(0, 10);
      const code = codeKey(item.employeeCode);
      if (mobilizationCoversDate(item, date) && !offshoreLinesByCodeDate.has(`${code}|${date}`)) missing.push(date);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (missing.length) {
      offshoreGaps.push({
        code: item.employeeCode,
        name: item.employeeName,
        project: item.projectCode,
        status: item.status,
        missingDays: missing.length,
        dates: missing.join(', '),
      });
    }
  }

  const summary = {
    apply: APPLY,
    dropEmptyRows: dropIds.size,
    stripYardOffshore: stripIds.size,
    inactiveWithHoursKept: inactiveWithHours.length,
    offshorePayLeftOnYard: offshoreOnYardOnly.length,
    offshoreGapPeople: offshoreGaps.length,
  };
  console.log(JSON.stringify({ summary, inactiveWithHours, offshoreOnYardOnly, offshoreGaps }, null, 2));

  if (!APPLY) return;

  const touchedHeaders = new Set<string>();
  for (const line of periodLines) {
    if (dropIds.has(line.id) || stripIds.has(line.id)) touchedHeaders.add(line.headerId);
  }
  for (const headerId of touchedHeaders) {
    const header = headerById.get(headerId);
    if (!header) continue;
    const next = lines
      .filter((line) => line.headerId === headerId && !dropIds.has(line.id))
      .map((line) => (stripIds.has(line.id) ? stripMisplacedYardOffshoreStamp(line) : line));
    await writeTimesheetHeaderLines(header, next);
  }
  console.log(JSON.stringify({ writtenHeaders: touchedHeaders.size }));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
