/**
 * Move C2225 Abel Daniel's 9 Sep hours off Karonwi Blasting auto-book
 * onto Karonwi Mixed, where the supervisor is actually booking.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-c2225-sep9-karonwi.mts --apply
 */
import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  DAILY_BREAK_HOURS,
  DEFAULT_BREAK_IDLE_REASON_ID,
  DEFAULT_BREAK_IDLE_REASON_NAME,
  STANDARD_TIMESHEET_HOURS,
  canonicalProjectCode,
  isIdleTimeProjectCode,
  reconcileTimesheetLineHours,
  timesheetLineHasProductiveHours,
} from '../apps/dashboard/lib/timesheet-entry-shared';
import { readTimesheetData, writeTimesheetHeaderLines, type TimesheetLine } from '../apps/dashboard/lib/timesheet-entry-store';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const DATE = '2026-09-09';
const CODE = 'C2225';
const MIXED_ID = 'hdr-2026-09-09-p0013---mr-samuel-karonwi-cutting-day';
const BLASTING_ID = 'hdr-2026-09-09-p0013---mr-samuel-karonwi-blasting-day';

const compact = (value: unknown) => String(value || '').trim();
const looksLikeProjectCode = (code?: string | null) => /^DL/i.test(canonicalProjectCode(code));
const matchesAbel = (line: TimesheetLine) => {
  const hay = `${line.employeeId || ''} ${line.employeeNo || ''}`.toUpperCase();
  return hay.includes(CODE);
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

const bookPresent = (line: TimesheetLine, projectCode: string, projectName: string): TimesheetLine =>
  reconcileTimesheetLineHours({
    ...line,
    projectAllocations: [{
      projectId: projectCode,
      projectCode,
      projectName,
      hours: STANDARD_TIMESHEET_HOURS,
      remarks: null,
    }],
    idleAllocations: [{
      reasonId: DEFAULT_BREAK_IDLE_REASON_ID,
      reasonName: DEFAULT_BREAK_IDLE_REASON_NAME,
      hours: DAILY_BREAK_HOURS,
      remarks: 'Break Time',
    }],
    variance: 0,
    validationStatus: 'Valid',
    validationMessage: null,
  });

const clearProductive = (line: TimesheetLine): TimesheetLine =>
  reconcileTimesheetLineHours({
    ...line,
    projectAllocations: [],
    idleAllocations: [{
      reasonId: DEFAULT_BREAK_IDLE_REASON_ID,
      reasonName: DEFAULT_BREAK_IDLE_REASON_NAME,
      hours: DAILY_BREAK_HOURS,
      remarks: 'Break Time',
    }],
    variance: 0,
    validationStatus: 'Incomplete',
    validationMessage: 'Awaiting time allocation.',
  });

const main = async () => {
  const { headers, lines } = await readTimesheetData();
  const mixedHeader = headers.find((header) => header.id === MIXED_ID);
  const blastingHeader = headers.find((header) => header.id === BLASTING_ID);
  if (!mixedHeader || !blastingHeader) {
    throw new Error('Karonwi Mixed or Blasting header for 2026-09-09 was not found.');
  }

  const mixedLines = lines.filter((line) => line.headerId === MIXED_ID);
  const blastingLines = lines.filter((line) => line.headerId === BLASTING_ID);
  const mixedAbel = mixedLines.find(matchesAbel);
  const blastingAbel = blastingLines.find(matchesAbel);
  if (!mixedAbel) throw new Error('Abel is not on Karonwi Mixed for 2026-09-09.');

  const project = majorityProject(mixedLines, mixedAbel.id)
    || majorityProject(blastingLines, blastingAbel?.id);
  if (!project) throw new Error('No project hours on Karonwi Mixed/Blasting to copy for Abel.');

  const nextMixed = mixedLines.map((line) => (
    matchesAbel(line) ? bookPresent(line, project.code, project.name) : line
  ));
  const nextBlasting = blastingAbel && timesheetLineHasProductiveHours(blastingAbel)
    ? blastingLines.map((line) => (matchesAbel(line) ? clearProductive(line) : line))
    : blastingLines;

  if (APPLY) {
    await writeTimesheetHeaderLines(mixedHeader, nextMixed);
    if (blastingAbel && timesheetLineHasProductiveHours(blastingAbel)) {
      await writeTimesheetHeaderLines(blastingHeader, nextBlasting);
    }
  }

  console.log(JSON.stringify({
    apply: APPLY,
    date: DATE,
    project: project.code,
    mixed: {
      headerId: MIXED_ID,
      from: { used: mixedAbel.usedHours, idle: mixedAbel.idleHours, total: mixedAbel.totalHours },
      to: { used: STANDARD_TIMESHEET_HOURS, idle: DAILY_BREAK_HOURS, total: STANDARD_TIMESHEET_HOURS + DAILY_BREAK_HOURS },
    },
    blasting: blastingAbel ? {
      headerId: BLASTING_ID,
      from: {
        used: blastingAbel.usedHours,
        projects: (blastingAbel.projectAllocations || [])
          .filter((item) => Number(item.hours || 0) > 0)
          .map((item) => `${item.projectCode}:${item.hours}`),
        remarks: blastingAbel.projectAllocations?.[0]?.remarks || null,
      },
      to: { used: 0, idle: DAILY_BREAK_HOURS, total: DAILY_BREAK_HOURS },
    } : null,
  }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
