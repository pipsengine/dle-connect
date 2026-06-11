import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { buildBaseAttendanceRecords } from '@/lib/attendance-data';
import { readLiveClockingActivity } from '@/lib/biometric-live-attendance-store';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { normalizePayrollMatchKey, readActiveSagePayrollEmployeeKeys, type SagePayrollEmployee } from '@/lib/sage-people-payroll-store';

export type TimesheetStatus =
  | 'Draft'
  | 'Submitted'
  | 'Project_Manager_Reviewed'
  | 'Cost_Control_Reviewed'
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
  { id: 'Submitted', label: 'Supervisor', order: 2 },
  { id: 'Project_Manager_Reviewed', label: 'Project Manager Review', order: 3 },
  { id: 'Cost_Control_Reviewed', label: 'Cost Control Review', order: 4 },
  { id: 'HR_Acknowledged', label: 'HR Payroll Acknowledgement', order: 5 },
  { id: 'Locked', label: 'Payroll Lock', order: 6 },
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
  workflowHistory?: TimesheetWorkflowEvent[];
  payrollAcknowledgedAt?: string | null;
  payrollAcknowledgedBy?: string | null;
  projectManager?: string | null;
  projectManagerProjectCode?: string | null;
  currentApprovalStage?: TimesheetWorkflowStage | null;
  currentApprover?: string | null;
};

export type TimesheetWorkflowStage = 'Supervisor' | 'Project Manager' | 'Cost Control' | 'HR';
export type TimesheetWorkflowDecision = 'Submitted' | 'Approved' | 'Acknowledged' | 'Rejected' | 'Returned';
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

export type TimesheetLine = {
  id: string;
  headerId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  biometricId: string;
  attendanceId: string | null;
  clockIn: string | null;
  clockOut: string | null;
  attendanceDuration: number;
  projectAllocations: Array<{
    projectId: string;
    projectCode: string;
    projectName: string;
    taskId?: string;
    taskName?: string;
    activityId?: string;
    hours: number;
    remarks: string | null;
  }>;
  idleAllocations: Array<{
    reasonId: string;
    reasonName: string;
    hours: number;
    remarks: string | null;
  }>;
  usedHours: number;
  idleHours: number;
  totalHours: number;
  variance: number; // Booked vs Attendance
  remarks: string | null;
  validationStatus: 'Valid' | 'Error' | 'Warning' | 'Incomplete';
  validationMessage: string | null;
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

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'hris');
const FILE_PATH = path.join(DATA_DIR, 'timesheet-entry.json');
const TIMESHEET_DATE = '2026-06-03';
export const STANDARD_TIMESHEET_HOURS = 9;

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

const isContractTimesheetEmployee = (employee: SagePayrollEmployee, fallback: string) =>
  sageTimesheetEmployeeCode(employee, fallback).startsWith('C');

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

const ensureStore = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await access(FILE_PATH);
  } catch {
    await writeFile(FILE_PATH, JSON.stringify(buildDefaultRecords(), null, 2), 'utf8');
  }
};

export const readTimesheetRecords = async (): Promise<TimesheetRecord[]> => {
  await ensureStore();
  let stored: TimesheetRecord[] = [];
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) stored = parsed as TimesheetRecord[];
  } catch {
    stored = [];
  }

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

  await writeFile(FILE_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
};

export const writeTimesheetRecords = async (records: TimesheetRecord[]) => {
  await ensureStore();
  await writeFile(FILE_PATH, JSON.stringify(records, null, 2), 'utf8');
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
  if (allocation.reasonId || allocation.hours <= 0) return allocation;
  return {
    ...allocation,
    reasonId: defaultIdleReason.id,
    reasonName: defaultIdleReason.name,
  };
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

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

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

const dbReady = { value: false };

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

const workCenterCode = (name: string) =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

const workCenterId = (name: string) => `wc-${workCenterCode(name).toLowerCase()}`;

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
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');
IF OBJECT_ID(N'[hris].[TimesheetProjects]', N'U') IS NULL
CREATE TABLE [hris].[TimesheetProjects] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_TimesheetProjects] PRIMARY KEY,
  [Code] NVARCHAR(50) NOT NULL CONSTRAINT [UQ_TimesheetProjects_Code] UNIQUE,
  [Name] NVARCHAR(255) NOT NULL,
  [Site] NVARCHAR(160) NOT NULL,
  [ProjectManager] NVARCHAR(220) NULL,
  [Status] NVARCHAR(40) NOT NULL CONSTRAINT [DF_TimesheetProjects_Status] DEFAULT N'Active',
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjects_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_TimesheetProjects_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
IF COL_LENGTH(N'hris.TimesheetProjects', N'ProjectManager') IS NULL
ALTER TABLE [hris].[TimesheetProjects] ADD [ProjectManager] NVARCHAR(220) NULL;
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
    dbReady.value = true;
  }
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

  if (stored) {
    return {
      ...calculated,
      ...stored,
      startDate: calculated.startDate,
      endDate: calculated.endDate,
      name: calculated.name,
    };
  }

  const now = new Date().toISOString();
  const currentPeriodId = calculateTimesheetPeriod(new Date()).id;
  const shouldAutoOpen = calculated.id === currentPeriodId && !periods.some((period) => period.status === 'Open');
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

  await writeTimesheetPeriods([...periods, period]);
  return period;
}

export async function updateTimesheetPeriodStatus(date: Date, status: TimesheetPeriod['status'], actor: string): Promise<TimesheetPeriod> {
  const calculated = calculateTimesheetPeriod(date);
  const currentPeriodId = calculateTimesheetPeriod(new Date()).id;
  if (status === 'Open' && calculated.id !== currentPeriodId) {
    throw new Error('Only the current timesheet period can be opened.');
  }
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
    site: row.Site,
    projectManager: row.ProjectManager || '',
    status: row.Status,
    tasks: tasksByProject.get(row.Id) || [],
  }));
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
        .input('Site', sql.NVarChar(160), project.site)
        .input('ProjectManager', sql.NVarChar(220), project.projectManager || null)
        .input('Status', sql.NVarChar(40), project.status)
        .query(`
MERGE [hris].[TimesheetProjects] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id] = source.[Id]
WHEN MATCHED THEN UPDATE SET [Code]=@Code,[Name]=@Name,[Site]=@Site,[ProjectManager]=@ProjectManager,[Status]=@Status,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Id],[Code],[Name],[Site],[ProjectManager],[Status]) VALUES (@Id,@Code,@Name,@Site,@ProjectManager,@Status);`);
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

export async function readTimesheetData() {
  const pool = await db();
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
    projectAllocations: projectByLine.get(row.Id) || [],
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
        .query(`
MERGE [hris].[TimesheetHeaders] AS target
USING (SELECT @Id AS [Id]) AS source ON target.[Id]=source.[Id]
WHEN MATCHED THEN UPDATE SET [PeriodId]=@PeriodId,[TimesheetDate]=@TimesheetDate,[SupervisorId]=@SupervisorId,[SupervisorName]=@SupervisorName,[WorkCenterId]=@WorkCenterId,[WorkCenterName]=@WorkCenterName,[Status]=@Status,[SubmittedAt]=@SubmittedAt,[SubmittedBy]=@SubmittedBy,[ApprovedAt]=@ApprovedAt,[ApprovedBy]=@ApprovedBy,[LastSyncAt]=@LastSyncAt,[PayrollAcknowledgedAt]=@PayrollAcknowledgedAt,[PayrollAcknowledgedBy]=@PayrollAcknowledgedBy,[ProjectManager]=@ProjectManager,[ProjectManagerProjectCode]=@ProjectManagerProjectCode,[CurrentApprovalStage]=@CurrentApprovalStage,[CurrentApprover]=@CurrentApprover
WHEN NOT MATCHED THEN INSERT ([Id],[PeriodId],[TimesheetDate],[SupervisorId],[SupervisorName],[WorkCenterId],[WorkCenterName],[Status],[SubmittedAt],[SubmittedBy],[ApprovedAt],[ApprovedBy],[LastSyncAt],[PayrollAcknowledgedAt],[PayrollAcknowledgedBy],[ProjectManager],[ProjectManagerProjectCode],[CurrentApprovalStage],[CurrentApprover])
VALUES (@Id,@PeriodId,@TimesheetDate,@SupervisorId,@SupervisorName,@WorkCenterId,@WorkCenterName,@Status,@SubmittedAt,@SubmittedBy,@ApprovedAt,@ApprovedBy,@LastSyncAt,@PayrollAcknowledgedAt,@PayrollAcknowledgedBy,@ProjectManager,@ProjectManagerProjectCode,@CurrentApprovalStage,@CurrentApprover);`);
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
    for (const line of data.lines) {
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
    for (const line of data.lines) {
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
      for (const allocation of line.projectAllocations || []) {
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
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function readTimesheetPayrollUpdates(): Promise<TimesheetPayrollUpdate[]> {
  const pool = await db();
  const [updatesResult, headersResult, employeesResult] = await Promise.all([
    pool.request().query(`SELECT * FROM [hris].[TimesheetPayrollUpdates] ORDER BY [AcknowledgedAt] DESC`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetPayrollUpdateHeaders]`),
    pool.request().query(`SELECT * FROM [hris].[TimesheetPayrollUpdateEmployees] ORDER BY [EmployeeName]`),
  ]);
  return updatesResult.recordset.map((row) => ({
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

export async function writeTimesheetPayrollUpdates(updates: TimesheetPayrollUpdate[]) {
  const pool = await db();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
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

export async function readTimesheetWorkCenters(): Promise<TimesheetWorkCenter[]> {
  const pool = await db();
  const result = await pool.request().query(`
SELECT [Id],[Code],[Name],[Location],[Site],[Status],[SourceSystem],[CreatedAt],[UpdatedAt]
FROM [hris].[TimesheetWorkCenters]
WHERE [Status] = N'Active'
ORDER BY [Name]`);
  return result.recordset.map((row) => ({
    id: row.Id,
    code: row.Code,
    name: row.Name,
    location: row.Location,
    site: row.Site,
    status: row.Status,
    sourceSystem: row.SourceSystem,
    createdAt: toIso(row.CreatedAt),
    updatedAt: toIso(row.UpdatedAt),
  }));
}

export async function readSystemTimesheetDepartments(): Promise<TimesheetDepartment[]> {
  const pool = await db();
  const table = await pool.request().query(`SELECT OBJECT_ID(N'[hris].[OrganizationDepartments]', N'U') AS [TableId]`);
  if (!table.recordset[0]?.TableId) return [];

  const result = await pool.request().query(`
SELECT [Id],[SourceCode],[Name],[SourceSystem],[LastSyncedAt]
FROM [hris].[OrganizationDepartments]
ORDER BY CASE WHEN [Name]=N'Unassigned Department' THEN 1 ELSE 0 END, [Name]`);

  return result.recordset.map((row) => ({
    id: row.Id,
    code: row.SourceCode,
    name: row.Name,
    sourceSystem: row.SourceSystem || 'DLE Enterprise',
    updatedAt: toIso(row.LastSyncedAt),
  }));
}

export async function readSystemTimesheetLocations(): Promise<TimesheetLocation[]> {
  const pool = await db();
  const table = await pool.request().query(`SELECT OBJECT_ID(N'[hris].[OrganizationLocationsSites]', N'U') AS [TableId]`);
  if (!table.recordset[0]?.TableId) return [];

  const result = await pool.request().query(`
SELECT [Id],[SourceCode],[Name],[Location],[SourceSystem],[LastSyncedAt]
FROM [hris].[OrganizationLocationsSites]
WHERE [RecordType]=N'Site'
ORDER BY CASE WHEN [Name]=N'Unassigned Location' THEN 1 ELSE 0 END, [Name]`);

  return result.recordset.map((row) => ({
    id: row.Id,
    code: row.SourceCode,
    name: row.Name,
    site: row.Location || row.Name,
    sourceSystem: row.SourceSystem || 'DLE Enterprise',
    updatedAt: toIso(row.LastSyncedAt),
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

export const normalizeTimesheetStatus = (status: TimesheetStatus): TimesheetStatus => {
  if (status === 'HR_Reviewed') return 'Project_Manager_Reviewed';
  if (status === 'Project_Control_Reviewed') return 'Cost_Control_Reviewed';
  if (status === 'Approved') return 'HR_Acknowledged';
  return status;
};

export const isTimesheetEditableStatus = (status: TimesheetStatus) =>
  ['Draft', 'Returned', 'Rejected'].includes(normalizeTimesheetStatus(status));

export const isTimesheetPayrollReadyStatus = (status: TimesheetStatus) =>
  ['HR_Acknowledged', 'Locked'].includes(normalizeTimesheetStatus(status));

const createPayrollUpdateForPeriod = async (periodId: string, actor: string): Promise<TimesheetPayrollUpdate> => {
  const { headers, lines } = await readTimesheetData();
  const period = await readTimesheetPeriod(new Date(`${periodId.replace('per-', '')}-15T00:00:00`));
  const periodHeaders = headers.filter((header) => header.periodId === periodId && normalizeTimesheetStatus(header.status) === 'HR_Acknowledged');
  const headerIds = new Set(periodHeaders.map((header) => header.id));
  const totals = new Map<string, TimesheetPayrollUpdate['employeeAttendance'][number]>();

  for (const line of lines.filter((item) => headerIds.has(item.headerId))) {
    const current = totals.get(line.employeeId) || {
      employeeId: line.employeeId,
      employeeName: line.employeeName,
      daysWorked: 0,
      attendanceHours: 0,
      bookedHours: 0,
      idleHours: 0,
    };
    current.daysWorked += line.clockIn ? 1 : 0;
    current.attendanceHours = Math.round((current.attendanceHours + line.attendanceDuration) * 10) / 10;
    current.bookedHours = Math.round((current.bookedHours + line.totalHours) * 10) / 10;
    current.idleHours = Math.round((current.idleHours + line.idleHours) * 10) / 10;
    totals.set(line.employeeId, current);
  }

  const update: TimesheetPayrollUpdate = {
    id: `payroll-${periodId}-${Date.now()}`,
    periodId,
    periodName: period.name,
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: actor,
    headerIds: Array.from(headerIds),
    employeeAttendance: Array.from(totals.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
  };
  const updates = await readTimesheetPayrollUpdates();
  await writeTimesheetPayrollUpdates([update, ...updates.filter((item) => item.periodId !== periodId)]);
  return update;
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

  if (action === 'REJECT') {
    if (!['Submitted', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(status)) {
      throw new Error('Only in-progress timesheets can be rejected.');
    }
    const stage: TimesheetWorkflowStage = status === 'Submitted' ? 'Project Manager' : status === 'Project_Manager_Reviewed' ? 'Cost Control' : 'HR';
    header.status = 'Rejected';
    event = workflowEvent(stage, 'Rejected', actor, comment);
  } else if (action === 'RETURN') {
    if (!['Submitted', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed'].includes(status)) {
      throw new Error('Only in-progress timesheets can be returned.');
    }
    const stage: TimesheetWorkflowStage = status === 'Submitted' ? 'Project Manager' : status === 'Project_Manager_Reviewed' ? 'Cost Control' : 'HR';
    header.status = 'Returned';
    event = workflowEvent(stage, 'Returned', actor, comment);
  } else if (status === 'Submitted') {
    header.status = 'Project_Manager_Reviewed';
    header.currentApprovalStage = 'Cost Control';
    header.currentApprover = 'Cost Control';
    event = workflowEvent('Project Manager', 'Approved', actor, comment);
  } else if (status === 'Project_Manager_Reviewed') {
    header.status = 'Cost_Control_Reviewed';
    header.currentApprovalStage = 'HR';
    header.currentApprover = 'HR';
    event = workflowEvent('Cost Control', 'Approved', actor, comment);
  } else if (status === 'Cost_Control_Reviewed') {
    header.status = 'HR_Acknowledged';
    header.approvedAt = now;
    header.approvedBy = actor;
    header.payrollAcknowledgedAt = now;
    header.payrollAcknowledgedBy = actor;
    header.currentApprovalStage = null;
    header.currentApprover = null;
    event = workflowEvent('HR', 'Acknowledged', actor, comment || 'Acknowledged for payroll update.');
  } else {
    throw new Error('This timesheet is not waiting for approval.');
  }

  header.workflowHistory = [...(header.workflowHistory || []), event];
  await writeTimesheetData({ headers, lines });
  const payrollUpdate = header.status === 'HR_Acknowledged' ? await createPayrollUpdateForPeriod(header.periodId, actor) : null;
  return { header, payrollUpdate };
}

export async function syncAttendanceForTimesheet(date: string, supervisorId: string, workCenterName: string) {
  const liveAttendance = await readLiveClockingActivity(date);
  const clockingRecords = liveAttendance.records;
  const activePayroll = await readActiveSagePayrollEmployeeKeys();
  const activeEmployeeByKey = new Map<string, SagePayrollEmployee>();

  for (const employee of activePayroll.employees) {
    [
      employee.employeeId,
      employee.employeeCode,
      employee.entityCode,
      employee.displayName,
    ].forEach((value) => {
      const key = normalizePayrollMatchKey(value);
      if (key && !activeEmployeeByKey.has(key)) activeEmployeeByKey.set(key, employee);
    });
  }
  
  // Business Rule: A timesheet is created for a Work Center / Site.
  // We should find all employees who clocked in at this site OR are assigned to this supervisor.
  const exactWorkCenterRecords = clockingRecords.filter(
    (r) =>
      r.site === workCenterName ||
      r.location === workCenterName ||
      r.supervisor === supervisorId ||
      r.supervisor.includes(supervisorId),
  );
  const recordsInScope = exactWorkCenterRecords.length > 0 ? exactWorkCenterRecords : clockingRecords;
  const attendanceForDay = recordsInScope
    .map((attendance) => {
      const payrollEmployee = [
        attendance.employeeId,
        attendance.employeeName,
      ]
        .map((value) => activeEmployeeByKey.get(normalizePayrollMatchKey(value)))
        .find(Boolean);

      return payrollEmployee && isContractTimesheetEmployee(payrollEmployee, attendance.employeeId) ? { attendance, payrollEmployee } : null;
    })
    .filter((record): record is { attendance: (typeof clockingRecords)[number]; payrollEmployee: SagePayrollEmployee } => Boolean(record));

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
    headers.push(header);
  } else {
    header.lastSyncAt = new Date().toISOString();
  }

  // Filter out lines for this header and rebuild
  const otherLines = lines.filter((l) => l.headerId !== header!.id);
  const newLines: TimesheetLine[] = attendanceForDay.map(({ attendance: att, payrollEmployee }) => {
    const employeeCode = sageTimesheetEmployeeCode(payrollEmployee, att.employeeId);
    const employeeName = formatSageEmployeeFullName(payrollEmployee, att.employeeName);
    const existingLine = lines.find((l) => l.headerId === header!.id && l.employeeId === employeeCode);
    
    // Attendance duration in hours
    const duration = att.checkInTime && att.checkOutTime 
      ? (new Date(`2026-01-01T${att.checkOutTime}`).getTime() - new Date(`2026-01-01T${att.checkInTime}`).getTime()) / (1000 * 60 * 60)
      : att.checkInTime ? 9 : 0; // Default to 9 if clocked in but not out yet (7:30 to 16:30 is 9 hours)

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
      attendanceDuration: Math.round(duration * 10) / 10,
      projectAllocations: existingLine?.projectAllocations || [],
      idleAllocations: (existingLine?.idleAllocations || []).map(withDefaultIdleReason),
      usedHours: existingLine?.usedHours || 0,
      idleHours: existingLine?.idleHours || 0,
      totalHours: existingLine?.totalHours || 0,
      variance: Math.round(((existingLine?.totalHours || 0) - (Math.round(duration * 10) / 10)) * 10) / 10,
      remarks: existingLine?.remarks || null,
      validationStatus: 'Incomplete',
      validationMessage: 'Awaiting time allocation.',
    };
  });

  await writeTimesheetData({ headers, lines: [...otherLines, ...newLines] });
  return { header, lines: newLines };
}

export const buildDefaultTimesheetRecords = () => buildDefaultRecords();
