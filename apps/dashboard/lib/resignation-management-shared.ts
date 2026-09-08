/**
 * Client-safe Resignation Management types + helpers.
 * Do not import server/mssql modules from here.
 */

export type ResignationStatus =
  | 'Draft'
  | 'Submitted'
  | 'Manager Review'
  | 'HR Review'
  | 'Serving Notice'
  | 'Handover'
  | 'Clearance'
  | 'Final Payroll'
  | 'Completed'
  | 'Cancelled'
  | 'Exception';

export type ResignationProgressItem = {
  id: string;
  label: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
};

export type ResignationWorkflowStage = {
  id: string;
  label: string;
  status: 'Pending' | 'In Review' | 'Completed';
  at?: string | null;
};

export type ResignationComment = {
  id: string;
  body: string;
  actor: string;
  createdAt: string;
};

export type ResignationRecord = {
  id: string;
  referenceNumber: string;
  period: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  position: string;
  employmentType: string;
  managerName: string;
  hrReviewer: string;
  workLocation: string;
  dateOfJoining: string | null;
  email: string;
  phone: string;
  alternativeEmail: string;
  address: string;
  resignationDate: string | null;
  lastWorkingDay: string | null;
  noticePeriodDays: number;
  noticeServedDays: number;
  reasonForLeaving: string;
  remarks: string;
  submissionChannel: string;
  submittedAt: string | null;
  status: ResignationStatus;
  clearancePct: number;
  finalPayrollStatus: 'Not Started' | 'Pending' | 'Approved' | 'Paid';
  managementAcceptance: 'Pending' | 'Accepted' | 'Rejected';
  managementAcceptedAt: string | null;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
  nextOfKinEmail: string;
  propertyAcknowledged: boolean;
  progress: ResignationProgressItem[];
  workflow: ResignationWorkflowStage[];
  comments: ResignationComment[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type ResignationKpi = {
  id: string;
  label: string;
  value: number;
  display: string;
  deltaLabel: string;
  tone: 'blue' | 'amber' | 'mint' | 'purple' | 'rose' | 'green';
};

export type ResignationPayload = {
  generatedAt: string;
  period: string;
  periodLabel: string;
  resignations: ResignationRecord[];
  kpis: ResignationKpi[];
  tabCounts: Record<string, number>;
  selectedId: string | null;
  selected: ResignationRecord | null;
  filterOptions: {
    departments: string[];
    managers: string[];
    statuses: ResignationStatus[];
  };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatResignationDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const periodLabelFromCode = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  return `${MONTHS[Number(match[2]) - 1] || match[2]} ${match[1]}`;
};

export const currentResignationPeriod = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export const previousResignationPeriod = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

export const noticeBalanceDays = (row: Pick<ResignationRecord, 'noticePeriodDays' | 'noticeServedDays'>) =>
  Math.max(0, Number(row.noticePeriodDays || 0) - Number(row.noticeServedDays || 0));

export const noticeStatusLabel = (row: Pick<ResignationRecord, 'noticePeriodDays' | 'noticeServedDays'>) => {
  const balance = noticeBalanceDays(row);
  if (row.noticePeriodDays <= 0) return 'Not Set';
  if (balance <= 0) return 'Fully Served';
  if (row.noticeServedDays <= 0) return 'Not Started';
  return 'In Progress';
};

export const formatNoticeMonths = (days: number) => {
  if (days <= 0) return '—';
  const months = Math.round((days / 30) * 10) / 10;
  if (months === 1) return '1 Month';
  if (Number.isInteger(months)) return `${months} Months`;
  return `${days} Days`;
};

export const resignationProfileHref = (row: Pick<ResignationRecord, 'employeeId' | 'employeeCode'>) =>
  `/hris/employees/employee-profile/${encodeURIComponent(row.employeeId || row.employeeCode)}`;

export const resignationFinalPayrollHref = (row: Pick<ResignationRecord, 'employeeId' | 'employeeCode'>) =>
  `/hris/offboarding/final-payroll-processing?employeeCode=${encodeURIComponent(row.employeeCode)}&employeeId=${encodeURIComponent(row.employeeId)}`;
