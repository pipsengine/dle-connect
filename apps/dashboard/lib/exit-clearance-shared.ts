/**
 * Client-safe Exit Clearance types — digital CLEARANCE FORM (DL-HRD-F-030).
 * Do not import server/mssql modules from here.
 */

export const CLEARANCE_DOC_NO = 'DL-HRD-F-030';
export const CLEARANCE_DOC_REV = '02';
export const CLEARANCE_DOC_TITLE = 'CLEARANCE FORM';

/** Item state on the paper form: tick where applicable. */
export type ClearanceItemState = 'Pending' | 'Done' | 'N/A' | 'Outstanding';

export type ClearanceSectionStatus = 'Pending' | 'In Progress' | 'Cleared' | 'Blocked';

export type ExitClearanceCaseStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Blocked';

export type ClearanceSectionApprovalStatus =
  | 'Not Requested'
  | 'Awaiting Approval'
  | 'Approved'
  | 'Rejected';

export type ClearanceItem = {
  id: string;
  label: string;
  /** tick = checkbox only; detail = needs text; amount = optional money note */
  input: 'tick' | 'detail' | 'amount';
  state: ClearanceItemState;
  detail?: string | null;
  amount?: number | null;
};

export type ClearanceSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: ClearanceItem[];
  signedBy: string | null;
  signedAt: string | null;
  status: ClearanceSectionStatus;
  /** Department approver workflow */
  approvalStatus: ClearanceSectionApprovalStatus;
  assigneeRole: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  requestedAt: string | null;
  requestedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  lastNotifiedAt: string | null;
};

export type ClearanceFinalSignOff = {
  signedBy: string | null;
  signedAt: string | null;
};

export type ClearanceNotificationLog = {
  id: string;
  at: string;
  type: 'request' | 'approved' | 'rejected' | 'final_ready' | 'completed';
  sectionId?: string | null;
  to: string;
  sent: boolean;
  reason?: string | null;
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
  dateOfExit: string | null;
  resignationStatus: string;
  documentNumber: string;
  documentRev: string;
  status: ExitClearanceCaseStatus;
  completionPct: number;
  readyForFinalPayroll: boolean;
  approvalsRequestedAt: string | null;
  approvalsRequestedBy: string | null;
  sections: ClearanceSection[];
  hrFinal: ClearanceFinalSignOff;
  financeFinal: ClearanceFinalSignOff;
  notificationLog: ClearanceNotificationLog[];
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
  /** hr = full management; line-manager = assigned section approvals only */
  accessMode: 'hr' | 'line-manager';
  viewerName?: string | null;
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

const tick = (id: string, label: string, input: ClearanceItem['input'] = 'tick'): ClearanceItem => ({
  id,
  label,
  input,
  state: 'Pending',
  detail: null,
  amount: null,
});

const sectionBase = (
  id: string,
  title: string,
  assigneeRole: string,
  items: ClearanceItem[],
  subtitle?: string,
): ClearanceSection => ({
  id,
  title,
  subtitle,
  items,
  signedBy: null,
  signedAt: null,
  status: 'Pending',
  approvalStatus: 'Not Requested',
  assigneeRole,
  assigneeName: null,
  assigneeEmail: null,
  requestedAt: null,
  requestedBy: null,
  approvedAt: null,
  approvedBy: null,
  rejectionReason: null,
  lastNotifiedAt: null,
});

/** Official department sections matching DL-HRD-F-030. */
export const buildDefaultClearanceSections = (): ClearanceSection[] => [
  sectionBase('hod', '1. HOD / UNIT ONLY', 'Line Manager / HOD', [
    tick('handover', 'Formal handover of Tasks and Responsibilities'),
    tick('clients', 'Client/s Notified'),
    tick('tools', 'Tools returned to Stores Unit'),
  ], 'Line manager / unit head clearance'),
  sectionBase('hse', '2. HSE DEPARTMENT ONLY', 'HSE Officer', [
    tick('ppe', 'PPEs'),
  ]),
  sectionBase('coop', '3. DLE CO-OPERATIVE ONLY', 'Co-operative Officer', [
    tick('coop_loan', 'Outstanding Loan', 'detail'),
  ]),
  sectionBase('it', '4. IT DEPARTMENT ONLY', 'IT Officer', [
    tick('laptop', 'Lap Top'),
    tick('email', 'E-mail disabled'),
  ]),
  sectionBase('hr', '5. HR / ADMIN DEPARTMENT ONLY', 'HR / Admin Officer', [
    tick('id_card', 'ID card'),
    tick('hmo', 'HMO cards'),
    tick('gsm', 'GSM Handset'),
    tick('residence_keys', 'Official Residence Keys'),
    tick('official_car', 'Official Car'),
    tick('others', 'Others (please specify)', 'detail'),
    tick('coy_loan', 'Status of Coy guaranteed loan to bank', 'detail'),
    tick('staff_loan', 'Status of loan guaranteed by staff', 'detail'),
    tick('exit_interview', 'Completion of exit interview Form'),
  ]),
  sectionBase('finance', '6. FINANCE DEPARTMENT ONLY', 'Finance Officer', [
    tick('fin_loan', 'Outstanding Loan', 'amount'),
    tick('cash_advance', 'Cash Advance', 'amount'),
    tick('banks', 'Bank/s Notified'),
    tick('fin_others', 'Others (Please specify)', 'detail'),
  ]),
];

export const sectionIsSigned = (section: ClearanceSection) =>
  Boolean(section.signedBy?.trim() && section.signedAt);

export const sectionHasOutstanding = (section: ClearanceSection) =>
  section.items.some((item) => item.state === 'Outstanding');

export const sectionItemsResolved = (section: ClearanceSection) =>
  section.items.every((item) => item.state === 'Done' || item.state === 'N/A' || item.state === 'Outstanding');

/** Section cleared when items resolved, signed, and not rejected. */
export const deriveSectionStatus = (section: ClearanceSection): ClearanceSectionStatus => {
  if (section.approvalStatus === 'Rejected' || sectionHasOutstanding(section)) return 'Blocked';
  if (section.approvalStatus === 'Awaiting Approval') return 'In Progress';
  const allClear = section.items.every((item) => item.state === 'Done' || item.state === 'N/A');
  if (allClear && sectionIsSigned(section)) return 'Cleared';
  if (section.items.some((item) => item.state !== 'Pending') || section.signedBy || section.approvalStatus === 'Approved') {
    return 'In Progress';
  }
  return 'Pending';
};

export const exitClearancePct = (sections: ClearanceSection[]) => {
  if (!sections.length) return 0;
  const cleared = sections.filter((section) => deriveSectionStatus(section) === 'Cleared').length;
  return Math.round((cleared / sections.length) * 100);
};

export const finalSignOffComplete = (row: Pick<ExitClearanceCase, 'hrFinal' | 'financeFinal'>) =>
  Boolean(row.hrFinal?.signedBy?.trim() && row.hrFinal?.signedAt
    && row.financeFinal?.signedBy?.trim() && row.financeFinal?.signedAt);

export const isReadyForFinalPayroll = (row: Pick<ExitClearanceCase, 'sections' | 'hrFinal' | 'financeFinal'>) => {
  const sections = row.sections || [];
  if (!sections.length) return false;
  if (sections.some((section) => deriveSectionStatus(section) === 'Blocked')) return false;
  if (!sections.every((section) => deriveSectionStatus(section) === 'Cleared')) return false;
  return finalSignOffComplete(row);
};

export const exitClearanceResignationHref = (row: Pick<ExitClearanceCase, 'resignationId' | 'period'>) =>
  `/hris/offboarding/resignation-management?id=${encodeURIComponent(row.resignationId)}&period=${encodeURIComponent(row.period)}`;

export const exitClearanceFinalPayrollHref = (row: Pick<ExitClearanceCase, 'employeeCode' | 'resignationId' | 'lastWorkingDay' | 'dateOfExit'>) => {
  const params = new URLSearchParams({
    employeeCode: row.employeeCode,
    resignationId: row.resignationId,
    fromResignation: '1',
    exitType: 'Resignation',
  });
  const exit = row.dateOfExit || row.lastWorkingDay;
  if (exit) params.set('lastWorkingDay', exit.slice(0, 10));
  return `/hris/offboarding/final-payroll-processing/new-settlement?${params.toString()}`;
};

export const exitClearanceAssetHref = (row: Pick<ExitClearanceCase, 'employeeCode' | 'id'>) =>
  `/hris/offboarding/asset-return?employeeCode=${encodeURIComponent(row.employeeCode)}&clearanceId=${encodeURIComponent(row.id)}`;

export const exitClearanceHandoverHref = (row: Pick<ExitClearanceCase, 'employeeCode' | 'period'>) => {
  const params = new URLSearchParams({ employeeCode: row.employeeCode });
  if (row.period) params.set('period', row.period);
  return `/hris/offboarding/handover-checklist?${params.toString()}`;
};

/** Blank DL-HRD-F-030 shell for display when no employee case is open. */
export const buildBlankClearanceCase = (): ExitClearanceCase => ({
  id: 'TEMPLATE',
  period: '',
  resignationId: '',
  resignationReference: '',
  employeeId: '',
  employeeCode: '',
  employeeName: '',
  department: '',
  position: '',
  managerName: '',
  resignationDate: null,
  lastWorkingDay: null,
  dateOfExit: null,
  resignationStatus: '',
  documentNumber: CLEARANCE_DOC_NO,
  documentRev: CLEARANCE_DOC_REV,
  status: 'Not Started',
  completionPct: 0,
  readyForFinalPayroll: false,
  approvalsRequestedAt: null,
  approvalsRequestedBy: null,
  sections: buildDefaultClearanceSections(),
  hrFinal: { signedBy: null, signedAt: null },
  financeFinal: { signedBy: null, signedAt: null },
  notificationLog: [],
  createdAt: '',
  updatedAt: '',
  updatedBy: '',
});

/** @deprecated legacy alias — use sections model */
export type ExitClearanceLine = {
  id: string;
  label: string;
  owner: string;
  status: ClearanceSectionStatus;
  note?: string | null;
  clearedAt?: string | null;
  clearedBy?: string | null;
};
