import { NextResponse } from 'next/server';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  buildProjectTimesheetApprovals,
  canonicalTimesheetEmployeeKey,
  isPayrollPayableWorkDay,
  isTimesheetPayrollReadyStatus,
  normalizePaidWorkHours,
  normalizeTimesheetStatus,
  readProjects,
  readTimesheetData,
  readTimesheetPayrollUpdates,
  readTimesheetPeriod,
  type TimesheetHeader,
  type TimesheetLine,
  type TimesheetStatus,
} from '@/lib/timesheet-entry-store';
import { buildPayrollAttendanceSheet } from '@/lib/timesheet-payroll-attendance-sheet';
import { findMissingTimesheetDays, TIMESHEET_RECAPTURE_GUIDE } from '@/lib/timesheet-recapture';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type ReportType =
  | 'summary'
  | 'employee-detail'
  | 'department'
  | 'project'
  | 'project-manager-approval'
  | 'cost-control'
  | 'payroll-processing'
  | 'overtime-analysis'
  | 'resource-allocation'
  | 'manpower-utilization'
  | 'workforce-productivity'
  | 'approval-status'
  | 'exceptions'
  | 'audit-trail'
  | 'project-labour-cost'
  | 'project-resource-utilization';

type ReportRow = {
  headerId: string;
  lineId: string;
  allocationId: string;
  periodId: string;
  periodName: string;
  periodStatus: string;
  timesheetDate: string;
  supervisorId: string;
  supervisorName: string;
  workCenterId: string;
  workCenterName: string;
  shiftLabel: string;
  status: TimesheetStatus;
  normalizedStatus: TimesheetStatus;
  approvalStatus: string;
  currentApprovalStage: string;
  currentApprover: string;
  payrollReady: boolean;
  payrollAcknowledgedAt: string | null;
  payrollAcknowledgedBy: string | null;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  biometricId: string;
  attendanceId: string;
  employeeCategory: string;
  employmentType: string;
  department: string;
  section: string;
  businessUnit: string;
  costCentre: string;
  location: string;
  jobCode: string;
  jobTitle: string;
  clockIn: string | null;
  clockOut: string | null;
  attendanceHours: number;
  dayWorked: number;
  daysWorked: number;
  usedHours: number;
  idleHours: number;
  productiveHours: number;
  nonProductiveHours: number;
  overtimeHours: number;
  totalHours: number;
  variance: number;
  validationStatus: string;
  validationMessage: string | null;
  lineRemarks: string;
  idleReasons: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  projectSite: string;
  activityCode: string;
  activityName: string;
  allocationHours: number;
  allocationRemarks: string;
  labourRateNgn: number;
  labourCostNgn: number;
  projectManagerStatus: string;
  costControlStatus: string;
  overtimeStatus: string;
  exceptionType: string;
  exceptionSeverity: 'Low' | 'Medium' | 'High';
  workflowHistory: string;
  approvalComments: string;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lastSyncAt: string | null;
  auditTrail: string;
};

type Summary = {
  records: number;
  employees: number;
  timesheets: number;
  totalHoursWorked: number;
  productiveHours: number;
  nonProductiveHours: number;
  overtimeHours: number;
  labourCost: number;
  projectCostAllocation: number;
  resourceUtilizationPct: number;
  workforceProductivityIndex: number;
  payrollReadyHours: number;
  pendingApprovals: number;
  rejectedTimesheets: number;
  approvalCycleTimeHours: number;
  missingTimesheets: number;
  complianceRate: number;
  exceptionRows: number;
};

type GroupedRow = Summary & {
  label: string;
  drilldownKey: string;
  groupBy: string;
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const round = (value: number, digits = 1) => Number((Number.isFinite(value) ? value : 0).toFixed(digits));
const parseList = (value: string | null) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);
const clean = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const includes = (value: unknown, needle: string) => lower(value).includes(needle.toLowerCase());
const hoursBetween = (from: string | null | undefined, to: string | null | undefined) =>
  from && to ? Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3600000) : 0;

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const readHolidayDates = async (): Promise<string[]> => {
  try {
    const raw = await readFile(path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-public-holidays.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.dates)) return parsed.dates.map(String).filter(Boolean);
  } catch {
    return [];
  }
  return [];
};

const managementRoles = ['OrganizationAdmin', 'Super Administrator', 'HRBusinessPartner', 'Auditor'];
const roleScope = (role: string, actor: string) => {
  const text = lower(`${role} ${actor}`);
  if (managementRoles.includes(role) || text.includes('payroll') || text.includes('hr')) return 'enterprise';
  if (text.includes('cost')) return 'cost-control';
  if (text.includes('project manager') || text.includes('pm ')) return 'project-manager';
  if (text.includes('department')) return 'department';
  if (text.includes('supervisor')) return 'supervisor';
  return 'restricted';
};

const groupRows = <T,>(rows: T[], keyFn: (row: T) => string) => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row) || 'Unassigned';
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return grouped;
};

const exceptionFor = (header: TimesheetHeader, line: TimesheetLine, productiveHours: number, overtimeHours: number, projectCode: string) => {
  const status = normalizeTimesheetStatus(header.status);
  if (!line.clockIn) return { type: 'Missing Attendance', severity: 'High' as const };
  if (line.validationStatus === 'Error') return { type: 'Invalid Timesheet', severity: 'High' as const };
  if (line.validationStatus !== 'Valid') return { type: line.validationStatus, severity: 'Medium' as const };
  if (!projectCode || projectCode === 'No Project') return { type: 'Invalid Project Allocation', severity: 'High' as const };
  if (overtimeHours > 2) return { type: 'Excessive Overtime', severity: 'Medium' as const };
  if (productiveHours <= 0 && status !== 'Rejected') return { type: 'Unsubmitted Hours', severity: 'Medium' as const };
  if (status === 'Rejected' || status === 'Returned') return { type: status, severity: 'High' as const };
  if (['Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed'].includes(status)) return { type: 'Pending Approval', severity: 'Low' as const };
  return { type: 'None', severity: 'Low' as const };
};

const summarizeRows = (rows: ReportRow[]): Summary => {
  const headerIds = new Set(rows.map((row) => row.headerId));
  const rejectedHeaders = new Set(rows.filter((row) => row.normalizedStatus === 'Rejected' || row.normalizedStatus === 'Returned').map((row) => row.headerId));
  const pendingHeaders = new Set(rows.filter((row) => ['Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed'].includes(row.normalizedStatus)).map((row) => row.headerId));
  const approvedRows = rows.filter((row) => row.payrollReady || row.normalizedStatus === 'HR_Acknowledged');
  const cycleRows = rows.filter((row) => row.submittedAt && row.payrollAcknowledgedAt);
  const totalHoursWorked = round(rows.reduce((sum, row) => sum + row.totalHours, 0));
  const productiveHours = round(rows.reduce((sum, row) => sum + row.productiveHours, 0));
  const nonProductiveHours = round(rows.reduce((sum, row) => sum + row.nonProductiveHours, 0));
  const exceptionRows = rows.filter((row) => row.exceptionType !== 'None').length;
  return {
    records: rows.length,
    employees: new Set(rows.map((row) => row.employeeId || row.employeeNo)).size,
    timesheets: headerIds.size,
    totalHoursWorked,
    productiveHours,
    nonProductiveHours,
    overtimeHours: round(rows.reduce((sum, row) => sum + row.overtimeHours, 0)),
    labourCost: round(rows.reduce((sum, row) => sum + row.labourCostNgn, 0), 0),
    projectCostAllocation: round(rows.reduce((sum, row) => sum + (row.projectCode === 'No Project' ? 0 : row.labourCostNgn), 0), 0),
    resourceUtilizationPct: totalHoursWorked ? round((productiveHours / totalHoursWorked) * 100) : 0,
    workforceProductivityIndex: totalHoursWorked ? round(((productiveHours - nonProductiveHours * 0.25) / totalHoursWorked) * 100) : 0,
    payrollReadyHours: round(approvedRows.reduce((sum, row) => sum + row.productiveHours, 0)),
    pendingApprovals: pendingHeaders.size,
    rejectedTimesheets: rejectedHeaders.size,
    approvalCycleTimeHours: cycleRows.length ? round(cycleRows.reduce((sum, row) => sum + hoursBetween(row.submittedAt, row.payrollAcknowledgedAt), 0) / cycleRows.length) : 0,
    missingTimesheets: rows.filter((row) => row.exceptionType === 'Missing Attendance').length,
    complianceRate: rows.length ? round(((rows.length - exceptionRows) / rows.length) * 100) : 100,
    exceptionRows,
  };
};

const buildBreakdown = (rows: ReportRow[], groupBy: string, keyFn: (row: ReportRow) => string): GroupedRow[] =>
  Array.from(groupRows(rows, keyFn).entries())
    .map(([label, items]) => ({ label, drilldownKey: label, groupBy, ...summarizeRows(items) }))
    .sort((a, b) => b.totalHoursWorked - a.totalHoursWorked || a.label.localeCompare(b.label));

const reportRowsForType = (rows: ReportRow[], type: ReportType) => {
  if (type === 'employee-detail') return rows;
  if (type === 'department') return buildBreakdown(rows, 'department', (row) => row.department);
  if (type === 'project') return buildBreakdown(rows, 'project', (row) => `${row.projectCode} - ${row.projectName}`);
  if (type === 'project-manager-approval') return buildBreakdown(rows, 'projectManager', (row) => row.projectManager || 'Unassigned PM');
  if (type === 'cost-control') return buildBreakdown(rows, 'costCentre', (row) => row.costCentre || row.projectCode);
  if (type === 'payroll-processing') return buildBreakdown(rows.filter((row) => row.payrollReady), 'employee', (row) => row.employeeName);
  if (type === 'overtime-analysis') return rows.filter((row) => row.overtimeHours > 0);
  if (type === 'resource-allocation') return buildBreakdown(rows, 'workCenter', (row) => row.workCenterName);
  if (type === 'manpower-utilization') return buildBreakdown(rows, 'location', (row) => row.location);
  if (type === 'workforce-productivity') return buildBreakdown(rows, 'supervisor', (row) => row.supervisorName);
  if (type === 'approval-status') return buildBreakdown(rows, 'approvalStatus', (row) => row.approvalStatus);
  if (type === 'exceptions') return rows.filter((row) => row.exceptionType !== 'None');
  if (type === 'audit-trail') return rows.filter((row) => row.workflowHistory || row.auditTrail);
  if (type === 'project-labour-cost') return buildBreakdown(rows, 'projectCost', (row) => `${row.projectCode} - ${row.projectName}`);
  if (type === 'project-resource-utilization') return buildBreakdown(rows, 'projectResource', (row) => `${row.projectCode} - ${row.projectName}`);
  return buildBreakdown(rows, 'period', (row) => row.periodName);
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
    const projectsFilter = parseList(searchParams.get('projects'));
    const departments = parseList(searchParams.get('departments'));
    const locations = parseList(searchParams.get('locations'));
    const employeeCategories = parseList(searchParams.get('employeeCategories'));
    const employmentTypes = parseList(searchParams.get('employmentTypes'));
    const projectManagers = parseList(searchParams.get('projectManagers'));
    const costCentres = parseList(searchParams.get('costCentres'));
    const payrollReady = searchParams.get('payrollReady');
    const query = searchParams.get('query')?.trim() || '';

    const [{ headers, lines }, payrollUpdates, projects, payrollEmployees, holidayDates] = await Promise.all([
      readTimesheetData(),
      readTimesheetPayrollUpdates(),
      readProjects(),
      readPayrollEmployees(),
      readHolidayDates(),
    ]);

    const employeeByCode = new Map(payrollEmployees.employees.map((employee) => [lower(employee.employeeCode || employee.employeeId), employee]));
    const employeesByKey = new Map<string, (typeof payrollEmployees.employees)[number]>();
    for (const employee of payrollEmployees.employees) {
      for (const key of [employee.employeeCode, employee.employeeId, employee.fullName, employee.sourceEmployeeId]
        .map((value) => normalizePayrollMatchKey(value))
        .filter(Boolean)) {
        employeesByKey.set(key, employee);
      }
      employeesByKey.set(lower(employee.employeeCode || employee.employeeId), employee);
    }
    const projectByCode = new Map(projects.map((project) => [lower(project.code), project]));
    const periodById = new Map<string, Awaited<ReturnType<typeof readTimesheetPeriod>>>();
    const linesByHeaderId = new Map<string, typeof lines>();
    for (const line of lines) linesByHeaderId.set(line.headerId, [...(linesByHeaderId.get(line.headerId) || []), line]);

    const payrollUpdateByHeaderId = new Map<string, (typeof payrollUpdates)[number]>();
    for (const update of payrollUpdates) for (const headerId of update.headerIds) payrollUpdateByHeaderId.set(headerId, update);

    const rows: ReportRow[] = [];
    for (const header of headers) {
      if (!periodById.has(header.periodId)) {
        periodById.set(header.periodId, await readTimesheetPeriod(new Date(`${header.periodId.replace('per-', '')}-15T00:00:00`)));
      }
      const period = periodById.get(header.periodId)!;
      const normalizedStatus = normalizeTimesheetStatus(header.status);
      const headerPayrollUpdate = payrollUpdateByHeaderId.get(header.id);
      const payrollIsReady = isTimesheetPayrollReadyStatus(header.status) || Boolean(headerPayrollUpdate);
      const projectApprovals = buildProjectTimesheetApprovals(header, linesByHeaderId.get(header.id) || [], projects);
      const history = header.workflowHistory || [];
      const workflowHistory = history.map((event) => `${event.stage}: ${event.decision} by ${event.by}${event.comment ? ` (${event.comment})` : ''}`).join(' -> ');
      const approvalComments = history.map((event) => event.comment).filter(Boolean).join(' | ');

      for (const line of linesByHeaderId.get(header.id) || []) {
        const employee = employeeByCode.get(lower(line.employeeNo)) || employeeByCode.get(lower(line.employeeId));
        const allocations = line.projectAllocations.filter((item) => Number(item.hours || 0) > 0);
        const safeAllocations = allocations.length ? allocations : [{ projectId: 'none', projectCode: 'No Project', projectName: 'No Project', hours: normalizePaidWorkHours(line.usedHours), remarks: null }];
        const lineProductive = normalizePaidWorkHours(line.usedHours);
        const lineTotal = normalizePaidWorkHours(line.totalHours);
        const lineOvertime = Math.max(0, lineProductive - 8);
        const hourlyRate = Number((employee as any)?.ratePerHour || 0);
        const dailyRate = Number((employee as any)?.dailyRate || 0);
        const labourRate = hourlyRate > 0 ? hourlyRate : dailyRate > 0 ? round(dailyRate / 8, 2) : 2500;
        const idleReasons = (line.idleAllocations || [])
          .filter((item) => Number(item.hours || 0) > 0)
          .map((item) => `${clean(item.reasonName || item.reasonId || 'Idle')}: ${round(Number(item.hours || 0))}h`)
          .join(' | ');

        for (const allocation of safeAllocations) {
          const project = projectByCode.get(lower(allocation.projectCode));
          const projectApproval = projectApprovals.find((item) => lower(item.projectCode) === lower(allocation.projectCode));
          const allocationHours = normalizePaidWorkHours(Number(allocation.hours || 0));
          const labourCost = round(allocationHours * labourRate, 0);
          const exception = exceptionFor(header, line, lineProductive, lineOvertime, allocation.projectCode);
          const currentStage = clean(header.currentApprovalStage) || (payrollIsReady ? 'Payroll Ready' : normalizedStatus);
          const dayWorked = isPayrollPayableWorkDay(line, header.timesheetDate) ? 1 : 0;
          rows.push({
            headerId: header.id,
            lineId: line.id,
            allocationId: `${line.id}-${allocation.projectCode}`,
            periodId: header.periodId,
            periodName: period.name,
            periodStatus: period.status,
            timesheetDate: header.timesheetDate,
            supervisorId: clean(header.supervisorId),
            supervisorName: header.supervisorName,
            workCenterId: clean(header.workCenterId),
            workCenterName: header.workCenterName,
            shiftLabel: clean(header.shiftLabel) || 'Unassigned',
            status: header.status,
            normalizedStatus,
            approvalStatus: currentStage,
            currentApprovalStage: currentStage,
            currentApprover: clean(header.currentApprover),
            payrollReady: payrollIsReady,
            payrollAcknowledgedAt: header.payrollAcknowledgedAt || headerPayrollUpdate?.acknowledgedAt || null,
            payrollAcknowledgedBy: header.payrollAcknowledgedBy || headerPayrollUpdate?.acknowledgedBy || null,
            employeeId: line.employeeId,
            employeeNo: line.employeeNo,
            employeeName: line.employeeName,
            biometricId: clean(line.biometricId),
            attendanceId: clean(line.attendanceId),
            employeeCategory: clean((employee as any)?.employeeCategory || (employee as any)?.salaryGrade || 'Unassigned'),
            employmentType: clean((employee as any)?.employmentType || 'Unassigned'),
            department: clean((employee as any)?.department || 'Unassigned'),
            section: clean((employee as any)?.section || (employee as any)?.unit || 'Unassigned'),
            businessUnit: clean((employee as any)?.businessUnit || 'Unassigned'),
            costCentre: clean((employee as any)?.costCenter || project?.code || allocation.projectCode || 'Unassigned'),
            location: clean((employee as any)?.location || (employee as any)?.workLocation || project?.site || 'Unassigned'),
            jobCode: clean((employee as any)?.jobCode || (employee as any)?.positionCode || (employee as any)?.employeeCode || line.employeeNo),
            jobTitle: clean((employee as any)?.jobTitle || 'Unassigned'),
            clockIn: line.clockIn,
            clockOut: line.clockOut,
            attendanceHours: normalizePaidWorkHours(line.attendanceDuration),
            dayWorked,
            daysWorked: 0,
            usedHours: lineProductive,
            idleHours: round(line.idleHours),
            productiveHours: allocationHours,
            nonProductiveHours: round(line.idleHours / safeAllocations.length),
            overtimeHours: round(lineOvertime * (allocationHours / Math.max(lineProductive, 1))),
            totalHours: round(allocationHours + line.idleHours / safeAllocations.length),
            variance: round(line.variance),
            validationStatus: line.validationStatus,
            validationMessage: line.validationMessage,
            lineRemarks: clean(line.remarks),
            idleReasons: idleReasons || 'None',
            projectCode: allocation.projectCode || 'No Project',
            projectName: allocation.projectName || project?.name || allocation.projectCode || 'No Project',
            projectManager: clean(project?.projectManager || header.projectManager || 'Unassigned'),
            projectSite: clean(project?.site || (employee as any)?.projectSite || 'Unassigned'),
            activityCode: clean((allocation as any).activityId || allocation.projectCode || 'General'),
            activityName: clean((allocation as any).taskName || 'General Timesheet Activity'),
            allocationHours,
            allocationRemarks: clean(allocation.remarks),
            labourRateNgn: labourRate,
            labourCostNgn: labourCost,
            projectManagerStatus: projectApproval?.projectManagerStatus || (normalizedStatus === 'Supervisor_Reviewed' ? 'Pending' : 'Not Required'),
            costControlStatus: projectApproval?.costControlStatus || (normalizedStatus === 'Project_Manager_Reviewed' ? 'Pending' : 'Not Required'),
            overtimeStatus: lineOvertime > 0 ? (payrollIsReady ? 'Approved' : 'Pending') : 'None',
            exceptionType: exception.type,
            exceptionSeverity: exception.severity,
            workflowHistory,
            approvalComments,
            submittedAt: header.submittedAt,
            submittedBy: header.submittedBy,
            approvedAt: header.approvedAt,
            approvedBy: header.approvedBy,
            lastSyncAt: header.lastSyncAt,
            auditTrail: `Generated report row for ${header.id}/${line.id} at ${new Date().toISOString()}`,
          });
        }
      }
    }

    const scope = roleScope(access.role, access.actor);
    const scopedRows = rows.filter((row) => {
      if (scope === 'enterprise' || scope === 'cost-control') return true;
      if (scope === 'project-manager') return lower(row.projectManager).includes(lower(access.actor)) || lower(access.actor).includes(lower(row.projectManager));
      if (scope === 'supervisor') return lower(row.supervisorName).includes(lower(access.actor)) || lower(access.actor).includes(lower(row.supervisorName));
      if (scope === 'department') return lower(row.department).includes(lower(access.actor));
      return false;
    });

    const filteredRows = scopedRows.filter((row) => {
      if (from && row.timesheetDate < from) return false;
      if (to && row.timesheetDate > to) return false;
      if (statuses.length && !statuses.includes(row.normalizedStatus)) return false;
      if (supervisors.length && !supervisors.includes(row.supervisorName)) return false;
      if (workCenters.length && !workCenters.includes(row.workCenterName)) return false;
      if (periods.length && !periods.includes(row.periodId)) return false;
      if (projectsFilter.length && !projectsFilter.includes(row.projectCode)) return false;
      if (departments.length && !departments.includes(row.department)) return false;
      if (locations.length && !locations.includes(row.location)) return false;
      if (employeeCategories.length && !employeeCategories.includes(row.employeeCategory)) return false;
      if (employmentTypes.length && !employmentTypes.includes(row.employmentType)) return false;
      if (projectManagers.length && !projectManagers.includes(row.projectManager)) return false;
      if (costCentres.length && !costCentres.includes(row.costCentre)) return false;
      if (payrollReady === 'yes' && !row.payrollReady) return false;
      if (payrollReady === 'no' && row.payrollReady) return false;
      if (query && ![row.employeeName, row.employeeNo, row.supervisorName, row.workCenterName, row.periodName, row.validationStatus, row.projectCode, row.projectName, row.department, row.location, row.projectManager].some((value) => includes(value, query))) return false;
      return true;
    }).sort((a, b) => b.timesheetDate.localeCompare(a.timesheetDate) || a.employeeName.localeCompare(b.employeeName));

    const periodDaysByEmployee = new Map<string, Set<string>>();
    for (const row of filteredRows) {
      if (row.dayWorked !== 1) continue;
      const employeeKey = canonicalTimesheetEmployeeKey(row);
      const dates = periodDaysByEmployee.get(employeeKey) || new Set<string>();
      dates.add(row.timesheetDate);
      periodDaysByEmployee.set(employeeKey, dates);
    }
    for (const row of filteredRows) {
      row.daysWorked = periodDaysByEmployee.get(canonicalTimesheetEmployeeKey(row))?.size || 0;
    }

    const masterEmployeeValues = (selector: (employee: any) => unknown) =>
      Array.from(new Set(payrollEmployees.employees.map((employee) => clean(selector(employee))).filter(Boolean))).sort();
    const masterCostCentres = Array.from(new Set([
      ...masterEmployeeValues((employee) => employee.costCenter || employee.costCentre),
      ...projects.map((project) => clean((project as any).costCenter || (project as any).costCentre || project.code)).filter(Boolean),
      ...scopedRows.map((row) => row.costCentre).filter(Boolean),
    ])).sort();

    const exportMode = searchParams.get('exportMode') === 'full' || searchParams.get('format') === 'csv' || searchParams.get('format') === 'excel';
    const detailLimit = exportMode ? Number.POSITIVE_INFINITY : 1000;
    const reportLimit = exportMode ? Number.POSITIVE_INFINITY : 500;
    const canViewCosts = scope === 'enterprise' || scope === 'cost-control' || scope === 'project-manager';
    const payrollAttendanceSheet = buildPayrollAttendanceSheet({
      rows: filteredRows,
      employeesByKey,
      holidayDates,
      canViewCosts,
    });
    const missingDays = from && to
      ? await findMissingTimesheetDays({ from, to, maxGaps: exportMode ? 2000 : 200 })
      : { gaps: [], gateByPeriod: {} };

    const payload = {
      generatedAt: new Date().toISOString(),
      reportType,
      permissions: {
        actor: uiPermissions.actor,
        role: uiPermissions.role,
        visibilityScope: scope,
        canExport: true,
        canSchedule: uiPermissions.canViewAudit || uiPermissions.canApproveTimesheet,
        canViewCosts,
        canViewPayroll: scope === 'enterprise',
      },
      summary: {
        ...summarizeRows(filteredRows),
        missingTimesheets: filteredRows.filter((row) => row.exceptionType === 'Missing Attendance').length,
      },
      reportRows: reportRowsForType(filteredRows, reportType).slice(0, Number.isFinite(reportLimit) ? reportLimit : undefined),
      detailRows: Number.isFinite(detailLimit) ? filteredRows.slice(0, detailLimit) : filteredRows,
      detailRowCount: filteredRows.length,
      detailRowsTruncated: !exportMode && filteredRows.length > 1000,
      exportMode: exportMode ? 'full' : 'preview',
      payrollAttendanceSheet,
      payrollAttendanceSheetCount: payrollAttendanceSheet.length,
      missingDays: missingDays.gaps,
      missingDayCount: missingDays.gaps.length,
      recaptureGates: missingDays.gateByPeriod,
      recaptureGuide: TIMESHEET_RECAPTURE_GUIDE,
      drilldowns: {
        organization: buildBreakdown(filteredRows, 'businessUnit', (row) => row.businessUnit),
        departments: buildBreakdown(filteredRows, 'department', (row) => row.department),
        projects: buildBreakdown(filteredRows, 'project', (row) => `${row.projectCode} - ${row.projectName}`),
        supervisors: buildBreakdown(filteredRows, 'supervisor', (row) => row.supervisorName),
        employees: buildBreakdown(filteredRows, 'employee', (row) => `${row.employeeNo} - ${row.employeeName}`),
        dailyEntries: buildBreakdown(filteredRows, 'date', (row) => row.timesheetDate),
      },
      breakdowns: {
        status: buildBreakdown(filteredRows, 'status', (row) => row.normalizedStatus),
        employee: buildBreakdown(filteredRows, 'employee', (row) => row.employeeName).slice(0, 20),
        workCenter: buildBreakdown(filteredRows, 'workCenter', (row) => row.workCenterName),
        supervisor: buildBreakdown(filteredRows, 'supervisor', (row) => row.supervisorName),
        project: buildBreakdown(filteredRows, 'project', (row) => `${row.projectCode} - ${row.projectName}`).slice(0, 30),
        period: buildBreakdown(filteredRows, 'period', (row) => row.periodName),
        department: buildBreakdown(filteredRows, 'department', (row) => row.department),
        location: buildBreakdown(filteredRows, 'location', (row) => row.location),
        costCentre: buildBreakdown(filteredRows, 'costCentre', (row) => row.costCentre),
        projectManager: buildBreakdown(filteredRows, 'projectManager', (row) => row.projectManager),
        exception: buildBreakdown(filteredRows.filter((row) => row.exceptionType !== 'None'), 'exception', (row) => row.exceptionType),
      },
      widgets: [
        { id: 'trend-hours', title: 'Historical Trend Analysis', value: `${round(summarizeRows(filteredRows).totalHoursWorked)}h`, detail: 'Total worked hours in selected period' },
        { id: 'comparative-period', title: 'Comparative Period Analysis', value: `${round(summarizeRows(filteredRows).complianceRate)}%`, detail: 'Timesheet compliance rate' },
        { id: 'powerbi-ready', title: 'Enterprise Analytics Feed', value: 'Ready', detail: 'CSV/Excel/PDF/Power BI/Fabric integration point' },
      ],
      subscriptions: [
        { id: 'daily-exceptions', name: 'Daily Exception Digest', cadence: 'Daily 07:00', channels: 'Email, In-App', status: 'Configured' },
        { id: 'payroll-ready', name: 'Payroll Ready Hours', cadence: 'Period Close', channels: 'Email, CSV Export', status: 'Configured' },
        { id: 'project-cost', name: 'Project Labour Cost Report', cadence: 'Weekly', channels: 'Email, Power BI Dataset', status: 'Planned' },
      ],
      integrations: ['Power BI', 'Microsoft Fabric', 'Sage ERP', 'Enterprise Analytics Platform'],
      audit: {
        exportedBy: uiPermissions.actor,
        generatedAt: new Date().toISOString(),
        sourceModule: 'Timesheet Reporting and Analytics',
        actionHistory: exportMode ? `Full capture export (${filteredRows.length} rows)` : 'Report viewed/generated',
        changeTracking: 'Read-only reporting payload; source timesheet changes remain in workflow history.',
      },
      filterOptions: {
        periods: Array.from(new Map(scopedRows.map((row) => [row.periodId, { id: row.periodId, name: row.periodName }])).values()).sort((a, b) => b.id.localeCompare(a.id)),
        statuses: Array.from(new Set(scopedRows.map((row) => row.normalizedStatus))).sort(),
        supervisors: Array.from(new Set(scopedRows.map((row) => row.supervisorName))).sort(),
        workCenters: Array.from(new Set(scopedRows.map((row) => row.workCenterName))).sort(),
        projects: Array.from(new Set(scopedRows.map((row) => row.projectCode))).sort(),
        employees: Array.from(new Set(scopedRows.map((row) => row.employeeName))).sort(),
        departments: masterEmployeeValues((employee) => employee.department),
        sections: masterEmployeeValues((employee) => employee.section || employee.unit),
        businessUnits: masterEmployeeValues((employee) => employee.businessUnit),
        costCentres: masterCostCentres,
        locations: masterEmployeeValues((employee) => employee.location || employee.workLocation),
        jobCodes: Array.from(new Set(scopedRows.map((row) => row.jobCode))).sort(),
        activityCodes: Array.from(new Set(scopedRows.map((row) => row.activityCode))).sort(),
        projectManagers: Array.from(new Set(scopedRows.map((row) => row.projectManager))).sort(),
        employeeCategories: Array.from(new Set(scopedRows.map((row) => row.employeeCategory))).sort(),
        employmentTypes: Array.from(new Set(scopedRows.map((row) => row.employmentType))).sort(),
        overtimeStatuses: Array.from(new Set(scopedRows.map((row) => row.overtimeStatus))).sort(),
      },
    };

    return ok(payload);
  } catch (error) {
    console.error('Timesheet Reports API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Unable to build timesheet reports.');
  }
}
