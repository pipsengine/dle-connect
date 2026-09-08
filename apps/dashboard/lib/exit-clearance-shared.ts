/**
 * Client-safe Exit Clearance types + helpers.
 * Do not import server/mssql modules from here.
 */

export type ClearanceLineStatus = 'Pending' | 'In Progress' | 'Cleared' | 'Blocked';

export type ExitClearanceCaseStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Blocked';

export type ExitClearanceLine = {
  id: string;
  label: string;
  owner: string;
  status: ClearanceLineStatus;
  note?: string | null;
  clearedAt?: string | null;
  clearedBy?: string | null;
};

export type ExitClearanceCase = {
  id: string;
  period: string;
  resignationId: string;
  resignationReference: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  position: string;
  managerName: string;
  resignationDate: string | null;
  lastWorkingDay: string | null;
  resignationStatus: string;
  status: ExitClearanceCaseStatus;
  completionPct: number;
  lines: ExitClearanceLine[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type OffboardingModuleKpi = {
  id: string;
  label: string;
  value: number;
  display: string;
  deltaLabel: string;
  tone: 'blue' | 'amber' | 'mint' | 'purple' | 'rose' | 'green';
};

export type ExitClearancePayload = {
  generatedAt: string;
  period: string;
  periodLabel: string;
  cases: ExitClearanceCase[];
  kpis: OffboardingModuleKpi[];
  tabCounts: Record<string, number>;
  selectedId: string | null;
  selected: ExitClearanceCase | null;
  filterOptions: {
    departments: string[];
    statuses: ExitClearanceCaseStatus[];
  };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatExitClearanceDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const exitClearancePct = (lines: ExitClearanceLine[]) => {
  if (!lines.length) return 0;
  const done = lines.filter((line) => line.status === 'Cleared').length;
  return Math.round((done / lines.length) * 100);
};

export const exitClearanceResignationHref = (row: Pick<ExitClearanceCase, 'resignationId' | 'period'>) =>
  `/hris/offboarding/resignation-management?id=${encodeURIComponent(row.resignationId)}&period=${encodeURIComponent(row.period)}`;

export const exitClearanceFinalPayrollHref = (row: Pick<ExitClearanceCase, 'employeeCode' | 'resignationId'>) => {
  const params = new URLSearchParams({
    employeeCode: row.employeeCode,
    resignationId: row.resignationId,
    fromResignation: '1',
    exitType: 'Resignation',
  });
  return `/hris/offboarding/final-payroll-processing/new-settlement?${params.toString()}`;
};

export const exitClearanceAssetHref = (row: Pick<ExitClearanceCase, 'employeeCode' | 'id'>) =>
  `/hris/offboarding/asset-return?employeeCode=${encodeURIComponent(row.employeeCode)}&clearanceId=${encodeURIComponent(row.id)}`;

export const DEFAULT_CLEARANCE_LINES: Omit<ExitClearanceLine, 'status' | 'clearedAt' | 'clearedBy'>[] = [
  { id: 'hr', label: 'HR Clearance', owner: 'HR' },
  { id: 'it', label: 'IT Clearance', owner: 'IT' },
  { id: 'finance', label: 'Finance Clearance', owner: 'Finance' },
  { id: 'admin', label: 'Administration', owner: 'Admin' },
  { id: 'access', label: 'Access Deactivation', owner: 'IT Security' },
];
