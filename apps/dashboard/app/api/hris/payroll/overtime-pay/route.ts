import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { isTimesheetPayrollReadyStatus, normalizePaidWorkHours, readTimesheetData, type TimesheetHeader, type TimesheetLine } from '@/lib/timesheet-entry-store';
import { timesheetDayRulesForDate } from '@/lib/timesheet-entry-shared';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { calculatePayrollOvertime } from '@/lib/payroll-earnings-engine';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';
type DayType = 'Weekday' | 'Saturday' | 'Sunday' | 'Public Holiday';
type Status = 'Ready' | 'Review' | 'Blocked';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const HOLIDAY_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-public-holidays.json');

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => ({
  canViewMoney: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor'].includes(role),
  canConfigureHolidays: ['Super Admin', 'HR Director', 'Payroll Officer', 'Finance Controller'].includes(role),
  canExport: role !== 'Employee',
});

const readHolidayDates = async (): Promise<string[]> => {
  try {
    const raw = await readFile(HOLIDAY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.dates)) return parsed.dates.map(String).filter(Boolean);
  } catch {
    return [];
  }
  return [];
};

const writeHolidayDates = async (dates: string[]) => {
  await mkdir(path.dirname(HOLIDAY_PATH), { recursive: true });
  const normalized = Array.from(new Set(dates.map((date) => String(date || '').trim()).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
  await writeFile(HOLIDAY_PATH, JSON.stringify({ dates: normalized, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  return normalized;
};

const employeeKeys = (employee: DleEmployeeDirectoryRow) =>
  [employee.employeeId, employee.employeeCode, employee.fullName, employee.sourceEmployeeId].map(normalizePayrollMatchKey).filter(Boolean);

const lineKeys = (line: TimesheetLine) => [line.employeeId, line.employeeNo, line.employeeName].map(normalizePayrollMatchKey).filter(Boolean);

const dayTypeFor = (date: string, holidays: Set<string>): DayType => {
  if (holidays.has(date)) return 'Public Holiday';
  const day = new Date(`${date}T00:00:00`).getDay();
  if (day === 6) return 'Saturday';
  if (day === 0) return 'Sunday';
  return 'Weekday';
};

const hourlyRateFor = (employee: DleEmployeeDirectoryRow, hoursPerDay: number) => {
  const ratePerHour = num(employee.ratePerHour);
  if (ratePerHour > 0) return ratePerHour;
  const ratePerDay = num(employee.ratePerDay);
  if (ratePerDay > 0 && hoursPerDay > 0) return ratePerDay / hoursPerDay;
  const periodSalary = num(employee.periodSalary);
  const hoursPerPeriod = num(employee.hoursPerPeriod);
  if (periodSalary > 0 && hoursPerPeriod > 0) return periodSalary / hoursPerPeriod;
  if (periodSalary > 0 && hoursPerDay > 0) return periodSalary / 22 / hoursPerDay;
  return 0;
};

const statusFromIssues = (issues: string[]): Status => {
  if (issues.some((issue) => issue.includes('rate') || issue.includes('hours') || issue.includes('timesheet'))) return 'Blocked';
  if (issues.length) return 'Review';
  return 'Ready';
};

const buildPayload = async (request: Request) => {
  const role = getRole(request);
  const perms = permissions(role);
  const [employeeSource, timesheetData, holidayDates] = await Promise.all([readPayrollEmployees(), readTimesheetData(), readHolidayDates()]);
  const employees = employeeSource.employees;
  const employeeByKey = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employees || []) {
    for (const key of employeeKeys(employee)) employeeByKey.set(key, employee);
  }

  const headerById = new Map<string, TimesheetHeader>(timesheetData.headers.map((header) => [header.id, header]));
  const holidays = new Set<string>(holidayDates);
  const records = timesheetData.lines
    .map((line) => {
      const header = headerById.get(line.headerId);
      const employee = lineKeys(line).map((key) => employeeByKey.get(key)).find(Boolean);
      if (!header || !employee) return null;
      const date = header.timesheetDate;
      const dayType = dayTypeFor(date, holidays);
      const dayRules = timesheetDayRulesForDate(date, holidayDates);
      const hoursPerDay = dayRules.standardProductiveHours;
      const workedHours = Math.max(normalizePaidWorkHours(num(line.attendanceDuration)), normalizePaidWorkHours(num(line.totalHours)), normalizePaidWorkHours(num(line.usedHours) + num(line.idleHours)));
      const productiveHours = normalizePaidWorkHours(num(line.usedHours));
      const overtimeHours = Math.max(0, round2(productiveHours - hoursPerDay));
      const payableHours = dayType === 'Weekday' ? overtimeHours : workedHours;
      const overtime = calculatePayrollOvertime(employee, dayType, payableHours);
      const hourlyRate = overtime.hourlyRate || hourlyRateFor(employee, hoursPerDay);
      const grossPay = overtime.amount || payableHours * hourlyRate * overtime.multiplier;
      const payrollReady = isTimesheetPayrollReadyStatus(header.status);
      const issues: string[] = [];
      if (!hourlyRate) issues.push('Hourly rate cannot be derived from payroll setup');
      if (!payableHours) issues.push(dayType === 'Weekday' ? 'No overtime hours above standard day' : 'No hours worked for special day');
      if (!payrollReady) issues.push('Timesheet is not yet payroll-ready');
      return {
        id: line.id,
        employeeDbId: employee.employeeDbId,
        employeeId: employee.employeeId,
        employeeName: employee.fullName || line.employeeName,
        department: employee.department,
        jobTitle: employee.jobTitle,
        location: employee.location,
        employmentType: employee.employmentType,
        payrollGroup: employee.payrollGroup || employee.employmentType || 'Payroll',
        salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
        payCurrency: employee.payCurrency || 'NGN',
        date,
        dayType,
        earningCode: overtime.code,
        earningName: overtime.name,
        earningProfile: overtime.earningProfileName,
        multiplier: overtime.multiplier,
        divisor: overtime.divisor,
        basis: overtime.basis,
        timesheetStatus: header.status,
        payrollReady,
        standardHours: round2(hoursPerDay),
        workedHours: round2(workedHours),
        overtimeHours: round2(overtimeHours),
        payableHours: round2(payableHours),
        hourlyRate: roundMoney(hourlyRate),
        grossPay: roundMoney(grossPay),
        status: statusFromIssues(issues),
        issues,
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      employeeDbId: number;
      employeeId: string;
      employeeName: string;
      department: string;
      jobTitle: string;
      location: string;
      employmentType: string;
      payrollGroup: string;
      salaryGrade: string;
      payCurrency: string;
      date: string;
      dayType: DayType;
      multiplier: number;
      timesheetStatus: string;
      payrollReady: boolean;
      standardHours: number;
      workedHours: number;
      overtimeHours: number;
      payableHours: number;
      hourlyRate: number | null;
      grossPay: number | null;
      status: Status;
      issues: string[];
    }>;

  const overtimeByEmployeeDate = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    const key = `${normalizePayrollMatchKey(record.employeeId)}::${record.date}`;
    const existing = overtimeByEmployeeDate.get(key);
    if (!existing || record.payableHours > existing.payableHours) {
      overtimeByEmployeeDate.set(key, record);
    }
  }
  const dedupedRecords = Array.from(overtimeByEmployeeDate.values());

  const payableRecords = dedupedRecords.filter((record) => record.payableHours > 0);
  const payableTotals = payableRecords.reduce(
    (sum, record) => ({
      payableHours: sum.payableHours + record.payableHours,
      weekdayHours: sum.weekdayHours + (record.dayType === 'Weekday' ? record.payableHours : 0),
      specialDayHours: sum.specialDayHours + (record.dayType === 'Weekday' ? 0 : record.payableHours),
      grossPay: sum.grossPay + num(record.grossPay),
    }),
    { payableHours: 0, weekdayHours: 0, specialDayHours: 0, grossPay: 0 }
  );
  const readiness = dedupedRecords.reduce(
    (sum, record) => ({
      ready: sum.ready + (record.status === 'Ready' ? 1 : 0),
      review: sum.review + (record.status === 'Review' ? 1 : 0),
      blocked: sum.blocked + (record.status === 'Blocked' ? 1 : 0),
      missingRates: sum.missingRates + (!record.hourlyRate ? 1 : 0),
      pendingTimesheets: sum.pendingTimesheets + (!record.payrollReady ? 1 : 0),
    }),
    { ready: 0, review: 0, blocked: 0, missingRates: 0, pendingTimesheets: 0 }
  );

  const visibleRecords = perms.canViewMoney
    ? dedupedRecords
    : dedupedRecords.map((record) => ({ ...record, hourlyRate: null, grossPay: null }));

  return {
    generatedAt: new Date().toISOString(),
    source: `${employeeSource.source} Payroll Setup and Timesheet Approvals`,
    dataSource: payrollDataSourceInfo(employeeSource),
    role,
    permissions: perms,
    publicHolidays: holidayDates,
    rule: {
      weekdayMultiplier: 1.5,
      saturdayMultiplier: 2,
      sundayMultiplier: 2.5,
      publicHolidayMultiplier: 2,
      weekdayBasis: 'Hours above standard day using Basic / 176',
      specialDayBasis: 'Hours worked for that day',
    },
    summary: {
      records: dedupedRecords.length,
      payableRecords: payableRecords.length,
      payableHours: round2(payableTotals.payableHours),
      weekdayHours: round2(payableTotals.weekdayHours),
      specialDayHours: round2(payableTotals.specialDayHours),
      grossPay: roundMoney(payableTotals.grossPay),
      ready: readiness.ready,
      review: readiness.review,
      blocked: readiness.blocked,
      missingRates: readiness.missingRates,
      pendingTimesheets: readiness.pendingTimesheets,
    },
    records: visibleRecords,
  };
};

const csv = (records: any[]) => {
  const headers = ['Date', 'Employee ID', 'Name', 'Department', 'Day Type', 'Multiplier', 'Worked Hours', 'Overtime Hours', 'Payable Hours', 'Hourly Rate', 'Gross Pay', 'Timesheet Status', 'Status', 'Issues'];
  const lines = records.map((record) =>
    [record.date, record.employeeId, record.employeeName, record.department, record.dayType, record.multiplier, record.workedHours, record.overtimeHours, record.payableHours, record.hourlyRate, record.grossPay, record.timesheetStatus, record.status, record.issues.join('; ')]
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

export async function GET(request: Request) {
  try {
    const payload = await buildPayload(request);
    const { searchParams } = new URL(request.url);
    if (searchParams.get('format') === 'csv') {
      if (!payload.permissions.canExport) return err(403, 'Permission denied');
      return new Response(csv(payload.records), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="overtime-pay.csv"',
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load overtime pay.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    const body = await request.json().catch(() => ({}));

    if (body.action === 'post-to-payroll') {
      if (!['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer'].includes(role)) {
        return err(403, 'Permission denied');
      }
      const { postPermanentTimesheetOvertimeToPayroll } = await import('@/lib/payroll-timesheet-ot-posting');
      const summary = await postPermanentTimesheetOvertimeToPayroll(String(body.period || ''));
      return ok({ summary });
    }

    if (!perms.canConfigureHolidays) return err(403, 'Permission denied');
    if (!Array.isArray(body.publicHolidays)) return err(400, 'publicHolidays must be an array of YYYY-MM-DD dates');
    const publicHolidays = await writeHolidayDates(body.publicHolidays);
    return ok({ updated: true, publicHolidays });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update overtime pay settings.');
  }
}
