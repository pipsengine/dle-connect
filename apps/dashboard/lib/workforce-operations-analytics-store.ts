import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { isDailyRatePayrollEmployee } from '@/lib/payroll-employee-classification';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { calendarPayrollPeriod, listCalendarPayrollPeriodOptions, payrollPeriodLabel } from '@/lib/payroll-periods';
import {
  aggregateEmployeeAttendanceForHeaders,
  buildTimesheetHoursMapForPayrollPeriod,
  canonicalTimesheetEmployeeKey,
  isPayrollPayableWorkDay,
  isTimesheetCountableForPayroll,
  isTimesheetPayrollReadyStatus,
  normalizePaidWorkHours,
  normalizeTimesheetStatus,
  readTimesheetData,
  readTimesheetPayrollUpdates,
  readTimesheetPeriods,
  rebuildPayrollSnapshotForPeriod,
} from '@/lib/timesheet-entry-store';
import { getPayrollPublicHolidayDates } from '@/lib/nigeria-public-holidays';

export type WorkforceVerifyStatus = 'Matched' | 'Variance' | 'Missing' | 'No Timesheet' | 'Not Daily Rate';

export type WorkforceOperationsDetailRow = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  location: string;
  site: string;
  shift: string;
  supervisorName: string;
  workCenterName: string;
  projectCode: string;
  projectName: string;
  timesheetDate: string;
  periodId: string;
  periodName: string;
  timesheetStatus: string;
  attendanceStatus: string;
  timesheetApproval: string;
  payrollStatus: string;
  payrollReady: boolean;
  payableDay: boolean;
  daysWorkedOnDate: number;
  periodDaysWorked: number;
  payrollSnapshotDays: number | null;
  verifyStatus: WorkforceVerifyStatus;
  bookedHours: number;
  attendanceHours: number;
  productiveHours: number;
  overtimeHours: number;
  idleHours: number;
  exceptions: string[];
  manager: string;
  risk: 'Low' | 'Medium' | 'High';
};

export type WorkforceOperationsEmployeeSummary = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  location: string;
  site: string;
  shift: string;
  supervisorName: string;
  workCenterName: string;
  projectCode: string;
  periodDaysWorked: number;
  payrollSnapshotDays: number | null;
  verifyStatus: WorkforceVerifyStatus;
  bookedHours: number;
  attendanceHours: number;
  overtimeHours: number;
  productiveHours: number;
  idleHours: number;
  payableDates: number;
  payrollReadyDates: number;
  exceptions: string[];
  manager: string;
  risk: 'Low' | 'Medium' | 'High';
  isDailyRate: boolean;
};

export type WorkforceOperationsAnalyticsPayload = {
  generatedAt: string;
  source: string;
  period: string;
  periodId: string;
  periodLabel: string;
  periodStartDate: string;
  periodEndDate: string;
  periodOptions: Array<{ value: string; label: string }>;
  summary: {
    employees: number;
    withTimesheet: number;
    missingDays: number;
    varianceCount: number;
    matchedCount: number;
    totalDaysWorked: number;
    totalBookedHours: number;
    totalOvertimeHours: number;
    payrollReadyEmployees: number;
    pendingApprovals: number;
    productivityPct: number;
  };
  kpis: {
    employees: number;
    attendanceToday: number;
    timesheetHours: number;
    pendingApprovals: number;
    payrollReadyHours: number;
    productivityPct: number;
  };
  analytics: {
    attendanceTrend: Array<{ date: string; present: number; absent: number; late: number }>;
    overtimeTrend: Array<{ date: string; hours: number }>;
    payrollReadinessPct: number;
    timesheetCompletionPct: number;
    exceptionDistribution: Array<{ label: string; value: number; color: string }>;
    operationalHealth: Array<{ label: string; value: number; status: 'Good' | 'Warning' | 'Critical' | 'Excellent' }>;
  };
  alerts: Array<{ id: string; label: string; severity: 'critical' | 'high' | 'medium' | 'low' }>;
  insights: Array<{ id: string; label: string; severity: 'critical' | 'high' | 'medium' | 'low' }>;
  activity: Array<{ id: string; at: string; label: string; tone: 'blue' | 'green' | 'amber' | 'red' }>;
  filterOptions: {
    departments: string[];
    locations: string[];
    supervisors: string[];
    workCenters: string[];
    projects: string[];
    managers: string[];
    statuses: string[];
    verifyStatuses: WorkforceVerifyStatus[];
  };
  detailRows: WorkforceOperationsDetailRow[];
  employeeSummaries: WorkforceOperationsEmployeeSummary[];
};

const round = (value: number, digits = 1) => Math.round((Number.isFinite(value) ? value : 0) * 10 ** digits) / 10 ** digits;
const compact = (value: unknown) => String(value || '').trim();
const isoDate = (value: string) => value.slice(0, 10);

const resolveVerifyStatus = (liveDays: number, snapshotDays: number | null, hasLines: boolean, isDailyRate: boolean): WorkforceVerifyStatus => {
  if (!isDailyRate) return 'Not Daily Rate';
  if (!hasLines && liveDays <= 0) return 'No Timesheet';
  if (snapshotDays == null) return liveDays > 0 ? 'Missing' : 'No Timesheet';
  if (liveDays === snapshotDays) return 'Matched';
  return 'Variance';
};

const riskFromStatus = (verifyStatus: WorkforceVerifyStatus, exceptions: string[]): 'Low' | 'Medium' | 'High' => {
  if (verifyStatus === 'Variance' || verifyStatus === 'Missing') return 'High';
  if (exceptions.length >= 2 || verifyStatus === 'No Timesheet') return 'Medium';
  return 'Low';
};

const lookupHours = (map: Map<string, { daysWorked: number; bookedHours: number }>, keys: string[]) => {
  for (const key of keys) {
    const normalized = normalizePayrollMatchKey(key);
    const entry = map.get(key) || map.get(normalized);
    if (entry) return entry;
  }
  return null;
};

export async function readWorkforceOperationsAnalytics(options?: {
  period?: string;
  startDate?: string;
  endDate?: string;
  rebuildSnapshot?: boolean;
  actor?: string;
}): Promise<WorkforceOperationsAnalyticsPayload> {
  const periodToken = (options?.period || calendarPayrollPeriod()).replace(/^per-/, '');
  const periodId = `per-${periodToken}`;
  if (options?.rebuildSnapshot) {
    await rebuildPayrollSnapshotForPeriod(periodId, options.actor || 'Workforce Operations Verify').catch(() => undefined);
  }

  const [employeeSource, { headers, lines }, periods, payrollUpdates, liveHoursMap, holidayDates] = await Promise.all([
    readPayrollEmployees(),
    readTimesheetData(),
    readTimesheetPeriods(),
    readTimesheetPayrollUpdates(),
    buildTimesheetHoursMapForPayrollPeriod(periodToken),
    getPayrollPublicHolidayDates().catch(() => [] as string[]),
  ]);

  const period = periods.find((item) => item.id === periodId) || periods[0];
  const periodHeaders = headers.filter((header) => header.periodId === periodId);
  const countableHeaderIds = periodHeaders.filter((header) => isTimesheetCountableForPayroll(header.status)).map((header) => header.id);
  const headerById = new Map(periodHeaders.map((header) => [header.id, header]));
  const periodUpdate = payrollUpdates.find((item) => item.periodId === periodId);
  const snapshotByEmployee = new Map(
    (periodUpdate?.employeeAttendance || []).map((row) => [normalizePayrollMatchKey(row.employeeId), Number(row.daysWorked || 0)]),
  );

  const periodTotals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
    headerIds: countableHeaderIds,
    payrollReadyOnly: false,
    holidayDates,
  });
  const payrollReadyTotals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
    headerIds: countableHeaderIds,
    payrollReadyOnly: true,
    holidayDates,
  });

  const employeeDirectory = employeeSource.employees;
  const directoryByKey = new Map<string, (typeof employeeDirectory)[number]>();
  for (const employee of employeeDirectory) {
    [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId, employee.fullName]
      .map((value) => normalizePayrollMatchKey(value))
      .filter(Boolean)
      .forEach((key) => directoryByKey.set(key, employee));
  }

  const detailRows: WorkforceOperationsDetailRow[] = [];
  const summaryByEmployee = new Map<string, WorkforceOperationsEmployeeSummary>();

  for (const line of lines) {
    const header = headerById.get(line.headerId);
    if (!header || header.periodId !== periodId) continue;
    if (!isTimesheetCountableForPayroll(header.status)) continue;

    const employeeKey = canonicalTimesheetEmployeeKey(line);
    const directory = directoryByKey.get(employeeKey) || directoryByKey.get(normalizePayrollMatchKey(line.employeeId)) || directoryByKey.get(normalizePayrollMatchKey(line.employeeNo));
    const isDailyRate = directory ? isDailyRatePayrollEmployee(directory) : /^C\d+/.test(employeeKey);
    const payableDay = isPayrollPayableWorkDay(line, header.timesheetDate);
    const attendanceHours = normalizePaidWorkHours(line.attendanceDuration);
    const bookedHours = normalizePaidWorkHours(line.totalHours);
    const productiveHours = normalizePaidWorkHours(line.usedHours);
    const overtimeHours = Math.max(0, round(productiveHours - 8));
    const payrollReady = isTimesheetPayrollReadyStatus(header.status);
    const periodAggregate = periodTotals.get(employeeKey);
    const liveDays = periodAggregate?.daysWorked || 0;
    const snapshotDays = snapshotByEmployee.has(employeeKey) ? snapshotByEmployee.get(employeeKey)! : snapshotByEmployee.get(normalizePayrollMatchKey(line.employeeId)) ?? null;
    const verifyStatus = resolveVerifyStatus(liveDays, snapshotDays, true, isDailyRate);
    const project = line.projectAllocations[0];
    const exceptions = [
      ...!line.clockIn && bookedHours <= 0 ? ['No Clock-In'] : [],
      ...!payableDay && (line.clockIn || bookedHours > 0) ? ['Non-Payable Day'] : [],
      ...verifyStatus === 'Variance' ? [`Payroll variance (live ${liveDays} vs snapshot ${snapshotDays ?? 0})`] : [],
      ...verifyStatus === 'Missing' ? ['Payroll snapshot missing'] : [],
      ...!payrollReady ? ['Timesheet not payroll-ready'] : [],
    ];

    const attendanceStatus = line.clockIn ? 'Present' : bookedHours > 0 ? 'Booked' : 'Absent';
    const row: WorkforceOperationsDetailRow = {
      id: `${line.id}-${project?.projectCode || 'general'}`,
      employeeId: employeeKey,
      employeeNo: compact(line.employeeNo || line.employeeId),
      employeeName: line.employeeName,
      department: directory?.department || 'Unassigned',
      location: directory?.location || directory?.workLocation || 'Unassigned',
      site: directory?.projectSite || directory?.officeLocation || directory?.location || 'Unassigned',
      shift: directory?.shift || 'Day',
      supervisorName: header.supervisorName,
      workCenterName: header.workCenterName,
      projectCode: project?.projectCode || '—',
      projectName: project?.projectName || 'General',
      timesheetDate: isoDate(header.timesheetDate),
      periodId,
      periodName: period?.name || periodId,
      timesheetStatus: normalizeTimesheetStatus(header.status),
      attendanceStatus,
      timesheetApproval: header.currentApprovalStage || header.status,
      payrollStatus: payrollReady ? 'Payroll Ready' : 'Pending',
      payrollReady,
      payableDay,
      daysWorkedOnDate: payableDay ? 1 : 0,
      periodDaysWorked: liveDays,
      payrollSnapshotDays: snapshotDays,
      verifyStatus,
      bookedHours,
      attendanceHours,
      productiveHours,
      overtimeHours,
      idleHours: round(line.idleHours),
      exceptions,
      manager: header.supervisorName,
      risk: riskFromStatus(verifyStatus, exceptions),
    };
    detailRows.push(row);

    const current = summaryByEmployee.get(employeeKey) || {
      employeeId: employeeKey,
      employeeNo: row.employeeNo,
      employeeName: row.employeeName,
      department: row.department,
      location: row.location,
      site: row.site,
      shift: row.shift,
      supervisorName: header.supervisorName,
      workCenterName: header.workCenterName,
      projectCode: row.projectCode,
      periodDaysWorked: liveDays,
      payrollSnapshotDays: snapshotDays,
      verifyStatus,
      bookedHours: 0,
      attendanceHours: 0,
      overtimeHours: 0,
      productiveHours: 0,
      idleHours: 0,
      payableDates: periodTotals.get(employeeKey)?.daysWorked || 0,
      payrollReadyDates: payrollReadyTotals.get(employeeKey)?.daysWorked || 0,
      exceptions: [] as string[],
      manager: header.supervisorName,
      risk: row.risk,
      isDailyRate,
    };
    current.bookedHours = round(current.bookedHours + bookedHours);
    current.attendanceHours = round(current.attendanceHours + attendanceHours);
    current.productiveHours = round(current.productiveHours + productiveHours);
    current.overtimeHours = round(current.overtimeHours + overtimeHours);
    current.idleHours = round(current.idleHours + row.idleHours);
    current.periodDaysWorked = liveDays;
    current.payrollSnapshotDays = snapshotDays;
    current.verifyStatus = verifyStatus;
    current.exceptions = Array.from(new Set([...current.exceptions, ...exceptions]));
    current.risk = riskFromStatus(verifyStatus, current.exceptions);
    summaryByEmployee.set(employeeKey, current);
  }

  for (const employee of employeeDirectory) {
    if (!isDailyRatePayrollEmployee(employee)) continue;
    const keys = [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId, employee.fullName]
      .map((value) => normalizePayrollMatchKey(value))
      .filter(Boolean);
    const employeeKey = keys.find((key) => /^C\d+/.test(key)) || keys[0];
    if (!employeeKey || summaryByEmployee.has(employeeKey)) continue;
    const live = lookupHours(liveHoursMap, keys);
    const snapshotDays = keys.map((key) => snapshotByEmployee.get(key)).find((value) => value != null) ?? null;
    const verifyStatus = resolveVerifyStatus(live?.daysWorked || 0, snapshotDays, false, true);
    summaryByEmployee.set(employeeKey, {
      employeeId: employeeKey,
      employeeNo: employee.employeeCode || employee.employeeId,
      employeeName: employee.fullName,
      department: employee.department || 'Unassigned',
      location: employee.location || employee.workLocation || 'Unassigned',
      site: employee.projectSite || employee.officeLocation || employee.location || 'Unassigned',
      shift: employee.shift || 'Day',
      supervisorName: '—',
      workCenterName: '—',
      projectCode: '—',
      periodDaysWorked: live?.daysWorked || 0,
      payrollSnapshotDays: snapshotDays,
      verifyStatus,
      bookedHours: live?.bookedHours || 0,
      attendanceHours: 0,
      overtimeHours: 0,
      productiveHours: 0,
      idleHours: 0,
      payableDates: live?.daysWorked || 0,
      payrollReadyDates: 0,
      exceptions: verifyStatus === 'No Timesheet' ? ['No timesheet lines in period'] : verifyStatus === 'Missing' ? ['Payroll snapshot missing'] : [],
      manager: '—',
      risk: verifyStatus === 'No Timesheet' ? 'Medium' : verifyStatus === 'Missing' ? 'High' : 'Low',
      isDailyRate: true,
    });
  }

  const employeeSummaries = Array.from(summaryByEmployee.values()).sort((left, right) => left.employeeName.localeCompare(right.employeeName));
  const withTimesheet = employeeSummaries.filter((row) => row.periodDaysWorked > 0 || row.bookedHours > 0).length;
  const missingDays = employeeSummaries.filter((row) => row.isDailyRate && row.verifyStatus === 'No Timesheet').length;
  const varianceCount = employeeSummaries.filter((row) => row.verifyStatus === 'Variance' || row.verifyStatus === 'Missing').length;
  const matchedCount = employeeSummaries.filter((row) => row.verifyStatus === 'Matched').length;
  const totalDaysWorked = employeeSummaries.reduce((sum, row) => sum + row.periodDaysWorked, 0);
  const totalBookedHours = round(employeeSummaries.reduce((sum, row) => sum + row.bookedHours, 0));
  const totalOvertimeHours = round(employeeSummaries.reduce((sum, row) => sum + row.overtimeHours, 0));
  const payrollReadyEmployees = employeeSummaries.filter((row) => row.payrollReadyDates > 0).length;
  const pendingApprovals = detailRows.filter((row) => !row.payrollReady).length;

  const dates = Array.from(new Set(detailRows.map((row) => row.timesheetDate))).sort();
  const attendanceTrend = dates.slice(-7).map((date) => ({
    date,
    present: detailRows.filter((row) => row.timesheetDate === date && row.attendanceStatus !== 'Absent').length,
    absent: detailRows.filter((row) => row.timesheetDate === date && row.attendanceStatus === 'Absent').length,
    late: 0,
  }));
  const overtimeTrend = dates.slice(-7).map((date) => ({
    date,
    hours: round(detailRows.filter((row) => row.timesheetDate === date).reduce((sum, row) => sum + row.overtimeHours, 0)),
  }));

  const payrollReadinessPct = employeeSummaries.length ? Math.round((matchedCount / Math.max(employeeSummaries.filter((row) => row.isDailyRate).length, 1)) * 100) : 0;
  const timesheetCompletionPct = employeeDirectory.length ? Math.round((withTimesheet / employeeDirectory.length) * 100) : 0;

  const periodOptionMap = new Map<string, string>();
  const addPeriodOption = (value: string, label?: string) => {
    const token = compact(value).replace(/^per-/i, '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(token)) return;
    if (!periodOptionMap.has(token)) periodOptionMap.set(token, compact(label) || payrollPeriodLabel(token));
  };
  addPeriodOption(periodToken, period?.name);
  addPeriodOption(calendarPayrollPeriod());
  for (const item of periods) addPeriodOption(item.id, item.name);
  for (const option of listCalendarPayrollPeriodOptions(12)) addPeriodOption(option.value, option.label);
  const periodOptions = [...periodOptionMap.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([value, label]) => ({ value, label }));

  return {
    generatedAt: new Date().toISOString(),
    source: `${employeeSource.source}; DLE Enterprise timesheet and payroll verification engine`,
    period: periodToken,
    periodId,
    periodLabel: period?.name || payrollPeriodLabel(periodToken),
    periodStartDate: period?.startDate || '',
    periodEndDate: period?.endDate || '',
    periodOptions,
    summary: {
      employees: employeeSummaries.length,
      withTimesheet,
      missingDays,
      varianceCount,
      matchedCount,
      totalDaysWorked,
      totalBookedHours,
      totalOvertimeHours,
      payrollReadyEmployees,
      pendingApprovals,
      productivityPct: timesheetCompletionPct,
    },
    kpis: {
      employees: employeeDirectory.length,
      attendanceToday: detailRows.filter((row) => row.attendanceStatus === 'Present').length,
      timesheetHours: totalBookedHours,
      pendingApprovals,
      payrollReadyHours: round(detailRows.filter((row) => row.payrollReady).reduce((sum, row) => sum + row.bookedHours, 0)),
      productivityPct: timesheetCompletionPct,
    },
    analytics: {
      attendanceTrend,
      overtimeTrend,
      payrollReadinessPct,
      timesheetCompletionPct,
      exceptionDistribution: [
        { label: 'Attendance', value: detailRows.filter((row) => row.exceptions.some((item) => item.includes('Clock'))).length, color: '#2563EB' },
        { label: 'Payroll', value: employeeSummaries.filter((row) => row.verifyStatus === 'Variance' || row.verifyStatus === 'Missing').length, color: '#7C3AED' },
        { label: 'Approvals', value: pendingApprovals, color: '#F59E0B' },
        { label: 'Timesheets', value: missingDays, color: '#06B6D4' },
        { label: 'Others', value: detailRows.filter((row) => row.exceptions.length > 1).length, color: '#94A3B8' },
      ],
      operationalHealth: [
        { label: 'Workforce Availability', value: timesheetCompletionPct, status: timesheetCompletionPct >= 85 ? 'Good' : 'Warning' },
        { label: 'Attendance Compliance', value: payrollReadinessPct, status: payrollReadinessPct >= 80 ? 'Excellent' : 'Warning' },
        { label: 'Timesheet Compliance', value: timesheetCompletionPct, status: timesheetCompletionPct >= 80 ? 'Good' : 'Warning' },
        { label: 'Supervisor Approval', value: Math.max(0, 100 - Math.round((pendingApprovals / Math.max(detailRows.length, 1)) * 100)), status: pendingApprovals > 50 ? 'Warning' : 'Good' },
        { label: 'Shift Coverage', value: 81, status: 'Good' },
        { label: 'Overtime Compliance', value: totalOvertimeHours > 0 ? 76 : 95, status: totalOvertimeHours > 500 ? 'Warning' : 'Good' },
        { label: 'Payroll Readiness', value: payrollReadinessPct, status: payrollReadinessPct >= 90 ? 'Excellent' : payrollReadinessPct >= 70 ? 'Good' : 'Critical' },
        { label: 'Project Coverage', value: 84, status: 'Good' },
      ],
    },
    alerts: [
      { id: 'missing-days', label: `${missingDays} daily-rate employees missing period timesheet days`, severity: missingDays ? 'high' : 'low' },
      { id: 'variance', label: `${varianceCount} payroll day variances require review`, severity: varianceCount ? 'critical' : 'low' },
      { id: 'pending', label: `${pendingApprovals} timesheet lines pending payroll readiness`, severity: pendingApprovals > 100 ? 'high' : 'medium' },
      { id: 'overtime', label: `${totalOvertimeHours} overtime hours booked in period`, severity: totalOvertimeHours > 300 ? 'medium' : 'low' },
    ],
    insights: [
      { id: 'verify', label: 'Run payroll validation before posting daily-rate payroll', severity: varianceCount ? 'critical' : 'low' },
      { id: 'empty-days', label: `${missingDays} employees have empty days worked in payroll feed`, severity: missingDays ? 'high' : 'low' },
      { id: 'snapshot', label: periodUpdate ? `Payroll snapshot refreshed ${periodUpdate.acknowledgedAt}` : 'Payroll snapshot missing for selected period', severity: periodUpdate ? 'low' : 'high' },
    ],
    activity: [
      { id: '1', at: new Date().toISOString(), label: 'Workforce operations analytics generated', tone: 'blue' },
      { id: '2', at: periodUpdate?.acknowledgedAt || new Date().toISOString(), label: periodUpdate ? 'Payroll snapshot synchronized' : 'Payroll snapshot unavailable', tone: periodUpdate ? 'green' : 'amber' },
      { id: '3', at: new Date().toISOString(), label: `${matchedCount} employees matched live vs payroll days`, tone: 'green' },
    ],
    filterOptions: {
      departments: Array.from(new Set(employeeSummaries.map((row) => row.department).filter(Boolean))).sort(),
      locations: Array.from(new Set(employeeSummaries.map((row) => row.location).filter(Boolean))).sort(),
      supervisors: Array.from(new Set(detailRows.map((row) => row.supervisorName).filter(Boolean))).sort(),
      workCenters: Array.from(new Set(detailRows.map((row) => row.workCenterName).filter(Boolean))).sort(),
      projects: Array.from(new Set(detailRows.map((row) => row.projectCode).filter((value) => value !== '—'))).sort(),
      managers: Array.from(new Set(employeeSummaries.map((row) => row.manager).filter((value) => value !== '—'))).sort(),
      statuses: Array.from(new Set(detailRows.map((row) => row.timesheetStatus))).sort(),
      verifyStatuses: ['Matched', 'Variance', 'Missing', 'No Timesheet', 'Not Daily Rate'],
    },
    detailRows: detailRows.sort((left, right) => right.timesheetDate.localeCompare(left.timesheetDate) || left.employeeName.localeCompare(right.employeeName)),
    employeeSummaries,
  };
}

export function workforceOperationsRowsToCsv(rows: Array<Record<string, string | number | boolean | null>>) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}
