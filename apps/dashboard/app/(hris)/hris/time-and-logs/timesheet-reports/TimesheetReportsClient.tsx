'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Columns3,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  GitBranch,
  Hourglass,
  Landmark,
  LockKeyhole,
  Mail,
  Printer,
  RefreshCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';
import { downloadExcelFile } from '@/lib/excel-export';
import {
  PAYROLL_ATTENDANCE_SHEET_COLUMNS,
  payrollAttendanceSheetToExcelRows,
  type PayrollAttendanceSheetRow,
} from '@/lib/timesheet-payroll-attendance-sheet-shared';
import type { MissingTimesheetDay } from '@/lib/timesheet-recapture-shared';
import { TIMESHEET_RECAPTURE_GUIDE } from '@/lib/timesheet-recapture-shared';

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

type DetailRow = {
  headerId: string;
  lineId: string;
  allocationId: string;
  periodId: string;
  periodName: string;
  periodStatus?: string;
  timesheetDate: string;
  supervisorId?: string;
  supervisorName: string;
  workCenterId?: string;
  workCenterName: string;
  shiftLabel?: string;
  status?: string;
  normalizedStatus: string;
  approvalStatus: string;
  currentApprover?: string;
  payrollReady: boolean;
  employeeId?: string;
  employeeNo: string;
  employeeName: string;
  biometricId?: string;
  attendanceId?: string;
  employeeCategory: string;
  employmentType: string;
  department: string;
  section: string;
  businessUnit: string;
  costCentre: string;
  location: string;
  jobCode: string;
  jobTitle: string;
  clockIn?: string | null;
  clockOut?: string | null;
  attendanceHours: number;
  dayWorked?: number;
  daysWorked?: number;
  usedHours?: number;
  idleHours?: number;
  productiveHours: number;
  nonProductiveHours: number;
  overtimeHours: number;
  totalHours: number;
  variance: number;
  validationStatus: string;
  validationMessage: string | null;
  lineRemarks?: string;
  idleReasons?: string;
  projectCode: string;
  projectName: string;
  projectManager: string;
  projectSite: string;
  activityCode: string;
  activityName: string;
  allocationHours: number;
  allocationRemarks?: string;
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
  approvedAt?: string | null;
  approvedBy?: string | null;
  payrollAcknowledgedAt: string | null;
  payrollAcknowledgedBy?: string | null;
  lastSyncAt?: string | null;
  auditTrail: string;
};

type FilterOptions = {
  periods: { id: string; name: string }[];
  statuses: string[];
  supervisors: string[];
  workCenters: string[];
  projects: string[];
  employees: string[];
  departments: string[];
  sections: string[];
  businessUnits: string[];
  costCentres: string[];
  locations: string[];
  jobCodes: string[];
  activityCodes: string[];
  projectManagers: string[];
  employeeCategories: string[];
  employmentTypes: string[];
  overtimeStatuses: string[];
};

type ReportsPayload = {
  generatedAt: string;
  reportType: ReportType;
  permissions: {
    actor: string;
    role: string;
    visibilityScope: string;
    canExport: boolean;
    canSchedule: boolean;
    canViewCosts: boolean;
    canViewPayroll: boolean;
  };
  summary: Summary;
  reportRows: Array<GroupedRow | DetailRow>;
  detailRows: DetailRow[];
  detailRowCount?: number;
  detailRowsTruncated?: boolean;
  exportMode?: 'preview' | 'full';
  payrollAttendanceSheet?: PayrollAttendanceSheetRow[];
  payrollAttendanceSheetCount?: number;
  missingDays?: MissingTimesheetDay[];
  missingDayCount?: number;
  recaptureGates?: Record<string, { allowed: boolean; periodCode: string; message: string }>;
  recaptureGuide?: typeof TIMESHEET_RECAPTURE_GUIDE;
  drilldowns: Record<string, GroupedRow[]>;
  breakdowns: Record<string, GroupedRow[]>;
  widgets: Array<{ id: string; title: string; value: string; detail: string }>;
  subscriptions: Array<{ id: string; name: string; cadence: string; channels: string; status: string }>;
  integrations: string[];
  audit: { exportedBy: string; generatedAt: string; sourceModule: string; actionHistory: string; changeTracking: string };
  filterOptions: FilterOptions;
};

const reportTypes: { id: ReportType; label: string; description: string; icon: typeof BarChart3 }[] = [
  { id: 'summary', label: 'Timesheet Summary', description: 'Enterprise summary by payroll period and organization.', icon: BarChart3 },
  { id: 'employee-detail', label: 'Employee Detail', description: 'Employee daily entries, projects, status, and hours.', icon: Users },
  { id: 'department', label: 'Department Report', description: 'Department, section, and business unit utilization.', icon: Landmark },
  { id: 'project', label: 'Project Report', description: 'Project split hours and project manager ownership.', icon: BriefcaseBusiness },
  { id: 'project-manager-approval', label: 'PM Approval', description: 'Project manager approval status and bottlenecks.', icon: ShieldCheck },
  { id: 'cost-control', label: 'Cost Control', description: 'Cost centre allocation and budget effort analysis.', icon: LockKeyhole },
  { id: 'payroll-processing', label: 'Payroll Processing', description: 'Payroll-ready hours and consolidated summaries.', icon: CheckCircle2 },
  { id: 'overtime-analysis', label: 'Overtime Analysis', description: 'Overtime status, excessive overtime, and approval.', icon: Clock },
  { id: 'resource-allocation', label: 'Resource Allocation', description: 'Crew allocation by work center and project.', icon: GitBranch },
  { id: 'manpower-utilization', label: 'Manpower Utilization', description: 'Location and manpower utilization monitoring.', icon: Users },
  { id: 'workforce-productivity', label: 'Productivity', description: 'Workforce productivity index and trends.', icon: TrendingUp },
  { id: 'approval-status', label: 'Approval Status', description: 'Workflow stages, comments, returns, and cycle time.', icon: FileText },
  { id: 'exceptions', label: 'Exception Report', description: 'Missing, rejected, duplicate, invalid, and bottleneck checks.', icon: AlertTriangle },
  { id: 'audit-trail', label: 'Audit Trail', description: 'Workflow history, comments, changes, and export audit.', icon: FileSpreadsheet },
  { id: 'project-labour-cost', label: 'Project Labour Cost', description: 'Labour cost by project, activity, and cost centre.', icon: Landmark },
  { id: 'project-resource-utilization', label: 'Project Resource Use', description: 'Project resource utilization and effort analysis.', icon: BriefcaseBusiness },
];

const workspaceTabs: Array<{ id: string; label: string; reportType: ReportType }> = [
  { id: 'overview', label: 'Overview', reportType: 'summary' },
  { id: 'operational', label: 'Operational', reportType: 'employee-detail' },
  { id: 'projects', label: 'Projects', reportType: 'project' },
  { id: 'approvals', label: 'Approvals', reportType: 'approval-status' },
  { id: 'payroll', label: 'Payroll', reportType: 'payroll-processing' },
  { id: 'compliance', label: 'Compliance', reportType: 'exceptions' },
  { id: 'audit', label: 'Audit', reportType: 'audit-trail' },
];

type ExportColumnKey = keyof DetailRow | '_payrollReady';
type ExportColumnDef = { key: ExportColumnKey; label: string };
type ExportColumnGroup = { id: string; label: string; columns: ExportColumnDef[] };

const EXPORT_COLUMN_GROUPS: ExportColumnGroup[] = [
  {
    id: 'identity',
    label: 'Identity & Period',
    columns: [
      { key: 'timesheetDate', label: 'Date' },
      { key: 'periodName', label: 'Period' },
      { key: 'periodId', label: 'Period ID' },
      { key: 'periodStatus', label: 'Period Status' },
      { key: 'shiftLabel', label: 'Shift' },
      { key: 'headerId', label: 'Header ID' },
      { key: 'lineId', label: 'Line ID' },
      { key: 'allocationId', label: 'Allocation ID' },
    ],
  },
  {
    id: 'employee',
    label: 'Employee',
    columns: [
      { key: 'employeeNo', label: 'Employee No' },
      { key: 'employeeName', label: 'Employee Name' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'biometricId', label: 'Biometric ID' },
      { key: 'attendanceId', label: 'Attendance ID' },
      { key: 'employeeCategory', label: 'Category' },
      { key: 'employmentType', label: 'Employment Type' },
      { key: 'jobCode', label: 'Job Code' },
      { key: 'jobTitle', label: 'Job Title' },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    columns: [
      { key: 'department', label: 'Department' },
      { key: 'section', label: 'Section' },
      { key: 'businessUnit', label: 'Business Unit' },
      { key: 'location', label: 'Location' },
      { key: 'supervisorName', label: 'Supervisor' },
      { key: 'supervisorId', label: 'Supervisor ID' },
      { key: 'workCenterName', label: 'Work Centre' },
      { key: 'workCenterId', label: 'Work Centre ID' },
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance & Hours',
    columns: [
      { key: 'clockIn', label: 'Clock In' },
      { key: 'clockOut', label: 'Clock Out' },
      { key: 'dayWorked', label: 'Day Worked' },
      { key: 'daysWorked', label: 'Days Worked' },
      { key: 'attendanceHours', label: 'Attendance Hours' },
      { key: 'usedHours', label: 'Used Hours' },
      { key: 'idleHours', label: 'Idle Hours' },
      { key: 'idleReasons', label: 'Idle Reasons' },
      { key: 'productiveHours', label: 'Productive Hours' },
      { key: 'nonProductiveHours', label: 'Non Productive Hours' },
      { key: 'overtimeHours', label: 'Overtime Hours' },
      { key: 'totalHours', label: 'Total Hours' },
      { key: 'variance', label: 'Variance' },
      { key: 'lineRemarks', label: 'Line Remarks' },
    ],
  },
  {
    id: 'project',
    label: 'Project Allocation',
    columns: [
      { key: 'projectCode', label: 'Project Code' },
      { key: 'projectName', label: 'Project Name' },
      { key: 'projectSite', label: 'Project Site' },
      { key: 'projectManager', label: 'Project Manager' },
      { key: 'costCentre', label: 'Cost Centre' },
      { key: 'activityCode', label: 'Activity Code' },
      { key: 'activityName', label: 'Activity Name' },
      { key: 'allocationHours', label: 'Allocation Hours' },
      { key: 'allocationRemarks', label: 'Allocation Remarks' },
    ],
  },
  {
    id: 'workflow',
    label: 'Status & Workflow',
    columns: [
      { key: 'normalizedStatus', label: 'Timesheet Status' },
      { key: 'status', label: 'Raw Status' },
      { key: 'approvalStatus', label: 'Approval Stage' },
      { key: 'currentApprover', label: 'Current Approver' },
      { key: 'projectManagerStatus', label: 'PM Approval' },
      { key: 'costControlStatus', label: 'Cost Control' },
      { key: 'overtimeStatus', label: 'Overtime Status' },
      { key: '_payrollReady', label: 'Payroll Ready' },
      { key: 'validationStatus', label: 'Validation Status' },
      { key: 'validationMessage', label: 'Validation Message' },
      { key: 'exceptionType', label: 'Exception' },
      { key: 'exceptionSeverity', label: 'Exception Severity' },
      { key: 'approvalComments', label: 'Approval Comments' },
      { key: 'workflowHistory', label: 'Workflow History' },
    ],
  },
  {
    id: 'audit',
    label: 'Audit & Cost',
    columns: [
      { key: 'submittedAt', label: 'Submitted At' },
      { key: 'submittedBy', label: 'Submitted By' },
      { key: 'approvedAt', label: 'Approved At' },
      { key: 'approvedBy', label: 'Approved By' },
      { key: 'payrollAcknowledgedAt', label: 'Payroll Acknowledged At' },
      { key: 'payrollAcknowledgedBy', label: 'Payroll Acknowledged By' },
      { key: 'lastSyncAt', label: 'Last Sync At' },
      { key: 'labourRateNgn', label: 'Labour Rate' },
      { key: 'labourCostNgn', label: 'Labour Cost' },
      { key: 'auditTrail', label: 'Audit Trail' },
    ],
  },
];

const ALL_EXPORT_COLUMNS: ExportColumnDef[] = EXPORT_COLUMN_GROUPS.flatMap((group) => group.columns);
const EXPORT_COLUMN_STORAGE_KEY = 'timesheet-reports-export-columns';

const DEFAULT_EXPORT_COLUMN_KEYS: ExportColumnKey[] = [
  'timesheetDate',
  'periodName',
  'employeeNo',
  'employeeName',
  'department',
  'supervisorName',
  'workCenterName',
  'clockIn',
  'clockOut',
  'dayWorked',
  'daysWorked',
  'projectCode',
  'projectName',
  'activityName',
  'allocationHours',
  'productiveHours',
  'idleHours',
  'overtimeHours',
  'normalizedStatus',
  'approvalStatus',
  '_payrollReady',
  'exceptionType',
];

const loadStoredExportColumns = (): ExportColumnKey[] => {
  if (typeof window === 'undefined') return DEFAULT_EXPORT_COLUMN_KEYS;
  try {
    const raw = window.localStorage.getItem(EXPORT_COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_EXPORT_COLUMN_KEYS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_EXPORT_COLUMN_KEYS;
    const allowed = new Set(ALL_EXPORT_COLUMNS.map((column) => column.key));
    const selected = parsed.filter((key): key is ExportColumnKey => typeof key === 'string' && allowed.has(key as ExportColumnKey));
    if (!selected.length) return DEFAULT_EXPORT_COLUMN_KEYS;
    // Days Worked is required for payroll-aligned reporting — keep it available even on older saved selections.
    if (!selected.includes('daysWorked')) selected.push('daysWorked');
    if (!selected.includes('dayWorked')) selected.push('dayWorked');
    return selected;
  } catch {
    return DEFAULT_EXPORT_COLUMN_KEYS;
  }
};

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat('en-GB');

const formatMoney = (value: number) => moneyFmt.format(Number(value || 0));
const formatHours = (value: number) => `${numberFmt.format(Number(value || 0))}h`;
const formatNumber = (value: number) => intFmt.format(Number(value || 0));
const formatStatus = (status: string) => status.replace(/_/g, ' ');
const isGroupedRow = (row: GroupedRow | DetailRow): row is GroupedRow => 'label' in row;
const clampPct = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const pctText = (value: number) => `${formatNumber(clampPct(value))}%`;
const ratioPct = (value: number, total: number) => total ? clampPct((value / total) * 100) : 0;
const qualityTone = (value: number): 'green' | 'amber' | 'red' => value >= 90 ? 'green' : value >= 75 ? 'amber' : 'red';
const exceptionTone = (count: number): 'green' | 'amber' | 'red' => count === 0 ? 'green' : count < 10 ? 'amber' : 'red';

const normalizeDimensionLabel = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Unassigned';
  const normalized = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const key = normalized.toLowerCase();
  if (['permanent', 'permanent staff'].includes(key)) return 'Permanent';
  if (['lumpsum', 'lump sum', 'contract on lumpsum', 'contract lump sum'].includes(key)) return 'Lumpsum';
  if (['daily rate', 'contract on day rate', 'contract day rate', 'day rate'].includes(key)) return 'Daily Rate';
  if (key === 'no project') return 'No Project';
  if (key === 'unassigned') return 'Unassigned';
  if (/^p\d{4}\s+-/i.test(normalized) || /^c?\d{4}\s+-/i.test(normalized)) return normalized;
  if (normalized.length <= 4) return normalized.toUpperCase();
  return normalized
    .toLowerCase()
    .split(' ')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(' ');
};

const uniqueFilterValues = (values: string[] = []) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const label = normalizeDimensionLabel(value).toLowerCase();
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
};

const statusClass = (status: string) => {
  if (status === 'HR_Acknowledged' || status === 'Locked' || status === 'Approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Rejected' || status === 'Returned') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Submitted') return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  if (status === 'Supervisor_Reviewed') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (status === 'Cost_Control_Reviewed' || status === 'Project_Manager_Reviewed') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const csvValue = (value: unknown) => {
  const normalized = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return `"${normalized.replace(/"/g, '""')}"`;
};

function MultiSelect({ label, values, selected, onChange, limit = 8, compact = false }: { label: string; values: string[]; selected: string[]; onChange: (next: string[]) => void; limit?: number; compact?: boolean }) {
  const cleanValues = uniqueFilterValues(values);
  const visible = cleanValues.slice(0, limit);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        {selected.length ? <button type="button" onClick={() => onChange([])} className="text-[10px] font-black text-blue-700">Clear</button> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((value) => {
          const active = selected.includes(value);
          return (
            <button key={value} type="button" onClick={() => onChange(active ? selected.filter((item) => item !== value) : [...selected, value])} title={value} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${active ? 'border-blue-500 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <span className={`block truncate ${compact ? 'max-w-[140px]' : 'max-w-[180px]'}`}>{normalizeDimensionLabel(value)}</span>
            </button>
          );
        })}
        {cleanValues.length > visible.length ? <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-400">+{cleanValues.length - visible.length}</span> : null}
      </div>
    </div>
  );
}

function KpiCard({ label, value, detail, icon: Icon, tone = 'blue' }: { label: string; value: string; detail: string; icon: typeof BarChart3; tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate' }) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }[tone];
  const iconClass = {
    blue: 'bg-blue-600 text-white',
    green: 'bg-emerald-600 text-white',
    amber: 'bg-amber-500 text-white',
    red: 'bg-red-600 text-white',
    slate: 'bg-slate-800 text-white',
  }[tone];
  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`rounded-lg p-2 ${iconClass}`}><Icon className="h-5 w-5" /></div>
        <div className="text-right">
          <div className="text-xl font-black text-slate-950">{value}</div>
          <div className="text-[11px] font-semibold text-slate-500">{detail}</div>
        </div>
      </div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className={`absolute bottom-0 left-0 h-1 w-full ${iconClass}`} />
    </div>
  );
}

function DecisionCard({ title, value, detail, tone = 'blue' }: { title: string; value: string; detail: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate' }) {
  const toneClass = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{title}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-600">{detail}</p>
    </div>
  );
}

function VisualBar({ label, value, total, tone = 'blue', trailing }: { label: string; value: number; total: number; tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate'; trailing?: string }) {
  const width = ratioPct(value, total);
  const barClass = {
    blue: 'bg-blue-600',
    green: 'bg-emerald-600',
    amber: 'bg-amber-500',
    red: 'bg-red-600',
    slate: 'bg-slate-700',
  }[tone];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-black text-slate-900">{trailing || pctText(width)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function DashboardKpi({ label, value, detail, icon: Icon, tone, onClick }: { label: string; value: string; detail: string; icon: typeof BarChart3; tone: 'blue' | 'green' | 'violet' | 'amber' | 'teal' | 'red'; onClick?: () => void }) {
  const toneMap = {
    blue: { card: 'border-blue-100 bg-blue-50/70', icon: 'bg-blue-600', trend: 'text-emerald-600' },
    green: { card: 'border-emerald-100 bg-emerald-50/70', icon: 'bg-emerald-600', trend: 'text-emerald-600' },
    violet: { card: 'border-violet-100 bg-violet-50/70', icon: 'bg-violet-600', trend: 'text-violet-600' },
    amber: { card: 'border-amber-100 bg-amber-50/70', icon: 'bg-amber-500', trend: 'text-amber-700' },
    teal: { card: 'border-teal-100 bg-teal-50/70', icon: 'bg-teal-600', trend: 'text-emerald-600' },
    red: { card: 'border-red-100 bg-red-50/70', icon: 'bg-red-600', trend: 'text-red-600' },
  }[tone];
  return (
    <button type="button" onClick={onClick} className={`min-h-[92px] rounded-lg border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${toneMap.card}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${toneMap.icon}`}><Icon className="h-5 w-5" /></span>
        <span className="min-w-0">
          <span className="block truncate text-xl font-black text-slate-950">{value}</span>
          <span className="block truncate text-xs font-bold text-slate-600">{label}</span>
        </span>
      </div>
      <p className={`mt-3 text-[10px] font-black ${toneMap.trend}`}>{detail}</p>
    </button>
  );
}

function DonutChart({ rows, total }: { rows: GroupedRow[]; total: number }) {
  const colors = ['#7c3aed', '#f59e0b', '#10b981', '#14b8a6', '#38bdf8', '#3b82f6', '#94a3b8'];
  let acc = 0;
  const stops = rows.slice(0, 7).map((row, index) => {
    const start = acc;
    const pct = total ? (row.timesheets / total) * 100 : 0;
    acc += pct;
    return `${colors[index]} ${start}% ${acc}%`;
  }).join(', ');
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops || '#e2e8f0 0% 100%'})` }}>
        <div className="absolute inset-10 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
          <span className="text-xl font-black text-slate-950">{formatNumber(total)}</span>
          <span className="text-[11px] font-bold text-slate-500">Timesheets</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {rows.slice(0, 7).map((row, index) => (
          <div key={row.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 font-bold text-slate-700"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index] }} /> <span className="truncate">{formatStatus(row.label)}</span></span>
            <span className="font-black text-slate-900">{formatNumber(row.timesheets)}</span>
            <span className="w-12 text-right font-bold text-slate-500">({pctText(ratioPct(row.timesheets, total))})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayrollReadinessGauge({ ready, pending, rejected }: { ready: number; pending: number; rejected: number }) {
  const total = Math.max(ready + pending + rejected, 1);
  const pct = ratioPct(ready, total);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36 rounded-full" style={{ background: `conic-gradient(#10b981 0% ${pct}%, #e5e7eb ${pct}% 100%)` }}>
        <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
          <span className="text-3xl font-black text-slate-950">{pctText(pct)}</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs font-black text-slate-700">{formatHours(ready)} / {formatHours(total)}</p>
      <p className="text-xs font-bold text-slate-500">Ready for Payroll</p>
      <div className="mt-4 w-full space-y-2 text-xs">
        <div className="flex justify-between gap-3"><span className="font-bold text-emerald-700">Ready for Payroll</span><span className="font-black">{formatHours(ready)} ({pctText(ratioPct(ready, total))})</span></div>
        <div className="flex justify-between gap-3"><span className="font-bold text-amber-700">Pending Approvals</span><span className="font-black">{formatHours(pending)} ({pctText(ratioPct(pending, total))})</span></div>
        <div className="flex justify-between gap-3"><span className="font-bold text-red-700">Returned / Rejected</span><span className="font-black">{formatHours(rejected)} ({pctText(ratioPct(rejected, total))})</span></div>
      </div>
    </div>
  );
}

function StatusMark({ state }: { state: 'approved' | 'pending' | 'rejected' | 'none' }) {
  const classes = {
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    pending: 'border-amber-200 bg-amber-50 text-amber-600',
    rejected: 'border-red-200 bg-red-50 text-red-600',
    none: 'border-slate-200 bg-slate-50 text-slate-400',
  }[state];
  return <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-black ${classes}`}>{state === 'approved' ? '✓' : state === 'pending' ? '!' : state === 'rejected' ? '×' : '-'}</span>;
}

export default function TimesheetReportsClient() {
  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('summary');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState('');
  const [payrollReady, setPayrollReady] = useState<'all' | 'yes' | 'no'>('all');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [supervisors, setSupervisors] = useState<string[]>([]);
  const [workCenters, setWorkCenters] = useState<string[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [projectManagers, setProjectManagers] = useState<string[]>([]);
  const [costCentres, setCostCentres] = useState<string[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [employeeCategories, setEmployeeCategories] = useState<string[]>([]);
  const [drilldown, setDrilldown] = useState<{ groupBy: string; key: string } | null>(null);
  const [kpiDetail, setKpiDetail] = useState<{ title: string; kind: 'total' | 'project' | 'employees' | 'overtime' | 'labour-cost' | 'payroll-ready' | 'pending' | 'exceptions' } | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showRecaptureGuide, setShowRecaptureGuide] = useState(true);
  const [showMissingDays, setShowMissingDays] = useState(true);
  const [recaptureBusyId, setRecaptureBusyId] = useState<string | null>(null);
  const [recaptureReason, setRecaptureReason] = useState('Omitted / incomplete day — reopen for recapture.');
  const [selectedExportColumns, setSelectedExportColumns] = useState<ExportColumnKey[]>(DEFAULT_EXPORT_COLUMN_KEYS);
  const [exportColumnsReady, setExportColumnsReady] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');

  useEffect(() => {
    setSelectedExportColumns(loadStoredExportColumns());
    setExportColumnsReady(true);
  }, []);

  useEffect(() => {
    if (!exportColumnsReady || typeof window === 'undefined') return;
    window.localStorage.setItem(EXPORT_COLUMN_STORAGE_KEY, JSON.stringify(selectedExportColumns));
  }, [exportColumnsReady, selectedExportColumns]);

  const selectedExportColumnSet = useMemo(() => new Set(selectedExportColumns), [selectedExportColumns]);
  const activeExportColumns = useMemo(
    () => ALL_EXPORT_COLUMNS.filter((column) => selectedExportColumnSet.has(column.key)),
    [selectedExportColumnSet],
  );
  const filteredExportGroups = useMemo(() => {
    const needle = columnSearch.trim().toLowerCase();
    if (!needle) return EXPORT_COLUMN_GROUPS;
    return EXPORT_COLUMN_GROUPS
      .map((group) => ({
        ...group,
        columns: group.columns.filter((column) => column.label.toLowerCase().includes(needle) || column.key.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.columns.length > 0);
  }, [columnSearch]);

  const toggleExportColumn = (key: ExportColumnKey) => {
    setSelectedExportColumns((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const toggleExportGroup = (group: ExportColumnGroup, enabled: boolean) => {
    const keys = group.columns.map((column) => column.key);
    setSelectedExportColumns((prev) => {
      if (enabled) return Array.from(new Set([...prev, ...keys]));
      return prev.filter((key) => !keys.includes(key));
    });
  };

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ reportType, from, to });
    if (query.trim()) params.set('query', query.trim());
    if (payrollReady !== 'all') params.set('payrollReady', payrollReady);
    if (statuses.length) params.set('statuses', statuses.join(','));
    if (supervisors.length) params.set('supervisors', supervisors.join(','));
    if (workCenters.length) params.set('workCenters', workCenters.join(','));
    if (periods.length) params.set('periods', periods.join(','));
    if (projects.length) params.set('projects', projects.join(','));
    if (departments.length) params.set('departments', departments.join(','));
    if (locations.length) params.set('locations', locations.join(','));
    if (projectManagers.length) params.set('projectManagers', projectManagers.join(','));
    if (costCentres.length) params.set('costCentres', costCentres.join(','));
    if (employmentTypes.length) params.set('employmentTypes', employmentTypes.join(','));
    if (employeeCategories.length) params.set('employeeCategories', employeeCategories.join(','));
    return `/api/hris/time-and-logs/timesheet-reports?${params.toString()}`;
  }, [costCentres, departments, employeeCategories, employmentTypes, from, locations, payrollReady, periods, projectManagers, projects, query, reportType, statuses, supervisors, to, workCenters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(requestUrl, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load timesheet reports');
      setPayload(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load timesheet reports');
    } finally {
      setLoading(false);
    }
  }, [requestUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const openTimesheetEntry = (gap: MissingTimesheetDay) => {
    const params = new URLSearchParams();
    if (gap.headerId) params.set('headerId', gap.headerId);
    params.set('date', gap.date);
    if (gap.supervisorId) params.set('supervisorId', gap.supervisorId);
    if (gap.workCenterName) params.set('workCenterName', gap.workCenterName);
    window.location.href = `/hris/time-and-logs/timesheet-entry?${params.toString()}`;
  };

  const reopenForRecapture = async (gap: MissingTimesheetDay) => {
    if (!gap.headerId) {
      setError('No timesheet header found for this day. Open Timesheet Entry and sync attendance for that date/crew first.');
      return;
    }
    if (!gap.recaptureAllowed) {
      setError(gap.blockReason || 'Recapture is blocked for this day.');
      return;
    }
    const reason = recaptureReason.trim() || 'Omitted / incomplete day — reopen for recapture.';
    setRecaptureBusyId(gap.id);
    setError(null);
    setExportNotice(null);
    try {
      const res = await fetch('/api/hris/time-and-logs/timesheet-entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECAPTURE_REOPEN',
          headerId: gap.headerId,
          recaptureReason: reason,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to reopen timesheet for recapture');
      const message = json.data?.recapture?.message || 'Timesheet returned for recapture.';
      const entryUrl = json.data?.recapture?.entryUrl as string | undefined;
      setExportNotice(message);
      await load();
      if (entryUrl && window.confirm(`${message}\n\nOpen Timesheet Entry now?`)) {
        window.location.href = entryUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reopen timesheet for recapture');
    } finally {
      setRecaptureBusyId(null);
    }
  };

  const exportRows = async (format: 'csv' | 'excel' | 'payroll-sheet' | 'pdf' | 'print') => {
    if (format === 'print' || format === 'pdf') {
      window.print();
      return;
    }

    if (format !== 'payroll-sheet' && !activeExportColumns.length) {
      setExportNotice(null);
      setError('Select at least one column before exporting.');
      setShowColumnPicker(true);
      setShowExportMenu(false);
      return;
    }

    setExporting(true);
    setExportNotice(null);
    setError(null);
    setShowExportMenu(false);
    try {
      const exportUrl = new URL(requestUrl, window.location.origin);
      exportUrl.searchParams.set('exportMode', 'full');
      exportUrl.searchParams.set('format', format === 'payroll-sheet' ? 'excel' : format);
      const res = await fetch(exportUrl.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to export timesheet capture data');

      const exportPayload = json.data as ReportsPayload;
      const canViewCosts = exportPayload.permissions?.canViewCosts ?? payload?.permissions.canViewCosts ?? false;

      if (format === 'payroll-sheet') {
        const sheetRows = exportPayload.payrollAttendanceSheet || [];
        if (!sheetRows.length) {
          setExportNotice('No employee attendance rows matched the selected filters/period.');
          return;
        }
        downloadExcelFile({
          title: 'Payroll Attendance Sheet',
          subtitle: `${from} to ${to} · ${sheetRows.length.toLocaleString()} employees · week days, leave, weekend/PH hours, OT, night & site`,
          sheetName: 'Attendance Sheet',
          fileName: `payroll-attendance-sheet-${from}-to-${to}.xls`,
          columns: [...PAYROLL_ATTENDANCE_SHEET_COLUMNS],
          rows: payrollAttendanceSheetToExcelRows(sheetRows, canViewCosts),
        });
        setExportNotice(`Exported payroll attendance sheet for ${sheetRows.length.toLocaleString()} employees.`);
        return;
      }

      const rows = exportPayload.detailRows || [];
      const columns = activeExportColumns;

      const cellValue = (row: DetailRow, key: ExportColumnKey) => {
        if (key === '_payrollReady') return row.payrollReady ? 'Yes' : 'No';
        if ((key === 'labourCostNgn' || key === 'labourRateNgn') && !canViewCosts) return 'Restricted';
        return row[key as keyof DetailRow] as string | number | null | undefined;
      };

      if (!rows.length) {
        setExportNotice('No timesheet capture rows matched the selected filters/period.');
        return;
      }

      if (format === 'excel') {
        downloadExcelFile({
          title: `Timesheet Capture Export`,
          subtitle: `${from} to ${to} · ${rows.length.toLocaleString()} capture lines · ${columns.length} columns`,
          sheetName: 'Timesheet Capture',
          fileName: `timesheet-capture-${from}-to-${to}.xls`,
          columns: columns.map((column) => column.label),
          rows: rows.map((row) => columns.map((column) => cellValue(row, column.key))),
        });
        setExportNotice(`Exported ${rows.length.toLocaleString()} lines · ${columns.length} columns to Excel.`);
        setShowColumnPicker(false);
        return;
      }

      const csv = [
        columns.map((column) => csvValue(column.label)).join(','),
        ...rows.map((row) => columns.map((column) => csvValue(cellValue(row, column.key))).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timesheet-capture-${from}-to-${to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportNotice(`Exported ${rows.length.toLocaleString()} lines · ${columns.length} columns to CSV.`);
      setShowColumnPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export timesheet capture data');
    } finally {
      setExporting(false);
    }
  };

  const filterOptions = payload?.filterOptions;
  const summary = payload?.summary;
  const activeReport = reportTypes.find((item) => item.id === reportType) || reportTypes[0];
  const money = (value: number) => payload?.permissions.canViewCosts ? formatMoney(value) : 'Restricted';
  const periodNameById = new Map((filterOptions?.periods || []).map((period) => [period.id, period.name]));
  const activeFilterItems = [
    ...periods.map((id) => ({ group: 'Period', value: periodNameById.get(id) || id })),
    ...statuses.map((value) => ({ group: 'Status', value })),
    ...projects.map((value) => ({ group: 'Project', value })),
    ...departments.map((value) => ({ group: 'Department', value })),
    ...projectManagers.map((value) => ({ group: 'Project Manager', value })),
    ...supervisors.map((value) => ({ group: 'Supervisor', value })),
    ...costCentres.map((value) => ({ group: 'Cost Centre', value })),
    ...locations.map((value) => ({ group: 'Location', value })),
    ...workCenters.map((value) => ({ group: 'Work Center', value })),
    ...employmentTypes.map((value) => ({ group: 'Employment Type', value })),
    ...employeeCategories.map((value) => ({ group: 'Employee Category', value })),
    ...(payrollReady !== 'all' ? [{ group: 'Payroll', value: payrollReady === 'yes' ? 'Payroll Ready' : 'Not Payroll Ready' }] : []),
  ];
  const clearAllFilters = () => {
    setQuery('');
    setPayrollReady('all');
    setStatuses([]);
    setSupervisors([]);
    setWorkCenters([]);
    setPeriods([]);
    setProjects([]);
    setDepartments([]);
    setLocations([]);
    setProjectManagers([]);
    setCostCentres([]);
    setEmploymentTypes([]);
    setEmployeeCategories([]);
    setDrilldown(null);
    setKpiDetail(null);
  };
  const drilldownRows = drilldown ? (payload?.detailRows || []).filter((row) => {
    const value =
      drilldown.groupBy === 'project' || drilldown.groupBy === 'projectCost' || drilldown.groupBy === 'projectResource' ? `${row.projectCode} - ${row.projectName}` :
      drilldown.groupBy === 'department' ? row.department :
      drilldown.groupBy === 'employee' ? `${row.employeeNo} - ${row.employeeName}` :
      drilldown.groupBy === 'supervisor' ? row.supervisorName :
      drilldown.groupBy === 'date' ? row.timesheetDate :
      drilldown.groupBy === 'period' ? row.periodName :
      drilldown.groupBy === 'status' || drilldown.groupBy === 'approvalStatus' ? row.normalizedStatus :
      drilldown.groupBy === 'workCenter' ? row.workCenterName :
      drilldown.groupBy === 'location' ? row.location :
      drilldown.groupBy === 'costCentre' ? row.costCentre :
      drilldown.groupBy === 'projectManager' ? row.projectManager :
      drilldown.groupBy === 'exception' ? row.exceptionType :
      row.businessUnit;
    return value === drilldown.key;
  }) : [];
  const totalHours = summary?.totalHoursWorked || 0;
  const payrollReadyPct = ratioPct(summary?.payrollReadyHours || 0, summary?.productiveHours || 0);
  const overtimePct = ratioPct(summary?.overtimeHours || 0, totalHours);
  const nonProductivePct = ratioPct(summary?.nonProductiveHours || 0, totalHours);
  const allocatedCostPct = ratioPct(summary?.projectCostAllocation || 0, summary?.labourCost || 0);
  const topDepartments = payload?.breakdowns.department.slice(0, 10) || [];
  const topProjects = payload?.breakdowns.project.slice(0, 10) || [];
  const approvalBreakdown = payload?.breakdowns.status.slice(0, 6) || [];
  const exceptionBreakdown = payload?.breakdowns.exception.slice(0, 5) || [];
  const activeTab = workspaceTabs.find((tab) => tab.reportType === reportType)?.id || 'overview';
  const projectHours = topProjects.reduce((sum, row) => sum + row.productiveHours, 0);
  const rejectedHours = (payload?.detailRows || []).filter((row) => ['Rejected', 'Returned'].includes(row.normalizedStatus)).reduce((sum, row) => sum + row.productiveHours, 0);
  const pendingHours = Math.max(0, (summary?.productiveHours || 0) - (summary?.payrollReadyHours || 0) - rejectedHours);
  const allocationDay = (payload?.detailRows || [])[0]?.timesheetDate || today;
  const employeeAllocationRows = Array.from((payload?.detailRows || [])
    .filter((row) => row.timesheetDate === allocationDay)
    .reduce((map, row) => {
      const key = `${row.employeeNo}-${row.employeeName}`;
      const current = map.get(key) || { employeeNo: row.employeeNo, employeeName: row.employeeName, projects: new Map<string, number>(), total: 0 };
      current.projects.set(row.projectCode, (current.projects.get(row.projectCode) || 0) + row.productiveHours);
      current.total += row.productiveHours;
      map.set(key, current);
      return map;
    }, new Map<string, { employeeNo: string; employeeName: string; projects: Map<string, number>; total: number }>()).values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const pendingApprovalRows = [
    { stage: 'Supervisor Approval', count: approvalBreakdown.find((row) => row.label === 'Submitted')?.timesheets || 0, hours: approvalBreakdown.find((row) => row.label === 'Submitted')?.productiveHours || 0, cost: approvalBreakdown.find((row) => row.label === 'Submitted')?.labourCost || 0 },
    { stage: 'Project Manager Approval', count: approvalBreakdown.find((row) => row.label === 'Supervisor_Reviewed')?.timesheets || 0, hours: approvalBreakdown.find((row) => row.label === 'Supervisor_Reviewed')?.productiveHours || 0, cost: approvalBreakdown.find((row) => row.label === 'Supervisor_Reviewed')?.labourCost || 0 },
    { stage: 'Cost Control Review', count: approvalBreakdown.find((row) => row.label === 'Project_Manager_Reviewed')?.timesheets || 0, hours: approvalBreakdown.find((row) => row.label === 'Project_Manager_Reviewed')?.productiveHours || 0, cost: approvalBreakdown.find((row) => row.label === 'Project_Manager_Reviewed')?.labourCost || 0 },
    { stage: 'GM Operations Approval', count: approvalBreakdown.find((row) => row.label === 'Cost_Control_Reviewed')?.timesheets || 0, hours: approvalBreakdown.find((row) => row.label === 'Cost_Control_Reviewed')?.productiveHours || 0, cost: approvalBreakdown.find((row) => row.label === 'Cost_Control_Reviewed')?.labourCost || 0 },
    { stage: 'HR Approval', count: approvalBreakdown.find((row) => row.label === 'GM_Operations_Reviewed')?.timesheets || 0, hours: approvalBreakdown.find((row) => row.label === 'GM_Operations_Reviewed')?.productiveHours || 0, cost: approvalBreakdown.find((row) => row.label === 'GM_Operations_Reviewed')?.labourCost || 0 },
  ];
  const recentRows = (payload?.detailRows || []).slice(0, 10);
  const kpiDetailRows = (payload?.detailRows || []).filter((row) => {
    if (!kpiDetail) return false;
    if (kpiDetail.kind === 'project') return row.projectCode && row.projectCode !== 'No Project';
    if (kpiDetail.kind === 'overtime') return row.overtimeHours > 0;
    if (kpiDetail.kind === 'labour-cost') return row.labourCostNgn > 0;
    if (kpiDetail.kind === 'payroll-ready') return row.payrollReady;
    if (kpiDetail.kind === 'pending') return !row.payrollReady && !['Rejected', 'Returned'].includes(row.normalizedStatus);
    if (kpiDetail.kind === 'exceptions') return row.exceptionType !== 'None';
    return true;
  }).slice(0, 50);

  return (
    <PageTemplate
      title="Timesheet Reports"
      description="Project labour intelligence and timesheet analytics."
      breadcrumbs={[{ label: 'HRIS', href: '/hris' }, { label: 'Workforce Management', href: '/hris/workforce-management' }, { label: 'Timesheet Reports' }]}
      primaryAction={{ label: loading ? 'Refreshing' : 'Refresh', onClick: load, icon: RefreshCcw }}
      secondaryAction={{ label: exporting ? 'Exporting…' : 'Export', onClick: () => { void exportRows('payroll-sheet'); }, icon: Download }}
    >
      <div className="space-y-5">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
        {exportNotice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{exportNotice}</div> : null}
        {payload?.detailRowsTruncated ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Screen preview shows up to 1,000 detail lines for performance.
            {' '}
            <span className="font-semibold">Export</span> includes the payroll attendance sheet (Emp. Code / Days Worked layout) and optional capture detail for the selected period
            {typeof payload.detailRowCount === 'number' ? ` (${payload.detailRowCount.toLocaleString()} lines)` : ''}
            .
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4">
            <div className="flex min-h-14 gap-1 overflow-x-auto">
              {workspaceTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => { setReportType(tab.reportType); setDrilldown(null); }} className={`relative min-h-14 px-4 text-xs font-black transition ${active ? 'text-blue-700' : 'text-slate-600 hover:text-slate-950'}`}>
                    {tab.label}
                    {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue-600" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 py-3">
              <button
                type="button"
                onClick={() => setShowColumnPicker((value) => !value)}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-black hover:bg-slate-50 ${showColumnPicker ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                <Columns3 className="h-4 w-4" />
                Columns ({activeExportColumns.length})
              </button>
              <div className="relative">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => setShowExportMenu((value) => !value)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Download className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
                  {exporting ? 'Exporting…' : 'Export'}
                  <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>
                {showExportMenu ? (
                  <>
                    <button type="button" aria-label="Close export menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setShowExportMenu(false)} />
                    <div className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={() => void exportRows('payroll-sheet')}
                        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60"
                      >
                        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                        <span>
                          <span className="block text-xs font-black text-slate-900">Payroll Attendance Sheet</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">Emp. Code · Days Worked · Weekend/PH · OT · Night · Site</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={() => void exportRows('excel')}
                        className="flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Download className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                        <span>
                          <span className="block text-xs font-black text-slate-900">Capture Detail (Excel)</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">Selected columns · line/allocation grain</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={() => void exportRows('csv')}
                        className="flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                        <span>
                          <span className="block text-xs font-black text-slate-900">Capture Detail (CSV)</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">Selected columns · line/allocation grain</span>
                        </span>
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
              <button type="button" onClick={() => void exportRows('pdf')} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><CalendarDays className="h-4 w-4" />Schedule Report</button>
              <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
            </div>
          </div>
          {showColumnPicker ? (
            <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Export Columns</p>
                  <p className="text-sm font-bold text-slate-800">
                    {activeExportColumns.length} of {ALL_EXPORT_COLUMNS.length} selected · Excel/CSV uses only these columns
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSelectedExportColumns(DEFAULT_EXPORT_COLUMN_KEYS)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">Essential</button>
                  <button type="button" onClick={() => setSelectedExportColumns(ALL_EXPORT_COLUMNS.map((column) => column.key))} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">Select all</button>
                  <button type="button" onClick={() => setSelectedExportColumns([])} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">Clear</button>
                  <button type="button" disabled={exporting || !activeExportColumns.length} onClick={() => void exportRows('excel')} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60">
                    {exporting ? 'Exporting…' : 'Export Excel'}
                  </button>
                  <button type="button" onClick={() => setShowColumnPicker(false)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">Done</button>
                </div>
              </div>
              <label className="relative mt-3 block max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={columnSearch}
                  onChange={(event) => setColumnSearch(event.target.value)}
                  placeholder="Search columns…"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"
                />
              </label>
              <div className="mt-4 grid max-h-[420px] gap-3 overflow-y-auto xl:grid-cols-2 2xl:grid-cols-3">
                {filteredExportGroups.map((group) => {
                  const selectedInGroup = group.columns.filter((column) => selectedExportColumnSet.has(column.key)).length;
                  const allSelected = selectedInGroup === group.columns.length;
                  return (
                    <div key={group.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div>
                          <p className="text-xs font-black text-slate-900">{group.label}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{selectedInGroup}/{group.columns.length}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleExportGroup(group, !allSelected)}
                          className="rounded border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-50"
                        >
                          {allSelected ? 'Deselect' : 'Select'}
                        </button>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {group.columns.map((column) => {
                          const checked = selectedExportColumnSet.has(column.key);
                          return (
                            <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleExportColumn(column.key)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                              />
                              <span className="text-xs font-bold text-slate-700">{column.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!filteredExportGroups.length ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400 xl:col-span-2 2xl:col-span-3">
                    No columns match “{columnSearch}”.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_auto]">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date Range</span>
              <span className="mt-1 grid grid-cols-2 gap-1">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 min-w-0 rounded-md border border-slate-200 px-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 min-w-0 rounded-md border border-slate-200 px-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600" />
              </span>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payroll Period</span>
              <select value={periods[0] || ''} onChange={(e) => setPeriods(e.target.value ? [e.target.value] : [])} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600">
                <option value="">All Periods</option>
                {(filterOptions?.periods || []).map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Project</span>
              <select value={projects[0] || ''} onChange={(e) => setProjects(e.target.value ? [e.target.value] : [])} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"><option value="">All Projects</option>{(filterOptions?.projects || []).map((item) => <option key={item} value={item}>{normalizeDimensionLabel(item)}</option>)}</select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Project Manager</span>
              <select value={projectManagers[0] || ''} onChange={(e) => setProjectManagers(e.target.value ? [e.target.value] : [])} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"><option value="">All</option>{(filterOptions?.projectManagers || []).map((item) => <option key={item} value={item}>{normalizeDimensionLabel(item)}</option>)}</select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Department</span>
              <select value={departments[0] || ''} onChange={(e) => setDepartments(e.target.value ? [e.target.value] : [])} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"><option value="">All Departments</option>{(filterOptions?.departments || []).map((item) => <option key={item} value={item}>{normalizeDimensionLabel(item)}</option>)}</select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cost Center</span>
              <select value={costCentres[0] || ''} onChange={(e) => setCostCentres(e.target.value ? [e.target.value] : [])} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"><option value="">All</option>{(filterOptions?.costCentres || []).map((item) => <option key={item} value={item}>{normalizeDimensionLabel(item)}</option>)}</select>
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</span>
              <select value={statuses[0] || ''} onChange={(e) => setStatuses(e.target.value ? [e.target.value] : [])} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"><option value="">All Status</option>{(filterOptions?.statuses || []).map((item) => <option key={item} value={item}>{formatStatus(item)}</option>)}</select>
            </label>
            <button type="button" onClick={() => setShowAdvancedFilters((value) => !value)} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><Filter className="h-4 w-4" />More Filters</button>
          </div>

          {showAdvancedFilters ? <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee, project, PM, department, location, status..." className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-600" />
            </label>
            <select value={payrollReady} onChange={(e) => setPayrollReady(e.target.value as 'all' | 'yes' | 'no')} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-600">
              <option value="all">All payroll states</option>
              <option value="yes">Payroll-ready only</option>
              <option value="no">Not payroll-ready</option>
            </select>
            <button type="button" onClick={clearAllFilters} disabled={!activeFilterItems.length && !query} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-900 px-3 text-xs font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">Clear All</button>
          </div> : null}

          {activeFilterItems.length ? (
            <div className="mt-4 flex flex-wrap gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
              {activeFilterItems.slice(0, 12).map((item) => (
                <span key={`${item.group}-${item.value}`} className="rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-black text-blue-800">
                  {item.group}: {normalizeDimensionLabel(item.value)}
                </span>
              ))}
              {activeFilterItems.length > 12 ? <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-black text-blue-800">+{activeFilterItems.length - 12} more</span> : null}
            </div>
          ) : null}

          {showAdvancedFilters ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Advanced Filters</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Use these for role, location, cost, employment, and workforce dimension analysis.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <MultiSelect label="Periods" values={(filterOptions?.periods || []).map((period) => period.name)} selected={periods.map((id) => filterOptions?.periods.find((period) => period.id === id)?.name || id)} onChange={(nextNames) => setPeriods(nextNames.map((name) => filterOptions?.periods.find((period) => period.name === name)?.id || name))} compact />
                <MultiSelect label="Statuses" values={filterOptions?.statuses || []} selected={statuses} onChange={setStatuses} compact />
                <MultiSelect label="Projects" values={filterOptions?.projects || []} selected={projects} onChange={setProjects} compact />
                <MultiSelect label="Departments" values={filterOptions?.departments || []} selected={departments} onChange={setDepartments} compact />
                <MultiSelect label="Project Managers" values={filterOptions?.projectManagers || []} selected={projectManagers} onChange={setProjectManagers} compact />
                <MultiSelect label="Supervisors" values={filterOptions?.supervisors || []} selected={supervisors} onChange={setSupervisors} compact />
                <MultiSelect label="Cost Centres" values={filterOptions?.costCentres || []} selected={costCentres} onChange={setCostCentres} compact />
                <MultiSelect label="Locations" values={filterOptions?.locations || []} selected={locations} onChange={setLocations} compact />
                <MultiSelect label="Work Centers" values={filterOptions?.workCenters || []} selected={workCenters} onChange={setWorkCenters} compact />
                <MultiSelect label="Employment Type" values={filterOptions?.employmentTypes || []} selected={employmentTypes} onChange={setEmploymentTypes} compact />
                <MultiSelect label="Employee Category" values={filterOptions?.employeeCategories || []} selected={employeeCategories} onChange={setEmployeeCategories} compact />
              </div>
            </div>
          ) : null}
        </div>

        <section className="rounded-lg border border-amber-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-50 p-2 text-amber-700"><BookOpen className="h-4 w-4" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Standard Recapture</p>
                <h2 className="text-sm font-black text-slate-950">{payload?.recaptureGuide?.title || TIMESHEET_RECAPTURE_GUIDE.title}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-600">{payload?.recaptureGuide?.summary || TIMESHEET_RECAPTURE_GUIDE.summary}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowRecaptureGuide((value) => !value)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50">
                {showRecaptureGuide ? 'Hide guide' : 'Show guide'}
              </button>
              <button type="button" onClick={() => setShowMissingDays((value) => !value)} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 hover:bg-amber-100">
                Missing days ({payload?.missingDayCount ?? payload?.missingDays?.length ?? 0})
              </button>
            </div>
          </div>

          {showRecaptureGuide ? (
            <div className="grid gap-4 border-b border-amber-50 px-4 py-4 lg:grid-cols-[1.4fr_1fr]">
              <ol className="space-y-3">
                {(payload?.recaptureGuide?.steps || TIMESHEET_RECAPTURE_GUIDE.steps).map((step) => (
                  <li key={step.title} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-black text-slate-900">{step.title}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{step.detail}</p>
                  </li>
                ))}
              </ol>
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rules</p>
                <ul className="mt-2 space-y-2">
                  {(payload?.recaptureGuide?.rules || TIMESHEET_RECAPTURE_GUIDE.rules).map((rule) => (
                    <li key={rule} className="flex gap-2 text-xs font-semibold text-slate-600">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {showMissingDays ? (
            <div className="px-4 py-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Missing / Incomplete Days</p>
                  <p className="text-xs font-semibold text-slate-600">
                    Employees already active in this range with Mon–Sat dates that have no payable day. Reopen returns the sheet for correction; then capture and re-submit.
                  </p>
                </div>
                <label className="block min-w-[280px]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recapture reason</span>
                  <input
                    value={recaptureReason}
                    onChange={(event) => setRecaptureReason(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"
                    placeholder="Why is this day being recaptured?"
                  />
                </label>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-[1100px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Issue</th>
                      <th className="px-3 py-2">Sheet Status</th>
                      <th className="px-3 py-2">Crew</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(payload?.missingDays || []).slice(0, 100).map((gap) => (
                      <tr key={gap.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <div className="font-black text-slate-900">{gap.employeeName}</div>
                          <div className="text-[11px] font-bold text-slate-500">{gap.employeeNo}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-bold">{gap.date}</div>
                          <div className="text-[11px] font-semibold text-slate-500">{gap.weekday}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-md px-2 py-1 text-[10px] font-black ${
                            gap.reason === 'needs-reopen' ? 'bg-amber-50 text-amber-800'
                              : gap.reason === 'editable-incomplete' ? 'bg-blue-50 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}>
                            {gap.reason === 'needs-reopen' ? 'Needs reopen' : gap.reason === 'editable-incomplete' ? 'Editable incomplete' : 'No entry'}
                          </span>
                          {!gap.recaptureAllowed && gap.blockReason ? (
                            <div className="mt-1 max-w-[280px] text-[11px] font-semibold text-red-600">{gap.blockReason}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-700">{gap.headerStatus ? formatStatus(gap.headerStatus) : '—'}</td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-800">{gap.supervisorName || '—'}</div>
                          <div className="text-[11px] font-semibold text-slate-500">{gap.workCenterName || 'No work centre'}</div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            {gap.suggestedAction === 'reopen' ? (
                              <button
                                type="button"
                                disabled={!gap.recaptureAllowed || recaptureBusyId === gap.id || !gap.headerId}
                                onClick={() => void reopenForRecapture(gap)}
                                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                              >
                                {recaptureBusyId === gap.id ? 'Reopening…' : 'Recapture reopen'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={gap.suggestedAction === 'blocked' && !gap.headerId}
                              onClick={() => openTimesheetEntry(gap)}
                              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {gap.suggestedAction === 'continue-edit' ? 'Continue edit' : gap.suggestedAction === 'open-draft' ? 'Open entry' : 'Open entry'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && !(payload?.missingDays || []).length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-sm font-bold text-slate-400">
                          No missing Mon–Sat days detected for employees active in this range.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {(payload?.missingDayCount || 0) > 100 ? (
                <p className="mt-2 text-xs font-semibold text-slate-500">Showing first 100 of {payload?.missingDayCount} gaps. Narrow the date range to focus.</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <DashboardKpi label="Total Labour Hours" value={formatHours(summary?.totalHoursWorked || 0)} detail={`${pctText(summary?.resourceUtilizationPct || 0)} utilization`} icon={Clock} tone="blue" onClick={() => setKpiDetail({ title: 'Total Labour Hours Detail', kind: 'total' })} />
          <DashboardKpi label="Project Hours" value={formatHours(projectHours || summary?.productiveHours || 0)} detail={`${pctText(ratioPct(projectHours || summary?.productiveHours || 0, summary?.productiveHours || 0))} project allocation`} icon={BriefcaseBusiness} tone="green" onClick={() => setKpiDetail({ title: 'Project Hours Detail', kind: 'project' })} />
          <DashboardKpi label="Employees Utilized" value={formatNumber(summary?.employees || 0)} detail={`${formatNumber(summary?.records || 0)} allocation lines`} icon={Users} tone="violet" onClick={() => setKpiDetail({ title: 'Employees Utilized Detail', kind: 'employees' })} />
          <DashboardKpi label="Overtime Hours" value={formatHours(summary?.overtimeHours || 0)} detail={`${pctText(overtimePct)} of total hours`} icon={Clock} tone="amber" onClick={() => setKpiDetail({ title: 'Overtime Hours Detail', kind: 'overtime' })} />
          <DashboardKpi label="Labour Cost" value={money(summary?.labourCost || 0)} detail={`${pctText(allocatedCostPct)} allocated`} icon={Landmark} tone="teal" onClick={() => setKpiDetail({ title: 'Labour Cost Detail', kind: 'labour-cost' })} />
          <DashboardKpi label="Payroll Ready Hours" value={formatHours(summary?.payrollReadyHours || 0)} detail={`${pctText(payrollReadyPct)} ready`} icon={FileText} tone="blue" onClick={() => setKpiDetail({ title: 'Payroll Ready Hours Detail', kind: 'payroll-ready' })} />
          <DashboardKpi label="Pending Approvals" value={formatNumber(summary?.pendingApprovals || 0)} detail={`${formatHours(pendingHours)} pending`} icon={Hourglass} tone="amber" onClick={() => setKpiDetail({ title: 'Pending Approvals Detail', kind: 'pending' })} />
          <DashboardKpi label="Exceptions" value={formatNumber(summary?.exceptionRows || 0)} detail={`${formatNumber(summary?.missingTimesheets || 0)} attendance gaps`} icon={AlertTriangle} tone="red" onClick={() => setKpiDetail({ title: 'Exceptions Detail', kind: 'exceptions' })} />
        </div>

        {kpiDetail ? (
          <section className="rounded-lg border border-blue-200 bg-blue-50/30 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">KPI Drill-Down</p>
                <h2 className="text-sm font-black text-slate-950">{kpiDetail.title}</h2>
              </div>
              <button type="button" onClick={() => setKpiDetail(null)} className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700">Close</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-white/70 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Project</th><th className="px-4 py-3 text-right">Hours</th><th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Exception</th></tr>
                </thead>
                <tbody className="divide-y divide-blue-100 bg-white">
                  {kpiDetailRows.map((row) => (
                    <tr key={`${kpiDetail.kind}-${row.allocationId}`} className="hover:bg-blue-50/50">
                      <td className="px-4 py-3"><div className="font-black text-slate-900">{row.employeeName}</div><div className="text-[11px] font-bold text-slate-500">{row.employeeNo}</div></td>
                      <td className="px-4 py-3 font-bold">{row.timesheetDate}</td>
                      <td className="px-4 py-3 font-bold">{row.department}</td>
                      <td className="px-4 py-3 font-bold text-blue-800">{row.projectCode}</td>
                      <td className="px-4 py-3 text-right font-black">{formatHours(row.productiveHours)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatHours(row.overtimeHours)}</td>
                      <td className="px-4 py-3 text-right font-bold">{money(row.labourCostNgn)}</td>
                      <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-black ${statusClass(row.normalizedStatus)}`}>{formatStatus(row.normalizedStatus)}</span></td>
                      <td className="px-4 py-3 font-bold text-red-700">{row.exceptionType}</td>
                    </tr>
                  ))}
                  {!kpiDetailRows.length ? <tr><td colSpan={9} className="px-4 py-8 text-center text-sm font-bold text-slate-400">No detail rows for this KPI.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.7fr_0.5fr]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">Top Projects By Labour Hours</h2>
              <button type="button" onClick={() => setReportType('project')} className="text-xs font-black text-blue-700">View all projects</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Project Code</th><th className="px-4 py-3">Project Name</th><th className="px-4 py-3">Hours</th><th className="px-4 py-3">Employees</th><th className="px-4 py-3">Labour Cost</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topProjects.map((row, index) => {
                    const [code, ...nameParts] = row.label.split(' - ');
                    const status = row.exceptionRows ? 'Attention' : row.pendingApprovals ? 'Pending' : 'Approved';
                    return (
                      <tr key={row.label} onClick={() => setDrilldown({ groupBy: 'project', key: row.drilldownKey })} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs font-black text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 font-black text-blue-800 underline-offset-2 hover:underline">{code}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{nameParts.join(' - ') || code}</td>
                        <td className="px-4 py-3 font-black">{formatHours(row.productiveHours)}</td>
                        <td className="px-4 py-3 font-bold">{formatNumber(row.employees)}</td>
                        <td className="px-4 py-3 font-bold">{money(row.labourCost)}</td>
                        <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-black ${status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{status}</span></td>
                      </tr>
                    );
                  })}
                  {!topProjects.length ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm font-bold text-slate-400">No project data available.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">Timesheet Approval Status</h2>
              <ChevronDown className="h-4 w-4 -rotate-90 text-slate-400" />
            </div>
            <DonutChart rows={approvalBreakdown} total={summary?.timesheets || 0} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-600">Payroll Readiness</h2>
            <PayrollReadinessGauge ready={summary?.payrollReadyHours || 0} pending={pendingHours} rejected={rejectedHours} />
          </section>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_0.95fr_0.95fr]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">Employee Project Allocation ({allocationDay})</h2>
              <button type="button" onClick={() => setReportType('employee-detail')} className="text-xs font-black text-blue-700">View all employees</button>
            </div>
            <div className="divide-y divide-slate-100">
              {employeeAllocationRows.map((row) => (
                <div key={`${row.employeeNo}-${row.employeeName}`} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{row.employeeName}</p>
                    <p className="text-[11px] font-bold text-slate-500">{row.employeeNo}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Array.from(row.projects.entries()).map(([code, hours]) => <span key={code} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-800">{code} ({formatHours(hours)})</span>)}
                    </div>
                  </div>
                  <div className="pt-1 text-right text-sm font-black text-slate-900">{formatHours(row.total)}</div>
                </div>
              ))}
              {!employeeAllocationRows.length ? <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">No allocation rows for the selected period.</div> : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">Pending Approvals By Stage</h2>
              <button type="button" onClick={() => setReportType('approval-status')} className="text-xs font-black text-blue-700">View approval inbox</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400"><tr><th className="px-4 py-3">Stage</th><th className="px-4 py-3 text-right">Count</th><th className="px-4 py-3 text-right">Hours</th><th className="px-4 py-3 text-right">Labour Cost</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingApprovalRows.map((row) => <tr key={row.stage}><td className="px-4 py-3 font-black text-slate-800">{row.stage}</td><td className="px-4 py-3 text-right font-bold">{formatNumber(row.count)}</td><td className="px-4 py-3 text-right font-bold">{formatHours(row.hours)}</td><td className="px-4 py-3 text-right font-bold">{money(row.cost)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">Exceptions Summary</h2>
              <button type="button" onClick={() => setReportType('exceptions')} className="text-xs font-black text-blue-700">View exceptions report</button>
            </div>
            <div className="divide-y divide-slate-100">
              {exceptionBreakdown.map((row) => <button key={row.label} type="button" onClick={() => setDrilldown({ groupBy: row.groupBy, key: row.drilldownKey })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"><span className="text-sm font-bold text-slate-700">{formatStatus(row.label)}</span><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">{formatNumber(row.records)}</span></button>)}
              {!exceptionBreakdown.length ? <div className="px-4 py-8 text-center text-sm font-bold text-emerald-600">No active exceptions.</div> : null}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">Recent Timesheet Entries</h2>
            <button type="button" onClick={() => setReportType('employee-detail')} className="text-xs font-black text-blue-700">View all timesheet entries</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3 text-right">Hours</th><th className="px-4 py-3 text-right">OT</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-center">Supervisor</th><th className="px-4 py-3 text-center">Project Manager</th><th className="px-4 py-3 text-center">Cost Control</th><th className="px-4 py-3 text-center">GM Ops</th><th className="px-4 py-3 text-center">HR</th><th className="px-4 py-3 text-center">Payroll</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-center">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRows.map((row) => {
                  const supervisorState = ['Supervisor_Reviewed', 'Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed', 'HR_Acknowledged', 'Locked'].includes(row.normalizedStatus) ? 'approved' : row.normalizedStatus === 'Submitted' ? 'pending' : row.normalizedStatus === 'Rejected' ? 'rejected' : 'none';
                  const pmState = ['Project_Manager_Reviewed', 'Cost_Control_Reviewed', 'GM_Operations_Reviewed', 'HR_Acknowledged', 'Locked'].includes(row.normalizedStatus) ? 'approved' : row.normalizedStatus === 'Supervisor_Reviewed' ? 'pending' : row.normalizedStatus === 'Rejected' ? 'rejected' : 'none';
                  const costState = ['Cost_Control_Reviewed', 'GM_Operations_Reviewed', 'HR_Acknowledged', 'Locked'].includes(row.normalizedStatus) ? 'approved' : row.normalizedStatus === 'Project_Manager_Reviewed' ? 'pending' : row.normalizedStatus === 'Rejected' ? 'rejected' : 'none';
                  const gmState = ['GM_Operations_Reviewed', 'HR_Acknowledged', 'Locked'].includes(row.normalizedStatus) ? 'approved' : row.normalizedStatus === 'Cost_Control_Reviewed' ? 'pending' : row.normalizedStatus === 'Rejected' ? 'rejected' : 'none';
                  const hrState = ['HR_Acknowledged', 'Locked'].includes(row.normalizedStatus) ? 'approved' : row.normalizedStatus === 'GM_Operations_Reviewed' ? 'pending' : row.normalizedStatus === 'Rejected' ? 'rejected' : 'none';
                  const payrollState = row.payrollReady ? 'approved' : ['HR_Acknowledged', 'Locked'].includes(row.normalizedStatus) ? 'pending' : row.normalizedStatus === 'Rejected' ? 'rejected' : 'none';
                  return (
                    <tr key={row.allocationId} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><div className="font-black text-slate-900">{row.employeeName}</div><div className="text-[11px] font-bold text-slate-500">{row.employeeNo}</div></td>
                      <td className="px-4 py-3 font-bold text-slate-700">{row.timesheetDate}</td>
                      <td className="px-4 py-3 font-bold text-blue-800">{row.projectCode} - {row.projectName}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{row.activityName}</td>
                      <td className="px-4 py-3 text-right font-black">{formatHours(row.productiveHours)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatHours(row.overtimeHours)}</td>
                      <td className="px-4 py-3 text-right font-black">{formatHours(row.totalHours)}</td>
                      <td className="px-4 py-3 text-center"><StatusMark state={supervisorState} /></td>
                      <td className="px-4 py-3 text-center"><StatusMark state={pmState} /></td>
                      <td className="px-4 py-3 text-center"><StatusMark state={costState} /></td>
                      <td className="px-4 py-3 text-center"><StatusMark state={gmState} /></td>
                      <td className="px-4 py-3 text-center"><StatusMark state={hrState} /></td>
                      <td className="px-4 py-3 text-center"><StatusMark state={payrollState} /></td>
                      <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-black ${statusClass(row.normalizedStatus)}`}>{formatStatus(row.normalizedStatus)}</span></td>
                      <td className="px-4 py-3 text-center"><button type="button" onClick={() => setDrilldown({ groupBy: 'employee', key: `${row.employeeNo} - ${row.employeeName}` })} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50"><Eye className="h-4 w-4" /></button></td>
                    </tr>
                  );
                })}
                {!recentRows.length ? <tr><td colSpan={15} className="px-4 py-8 text-center text-sm font-bold text-slate-400">No recent entries available.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
            <div className="flex flex-wrap gap-4"><span><StatusMark state="approved" /> Approved</span><span><StatusMark state="pending" /> Pending</span><span><StatusMark state="rejected" /> Rejected</span><span><StatusMark state="none" /> Not applicable</span></div>
            <span>Showing {formatNumber(recentRows.length)} of {formatNumber(payload?.detailRows.length || 0)} entries</span>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Executive Decision Brief</p>
                <h2 className="mt-1 text-base font-black text-slate-950">Management Readiness Snapshot</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Live indicators for payroll closure, project costing, utilization, approval bottlenecks, and exceptions.</p>
              </div>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{payload?.permissions.visibilityScope || 'restricted'} scope</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DecisionCard title="Payroll Readiness" value={pctText(payrollReadyPct)} detail={`${formatHours(summary?.payrollReadyHours || 0)} ready for payroll`} tone={qualityTone(payrollReadyPct)} />
              <DecisionCard title="Approval Risk" value={formatNumber(summary?.pendingApprovals || 0)} detail="timesheets still awaiting action" tone={(summary?.pendingApprovals || 0) ? 'amber' : 'green'} />
              <DecisionCard title="Exception Load" value={formatNumber(summary?.exceptionRows || 0)} detail={`${formatNumber(summary?.missingTimesheets || 0)} attendance gaps`} tone={exceptionTone(summary?.exceptionRows || 0)} />
              <DecisionCard title="Cost Allocation" value={pctText(allocatedCostPct)} detail={`${money(summary?.projectCostAllocation || 0)} assigned to projects`} tone={qualityTone(allocatedCostPct)} />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Hours Composition</h3>
                <VisualBar label="Productive hours" value={summary?.productiveHours || 0} total={totalHours} tone="green" trailing={formatHours(summary?.productiveHours || 0)} />
                <VisualBar label="Non-productive hours" value={summary?.nonProductiveHours || 0} total={totalHours} tone="amber" trailing={`${formatHours(summary?.nonProductiveHours || 0)} (${pctText(nonProductivePct)})`} />
                <VisualBar label="Overtime hours" value={summary?.overtimeHours || 0} total={totalHours} tone="red" trailing={`${formatHours(summary?.overtimeHours || 0)} (${pctText(overtimePct)})`} />
              </div>
              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Approval And Quality</h3>
                <VisualBar label="Compliance rate" value={summary?.complianceRate || 0} total={100} tone={qualityTone(summary?.complianceRate || 0)} trailing={pctText(summary?.complianceRate || 0)} />
                <VisualBar label="Payroll-ready productive hours" value={summary?.payrollReadyHours || 0} total={summary?.productiveHours || 0} tone="green" trailing={pctText(payrollReadyPct)} />
                <VisualBar label="Allocated labour cost" value={summary?.projectCostAllocation || 0} total={summary?.labourCost || 0} tone="blue" trailing={pctText(allocatedCostPct)} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="border-b border-slate-100 pb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Visual Analysis</p>
              <h2 className="mt-1 text-base font-black text-slate-950">Top Drivers For Management Review</h2>
            </div>
            <div className="mt-4 space-y-5">
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Top Departments By Productive Hours</h3>
                {topDepartments.map((row) => <VisualBar key={row.label} label={normalizeDimensionLabel(row.label)} value={row.productiveHours} total={topDepartments[0]?.productiveHours || 0} tone="blue" trailing={formatHours(row.productiveHours)} />)}
                {!topDepartments.length ? <p className="text-sm font-bold text-slate-400">No department data available.</p> : null}
              </div>
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Top Projects By Labour Cost</h3>
                {topProjects.map((row) => <VisualBar key={row.label} label={normalizeDimensionLabel(row.label)} value={row.labourCost} total={topProjects[0]?.labourCost || 0} tone="slate" trailing={money(row.labourCost)} />)}
                {!topProjects.length ? <p className="text-sm font-bold text-slate-400">No project data available.</p> : null}
              </div>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Approval Control Table</p>
              <h2 className="mt-1 text-sm font-black text-slate-950">Workflow Status Summary</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Timesheets</th>
                    <th className="px-4 py-3 text-right">Productive Hours</th>
                    <th className="px-4 py-3 text-right">Payroll Ready</th>
                    <th className="px-4 py-3 text-right">Exceptions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvalBreakdown.map((row) => (
                    <tr key={row.label} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(row.label)}`}>{formatStatus(row.label)}</span></td>
                      <td className="px-4 py-3 text-right font-bold">{formatNumber(row.timesheets)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatHours(row.productiveHours)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatHours(row.payrollReadyHours)}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{formatNumber(row.exceptionRows)}</td>
                    </tr>
                  ))}
                  {!approvalBreakdown.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-slate-400">No approval status data.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Exception Control Table</p>
              <h2 className="mt-1 text-sm font-black text-slate-950">Risk Categories Requiring Action</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Exception</th>
                    <th className="px-4 py-3 text-right">Rows</th>
                    <th className="px-4 py-3 text-right">Employees</th>
                    <th className="px-4 py-3 text-right">Hours Affected</th>
                    <th className="px-4 py-3 text-right">Cost Exposure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {exceptionBreakdown.map((row) => (
                    <tr key={row.label} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-black text-red-700">{formatStatus(row.label)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatNumber(row.records)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatNumber(row.employees)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatHours(row.totalHoursWorked)}</td>
                      <td className="px-4 py-3 text-right font-bold">{money(row.labourCost)}</td>
                    </tr>
                  ))}
                  {!exceptionBreakdown.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-emerald-600">No exception category is currently active.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-black text-slate-900">Interactive Report View</h2>
                <p className="text-xs font-semibold text-slate-500">{loading ? 'Refreshing report data...' : `Generated ${payload ? new Date(payload.generatedAt).toLocaleString() : '-'}`}</p>
              </div>
              <Filter className="h-4 w-4 text-slate-400" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Group / Line</th>
                    <th className="px-4 py-3 text-right">Records</th>
                    <th className="px-4 py-3 text-right">Employees</th>
                    <th className="px-4 py-3 text-right">Productive</th>
                    <th className="px-4 py-3 text-right">Non-Prod</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Compliance</th>
                    <th className="px-4 py-3 text-right">Exceptions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(payload?.reportRows || []).slice(0, 120).map((row, index) => {
                    if (isGroupedRow(row)) {
                      return (
                        <tr key={`${row.label}-${index}`} onClick={() => setDrilldown({ groupBy: row.groupBy, key: row.drilldownKey })} className="cursor-pointer hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => setDrilldown({ groupBy: row.groupBy, key: row.drilldownKey })} className="text-left font-black text-blue-800 hover:underline">{formatStatus(row.label)}</button>
                            <div className="text-[11px] font-semibold text-slate-500">Drill down by {row.groupBy}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold">{formatNumber(row.records)}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatNumber(row.employees)}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatHours(row.productiveHours)}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatHours(row.nonProductiveHours)}</td>
                          <td className="px-4 py-3 text-right font-bold">{money(row.labourCost)}</td>
                          <td className="px-4 py-3 text-right font-black">{formatNumber(row.complianceRate)}%</td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">{formatNumber(row.exceptionRows)}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.allocationId} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-black text-slate-900">{row.employeeName}</div>
                          <div className="text-xs font-bold text-slate-500">{row.employeeNo} / {row.projectCode} / {row.timesheetDate}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold">1</td>
                        <td className="px-4 py-3 text-right font-bold">1</td>
                        <td className="px-4 py-3 text-right font-bold">{formatHours(row.productiveHours)}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatHours(row.nonProductiveHours)}</td>
                        <td className="px-4 py-3 text-right font-bold">{money(row.labourCostNgn)}</td>
                        <td className="px-4 py-3 text-right font-black">{row.validationStatus === 'Valid' ? '100%' : '0%'}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">{row.exceptionType === 'None' ? 0 : 1}</td>
                      </tr>
                    );
                  })}
                  {!loading && !payload?.reportRows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">No report data matches the current filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-5">
            <Breakdown title="Approval Status" rows={payload?.breakdowns.status || []} onSelect={(row) => setDrilldown({ groupBy: row.groupBy, key: row.drilldownKey })} formatCost={money} />
            <Breakdown title="Top Projects" rows={payload?.breakdowns.project || []} onSelect={(row) => setDrilldown({ groupBy: row.groupBy, key: row.drilldownKey })} formatCost={money} />
            <Breakdown title="Exceptions" rows={payload?.breakdowns.exception || []} onSelect={(row) => setDrilldown({ groupBy: row.groupBy, key: row.drilldownKey })} formatCost={money} />
          </div>
        </div>

        {drilldown && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Drill-Down Analysis</p>
                <h3 className="text-base font-black text-slate-950">{formatStatus(drilldown.key)}</h3>
              </div>
              <button type="button" onClick={() => setDrilldown(null)} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700">Close</button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>{['Date', 'Employee', 'Department', 'Project', 'PM', 'Productive', 'Cost', 'Status', 'Exception'].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drilldownRows.slice(0, 100).map((row) => (
                    <tr key={row.allocationId}>
                      <td className="px-4 py-3 font-bold">{row.timesheetDate}</td>
                      <td className="px-4 py-3 font-black">{row.employeeName}</td>
                      <td className="px-4 py-3 font-bold">{row.department}</td>
                      <td className="px-4 py-3 font-bold">{row.projectCode}</td>
                      <td className="px-4 py-3 font-bold">{row.projectManager}</td>
                      <td className="px-4 py-3 font-bold">{formatHours(row.productiveHours)}</td>
                      <td className="px-4 py-3 font-bold">{money(row.labourCostNgn)}</td>
                      <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(row.normalizedStatus)}`}>{formatStatus(row.normalizedStatus)}</span></td>
                      <td className="px-4 py-3 font-bold text-red-700">{row.exceptionType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Panel title="Dashboard Widgets" icon={BarChart3}>
            {(payload?.widgets || []).map((widget) => (
              <div key={widget.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3"><span className="text-xs font-black text-slate-800">{widget.title}</span><span className="text-sm font-black text-blue-700">{widget.value}</span></div>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{widget.detail}</p>
              </div>
            ))}
          </Panel>
          <Panel title="Subscriptions & Distribution" icon={Mail}>
            {(payload?.subscriptions || []).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3"><span className="text-xs font-black text-slate-800">{item.name}</span><span className="text-[10px] font-black uppercase text-emerald-700">{item.status}</span></div>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{item.cadence} / {item.channels}</p>
              </div>
            ))}
          </Panel>
          <Panel title="Audit & Integration" icon={Bell}>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600">
              <p><span className="font-black text-slate-900">Generated By:</span> {payload?.audit.exportedBy || '-'}</p>
              <p className="mt-1"><span className="font-black text-slate-900">Source:</span> {payload?.audit.sourceModule || '-'}</p>
              <p className="mt-1"><span className="font-black text-slate-900">Scope:</span> {payload?.permissions.visibilityScope || '-'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(payload?.integrations || []).map((item) => <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600">{item}</span>)}
            </div>
          </Panel>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-black text-slate-900">Timesheet Line Detail</h2>
              <p className="text-xs font-semibold text-slate-500">Allocation-level detail with workflow, payroll, cost, and audit fields. Showing up to 1,000 rows.</p>
            </div>
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{formatNumber(payload?.detailRows.length || 0)} rows</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>{['Employee', 'Date / Period', 'Org', 'Project / Activity', 'Approval', 'Payroll', 'Days Worked', 'Hours', 'Cost', 'Exception', 'Audit'].map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(payload?.detailRows || []).map((row) => (
                  <tr key={row.allocationId} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="font-black text-slate-900">{row.employeeName}</div><div className="text-xs font-bold text-slate-500">{row.employeeNo} / {row.employmentType}</div></td>
                    <td className="px-4 py-3"><div className="font-bold">{row.timesheetDate}</div><div className="text-xs font-semibold text-slate-500">{row.periodName}</div></td>
                    <td className="px-4 py-3"><div className="font-bold">{row.department}</div><div className="text-xs font-semibold text-slate-500">{row.businessUnit} / {row.location}</div></td>
                    <td className="px-4 py-3"><div className="font-black text-blue-800">{row.projectCode}</div><div className="text-xs font-semibold text-slate-500">{row.activityCode} / {row.projectManager}</div></td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(row.normalizedStatus)}`}>{formatStatus(row.normalizedStatus)}</span><div className="mt-1 text-xs font-semibold text-slate-500">{row.projectManagerStatus} / {row.costControlStatus}</div></td>
                    <td className="px-4 py-3"><div className={row.payrollReady ? 'font-black text-emerald-700' : 'font-black text-slate-500'}>{row.payrollReady ? 'Ready' : 'Not Ready'}</div><div className="text-xs font-semibold text-slate-500">{row.overtimeStatus}</div></td>
                    <td className="px-4 py-3 text-right"><div className="font-black">{formatNumber(row.daysWorked || 0)}</div><div className="text-xs font-semibold text-slate-500">{row.dayWorked ? 'Worked today' : 'Not worked'}</div></td>
                    <td className="px-4 py-3 text-right"><div className="font-black">{formatHours(row.productiveHours)}</div><div className="text-xs font-semibold text-slate-500">Idle {formatHours(row.nonProductiveHours)} / OT {formatHours(row.overtimeHours)}</div></td>
                    <td className="px-4 py-3 text-right"><div className="font-black">{money(row.labourCostNgn)}</div><div className="text-xs font-semibold text-slate-500">@ {money(row.labourRateNgn)}</div></td>
                    <td className="px-4 py-3"><div className={row.exceptionType === 'None' ? 'font-black text-emerald-600' : 'font-black text-red-700'}>{row.exceptionType}</div><div className="text-xs font-semibold text-slate-500">{row.validationMessage || row.exceptionSeverity}</div></td>
                    <td className="px-4 py-3"><div className="max-w-[260px] truncate text-xs font-semibold text-slate-500" title={row.workflowHistory || row.auditTrail}>{row.workflowHistory || row.auditTrail}</div></td>
                  </tr>
                ))}
                {!loading && !payload?.detailRows.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm font-bold text-slate-400">No timesheet lines available for this report.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageTemplate>
  );
}

function Breakdown({ title, rows, onSelect, formatCost }: { title: string; rows: GroupedRow[]; onSelect: (row: GroupedRow) => void; formatCost: (value: number) => string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-black text-slate-900">{title}</h2></div>
      <div className="divide-y divide-slate-100">
        {rows.slice(0, 8).map((row) => (
          <button key={`${row.groupBy}-${row.label}`} type="button" onClick={() => onSelect(row)} className="block w-full px-4 py-3 text-left hover:bg-slate-50">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-black text-slate-800">{formatStatus(row.label)}</span>
              <span className="shrink-0 text-sm font-black text-slate-900">{formatHours(row.productiveHours)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
              <span>{formatNumber(row.records)} records</span>
              <span>{formatCost(row.labourCost)}</span>
            </div>
          </button>
        ))}
        {!rows.length && <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">No data</div>}
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BarChart3; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Icon className="h-4 w-4 text-blue-700" />
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}
