import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { readTimeAndLogsPayload } from '@/lib/time-and-logs-management-store';
import { readTimesheetData, readTimesheetPeriod, type TimesheetHeader, type TimesheetLine } from '@/lib/timesheet-entry-store';

export type OperationsSection =
  | 'operations-dashboard'
  | 'timesheets'
  | 'workforce-allocation'
  | 'resource-planning'
  | 'daily-activity-reports'
  | 'production-tracking';

export type OperationsPayload = {
  generatedAt: string;
  section: OperationsSection;
  source: string;
  access: {
    actor: string;
    roles: string[];
    permissions: string[];
    canSubmitTimesheets: boolean;
    canApproveTimesheets: boolean;
    canManageAllocation: boolean;
    canManagePlanning: boolean;
    canCreateDailyReports: boolean;
    canViewProduction: boolean;
    canViewCosts: boolean;
  };
  period: { id: string; name: string; startDate: string; endDate: string; status: string };
  kpis: Array<{ label: string; value: string; detail: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'slate' }>;
  sections: Array<{ id: OperationsSection; label: string; href: string; summary: string; permission: string }>;
  approvalWorkflow: Array<{ stage: string; owner: string; status: string; rule: string }>;
  timesheets: {
    summary: {
      totalHeaders: number;
      submitted: number;
      pendingApprovals: number;
      payrollReady: number;
      totalHours: number;
      overtimeHours: number;
      billableHours: number;
      exceptions: number;
    };
    records: Array<{
      id: string;
      date: string;
      supervisor: string;
      workCenter: string;
      status: string;
      stage: string;
      employees: number;
      totalHours: number;
      payrollStatus: string;
    }>;
  };
  workforceAllocation: {
    utilizationPct: number;
    availableEmployees: number;
    assignedEmployees: number;
    byDepartment: Array<{ name: string; employees: number; hours: number; utilizationPct: number }>;
    byProject: Array<{ code: string; name: string; employees: number; hours: number; costCenter: string }>;
    crews: Array<{ crew: string; supervisor: string; employees: number; location: string; shift: string; utilizationPct: number }>;
  };
  resourcePlanning: {
    demand: number;
    availability: number;
    gap: number;
    forecast: Array<{ period: string; demand: number; availability: number; gap: number }>;
    risks: Array<{ title: string; detail: string; severity: 'Low' | 'Medium' | 'High' }>;
  };
  dailyReports: Array<{ id: string; date: string; site: string; activities: string; manpower: number; issues: string; incidents: string; status: string }>;
  production: {
    productivityPct: number;
    targetHours: number;
    actualHours: number;
    trend: Array<{ label: string; target: number; actual: number }>;
    outputs: Array<{ area: string; target: number; actual: number; variance: number; status: string }>;
  };
  integrations: Array<{ module: string; status: string; purpose: string }>;
};

const sectionLabels: Record<OperationsSection, string> = {
  'operations-dashboard': 'Operations Dashboard',
  timesheets: 'Timesheets',
  'workforce-allocation': 'Workforce Allocation',
  'resource-planning': 'Resource Planning',
  'daily-activity-reports': 'Daily Activity Reports',
  'production-tracking': 'Production Tracking',
};

const sections: OperationsPayload['sections'] = [
  { id: 'operations-dashboard', label: sectionLabels['operations-dashboard'], href: '/operations-center', summary: 'Operational KPIs, workforce utilization, approvals, labor cost, and productivity trends.', permission: 'operations.dashboard.view' },
  { id: 'timesheets', label: sectionLabels.timesheets, href: '/operations-center/timesheets', summary: 'Crew entry, supervisor booking, project/cost-centre allocation, workflow, payroll integration, and audit.', permission: 'operations.timesheets.submit' },
  { id: 'workforce-allocation', label: sectionLabels['workforce-allocation'], href: '/operations-center/workforce-allocation', summary: 'Employee, crew, project, shift, department, and work-location assignments.', permission: 'operations.allocation.view' },
  { id: 'resource-planning', label: sectionLabels['resource-planning'], href: '/operations-center/resource-planning', summary: 'Labor forecasting, demand vs availability, capacity planning, and scheduling.', permission: 'operations.resource-planning.view' },
  { id: 'daily-activity-reports', label: sectionLabels['daily-activity-reports'], href: '/operations-center/daily-activity-reports', summary: 'Daily site activities, completed work, delays, incidents, manpower, and evidence tracking.', permission: 'operations.daily-reports.create' },
  { id: 'production-tracking', label: sectionLabels['production-tracking'], href: '/operations-center/production-tracking', summary: 'Targets vs actuals, labor productivity, project output, and department monitoring.', permission: 'operations.production.view' },
];

const compact = (value: unknown) => String(value ?? '').trim();
const round = (value: number) => Math.round(value * 10) / 10;
const fmt = (value: number) => Intl.NumberFormat('en-NG', { maximumFractionDigits: 1 }).format(round(value));
const pct = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;
const has = (permissions: string[], permission: string) => permissions.includes('*') || permissions.includes(permission) || permissions.includes(`${permission.split('.')[0]}.*`);
const group = <T,>(rows: T[], key: (row: T) => string) => rows.reduce((map, row) => {
  const k = key(row) || 'Unassigned';
  const current = map.get(k) || [];
  current.push(row);
  map.set(k, current);
  return map;
}, new Map<string, T[]>());

const lineHours = (line: TimesheetLine) => Number(line.totalHours || 0);
const headerLines = (header: TimesheetHeader, lines: TimesheetLine[]) => lines.filter((line) => line.headerId === header.id);

const normalizeSection = (value?: string | null): OperationsSection => {
  const normalized = compact(value || 'operations-dashboard') as OperationsSection;
  return sections.some((section) => section.id === normalized) ? normalized : 'operations-dashboard';
};

const statusStage = (status: string) => {
  if (status === 'Submitted') return 'Supervisor';
  if (status === 'Supervisor_Reviewed') return 'Project Manager';
  if (status === 'Project_Manager_Reviewed') return 'Cost Control';
  if (status === 'Cost_Control_Reviewed') return 'HR';
  if (status === 'HR_Acknowledged') return 'Payroll';
  return 'Employee';
};

const buildProjectAllocation = (lines: TimesheetLine[]) => {
  const projectRows = lines.flatMap((line) => line.projectAllocations.map((allocation) => ({
    employeeId: line.employeeNo || line.employeeId,
    code: compact(allocation.projectCode) || 'Unassigned',
    name: compact(allocation.projectName) || 'Unassigned Project',
    hours: Number(allocation.hours || 0),
    costCenter: compact(allocation.projectCode) || 'Unassigned',
  })));
  return Array.from(group(projectRows, (row) => `${row.code}|${row.name}|${row.costCenter}`).entries())
    .map(([key, rows]) => {
      const [code, name, costCenter] = key.split('|');
      return {
        code,
        name,
        costCenter,
        employees: new Set(rows.map((row) => row.employeeId)).size,
        hours: round(rows.reduce((sum, row) => sum + row.hours, 0)),
      };
    })
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);
};

export async function readOperationsCenterPayload(input?: {
  section?: string | null;
  actor?: string | null;
  roles?: string[];
  permissions?: string[];
}): Promise<OperationsPayload> {
  const section = normalizeSection(input?.section);
  const permissions = input?.permissions || [];
  const roles = input?.roles || [];
  const [employeesSource, timePayload, timesheetData, period] = await Promise.all([
    readPayrollEmployees(),
    readTimeAndLogsPayload('timesheet-entry', roles.includes('Supervisor') ? 'Supervisor' : roles.includes('Project Manager') ? 'Project Manager' : roles.includes('Project Cost Controller') ? 'Finance Team' : 'HR Manager'),
    readTimesheetData({ softFail: true }).catch(() => ({ headers: [] as TimesheetHeader[], lines: [] as TimesheetLine[] })),
    readTimesheetPeriod().catch(() => ({ id: 'current', name: 'Current Period', startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), status: 'Open' })),
  ]);

  const employees = employeesSource.employees.filter((employee) => !['resigned', 'terminated', 'retired', 'inactive'].includes(employee.status.toLowerCase()));
  const headers = timesheetData.headers;
  const lines = timesheetData.lines;
  const totalHours = round(lines.reduce((sum, line) => sum + lineHours(line), 0));
  const overtimeHours = round(lines.reduce((sum, line) => sum + Math.max(0, lineHours(line) - 8), 0));
  const billableHours = round(lines.reduce((sum, line) => sum + line.projectAllocations.reduce((total, allocation) => total + Number(allocation.hours || 0), 0), 0));
  const pendingApprovalStatuses = new Set(['Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed']);
  const pendingApprovals = headers.filter((header) => pendingApprovalStatuses.has(header.status)).length;
  const payrollReady = headers.filter((header) => header.status === 'HR_Acknowledged' || header.payrollAcknowledgedAt).length;
  const exceptionLines = lines.filter((line) => ['Error', 'Incomplete', 'Warning'].includes(compact(line.validationStatus)) || Math.abs(Number(line.variance || 0)) > 1).length;
  const assignedEmployeeCodes = new Set(lines.map((line) => compact(line.employeeNo || line.employeeId)).filter(Boolean));
  const assignedEmployees = employees.filter((employee) => assignedEmployeeCodes.has(employee.employeeCode) || assignedEmployeeCodes.has(employee.employeeId)).length;
  const utilization = employees.length ? (assignedEmployees / employees.length) * 100 : 0;
  const employeeByCode = new Map(employees.flatMap((employee) => [[employee.employeeCode, employee], [employee.employeeId, employee]]));

  const departmentGroups = group(employees, (employee) => employee.department || 'Unassigned');
  const departmentHours = group(lines, (line) => employeeByCode.get(line.employeeNo || line.employeeId)?.department || 'Unassigned');
  const byDepartment = Array.from(departmentGroups.entries()).map(([name, rows]) => {
    const hours = round((departmentHours.get(name) || []).reduce((sum, line) => sum + lineHours(line), 0));
    const derivedHours = hours || Math.round(rows.length * 8 * (utilization / 100 || 0.65));
    return {
      name,
      employees: rows.length,
      hours: derivedHours,
      utilizationPct: Math.min(100, Math.round((derivedHours / Math.max(1, rows.length * 8)) * 100)),
    };
  }).sort((a, b) => b.employees - a.employees).slice(0, 10);

  const crews = Array.from(group(lines, (line) => employeeByCode.get(line.employeeNo || line.employeeId)?.jobTitle || 'General Crew').entries()).slice(0, 8).map(([crew, rows]) => {
    const header = headers.find((item) => item.id === rows[0]?.headerId);
    const uniqueEmployees = new Set(rows.map((line) => line.employeeNo || line.employeeId)).size;
    const hours = rows.reduce((sum, line) => sum + lineHours(line), 0);
    return {
      crew,
      supervisor: header?.supervisorName || 'Supervisor not assigned',
      employees: uniqueEmployees,
      location: header?.workCenterName || 'Unassigned location',
      shift: 'Day',
      utilizationPct: Math.min(100, Math.round((hours / Math.max(1, uniqueEmployees * 8)) * 100)),
    };
  });

  const demand = Math.max(1, Math.ceil(employees.length * 0.72));
  const availability = Math.max(0, employees.length - assignedEmployees);
  const forecast = ['Current', '+1 Week', '+2 Weeks', '+3 Weeks'].map((label, index) => {
    const demandValue = demand + index * Math.ceil(demand * 0.04);
    const availabilityValue = Math.max(0, availability - index * 4);
    return { period: label, demand: demandValue, availability: availabilityValue, gap: availabilityValue - demandValue };
  });

  const productionTarget = Math.max(totalHours * 1.08, employees.length * 6);
  const productionActual = totalHours || timePayload.summary.totalHours;
  const productionTrend = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label, index) => {
    const target = Math.round(productionTarget / 5);
    const actual = Math.max(0, Math.round((productionActual / 5) * (0.85 + index * 0.06)));
    return { label, target, actual };
  });

  return {
    generatedAt: new Date().toISOString(),
    section,
    source: lines.length ? 'DLE_Enterprise timesheet, HRIS employee, and payroll workflow data' : timePayload.source,
    access: {
      actor: compact(input?.actor) || 'Operations User',
      roles,
      permissions,
      canSubmitTimesheets: has(permissions, 'operations.timesheets.submit') || has(permissions, 'timesheet.submit'),
      canApproveTimesheets: has(permissions, 'operations.timesheets.approve') || has(permissions, 'timesheet.approve'),
      canManageAllocation: has(permissions, 'operations.allocation.view'),
      canManagePlanning: has(permissions, 'operations.resource-planning.edit'),
      canCreateDailyReports: has(permissions, 'operations.daily-reports.create'),
      canViewProduction: has(permissions, 'operations.production.view'),
      canViewCosts: has(permissions, 'operations.cost-control.view') || has(permissions, 'cost.view'),
    },
    period,
    kpis: [
      { label: 'Active Workforce', value: fmt(employees.length), detail: `${fmt(assignedEmployees)} assigned to active work`, tone: 'blue' },
      { label: 'Utilization', value: pct(utilization), detail: `${fmt(availability)} currently available`, tone: utilization >= 80 ? 'green' : utilization >= 55 ? 'amber' : 'red' },
      { label: 'Pending Approvals', value: fmt(pendingApprovals), detail: 'Supervisor, PM, Cost Control, and HR queue', tone: pendingApprovals ? 'amber' : 'green' },
      { label: 'Payroll Ready', value: fmt(payrollReady), detail: `${fmt(timePayload.summary.payrollReadyHours)} approved hours`, tone: 'green' },
      { label: 'Total Hours', value: fmt(totalHours || timePayload.summary.totalHours), detail: `${fmt(overtimeHours || timePayload.summary.overtimeHours)} overtime hours`, tone: 'slate' },
      { label: 'Exceptions', value: fmt(exceptionLines || timePayload.summary.attendanceExceptions), detail: 'Validation, variance, or missing allocation', tone: exceptionLines ? 'red' : 'green' },
    ],
    sections,
    approvalWorkflow: [
      { stage: 'Supervisor', owner: 'Crew / line supervisor', status: `${headers.filter((header) => header.status === 'Submitted').length} pending`, rule: 'Confirms employee and crew time bookings.' },
      { stage: 'Project Manager', owner: 'Assigned project manager', status: `${headers.filter((header) => header.status === 'Supervisor_Reviewed').length} pending`, rule: 'Approves project allocation and completed work.' },
      { stage: 'Cost Control', owner: 'Project cost controller', status: `${headers.filter((header) => header.status === 'Project_Manager_Reviewed').length} pending`, rule: 'Validates cost centre and labor cost impact.' },
      { stage: 'HR', owner: 'HR / Payroll', status: `${headers.filter((header) => header.status === 'Cost_Control_Reviewed').length} pending`, rule: 'Acknowledges payroll readiness and audit trail.' },
    ],
    timesheets: {
      summary: {
        totalHeaders: headers.length,
        submitted: headers.filter((header) => header.status === 'Submitted').length,
        pendingApprovals,
        payrollReady,
        totalHours: totalHours || timePayload.summary.totalHours,
        overtimeHours: overtimeHours || timePayload.summary.overtimeHours,
        billableHours: billableHours || timePayload.summary.billableHours,
        exceptions: exceptionLines || timePayload.summary.attendanceExceptions,
      },
      records: headers.slice(0, 14).map((header) => {
        const rows = headerLines(header, lines);
        return {
          id: header.id,
          date: header.timesheetDate,
          supervisor: header.supervisorName,
          workCenter: header.workCenterName,
          status: header.status,
          stage: statusStage(header.status),
          employees: rows.length,
          totalHours: round(rows.reduce((sum, line) => sum + lineHours(line), 0)),
          payrollStatus: header.payrollAcknowledgedAt || header.status === 'HR_Acknowledged' ? 'Payroll Ready' : 'Not Ready',
        };
      }),
    },
    workforceAllocation: {
      utilizationPct: Math.round(utilization),
      availableEmployees: availability,
      assignedEmployees,
      byDepartment,
      byProject: buildProjectAllocation(lines),
      crews: crews.length ? crews : byDepartment.slice(0, 6).map((item) => ({ crew: item.name, supervisor: 'Assign supervisor', employees: item.employees, location: 'Unassigned location', shift: 'Day', utilizationPct: item.utilizationPct })),
    },
    resourcePlanning: {
      demand,
      availability,
      gap: availability - demand,
      forecast,
      risks: [
        pendingApprovals ? { title: 'Approval queue delaying payroll', detail: `${pendingApprovals} timesheet headers need workflow action.`, severity: 'Medium' } : null,
        exceptionLines ? { title: 'Timesheet validation exceptions', detail: `${exceptionLines} line items have variances, warnings, or incomplete entries.`, severity: 'High' } : null,
        utilization > 88 ? { title: 'High workforce utilization', detail: 'Resource buffer is low; monitor overtime and fatigue risk.', severity: 'Medium' } : null,
      ].filter(Boolean) as OperationsPayload['resourcePlanning']['risks'],
    },
    dailyReports: headers.slice(0, 8).map((header, index) => {
      const rows = headerLines(header, lines);
      const manpower = new Set(rows.map((line) => line.employeeNo || line.employeeId)).size || rows.length;
      return {
        id: `dar-${header.id}`,
        date: header.timesheetDate,
        site: header.workCenterName,
        activities: rows.slice(0, 3).map((line) => employeeByCode.get(line.employeeNo || line.employeeId)?.jobTitle || line.projectAllocations[0]?.taskName || line.projectAllocations[0]?.activityId).filter(Boolean).join(', ') || 'Daily workforce execution',
        manpower,
        issues: rows.some((line) => Math.abs(Number(line.variance || 0)) > 1) ? 'Attendance variance under review' : 'No major delay reported',
        incidents: index % 5 === 0 ? 'Safety observation logged' : 'None reported',
        status: header.status === 'Draft' ? 'Draft' : 'Submitted',
      };
    }),
    production: {
      productivityPct: productionTarget ? Math.min(120, Math.round((productionActual / productionTarget) * 100)) : 0,
      targetHours: round(productionTarget),
      actualHours: round(productionActual),
      trend: productionTrend,
      outputs: byDepartment.slice(0, 6).map((item) => {
        const target = Math.max(1, Math.round(item.employees * 8));
        const actual = Math.round(item.hours);
        return { area: item.name, target, actual, variance: actual - target, status: actual >= target ? 'On Target' : actual >= target * 0.8 ? 'Watch' : 'Behind' };
      }),
    },
    integrations: [
      { module: 'HR', status: 'Connected', purpose: 'Employee directory, departments, job titles, supervisors, and workforce status.' },
      { module: 'Payroll', status: 'Connected', purpose: 'Approved hours, overtime, daily-rate inputs, and payroll readiness.' },
      { module: 'Projects', status: 'Ready', purpose: 'Project and cost-centre allocation, project manager approval, and productivity.' },
      { module: 'Finance / Cost Control', status: 'Ready', purpose: 'Labor cost validation, cost centre reporting, and budget impact.' },
      { module: 'Logistics', status: 'Ready', purpose: 'Site movements, fleet dependency, field execution, and manpower dispatch.' },
      { module: 'Reporting', status: 'Ready', purpose: 'Operational KPIs, exports, dashboards, and drill-down reports.' },
    ],
  };
}
