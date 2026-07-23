import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { buildBaseAttendanceRecords } from '@/lib/attendance-data';
import { readLiveClockingActivity } from '@/lib/biometric-live-attendance-store';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { normalizePayrollMatchKey, readActiveSagePayrollEmployeeKeys, type SagePayrollEmployee } from '@/lib/sage-people-payroll-store';
import { approvedPaidLeaveForDate } from '@/lib/leave-management-store';
import { readSupervisorAssignments } from '@/lib/supervisor-assignment-store';
import {
  DAILY_BREAK_HOURS,
  STANDARD_TIMESHEET_HOURS,
  attendanceDurationFromClock,
  dedupeTimesheetLinesByEmployee,
  isTimesheetPaidLeaveLine,
  normalizeIdleAllocations,
  normalizeProjectAllocations,
  type TimesheetLine,
} from '@/lib/timesheet-entry-shared';

export type { TimesheetLine } from '@/lib/timesheet-entry-shared';
export { DAILY_BREAK_HOURS, STANDARD_TIMESHEET_HOURS, isTimesheetPaidLeaveLine } from '@/lib/timesheet-entry-shared';

export type TimesheetStatus =
  | 'Draft'
  | 'Submitted'
  | 'Supervisor_Reviewed'
  | 'Project_Manager_Reviewed'
  | 'Cost_Control_Reviewed'
  | 'GM_Operations_Reviewed'
  | 'HR_Acknowledged'
  | 'HR_Reviewed'
  | 'Project_Control_Reviewed'
  | 'Approved'
  | 'Locked'
  | 'Rejected'
  | 'Returned';

export type WorkflowStage = {
  id: TimesheetStatus;
  label: string;
  order: number;
};

export const workflowStages: WorkflowStage[] = [
  { id: 'Draft', label: 'Draft', order: 1 },
  { id: 'Submitted', label: 'Supervisor Review', order: 2 },
  { id: 'Supervisor_Reviewed', label: 'Project Manager Review', order: 3 },
  { id: 'Project_Manager_Reviewed', label: 'Cost Control Review', order: 4 },
  { id: 'Cost_Control_Reviewed', label: 'GM Operations Review', order: 5 },
  { id: 'GM_Operations_Reviewed', label: 'HR Review', order: 6 },
  { id: 'HR_Acknowledged', label: 'Payroll Ready', order: 7 },
  { id: 'Locked', label: 'Payroll Lock', order: 8 },
];
export type TimesheetApprovalDecision = 'Pending' | 'Approved' | 'Rejected' | 'Returned' | 'Locked';
export type TimesheetEntryMode =
  | 'Employee Self-Service'
  | 'Supervisor Entry'
  | 'Bulk Team Entry'
  | 'Project Engineer Entry'
  | 'Foreman Entry';

export type TimesheetPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'Open' | 'Closed' | 'Locked';
  openedAt?: string | null;
  openedBy?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type TimesheetPeriodSummary = TimesheetPeriod & {
  totalHeaders: number;
  draftHeaders: number;
  submittedHeaders: number;
  approvedHeaders: number;
  totalEmployees: number;
  totalHours: number;
};

export type IdleReason = {
  id: string;
  code: string;
  name: string;
  description: string;
};

export type TimesheetHeader = {
  id: string;
  periodId: string;
  timesheetDate: string;
  supervisorId: string;
  supervisorName: string;
  workCenterId: string;
  workCenterName: string;
  status: TimesheetStatus;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lastSyncAt: string | null;
  /** Timesheet shift label, e.g. "01 (Day)" / "02 (Night)". */
  shiftLabel?: string | null;
  workflowHistory?: TimesheetWorkflowEvent[];
  payrollAcknowledgedAt?: string | null;
  payrollAcknowledgedBy?: string | null;
  projectManager?: string | null;
  projectManagerProjectCode?: string | null;
  currentApprovalStage?: TimesheetWorkflowStage | null;
  currentApprover?: string | null;
};

export type TimesheetWorkflowStage = 'Supervisor' | 'Project Manager' | 'Cost Control' | 'GM Operations' | 'HR' | 'Payroll';
export type TimesheetWorkflowDecision = 'Submitted' | 'Approved' | 'Acknowledged' | 'Rejected' | 'Returned' | 'Overtime Booked' | 'Overtime Correction Posted';
export type TimesheetWorkflowEvent = {
  stage: TimesheetWorkflowStage;
  decision: TimesheetWorkflowDecision;
  by: string;
  actedAt: string;
  comment: string | null;
};

export type TimesheetPayrollUpdate = {
  id: string;
  periodId: string;
  periodName: string;
  acknowledgedAt: string;
  acknowledgedBy: string;
  headerIds: string[];
  employeeAttendance: Array<{
    employeeId: string;
    employeeName: string;
    daysWorked: number;
    attendanceHours: number;
    bookedHours: number;
    idleHours: number;
  }>;
};

export type HourType =
  | 'Project Work'
  | 'Internal Work'
  | 'Meeting'
  | 'Training'
  | 'Travel'
  | 'Idle'
  | 'Standby'
  | 'Equipment Downtime'
  | 'Material Delay'
  | 'Waiting Instruction'
  | 'Leave'
  | 'Holiday'
  | 'Overtime'
  | 'Rework'
  | 'Safety Meeting'
  | 'Toolbox Talk'
  | 'No Assignment';
export type AllocationBucket =
  | 'Productive Time'
  | 'Non-Productive Time'
  | 'Idle Time'
  | 'Rework Time'
  | 'Safety Meeting Time'
  | 'Toolbox Talk Time'
  | 'Travel Time'
  | 'Waiting Material Time'
  | 'Waiting Instruction Time'
  | 'Equipment Downtime Time'
  | 'Leave Time';
export type ColumnKind = 'project' | 'internal' | 'idle' | 'leave';

export type ProjectTask = {
  id: string;
  name: string;
  activityId?: string;
  activityName?: string;
};

export type Project = {
  id: string;
  code: string;
  name: string;
  clientName: string;
  site: string;
  projectManager: string;
  status: 'Active' | 'Approved' | 'Open' | 'Completed' | 'Suspended' | 'Closed' | 'Archived';
  tasks?: ProjectTask[];
};

export type TimesheetWorkCenter = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  site: string | null;
  status: 'Active' | 'Inactive';
  sourceSystem: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TimesheetDepartment = {
  id: string;
  code: string;
  name: string;
  sourceSystem: string;
  updatedAt?: string | null;
};

export type TimesheetLocation = {
  id: string;
  code: string;
  name: string;
  site: string | null;
  sourceSystem: string;
  updatedAt?: string | null;
};

export type DisplayColumn = {
  code: string;
  label: string;
  kind: ColumnKind;
};

export type ProjectCatalogItem = {
  code: string;
  label: string;
  name: string;
  kind: ColumnKind;
  hourType: HourType;
  billable: boolean;
  phase: string;
  workPackage: string;
  activity: string;
  task: string;
  costCode: string;
  wbs: string;
  client: string | null;
};

export type TimesheetAllocation = {
  id: string;
  projectCode: string;
  projectName: string;
  projectLabel: string;
  kind: ColumnKind;
  hourType: HourType;
  bucket: AllocationBucket;
  phase: string;
  workPackage: string;
  activity: string;
  task: string;
  costCode: string;
  wbs: string;
  hours: number;
  billable: boolean;
  labourRateNgn: number;
  labourCostNgn: number;
};

export type TimesheetApprovalStep = {
  stage: 'Employee' | 'Supervisor' | 'Project Engineer' | 'Department Head' | 'HR' | 'Payroll';
  status: TimesheetApprovalDecision;
  by: string | null;
  actedAt: string | null;
  comment: string | null;
};

export type TimesheetRecord = {
  id: string;
  timesheetDate: string;
  employeeId: string;
  employeeName: string;
  department: string;
  businessUnit: string;
  location: string;
  site: string;
  supervisor: string;
  shift: string;
  labourRateNgn: number;
  standardHours: number;
  overtimeHours: number;
  approvedOvertimeHours: number;
  mode: TimesheetEntryMode;
  status: TimesheetStatus;
  remarks: string | null;
  submittedAt: string | null;
  updatedAt: string;
  allocations: TimesheetAllocation[];
  approvals: TimesheetApprovalStep[];
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = process.env.DLE_HRIS_DATA_DIR ? path.resolve(process.env.DLE_HRIS_DATA_DIR) : path.join(resolveDashboardRoot(), 'data', 'hris');
const FILE_PATH = path.join(DATA_DIR, 'timesheet-entry.json');
const uniquePaths = (paths: Array<string | null | undefined>) => Array.from(new Set(paths.reduce<string[]>((items, item) => {
  if (item) items.push(path.normalize(item));
  return items;
}, [])));
const repoMirrorPath = (file: string) => {
  const normalizedFile = path.normalize(file);
  const markers = [
    path.normalize(path.join('deployment', 'iis', 'site', 'apps', 'dashboard', 'data', 'hris')),
    path.normalize(path.join('deployment', 'iis', 'site-publish', 'apps', 'dashboard', 'data', 'hris')),
  ];
  const marker = markers.find((candidate) => normalizedFile.toLowerCase().lastIndexOf(candidate.toLowerCase()) !== -1);
  if (!marker) return null;
  const markerIndex = normalizedFile.toLowerCase().lastIndexOf(marker.toLowerCase());
  const repoRoot = normalizedFile.slice(0, markerIndex);
  return path.join(repoRoot, 'apps', 'dashboard', 'data', 'hris', path.basename(normalizedFile));
};
const TIMESHEET_FILE_PATHS = uniquePaths([
  FILE_PATH,
  repoMirrorPath(FILE_PATH),
  path.join(resolveDashboardRoot(), 'data', 'hris', 'timesheet-entry.json'),
  path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'timesheet-entry.json'),
]);
const TIMESHEET_DATE = '2026-06-03';
export const normalizePaidWorkHours = (hours: number) => {
  const value = Number.isFinite(hours) ? hours : 0;
  if (value <= STANDARD_TIMESHEET_HOURS) return Math.max(0, Math.round(value * 10) / 10);
  return Math.max(0, Math.round((value - DAILY_BREAK_HOURS) * 10) / 10);
};

const projectCatalog: ProjectCatalogItem[] = [
  { code: 'PRJ-001', label: 'PRJ-001', name: 'Dangote Refinery Pipe Fabrication', kind: 'project', hourType: 'Project Work', billable: true, phase: 'Mechanical', workPackage: 'Pipe Shop', activity: 'Pipe Fabrication', task: 'Fit-Up and Welding', costCode: 'FAB-001', wbs: 'PRJ-001.MEC.PSHOP.FAB', client: 'Dangote Refinery' },
  { code: 'PRJ-002', label: 'PRJ-002', name: 'NLNG Train 7 E&I Works', kind: 'project', hourType: 'Project Work', billable: true, phase: 'E&I', workPackage: 'Commissioning Loop', activity: 'Instrumentation Calibration', task: 'Loop Testing', costCode: 'EIN-014', wbs: 'PRJ-002.EIN.CAL.LOOP', client: 'NLNG' },
  { code: 'PRJ-003', label: 'PRJ-003', name: 'Bonga Shutdown Support', kind: 'project', hourType: 'Project Work', billable: true, phase: 'Shutdown', workPackage: 'Maintenance Bundle', activity: 'Shutdown Maintenance', task: 'Critical Path Support', costCode: 'SD-301', wbs: 'PRJ-003.SD.MNT.CRIT', client: 'Shell' },
  { code: 'PRJ-004', label: 'PRJ-004', name: 'Marine Logistics Operations', kind: 'project', hourType: 'Project Work', billable: true, phase: 'Operations', workPackage: 'Jetty Support', activity: 'Marine Logistics', task: 'Crew and Materials Dispatch', costCode: 'OPS-003', wbs: 'PRJ-004.OPS.JETTY.LOG', client: 'Offshore Support' },
  { code: 'INTERNAL', label: 'INTERNAL', name: 'Internal Operations', kind: 'internal', hourType: 'Internal Work', billable: false, phase: 'Corporate', workPackage: 'Internal Delivery', activity: 'Internal Operations', task: 'Administrative Support', costCode: 'INT-001', wbs: 'INT.CORP.OPS', client: null },
  { code: 'TRAINING', label: 'TRAINING', name: 'Training and Competency', kind: 'internal', hourType: 'Training', billable: false, phase: 'Capability', workPackage: 'Workforce Development', activity: 'Training', task: 'Technical and HSE Training', costCode: 'TRN-010', wbs: 'INT.CAP.TRN', client: null },
  { code: 'MEETING', label: 'MEETING', name: 'Meeting and Coordination', kind: 'internal', hourType: 'Meeting', billable: false, phase: 'Coordination', workPackage: 'Team Governance', activity: 'Meeting', task: 'Production and Coordination Meeting', costCode: 'MGT-020', wbs: 'INT.MGT.MEET', client: null },
  { code: 'TRAVEL', label: 'TRAVEL', name: 'Work Travel', kind: 'internal', hourType: 'Travel', billable: false, phase: 'Mobilization', workPackage: 'Field Movement', activity: 'Travel', task: 'Travel to Worksite', costCode: 'TRV-100', wbs: 'INT.MOB.TRAVEL', client: null },
  { code: 'SAFETY', label: 'SAFETY', name: 'Safety Meeting Time', kind: 'internal', hourType: 'Safety Meeting', billable: false, phase: 'HSE', workPackage: 'Daily Safety', activity: 'Safety Meeting', task: 'Daily HSE Briefing', costCode: 'HSE-001', wbs: 'INT.HSE.SAFE', client: null },
  { code: 'TOOLBOX', label: 'TOOLBOX', name: 'Toolbox Talk Time', kind: 'internal', hourType: 'Toolbox Talk', billable: false, phase: 'HSE', workPackage: 'Toolbox Talk', activity: 'Toolbox Talk', task: 'Daily Toolbox Brief', costCode: 'HSE-002', wbs: 'INT.HSE.TBT', client: null },
  { code: 'REWORK', label: 'REWORK', name: 'Rework Time', kind: 'internal', hourType: 'Rework', billable: false, phase: 'Quality', workPackage: 'Correction', activity: 'Rework', task: 'Correction of Defects', costCode: 'QAL-310', wbs: 'INT.QLT.REWORK', client: null },
  { code: 'IDLE', label: 'IDLE', name: 'Idle Time', kind: 'idle', hourType: 'Idle', billable: false, phase: 'Idle', workPackage: 'Idle', activity: 'Idle Time', task: 'No Productive Work', costCode: 'IDL-001', wbs: 'IDL.TIME', client: null },
  { code: 'STANDBY', label: 'STANDBY', name: 'Standby Time', kind: 'idle', hourType: 'Standby', billable: false, phase: 'Idle', workPackage: 'Standby', activity: 'Standby', task: 'Awaiting Deployment', costCode: 'IDL-002', wbs: 'IDL.STANDBY', client: null },
  { code: 'WAIT_MATERIAL', label: 'WAIT_MATERIAL', name: 'Waiting for Materials', kind: 'idle', hourType: 'Material Delay', billable: false, phase: 'Idle', workPackage: 'Material Delay', activity: 'Waiting Material', task: 'Waiting for Material Release', costCode: 'IDL-003', wbs: 'IDL.MAT', client: null },
  { code: 'WAIT_INSTRUCTION', label: 'WAIT_INSTRUCTION', name: 'Waiting for Instructions', kind: 'idle', hourType: 'Waiting Instruction', billable: false, phase: 'Idle', workPackage: 'Instruction Delay', activity: 'Waiting Instruction', task: 'Waiting for Supervisor Direction', costCode: 'IDL-004', wbs: 'IDL.INSTR', client: null },
  { code: 'EQUIP_DOWN', label: 'EQUIP_DOWN', name: 'Equipment Downtime', kind: 'idle', hourType: 'Equipment Downtime', billable: false, phase: 'Idle', workPackage: 'Downtime', activity: 'Equipment Downtime', task: 'Equipment Unavailable', costCode: 'IDL-005', wbs: 'IDL.EQDN', client: null },
  { code: 'NO_ASSIGNMENT', label: 'NO_ASSIGNMENT', name: 'No Assignment', kind: 'idle', hourType: 'No Assignment', billable: false, phase: 'Idle', workPackage: 'No Assignment', activity: 'No Assignment', task: 'No Work Assigned', costCode: 'IDL-006', wbs: 'IDL.NOASSIGN', client: null },
  { code: 'LEAVE', label: 'LEAVE', name: 'Leave and Authorized Absence', kind: 'leave', hourType: 'Leave', billable: false, phase: 'Leave', workPackage: 'Leave', activity: 'Leave', task: 'Authorized Leave Day', costCode: 'LV-001', wbs: 'LEAVE.AUTH', client: null },
];

export const timesheetMatrixColumns: DisplayColumn[] = projectCatalog.map((item) => ({
  code: item.code,
  label: item.label,
  kind: item.kind,
}));

const approvalStages: TimesheetApprovalStep['stage'][] = ['Employee', 'Supervisor', 'Project Engineer', 'Department Head', 'HR', 'Payroll'];

const rateForEmployee = (index: number, jobTitle: string) => {
  const base = jobTitle.includes('Engineer') ? 11000 : jobTitle.includes('Supervisor') ? 12500 : jobTitle.includes('Coordinator') ? 9500 : 8000;
  return base + (index % 4) * 850;
};

const bucketForHourType = (hourType: HourType): AllocationBucket => {
  if (hourType === 'Project Work') return 'Productive Time';
  if (hourType === 'Internal Work' || hourType === 'Meeting' || hourType === 'Training') return 'Non-Productive Time';
  if (hourType === 'Rework') return 'Rework Time';
  if (hourType === 'Safety Meeting') return 'Safety Meeting Time';
  if (hourType === 'Toolbox Talk') return 'Toolbox Talk Time';
  if (hourType === 'Travel') return 'Travel Time';
  if (hourType === 'Material Delay') return 'Waiting Material Time';
  if (hourType === 'Waiting Instruction') return 'Waiting Instruction Time';
  if (hourType === 'Equipment Downtime') return 'Equipment Downtime Time';
  if (hourType === 'Leave' || hourType === 'Holiday') return 'Leave Time';
  return 'Idle Time';
};

const catalogByCode = new Map(projectCatalog.map((item) => [item.code, item]));

const cleanNamePart = (value: string | null | undefined) => String(value ?? '').trim().replace(/\s+/g, ' ');

const formatSageEmployeeFullName = (employee: SagePayrollEmployee, fallback: string) => {
  const firstNames = cleanNamePart(employee.firstNames);
  const lastName = cleanNamePart(employee.lastName);
  const fullName = [firstNames, lastName].filter(Boolean).join(' ');
  return fullName || cleanNamePart(employee.displayName) || fallback;
};

const sageTimesheetEmployeeCode = (employee: SagePayrollEmployee, fallback: string) =>
  (employee.directoryEmployeeCode || employee.employeeCode || fallback).trim().toUpperCase();

const buildAllocation = (employeeId: string, code: string, hours: number, labourRateNgn: number, suffix: string): TimesheetAllocation => {
  const meta = catalogByCode.get(code) || projectCatalog[0];
  return {
    id: `${employeeId.toLowerCase()}-${suffix}-${code.toLowerCase()}`,
    projectCode: meta.code,
    projectName: meta.name,
    projectLabel: meta.label,
    kind: meta.kind,
    hourType: meta.hourType,
    bucket: bucketForHourType(meta.hourType),
    phase: meta.phase,
    workPackage: meta.workPackage,
    activity: meta.activity,
    task: meta.task,
    costCode: meta.costCode,
    wbs: meta.wbs,
    hours,
    billable: meta.billable,
    labourRateNgn,
    labourCostNgn: Math.round(hours * labourRateNgn),
  };
};

const buildDefaultAllocations = (
  employeeId: string,
  jobTitle: string,
  businessUnit: string,
  location: string,
  status: string,
  labourRateNgn: number,
  index: number,
): TimesheetAllocation[] => {
  if (status === 'On Leave') return [buildAllocation(employeeId, 'LEAVE', STANDARD_TIMESHEET_HOURS, labourRateNgn, 'leave')];
  if (status === 'Excused') return [buildAllocation(employeeId, 'LEAVE', STANDARD_TIMESHEET_HOURS, labourRateNgn, 'excused')];
  if (status === 'Absent') return [buildAllocation(employeeId, 'NO_ASSIGNMENT', STANDARD_TIMESHEET_HOURS, labourRateNgn, 'absent')];

  if (location === 'Bonny') {
    return [
      buildAllocation(employeeId, 'PRJ-004', 4, labourRateNgn, 'main'),
      buildAllocation(employeeId, 'TOOLBOX', 0.5, labourRateNgn, 'toolbox'),
      buildAllocation(employeeId, status === 'Late' ? 'WAIT_INSTRUCTION' : 'EQUIP_DOWN', 1.5, labourRateNgn, 'delay'),
      buildAllocation(employeeId, 'PRJ-003', 2, labourRateNgn, 'support'),
    ];
  }

  if (location === 'Port Harcourt') {
    return [
      buildAllocation(employeeId, 'PRJ-001', 3, labourRateNgn, 'main'),
      buildAllocation(employeeId, 'PRJ-002', 2, labourRateNgn, 'support'),
      buildAllocation(employeeId, 'SAFETY', 0.5, labourRateNgn, 'safety'),
      buildAllocation(employeeId, status === 'Late' ? 'WAIT_MATERIAL' : 'MEETING', 1, labourRateNgn, 'coord'),
      buildAllocation(employeeId, 'IDLE', 1.5, labourRateNgn, 'idle'),
    ];
  }

  if (location === 'Warri') {
    return [
      buildAllocation(employeeId, 'PRJ-001', 4, labourRateNgn, 'main'),
      buildAllocation(employeeId, 'REWORK', jobTitle.includes('QA') ? 1.5 : 1, labourRateNgn, 'rework'),
      buildAllocation(employeeId, 'TOOLBOX', 0.5, labourRateNgn, 'toolbox'),
      buildAllocation(employeeId, status === 'Late' ? 'WAIT_INSTRUCTION' : 'PRJ-003', 2.5, labourRateNgn, 'support'),
    ];
  }

  if (businessUnit.includes('Corporate')) {
    return [
      buildAllocation(employeeId, status === 'Remote' ? 'INTERNAL' : 'PRJ-002', 4, labourRateNgn, 'main'),
      buildAllocation(employeeId, 'MEETING', 1.5, labourRateNgn, 'meeting'),
      buildAllocation(employeeId, 'TRAINING', index % 3 === 0 ? 1.5 : 1, labourRateNgn, 'training'),
      buildAllocation(employeeId, status === 'Remote' ? 'TRAVEL' : 'INTERNAL', status === 'Remote' ? 1 : 1.5, labourRateNgn, 'support'),
    ];
  }

  return [
    buildAllocation(employeeId, 'PRJ-001', 3, labourRateNgn, 'main'),
    buildAllocation(employeeId, 'PRJ-002', 2, labourRateNgn, 'second'),
    buildAllocation(employeeId, 'MEETING', 1, labourRateNgn, 'meeting'),
    buildAllocation(employeeId, 'IDLE', 2, labourRateNgn, 'idle'),
  ];
};

const buildApprovals = (employeeName: string, status: TimesheetStatus): TimesheetApprovalStep[] =>
  approvalStages.map((stage, index) => {
    if (status === 'Draft') return { stage, status: index === 0 ? 'Pending' : 'Pending', by: null, actedAt: null, comment: null };
    if (status === 'Submitted') {
      return index === 0
        ? { stage, status: 'Approved', by: employeeName, actedAt: `${TIMESHEET_DATE}T17:15:00.000Z`, comment: 'Timesheet submitted.' }
        : { stage, status: 'Pending', by: null, actedAt: null, comment: null };
    }
    if (status === 'Approved') {
      const actors = [employeeName, 'Site Supervisor', 'Project Engineer', 'Department Head', 'HR Business Partner', 'Payroll Controller'];
      return { stage, status: 'Approved', by: actors[index], actedAt: `${TIMESHEET_DATE}T${String(10 + index).padStart(2, '0')}:00:00.000Z`, comment: index === 5 ? 'Cleared for payroll.' : 'Approved.' };
    }
    if (status === 'Rejected') return index < 2 ? { stage, status: index === 0 ? 'Approved' : 'Rejected', by: index === 0 ? employeeName : 'Site Supervisor', actedAt: `${TIMESHEET_DATE}T11:00:00.000Z`, comment: index === 1 ? 'Returned due to incomplete allocation.' : 'Submitted.' } : { stage, status: 'Pending', by: null, actedAt: null, comment: null };
    if (status === 'Returned') return index < 2 ? { stage, status: index === 0 ? 'Approved' : 'Returned', by: index === 0 ? employeeName : 'Site Supervisor', actedAt: `${TIMESHEET_DATE}T11:30:00.000Z`, comment: index === 1 ? 'Please correct WBS and idle classification.' : 'Submitted.' } : { stage, status: 'Pending', by: null, actedAt: null, comment: null };
    return index < 6 ? { stage, status: 'Locked', by: index === 5 ? 'Payroll Controller' : `${stage} Approval`, actedAt: `${TIMESHEET_DATE}T18:00:00.000Z`, comment: 'Locked after payroll close.' } : { stage, status: 'Pending', by: null, actedAt: null, comment: null };
  });

const normalizeHours = (allocations: TimesheetAllocation[]) =>
  allocations
    .filter((item) => item.hours > 0)
    .map((item) => ({
      ...item,
      hours: Math.round(item.hours * 10) / 10,
      labourCostNgn: Math.round(item.hours * item.labourRateNgn),
    }));

const buildDefaultRecords = (): TimesheetRecord[] =>
  buildBaseAttendanceRecords().map((employee, index) => {
    const labourRateNgn = rateForEmployee(index, employee.jobTitle);
    let allocations = normalizeHours(buildDefaultAllocations(employee.employeeId, employee.jobTitle, employee.businessUnit, employee.location, employee.status, labourRateNgn, index));
    const totalHours = allocations.reduce((sum, item) => sum + item.hours, 0);
    if (totalHours < STANDARD_TIMESHEET_HOURS && employee.status !== 'On Leave' && employee.status !== 'Excused' && employee.status !== 'Absent') {
      allocations = normalizeHours([...allocations, buildAllocation(employee.employeeId, 'IDLE', Math.round((STANDARD_TIMESHEET_HOURS - totalHours) * 10) / 10, labourRateNgn, 'topup')]);
    }
    const adjustedTotal = allocations.reduce((sum, item) => sum + item.hours, 0);
    const overtimeHours = Math.max(0, Math.round((adjustedTotal - STANDARD_TIMESHEET_HOURS) * 10) / 10);
    const approvedOvertimeHours = index % 6 === 0 ? overtimeHours : 0;
    const status: TimesheetStatus = overtimeHours > approvedOvertimeHours ? 'Draft' : employee.status === 'Absent' ? 'Returned' : index % 5 === 0 ? 'Submitted' : 'Draft';

    return {
      id: `ts-${employee.employeeId.toLowerCase()}-${TIMESHEET_DATE}`,
      timesheetDate: TIMESHEET_DATE,
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      department: employee.department,
      businessUnit: employee.businessUnit,
      location: employee.location,
      site: employee.site,
      supervisor: employee.supervisor,
      shift: employee.shift,
      labourRateNgn,
      standardHours: STANDARD_TIMESHEET_HOURS,
      overtimeHours,
      approvedOvertimeHours,
      mode: employee.location === 'Bonny' ? 'Foreman Entry' : index % 4 === 0 ? 'Project Engineer Entry' : 'Employee Self-Service',
      status,
      remarks:
        employee.status === 'Absent'
          ? 'Absence requires supervisor confirmation.'
          : overtimeHours > approvedOvertimeHours
            ? 'Overtime captured but pending approval.'
            : null,
      submittedAt: status === 'Draft' ? null : `${TIMESHEET_DATE}T17:15:00.000Z`,
      updatedAt: `${TIMESHEET_DATE}T17:30:00.000Z`,
      allocations,
      approvals: buildApprovals(employee.employeeName, status),
    };
  });

const parseTimesheetRecords = (raw: string): TimesheetRecord[] => {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed as TimesheetRecord[] : [];
};

const readTimesheetFile = async (): Promise<TimesheetRecord[]> => {
  for (const file of TIMESHEET_FILE_PATHS) {
    try {
      return parseTimesheetRecords(await readFile(file, 'utf8'));
    } catch {
      // Try the next candidate path.
    }
  }
  return [];
};

const writeTimesheetFile = async (records: TimesheetRecord[], required: boolean) => {
  const content = JSON.stringify(records, null, 2);
  let lastError: unknown = null;
  for (const file of TIMESHEET_FILE_PATHS) {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, 'utf8');
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (required && lastError) throw lastError;
  if (lastError) console.warn('[Timesheet] Local JSON write skipped:', lastError instanceof Error ? lastError.message : lastError);
};

const ensureStore = async () => {
  for (const file of TIMESHEET_FILE_PATHS) {
    try {
      await access(file);
      return;
    } catch {
      // Try the next candidate path.
    }
  }
  await writeTimesheetFile(buildDefaultRecords(), false);
};

export const readTimesheetRecords = async (): Promise<TimesheetRecord[]> => {
  await ensureStore();
  const stored = await readTimesheetFile();

  const defaults = buildDefaultRecords();
  const storedById = new Map(stored.map((record) => [record.id, record]));
  const merged = defaults.map((record) => {
    const existing = storedById.get(record.id);
    if (!existing) return record;
    return {
      ...record,
      ...existing,
      employeeName: record.employeeName,
      department: record.department,
      businessUnit: record.businessUnit,
      location: record.location,
      site: record.site,
      supervisor: record.supervisor,
      shift: record.shift,
      labourRateNgn: existing.labourRateNgn || record.labourRateNgn,
      allocations: normalizeHours(existing.allocations?.length ? existing.allocations : record.allocations),
      approvals: existing.approvals?.length ? existing.approvals : record.approvals,
    };
  });

  await writeTimesheetFile(merged, false);
  return merged;
};

export const writeTimesheetRecords = async (records: TimesheetRecord[]) => {
  await ensureStore();
  await writeTimesheetFile(records, true);
};

export const getTimesheetProjectCatalog = () => projectCatalog;
export const getTimesheetMatrixColumns = () => timesheetMatrixColumns;
export const idleReasons: IdleReason[] = [
  { id: 'idl-001', code: 'WAIT_JOB', name: 'Waiting for job assignment', description: 'Employee present but no job assigned yet.' },
  { id: 'idl-002', code: 'WAIT_MAT', name: 'Waiting for materials', description: 'Production stopped due to material unavailability.' },
  { id: 'idl-003', code: 'WAIT_EQUIP', name: 'Waiting for equipment', description: 'Equipment breakdown or unavailable.' },
  { id: 'idl-004', code: 'WAIT_CLIENT', name: 'Waiting for client instruction', description: 'Awaiting client approval or direction.' },
  { id: 'idl-005', code: 'MACHINE_DOWN', name: 'Machine downtime', description: 'Mechanical or electrical failure.' },
  { id: 'idl-006', code: 'WEATHER', name: 'Weather disruption', description: 'Rain or severe weather preventing work.' },
  { id: 'idl-007', code: 'STANDBY', name: 'Administrative standby', description: 'Staff on standby for mobilization.' },
  { id: 'idl-008', code: 'SAFETY', name: 'Safety restriction', description: 'Work halted for safety inspections or incidents.' },
  { id: 'idl-009', code: 'BREAK', name: 'Break Time', description: 'Standard daily break time (lunch/rest).' },
];
export const defaultIdleReason = idleReasons.find((reason) => reason.code === 'BREAK') || idleReasons[0];

export const withDefaultIdleReason = <T extends { reasonId: string; reasonName: string; hours: number; remarks: string | null }>(allocation: T): T => {
  const withReason =
    allocation.reasonId || allocation.hours <= 0
      ? allocation
      : { ...allocation, reasonId: defaultIdleReason.id, reasonName: defaultIdleReason.name };
  const [normalized] = normalizeIdleAllocations([withReason]);
  return normalized;
};

export const calculateTimesheetPeriod = (date: Date = new Date()): TimesheetPeriod => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  let startYear = year;
  let startMonth = month;
  let endYear = year;
  let endMonth = month;

  if (day >= 16) {
    // Current period started 16th of current month, ends 15th of next month
    startMonth = month;
    endMonth = month + 1;
    if (endMonth > 11) {
      endMonth = 0;
      endYear++;
    }
  } else {
    // Current period started 16th of previous month, ends 15th of current month
    startMonth = month - 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear--;
    }
    endMonth = month;
  }

  const startDate = new Date(startYear, startMonth, 16);
  const endDate = new Date(endYear, endMonth, 15);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const periodName = `${monthNames[endDate.getMonth()]} ${endDate.getFullYear()} Period`;

  const formatDate = (d: Date) => {
    const offsetMs = d.getTimezoneOffset() * 60 * 1000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
  };

  return {
    id: `per-${formatDate(endDate).slice(0, 7)}`,
    name: periodName,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    status: 'Open',
  };
};

export const calculateTimesheetPeriodForMonth = (year: number, month: number): TimesheetPeriod => {
  const endDate = new Date(year, month - 1, 15);
  const startDate = new Date(year, month - 2, 16);
  return calculateTimesheetPeriod(endDate);
};

export const getTimesheetDate = () => TIMESHEET_DATE;

const dbEnsureState: { promise: Promise<void> | null } = { promise: null };

const officialTimesheetWorkCenters = [
  'Material Preparation',
  'Cutting',
  'Fitting',
  'Welding',
  'Rigging',
  'Machining',
  'Rolling & Forming',
  'Structural Assembly',
  'Surface Preparation',
  'Blasting',
  'Painting',
  'Galvanizing Preparation',
  'Galvanizing',
  'Galvanizing Finishing',
  'QA/QC',
  'NDT',
  'Dimensional Control',
  'Warehouse',
  'Logistics',
  'Loading & Offloading',
  'Packing & Preservation',
  'Maintenance',
  'Mechanical Maintenance',
  'Electrical Maintenance',
  'Instrumentation',
  'Utilities',
  'Engineering Support',
  'Planning & Production Control',
  'Project Control',
  'HSE',
  'Security',
];

const defaultProjectSites = ['Abuja', 'Bonny', 'Lagos HQ', 'Port Harcourt', 'Warri'];

const workCenterCode = (name: string) =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

const workCenterId = (name: string) => `wc-${workCenterCode(name).toLowerCase()}`;
const locationId = (name: string) => `loc-${workCenterCode(name).toLowerCase()}`;

const toIso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateOnly = (value: unknown) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const db = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    throw new Error('DLE Enterprise database is not configured. Timesheet entry data must be stored in the database before this page can be used.');
  }
  if (!dbEnsureState.promise) {
    dbEnsureState.promise = (async () => {
    // Always run CREATE IF NOT EXISTS + additive COL_LENGTH migrations.
    // Do not short-circuit when TimesheetHeaders already exists — that skips new columns (e.g. ShiftLabel).
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[TimesheetProjects]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetProjects] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_TimesheetProjects] PRIMARY KEY,
  [Code] NVARCHAR(50) NOT NULL CONSTRAINT [UQ_TimesheetProjects_Code] UNIQUE,
  [Name] NVARCHAR(255) NOT NULL,
  [ClientName] NVARCHAR(220) NULL,
  [Site] NVARCHAR(160) NOT NULL,
  [ProjectManager] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetProjects_Status] DEFAULT N'Active',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjects_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjects_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF COL_LENGTH(N'hris.TimesheetProjects', N'ProjectManager') IS NULL
ALTER TABLE [hris].[TimesheetProjects] ADD [ProjectManager] NVARCHAR(220) NULL;
IF COL_LENGTH(N'hris.TimesheetProjects', N'ClientName') IS NULL
ALTER TABLE [hris].[TimesheetProjects] ADD [ClientName] NVARCHAR(220) NULL;
IF OBJECT_ID(N'[hris].[TimesheetProjectTasks]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetProjectTasks] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_TimesheetProjectTasks] PRIMARY KEY,
  [ProjectId] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(255) NOT NULL,
  [ActivityId] NVARCHAR(80) NULL,
  [ActivityName] NVARCHAR(255) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjectTasks_CreatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [FK_TimesheetProjectTasks_Project] FOREIGN KEY ([ProjectId]) REFERENCES [hris].[TimesheetProjects]([Id]) ON DELETE CASCADE
);
IF OBJECT_ID(N'[hris].[TimesheetDepartments]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetDepartments] (
  [Id] NVARCHAR(100) NOT NULL CONSTRAINT [PK_TimesheetDepartments] PRIMARY KEY,
  [Code] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [SourceSystem] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetDepartments_SourceSystem] DEFAULT N'Sage Payroll',
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetDepartments_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[TimesheetLocations]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetLocations] (
  [Id] NVARCHAR(100) NOT NULL CONSTRAINT [PK_TimesheetLocations] PRIMARY KEY,
  [Code] NVARCHAR(80) NOT NULL,
  [Name] NVARCHAR(180) NOT NULL,
  [Site] NVARCHAR(180) NULL,
  [SourceSystem] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetLocations_SourceSystem] DEFAULT N'Sage Payroll',
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetLocations_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[TimesheetWorkCenters]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetWorkCenters] (
  [Id] NVARCHAR(100) NOT NULL CONSTRAINT [PK_TimesheetWorkCenters] PRIMARY KEY,
  [Code] NVARCHAR(80) NOT NULL CONSTRAINT [UQ_TimesheetWorkCenters_Code] UNIQUE,
  [Name] NVARCHAR(180) NOT NULL,
  [Location] NVARCHAR(180) NULL,
  [Site] NVARCHAR(180) NULL,
  [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_Status] DEFAULT N'Active',
  [SourceSystem] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_SourceSystem] DEFAULT N'HRIS',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetWorkCenters_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[hris].[TimesheetPeriods]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPeriods] (
  [Id] NVARCHAR(40) NOT NULL CONSTRAINT [PK_TimesheetPeriods] PRIMARY KEY,
  [Name] NVARCHAR(80) NOT NULL,
  [StartDate] DATE NOT NULL,
  [EndDate] DATE NOT NULL,
  [Status] NVARCHAR(20) NOT NULL,
  [OpenedAt] DATETIME2(0) NULL,
  [OpenedBy] NVARCHAR(120) NULL,
  [ClosedAt] DATETIME2(0) NULL,
  [ClosedBy] NVARCHAR(120) NULL,
  [UpdatedAt] DATETIME2(0) NULL,
  [UpdatedBy] NVARCHAR(120) NULL
);
IF OBJECT_ID(N'[hris].[TimesheetHeaders]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetHeaders] (
  [Id] NVARCHAR(160) NOT NULL CONSTRAINT [PK_TimesheetHeaders] PRIMARY KEY,
  [PeriodId] NVARCHAR(40) NOT NULL,
  [TimesheetDate] DATE NOT NULL,
  [SupervisorId] NVARCHAR(120) NOT NULL,
  [SupervisorName] NVARCHAR(180) NOT NULL,
  [WorkCenterId] NVARCHAR(100) NOT NULL,
  [WorkCenterName] NVARCHAR(180) NOT NULL,
  [Status] NVARCHAR(50) NOT NULL,
  [SubmittedAt] DATETIME2(0) NULL,
  [SubmittedBy] NVARCHAR(120) NULL,
  [ApprovedAt] DATETIME2(0) NULL,
  [ApprovedBy] NVARCHAR(120) NULL,
  [LastSyncAt] DATETIME2(0) NULL,
  [PayrollAcknowledgedAt] DATETIME2(0) NULL,
  [PayrollAcknowledgedBy] NVARCHAR(120) NULL
);
IF COL_LENGTH(N'hris.TimesheetHeaders', N'ProjectManager') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [ProjectManager] NVARCHAR(220) NULL;
IF COL_LENGTH(N'hris.TimesheetHeaders', N'ProjectManagerProjectCode') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [ProjectManagerProjectCode] NVARCHAR(50) NULL;
IF COL_LENGTH(N'hris.TimesheetHeaders', N'CurrentApprovalStage') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [CurrentApprovalStage] NVARCHAR(60) NULL;
IF COL_LENGTH(N'hris.TimesheetHeaders', N'CurrentApprover') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [CurrentApprover] NVARCHAR(220) NULL;
IF COL_LENGTH(N'hris.TimesheetHeaders', N'ShiftLabel') IS NULL
ALTER TABLE [hris].[TimesheetHeaders] ADD [ShiftLabel] NVARCHAR(40) NULL;
IF OBJECT_ID(N'[hris].[TimesheetLines]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetLines] (
  [Id] NVARCHAR(220) NOT NULL CONSTRAINT [PK_TimesheetLines] PRIMARY KEY,
  [HeaderId] NVARCHAR(160) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeNo] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [BiometricId] NVARCHAR(120) NULL,
  [AttendanceId] NVARCHAR(120) NULL,
  [ClockIn] NVARCHAR(40) NULL,
  [ClockOut] NVARCHAR(40) NULL,
  [AttendanceDuration] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_AttendanceDuration] DEFAULT 0,
  [UsedHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_UsedHours] DEFAULT 0,
  [IdleHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_IdleHours] DEFAULT 0,
  [TotalHours] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_TotalHours] DEFAULT 0,
  [Variance] DECIMAL(9,2) NOT NULL CONSTRAINT [DF_TimesheetLines_Variance] DEFAULT 0,
  [Remarks] NVARCHAR(500) NULL,
  [ValidationStatus] NVARCHAR(30) NOT NULL,
  [ValidationMessage] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetLines_Header] FOREIGN KEY ([HeaderId]) REFERENCES [hris].[TimesheetHeaders]([Id]) ON DELETE CASCADE
);
IF OBJECT_ID(N'[hris].[TimesheetProjectAllocations]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetProjectAllocations] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TimesheetProjectAllocations] PRIMARY KEY,
  [LineId] NVARCHAR(220) NOT NULL,
  [ProjectId] NVARCHAR(80) NOT NULL,
  [ProjectCode] NVARCHAR(50) NOT NULL,
  [ProjectName] NVARCHAR(255) NOT NULL,
  [TaskId] NVARCHAR(80) NULL,
  [TaskName] NVARCHAR(255) NULL,
  [ActivityId] NVARCHAR(80) NULL,
  [Hours] DECIMAL(9,2) NOT NULL,
  [Remarks] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetProjectAllocations_Line] FOREIGN KEY ([LineId]) REFERENCES [hris].[TimesheetLines]([Id]) ON DELETE CASCADE
);
IF OBJECT_ID(N'[hris].[TimesheetIdleAllocations]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetIdleAllocations] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TimesheetIdleAllocations] PRIMARY KEY,
  [LineId] NVARCHAR(220) NOT NULL,
  [ReasonId] NVARCHAR(80) NOT NULL,
  [ReasonName] NVARCHAR(180) NOT NULL,
  [Hours] DECIMAL(9,2) NOT NULL,
  [Remarks] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetIdleAllocations_Line] FOREIGN KEY ([LineId]) REFERENCES [hris].[TimesheetLines]([Id]) ON DELETE CASCADE
);
IF OBJECT_ID(N'[hris].[TimesheetWorkflowEvents]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetWorkflowEvents] (
  [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_TimesheetWorkflowEvents] PRIMARY KEY,
  [HeaderId] NVARCHAR(160) NOT NULL,
  [Stage] NVARCHAR(60) NOT NULL,
  [Decision] NVARCHAR(60) NOT NULL,
  [Actor] NVARCHAR(120) NOT NULL,
  [ActedAt] DATETIME2(0) NOT NULL,
  [Comment] NVARCHAR(500) NULL,
  CONSTRAINT [FK_TimesheetWorkflowEvents_Header] FOREIGN KEY ([HeaderId]) REFERENCES [hris].[TimesheetHeaders]([Id]) ON DELETE CASCADE
);
IF OBJECT_ID(N'[hris].[TimesheetPayrollUpdates]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPayrollUpdates] (
  [Id] NVARCHAR(160) NOT NULL CONSTRAINT [PK_TimesheetPayrollUpdates] PRIMARY KEY,
  [PeriodId] NVARCHAR(40) NOT NULL,
  [PeriodName] NVARCHAR(80) NOT NULL,
  [AcknowledgedAt] DATETIME2(0) NOT NULL,
  [AcknowledgedBy] NVARCHAR(120) NOT NULL
);
IF OBJECT_ID(N'[hris].[TimesheetPayrollUpdateHeaders]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPayrollUpdateHeaders] (
  [PayrollUpdateId] NVARCHAR(160) NOT NULL,
  [HeaderId] NVARCHAR(160) NOT NULL,
  CONSTRAINT [PK_TimesheetPayrollUpdateHeaders] PRIMARY KEY ([PayrollUpdateId], [HeaderId]),
  CONSTRAINT [FK_TimesheetPayrollUpdateHeaders_Update] FOREIGN KEY ([PayrollUpdateId]) REFERENCES [hris].[TimesheetPayrollUpdates]([Id]) ON DELETE CASCADE
);
IF OBJECT_ID(N'[hris].[TimesheetPayrollUpdateEmployees]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetPayrollUpdateEmployees] (
  [PayrollUpdateId] NVARCHAR(160) NOT NULL,
  [EmployeeId] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(220) NOT NULL,
  [DaysWorked] INT NOT NULL,
  [AttendanceHours] DECIMAL(9,2) NOT NULL,
  [BookedHours] DECIMAL(9,2) NOT NULL,
  [IdleHours] DECIMAL(9,2) NOT NULL,
  CONSTRAINT [PK_TimesheetPayrollUpdateEmployees] PRIMARY KEY ([PayrollUpdateId], [EmployeeId]),
  CONSTRAINT [FK_TimesheetPayrollUpdateEmployees_Update] FOREIGN KEY ([PayrollUpdateId]) REFERENCES [hris].[TimesheetPayrollUpdates]([Id]) ON DELETE CASCADE
);
`);
    await pool.request().query(`
;WITH rankedPayrollUpdates AS (
  SELECT [Id], [PeriodId], ROW_NUMBER() OVER (PARTITION BY [PeriodId] ORDER BY [AcknowledgedAt] DESC, [Id] DESC) AS rn
  FROM [hris].[TimesheetPayrollUpdates]
)
DELETE e
FROM [hris].[TimesheetPayrollUpdateEmployees] e
INNER JOIN rankedPayrollUpdates u ON u.[Id] = e.[PayrollUpdateId]
WHERE u.rn > 1;

;WITH rankedPayrollUpdates AS (
  SELECT [Id], [PeriodId], ROW_NUMBER() OVER (PARTITION BY [PeriodId] ORDER BY [AcknowledgedAt] DESC, [Id] DESC) AS rn
  FROM [hris].[TimesheetPayrollUpdates]
)
DELETE h
FROM [hris].[TimesheetPayrollUpdateHeaders] h
INNER JOIN rankedPayrollUpdates u ON u.[Id] = h.[PayrollUpdateId]
WHERE u.rn > 1;

;WITH rankedPayrollUpdates AS (
  SELECT [Id], [PeriodId], ROW_NUMBER() OVER (PARTITION BY [PeriodId] ORDER BY [AcknowledgedAt] DESC, [Id] DESC) AS rn
  FROM [hris].[TimesheetPayrollUpdates]
)
DELETE u
FROM [hris].[TimesheetPayrollUpdates] u
INNER JOIN rankedPayrollUpdates r ON r.[Id] = u.[Id]
WHERE r.rn > 1;

;WITH rankedLines AS (
  SELECT
    l.[Id],
    ROW_NUMBER() OVER (
      PARTITION BY l.[HeaderId], UPPER(LTRIM(RTRIM(l.[EmployeeId])))
      ORDER BY CASE WHEN NULLIF(LTRIM(RTRIM(l.[ClockIn])), '') IS NULL THEN 0 ELSE 1 END DESC,
               ISNULL(l.[TotalHours], 0) DESC,
               ISNULL(l.[AttendanceDuration], 0) DESC,
               l.[Id] DESC
    ) AS rn
  FROM [hris].[TimesheetLines] l
  WHERE NULLIF(LTRIM(RTRIM(l.[EmployeeId])), '') IS NOT NULL
)
DELETE l
FROM [hris].[TimesheetLines] l
INNER JOIN rankedLines r ON r.[Id] = l.[Id]
WHERE r.rn > 1;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  INNER JOIN sys.tables t ON t.object_id = i.object_id
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE i.name = N'UX_TimesheetPayrollUpdates_PeriodId'
    AND t.name = N'TimesheetPayrollUpdates'
    AND s.name = N'hris'
)
BEGIN
  BEGIN TRY
    CREATE UNIQUE INDEX [UX_TimesheetPayrollUpdates_PeriodId] ON [hris].[TimesheetPayrollUpdates]([PeriodId]);
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (1913, 2714) THROW;
  END CATCH
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  INNER JOIN sys.tables t ON t.object_id = i.object_id
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE i.name = N'UX_TimesheetLines_HeaderEmployee'
    AND t.name = N'TimesheetLines'
    AND s.name = N'hris'
)
BEGIN
  BEGIN TRY
    CREATE UNIQUE INDEX [UX_TimesheetLines_HeaderEmployee] ON [hris].[TimesheetLines]([HeaderId], [EmployeeId]);
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() NOT IN (1913, 2714) THROW;
  END CATCH
END
`);
    for (const name of officialTimesheetWorkCenters) {
      const code = workCenterCode(name);
      await pool.request()
        .input('Id', sql.NVarChar(100), workCenterId(name))
        .input('Code', sql.NVarChar(80), code)
        .input('Name', sql.NVarChar(180), name)
        .query(`
MERGE [hris].[TimesheetWorkCenters] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[Location]=@Name,[Site]=@Name,[Status]=N'Active',[SourceSystem]=N'HRIS',[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[Location],[Site],[Status],[SourceSystem]) VALUES (@Id,@Code,@Name,@Name,@Name,N'Active',N'HRIS');`);
    }
    await pool.request().query(`UPDATE [hris].[TimesheetWorkCenters] SET [Status]=N'Inactive',[UpdatedAt]=SYSUTCDATETIME() WHERE [SourceSystem]=N'Sage Payroll'`);
    })().catch((error) => {
      dbEnsureState.promise = null;
      throw error;
    });
  }
  await dbEnsureState.promise;
  return pool;
};

const bindPeriod = (request: sql.Request, period: TimesheetPeriod) => request
  .input('Id', sql.NVarChar(40), period.id)
  .input('Name', sql.NVarChar(80), period.name)
  .input('StartDate', sql.Date, period.startDate)
  .input('EndDate', sql.Date, period.endDate)
  .input('Status', sql.NVarChar(20), period.status)
  .input('OpenedAt', sql.DateTime2, period.openedAt ? new Date(period.openedAt) : null)
  .input('OpenedBy', sql.NVarChar(120), period.openedBy ?? null)
  .input('ClosedAt', sql.DateTime2, period.closedAt ? new Date(period.closedAt) : null)
  .input('ClosedBy', sql.NVarChar(120), period.closedBy ?? null)
  .input('UpdatedAt', sql.DateTime2, period.updatedAt ? new Date(period.updatedAt) : null)
  .input('UpdatedBy', sql.NVarChar(120), period.updatedBy ?? null);

const upsertPeriod = async (pool: sql.ConnectionPool, period: TimesheetPeriod) => {
  await bindPeriod(new sql.Request(pool), period).query(`
MERGE [hris].[TimesheetPeriods] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET [Name]=@Name,[StartDate]=@StartDate,[EndDate]=@EndDate,[Status]=@Status,[OpenedAt]=@OpenedAt,[OpenedBy]=@OpenedBy,[ClosedAt]=@ClosedAt,[ClosedBy]=@ClosedBy,[UpdatedAt]=@UpdatedAt,[UpdatedBy]=@UpdatedBy
WHEN NOT MATCHED THEN INSERT ([Id],[Name],[StartDate],[EndDate],[Status],[OpenedAt],[OpenedBy],[ClosedAt],[ClosedBy],[UpdatedAt],[UpdatedBy])
VALUES (@Id,@Name,@StartDate,@EndDate,@Status,@OpenedAt,@OpenedBy,@ClosedAt,@ClosedBy,@UpdatedAt,@UpdatedBy);`);
};

export async function readTimesheetPeriods(): Promise<TimesheetPeriod[]> {
  try {
    const pool = await db();
    const result = await pool.request().query(`SELECT * FROM [hris].[TimesheetPeriods] ORDER BY [StartDate] DESC`);
    return result.recordset.map((row) => ({
      id: row.Id,
      name: row.Name,
      startDate: toDateOnly(row.StartDate),
      endDate: toDateOnly(row.EndDate),
      status: row.Status,
      openedAt: toIso(row.OpenedAt),
      openedBy: row.OpenedBy,
      closedAt: toIso(row.ClosedAt),
      closedBy: row.ClosedBy,
      updatedAt: toIso(row.UpdatedAt),
      updatedBy: row.UpdatedBy,
    }));
  } catch {
    return [];
  }
}

export async function writeTimesheetPeriods(periods: TimesheetPeriod[]) {
  const pool = await db();
  for (const period of periods) {
    await upsertPeriod(pool, period);
  }
}

export async function readTimesheetPeriod(date: Date = new Date()): Promise<TimesheetPeriod> {
  const calculated = calculateTimesheetPeriod(date);
  const periods = await readTimesheetPeriods();
  const stored = periods.find((period) => period.id === calculated.id);
  const now = new Date().toISOString();
  const currentPeriodId = calculateTimesheetPeriod(new Date()).id;
  const isCurrentPeriod = calculated.id === currentPeriodId;

  if (stored) {
    const normalized = {
      ...calculated,
      ...stored,
      startDate: calculated.startDate,
      endDate: calculated.endDate,
      name: calculated.name,
    };
    if (isCurrentPeriod && stored.status === 'Closed' && (!stored.closedBy || stored.closedBy === 'System')) {
      const reopened: TimesheetPeriod = {
        ...normalized,
        status: 'Open',
        openedAt: stored.openedAt || now,
        openedBy: stored.openedBy || 'System',
        closedAt: null,
        closedBy: null,
        updatedAt: now,
        updatedBy: 'System',
      };
      try {
        await writeTimesheetPeriods(periods.map((period) => (period.id === reopened.id ? reopened : period)));
      } catch {
        // Read-only fallback: the page can still render when SQL is temporarily unavailable.
      }
      return reopened;
    }
    return normalized;
  }

  const shouldAutoOpen = isCurrentPeriod;
  const period: TimesheetPeriod = {
    ...calculated,
    status: shouldAutoOpen ? 'Open' : 'Closed',
    openedAt: shouldAutoOpen ? now : null,
    openedBy: shouldAutoOpen ? 'System' : null,
    closedAt: shouldAutoOpen ? null : now,
    closedBy: shouldAutoOpen ? null : 'System',
    updatedAt: now,
    updatedBy: 'System',
  };

  try {
    await writeTimesheetPeriods([...periods, period]);
  } catch {
    // Read-only fallback: the page can still render when SQL is temporarily unavailable.
  }
  return period;
}

export async function updateTimesheetPeriodStatus(date: Date, status: TimesheetPeriod['status'], actor: string): Promise<TimesheetPeriod> {
  const calculated = calculateTimesheetPeriod(date);
  const current = await readTimesheetPeriod(date);
  if (current.status === 'Locked' && status !== 'Locked') {
    throw new Error('Locked timesheet periods cannot be reopened.');
  }

  const now = new Date().toISOString();
  const next: TimesheetPeriod = {
    ...current,
    status,
    openedAt: status === 'Open' ? now : current.openedAt,
    openedBy: status === 'Open' ? actor : current.openedBy,
    closedAt: status === 'Closed' || status === 'Locked' ? now : null,
    closedBy: status === 'Closed' || status === 'Locked' ? actor : null,
    updatedAt: now,
    updatedBy: actor,
  };

  const periods = await readTimesheetPeriods();
  const existingIndex = periods.findIndex((period) => period.id === next.id);
  const updatedPeriods = periods.map((period) => {
    if (status !== 'Open' || period.id === next.id || period.status !== 'Open') return period;
    return {
      ...period,
      status: 'Closed' as const,
      closedAt: now,
      closedBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
  });
  if (existingIndex >= 0) updatedPeriods[existingIndex] = next;
  else updatedPeriods.push(next);

  await writeTimesheetPeriods(updatedPeriods);
  return next;
}

export async function readTimesheetPeriodSummaries(windowMonths = 12): Promise<TimesheetPeriodSummary[]> {
  const current = calculateTimesheetPeriod(new Date());
  const currentEnd = new Date(`${current.endDate}T00:00:00`);
  const periods = await Promise.all(
    Array.from({ length: windowMonths }, (_, index) => {
      const end = new Date(currentEnd);
      end.setMonth(currentEnd.getMonth() - index);
      return readTimesheetPeriod(end);
    }),
  );
  const { headers, lines } = await readTimesheetData();

  return periods.map((period) => {
    const periodHeaders = headers.filter((header) => header.periodId === period.id);
    const headerIds = new Set(periodHeaders.map((header) => header.id));
    const periodLines = lines.filter((line) => headerIds.has(line.headerId));

    return {
      ...period,
      totalHeaders: periodHeaders.length,
      draftHeaders: periodHeaders.filter((header) => header.status === 'Draft').length,
      submittedHeaders: periodHeaders.filter((header) => ['Submitted', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'HR_Reviewed', 'Project_Control_Reviewed'].includes(header.status)).length,
      approvedHeaders: periodHeaders.filter((header) => ['HR_Acknowledged', 'Approved', 'Locked'].includes(header.status)).length,
      totalEmployees: periodLines.length,
      totalHours: Math.round(periodLines.reduce((sum, line) => sum + line.totalHours, 0) * 10) / 10,
    };
  });
}

export async function readProjects(): Promise<Project[]> {
  try {
    const pool = await db();
    const [projectsResult, tasksResult] = await Promise.all([
      pool.request().query(`SELECT * FROM [hris].[TimesheetProjects] ORDER BY [Code]`),
      pool.request().query(`SELECT * FROM [hris].[TimesheetProjectTasks] ORDER BY [Name]`),
    ]);
    const tasksByProject = new Map<string, ProjectTask[]>();
    for (const row of tasksResult.recordset) {
      const tasks = tasksByProject.get(row.ProjectId) || [];
      tasks.push({ id: row.Id, name: row.Name, activityId: row.ActivityId ?? undefined, activityName: row.ActivityName ?? undefined });
      tasksByProject.set(row.ProjectId, tasks);
    }
    return projectsResult.recordset.map((row) => ({
      id: row.Id,
      code: row.Code,
      name: row.Name,
      clientName: row.ClientName || '',
      site: row.Site,
      projectManager: row.ProjectManager || '',
      status: row.Status,
      tasks: tasksByProject.get(row.Id) || [],
    }));
  } catch {
    return projectCatalog
      .filter((item) => item.kind === 'project' || item.kind === 'internal')
      .map((item) => ({
        id: `fallback-${item.code.toLowerCase()}`,
        code: item.code,
        name: item.name,
        clientName: item.client || '',
        site: item.client || item.phase,
        projectManager: '',
        status: 'Active',
        tasks: [{ id: `task-${item.code.toLowerCase()}`, name: item.task }],
      }));
  }
}

export async function writeProjects(projects: Project[]) {
  const pool = await db();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const project of projects) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(80), project.id)
        .input('Code', sql.NVarChar(50), project.code)
        .input('Name', sql.NVarChar(255), project.name)
        .input('ClientName', sql.NVarChar(220), project.clientName || null)
        .input('Site', sql.NVarChar(160), project.site)
        .input('ProjectManager', sql.NVarChar(220), project.projectManager || null)
        .input('Status', sql.NVarChar(40), project.status)
        .query(`
MERGE [hris].[TimesheetProjects] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[ClientName]=@ClientName,[Site]=@Site,[ProjectManager]=@ProjectManager,[Status]=@Status,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[ClientName],[Site],[ProjectManager],[Status]) VALUES (@Id,@Code,@Name,@ClientName,@Site,@ProjectManager,@Status);`);
      await new sql.Request(tx).input('ProjectId', sql.NVarChar(80), project.id).query(`DELETE FROM [hris].[TimesheetProjectTasks] WHERE [ProjectId]=@ProjectId`);
      for (const task of project.tasks || []) {
        await new sql.Request(tx)
          .input('Id', sql.NVarChar(80), task.id)
          .input('ProjectId', sql.NVarChar(80), project.id)
          .input('Name', sql.NVarChar(255), task.name)
          .input('ActivityId', sql.NVarChar(80), task.activityId ?? null)
          .input('ActivityName', sql.NVarChar(255), task.activityName ?? null)
          .query(`INSERT INTO [hris].[TimesheetProjectTasks] ([Id],[ProjectId],[Name],[ActivityId],[ActivityName]) VALUES (@Id,@ProjectId,@Name,@ActivityId,@ActivityName)`);
      }
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function upsertProject(project: Project): Promise<Project> {
  const pool = await db();
  const id = project.id || `prj-${Date.now()}`;
  const code = project.code.trim().toUpperCase();
  const name = project.name.trim();
  const clientName = project.clientName?.trim() || '';
  const site = project.site.trim();
  const status = project.status || 'Active';
  if (!code) throw new Error('Project code is required.');
  if (!name) throw new Error('Project name is required.');
  if (!clientName) throw new Error('Client name is required.');
  if (!site) throw new Error('Project site location is required.');

  const duplicate = await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('Code', sql.NVarChar(50), code)
    .query(`SELECT TOP (1) [Id] FROM [hris].[TimesheetProjects] WHERE [Code]=@Code AND [Id]<>@Id`);
  if (duplicate.recordset.length) throw new Error(`Project code ${code} already exists.`);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('Id', sql.NVarChar(100), locationId(site))
      .input('Code', sql.NVarChar(80), workCenterCode(site))
      .input('Name', sql.NVarChar(180), site)
      .input('Site', sql.NVarChar(180), site)
      .query(`
MERGE [hris].[TimesheetLocations] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[Site]=@Site,[SourceSystem]=N'HRIS Project Registry',[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[Site],[SourceSystem]) VALUES (@Id,@Code,@Name,@Site,N'HRIS Project Registry');`);

    await new sql.Request(tx)
      .input('Id', sql.NVarChar(80), id)
      .input('Code', sql.NVarChar(50), code)
      .input('Name', sql.NVarChar(255), name)
      .input('ClientName', sql.NVarChar(220), clientName)
      .input('Site', sql.NVarChar(160), site)
      .input('ProjectManager', sql.NVarChar(220), project.projectManager?.trim() || null)
      .input('Status', sql.NVarChar(40), status)
      .query(`
MERGE [hris].[TimesheetProjects] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[ClientName]=@ClientName,[Site]=@Site,[ProjectManager]=@ProjectManager,[Status]=@Status,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[ClientName],[Site],[ProjectManager],[Status]) VALUES (@Id,@Code,@Name,@ClientName,@Site,@ProjectManager,@Status);`);

    await new sql.Request(tx).input('ProjectId', sql.NVarChar(80), id).query(`DELETE FROM [hris].[TimesheetProjectTasks] WHERE [ProjectId]=@ProjectId`);
    for (const task of project.tasks?.length ? project.tasks : [{ id: `task-${id}`, name: 'General Project Work' }]) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(80), task.id || `task-${Date.now()}`)
        .input('ProjectId', sql.NVarChar(80), id)
        .input('Name', sql.NVarChar(255), task.name || 'General Project Work')
        .input('ActivityId', sql.NVarChar(80), task.activityId ?? null)
        .input('ActivityName', sql.NVarChar(255), task.activityName ?? null)
        .query(`INSERT INTO [hris].[TimesheetProjectTasks] ([Id],[ProjectId],[Name],[ActivityId],[ActivityName]) VALUES (@Id,@ProjectId,@Name,@ActivityId,@ActivityName)`);
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  return {
    ...project,
    id,
    code,
    name,
    clientName,
    site,
    projectManager: project.projectManager?.trim() || '',
    status,
    tasks: project.tasks?.length ? project.tasks : [{ id: `task-${id}`, name: 'General Project Work' }],
  };
}

export async function generateProjectCode(): Promise<string> {
  const projects = await readProjects();
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `DL${year}`;
  
  const serials = projects
    .filter(p => p.code.startsWith(prefix))
    .map(p => parseInt(p.code.slice(4)))
    .filter(n => !isNaN(n));
    
  const nextSerial = serials.length > 0 ? Math.max(...serials) + 1 : 1;
  return `${prefix}${nextSerial.toString().padStart(3, '0')}`;
}

const TIMESHEET_DATA_CACHE_MS = Number(process.env.HRIS_TIMESHEET_DATA_CACHE_MS || 60000);
type TimesheetDataCache = {
  value: { headers: TimesheetHeader[]; lines: TimesheetLine[] };
  expiresAt: number;
  pending?: Promise<{ headers: TimesheetHeader[]; lines: TimesheetLine[] }>;
};

let timesheetDataCache: TimesheetDataCache | null = null;

export const invalidateTimesheetDataCache = () => {
  timesheetDataCache = null;
};

async function readTimesheetDataUncached(options?: { softFail?: boolean }) {
  let pool: sql.ConnectionPool;
  try {
    pool = await db();
  } catch (error) {
    if (options?.softFail) return { headers: [] as TimesheetHeader[], lines: [] as TimesheetLine[] };
    const detail = error instanceof Error ? error.message : 'connection failed';
    throw new Error(`Timesheet data requires DLE_Enterprise (${detail}). Verify DLE_ENTERPRISE_DB_HOST, DLE_ENTERPRISE_DB_NAME, and credentials on this server.`);
  }
  const [headersResult, eventsResult, linesResult, projectAllocationsResult, idleAllocationsResult] = await Promise.all([
    pool.request().query(`SELECT * FROM [hris].[TimesheetHeaders] ORDER BY [TimesheetDate] DESC, [SupervisorName], [WorkCenterName]`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetWorkflowEvents] ORDER BY [Id]`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetLines] ORDER BY [EmployeeName]`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetProjectAllocations] ORDER BY [Id]`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetIdleAllocations] ORDER BY [Id]`),
  ]);
  const eventsByHeader = new Map<string, TimesheetWorkflowEvent[]>();
  for (const row of eventsResult.recordset) {
    const events = eventsByHeader.get(row.HeaderId) || [];
    events.push({ stage: row.Stage, decision: row.Decision, by: row.Actor, actedAt: toIso(row.ActedAt) || new Date().toISOString(), comment: row.Comment });
    eventsByHeader.set(row.HeaderId, events);
  }
  const projectByLine = new Map<string, TimesheetLine['projectAllocations']>();
  for (const row of projectAllocationsResult.recordset) {
    const allocations = projectByLine.get(row.LineId) || [];
    allocations.push({
      projectId: row.ProjectId,
      projectCode: row.ProjectCode,
      projectName: row.ProjectName,
      taskId: row.TaskId ?? undefined,
      taskName: row.TaskName ?? undefined,
      activityId: row.ActivityId ?? undefined,
      hours: Number(row.Hours || 0),
      remarks: row.Remarks,
    });
    projectByLine.set(row.LineId, allocations);
  }
  const idleByLine = new Map<string, TimesheetLine['idleAllocations']>();
  for (const row of idleAllocationsResult.recordset) {
    const allocations = idleByLine.get(row.LineId) || [];
    allocations.push({ reasonId: row.ReasonId, reasonName: row.ReasonName, hours: Number(row.Hours || 0), remarks: row.Remarks });
    idleByLine.set(row.LineId, allocations);
  }
  const headers: TimesheetHeader[] = headersResult.recordset.map((row) => ({
    id: row.Id,
    periodId: row.PeriodId,
    timesheetDate: toDateOnly(row.TimesheetDate),
    supervisorId: row.SupervisorId,
    supervisorName: row.SupervisorName,
    workCenterId: row.WorkCenterId,
    workCenterName: row.WorkCenterName,
    status: row.Status,
    submittedAt: toIso(row.SubmittedAt),
    submittedBy: row.SubmittedBy,
    approvedAt: toIso(row.ApprovedAt),
    approvedBy: row.ApprovedBy,
    lastSyncAt: toIso(row.LastSyncAt),
    payrollAcknowledgedAt: toIso(row.PayrollAcknowledgedAt),
    payrollAcknowledgedBy: row.PayrollAcknowledgedBy,
    projectManager: row.ProjectManager,
    projectManagerProjectCode: row.ProjectManagerProjectCode,
    currentApprovalStage: row.CurrentApprovalStage,
    currentApprover: row.CurrentApprover,
    shiftLabel: row.ShiftLabel || null,
    workflowHistory: eventsByHeader.get(row.Id) || [],
  }));
  const lines: TimesheetLine[] = linesResult.recordset.map((row) => ({
    id: row.Id,
    headerId: row.HeaderId,
    employeeId: row.EmployeeId,
    employeeNo: row.EmployeeNo,
    employeeName: row.EmployeeName,
    biometricId: row.BiometricId,
    attendanceId: row.AttendanceId,
    clockIn: row.ClockIn,
    clockOut: row.ClockOut,
    attendanceDuration: Number(row.AttendanceDuration || 0),
    projectAllocations: normalizeProjectAllocations(projectByLine.get(row.Id) || []),
    idleAllocations: (idleByLine.get(row.Id) || []).map(withDefaultIdleReason),
    usedHours: Number(row.UsedHours || 0),
    idleHours: Number(row.IdleHours || 0),
    totalHours: Number(row.TotalHours || 0),
    variance: Number(row.Variance || 0),
    remarks: row.Remarks,
    validationStatus: row.ValidationStatus,
    validationMessage: row.ValidationMessage,
  }));
  return { headers, lines };
}

export async function readTimesheetData(options?: { softFail?: boolean }) {
  const now = Date.now();
  if (timesheetDataCache?.value && timesheetDataCache.expiresAt > now) return timesheetDataCache.value;
  if (timesheetDataCache?.pending) return timesheetDataCache.pending;
  const pending = readTimesheetDataUncached(options).then((value) => {
    timesheetDataCache = { value, expiresAt: Date.now() + TIMESHEET_DATA_CACHE_MS };
    return value;
  });
  timesheetDataCache = {
    value: timesheetDataCache?.value ?? { headers: [], lines: [] },
    expiresAt: 0,
    pending,
  };
  return pending;
}

export type TimesheetApprovalListMode = 'all' | 'pending' | 'history';

const ACTIVE_APPROVAL_STATUSES_SQL = `N'Submitted', N'Supervisor_Reviewed', N'Project_Manager_Reviewed', N'Cost_Control_Reviewed', N'GM_Operations_Reviewed', N'HR_Acknowledged', N'Approved', N'HR_Reviewed', N'Project_Control_Reviewed'`;

const listModeWhereClause = (mode: TimesheetApprovalListMode) => {
  if (mode === 'pending') {
    return `[Status] <> N'Draft' AND [Status] IN (${ACTIVE_APPROVAL_STATUSES_SQL})`;
  }
  if (mode === 'history') {
    return `[Status] <> N'Draft' AND [Status] NOT IN (${ACTIVE_APPROVAL_STATUSES_SQL})`;
  }
  return `[Status] <> N'Draft'`;
};

const appendApprovalListFilters = (
  request: sql.Request,
  whereClause: string,
  filters?: { status?: string | null; periodId?: string | null },
) => {
  let clause = whereClause;
  if (filters?.status) {
    request.input('FilterStatus', sql.NVarChar(50), filters.status);
    clause += ` AND [Status]=@FilterStatus`;
  }
  if (filters?.periodId) {
    request.input('FilterPeriodId', sql.NVarChar(40), filters.periodId);
    clause += ` AND [PeriodId]=@FilterPeriodId`;
  }
  return clause;
};

const mapTimesheetHeaderRow = (row: any, eventsByHeader: Map<string, TimesheetWorkflowEvent[]>): TimesheetHeader => ({
  id: String(row.Id),
  periodId: row.PeriodId,
  timesheetDate: toDateOnly(row.TimesheetDate),
  supervisorId: row.SupervisorId,
  supervisorName: row.SupervisorName,
  workCenterId: row.WorkCenterId,
  workCenterName: row.WorkCenterName,
  status: row.Status,
  submittedAt: toIso(row.SubmittedAt),
  submittedBy: row.SubmittedBy,
  approvedAt: toIso(row.ApprovedAt),
  approvedBy: row.ApprovedBy,
  lastSyncAt: toIso(row.LastSyncAt),
  payrollAcknowledgedAt: toIso(row.PayrollAcknowledgedAt),
  payrollAcknowledgedBy: row.PayrollAcknowledgedBy,
  projectManager: row.ProjectManager,
  projectManagerProjectCode: row.ProjectManagerProjectCode,
  currentApprovalStage: row.CurrentApprovalStage,
  currentApprover: row.CurrentApprover,
  shiftLabel: row.ShiftLabel || null,
  workflowHistory: eventsByHeader.get(String(row.Id)) || [],
});

const mapTimesheetLineRows = (
  linesResult: sql.IResult<any>,
  projectAllocationsResult: sql.IResult<any>,
  idleAllocationsResult: sql.IResult<any>,
): TimesheetLine[] => {
  const projectByLine = new Map<string, TimesheetLine['projectAllocations']>();
  for (const row of projectAllocationsResult.recordset) {
    const lineKey = String(row.LineId);
    const allocations = projectByLine.get(lineKey) || [];
    allocations.push({
      projectId: row.ProjectId,
      projectCode: row.ProjectCode,
      projectName: row.ProjectName,
      taskId: row.TaskId ?? undefined,
      taskName: row.TaskName ?? undefined,
      activityId: row.ActivityId ?? undefined,
      hours: Number(row.Hours || 0),
      remarks: row.Remarks,
    });
    projectByLine.set(lineKey, allocations);
  }
  const idleByLine = new Map<string, TimesheetLine['idleAllocations']>();
  for (const row of idleAllocationsResult.recordset) {
    const lineKey = String(row.LineId);
    const allocations = idleByLine.get(lineKey) || [];
    allocations.push({ reasonId: row.ReasonId, reasonName: row.ReasonName, hours: Number(row.Hours || 0), remarks: row.Remarks });
    idleByLine.set(lineKey, allocations);
  }
  return linesResult.recordset.map((row) => ({
    id: String(row.Id),
    headerId: String(row.HeaderId),
    employeeId: row.EmployeeId,
    employeeNo: row.EmployeeNo,
    employeeName: row.EmployeeName,
    biometricId: row.BiometricId,
    attendanceId: row.AttendanceId,
    clockIn: row.ClockIn,
    clockOut: row.ClockOut,
    attendanceDuration: Number(row.AttendanceDuration || 0),
    projectAllocations: normalizeProjectAllocations(projectByLine.get(row.Id) || []),
    idleAllocations: (idleByLine.get(row.Id) || []).map(withDefaultIdleReason),
    usedHours: Number(row.UsedHours || 0),
    idleHours: Number(row.IdleHours || 0),
    totalHours: Number(row.TotalHours || 0),
    variance: Number(row.Variance || 0),
    remarks: row.Remarks,
    validationStatus: row.ValidationStatus,
    validationMessage: row.ValidationMessage,
  }));
};

const bindHeaderIdParams = (request: sql.Request, headerIds: string[]) => {
  const placeholders = headerIds.map((headerId, index) => {
    const param = `headerId${index}`;
    request.input(param, sql.NVarChar(4000), String(headerId));
    return `@${param}`;
  });
  return placeholders.join(', ');
};

const bindLineIdParams = (request: sql.Request, lineIds: string[]) => {
  const placeholders = lineIds.map((lineId, index) => {
    const param = `lineId${index}`;
    request.input(param, sql.NVarChar(4000), String(lineId));
    return `@${param}`;
  });
  return placeholders.join(', ');
};

const headerIdInClause = (placeholders: string) => `CONVERT(NVARCHAR(4000), [HeaderId]) IN (${placeholders})`;
const lineHeaderIdInClause = (placeholders: string) => `CONVERT(NVARCHAR(4000), l.[HeaderId]) IN (${placeholders})`;
const lineIdInClause = (placeholders: string) => `CONVERT(NVARCHAR(4000), [LineId]) IN (${placeholders})`;
const joinHeaderToLine = 'CONVERT(NVARCHAR(4000), h.[Id]) = CONVERT(NVARCHAR(4000), l.[HeaderId])';
const joinHeaderToEvent = 'CONVERT(NVARCHAR(4000), h.[Id]) = CONVERT(NVARCHAR(4000), e.[HeaderId])';
const joinLineToAllocation = 'CONVERT(NVARCHAR(4000), l.[Id]) = CONVERT(NVARCHAR(4000), a.[LineId])';

const loadTimesheetChildData = async (pool: sql.ConnectionPool, headerIds: string[]) => {
  if (!headerIds.length) {
    return {
      eventsByHeader: new Map<string, TimesheetWorkflowEvent[]>(),
      lines: [] as TimesheetLine[],
    };
  }
  const eventsRequest = pool.request();
  const linesRequest = pool.request();
  const headerInClause = bindHeaderIdParams(eventsRequest, headerIds);
  bindHeaderIdParams(linesRequest, headerIds);
  const [eventsResult, linesResult] = await Promise.all([
    eventsRequest.query(`
      SELECT *
      FROM [hris].[TimesheetWorkflowEvents]
      WHERE ${headerIdInClause(headerInClause)}
      ORDER BY [Id]
    `),
    linesRequest.query(`
      SELECT l.*
      FROM [hris].[TimesheetLines] l
      WHERE ${lineHeaderIdInClause(headerInClause)}
      ORDER BY l.[EmployeeName]
    `),
  ]);

  const eventsByHeader = new Map<string, TimesheetWorkflowEvent[]>();
  for (const row of eventsResult.recordset) {
    const headerKey = String(row.HeaderId);
    const events = eventsByHeader.get(headerKey) || [];
    events.push({ stage: row.Stage, decision: row.Decision, by: row.Actor, actedAt: toIso(row.ActedAt) || new Date().toISOString(), comment: row.Comment });
    eventsByHeader.set(headerKey, events);
  }

  const lineIds = linesResult.recordset.map((row) => String(row.Id)).filter(Boolean);
  let projectAllocationsResult = { recordset: [] as any[] } as sql.IResult<any>;
  let idleAllocationsResult = { recordset: [] as any[] } as sql.IResult<any>;
  if (lineIds.length) {
    const projectRequest = pool.request();
    const idleRequest = pool.request();
    const lineInClause = bindLineIdParams(projectRequest, lineIds);
    bindLineIdParams(idleRequest, lineIds);
    [projectAllocationsResult, idleAllocationsResult] = await Promise.all([
      projectRequest.query(`
        SELECT *
        FROM [hris].[TimesheetProjectAllocations]
        WHERE ${lineIdInClause(lineInClause)}
        ORDER BY [Id]
      `),
      idleRequest.query(`
        SELECT *
        FROM [hris].[TimesheetIdleAllocations]
        WHERE ${lineIdInClause(lineInClause)}
        ORDER BY [Id]
      `),
    ]);
  }

  return {
    eventsByHeader,
    lines: mapTimesheetLineRows(linesResult, projectAllocationsResult, idleAllocationsResult),
  };
};

export type TimesheetApprovalWorkspaceStats = {
  headerCount: number;
  lineCount: number;
  pendingCount: number;
  historyCount: number;
  statusCounts: Record<string, number>;
  filterOptions: {
    workCenters: string[];
    supervisors: string[];
    periods: string[];
  };
};

let timesheetApprovalStatsCache: { expiresAt: number; value: TimesheetApprovalWorkspaceStats } | null = null;

export async function readTimesheetApprovalWorkspaceStats(options?: { softFail?: boolean }) {
  const now = Date.now();
  if (timesheetApprovalStatsCache && timesheetApprovalStatsCache.expiresAt > now) {
    return timesheetApprovalStatsCache.value;
  }

  let pool: sql.ConnectionPool;
  try {
    pool = await db();
  } catch (error) {
    if (options?.softFail) {
      return {
        headerCount: 0,
        lineCount: 0,
        pendingCount: 0,
        historyCount: 0,
        statusCounts: {},
        filterOptions: { workCenters: [], supervisors: [], periods: [] },
      };
    }
    throw error;
  }

  const [statusResult, lineCountResult, filterResult] = await Promise.all([
    pool.request().query(`
      SELECT [Status], COUNT_BIG(*) AS [Count]
      FROM [hris].[TimesheetHeaders]
      WHERE [Status] <> N'Draft'
      GROUP BY [Status]
    `),
    pool.request().query(`
      SELECT COUNT_BIG(*) AS [Count]
      FROM [hris].[TimesheetLines] l
      WHERE CONVERT(NVARCHAR(4000), l.[HeaderId]) IN (
        SELECT CONVERT(NVARCHAR(4000), [Id])
        FROM [hris].[TimesheetHeaders]
        WHERE [Status] <> N'Draft'
      )
    `),
    pool.request().query(`
      SELECT DISTINCT [WorkCenterName], [SupervisorName], [PeriodId]
      FROM [hris].[TimesheetHeaders]
      WHERE [Status] <> N'Draft'
    `),
  ]);

  const statusCounts: Record<string, number> = {};
  let pendingCount = 0;
  let historyCount = 0;
  const activeStatuses = new Set(['Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed', 'HR_Acknowledged', 'Approved', 'HR_Reviewed', 'Project_Control_Reviewed']);
  for (const row of statusResult.recordset) {
    const status = normalizeTimesheetStatus(row.Status);
    const count = Number(row.Count || 0);
    statusCounts[status] = (statusCounts[status] || 0) + count;
    if (activeStatuses.has(String(row.Status)) || activeStatuses.has(status)) pendingCount += count;
    else historyCount += count;
  }

  const value: TimesheetApprovalWorkspaceStats = {
    headerCount: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    lineCount: Number(lineCountResult.recordset?.[0]?.Count || 0),
    pendingCount,
    historyCount,
    statusCounts,
    filterOptions: {
      workCenters: Array.from(new Set((filterResult.recordset || []).map((row) => String(row.WorkCenterName || '').trim()).filter(Boolean))).sort(),
      supervisors: Array.from(new Set((filterResult.recordset || []).map((row) => String(row.SupervisorName || '').trim()).filter(Boolean))).sort(),
      periods: Array.from(new Set((filterResult.recordset || []).map((row) => String(row.PeriodId || '').trim()).filter(Boolean))).sort(),
    },
  };
  timesheetApprovalStatsCache = { expiresAt: now + Number(process.env.HRIS_TIMESHEET_APPROVAL_STATS_CACHE_MS || 60000), value };
  return value;
};

export async function readTimesheetApprovalPage(options?: {
  softFail?: boolean;
  mode?: TimesheetApprovalListMode;
  page?: number;
  pageSize?: number;
  status?: string | null;
  periodId?: string | null;
}) {
  const mode = options?.mode || 'all';
  const page = Math.max(1, Number(options?.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(options?.pageSize || 50)));
  const offset = (page - 1) * pageSize;
  const baseWhereClause = listModeWhereClause(mode);

  let pool: sql.ConnectionPool;
  try {
    pool = await db();
  } catch (error) {
    if (options?.softFail) return { headers: [] as TimesheetHeader[], lines: [] as TimesheetLine[], total: 0, page, pageSize, mode };
    const detail = error instanceof Error ? error.message : 'connection failed';
    throw new Error(`Timesheet data requires DLE_Enterprise (${detail}). Verify DLE_ENTERPRISE_DB_HOST, DLE_ENTERPRISE_DB_NAME, and credentials on this server.`);
  }

  const countRequest = pool.request();
  const whereClause = appendApprovalListFilters(countRequest, baseWhereClause, options);
  const countResult = await countRequest.query(`
    SELECT COUNT_BIG(*) AS [Total]
    FROM [hris].[TimesheetHeaders]
    WHERE ${whereClause}
  `);
  const total = Number(countResult.recordset?.[0]?.Total || 0);
  if (!total) {
    return { headers: [] as TimesheetHeader[], lines: [] as TimesheetLine[], total: 0, page, pageSize, mode };
  }

  const headersRequest = pool.request()
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize);
  const filteredWhereClause = appendApprovalListFilters(headersRequest, baseWhereClause, options);
  const headersResult = await headersRequest.query(`
      SELECT *
      FROM [hris].[TimesheetHeaders]
      WHERE ${filteredWhereClause}
      ORDER BY [TimesheetDate] DESC, [SupervisorName], [WorkCenterName]
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

  const headerIds = headersResult.recordset.map((row) => String(row.Id));
  const { eventsByHeader, lines } = await loadTimesheetChildData(pool, headerIds);
  const headers = headersResult.recordset.map((row) => mapTimesheetHeaderRow(row, eventsByHeader));
  return { headers, lines, total, page, pageSize, mode };
}

export const invalidateTimesheetApprovalWorkspaceCache = () => {
  timesheetApprovalStatsCache = null;
};

export async function readTimesheetApprovalData(options?: { softFail?: boolean }) {
  let pool: sql.ConnectionPool;
  try {
    pool = await db();
  } catch (error) {
    if (options?.softFail) return { headers: [] as TimesheetHeader[], lines: [] as TimesheetLine[] };
    const detail = error instanceof Error ? error.message : 'connection failed';
    throw new Error(`Timesheet data requires DLE_Enterprise (${detail}). Verify DLE_ENTERPRISE_DB_HOST, DLE_ENTERPRISE_DB_NAME, and credentials on this server.`);
  }

  const nonDraftFilter = `[Status] <> N'Draft'`;
  const [headersResult, eventsResult, linesResult, projectAllocationsResult, idleAllocationsResult] = await Promise.all([
    pool.request().query(`SELECT * FROM [hris].[TimesheetHeaders] WHERE ${nonDraftFilter} ORDER BY [TimesheetDate] DESC, [SupervisorName], [WorkCenterName]`),
    pool.request().query(`
      SELECT e.*
      FROM [hris].[TimesheetWorkflowEvents] e
      INNER JOIN [hris].[TimesheetHeaders] h ON ${joinHeaderToEvent}
      WHERE h.${nonDraftFilter}
      ORDER BY e.[Id]
    `),
    pool.request().query(`
      SELECT l.*
      FROM [hris].[TimesheetLines] l
      INNER JOIN [hris].[TimesheetHeaders] h ON ${joinHeaderToLine}
      WHERE h.${nonDraftFilter}
      ORDER BY l.[EmployeeName]
    `),
    pool.request().query(`
      SELECT a.*
      FROM [hris].[TimesheetProjectAllocations] a
      INNER JOIN [hris].[TimesheetLines] l ON ${joinLineToAllocation}
      INNER JOIN [hris].[TimesheetHeaders] h ON ${joinHeaderToLine}
      WHERE h.${nonDraftFilter}
      ORDER BY a.[Id]
    `),
    pool.request().query(`
      SELECT a.*
      FROM [hris].[TimesheetIdleAllocations] a
      INNER JOIN [hris].[TimesheetLines] l ON ${joinLineToAllocation}
      INNER JOIN [hris].[TimesheetHeaders] h ON ${joinHeaderToLine}
      WHERE h.${nonDraftFilter}
      ORDER BY a.[Id]
    `),
  ]);

  const eventsByHeader = new Map<string, TimesheetWorkflowEvent[]>();
  for (const row of eventsResult.recordset) {
    const events = eventsByHeader.get(row.HeaderId) || [];
    events.push({ stage: row.Stage, decision: row.Decision, by: row.Actor, actedAt: toIso(row.ActedAt) || new Date().toISOString(), comment: row.Comment });
    eventsByHeader.set(row.HeaderId, events);
  }
  const projectByLine = new Map<string, TimesheetLine['projectAllocations']>();
  for (const row of projectAllocationsResult.recordset) {
    const allocations = projectByLine.get(row.LineId) || [];
    allocations.push({
      projectId: row.ProjectId,
      projectCode: row.ProjectCode,
      projectName: row.ProjectName,
      taskId: row.TaskId ?? undefined,
      taskName: row.TaskName ?? undefined,
      activityId: row.ActivityId ?? undefined,
      hours: Number(row.Hours || 0),
      remarks: row.Remarks,
    });
    projectByLine.set(row.LineId, allocations);
  }
  const idleByLine = new Map<string, TimesheetLine['idleAllocations']>();
  for (const row of idleAllocationsResult.recordset) {
    const allocations = idleByLine.get(row.LineId) || [];
    allocations.push({ reasonId: row.ReasonId, reasonName: row.ReasonName, hours: Number(row.Hours || 0), remarks: row.Remarks });
    idleByLine.set(row.LineId, allocations);
  }
  const headers: TimesheetHeader[] = headersResult.recordset.map((row) => ({
    id: row.Id,
    periodId: row.PeriodId,
    timesheetDate: toDateOnly(row.TimesheetDate),
    supervisorId: row.SupervisorId,
    supervisorName: row.SupervisorName,
    workCenterId: row.WorkCenterId,
    workCenterName: row.WorkCenterName,
    status: row.Status,
    submittedAt: toIso(row.SubmittedAt),
    submittedBy: row.SubmittedBy,
    approvedAt: toIso(row.ApprovedAt),
    approvedBy: row.ApprovedBy,
    lastSyncAt: toIso(row.LastSyncAt),
    payrollAcknowledgedAt: toIso(row.PayrollAcknowledgedAt),
    payrollAcknowledgedBy: row.PayrollAcknowledgedBy,
    projectManager: row.ProjectManager,
    projectManagerProjectCode: row.ProjectManagerProjectCode,
    currentApprovalStage: row.CurrentApprovalStage,
    currentApprover: row.CurrentApprover,
    shiftLabel: row.ShiftLabel || null,
    workflowHistory: eventsByHeader.get(row.Id) || [],
  }));
  const lines: TimesheetLine[] = linesResult.recordset.map((row) => ({
    id: row.Id,
    headerId: row.HeaderId,
    employeeId: row.EmployeeId,
    employeeNo: row.EmployeeNo,
    employeeName: row.EmployeeName,
    biometricId: row.BiometricId,
    attendanceId: row.AttendanceId,
    clockIn: row.ClockIn,
    clockOut: row.ClockOut,
    attendanceDuration: Number(row.AttendanceDuration || 0),
    projectAllocations: normalizeProjectAllocations(projectByLine.get(row.Id) || []),
    idleAllocations: (idleByLine.get(row.Id) || []).map(withDefaultIdleReason),
    usedHours: Number(row.UsedHours || 0),
    idleHours: Number(row.IdleHours || 0),
    totalHours: Number(row.TotalHours || 0),
    variance: Number(row.Variance || 0),
    remarks: row.Remarks,
    validationStatus: row.ValidationStatus,
    validationMessage: row.ValidationMessage,
  }));
  return { headers, lines };
}

export async function writeTimesheetData(data: { headers: TimesheetHeader[]; lines: TimesheetLine[] }) {
  const pool = await db();
  const tx = new sql.Transaction(pool);
  const safeLines = dedupeTimesheetLinesByEmployee(data.lines).lines;
  await tx.begin();
  try {
    for (const header of data.headers) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(160), header.id)
        .input('PeriodId', sql.NVarChar(40), header.periodId)
        .input('TimesheetDate', sql.Date, header.timesheetDate)
        .input('SupervisorId', sql.NVarChar(120), header.supervisorId)
        .input('SupervisorName', sql.NVarChar(180), header.supervisorName)
        .input('WorkCenterId', sql.NVarChar(100), header.workCenterId)
        .input('WorkCenterName', sql.NVarChar(180), header.workCenterName)
        .input('Status', sql.NVarChar(50), header.status)
        .input('SubmittedAt', sql.DateTime2, header.submittedAt ? new Date(header.submittedAt) : null)
        .input('SubmittedBy', sql.NVarChar(120), header.submittedBy)
        .input('ApprovedAt', sql.DateTime2, header.approvedAt ? new Date(header.approvedAt) : null)
        .input('ApprovedBy', sql.NVarChar(120), header.approvedBy)
        .input('LastSyncAt', sql.DateTime2, header.lastSyncAt ? new Date(header.lastSyncAt) : null)
        .input('PayrollAcknowledgedAt', sql.DateTime2, header.payrollAcknowledgedAt ? new Date(header.payrollAcknowledgedAt) : null)
        .input('PayrollAcknowledgedBy', sql.NVarChar(120), header.payrollAcknowledgedBy ?? null)
        .input('ProjectManager', sql.NVarChar(220), header.projectManager ?? null)
        .input('ProjectManagerProjectCode', sql.NVarChar(50), header.projectManagerProjectCode ?? null)
        .input('CurrentApprovalStage', sql.NVarChar(60), header.currentApprovalStage ?? null)
        .input('CurrentApprover', sql.NVarChar(220), header.currentApprover ?? null)
        .input('ShiftLabel', sql.NVarChar(40), header.shiftLabel ?? null)
        .query(`
MERGE [hris].[TimesheetHeaders] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [PeriodId]=@PeriodId,[TimesheetDate]=@TimesheetDate,[SupervisorId]=@SupervisorId,[SupervisorName]=@SupervisorName,[WorkCenterId]=@WorkCenterId,[WorkCenterName]=@WorkCenterName,[Status]=@Status,[SubmittedAt]=@SubmittedAt,[SubmittedBy]=@SubmittedBy,[ApprovedAt]=@ApprovedAt,[ApprovedBy]=@ApprovedBy,[LastSyncAt]=@LastSyncAt,[PayrollAcknowledgedAt]=@PayrollAcknowledgedAt,[PayrollAcknowledgedBy]=@PayrollAcknowledgedBy,[ProjectManager]=@ProjectManager,[ProjectManagerProjectCode]=@ProjectManagerProjectCode,[CurrentApprovalStage]=@CurrentApprovalStage,[CurrentApprover]=@CurrentApprover,[ShiftLabel]=@ShiftLabel
WHEN NOT MATCHED THEN INSERT ([Id],[PeriodId],[TimesheetDate],[SupervisorId],[SupervisorName],[WorkCenterId],[WorkCenterName],[Status],[SubmittedAt],[SubmittedBy],[ApprovedAt],[ApprovedBy],[LastSyncAt],[PayrollAcknowledgedAt],[PayrollAcknowledgedBy],[ProjectManager],[ProjectManagerProjectCode],[CurrentApprovalStage],[CurrentApprover],[ShiftLabel])
VALUES (@Id,@PeriodId,@TimesheetDate,@SupervisorId,@SupervisorName,@WorkCenterId,@WorkCenterName,@Status,@SubmittedAt,@SubmittedBy,@ApprovedAt,@ApprovedBy,@LastSyncAt,@PayrollAcknowledgedAt,@PayrollAcknowledgedBy,@ProjectManager,@ProjectManagerProjectCode,@CurrentApprovalStage,@CurrentApprover,@ShiftLabel);`);
      await new sql.Request(tx).input('HeaderId', sql.NVarChar(160), header.id).query(`DELETE FROM [hris].[TimesheetWorkflowEvents] WHERE [HeaderId]=@HeaderId`);
      for (const event of header.workflowHistory || []) {
        await new sql.Request(tx)
          .input('HeaderId', sql.NVarChar(160), header.id)
          .input('Stage', sql.NVarChar(60), event.stage)
          .input('Decision', sql.NVarChar(60), event.decision)
          .input('Actor', sql.NVarChar(120), event.by)
          .input('ActedAt', sql.DateTime2, new Date(event.actedAt))
          .input('Comment', sql.NVarChar(500), event.comment)
          .query(`INSERT INTO [hris].[TimesheetWorkflowEvents] ([HeaderId],[Stage],[Decision],[Actor],[ActedAt],[Comment]) VALUES (@HeaderId,@Stage,@Decision,@Actor,@ActedAt,@Comment)`);
      }
    }
    const lineIdsByHeader = new Map<string, Set<string>>();
    for (const line of safeLines) {
      const ids = lineIdsByHeader.get(line.headerId) || new Set<string>();
      ids.add(line.id);
      lineIdsByHeader.set(line.headerId, ids);
    }
    for (const header of data.headers) {
      const existing = await new sql.Request(tx)
        .input('HeaderId', sql.NVarChar(160), header.id)
        .query(`SELECT [Id] FROM [hris].[TimesheetLines] WHERE [HeaderId]=@HeaderId`);
      const currentIds = lineIdsByHeader.get(header.id) || new Set<string>();
      for (const row of existing.recordset) {
        if (currentIds.has(row.Id)) continue;
        await new sql.Request(tx)
          .input('Id', sql.NVarChar(220), row.Id)
          .query(`DELETE FROM [hris].[TimesheetLines] WHERE [Id]=@Id`);
      }
    }
    for (const line of safeLines) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(220), line.id)
        .input('HeaderId', sql.NVarChar(160), line.headerId)
        .input('EmployeeId', sql.NVarChar(80), line.employeeId)
        .input('EmployeeNo', sql.NVarChar(80), line.employeeNo)
        .input('EmployeeName', sql.NVarChar(220), line.employeeName)
        .input('BiometricId', sql.NVarChar(120), line.biometricId)
        .input('AttendanceId', sql.NVarChar(120), line.attendanceId)
        .input('ClockIn', sql.NVarChar(40), line.clockIn)
        .input('ClockOut', sql.NVarChar(40), line.clockOut)
        .input('AttendanceDuration', sql.Decimal(9, 2), line.attendanceDuration)
        .input('UsedHours', sql.Decimal(9, 2), line.usedHours)
        .input('IdleHours', sql.Decimal(9, 2), line.idleHours)
        .input('TotalHours', sql.Decimal(9, 2), line.totalHours)
        .input('Variance', sql.Decimal(9, 2), line.variance)
        .input('Remarks', sql.NVarChar(500), line.remarks)
        .input('ValidationStatus', sql.NVarChar(30), line.validationStatus)
        .input('ValidationMessage', sql.NVarChar(500), line.validationMessage)
        .query(`
MERGE [hris].[TimesheetLines] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [HeaderId]=@HeaderId,[EmployeeId]=@EmployeeId,[EmployeeNo]=@EmployeeNo,[EmployeeName]=@EmployeeName,[BiometricId]=@BiometricId,[AttendanceId]=@AttendanceId,[ClockIn]=@ClockIn,[ClockOut]=@ClockOut,[AttendanceDuration]=@AttendanceDuration,[UsedHours]=@UsedHours,[IdleHours]=@IdleHours,[TotalHours]=@TotalHours,[Variance]=@Variance,[Remarks]=@Remarks,[ValidationStatus]=@ValidationStatus,[ValidationMessage]=@ValidationMessage
WHEN NOT MATCHED THEN INSERT ([Id],[HeaderId],[EmployeeId],[EmployeeNo],[EmployeeName],[BiometricId],[AttendanceId],[ClockIn],[ClockOut],[AttendanceDuration],[UsedHours],[IdleHours],[TotalHours],[Variance],[Remarks],[ValidationStatus],[ValidationMessage])
VALUES (@Id,@HeaderId,@EmployeeId,@EmployeeNo,@EmployeeName,@BiometricId,@AttendanceId,@ClockIn,@ClockOut,@AttendanceDuration,@UsedHours,@IdleHours,@TotalHours,@Variance,@Remarks,@ValidationStatus,@ValidationMessage);`);
      await new sql.Request(tx).input('LineId', sql.NVarChar(220), line.id).query(`DELETE FROM [hris].[TimesheetProjectAllocations] WHERE [LineId]=@LineId; DELETE FROM [hris].[TimesheetIdleAllocations] WHERE [LineId]=@LineId;`);
      for (const allocation of normalizeProjectAllocations(line.projectAllocations || [])) {
        await new sql.Request(tx)
          .input('LineId', sql.NVarChar(220), line.id)
          .input('ProjectId', sql.NVarChar(80), allocation.projectId)
          .input('ProjectCode', sql.NVarChar(50), allocation.projectCode)
          .input('ProjectName', sql.NVarChar(255), allocation.projectName)
          .input('TaskId', sql.NVarChar(80), allocation.taskId ?? null)
          .input('TaskName', sql.NVarChar(255), allocation.taskName ?? null)
          .input('ActivityId', sql.NVarChar(80), allocation.activityId ?? null)
          .input('Hours', sql.Decimal(9, 2), allocation.hours)
          .input('Remarks', sql.NVarChar(500), allocation.remarks)
          .query(`INSERT INTO [hris].[TimesheetProjectAllocations] ([LineId],[ProjectId],[ProjectCode],[ProjectName],[TaskId],[TaskName],[ActivityId],[Hours],[Remarks]) VALUES (@LineId,@ProjectId,@ProjectCode,@ProjectName,@TaskId,@TaskName,@ActivityId,@Hours,@Remarks)`);
      }
      for (const allocation of (line.idleAllocations || []).map(withDefaultIdleReason)) {
        await new sql.Request(tx)
          .input('LineId', sql.NVarChar(220), line.id)
          .input('ReasonId', sql.NVarChar(80), allocation.reasonId)
          .input('ReasonName', sql.NVarChar(180), allocation.reasonName)
          .input('Hours', sql.Decimal(9, 2), allocation.hours)
          .input('Remarks', sql.NVarChar(500), allocation.remarks)
          .query(`INSERT INTO [hris].[TimesheetIdleAllocations] ([LineId],[ReasonId],[ReasonName],[Hours],[Remarks]) VALUES (@LineId,@ReasonId,@ReasonName,@Hours,@Remarks)`);
      }
    }
    await tx.commit();
    invalidateTimesheetDataCache();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function writeTimesheetHeaderLines(header: TimesheetHeader, lines: TimesheetLine[]) {
  const pool = await db();
  const tx = new sql.Transaction(pool);
  const safeLines = dedupeTimesheetLinesByEmployee(lines).lines;
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('Id', sql.NVarChar(160), header.id)
      .input('PeriodId', sql.NVarChar(40), header.periodId)
      .input('TimesheetDate', sql.Date, header.timesheetDate)
      .input('SupervisorId', sql.NVarChar(120), header.supervisorId)
      .input('SupervisorName', sql.NVarChar(180), header.supervisorName)
      .input('WorkCenterId', sql.NVarChar(100), header.workCenterId)
      .input('WorkCenterName', sql.NVarChar(180), header.workCenterName)
      .input('Status', sql.NVarChar(50), header.status)
      .input('SubmittedAt', sql.DateTime2, header.submittedAt ? new Date(header.submittedAt) : null)
      .input('SubmittedBy', sql.NVarChar(120), header.submittedBy)
      .input('ApprovedAt', sql.DateTime2, header.approvedAt ? new Date(header.approvedAt) : null)
      .input('ApprovedBy', sql.NVarChar(120), header.approvedBy)
      .input('LastSyncAt', sql.DateTime2, header.lastSyncAt ? new Date(header.lastSyncAt) : null)
      .input('PayrollAcknowledgedAt', sql.DateTime2, header.payrollAcknowledgedAt ? new Date(header.payrollAcknowledgedAt) : null)
      .input('PayrollAcknowledgedBy', sql.NVarChar(120), header.payrollAcknowledgedBy ?? null)
      .input('ProjectManager', sql.NVarChar(220), header.projectManager ?? null)
      .input('ProjectManagerProjectCode', sql.NVarChar(50), header.projectManagerProjectCode ?? null)
      .input('CurrentApprovalStage', sql.NVarChar(60), header.currentApprovalStage ?? null)
      .input('CurrentApprover', sql.NVarChar(220), header.currentApprover ?? null)
      .input('ShiftLabel', sql.NVarChar(40), header.shiftLabel ?? null)
      .query(`
MERGE [hris].[TimesheetHeaders] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [PeriodId]=@PeriodId,[TimesheetDate]=@TimesheetDate,[SupervisorId]=@SupervisorId,[SupervisorName]=@SupervisorName,[WorkCenterId]=@WorkCenterId,[WorkCenterName]=@WorkCenterName,[Status]=@Status,[SubmittedAt]=@SubmittedAt,[SubmittedBy]=@SubmittedBy,[ApprovedAt]=@ApprovedAt,[ApprovedBy]=@ApprovedBy,[LastSyncAt]=@LastSyncAt,[PayrollAcknowledgedAt]=@PayrollAcknowledgedAt,[PayrollAcknowledgedBy]=@PayrollAcknowledgedBy,[ProjectManager]=@ProjectManager,[ProjectManagerProjectCode]=@ProjectManagerProjectCode,[CurrentApprovalStage]=@CurrentApprovalStage,[CurrentApprover]=@CurrentApprover,[ShiftLabel]=@ShiftLabel
WHEN NOT MATCHED THEN INSERT ([Id],[PeriodId],[TimesheetDate],[SupervisorId],[SupervisorName],[WorkCenterId],[WorkCenterName],[Status],[SubmittedAt],[SubmittedBy],[ApprovedAt],[ApprovedBy],[LastSyncAt],[PayrollAcknowledgedAt],[PayrollAcknowledgedBy],[ProjectManager],[ProjectManagerProjectCode],[CurrentApprovalStage],[CurrentApprover],[ShiftLabel])
VALUES (@Id,@PeriodId,@TimesheetDate,@SupervisorId,@SupervisorName,@WorkCenterId,@WorkCenterName,@Status,@SubmittedAt,@SubmittedBy,@ApprovedAt,@ApprovedBy,@LastSyncAt,@PayrollAcknowledgedAt,@PayrollAcknowledgedBy,@ProjectManager,@ProjectManagerProjectCode,@CurrentApprovalStage,@CurrentApprover,@ShiftLabel);`);

    await new sql.Request(tx).input('HeaderId', sql.NVarChar(160), header.id).query(`DELETE FROM [hris].[TimesheetWorkflowEvents] WHERE [HeaderId]=@HeaderId`);
    for (const event of header.workflowHistory || []) {
      await new sql.Request(tx)
        .input('HeaderId', sql.NVarChar(160), header.id)
        .input('Stage', sql.NVarChar(60), event.stage)
        .input('Decision', sql.NVarChar(60), event.decision)
        .input('Actor', sql.NVarChar(120), event.by)
        .input('ActedAt', sql.DateTime2, new Date(event.actedAt))
        .input('Comment', sql.NVarChar(500), event.comment)
        .query(`INSERT INTO [hris].[TimesheetWorkflowEvents] ([HeaderId],[Stage],[Decision],[Actor],[ActedAt],[Comment]) VALUES (@HeaderId,@Stage,@Decision,@Actor,@ActedAt,@Comment)`);
    }

    const currentIds = new Set(safeLines.map((line) => line.id));
    const existing = await new sql.Request(tx)
      .input('HeaderId', sql.NVarChar(160), header.id)
      .query(`SELECT [Id] FROM [hris].[TimesheetLines] WHERE [HeaderId]=@HeaderId`);
    for (const row of existing.recordset) {
      if (currentIds.has(row.Id)) continue;
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(220), row.Id)
        .query(`DELETE FROM [hris].[TimesheetLines] WHERE [Id]=@Id`);
    }

    for (const line of safeLines) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(220), line.id)
        .input('HeaderId', sql.NVarChar(160), line.headerId)
        .input('EmployeeId', sql.NVarChar(80), line.employeeId)
        .input('EmployeeNo', sql.NVarChar(80), line.employeeNo)
        .input('EmployeeName', sql.NVarChar(220), line.employeeName)
        .input('BiometricId', sql.NVarChar(120), line.biometricId)
        .input('AttendanceId', sql.NVarChar(120), line.attendanceId)
        .input('ClockIn', sql.NVarChar(40), line.clockIn)
        .input('ClockOut', sql.NVarChar(40), line.clockOut)
        .input('AttendanceDuration', sql.Decimal(9, 2), line.attendanceDuration)
        .input('UsedHours', sql.Decimal(9, 2), line.usedHours)
        .input('IdleHours', sql.Decimal(9, 2), line.idleHours)
        .input('TotalHours', sql.Decimal(9, 2), line.totalHours)
        .input('Variance', sql.Decimal(9, 2), line.variance)
        .input('Remarks', sql.NVarChar(500), line.remarks)
        .input('ValidationStatus', sql.NVarChar(30), line.validationStatus)
        .input('ValidationMessage', sql.NVarChar(500), line.validationMessage)
        .query(`
MERGE [hris].[TimesheetLines] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [HeaderId]=@HeaderId,[EmployeeId]=@EmployeeId,[EmployeeNo]=@EmployeeNo,[EmployeeName]=@EmployeeName,[BiometricId]=@BiometricId,[AttendanceId]=@AttendanceId,[ClockIn]=@ClockIn,[ClockOut]=@ClockOut,[AttendanceDuration]=@AttendanceDuration,[UsedHours]=@UsedHours,[IdleHours]=@IdleHours,[TotalHours]=@TotalHours,[Variance]=@Variance,[Remarks]=@Remarks,[ValidationStatus]=@ValidationStatus,[ValidationMessage]=@ValidationMessage
WHEN NOT MATCHED THEN INSERT ([Id],[HeaderId],[EmployeeId],[EmployeeNo],[EmployeeName],[BiometricId],[AttendanceId],[ClockIn],[ClockOut],[AttendanceDuration],[UsedHours],[IdleHours],[TotalHours],[Variance],[Remarks],[ValidationStatus],[ValidationMessage])
VALUES (@Id,@HeaderId,@EmployeeId,@EmployeeNo,@EmployeeName,@BiometricId,@AttendanceId,@ClockIn,@ClockOut,@AttendanceDuration,@UsedHours,@IdleHours,@TotalHours,@Variance,@Remarks,@ValidationStatus,@ValidationMessage);`);

      await new sql.Request(tx).input('LineId', sql.NVarChar(220), line.id).query(`DELETE FROM [hris].[TimesheetProjectAllocations] WHERE [LineId]=@LineId; DELETE FROM [hris].[TimesheetIdleAllocations] WHERE [LineId]=@LineId;`);
      for (const allocation of normalizeProjectAllocations(line.projectAllocations || [])) {
        await new sql.Request(tx)
          .input('LineId', sql.NVarChar(220), line.id)
          .input('ProjectId', sql.NVarChar(80), allocation.projectId)
          .input('ProjectCode', sql.NVarChar(50), allocation.projectCode)
          .input('ProjectName', sql.NVarChar(255), allocation.projectName)
          .input('TaskId', sql.NVarChar(80), allocation.taskId ?? null)
          .input('TaskName', sql.NVarChar(255), allocation.taskName ?? null)
          .input('ActivityId', sql.NVarChar(80), allocation.activityId ?? null)
          .input('Hours', sql.Decimal(9, 2), allocation.hours)
          .input('Remarks', sql.NVarChar(500), allocation.remarks)
          .query(`INSERT INTO [hris].[TimesheetProjectAllocations] ([LineId],[ProjectId],[ProjectCode],[ProjectName],[TaskId],[TaskName],[ActivityId],[Hours],[Remarks]) VALUES (@LineId,@ProjectId,@ProjectCode,@ProjectName,@TaskId,@TaskName,@ActivityId,@Hours,@Remarks)`);
      }
      for (const allocation of (line.idleAllocations || []).map(withDefaultIdleReason)) {
        await new sql.Request(tx)
          .input('LineId', sql.NVarChar(220), line.id)
          .input('ReasonId', sql.NVarChar(80), allocation.reasonId)
          .input('ReasonName', sql.NVarChar(180), allocation.reasonName)
          .input('Hours', sql.Decimal(9, 2), allocation.hours)
          .input('Remarks', sql.NVarChar(500), allocation.remarks)
          .query(`INSERT INTO [hris].[TimesheetIdleAllocations] ([LineId],[ReasonId],[ReasonName],[Hours],[Remarks]) VALUES (@LineId,@ReasonId,@ReasonName,@Hours,@Remarks)`);
      }
    }

    await tx.commit();
    invalidateTimesheetDataCache();
    invalidateTimesheetApprovalWorkspaceCache();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function readTimesheetDraftBookedHeaders(options?: { softFail?: boolean }) {
  let pool: sql.ConnectionPool;
  try {
    pool = await db();
  } catch (error) {
    if (options?.softFail) return { headers: [] as TimesheetHeader[], lines: [] as TimesheetLine[] };
    throw error;
  }

  const headersResult = await pool.request().query(`
    SELECT DISTINCT h.*
    FROM [hris].[TimesheetHeaders] h
    INNER JOIN [hris].[TimesheetLines] l ON ${joinHeaderToLine}
    INNER JOIN [hris].[TimesheetProjectAllocations] a ON ${joinLineToAllocation}
    WHERE h.[Status] = N'Draft' AND a.[Hours] > 0
    ORDER BY h.[TimesheetDate] DESC, h.[SupervisorName], h.[WorkCenterName]
  `);

  const headerIds = headersResult.recordset.map((row) => String(row.Id));
  const { eventsByHeader, lines } = await loadTimesheetChildData(pool, headerIds);
  const headers = headersResult.recordset.map((row) => mapTimesheetHeaderRow(row, eventsByHeader));
  return { headers, lines };
}

export async function readTimesheetPayrollUpdates(): Promise<TimesheetPayrollUpdate[]> {
  const pool = await db();
  const [updatesResult, headersResult, employeesResult] = await Promise.all([
    pool.request().query(`SELECT * FROM [hris].[TimesheetPayrollUpdates] ORDER BY [AcknowledgedAt] DESC`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetPayrollUpdateHeaders]`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetPayrollUpdateEmployees] ORDER BY [EmployeeName]`),
  ]);
  const seenPeriods = new Set<string>();
  const latestRows = updatesResult.recordset.filter((row) => {
    const periodId = String(row.PeriodId || '');
    if (!periodId || seenPeriods.has(periodId)) return false;
    seenPeriods.add(periodId);
    return true;
  });
  return latestRows.map((row) => ({
    id: row.Id,
    periodId: row.PeriodId,
    periodName: row.PeriodName,
    acknowledgedAt: toIso(row.AcknowledgedAt) || new Date().toISOString(),
    acknowledgedBy: row.AcknowledgedBy,
    headerIds: headersResult.recordset.filter((item) => item.PayrollUpdateId === row.Id).map((item) => item.HeaderId),
    employeeAttendance: employeesResult.recordset.filter((item) => item.PayrollUpdateId === row.Id).map((item) => ({
      employeeId: item.EmployeeId,
      employeeName: item.EmployeeName,
      daysWorked: Number(item.DaysWorked || 0),
      attendanceHours: Number(item.AttendanceHours || 0),
      bookedHours: Number(item.BookedHours || 0),
      idleHours: Number(item.IdleHours || 0),
    })),
  }));
}

export type EmployeeAttendanceAggregate = {
  employeeId: string;
  employeeName: string;
  daysWorked: number;
  attendanceHours: number;
  bookedHours: number;
  idleHours: number;
  skippedDuplicateDays: number;
};

const payrollReadyHeaderStatuses = new Set<TimesheetStatus>(['HR_Acknowledged', 'Locked', 'Approved']);

export const isTimesheetCountableForPayroll = (status: TimesheetStatus | string) =>
  !['Rejected', 'Returned'].includes(normalizeTimesheetStatus(status as TimesheetStatus));

/** Prefer contract employee code (C####) when matching payroll directory rows. */
export const canonicalTimesheetEmployeeKey = (line: Pick<TimesheetLine, 'employeeId' | 'employeeNo' | 'employeeName'>) => {
  const compact = (value: unknown) => String(value || '').trim();
  const candidates = [line.employeeNo, line.employeeId, line.employeeName]
    .map((value) => normalizePayrollMatchKey(compact(value)))
    .filter(Boolean);
  const contractCode = candidates.find((key) => /^C\d+/.test(key));
  return contractCode || candidates[0] || 'UNKNOWN';
};

/** A payable day is recorded when attendance exists, hours are booked, or paid leave applies. */
export const isPaidWorkDay = (line: Pick<TimesheetLine, 'clockIn' | 'totalHours' | 'usedHours' | 'projectAllocations' | 'idleAllocations' | 'remarks'>) => {
  const hasClock = Boolean(String(line.clockIn || '').trim());
  const hasBooked = normalizePaidWorkHours(Number(line.totalHours || 0)) > 0 || normalizePaidWorkHours(Number(line.usedHours || 0)) > 0;
  return hasClock || hasBooked || isTimesheetPaidLeaveLine(line);
};

/** Payroll day rule aligned with HR master sheets: Mon–Sat count clock/booked/leave; Sunday is never payable. */
export const isPayrollPayableWorkDay = (
  line: Pick<TimesheetLine, 'clockIn' | 'totalHours' | 'usedHours' | 'projectAllocations' | 'idleAllocations' | 'remarks'>,
  timesheetDate: string,
) => {
  const dateKey = String(timesheetDate || '').slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? new Date(`${dateKey}T12:00:00Z`).getUTCDay() : -1;
  if (day === 0) return false;
  if (isTimesheetPaidLeaveLine(line)) return true;
  const hasBooked = normalizePaidWorkHours(Number(line.totalHours || 0)) > 0 || normalizePaidWorkHours(Number(line.usedHours || 0)) > 0;
  if (hasBooked) return true;
  return Boolean(String(line.clockIn || '').trim());
};

/** Canonical payroll attendance totals — one paid day per employee per calendar date across all headers. */
export const aggregateEmployeeAttendanceForHeaders = (
  headers: TimesheetHeader[],
  lines: TimesheetLine[],
  options?: { headerIds?: string[]; payrollReadyOnly?: boolean },
) => {
  const headerIds = new Set(options?.headerIds || headers.map((header) => header.id));
  const headerById = new Map(headers.filter((header) => headerIds.has(header.id)).map((header) => [header.id, header]));
  const totals = new Map<string, EmployeeAttendanceAggregate>();
  const countedEmployeeDates = new Set<string>();

  for (const line of lines) {
    if (!headerIds.has(line.headerId)) continue;
    const header = headerById.get(line.headerId);
    if (!header) continue;
    const status = normalizeTimesheetStatus(header.status);
    if (!isTimesheetCountableForPayroll(status)) continue;
    if (options?.payrollReadyOnly && !payrollReadyHeaderStatuses.has(status)) continue;

    const dateKey = header.timesheetDate || '';
    const paidDay = isPayrollPayableWorkDay(line, dateKey);
    const employeeKey = canonicalTimesheetEmployeeKey(line);
    const employeeDateKey = `${employeeKey}::${dateKey}`;
    if (paidDay && dateKey && countedEmployeeDates.has(employeeDateKey)) {
      const current = totals.get(employeeKey);
      if (current) current.skippedDuplicateDays += 1;
      continue;
    }
    if (paidDay && dateKey) countedEmployeeDates.add(employeeDateKey);

    const current = totals.get(employeeKey) || {
      employeeId: employeeKey,
      employeeName: line.employeeName,
      daysWorked: 0,
      attendanceHours: 0,
      bookedHours: 0,
      idleHours: 0,
      skippedDuplicateDays: 0,
    };
    if (!current.employeeName && line.employeeName) current.employeeName = line.employeeName;
    current.daysWorked += paidDay ? 1 : 0;
    current.attendanceHours = Math.round((current.attendanceHours + normalizePaidWorkHours(line.attendanceDuration)) * 10) / 10;
    current.bookedHours = Math.round((current.bookedHours + normalizePaidWorkHours(line.totalHours)) * 10) / 10;
    current.idleHours = Math.round((current.idleHours + line.idleHours) * 10) / 10;
    totals.set(employeeKey, current);
  }

  return totals;
};

const synthesizeTimesheetHoursForPeriod = async (periodId: string) => {
  const { headers, lines } = await readTimesheetData();
  const periodHeaders = headers.filter((header) => header.periodId === periodId && isTimesheetCountableForPayroll(header.status));
  const totals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
    headerIds: periodHeaders.map((header) => header.id),
    payrollReadyOnly: false,
  });
  const aliasesByEmployee = new Map<string, { employeeNo?: string; employeeName?: string }>();
  for (const line of lines) {
    if (!periodHeaders.some((header) => header.id === line.headerId)) continue;
    const key = canonicalTimesheetEmployeeKey(line);
    const current = aliasesByEmployee.get(key) || {};
    aliasesByEmployee.set(key, {
      employeeNo: current.employeeNo || line.employeeNo,
      employeeName: current.employeeName || line.employeeName,
    });
  }
  const mapped = new Map<string, { daysWorked: number; bookedHours: number; employeeNo?: string; employeeName?: string }>();
  for (const [employeeKey, aggregate] of totals) {
    const alias = aliasesByEmployee.get(employeeKey);
    mapped.set(employeeKey, {
      daysWorked: aggregate.daysWorked,
      bookedHours: aggregate.bookedHours,
      employeeNo: alias?.employeeNo,
      employeeName: alias?.employeeName || aggregate.employeeName,
    });
  }
  return mapped;
};

const registerTimesheetHours = (
  map: Map<string, { daysWorked: number; bookedHours: number }>,
  employeeId: string,
  employeeNo: string | undefined,
  employeeName: string | undefined,
  data: { daysWorked: number; bookedHours: number },
) => {
  const compact = (value: unknown) => String(value || '').trim();
  const keys = [employeeId, employeeNo, employeeName, normalizePayrollMatchKey(employeeId), normalizePayrollMatchKey(employeeNo), normalizePayrollMatchKey(employeeName)]
    .map((key) => compact(key))
    .filter(Boolean);
  keys.forEach((key) => map.set(key, data));
};

const hasTimesheetHours = (map: Map<string, { daysWorked: number; bookedHours: number }>, employeeId: string, employeeNo?: string, employeeName?: string) => {
  const compact = (value: unknown) => String(value || '').trim();
  const keys = [employeeId, employeeNo, employeeName, normalizePayrollMatchKey(employeeId), normalizePayrollMatchKey(employeeNo), normalizePayrollMatchKey(employeeName)]
    .map((key) => compact(key))
    .filter(Boolean);
  return keys.some((key) => {
    const entry = map.get(key);
    return Boolean(entry && (entry.daysWorked > 0 || entry.bookedHours > 0));
  });
};

/** Approved timesheet hours for payroll — locked/HR-acknowledged lines first, payroll snapshots only as fallback. */
const TIMESHEET_HOURS_CACHE_MS = Number(process.env.HRIS_TIMESHEET_HOURS_CACHE_MS || 120000);
type TimesheetHoursCacheEntry = {
  expiresAt: number;
  map: Map<string, { daysWorked: number; bookedHours: number }>;
  inFlight?: Promise<Map<string, { daysWorked: number; bookedHours: number }>>;
};
const timesheetHoursCache = new Map<string, TimesheetHoursCacheEntry>();

export const invalidateTimesheetHoursCacheForPeriod = (period?: string) => {
  if (!period) {
    timesheetHoursCache.clear();
  } else {
    const periodId = period.startsWith('per-') ? period : `per-${period}`;
    timesheetHoursCache.delete(periodId);
    timesheetHoursCache.delete(period.replace(/^per-/, ''));
  }
  void import('@/lib/payroll-calculation-service')
    .then((mod) => mod.invalidatePayrollCalculationCache(period?.replace(/^per-/, '')))
    .catch(() => undefined);
};

export async function buildTimesheetHoursMapForPayrollPeriod(period: string) {
  const periodId = period.startsWith('per-') ? period : `per-${period}`;
  const cached = timesheetHoursCache.get(periodId);
  if (cached?.map && cached.expiresAt > Date.now()) return cached.map;
  if (cached?.inFlight) return cached.inFlight;

  const inFlight = (async () => {
    const map = new Map<string, { daysWorked: number; bookedHours: number }>();
    const periodToken = period.replace(/^per-/, '');

    try {
      const synthesized = await synthesizeTimesheetHoursForPeriod(periodId);
      synthesized.forEach((data, employeeId) => {
        registerTimesheetHours(map, employeeId, data.employeeNo, data.employeeName, {
          daysWorked: data.daysWorked,
          bookedHours: data.bookedHours,
        });
      });
    } catch (error) {
      console.warn('[Timesheet] Unable to synthesize payroll hours from entries:', error instanceof Error ? error.message : error);
    }

    try {
      const updates = await readTimesheetPayrollUpdates();
      const update = updates.find((item) => item.periodId === periodId || String(item.periodName || '').includes(periodToken));
      if (update) {
        for (const employee of update.employeeAttendance) {
          if (hasTimesheetHours(map, employee.employeeId, undefined, employee.employeeName)) continue;
          registerTimesheetHours(map, employee.employeeId, undefined, employee.employeeName, {
            daysWorked: Number(employee.daysWorked || 0),
            bookedHours: Number(employee.bookedHours || 0),
          });
        }
      }
    } catch (error) {
      console.warn('[Timesheet] Payroll update feed unavailable:', error instanceof Error ? error.message : error);
    }

    timesheetHoursCache.set(periodId, { expiresAt: Date.now() + TIMESHEET_HOURS_CACHE_MS, map });
    return map;
  })();

  timesheetHoursCache.set(periodId, {
    expiresAt: 0,
    map: cached?.map ?? new Map(),
    inFlight,
  });
  return inFlight;
}

export async function writeTimesheetPayrollUpdates(updates: TimesheetPayrollUpdate[]) {
  const pool = await db();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const periodIds = Array.from(new Set(updates.map((update) => update.periodId).filter(Boolean)));
    for (const periodId of periodIds) {
      await new sql.Request(tx)
        .input('PeriodId', sql.NVarChar(40), periodId)
        .query(`
          DELETE e
          FROM [hris].[TimesheetPayrollUpdateEmployees] e
          INNER JOIN [hris].[TimesheetPayrollUpdates] u ON u.[Id] = e.[PayrollUpdateId]
          WHERE u.[PeriodId] = @PeriodId;
          DELETE h
          FROM [hris].[TimesheetPayrollUpdateHeaders] h
          INNER JOIN [hris].[TimesheetPayrollUpdates] u ON u.[Id] = h.[PayrollUpdateId]
          WHERE u.[PeriodId] = @PeriodId;
          DELETE FROM [hris].[TimesheetPayrollUpdates] WHERE [PeriodId] = @PeriodId;
        `);
    }
    for (const update of updates) {
      await new sql.Request(tx)
        .input('Id', sql.NVarChar(160), update.id)
        .input('PeriodId', sql.NVarChar(40), update.periodId)
        .input('PeriodName', sql.NVarChar(80), update.periodName)
        .input('AcknowledgedAt', sql.DateTime2, new Date(update.acknowledgedAt))
        .input('AcknowledgedBy', sql.NVarChar(120), update.acknowledgedBy)
        .query(`
MERGE [hris].[TimesheetPayrollUpdates] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [PeriodId]=@PeriodId,[PeriodName]=@PeriodName,[AcknowledgedAt]=@AcknowledgedAt,[AcknowledgedBy]=@AcknowledgedBy
WHEN NOT MATCHED THEN INSERT ([Id],[PeriodId],[PeriodName],[AcknowledgedAt],[AcknowledgedBy]) VALUES (@Id,@PeriodId,@PeriodName,@AcknowledgedAt,@AcknowledgedBy);`);
      await new sql.Request(tx).input('Id', sql.NVarChar(160), update.id).query(`DELETE FROM [hris].[TimesheetPayrollUpdateHeaders] WHERE [PayrollUpdateId]=@Id; DELETE FROM [hris].[TimesheetPayrollUpdateEmployees] WHERE [PayrollUpdateId]=@Id;`);
      for (const headerId of update.headerIds) {
        await new sql.Request(tx)
          .input('PayrollUpdateId', sql.NVarChar(160), update.id)
          .input('HeaderId', sql.NVarChar(160), headerId)
          .query(`INSERT INTO [hris].[TimesheetPayrollUpdateHeaders] ([PayrollUpdateId],[HeaderId]) VALUES (@PayrollUpdateId,@HeaderId)`);
      }
      for (const employee of update.employeeAttendance) {
        await new sql.Request(tx)
          .input('PayrollUpdateId', sql.NVarChar(160), update.id)
          .input('EmployeeId', sql.NVarChar(80), employee.employeeId)
          .input('EmployeeName', sql.NVarChar(220), employee.employeeName)
          .input('DaysWorked', sql.Int, employee.daysWorked)
          .input('AttendanceHours', sql.Decimal(9, 2), employee.attendanceHours)
          .input('BookedHours', sql.Decimal(9, 2), employee.bookedHours)
          .input('IdleHours', sql.Decimal(9, 2), employee.idleHours)
          .query(`INSERT INTO [hris].[TimesheetPayrollUpdateEmployees] ([PayrollUpdateId],[EmployeeId],[EmployeeName],[DaysWorked],[AttendanceHours],[BookedHours],[IdleHours]) VALUES (@PayrollUpdateId,@EmployeeId,@EmployeeName,@DaysWorked,@AttendanceHours,@BookedHours,@IdleHours)`);
      }
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

const payrollRound = (value: number) => Math.round(value * 10) / 10;

/** Rebuild period payroll attendance totals after overtime corrections on posted timesheets. */
export async function refreshTimesheetPayrollUpdatesForHeaders(headerIds: string[], actor: string) {
  const uniqueHeaderIds = Array.from(new Set(headerIds.filter(Boolean)));
  if (!uniqueHeaderIds.length) return { processed: 0 };

  const [{ headers, lines }, periods] = await Promise.all([readTimesheetData(), readTimesheetPeriods()]);
  let updates = await readTimesheetPayrollUpdates();
  const touchedHeaders: TimesheetHeader[] = [];
  const groupedByPeriod = new Map<string, string[]>();

  for (const headerId of uniqueHeaderIds) {
    const header = headers.find((item) => item.id === headerId);
    if (!header) throw new Error(`Timesheet ${headerId} was not found.`);
    const status = normalizeTimesheetStatus(header.status);
    if (!['HR_Acknowledged', 'Locked', 'Approved'].includes(status)) continue;
    const existingPeriodUpdate = updates.find((update) => update.periodId === header.periodId);
    const merged = Array.from(new Set([...(existingPeriodUpdate?.headerIds || []), headerId]));
    groupedByPeriod.set(header.periodId, merged);
  }

  for (const [periodId, mergedHeaderIds] of groupedByPeriod) {
    const sampleHeader = headers.find((item) => item.id === mergedHeaderIds[0]);
    if (!sampleHeader) continue;
    const existingPeriodUpdate = updates.find((update) => update.periodId === periodId);
    const allPeriodHeaderIds = headers
      .filter((item) => item.periodId === periodId && isTimesheetCountableForPayroll(item.status))
      .map((item) => item.id);
    const totals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
      headerIds: allPeriodHeaderIds,
      payrollReadyOnly: false,
    });

    const period =
      periods.find((item) => item.id === periodId) ||
      periods.find((item) => sampleHeader.timesheetDate >= item.startDate && sampleHeader.timesheetDate <= item.endDate);
    if (!period) throw new Error(`Timesheet period ${periodId} was not found.`);

    updates = [
      {
        id: existingPeriodUpdate?.id || `payroll-${periodId}-${Date.now()}`,
        periodId,
        periodName: period.name,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: actor,
        headerIds: Array.from(new Set([...(existingPeriodUpdate?.headerIds || []), ...mergedHeaderIds])),
        employeeAttendance: Array.from(totals.values()).map((item) => ({
          employeeId: item.employeeId,
          employeeName: item.employeeName,
          daysWorked: item.daysWorked,
          attendanceHours: item.attendanceHours,
          bookedHours: item.bookedHours,
          idleHours: item.idleHours,
        })).sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
      },
      ...updates.filter((update) => update.periodId !== periodId),
    ];
  }

  for (const headerId of uniqueHeaderIds) {
    const header = headers.find((item) => item.id === headerId);
    if (!header) continue;
    if (!['HR_Acknowledged', 'Locked', 'Approved'].includes(normalizeTimesheetStatus(header.status))) continue;
    touchedHeaders.push(header);
  }

  if (touchedHeaders.length) {
    await writeTimesheetPayrollUpdates(updates);
  }

  return { processed: touchedHeaders.length };
}

export async function readTimesheetWorkCenters(options?: { includeInactive?: boolean }): Promise<TimesheetWorkCenter[]> {
  try {
    const pool = await db();
    const includeInactive = Boolean(options?.includeInactive);
    const result = await pool.request().query(`
SELECT [Id],[Code],[Name],[Location],[Site],[Status],[SourceSystem],[CreatedAt],[UpdatedAt]
FROM [hris].[TimesheetWorkCenters]
${includeInactive ? '' : `WHERE [Status] = N'Active'`}
ORDER BY CASE WHEN [Status]=N'Active' THEN 0 ELSE 1 END, [Name]`);
    const workCenters = result.recordset.map((row) => ({
      id: row.Id,
      code: row.Code,
      name: row.Name,
      location: row.Location,
      site: row.Site,
      status: row.Status === 'Inactive' ? 'Inactive' as const : 'Active' as const,
      sourceSystem: row.SourceSystem,
      createdAt: toIso(row.CreatedAt),
      updatedAt: toIso(row.UpdatedAt),
    }));
    if (workCenters.length) return workCenters;
  } catch {
  }
  const now = new Date().toISOString();
  return officialTimesheetWorkCenters.map((name) => ({
    id: workCenterId(name),
    code: workCenterCode(name),
    name,
    location: name,
    site: name,
    status: 'Active' as const,
    sourceSystem: 'Local HRIS fallback',
    createdAt: now,
    updatedAt: now,
  }));
}

export async function readSystemTimesheetDepartments(): Promise<TimesheetDepartment[]> {
  const fallbackDepartments = async () => {
    const records = await readTimesheetRecords();
    return Array.from(new Set(records.map((record) => record.department).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: `fallback-dept-${workCenterCode(name).toLowerCase()}`, code: workCenterCode(name), name, sourceSystem: 'Local HRIS fallback' }));
  };
  let pool: sql.ConnectionPool;
  try {
    pool = await db();
  } catch {
    return fallbackDepartments();
  }
  const table = await pool.request().query(`SELECT OBJECT_ID(N'[hris].[OrganizationDepartments]', N'U') AS [TableId]`);
  if (!table.recordset[0]?.TableId) return fallbackDepartments();

  const result = await pool.request().query(`
SELECT [Id],[SourceCode],[Name],[SourceSystem],[LastSyncedAt]
FROM [hris].[OrganizationDepartments]
ORDER BY CASE WHEN [Name]=N'Unassigned Department' THEN 1 ELSE 0 END, [Name]`);

  const departments = result.recordset.map((row) => ({
    id: row.Id,
    code: row.SourceCode,
    name: row.Name,
    sourceSystem: row.SourceSystem || 'DLE Enterprise',
    updatedAt: toIso(row.LastSyncedAt),
  }));
  return departments.length ? departments : fallbackDepartments();
}

export async function readSystemTimesheetLocations(): Promise<TimesheetLocation[]> {
  const fallbackLocations = async () => {
    const records = await readTimesheetRecords();
    return Array.from(new Set(records.map((record) => record.location).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: `fallback-loc-${workCenterCode(name).toLowerCase()}`, code: workCenterCode(name), name, site: name, sourceSystem: 'Local HRIS fallback' }));
  };
  let pool: sql.ConnectionPool;
  try {
    pool = await db();
  } catch {
    return fallbackLocations();
  }
  await ensureDefaultTimesheetLocations(pool);
  const stored = await readStoredTimesheetLocations(pool);
  const payrollOrRegistryLocations = stored.filter((location) => location.sourceSystem !== 'DLE Enterprise');
  if (payrollOrRegistryLocations.length) return payrollOrRegistryLocations;

  try {
    const synced = await syncSageTimesheetDimensions();
    const syncedLocations = synced.locations.filter((location) => location.sourceSystem !== 'DLE Enterprise');
    if (syncedLocations.length) return syncedLocations;
  } catch (error) {
    console.warn('Sage timesheet location sync failed; falling back to stored/default locations:', error);
  }

  if (stored.length) return stored;

  const table = await pool.request().query(`SELECT OBJECT_ID(N'[hris].[OrganizationLocationsSites]', N'U') AS [TableId]`);
  if (!table.recordset[0]?.TableId) {
    return fallbackLocations();
  }

  const result = await pool.request().query(`
SELECT [Id],[SourceCode],[Name],[Location],[SourceSystem],[LastSyncedAt]
FROM [hris].[OrganizationLocationsSites]
WHERE [RecordType]=N'Site'
ORDER BY CASE WHEN [Name]=N'Unassigned Location' THEN 1 ELSE 0 END, [Name]`);

  const locations = result.recordset.map((row) => ({
    id: row.Id,
    code: row.SourceCode,
    name: row.Name,
    site: row.Location || row.Name,
    sourceSystem: row.SourceSystem || 'DLE Enterprise',
    updatedAt: toIso(row.LastSyncedAt),
  }));
  if (locations.length) return locations;
  return fallbackLocations();
}

async function ensureDefaultTimesheetLocations(pool: sql.ConnectionPool) {
  const count = await pool.request().query(`SELECT COUNT(*) AS [Count] FROM [hris].[TimesheetLocations]`);
  if (Number(count.recordset[0]?.Count || 0) > 0) return;
  for (const name of defaultProjectSites) {
    await pool.request()
      .input('Id', sql.NVarChar(100), locationId(name))
      .input('Code', sql.NVarChar(80), workCenterCode(name))
      .input('Name', sql.NVarChar(180), name)
      .input('Site', sql.NVarChar(180), name)
      .query(`
MERGE [hris].[TimesheetLocations] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[Site]=@Site,[SourceSystem]=N'DLE Enterprise',[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[Site],[SourceSystem]) VALUES (@Id,@Code,@Name,@Site,N'DLE Enterprise');`);
  }
}

async function readStoredTimesheetLocations(pool: sql.ConnectionPool): Promise<TimesheetLocation[]> {
  const result = await pool.request().query(`SELECT [Id],[Code],[Name],[Site],[SourceSystem],[UpdatedAt] FROM [hris].[TimesheetLocations] ORDER BY [Name]`);
  return result.recordset.map((row) => ({
    id: row.Id,
    code: row.Code,
    name: row.Name,
    site: row.Site || row.Name,
    sourceSystem: row.SourceSystem || 'DLE Enterprise',
    updatedAt: toIso(row.UpdatedAt),
  }));
}

export async function upsertTimesheetWorkCenter(input: Partial<TimesheetWorkCenter> & { name: string }): Promise<TimesheetWorkCenter> {
  const pool = await db();
  const name = input.name.trim();
  if (!name) throw new Error('Work center name is required.');
  const code = workCenterCode(input.code || name) || `WC-${Date.now()}`;
  const id = input.id || workCenterId(name);
  await pool.request()
    .input('Id', sql.NVarChar(100), id)
    .input('Code', sql.NVarChar(80), code)
    .input('Name', sql.NVarChar(180), name)
    .input('Location', sql.NVarChar(180), input.location ?? null)
    .input('Site', sql.NVarChar(180), input.site ?? input.location ?? null)
    .input('Status', sql.NVarChar(20), input.status || 'Active')
    .input('SourceSystem', sql.NVarChar(40), input.sourceSystem || 'HRIS')
    .query(`
MERGE [hris].[TimesheetWorkCenters] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[Location]=@Location,[Site]=@Site,[Status]=@Status,[SourceSystem]=@SourceSystem,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[Location],[Site],[Status],[SourceSystem]) VALUES (@Id,@Code,@Name,@Location,@Site,@Status,@SourceSystem);`);
  const [workCenter] = (await readTimesheetWorkCenters()).filter((item) => item.id === id);
  return workCenter || { id, code, name, location: input.location ?? null, site: input.site ?? input.location ?? null, status: 'Active', sourceSystem: input.sourceSystem || 'HRIS' };
}

export async function deactivateTimesheetWorkCenter(id: string) {
  const pool = await db();
  await pool.request()
    .input('Id', sql.NVarChar(100), id)
    .query(`UPDATE [hris].[TimesheetWorkCenters] SET [Status]=N'Inactive',[UpdatedAt]=SYSUTCDATETIME() WHERE [Id]=@Id`);
}

export async function syncSageTimesheetDimensions(): Promise<{ departments: TimesheetDepartment[]; locations: TimesheetLocation[]; workCenters: TimesheetWorkCenter[] }> {
  const pool = await db();
  const activePayroll = await readActiveSagePayrollEmployeeKeys();
  const departments = new Map<string, TimesheetDepartment>();
  const locations = new Map<string, TimesheetLocation>();

  for (const employee of activePayroll.employees) {
    const departmentName = employee.hierarchyDepartmentName || employee.departmentName;
    const departmentCode = employee.hierarchyDepartmentCode || employee.departmentCode || departmentName;
    if (departmentName && departmentCode) {
      const code = String(departmentCode).trim();
      departments.set(code.toLowerCase(), { id: `sage-dept-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, code, name: departmentName.trim(), sourceSystem: 'Sage Payroll' });
    }

    const locationName = employee.hierarchyLocationName || employee.siteName;
    const locationCode = employee.hierarchyLocationCode || employee.siteCode || locationName;
    if (locationName && locationCode) {
      const code = String(locationCode).trim();
      locations.set(code.toLowerCase(), { id: `sage-loc-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, code, name: locationName.trim(), site: employee.siteName || locationName.trim(), sourceSystem: 'Sage Payroll' });
    }
  }

  for (const department of departments.values()) {
    await pool.request()
      .input('Id', sql.NVarChar(100), department.id)
      .input('Code', sql.NVarChar(80), department.code)
      .input('Name', sql.NVarChar(180), department.name)
      .query(`
MERGE [hris].[TimesheetDepartments] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[SourceSystem]) VALUES (@Id,@Code,@Name,N'Sage Payroll');`);
  }

  for (const location of locations.values()) {
    await pool.request()
      .input('Id', sql.NVarChar(100), location.id)
      .input('Code', sql.NVarChar(80), location.code)
      .input('Name', sql.NVarChar(180), location.name)
      .input('Site', sql.NVarChar(180), location.site)
      .query(`
MERGE [hris].[TimesheetLocations] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[Site]=@Site,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[Site],[SourceSystem]) VALUES (@Id,@Code,@Name,@Site,N'Sage Payroll');`);
  }

  const [departmentRows, locationRows, workCenters] = await Promise.all([
    pool.request().query(`SELECT [Id],[Code],[Name],[SourceSystem],[UpdatedAt] FROM [hris].[TimesheetDepartments] ORDER BY [Name]`),
    pool.request().query(`SELECT [Id],[Code],[Name],[Site],[SourceSystem],[UpdatedAt] FROM [hris].[TimesheetLocations] ORDER BY [Name]`),
    readTimesheetWorkCenters(),
  ]);

  return {
    departments: departmentRows.recordset.map((row) => ({ id: row.Id, code: row.Code, name: row.Name, sourceSystem: row.SourceSystem, updatedAt: toIso(row.UpdatedAt) })),
    locations: locationRows.recordset.map((row) => ({ id: row.Id, code: row.Code, name: row.Name, site: row.Site, sourceSystem: row.SourceSystem, updatedAt: toIso(row.UpdatedAt) })),
    workCenters,
  };
}

const workflowEvent = (
  stage: TimesheetWorkflowStage,
  decision: TimesheetWorkflowDecision,
  actor: string,
  comment?: string | null,
): TimesheetWorkflowEvent => ({
  stage,
  decision,
  by: actor,
  actedAt: new Date().toISOString(),
  comment: comment?.trim() || null,
});

export const normalizeTimesheetStatus = (status: TimesheetStatus | string): TimesheetStatus => {
  const raw = String(status || '').trim();
  if (!raw) return 'Draft';
  const underscored = raw.replace(/[\s-]+/g, '_');
  const aliases: Record<string, TimesheetStatus> = {
    draft: 'Draft',
    submitted: 'Submitted',
    supervisor_reviewed: 'Supervisor_Reviewed',
    project_manager_reviewed: 'Project_Manager_Reviewed',
    cost_control_reviewed: 'Cost_Control_Reviewed',
    gm_operations_reviewed: 'GM_Operations_Reviewed',
    gm_reviewed: 'GM_Operations_Reviewed',
    operations_reviewed: 'GM_Operations_Reviewed',
    hr_reviewed: 'GM_Operations_Reviewed',
    project_control_reviewed: 'Cost_Control_Reviewed',
    hr_acknowledged: 'HR_Acknowledged',
    approved: 'HR_Acknowledged',
    locked: 'Locked',
    rejected: 'Rejected',
    returned: 'Returned',
  };
  const alias = aliases[underscored.toLowerCase()];
  if (alias) return alias;
  if (status === 'HR_Reviewed') return 'GM_Operations_Reviewed';
  if (status === 'Project_Control_Reviewed') return 'Cost_Control_Reviewed';
  if (status === 'Approved') return 'HR_Acknowledged';
  return underscored as TimesheetStatus;
};

export const isTimesheetEditableStatus = (status: TimesheetStatus) =>
  ['Draft', 'Returned', 'Rejected'].includes(normalizeTimesheetStatus(status));

export const isTimesheetPayrollReadyStatus = (status: TimesheetStatus) =>
  ['HR_Acknowledged', 'Locked'].includes(normalizeTimesheetStatus(status));

/** Rebuild the payroll attendance snapshot for a full timesheet period from live lines. */
export const rebuildPayrollSnapshotForPeriod = async (periodId: string, actor: string) => {
  invalidateTimesheetHoursCacheForPeriod(periodId);
  return createPayrollUpdateForPeriod(periodId, actor);
};

const createPayrollUpdateForPeriod = async (periodId: string, actor: string): Promise<TimesheetPayrollUpdate> => {
  const { headers, lines } = await readTimesheetData();
  const period = await readTimesheetPeriod(new Date(`${periodId.replace('per-', '')}-15T00:00:00`));
  const periodHeaders = headers.filter((header) => header.periodId === periodId && isTimesheetCountableForPayroll(header.status));
  const totals = aggregateEmployeeAttendanceForHeaders(headers, lines, {
    headerIds: periodHeaders.map((header) => header.id),
    payrollReadyOnly: false,
  });

  const update: TimesheetPayrollUpdate = {
    id: `payroll-${periodId}-${Date.now()}`,
    periodId,
    periodName: period.name,
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: actor,
    headerIds: periodHeaders.map((header) => header.id),
    employeeAttendance: Array.from(totals.values()).map((item) => ({
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      daysWorked: item.daysWorked,
      attendanceHours: item.attendanceHours,
      bookedHours: item.bookedHours,
      idleHours: item.idleHours,
    })).sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
  };
  const updates = await readTimesheetPayrollUpdates();
  await writeTimesheetPayrollUpdates([update, ...updates.filter((item) => item.periodId !== periodId)]);
  return update;
};

const workflowStageForHeaderStatus = (status: TimesheetStatus): TimesheetWorkflowStage => {
  if (status === 'Submitted') return 'Supervisor';
  if (status === 'Supervisor_Reviewed') return 'Project Manager';
  if (status === 'Project_Manager_Reviewed') return 'Cost Control';
  if (status === 'Cost_Control_Reviewed') return 'GM Operations';
  if (status === 'GM_Operations_Reviewed') return 'HR';
  return 'HR';
};

export async function advanceTimesheetWorkflow(
  headerId: string,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  actor: string,
  comment?: string | null,
): Promise<{ header: TimesheetHeader; payrollUpdate: TimesheetPayrollUpdate | null }> {
  const { headers, lines } = await readTimesheetData();
  const header = headers.find((item) => item.id === headerId);
  if (!header) throw new Error('Timesheet header not found.');

  const status = normalizeTimesheetStatus(header.status);
  const now = new Date().toISOString();
  let event: TimesheetWorkflowEvent;
  const inProgress = ['Submitted', 'Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed'];

  if (action === 'REJECT') {
    if (!inProgress.includes(status)) throw new Error('Only in-progress timesheets can be rejected.');
    // Header-level reject is reserved for Supervisor / GM / HR consolidation stages.
    if (!['Submitted', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed'].includes(status)) {
      throw new Error('Project-stage reject must target a project segment, not the whole timesheet.');
    }
    header.status = 'Rejected';
    event = workflowEvent(workflowStageForHeaderStatus(status), 'Rejected', actor, comment);
  } else if (action === 'RETURN') {
    if (!inProgress.includes(status)) throw new Error('Only in-progress timesheets can be returned.');
    if (!['Submitted', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed'].includes(status)) {
      throw new Error('Project-stage return must target a project segment, not the whole timesheet.');
    }
    header.status = 'Returned';
    event = workflowEvent(workflowStageForHeaderStatus(status), 'Returned', actor, comment);
  } else if (status === 'Submitted') {
    header.status = 'Supervisor_Reviewed';
    header.currentApprovalStage = 'Project Manager';
    header.currentApprover = 'Project Manager';
    event = workflowEvent('Supervisor', 'Approved', actor, comment || 'Supervisor reviewed and released timesheet for project manager validation.');
  } else if (status === 'Cost_Control_Reviewed') {
    header.status = 'GM_Operations_Reviewed';
    header.currentApprovalStage = 'HR';
    header.currentApprover = 'HR';
    event = workflowEvent('GM Operations', 'Approved', actor, comment || 'GM Operations approved consolidated timesheet (16th–15th, all projects).');
  } else if (status === 'GM_Operations_Reviewed') {
    header.status = 'HR_Acknowledged';
    header.approvedAt = now;
    header.approvedBy = actor;
    header.payrollAcknowledgedAt = now;
    header.payrollAcknowledgedBy = actor;
    header.currentApprovalStage = null;
    header.currentApprover = null;
    event = workflowEvent('HR', 'Acknowledged', actor, comment || 'HR approved consolidated timesheet for payroll processing.');
  } else {
    throw new Error('This timesheet is not waiting for header-level approval. Use project approval for PM/Cost Control stages.');
  }

  header.workflowHistory = [...(header.workflowHistory || []), event];
  await writeTimesheetHeaderLines(header, lines.filter((line) => line.headerId === header.id));
  const payrollUpdate = header.status === 'HR_Acknowledged' ? await createPayrollUpdateForPeriod(header.periodId, actor) : null;
  if (header.status === 'HR_Acknowledged') {
    const period = String(header.periodId || '').replace(/^per-/, '');
    void import('@/lib/payroll-timesheet-ot-posting')
      .then((module) => module.postPermanentTimesheetEarningsFromTimesheets(period))
      .catch((error) => console.warn('[Timesheet] Permanent OT/night allowance posting skipped:', error instanceof Error ? error.message : error));
  }

  void import('@/lib/timesheet-workflow-notifications')
    .then(({ notifyTimesheetStageChange }) => {
      if (action === 'REJECT' || action === 'RETURN') {
        return notifyTimesheetStageChange({ header, action, actor, comment });
      }
      const nextStage = status === 'Submitted'
        ? 'Project Manager'
        : status === 'Cost_Control_Reviewed'
          ? 'HR'
          : status === 'GM_Operations_Reviewed'
            ? 'Payroll'
            : null;
      return notifyTimesheetStageChange({ header, action: 'APPROVE', nextStage, actor, comment });
    })
    .catch((error) => console.warn('[Timesheet] Stage notification skipped:', error instanceof Error ? error.message : error));

  return { header, payrollUpdate };
}

const projectApprovalMarker = (stage: 'Project Manager' | 'Cost Control', projectCode: string) => `[${stage === 'Project Manager' ? 'PROJECT' : 'COST'}:${projectCode}]`;
const markerRegex = /\[(PROJECT|COST):([^\]]+)\]/;

const latestProjectDecision = (
  history: TimesheetWorkflowEvent[],
  stage: 'Project Manager' | 'Cost Control',
  projectCode: string,
): TimesheetWorkflowDecision | null => {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index];
    if (event.stage !== stage) continue;
    if (!['Approved', 'Rejected', 'Returned'].includes(event.decision)) continue;
    const match = String(event.comment || '').match(markerRegex);
    if (match && match[2].toLowerCase() === projectCode.toLowerCase()) return event.decision;
  }
  return null;
};

export type ProjectTimesheetApproval = {
  headerId: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  employeeCount: number;
  totalHours: number;
  billableHours: number;
  costControlStatus: 'Pending' | 'Approved' | 'Rejected' | 'Returned';
  projectManagerStatus: 'Pending' | 'Approved' | 'Rejected' | 'Returned';
  visibilityScope: string;
  lineIds: string[];
};

export function buildProjectTimesheetApprovals(header: TimesheetHeader, lines: TimesheetLine[], projects: Project[], actor?: string | null): ProjectTimesheetApproval[] {
  const byProject = new Map<string, ProjectTimesheetApproval>();
  for (const line of lines) {
    for (const allocation of normalizeProjectAllocations(line.projectAllocations || [])) {
      if (!allocation.projectCode || Number(allocation.hours || 0) <= 0) continue;
      const project = projects.find((item) => item.code.toLowerCase() === allocation.projectCode.toLowerCase());
      const existing = byProject.get(allocation.projectCode) || {
        headerId: header.id,
        projectCode: allocation.projectCode,
        projectName: allocation.projectName || project?.name || allocation.projectCode,
        projectManager: project?.projectManager || 'Unassigned',
        employeeCount: 0,
        totalHours: 0,
        billableHours: 0,
        costControlStatus: 'Pending' as const,
        projectManagerStatus: 'Pending' as const,
        visibilityScope: project?.projectManager || 'Cost Control / HR',
        lineIds: [],
      };
      existing.totalHours = Math.round((existing.totalHours + Number(allocation.hours || 0)) * 10) / 10;
      existing.billableHours = existing.totalHours;
      if (!existing.lineIds.includes(line.id)) {
        existing.employeeCount += 1;
        existing.lineIds.push(line.id);
      }
      byProject.set(allocation.projectCode, existing);
    }
  }

  const history = header.workflowHistory || [];
  const normalizedHeaderStatus = normalizeTimesheetStatus(header.status);
  for (const item of byProject.values()) {
    const pmDecision = latestProjectDecision(history, 'Project Manager', item.projectCode);
    const ccDecision = latestProjectDecision(history, 'Cost Control', item.projectCode);
    const headerPmComplete = ['Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed', 'HR_Acknowledged', 'Locked'].includes(normalizedHeaderStatus);
    const headerCostComplete = ['Cost_Control_Reviewed', 'GM_Operations_Reviewed', 'HR_Acknowledged', 'Locked'].includes(normalizedHeaderStatus);
    item.projectManagerStatus = pmDecision === 'Rejected'
      ? 'Rejected'
      : pmDecision === 'Returned'
        ? 'Returned'
        : pmDecision === 'Approved' || headerPmComplete
          ? 'Approved'
          : 'Pending';
    item.costControlStatus = ccDecision === 'Rejected'
      ? 'Rejected'
      : ccDecision === 'Returned'
        ? 'Returned'
        : ccDecision === 'Approved' || headerCostComplete
          ? 'Approved'
          : 'Pending';
  }

  const actorText = String(actor || '').trim().toLowerCase();
  const rows = Array.from(byProject.values()).sort((a, b) => a.projectCode.localeCompare(b.projectCode));
  if (!actorText) return rows;
  return rows.filter((row) => {
    const manager = row.projectManager.toLowerCase();
    return manager === 'unassigned' || manager.includes(actorText) || actorText.includes(manager) || ['cost control', 'hr', 'payroll', 'gm', 'operations', 'system', 'administrator'].some((term) => actorText.includes(term));
  });
}

export async function advanceProjectTimesheetApproval(
  headerId: string,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  actor: string,
  options: { projectCode: string; stage: 'Project Manager' | 'Cost Control'; comment?: string | null; bypassAssigneeCheck?: boolean },
): Promise<{ header: TimesheetHeader; projectApprovals: ProjectTimesheetApproval[] }> {
  const { headers, lines } = await readTimesheetData();
  const projects = await readProjects();
  const header = headers.find((item) => item.id === headerId);
  if (!header) throw new Error('Timesheet header not found.');
  const status = normalizeTimesheetStatus(header.status);
  if (!['Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(status)) {
    throw new Error('Supervisor review must be completed before project approvals.');
  }
  // New order: PM first (after Supervisor), then Cost Control.
  if (options.stage === 'Project Manager' && !['Supervisor_Reviewed', 'Project_Manager_Reviewed'].includes(status)) {
    throw new Error('Project Manager approval is only available after supervisor review.');
  }
  if (options.stage === 'Cost Control' && !['Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(status)) {
    throw new Error('Cost Control approval is only available after Project Manager review.');
  }
  const headerLines = lines.filter((line) => line.headerId === header.id);
  const projectApprovals = buildProjectTimesheetApprovals(header, headerLines, projects);
  const target = projectApprovals.find((item) => item.projectCode.toLowerCase() === options.projectCode.toLowerCase());
  if (!target) throw new Error(`Project ${options.projectCode} was not found on this timesheet.`);
  if (!options.bypassAssigneeCheck && options.stage === 'Project Manager' && target.projectManager && target.projectManager !== 'Unassigned' && !target.projectManager.toLowerCase().includes(actor.toLowerCase())) {
    throw new Error(`Only ${target.projectManager} can approve project ${target.projectCode}.`);
  }

  const decision: TimesheetWorkflowDecision = action === 'APPROVE' ? 'Approved' : action === 'REJECT' ? 'Rejected' : 'Returned';
  const comment = `${projectApprovalMarker(options.stage, target.projectCode)} ${options.comment || `${options.stage} ${decision.toLowerCase()} ${target.projectCode}.`}`;
  const event: TimesheetWorkflowEvent = { stage: options.stage, decision, by: actor, actedAt: new Date().toISOString(), comment };
  header.workflowHistory = [...(header.workflowHistory || []), event];

  // Per-project reject/return: do not kill the whole sheet — other projects keep progressing.
  let notifiedNextStage: TimesheetWorkflowStage | null = null;
  if (action === 'APPROVE') {
    const refreshed = buildProjectTimesheetApprovals(header, headerLines, projects);
    const allPmApproved = refreshed.length > 0 && refreshed.every((item) => item.projectManagerStatus === 'Approved');
    const allCostApproved = refreshed.length > 0 && refreshed.every((item) => item.costControlStatus === 'Approved');
    if (allPmApproved && status === 'Supervisor_Reviewed') {
      header.status = 'Project_Manager_Reviewed';
      header.currentApprovalStage = 'Cost Control';
      header.currentApprover = 'Cost Control';
      notifiedNextStage = 'Cost Control';
    }
    if (allCostApproved && allPmApproved && ['Supervisor_Reviewed', 'Project_Manager_Reviewed'].includes(normalizeTimesheetStatus(header.status))) {
      header.status = 'Cost_Control_Reviewed';
      header.currentApprovalStage = 'GM Operations';
      header.currentApprover = 'GM Operations';
      notifiedNextStage = 'GM Operations';
      header.workflowHistory = [
        ...(header.workflowHistory || []),
        {
          stage: 'GM Operations',
          decision: 'Submitted',
          by: 'System',
          actedAt: new Date().toISOString(),
          comment: 'All project approvals complete. Consolidated 16th–15th timesheet (all projects) is ready for GM Operations review.',
        },
      ];
    }
  }

  await writeTimesheetHeaderLines(header, headerLines);
  const refreshedApprovals = buildProjectTimesheetApprovals(header, headerLines, projects);

  void import('@/lib/timesheet-workflow-notifications')
    .then(({ notifyTimesheetStageChange }) => {
      if (action === 'REJECT' || action === 'RETURN') {
        return notifyTimesheetStageChange({
          header,
          action,
          actor,
          comment: options.comment,
          projectCode: options.projectCode,
        });
      }
      return notifyTimesheetStageChange({
        header,
        action: 'APPROVE',
        nextStage: notifiedNextStage,
        actor,
        comment: options.comment,
        projectCode: options.projectCode,
      });
    })
    .catch((error) => console.warn('[Timesheet] Project stage notification skipped:', error instanceof Error ? error.message : error));

  return { header, projectApprovals: refreshedApprovals };
}

const normalizeAttendanceScope = (value: string | null | undefined) =>
  String(value || '').trim().toLowerCase();
const TIMESHEET_SAGE_ENRICH_TIMEOUT_MS = Number(process.env.TIMESHEET_SAGE_ENRICH_TIMEOUT_MS || 8000);
const TIMESHEET_SUPERVISOR_SCOPE_TIMEOUT_MS = Number(process.env.TIMESHEET_SUPERVISOR_SCOPE_TIMEOUT_MS || 8000);
const TIMESHEET_LIVE_ATTENDANCE_TIMEOUT_MS = Number(process.env.TIMESHEET_LIVE_ATTENDANCE_TIMEOUT_MS || 15000);

const withSyncTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  // Swallow late rejections from the underlying work after timeout so they do not become unhandledRejection.
  const source = Promise.resolve(promise).catch((error) => {
    if (timedOut) return undefined as unknown as T;
    throw error;
  });
  try {
    return await Promise.race([
      source,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(message));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const cleanSupervisorLabel = (value: string) =>
  value.replace(/\s+\(\d+\)\s*$/, '').trim();

const supervisorScopeKeys = (value: string | null | undefined) => {
  const raw = String(value || '').trim().toUpperCase();
  const keys = new Set<string>();
  const add = (input: string) => {
    const compact = input.replace(/[^A-Z0-9]/g, '');
    if (!compact) return;
    keys.add(compact);
    const withoutPrefix = compact.replace(/^[PCLNI]+(?=\d)/, '').replace(/^0+/, '');
    if (withoutPrefix) keys.add(withoutPrefix);
    const numeric = compact.replace(/^[A-Z]+/, '').replace(/^0+/, '');
    if (numeric) keys.add(numeric);
  };
  add(raw);
  if (raw.includes(' - ')) add(raw.split(' - ')[0] || '');
  return keys;
};

const supervisorNameTokens = (value: string | null | undefined) =>
  String(value || '')
    .replace(/\s+\(\d+\)\s*$/, '')
    .replace(/^[^-]+-\s*/, '')
    .replace(/\b(mr|mrs|miss|ms|dr|prof)\b\.?/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1);

const supervisorMatchesEmployee = (managerName: string | null | undefined, supervisorId: string) => {
  const manager = normalizeAttendanceScope(managerName);
  const selected = normalizeAttendanceScope(cleanSupervisorLabel(supervisorId));
  if (!manager || !selected) return false;
  const selectedCode = selected.split(' - ')[0]?.trim();
  const selectedName = selected.includes(' - ') ? selected.split(' - ').slice(1).join(' - ').trim() : selected;
  const managerKeys = supervisorScopeKeys(managerName);
  const selectedKeys = supervisorScopeKeys(selectedCode || selected);
  const hasSharedCode = [...selectedKeys].some((key) => managerKeys.has(key));
  const managerTokens = supervisorNameTokens(managerName);
  const selectedTokens = supervisorNameTokens(supervisorId);
  const hasNameAlias = managerTokens.length > 0 && managerTokens.every((token) => selectedTokens.includes(token));
  return manager === selected || manager === selectedName || manager.includes(selected) || hasSharedCode || hasNameAlias;
};

const attendanceMatchKeys = (...values: Array<string | number | null | undefined>) => {
  const keys = new Set<string>();
  for (const value of values) {
    const normalized = normalizePayrollMatchKey(value);
    if (!normalized) continue;
    keys.add(normalized);
    const withoutTypePrefix = normalized.replace(/^[PCLNI]+(?=\d)/, '').replace(/^0+/, '');
    if (withoutTypePrefix) keys.add(withoutTypePrefix);
    const numeric = normalized.replace(/^[A-Z]+/, '').replace(/^0+/, '');
    if (numeric) keys.add(numeric);
  }
  return [...keys];
};

const supervisorEmployeeScope = async (supervisorId: string) => {
  const selected = cleanSupervisorLabel(supervisorId);
  if (!selected) return { keys: new Set<string>(), employees: [] as Array<{ employeeCode: string; fullName: string }> };
  // Timeout is applied by the caller (syncAttendanceForTimesheet) — do not nest another race here.
  const source = await readPayrollEmployees();
  const keys = new Set<string>();
  const employees: Array<{ employeeCode: string; fullName: string }> = [];
  const selectedCode = selected.split(' - ')[0]?.trim();
  try {
    const assignments = selectedCode ? await readSupervisorAssignments({ supervisorEmployeeCode: selectedCode }) : [];
    const matchedAssignments = assignments.filter((assignment) => assignment.employeeCode && assignment.matchedStatus !== 'Unresolved');
    if (matchedAssignments.length) {
      for (const assignment of matchedAssignments) {
        const employeeCode = assignment.employeeCode || '';
        const fullName = assignment.employeeName || employeeCode;
        employees.push({ employeeCode, fullName });
        attendanceMatchKeys(employeeCode, fullName).forEach((key) => keys.add(key));
      }
      return { keys, employees };
    }
  } catch (error) {
    console.warn('Timesheet supervisor assignment scope could not be loaded; falling back to reporting manager data:', error);
  }
  for (const employee of source.employees) {
    if (['Resigned', 'Terminated', 'Retired'].includes(employee.status)) continue;
    if (!supervisorMatchesEmployee(employee.managerName, selected)) continue;
    employees.push({ employeeCode: employee.employeeCode, fullName: employee.fullName });
    [
      employee.employeeId,
      employee.employeeCode,
      employee.fullName,
      employee.sourceEmployeeId,
    ].flatMap((value) => attendanceMatchKeys(value)).forEach((key) => keys.add(key));
  }
  return { keys, employees };
};

export async function syncAttendanceForTimesheet(
  date: string,
  supervisorId: string,
  workCenterName: string,
  locationName?: string,
  options: { persist?: boolean } = {},
) {
  const persist = options.persist !== false;
  const liveAttendancePromise = withSyncTimeout(
    readLiveClockingActivity(date),
    TIMESHEET_LIVE_ATTENDANCE_TIMEOUT_MS,
    'Live biometric attendance timed out.',
  );
  const approvedLeavePromise = approvedPaidLeaveForDate(date);
  const scopePromise = withSyncTimeout(
    supervisorEmployeeScope(supervisorId),
    TIMESHEET_SUPERVISOR_SCOPE_TIMEOUT_MS,
    'Supervisor employee scope timed out.',
  );
  const activePayrollPromise = withSyncTimeout(
    readActiveSagePayrollEmployeeKeys(),
    TIMESHEET_SAGE_ENRICH_TIMEOUT_MS,
    'Sage payroll enrichment timed out.',
  );

  const activeEmployeeByKey = new Map<string, SagePayrollEmployee>();
  let allowedSupervisorKeys = new Set<string>();
  let assignedSupervisorEmployees: Array<{ employeeCode: string; fullName: string }> = [];
  let supervisorScopeResolved = false;

  const [liveResult, scopeResult, activePayrollResult, approvedLeaveResult] = await Promise.allSettled([
    liveAttendancePromise,
    scopePromise,
    activePayrollPromise,
    approvedLeavePromise,
  ]);

  const clockingRecords = liveResult.status === 'fulfilled' ? liveResult.value.records : [];
  if (liveResult.status === 'rejected') {
    console.warn('Timesheet attendance sync proceeding without live biometric attendance:', liveResult.reason);
  }

  if (scopeResult.status === 'fulfilled') {
    supervisorScopeResolved = true;
    allowedSupervisorKeys = scopeResult.value.keys;
    assignedSupervisorEmployees = scopeResult.value.employees;
  } else {
    console.warn('Timesheet attendance sync could not resolve supervisor employee scope:', scopeResult.reason);
  }

  if (activePayrollResult.status === 'fulfilled') {
    const activePayroll = activePayrollResult.value;
    for (const employee of activePayroll.employees) {
      attendanceMatchKeys(
        employee.employeeId,
        employee.employeeCode,
        employee.directoryEmployeeCode,
        employee.entityCode,
        employee.displayName,
      ).forEach((key) => {
        if (key && !activeEmployeeByKey.has(key)) activeEmployeeByKey.set(key, employee);
      });
    }
  } else {
    console.warn('Timesheet attendance sync proceeding without Sage payroll enrichment:', activePayrollResult.reason);
  }
  const approvedLeaveByKey = new Map<string, Awaited<ReturnType<typeof approvedPaidLeaveForDate>>[number]>();
  if (approvedLeaveResult.status === 'fulfilled') {
    for (const leave of approvedLeaveResult.value) {
      attendanceMatchKeys(leave.employeeId, leave.employeeCode, leave.fullName).forEach((key) => {
        if (key && !approvedLeaveByKey.has(key)) approvedLeaveByKey.set(key, leave);
      });
    }
  } else {
    console.warn('Timesheet attendance sync could not resolve approved leave:', approvedLeaveResult.reason);
  }
  
  // Business Rule: A timesheet is created for a Work Center / Site.
  // First find employees who clocked in at the selected device/site.
  // Then enforce the selected supervisor's assigned employee list.
  const workCenterKey = normalizeAttendanceScope(workCenterName);
  const locationKey = normalizeAttendanceScope(locationName);
  const exactWorkCenterRecords = clockingRecords.filter((r) => {
    const site = normalizeAttendanceScope(r.site);
    const location = normalizeAttendanceScope(r.location);
    return (
      (workCenterKey && (site === workCenterKey || location === workCenterKey)) ||
      (locationKey && (site === locationKey || location === locationKey))
    );
  });
  const recordsInScope = exactWorkCenterRecords.length > 0 ? exactWorkCenterRecords : clockingRecords;
  const attendanceCandidates = recordsInScope
    .map((attendance) => {
      const payrollEmployee = [
        attendance.employeeId,
        attendance.employeeName,
      ]
        .flatMap((value) => attendanceMatchKeys(value))
        .map((key) => activeEmployeeByKey.get(key))
        .find(Boolean);

      return { attendance, payrollEmployee };
    })
    .filter(({ attendance, payrollEmployee }) => {
      if (!supervisorScopeResolved) return false;
      if (allowedSupervisorKeys.size === 0) return false;
      return attendanceMatchKeys(
        attendance.employeeId,
        attendance.employeeName,
        payrollEmployee?.employeeCode,
        payrollEmployee?.directoryEmployeeCode,
        payrollEmployee?.entityCode,
        payrollEmployee?.displayName,
      ).some((key) => allowedSupervisorKeys.has(key));
    });
  const attendanceCandidateKeys = (candidate: (typeof attendanceCandidates)[number]) => [
    candidate.attendance.employeeId,
    candidate.attendance.employeeName,
    candidate.payrollEmployee?.employeeCode,
    candidate.payrollEmployee?.directoryEmployeeCode,
    candidate.payrollEmployee?.entityCode,
    candidate.payrollEmployee?.displayName,
  ].flatMap((value) => attendanceMatchKeys(value));
  const attendanceForDay = assignedSupervisorEmployees.length
    ? assignedSupervisorEmployees.map((employee) => {
        const employeeKeys = attendanceMatchKeys(employee.employeeCode, employee.fullName);
        const matched = attendanceCandidates.find((candidate) => attendanceCandidateKeys(candidate).some((key) => employeeKeys.includes(key)));
        return matched || {
          attendance: {
            id: `no-att-${date}-${employee.employeeCode}`,
            employeeId: employee.employeeCode,
            employeeName: employee.fullName,
            businessUnit: '',
            department: '',
            jobTitle: '',
            location: locationName || '',
            site: workCenterName,
            shift: 'Day',
            status: 'Absent',
            checkInTime: null,
            checkOutTime: null,
            scheduledStart: '08:00',
            scheduledEnd: '17:00',
            minutesLate: 0,
            overtimeHours: 0,
            biometricSource: 'Supervisor Override',
            supervisor: supervisorId,
            punchCount: 0,
          },
          payrollEmployee: undefined,
        };
      })
    : supervisorScopeResolved ? [] : attendanceCandidates;

  const { headers, lines } = await readTimesheetData();
  const period = calculateTimesheetPeriod(new Date(date));

  const workCenterId = workCenterName.toLowerCase().replace(/\s+/g, '-');
  let header = headers.find((h) => h.timesheetDate === date && h.supervisorId === supervisorId && h.workCenterName === workCenterName);
  if (!header) {
    header = {
      id: `hdr-${date}-${supervisorId.toLowerCase().replace(/\s+/g, '-')}-${workCenterId}`,
      periodId: period.id,
      timesheetDate: date,
      supervisorId,
      supervisorName: supervisorId,
      workCenterId,
      workCenterName,
      status: 'Draft',
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      lastSyncAt: new Date().toISOString(),
    };
    if (persist) headers.push(header);
  } else {
    header.lastSyncAt = new Date().toISOString();
  }

  // Filter out lines for this header and rebuild
  const otherLines = lines.filter((l) => l.headerId !== header!.id);
  const newLines: TimesheetLine[] = attendanceForDay.map(({ attendance: att, payrollEmployee }) => {
    const employeeCode = payrollEmployee ? sageTimesheetEmployeeCode(payrollEmployee, att.employeeId) : att.employeeId.trim().toUpperCase();
    const employeeName = payrollEmployee ? formatSageEmployeeFullName(payrollEmployee, att.employeeName) : att.employeeName;
    const existingLine = lines.find((l) => l.headerId === header!.id && l.employeeId === employeeCode);
    const approvedLeave = attendanceMatchKeys(employeeCode, employeeName, att.employeeId, att.employeeName)
      .map((key) => approvedLeaveByKey.get(key))
      .find(Boolean);
    
    // Attendance duration in hours (overnight-safe for night shift 18:00→02:00+). Always >= 0.
    const fromClock = attendanceDurationFromClock(att.checkInTime, att.checkOutTime);
    const duration = fromClock !== null && fromClock > 0
      ? Math.round(Math.max(0, fromClock) * 10) / 10
      : att.checkInTime
        ? STANDARD_TIMESHEET_HOURS
        : 0;
    const shouldAutoBookPaidLeave = Boolean(approvedLeave && !att.checkInTime && !existingLine?.totalHours);
    const leaveAllocation = shouldAutoBookPaidLeave ? [{
      projectId: 'LEAVE',
      projectCode: 'LEAVE',
      projectName: 'Leave and Authorized Absence',
      hours: STANDARD_TIMESHEET_HOURS,
      remarks: `Approved paid leave ${approvedLeave!.requestId}`,
    }] : null;
    const bookedTotal = shouldAutoBookPaidLeave ? STANDARD_TIMESHEET_HOURS : existingLine?.totalHours || 0;

    return {
      id: existingLine?.id || `line-${header!.id}-${employeeCode}`,
      headerId: header!.id,
      employeeId: employeeCode,
      employeeNo: employeeCode,
      employeeName,
      biometricId: att.id,
      attendanceId: att.id,
      clockIn: att.checkInTime,
      clockOut: att.checkOutTime,
      attendanceDuration: duration,
      projectAllocations: leaveAllocation || existingLine?.projectAllocations || [],
      idleAllocations: (existingLine?.idleAllocations || []).map(withDefaultIdleReason),
      usedHours: shouldAutoBookPaidLeave ? STANDARD_TIMESHEET_HOURS : existingLine?.usedHours || 0,
      idleHours: existingLine?.idleHours || 0,
      totalHours: bookedTotal,
      // Variance vs standard day (positive = over, not attendance-minus-booked which went negative for night).
      variance: Math.round((bookedTotal - STANDARD_TIMESHEET_HOURS) * 10) / 10,
      remarks: shouldAutoBookPaidLeave ? `Approved paid leave: ${approvedLeave!.startDate} to ${approvedLeave!.endDate}` : existingLine?.remarks || null,
      validationStatus: shouldAutoBookPaidLeave ? 'Valid' : 'Incomplete',
      validationMessage: shouldAutoBookPaidLeave ? 'Approved paid leave. Biometric attendance is not required for this payable leave day.' : 'Awaiting time allocation.',
    };
  });

  if (persist) {
    await writeTimesheetHeaderLines(header, newLines);
  }
  return { header, lines: newLines };
}

export const buildDefaultTimesheetRecords = () => buildDefaultRecords();
