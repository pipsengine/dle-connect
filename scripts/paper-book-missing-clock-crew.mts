/**
 * Paper-book listed C-code employees who were at work but marked Absent
 * because clocks registered late. Does not invent biometric punches.
 *
 * Dry run (default):
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/paper-book-missing-clock-crew.mts
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/paper-book-missing-clock-crew.mts C2171
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/paper-book-missing-clock-crew.mts --apply
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/paper-book-missing-clock-crew.mts --apply C2171
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { isAgegeTimesheetLocation } from '../apps/dashboard/lib/timesheet-agege-blasting';
import { getPayrollPublicHolidayDates } from '../apps/dashboard/lib/nigeria-public-holidays';
import {
  buildPaperAttendanceLine,
  canonicalProjectCode,
  isEditableTimesheetStatus,
  isIdleTimeProjectCode,
  isTimesheetPaidLeaveLine,
  normalizeEmployeeLineKey,
  resolveTimesheetShift,
  timesheetLineHasBookedHours,
} from '../apps/dashboard/lib/timesheet-entry-shared';
import { readTimesheetData, writeTimesheetHeaderLines, type TimesheetHeader, type TimesheetLine } from '../apps/dashboard/lib/timesheet-entry-store';
import { workingDatesInLeaveRange } from '../apps/dashboard/lib/timesheet-leave-sync';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const TODAY = '2026-09-21';
const onlyCode = process.argv.find((arg) => /^[CLP]\d+$/i.test(arg))?.toUpperCase() || '';

type PaperRange = {
  codes: string[];
  names: string;
  from: string;
  to: string;
};

const RANGES: PaperRange[] = [
  { codes: ['C2815', 'C2817', 'C2818'], names: 'Paul Okputu, Fatoyibo Samuel, Peter Odjegba', from: '2026-08-17', to: '2026-09-07' },
  { codes: ['C2757'], names: 'Benjamin Churk', from: '2026-08-17', to: '2026-09-10' },
  { codes: ['C2810'], names: 'Ekwere Akpan', from: '2026-08-17', to: TODAY },
  { codes: ['C2816', 'C2825', 'C2585'], names: 'Gloria Ananu, Akande Ismaila, Emmanuel Aziekwe', from: '2026-08-17', to: '2026-09-15' },
  { codes: ['C2824'], names: 'Muideen Salau', from: '2026-09-20', to: TODAY },
  { codes: ['C2722'], names: 'Sunday Adeniji', from: '2026-08-24', to: '2026-09-15' },
  { codes: ['C2171'], names: 'Steve Eraghare', from: '2026-08-17', to: '2026-09-15' },
  { codes: ['C2827'], names: 'Charles Edigheti Akaka', from: '2026-08-17', to: '2026-09-15' },
];

const compact = (value: unknown) => String(value || '').trim();

const lineKeys = (line: Pick<TimesheetLine, 'employeeId' | 'employeeNo' | 'employeeName'>) => {
  const keys = new Set<string>();
  for (const value of [line.employeeNo, line.employeeId, line.employeeName]) {
    const key = normalizeEmployeeLineKey({ employeeId: value, employeeNo: value });
    if (key) keys.add(key);
  }
  return keys;
};

const matchesCode = (line: TimesheetLine, code: string) => {
  const wanted = normalizeEmployeeLineKey({ employeeId: code, employeeNo: code });
  return Boolean(wanted) && [...lineKeys(line)].some((key) => key === wanted || key.endsWith(wanted) || wanted.endsWith(key));
};

const isDayHeader = (header: TimesheetHeader) => resolveTimesheetShift(header.shiftLabel).kind !== 'Night';

const looksLikeProjectCode = (code?: string | null) => /^DL/i.test(canonicalProjectCode(code));

const linePreference = (line: TimesheetLine, header?: TimesheetHeader) => {
  if (!header) return -1;
  let score = 0;
  if (isEditableTimesheetStatus(header.status)) score += 100;
  if (!timesheetLineHasBookedHours(line)) score += 40;
  if (!compact(line.clockIn)) score += 10;
  if (isAgegeTimesheetLocation(header.locationName)) score += 20;
  return score;
};

const majorityProject = (headerLines: TimesheetLine[], skipLineId?: string) => {
  const hoursByCode = new Map<string, { code: string; name: string; hours: number }>();
  for (const line of headerLines) {
    if (skipLineId && line.id === skipLineId) continue;
    for (const allocation of line.projectAllocations || []) {
      const code = canonicalProjectCode(allocation.projectCode);
      if (!code || isIdleTimeProjectCode(code) || !looksLikeProjectCode(code) || Number(allocation.hours || 0) <= 0) continue;
      const current = hoursByCode.get(code) || { code, name: compact(allocation.projectName) || code, hours: 0 };
      current.hours += Number(allocation.hours || 0);
      if (!current.name || current.name === current.code) current.name = compact(allocation.projectName) || current.name;
      hoursByCode.set(code, current);
    }
  }
  return [...hoursByCode.values()].sort((a, b) => b.hours - a.hours)[0] || null;
};

const main = async () => {
  const holidayDates = await getPayrollPublicHolidayDates();
  const { headers, lines } = await readTimesheetData();
  const headerById = new Map(headers.map((header) => [header.id, header]));
  const reports: Array<Record<string, unknown>> = [];
  const headersToWrite = new Map<string, { header: TimesheetHeader; lines: TimesheetLine[] }>();
  let booked = 0;
  let skipped = 0;

  const ranges = onlyCode
    ? RANGES
      .filter((range) => range.codes.some((code) => code.toUpperCase() === onlyCode))
      .map((range) => ({ ...range, codes: range.codes.filter((code) => code.toUpperCase() === onlyCode) }))
    : RANGES;
  if (onlyCode && !ranges.length) {
    throw new Error(`No paper-book range configured for ${onlyCode}.`);
  }

  for (const range of ranges) {
    const dates = workingDatesInLeaveRange(range.from, range.to, holidayDates);
    for (const code of range.codes) {
      for (const date of dates) {
        const dayHeaders = headers.filter((header) => compact(header.timesheetDate).slice(0, 10) === date && isDayHeader(header));
        const dayLines = lines.filter((line) => {
          const header = headerById.get(line.headerId);
          return header && compact(header.timesheetDate).slice(0, 10) === date && matchesCode(line, code) && isDayHeader(header);
        });
        const existing = dayLines.slice().sort((left, right) => (
          linePreference(right, headerById.get(right.headerId))
          - linePreference(left, headerById.get(left.headerId))
        ))[0];
        const header = existing ? headerById.get(existing.headerId) : dayHeaders[0];
        const base = {
          code,
          names: range.names,
          date,
          headerId: header?.id || null,
          status: header?.status || null,
          supervisor: header?.supervisorName || header?.supervisorId || null,
        };

        if (!existing || !header) {
          skipped += 1;
          reports.push({ ...base, action: 'skipped', reason: 'No day timesheet line for this employee.' });
          continue;
        }
        if (!isEditableTimesheetStatus(header.status)) {
          skipped += 1;
          reports.push({ ...base, action: 'skipped', reason: `timesheet ${compact(header.status)} is not editable` });
          continue;
        }
        if (compact(existing.clockIn)) {
          skipped += 1;
          reports.push({ ...base, action: 'skipped', reason: `clock-in ${compact(existing.clockIn)} present` });
          continue;
        }
        if (isTimesheetPaidLeaveLine(existing)) {
          skipped += 1;
          reports.push({ ...base, action: 'skipped', reason: 'leave hours already booked' });
          continue;
        }
        if (timesheetLineHasBookedHours(existing)) {
          skipped += 1;
          reports.push({ ...base, action: 'skipped', reason: `already booked ${existing.usedHours}h` });
          continue;
        }

        const headerLines = lines.filter((line) => line.headerId === header.id);
        const project = majorityProject(headerLines, existing.id);
        const fallbackCode = looksLikeProjectCode(header.workCenterName) ? canonicalProjectCode(header.workCenterName) : '';
        const projectCode = project?.code || fallbackCode;
        if (!projectCode) {
          skipped += 1;
          reports.push({ ...base, action: 'skipped', reason: 'No project on the sheet to book against.' });
          continue;
        }

        const nextLine = {
          ...buildPaperAttendanceLine({
            headerId: header.id,
            employeeId: existing.employeeId || code,
            employeeNo: existing.employeeNo || code,
            employeeName: existing.employeeName,
            projectCode,
            projectName: project?.name || projectCode,
          }),
          id: existing.id,
          workCenterName: existing.workCenterName || header.workCenterName || projectCode,
        };
        const index = lines.findIndex((item) => item.id === existing.id);
        if (index >= 0) lines[index] = nextLine;
        const bucket = headersToWrite.get(header.id) || { header, lines: lines.filter((item) => item.headerId === header.id) };
        bucket.lines = bucket.lines.map((item) => item.id === existing.id ? nextLine : item);
        headersToWrite.set(header.id, bucket);
        booked += 1;
        reports.push({ ...base, action: APPLY ? 'booked' : 'would-book', projectCode, hours: 8 });
      }
    }
  }

  if (APPLY) {
    for (const bucket of headersToWrite.values()) {
      await writeTimesheetHeaderLines(bucket.header, bucket.lines);
    }
  }

  console.log(JSON.stringify({
    apply: APPLY,
    booked,
    skipped,
    headers: headersToWrite.size,
    reports,
  }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
