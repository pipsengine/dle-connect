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

export type ResignationEarningLine = {
  code: string;
  name: string;
  amount: number;
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
  grade: string;
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
  currency: 'NGN' | 'USD';
  basicSalary: number;
  grossMonthly: number;
  earningsBreakdown: ResignationEarningLine[];
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

export const formatResignationMoney = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  const symbol = currency === 'USD' ? '$' : '₦';
  return `${symbol}${Math.round(Number(amount) || 0).toLocaleString('en-NG')}`;
};

/** Stages where final settlement calculation is the next standard action. */
export const RESIGNATION_READY_FOR_FINAL_PAYROLL: ResignationStatus[] = [
  'Clearance',
  'Final Payroll',
  'Completed',
];

export const resignationReadyForFinalPayroll = (
  row: Pick<ResignationRecord, 'status'>,
) => RESIGNATION_READY_FOR_FINAL_PAYROLL.includes(row.status);

export const noticePeriodLabelFromDays = (days: number) => {
  if (days <= 0) return 'None';
  if (days === 30) return '1 Month';
  if (days === 60) return '2 Months';
  if (days === 90) return '3 Months';
  return `${days} Days`;
};

export const resignationProfileHref = (row: Pick<ResignationRecord, 'employeeId' | 'employeeCode'>) =>
  `/hris/employees/employee-profile/${encodeURIComponent(row.employeeId || row.employeeCode)}`;

export const resignationHandoverHref = (row: Pick<ResignationRecord, 'employeeCode' | 'id' | 'period'>) => {
  const params = new URLSearchParams({ employeeCode: row.employeeCode });
  if (row.period) params.set('period', row.period);
  return `/hris/offboarding/handover-checklist?${params.toString()}`;
};

export const resignationExitClearanceHref = (row: Pick<ResignationRecord, 'employeeCode' | 'period'>) => {
  const params = new URLSearchParams({ employeeCode: row.employeeCode });
  if (row.period) params.set('period', row.period);
  return `/hris/offboarding/exit-clearance?${params.toString()}`;
};

export const resignationAssetReturnHref = (row: Pick<ResignationRecord, 'employeeCode' | 'period'>) => {
  const params = new URLSearchParams({ employeeCode: row.employeeCode });
  if (row.period) params.set('period', row.period);
  return `/hris/offboarding/asset-return?${params.toString()}`;
};

/** Deep-link into Final Payroll New Settlement, prefilled from the resignation case. */
export const resignationFinalPayrollHref = (
  row: Pick<
    ResignationRecord,
    | 'employeeId'
    | 'employeeCode'
    | 'resignationDate'
    | 'lastWorkingDay'
    | 'noticePeriodDays'
    | 'reasonForLeaving'
    | 'remarks'
    | 'id'
    | 'status'
  >,
) => {
  const params = new URLSearchParams();
  params.set('employeeCode', row.employeeCode);
  if (row.employeeId) params.set('employeeId', row.employeeId);
  if (row.id) params.set('resignationId', row.id);
  if (row.resignationDate) params.set('resignationDate', row.resignationDate.slice(0, 10));
  if (row.lastWorkingDay) params.set('lastWorkingDay', row.lastWorkingDay.slice(0, 10));
  params.set('noticePeriod', noticePeriodLabelFromDays(Number(row.noticePeriodDays || 0)));
  if (row.reasonForLeaving) params.set('reasonForLeaving', row.reasonForLeaving);
  if (row.remarks) params.set('remarks', row.remarks);
  params.set('exitType', 'Resignation');
  params.set('fromResignation', '1');
  return `/hris/offboarding/final-payroll-processing/new-settlement?${params.toString()}`;
};
