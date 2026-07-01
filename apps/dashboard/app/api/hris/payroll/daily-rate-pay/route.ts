import { NextResponse } from 'next/server';
import { updateEmployeeDailyRatePayInDb } from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { isDailyRatePayrollEmployee } from '@/lib/payroll-employee-classification';
import { calculateTimesheetPeriod, aggregateEmployeeAttendanceForHeaders, canonicalTimesheetEmployeeKey, isTimesheetCountableForPayroll, readTimesheetData, readTimesheetPayrollUpdates, readTimesheetPeriods } from '@/lib/timesheet-entry-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { mergeTimesheetDayRateEarnings } from '@/lib/payroll-earnings-engine';
import { syncSagePeriodEarningAdjustments } from '@/lib/payroll-period-earning-adjustments-store';
import { activePayrollPeriod, payrollPeriodLabel } from '@/lib/payroll-periods';

type Role = 'Super Admin' | 'HR Director' | 'HR Manager' | 'Payroll Officer' | 'Finance Controller' | 'Executive Management' | 'Auditor' | 'Employee';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const normalizePeriod = (value: unknown) => {
  const text = compact(value);
  return /^\d{4}-\d{2}$/.test(text) ? text : activePayrollPeriod();
};
const periodIdFromPayrollPeriod = (period: string) => `per-${period}`;
const CONFIGURED_MAX_PAYABLE_DAYS = Number(process.env.DAILY_RATE_MAX_PAYABLE_DAYS || 0);
const inclusiveDays = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 31;
  return Math.floor((end - start) / 86400000) + 1;
};
const derivedDailyRate = (employee: { ratePerDay?: number | null; ratePerHour?: number | null; periodSalary?: number | null; hoursPerDay?: number | null; hoursPerPeriod?: number | null }) => {
  const hoursPerDay = num(employee.hoursPerDay) || 8;
  const hoursPerPeriod = num(employee.hoursPerPeriod);
  const workingDays = hoursPerPeriod > 0 && hoursPerDay > 0 ? hoursPerPeriod / hoursPerDay : 22;
  const explicitDayRate = num(employee.ratePerDay);
  const explicitHourRate = num(employee.ratePerHour);
  const periodSalary = num(employee.periodSalary);
  const ratePerDay = explicitDayRate || (explicitHourRate ? explicitHourRate * hoursPerDay : 0) || (periodSalary ? (periodSalary > 50000 ? periodSalary / workingDays : periodSalary) : 0);
  const ratePerHour = explicitHourRate || (ratePerDay && hoursPerDay ? ratePerDay / hoursPerDay : 0);
  return { ratePerDay, ratePerHour, hoursPerDay };
};

const getRole = (request: Request): Role => {
  const value = request.headers.get('x-hris-role');
  const roles: Role[] = ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor', 'Employee'];
  return roles.includes(value as Role) ? (value as Role) : 'Payroll Officer';
};

const permissions = (role: Role) => ({
  canViewMoney: ['Super Admin', 'HR Director', 'HR Manager', 'Payroll Officer', 'Finance Controller', 'Executive Management', 'Auditor'].includes(role),
  canUpdateRates: ['Super Admin', 'HR Director', 'Payroll Officer', 'Finance Controller'].includes(role),
  canExport: role !== 'Employee',
});

const statusFromIssues = (issues: string[]) => {
  if (issues.some((issue) => issue.includes('rate') || issue.includes('timesheet'))) return 'Blocked';
  if (issues.length) return 'Review';
  return 'Ready';
};

const buildPayload = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const payrollPeriod = normalizePeriod(searchParams.get('period'));
  const periodId = periodIdFromPayrollPeriod(payrollPeriod);
  await syncSagePeriodEarningAdjustments(payrollPeriod, { contractEmployeesOnly: true }).catch(() => undefined);
  const role = getRole(request);
  const perms = permissions(role);
  const employeeSource = await readPayrollEmployees();
  const employees = employeeSource.employees;
  const dailyEmployees = employees.filter((employee) => isDailyRatePayrollEmployee(employee));
  const { headers, lines } = await readTimesheetData();
  const payrollUpdates = await readTimesheetPayrollUpdates();
  const period = (await readTimesheetPeriods()).find((item) => item.id === periodId) || calculateTimesheetPeriod(new Date(`${payrollPeriod}-15T00:00:00`));
  const maxPayableDays = CONFIGURED_MAX_PAYABLE_DAYS > 0 ? Math.min(CONFIGURED_MAX_PAYABLE_DAYS, inclusiveDays(period.startDate, period.endDate)) : inclusiveDays(period.startDate, period.endDate);
  const countablePeriodHeaders = headers.filter((header) => header.periodId === periodId && isTimesheetCountableForPayroll(header.status));
  const periodHeaderIds = new Set(countablePeriodHeaders.map((header) => header.id));

  const attendanceByKey = new Map<string, { daysWorked: number; attendanceHours: number; bookedHours: number; idleHours: number; payrollReadyDays: number; payrollReadyHours: number; latestPayrollUpdate: string | null; source: 'payroll-update' | 'timesheet-lines' | 'none'; anomalyCount: number; dateKeys: Set<string> }>();

  const registerAggregate = (
    employeeId: string,
    employeeNo: string | undefined,
    employeeName: string | undefined,
    aggregate: { daysWorked: number; attendanceHours: number; bookedHours: number; idleHours: number },
    payrollReadyDays: number,
    payrollReadyHours: number,
    source: 'payroll-update' | 'timesheet-lines',
    updateAt?: string | null,
  ) => {
    const keys = new Set([employeeId, employeeNo, employeeName].map(normalizePayrollMatchKey).filter(Boolean));
    keys.forEach((key) => {
      attendanceByKey.set(key, {
        daysWorked: Math.min(aggregate.daysWorked, maxPayableDays),
        attendanceHours: aggregate.attendanceHours,
        bookedHours: aggregate.bookedHours,
        idleHours: aggregate.idleHours,
        payrollReadyDays: Math.min(payrollReadyDays, maxPayableDays),
        payrollReadyHours: payrollReadyHours,
        latestPayrollUpdate: updateAt || null,
        source,
        anomalyCount: aggregate.daysWorked > maxPayableDays ? 1 : 0,
        dateKeys: new Set<string>(),
      });
    });
  };

  const attendanceTotals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
    headerIds: Array.from(periodHeaderIds),
    payrollReadyOnly: false,
  });
  const payrollReadyTotals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
    headerIds: Array.from(periodHeaderIds),
    payrollReadyOnly: true,
  });
  const aliasByEmployeeId = new Map<string, { employeeNo?: string; employeeName?: string }>();
  for (const line of lines) {
    if (!periodHeaderIds.has(line.headerId)) continue;
    const key = canonicalTimesheetEmployeeKey(line);
    if (!aliasByEmployeeId.has(key)) {
      aliasByEmployeeId.set(key, { employeeNo: line.employeeNo, employeeName: line.employeeName });
    }
  }
  const rawTimesheetKeysForPeriod = new Set<string>();
  for (const [employeeId, aggregate] of attendanceTotals) {
    const alias = aliasByEmployeeId.get(employeeId);
    const ready = payrollReadyTotals.get(employeeId);
    registerAggregate(
      employeeId,
      alias?.employeeNo,
      alias?.employeeName,
      aggregate,
      ready?.daysWorked || 0,
      ready?.bookedHours || ready?.attendanceHours || 0,
      'timesheet-lines',
    );
    [employeeId, alias?.employeeNo, alias?.employeeName].map(normalizePayrollMatchKey).filter(Boolean).forEach((key) => rawTimesheetKeysForPeriod.add(key));
  }

  const periodPayrollUpdates = payrollUpdates.filter((update) => update.periodId === periodId);
  const hasPayrollUpdateForPeriod = periodPayrollUpdates.length > 0;

  for (const update of periodPayrollUpdates) {
    for (const employee of update.employeeAttendance) {
      const updateKeys = new Set([employee.employeeId, employee.employeeName].map(normalizePayrollMatchKey).filter(Boolean));
      if ([...updateKeys].some((key) => rawTimesheetKeysForPeriod.has(key))) continue;
      registerAggregate(
        employee.employeeId,
        undefined,
        employee.employeeName,
        {
          daysWorked: num(employee.daysWorked),
          attendanceHours: num(employee.attendanceHours),
          bookedHours: num(employee.bookedHours),
          idleHours: num(employee.idleHours),
        },
        num(employee.daysWorked),
        num(employee.bookedHours) || num(employee.attendanceHours),
        'payroll-update',
        update.acknowledgedAt,
      );
    }
  }

  const records = dailyEmployees.map((employee) => {
    const keys = [employee.employeeId, employee.employeeCode, employee.fullName].map(normalizePayrollMatchKey).filter(Boolean);
    const attendance = keys.map((key) => attendanceByKey.get(key)).find(Boolean) || { daysWorked: 0, attendanceHours: 0, bookedHours: 0, idleHours: 0, payrollReadyDays: 0, payrollReadyHours: 0, latestPayrollUpdate: null, source: 'none' as const, anomalyCount: 0, dateKeys: new Set<string>() };
    const { ratePerDay, ratePerHour, hoursPerDay } = derivedDailyRate(employee);
    const payMode = ratePerHour > 0 && ratePerDay <= 0 ? 'Hourly' : 'Daily';
    const payableDays = Math.min(attendance.daysWorked, maxPayableDays);
    const payableHours = Math.min(attendance.bookedHours || attendance.attendanceHours, maxPayableDays * hoursPerDay);
    const dayRateEarnings = mergeTimesheetDayRateEarnings(employee, {
      ratePerDay: ratePerDay || ratePerHour * hoursPerDay,
      daysWorked: payMode === 'Hourly' ? payableHours / hoursPerDay : payableDays,
      period: payrollPeriod,
    });
    const grossPay = dayRateEarnings.grossPay || (payMode === 'Hourly' ? payableHours * ratePerHour : payableDays * ratePerDay);
    const issues: string[] = [];
    if (!ratePerDay && !ratePerHour) issues.push('Daily or hourly rate is missing');
    if (!attendance.daysWorked && !attendance.bookedHours && !attendance.attendanceHours) issues.push('No daily timesheet found');
    if (!attendance.payrollReadyDays && !attendance.payrollReadyHours) issues.push('Timesheet is not yet payroll-ready');
    if (attendance.anomalyCount > 0) issues.push(`Duplicate or excess timesheet days were capped at payroll period limit (${maxPayableDays})`);
    if (!employee.setupAssignedToPayroll) issues.push('Employee is not assigned to payroll setup');
    return {
      employeeDbId: employee.employeeDbId,
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      department: employee.department,
      jobTitle: employee.jobTitle,
      location: employee.location,
      payrollGroup: employee.payrollGroup || 'Daily Rate',
      salaryGrade: employee.salaryGrade || employee.jobGrade || 'Daily Rate',
      payCurrency: employee.payCurrency || 'NGN',
      paymentRun: employee.paymentRun || 'Daily Timesheet',
      paymentType: employee.paymentType || 'Timesheet Rate',
      earningProfile: dayRateEarnings.profileName,
      earningProfileId: dayRateEarnings.profileId,
      payMode,
      ratePerDay: roundMoney(ratePerDay),
      ratePerHour: roundMoney(ratePerHour),
      hoursPerDay: round2(hoursPerDay),
      daysWorked: round2(attendance.daysWorked),
      attendanceHours: round2(attendance.attendanceHours),
      bookedHours: round2(attendance.bookedHours),
      idleHours: round2(attendance.idleHours),
      payrollReadyDays: round2(attendance.payrollReadyDays),
      payrollReadyHours: round2(attendance.payrollReadyHours),
      grossPay: roundMoney(grossPay),
      taxablePay: dayRateEarnings.taxablePay,
      nonTaxablePay: dayRateEarnings.nonTaxablePay,
      earnings: dayRateEarnings.earningLines,
      latestPayrollUpdate: attendance.latestPayrollUpdate,
      attendanceSource: attendance.source,
      uniqueTimesheetDays: attendance.dateKeys.size,
      payrollPeriod,
      setupAssignedToPayroll: employee.setupAssignedToPayroll,
      status: statusFromIssues(issues),
      issues,
    };
  });

  const visibleRecords = perms.canViewMoney ? records : records.map((record) => ({ ...record, ratePerDay: null, ratePerHour: null, grossPay: null }));
  const totals = records.reduce(
    (sum, record) => ({
      daysWorked: sum.daysWorked + record.daysWorked,
      attendanceHours: sum.attendanceHours + record.attendanceHours,
      payrollReadyDays: sum.payrollReadyDays + record.payrollReadyDays,
      grossPay: sum.grossPay + record.grossPay,
      ready: sum.ready + (record.status === 'Ready' ? 1 : 0),
      review: sum.review + (record.status === 'Review' ? 1 : 0),
      blocked: sum.blocked + (record.status === 'Blocked' ? 1 : 0),
    }),
    { daysWorked: 0, attendanceHours: 0, payrollReadyDays: 0, grossPay: 0, ready: 0, review: 0, blocked: 0 }
  );

  return {
    generatedAt: new Date().toISOString(),
    source: `${employeeSource.source} and Daily Timesheet Payroll Updates (${payrollPeriodLabel(payrollPeriod)})`,
    payrollPeriod,
    periodId,
    periodLabel: payrollPeriodLabel(payrollPeriod),
    controls: {
      maxMonthlyPayableDays: maxPayableDays,
      periodStartDate: period.startDate,
      periodEndDate: period.endDate,
      sourceRule: hasPayrollUpdateForPeriod ? 'Using raw timesheet dates first, payroll-ready updates only when raw lines are unavailable' : 'Using current-period timesheet lines only',
      historicalDataExcluded: true,
      duplicateSourcePrevention: true,
    },
    dataSource: payrollDataSourceInfo(employeeSource),
    role,
    permissions: perms,
    summary: {
      dailyRateEmployees: dailyEmployees.length,
      daysWorked: round2(totals.daysWorked),
      attendanceHours: round2(totals.attendanceHours),
      payrollReadyDays: round2(totals.payrollReadyDays),
      grossPay: roundMoney(totals.grossPay),
      ready: totals.ready,
      review: totals.review,
      blocked: totals.blocked,
      missingRates: records.filter((record) => !record.ratePerDay && !record.ratePerHour).length,
      missingTimesheets: records.filter((record) => !record.daysWorked && !record.attendanceHours).length,
    },
    records: visibleRecords,
  };
};

const csv = (records: any[]) => {
  const headers = ['Employee ID', 'Name', 'Department', 'Mode', 'Day Rate', 'Hourly Rate', 'Days Worked', 'Hours', 'Payroll Ready Days', 'Gross Pay', 'Status', 'Issues'];
  const lines = records.map((record) =>
    [record.employeeId, record.employeeName, record.department, record.payMode, record.ratePerDay, record.ratePerHour, record.daysWorked, record.attendanceHours, record.payrollReadyDays, record.grossPay, record.status, record.issues.join('; ')]
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
          'content-disposition': 'attachment; filename="daily-rate-pay.csv"',
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load daily rate pay.');
  }
}

export async function POST(request: Request) {
  try {
    const role = getRole(request);
    const perms = permissions(role);
    if (!perms.canUpdateRates) return err(403, 'Permission denied');
    const body = await request.json().catch(() => ({}));
    const employeeDbId = Number(body.employeeDbId);
    if (!employeeDbId) return err(400, 'employeeDbId is required');
    const ratePerDay = body.payMode === 'Hourly' ? null : num(body.ratePerDay);
    const ratePerHour = body.payMode === 'Hourly' ? num(body.ratePerHour) : null;
    const hoursPerDay = 8;
    if (!ratePerDay && !ratePerHour) return err(400, 'Provide either a daily rate or hourly rate');
    await updateEmployeeDailyRatePayInDb({
      employeeDbId,
      payrollGroup: compact(body.payrollGroup) || 'Daily Rate',
      salaryGrade: compact(body.salaryGrade) || 'Daily Rate',
      payCurrency: compact(body.payCurrency) || 'NGN',
      paymentRun: compact(body.paymentRun) || 'Daily Timesheet',
      paymentType: body.payMode === 'Hourly' ? 'Hourly Timesheet Rate' : 'Daily Timesheet Rate',
      periodSalary: ratePerDay || ratePerHour,
      ratePerDay,
      ratePerHour,
      hoursPerDay,
    });
    return ok({ updated: true });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to update daily rate pay.');
  }
}
