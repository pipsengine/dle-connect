/**
 * Backfill day-rate leave from the Aug–Sept 2026 Excel list:
 *   - last leave day = day before resumption
 *   - charge weekdays only (skip weekends and public holidays)
 *   - halt a row when DAYS APPROVED does not match that count
 *   - create/complete as Approved (including Line Manager Review)
 *   - book 8h IDLE TIME leave on supervisor day sheets without overwriting clocks/project hours
 *
 * Dry run (default):
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/backfill-dayrate-leave-from-excel.mts
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/backfill-dayrate-leave-from-excel.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import xlsx from 'xlsx';

import { getDleEnterpriseDbPool, loadWorkspaceEnv, type DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';
import { auditLeaveAction } from '../apps/dashboard/lib/leave-management-store';
import {
  applyLeaveBalanceImpact,
  leaveWorkflowFor,
  persistEssLeaveRequest,
  readAllEssRequests,
  writeAllEssRequests,
  type EssLeaveRequest,
} from '../apps/dashboard/lib/leave-workflow-service';
import { getPayrollPublicHolidayDates, resolveNigeriaPublicHolidays } from '../apps/dashboard/lib/nigeria-public-holidays';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { addIsoDateDays } from '../apps/dashboard/lib/timesheet-entry-shared';
import { readTimesheetData } from '../apps/dashboard/lib/timesheet-entry-store';
import { syncCCodeLeaveToTimesheet, workingDatesInLeaveRange } from '../apps/dashboard/lib/timesheet-leave-sync';

const ACTOR = 'HRIS Leave Backfill';
const EXCEL_PATH = path.resolve(
  'backups',
  'Dayrate Payment Schedule',
  "List Of Dayrates Employees On Leave_Aug-Sept '26.xlsx",
);
const CLOSED_STATUSES = new Set(['Cancelled', 'Rejected', 'Terminated', 'Withdrawn']);
const APPROVED_STATUSES = new Set(['Approved', 'Completed', 'Closed']);
const PENDING_STATUSES = new Set(['Draft', 'Submitted', 'Under Review', 'Line Manager Review', 'HR Review', 'Finance Review']);

type ExcelLeaveRow = {
  rowNumber: number;
  employeeCode: string;
  employeeName: string;
  leaveYear: string;
  department: string;
  location: string;
  leaveTypeRaw: string;
  daysApproved: number;
  startDate: string;
  resumptionDate: string;
};

type ExistingLeaveRow = {
  Id: string;
  EmployeeId: string;
  LeaveType: string;
  StartDate: Date;
  EndDate: Date;
  Days: number;
  StatusName: string;
};

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env'), path.resolve('apps/dashboard/.env.local')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
  loadWorkspaceEnv();
};

const compact = (value: unknown) => String(value || '').trim();

const cell = (row: Record<string, unknown>, ...names: string[]) => {
  const keys = Object.keys(row);
  for (const name of names) {
    const wanted = name.trim().toUpperCase();
    const hit = keys.find((key) => key.trim().toUpperCase() === wanted);
    if (hit) return row[hit];
  }
  return '';
};

const parseIsoDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const text = compact(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const fromUtc = new Date(`${text} UTC`);
  if (!Number.isNaN(fromUtc.getTime())) {
    return `${fromUtc.getUTCFullYear()}-${String(fromUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(fromUtc.getUTCDate()).padStart(2, '0')}`;
  }
  return '';
};

const isoFromSql = (value: Date | string | null | undefined) => {
  if (!value) return '';
  if (value instanceof Date) return parseIsoDate(value);
  return compact(value).slice(0, 10);
};

const mapLeaveType = (raw: string) => {
  const text = compact(raw);
  const lower = text.toLowerCase();
  if (!lower) return 'Annual Leave';
  if (lower === 'annual' || lower === 'annual leave') return 'Annual Leave';
  if (lower.startsWith('compassionate')) return 'Compassionate Leave';
  if (lower.startsWith('casual')) return 'Casual Leave';
  return /leave/i.test(text) ? text : `${text} Leave`;
};

const readExcelRows = (): ExcelLeaveRow[] => {
  if (!fs.existsSync(EXCEL_PATH)) throw new Error(`Leave workbook not found: ${EXCEL_PATH}`);
  const workbook = xlsx.readFile(EXCEL_PATH, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    employeeCode: compact(cell(row, 'EMP. CODE', 'EMP CODE', 'EMPLOYEE CODE')).toUpperCase(),
    employeeName: compact(cell(row, 'EMPLOYEE NAME')),
    leaveYear: compact(cell(row, 'LEAVE YEAR')),
    department: compact(cell(row, 'DEPARTMENT')),
    location: compact(cell(row, 'LOCATION')),
    leaveTypeRaw: compact(cell(row, 'LEAVE TYPE')),
    daysApproved: Number(cell(row, 'DAYS APPROVED') || 0),
    startDate: parseIsoDate(cell(row, 'LEAVE START DATE', 'LEAVE START DATE ')),
    resumptionDate: parseIsoDate(cell(row, 'RESUMPTION DATE', 'RESUMPTION DATE ')),
  })).filter((row) => row.employeeCode && row.startDate && row.resumptionDate);
};

const findEmployee = (employees: DleEmployeeDirectoryRow[], code: string, name: string) => {
  const wanted = compact(code).toUpperCase();
  const byCode = employees.find((employee) =>
    compact(employee.employeeCode).toUpperCase() === wanted
    || compact(employee.employeeId).toUpperCase() === wanted,
  );
  if (byCode) return byCode;
  const wantedName = compact(name).toUpperCase().replace(/\s+/g, ' ');
  if (!wantedName) return null;
  const named = employees.filter((employee) => compact(employee.fullName).toUpperCase().replace(/\s+/g, ' ') === wantedName);
  return named.length === 1 ? named[0] : null;
};

const employeeLookupKeys = (employee: DleEmployeeDirectoryRow, fallbackCode: string) =>
  [...new Set([
    compact(employee.employeeCode),
    compact(employee.employeeId),
    compact(fallbackCode),
  ].map((value) => value.toUpperCase()).filter(Boolean))];

const sameLeaveType = (left: string, right: string) =>
  mapLeaveType(left).toLowerCase() === mapLeaveType(right).toLowerCase();

const datesOverlap = (startA: string, endA: string, startB: string, endB: string) =>
  Boolean(startA && endA && startB && endB && startA <= endB && startB <= endA);

const matchExistingLeave = (
  existing: ExistingLeaveRow[],
  keys: string[],
  leaveType: string,
  startDate: string,
  lastLeaveDay: string,
  resumptionDate: string,
) => {
  const mine = existing.filter((row) => keys.includes(compact(row.EmployeeId).toUpperCase()));
  const exact = mine.find((row) =>
    sameLeaveType(row.LeaveType, leaveType)
    && isoFromSql(row.StartDate) === startDate
    && (isoFromSql(row.EndDate) === lastLeaveDay || isoFromSql(row.EndDate) === resumptionDate),
  );
  if (exact) return { row: exact, kind: 'same-dates' as const };
  const overlapping = mine.filter((row) =>
    sameLeaveType(row.LeaveType, leaveType)
    && !CLOSED_STATUSES.has(compact(row.StatusName))
    && datesOverlap(isoFromSql(row.StartDate), isoFromSql(row.EndDate), startDate, lastLeaveDay),
  );
  if (overlapping.length === 1 && isoFromSql(overlapping[0].StartDate) === startDate) {
    return { row: overlapping[0], kind: 'same-start' as const };
  }
  if (overlapping.length) return { row: overlapping[0], kind: 'conflict' as const, all: overlapping };
  return null;
};

const buildApprovedRequest = (input: {
  id: string;
  employee: DleEmployeeDirectoryRow;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  selectedDates: string[];
  excludedHolidays: Array<{ date: string; label: string }>;
  existing?: EssLeaveRequest | null;
}): EssLeaveRequest => {
  const now = new Date().toISOString();
  const employeeId = compact(input.employee.employeeCode) || compact(input.employee.employeeId);
  const previous = input.existing;
  return {
    id: input.id,
    employeeId,
    category: 'Leave Application',
    title: `${input.leaveType} — ${input.employee.fullName}`,
    status: 'Approved',
    priority: previous?.priority || 'Normal',
    submittedAt: previous?.submittedAt || now,
    updatedAt: now,
    approvers: previous?.approvers?.length ? previous.approvers : ['Line Manager / Lead / Supervisor', 'HR Manager / Head'],
    comments: [
      ...(previous?.comments || []),
      {
        at: now,
        actor: ACTOR,
        comment: `Backfilled from day-rate leave list Aug–Sept 2026. Completed as Approved for ${input.days} weekday(s) ${input.startDate} to ${input.endDate}.`,
      },
    ],
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    selectedDates: input.selectedDates,
    excludedHolidays: input.excludedHolidays,
    days: input.days,
    reason: previous?.reason || 'Backfilled from day-rate employees-on-leave workbook.',
    relieverEmployeeId: previous?.relieverEmployeeId,
    relieverName: previous?.relieverName,
    lineManagerEmployeeId: previous?.lineManagerEmployeeId,
    lineManagerName: previous?.lineManagerName || input.employee.managerName || undefined,
    handover: previous?.handover,
    attachmentNames: previous?.attachmentNames,
    workflow: leaveWorkflowFor(
      input.employee,
      previous?.relieverName || '',
      'Approved',
      now,
      previous?.lineManagerName || input.employee.managerName || undefined,
    ),
  };
};

const forceApproveLeaveRow = async (pool: sql.ConnectionPool, request: EssLeaveRequest) => {
  await pool.request()
    .input('Id', sql.NVarChar(120), request.id)
    .input('LeaveType', sql.NVarChar(120), request.leaveType || 'Annual Leave')
    .input('StartDate', sql.Date, request.startDate)
    .input('EndDate', sql.Date, request.endDate)
    .input('Days', sql.Decimal(9, 2), Number(request.days || 0))
    .input('StatusName', sql.NVarChar(40), 'Approved')
    .input('WorkflowStage', sql.NVarChar(40), 'Final Approval')
    .input('ApprovalStatus', sql.NVarChar(60), 'Approved')
    .input('CommentsJson', sql.NVarChar(sql.MAX), JSON.stringify(request.comments || []))
    .input('WorkflowJson', sql.NVarChar(sql.MAX), JSON.stringify(request.workflow || []))
    .query(`
UPDATE [hris].[LeaveApplications]
SET [LeaveType]=@LeaveType,
    [StartDate]=@StartDate,
    [EndDate]=@EndDate,
    [Days]=@Days,
    [StatusName]=@StatusName,
    [WorkflowStage]=@WorkflowStage,
    [ApprovalStatus]=@ApprovalStatus,
    [CommentsJson]=@CommentsJson,
    [WorkflowJson]=@WorkflowJson,
    [UpdatedAt]=SYSUTCDATETIME()
WHERE [Id]=@Id;`);
};

const upsertEssJson = async (request: EssLeaveRequest) => {
  const requests = await readAllEssRequests();
  const next = requests.some((item) => item.id === request.id)
    ? requests.map((item) => item.id === request.id ? request : item)
    : [...requests, request];
  await writeAllEssRequests(next);
};

const main = async () => {
  loadEnvFiles();
  process.env.DLE_ENTERPRISE_DB_CONNECTION_TIMEOUT_MS = '60000';
  const apply = process.argv.includes('--apply');
  const excelRows = readExcelRows();
  const holidayDates = await getPayrollPublicHolidayDates();
  const holidayFeed = await resolveNigeriaPublicHolidays().catch(() => ({ holidays: [] as Array<{ date: string; label: string }> }));
  const holidayLabel = (date: string) => holidayFeed.holidays.find((item) => item.date === date)?.label || 'Public holiday';
  const dayPreview = excelRows.map((row) => {
    const lastLeaveDay = addIsoDateDays(row.resumptionDate, -1);
    const chargeableDates = lastLeaveDay >= row.startDate
      ? workingDatesInLeaveRange(row.startDate, lastLeaveDay, holidayDates)
      : [];
    const weekdaysIncludingHoliday = lastLeaveDay >= row.startDate
      ? workingDatesInLeaveRange(row.startDate, lastLeaveDay, [])
      : [];
    const holidaysInRange = weekdaysIncludingHoliday.filter((date) => holidayDates.includes(date));
    const ok = chargeableDates.length === row.daysApproved
      || (weekdaysIncludingHoliday.length === row.daysApproved && holidaysInRange.length > 0);
    return {
      code: row.employeeCode,
      name: row.employeeName,
      type: mapLeaveType(row.leaveTypeRaw),
      start: row.startDate,
      last: lastLeaveDay,
      resume: row.resumptionDate,
      approved: row.daysApproved,
      weekdaysExclPh: chargeableDates.length,
      weekdaysInclPh: weekdaysIncludingHoliday.length,
      holidays: holidaysInRange,
      ok,
    };
  });
  console.log(JSON.stringify({
    stage: 'day-count-preview',
    rows: dayPreview.length,
    matching: dayPreview.filter((item) => item.ok).length,
    stopped: dayPreview.filter((item) => !item.ok),
    ready: dayPreview.filter((item) => item.ok).map((item) => `${item.code} ${item.name} ${item.approved}d ${item.start}..${item.last}`),
    publicHolidayRows: dayPreview.filter((item) => item.holidays.length && item.ok && item.weekdaysExclPh !== item.approved),
  }, null, 2));

  const { employees } = await readPayrollEmployees();
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not available.');

  const existingResult = await pool.request().query(`
SELECT [Id],[EmployeeId],[LeaveType],[StartDate],[EndDate],[Days],[StatusName]
FROM [hris].[LeaveApplications]
WHERE [Id] NOT LIKE N'sage-leave-tx-%';`);
  const existingLeaves = (existingResult.recordset || []) as ExistingLeaveRow[];
  const essRequests = await readAllEssRequests().catch(() => [] as EssLeaveRequest[]);
  const timesheetCache = apply ? await readTimesheetData({ softFail: true }) : null;

  const reports: Array<Record<string, unknown>> = [];
  let applied = 0;
  let skipped = 0;

  for (const row of excelRows) {
    const lastLeaveDay = addIsoDateDays(row.resumptionDate, -1);
    const leaveType = mapLeaveType(row.leaveTypeRaw);
    const chargeableDates = lastLeaveDay >= row.startDate
      ? workingDatesInLeaveRange(row.startDate, lastLeaveDay, holidayDates)
      : [];
    const weekdaysIncludingHoliday = lastLeaveDay >= row.startDate
      ? workingDatesInLeaveRange(row.startDate, lastLeaveDay, [])
      : [];
    const holidaysInRange = weekdaysIncludingHoliday.filter((date) => holidayDates.includes(date));
    const matchesExcludingHoliday = chargeableDates.length === row.daysApproved;
    const matchesIncludingHoliday = weekdaysIncludingHoliday.length === row.daysApproved
      && holidaysInRange.length > 0
      && weekdaysIncludingHoliday.length - chargeableDates.length === holidaysInRange.length;
    const selectedDates = matchesIncludingHoliday ? weekdaysIncludingHoliday : chargeableDates;
    const timesheetDates = chargeableDates;
    const employee = findEmployee(employees, row.employeeCode, row.employeeName);
    const base = {
      row: row.rowNumber,
      code: row.employeeCode,
      name: employee?.fullName || row.employeeName,
      leaveType,
      startDate: row.startDate,
      lastLeaveDay,
      resumptionDate: row.resumptionDate,
      daysApproved: row.daysApproved,
      chargeableDays: selectedDates.length,
      chargeableDates: selectedDates,
      timesheetDates,
      holidaysSkipped: holidaysInRange.map((date) => `${date} ${holidayLabel(date)}`),
    };

    if (!employee) {
      skipped += 1;
      reports.push({ ...base, action: 'stopped', reason: 'Employee not found in HRIS.' });
      continue;
    }

    if (!matchesExcludingHoliday && !matchesIncludingHoliday) {
      skipped += 1;
      reports.push({
        ...base,
        action: 'stopped',
        reason: `DAYS APPROVED is ${row.daysApproved}; weekdays excluding public holidays = ${chargeableDates.length}; weekdays including public holidays = ${weekdaysIncludingHoliday.length}.`,
        weekdaysIncludingHoliday: weekdaysIncludingHoliday.length,
      });
      continue;
    }

    const keys = employeeLookupKeys(employee, row.employeeCode);
    const matched = matchExistingLeave(existingLeaves, keys, leaveType, row.startDate, lastLeaveDay, row.resumptionDate);
    if (matched?.kind === 'conflict') {
      skipped += 1;
      reports.push({
        ...base,
        action: 'stopped',
        reason: 'Overlapping leave already exists with different dates.',
        existing: (matched.all || [matched.row]).map((item) => ({
          id: item.Id,
          status: item.StatusName,
          start: isoFromSql(item.StartDate),
          end: isoFromSql(item.EndDate),
          days: item.Days,
          type: item.LeaveType,
        })),
      });
      continue;
    }

    const existing = matched?.row || null;
    const existingStatus = compact(existing?.StatusName);
    const alreadyApproved = existing ? APPROVED_STATUSES.has(existingStatus) : false;
    const requestId = existing?.Id || `leave-backfill-${row.employeeCode}-${row.startDate}`;
    const existingEss = essRequests.find((item) => item.id === requestId) || null;
    const excludedHolidays = matchesIncludingHoliday
      ? []
      : holidaysInRange.map((date) => ({ date, label: holidayLabel(date) }));
    const request = buildApprovedRequest({
      id: requestId,
      employee,
      leaveType,
      startDate: row.startDate,
      endDate: lastLeaveDay,
      days: selectedDates.length,
      selectedDates,
      excludedHolidays,
      existing: existingEss,
    });
    if (matchesIncludingHoliday) {
      request.comments = [
        ...(request.comments || []),
        {
          at: new Date().toISOString(),
          actor: ACTOR,
          comment: `Excel DAYS APPROVED includes public holiday ${holidaysInRange.map((date) => `${date} ${holidayLabel(date)}`).join(', ')}. Leave days follow Excel; timesheet booking skips that holiday.`,
        },
      ];
    }

    let leaveAction = 'create-approved';
    let balanceAction = 'confirm-used';
    if (alreadyApproved) {
      leaveAction = 'already-approved';
      balanceAction = 'skipped-already-approved';
    } else if (existing && PENDING_STATUSES.has(existingStatus)) {
      leaveAction = existingStatus === 'Line Manager Review'
        ? 'complete-line-manager-review'
        : `complete-${existingStatus.toLowerCase().replace(/\s+/g, '-')}`;
    }

    if (!apply) {
      reports.push({
        ...base,
        action: 'ready',
        leaveAction,
        balanceAction,
        requestId,
        existingStatus: existingStatus || null,
        excelCountedPublicHoliday: matchesIncludingHoliday,
      });
      continue;
    }

    try {
      if (!alreadyApproved) {
        await persistEssLeaveRequest(request);
        if (existing && (APPROVED_STATUSES.has(existingStatus) || existingStatus === 'Completed')) {
          await forceApproveLeaveRow(pool, request);
        }
        await upsertEssJson(request).catch((error) => {
          console.warn(`[${row.employeeCode}] ESS JSON was not updated:`, error instanceof Error ? error.message : error);
        });
        await applyLeaveBalanceImpact({
          employee,
          leaveType,
          days: selectedDates.length,
          mode: 'confirm-used',
          required: true,
        });
        await auditLeaveAction({
          user: ACTOR,
          role: 'Leave Administrator',
          action: existing ? 'approve' : 'create',
          record: requestId,
          oldValue: existingStatus || null,
          newValue: 'Approved',
          comments: `Backfilled ${selectedDates.length} weekday(s) ${row.startDate} to ${lastLeaveDay}.`,
        }).catch(() => undefined);
      }

      const timesheet = await syncCCodeLeaveToTimesheet({
        employeeId: employee.employeeId || employee.employeeCode,
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
        leaveType,
        startDate: row.startDate,
        endDate: lastLeaveDay,
        requestId,
        mode: 'apply',
        timesheetCache: timesheetCache || undefined,
      });
      applied += 1;
      reports.push({
        ...base,
        action: 'applied',
        leaveAction: alreadyApproved ? 'already-approved' : leaveAction,
        balanceAction: alreadyApproved ? 'skipped-already-approved' : 'confirm-used',
        requestId,
        timesheet: {
          booked: timesheet.bookedDates,
          alreadyBooked: timesheet.alreadyBookedDates,
          skipped: timesheet.skippedDates,
          daysUpdated: timesheet.daysUpdated,
          skippedSync: timesheet.skipped ? timesheet.reason : null,
        },
      });
    } catch (error) {
      skipped += 1;
      reports.push({
        ...base,
        action: 'failed',
        requestId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    excelRows: excelRows.length,
    people: new Set(excelRows.map((row) => row.employeeCode)).size,
    applied,
    skipped,
    ready: reports.filter((item) => item.action === 'ready').length,
    stopped: reports.filter((item) => item.action === 'stopped').length,
    failed: reports.filter((item) => item.action === 'failed').length,
    reports,
  };
  console.log(JSON.stringify(summary, null, 2));
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
