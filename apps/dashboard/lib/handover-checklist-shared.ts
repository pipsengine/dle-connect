/**
 * Client-safe Handover Checklist types + helpers.
 * Do not import server/mssql modules from here.
 */

export type HandoverItemStatus = 'Pending' | 'In Progress' | 'Completed';

export type HandoverCaseStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Blocked';

export type HandoverChecklistItem = {
  id: string;
  label: string;
  owner: string;
  status: HandoverItemStatus;
  note?: string | null;
};

export type HandoverCase = {
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
  status: HandoverCaseStatus;
  completionPct: number;
  items: HandoverChecklistItem[];
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

export type HandoverPayload = {
  generatedAt: string;
  period: string;
  periodLabel: string;
  cases: HandoverCase[];
  kpis: OffboardingModuleKpi[];
  tabCounts: Record<string, number>;
  selectedId: string | null;
  selected: HandoverCase | null;
  filterOptions: {
    departments: string[];
    statuses: HandoverCaseStatus[];
  };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatHandoverDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const handoverCompletionPct = (items: HandoverChecklistItem[]) => {
  if (!items.length) return 0;
  const done = items.filter((item) => item.status === 'Completed').length;
  return Math.round((done / items.length) * 100);
};

export const handoverResignationHref = (row: Pick<HandoverCase, 'resignationId' | 'period'>) =>
  `/hris/offboarding/resignation-management?id=${encodeURIComponent(row.resignationId)}&period=${encodeURIComponent(row.period)}`;

export const handoverClearanceHref = (row: Pick<HandoverCase, 'employeeCode' | 'id'>) =>
  `/hris/offboarding/exit-clearance?employeeCode=${encodeURIComponent(row.employeeCode)}&handoverId=${encodeURIComponent(row.id)}`;

export const DEFAULT_HANDOVER_ITEMS: Omit<HandoverChecklistItem, 'status'>[] = [
  { id: 'docs', label: 'Project & working documents transferred', owner: 'Line Manager' },
  { id: 'projects', label: 'Active projects reassigned', owner: 'Line Manager' },
  { id: 'knowledge', label: 'Knowledge transfer / shadowing complete', owner: 'Employee' },
  { id: 'credentials', label: 'System credentials & mailbox handover', owner: 'IT' },
  { id: 'clients', label: 'Client / stakeholder introductions', owner: 'Employee' },
  { id: 'signoff', label: 'Manager handover sign-off', owner: 'Line Manager' },
];
