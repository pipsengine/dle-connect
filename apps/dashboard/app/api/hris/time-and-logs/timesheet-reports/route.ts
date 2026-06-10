import { NextResponse } from 'next/server';
import {
  isTimesheetPayrollReadyStatus,
  normalizeTimesheetStatus,
  readTimesheetData,
  readTimesheetPayrollUpdates,
  readTimesheetPeriod,
  type TimesheetStatus,
} from '@/lib/timesheet-entry-store';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';

type ReportType = 'summary' | 'employee' | 'project' | 'workCenter' | 'supervisor' | 'payroll' | 'exceptions' | 'approval';

type ReportRow = {
  headerId: string;
  lineId: string;
  periodId: string;
  periodName: string;
  timesheetDate: string;
  supervisorName: string;
  workCenterName: string;
  status: TimesheetStatus;
  normalizedStatus: TimesheetStatus;
  payrollReady: boolean;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  clockIn: string | null;
  clockOut: string | null;
  attendanceHours: number;
  projectHours: number;
  idleHours: number;
  totalHours: number;
  variance: number;
  validationStatus: string;
  validationMessage: string | null;
  projectCodes: string[];
  idleReasons: string[];
  submittedAt: string | null;
  payrollAcknowledgedAt: string | null;
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const round1 = (value: number) => Math.round(value * 10) / 10;
const includes = (value: string, needle: string) => value.toLowerCase().includes(needle.toLowerCase());

const parseList = (value: string | null) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);

const groupRows = <T,>(rows: T[], keyFn: (row: T) => string) => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row) || 'Unassigned';
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return grouped;
};

const summarizeRows = (rows: ReportRow[]) => ({
  records: rows.length,
  employees: new Set(rows.map((row) => row.employeeId)).size,
  timesheets: new Set(rows.map((row) => row.headerId)).size,
  attendanceHours: round1(rows.reduce((sum, row) => sum + row.attendanceHours, 0)),
  projectHours: round1(rows.reduce((sum, row) => sum + row.projectHours, 0)),
  idleHours: round1(rows.reduce((sum, row) => sum + row.idleHours, 0)),
  totalHours: round1(rows.reduce((sum, row) => sum + row.totalHours, 0)),
  variance: round1(rows.reduce((sum, row) => sum + row.variance, 0)),
  payrollReadyRows: rows.filter((row) => row.payrollReady).length,
  exceptionRows: rows.filter((row) => row.validationStatus !== 'Valid' || Math.abs(row.variance) > 0.01).length,
});

const buildBreakdown = (rows: ReportRow[], key: keyof ReportRow) =>
  Array.from(groupRows(rows, (row) => String(row[key] ?? 'Unassigned')).entries())
    .map(([label, items]) => ({ label, ...summarizeRows(items) }))
    .sort((a, b) => b.totalHours - a.totalHours || a.label.localeCompare(b.label));

const buildProjectBreakdown = (rows: ReportRow[]) => {
  const projectRows = rows.flatMap((row) => row.projectCodes.length ? row.projectCodes.map((code) => ({ ...row, projectCode: code })) : [{ ...row, projectCode: 'No Project' }]);
  return Array.from(groupRows(projectRows, (row) => row.projectCode).entries())
    .map(([label, items]) => ({ label, ...summarizeRows(items) }))
    .sort((a, b) => b.totalHours - a.totalHours || a.label.localeCompare(b.label));
};

const reportRowsForType = (rows: ReportRow[], type: ReportType) => {
  if (type === 'employee') return buildBreakdown(rows, 'employeeName');
  if (type === 'project') return buildProjectBreakdown(rows);
  if (type === 'workCenter') return buildBreakdown(rows, 'workCenterName');
  if (type === 'supervisor') return buildBreakdown(rows, 'supervisorName');
  if (type === 'approval') return buildBreakdown(rows, 'normalizedStatus');
  if (type === 'payroll') return buildBreakdown(rows.filter((row) => row.payrollReady), 'employeeName');
  if (type === 'exceptions') return rows.filter((row) => row.validationStatus !== 'Valid' || Math.abs(row.variance) > 0.01);
  return buildBreakdown(rows, 'periodName');
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = resolveAccessContext(request);
    const uiPermissions = getUiPermissions(access);
    const reportType = (searchParams.get('reportType') || 'summary') as ReportType;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const statuses = parseList(searchParams.get('statuses'));
    const supervisors = parseList(searchParams.get('supervisors'));
    const workCenters = parseList(searchParams.get('workCenters'));
    const periods = parseList(searchParams.get('periods'));
    const projects = parseList(searchParams.get('projects'));
    const payrollReady = searchParams.get('payrollReady');
    const query = searchParams.get('query')?.trim() || '';

    const { headers, lines } = await readTimesheetData();
    const payrollUpdates = await readTimesheetPayrollUpdates();
    const periodById = new Map<string, Awaited<ReturnType<typeof readTimesheetPeriod>>>();
    const linesByHeaderId = new Map<string, typeof lines>();
    for (const line of lines) {
      linesByHeaderId.set(line.headerId, [...(linesByHeaderId.get(line.headerId) || []), line]);
    }
    const payrollUpdateByHeaderId = new Map<string, (typeof payrollUpdates)[number]>();
    for (const update of payrollUpdates) {
      for (const headerId of update.headerIds) {
        payrollUpdateByHeaderId.set(headerId, update);
      }
    }

    const rows: ReportRow[] = [];
    for (const header of headers) {
      if (!periodById.has(header.periodId)) {
        periodById.set(header.periodId, await readTimesheetPeriod(new Date(`${header.periodId.replace('per-', '')}-15T00:00:00`)));
      }
      const period = periodById.get(header.periodId)!;
      const normalizedStatus = normalizeTimesheetStatus(header.status);
      const headerPayrollUpdate = payrollUpdateByHeaderId.get(header.id);
      const payrollIsReady = isTimesheetPayrollReadyStatus(header.status) || Boolean(headerPayrollUpdate);

      for (const line of linesByHeaderId.get(header.id) || []) {
        rows.push({
          headerId: header.id,
          lineId: line.id,
          periodId: header.periodId,
          periodName: period.name,
          timesheetDate: header.timesheetDate,
          supervisorName: header.supervisorName,
          workCenterName: header.workCenterName,
          status: header.status,
          normalizedStatus,
          payrollReady: payrollIsReady,
          employeeId: line.employeeId,
          employeeNo: line.employeeNo,
          employeeName: line.employeeName,
          clockIn: line.clockIn,
          clockOut: line.clockOut,
          attendanceHours: line.attendanceDuration,
          projectHours: line.usedHours,
          idleHours: line.idleHours,
          totalHours: line.totalHours,
          variance: line.variance,
          validationStatus: line.validationStatus,
          validationMessage: line.validationMessage,
          projectCodes: line.projectAllocations.filter((item) => item.hours > 0).map((item) => item.projectCode),
          idleReasons: line.idleAllocations.filter((item) => item.hours > 0).map((item) => item.reasonName),
          submittedAt: header.submittedAt,
          payrollAcknowledgedAt: header.payrollAcknowledgedAt || headerPayrollUpdate?.acknowledgedAt || null,
        });
      }
    }

    const filteredRows = rows.filter((row) => {
      if (from && row.timesheetDate < from) return false;
      if (to && row.timesheetDate > to) return false;
      if (statuses.length && !statuses.includes(row.normalizedStatus)) return false;
      if (supervisors.length && !supervisors.includes(row.supervisorName)) return false;
      if (workCenters.length && !workCenters.includes(row.workCenterName)) return false;
      if (periods.length && !periods.includes(row.periodId)) return false;
      if (projects.length && !projects.some((project) => row.projectCodes.includes(project))) return false;
      if (payrollReady === 'yes' && !row.payrollReady) return false;
      if (payrollReady === 'no' && row.payrollReady) return false;
      if (query && ![row.employeeName, row.employeeNo, row.supervisorName, row.workCenterName, row.periodName, row.validationStatus].some((value) => includes(String(value || ''), query))) return false;
      return true;
    });

    const statusBreakdown = buildBreakdown(filteredRows, 'normalizedStatus');
    const payload = {
      generatedAt: new Date().toISOString(),
      reportType,
      permissions: {
        actor: uiPermissions.actor,
        role: uiPermissions.role,
        canExport: true,
        canViewPayroll: uiPermissions.canApproveTimesheet || uiPermissions.canEditAttendance || access.role === 'OrganizationAdmin',
      },
      summary: summarizeRows(filteredRows),
      reportRows: reportRowsForType(filteredRows, reportType),
      detailRows: filteredRows.sort((a, b) => b.timesheetDate.localeCompare(a.timesheetDate) || a.employeeName.localeCompare(b.employeeName)).slice(0, 500),
      breakdowns: {
        status: statusBreakdown,
        employee: buildBreakdown(filteredRows, 'employeeName').slice(0, 20),
        workCenter: buildBreakdown(filteredRows, 'workCenterName'),
        supervisor: buildBreakdown(filteredRows, 'supervisorName'),
        project: buildProjectBreakdown(filteredRows).slice(0, 30),
        period: buildBreakdown(filteredRows, 'periodName'),
      },
      filterOptions: {
        periods: Array.from(new Map(rows.map((row) => [row.periodId, { id: row.periodId, name: row.periodName }])).values()).sort((a, b) => b.id.localeCompare(a.id)),
        statuses: Array.from(new Set(rows.map((row) => row.normalizedStatus))).sort(),
        supervisors: Array.from(new Set(rows.map((row) => row.supervisorName))).sort(),
        workCenters: Array.from(new Set(rows.map((row) => row.workCenterName))).sort(),
        projects: Array.from(new Set(rows.flatMap((row) => row.projectCodes))).sort(),
        employees: Array.from(new Set(rows.map((row) => row.employeeName))).sort(),
      },
    };

    return ok(payload);
  } catch (error) {
    console.error('Timesheet Reports API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Unable to build timesheet reports.');
  }
}
