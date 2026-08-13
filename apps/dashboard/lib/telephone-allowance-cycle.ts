/** Bimonthly telephone allowance cycle math and calendar helpers. */

export const BIMONTHLY_PAIRS = [
  { month1: 1, month2: 2, label: 'Jan–Feb', code: 'JAN-FEB' },
  { month1: 3, month2: 4, label: 'Mar–Apr', code: 'MAR-APR' },
  { month1: 5, month2: 6, label: 'May–Jun', code: 'MAY-JUN' },
  { month1: 7, month2: 8, label: 'Jul–Aug', code: 'JUL-AUG' },
  { month1: 9, month2: 10, label: 'Sep–Oct', code: 'SEP-OCT' },
  { month1: 11, month2: 12, label: 'Nov–Dec', code: 'NOV-DEC' },
] as const;

export type BimonthlyPair = (typeof BIMONTHLY_PAIRS)[number];

export type TelephoneAllowanceStatus =
  | 'DRAFT'
  | 'PENDING_HR_REVIEW'
  | 'RETURNED_TO_IT'
  | 'IT_VALIDATION'
  | 'PENDING_HR_APPROVAL'
  | 'PENDING_MD_APPROVAL'
  | 'PENDING_CFO_AUTHORIZATION'
  | 'AUTHORIZED_FOR_PAYMENT'
  | 'PAYMENT_PROCESSING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'COMPLETED'
  | 'RETURNED_FOR_CORRECTION';

export type ChangeBadge =
  | 'UNCHANGED'
  | 'ADDED'
  | 'REMOVED'
  | 'AMOUNT_CHANGED'
  | 'JULY_ONLY'
  | 'AUGUST_ONLY'
  | 'MONTH1_ONLY'
  | 'MONTH2_ONLY';

export type EntitlementStatus = 'Active' | 'Suspended' | 'Ended';

export type TelephoneEntitlement = {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  monthlyAmount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: EntitlementStatus;
  bankName?: string | null;
  accountNo?: string | null;
  sortCode?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type CycleEmployeeLine = {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  monthlyRate: number;
  month1Eligible: boolean;
  month1Amount: number;
  month2Eligible: boolean;
  month2Amount: number;
  bimonthlyTotal: number;
  changeBadge: ChangeBadge;
  changeReason?: string | null;
  status: 'Eligible' | 'Changed' | 'Removed' | 'Exception';
  bankName?: string | null;
  accountNo?: string | null;
  sortCode?: string | null;
  exceptionFlags: string[];
};

export type CycleVersion = {
  id: string;
  versionNo: number;
  label: string;
  createdAt: string;
  createdBy: string;
  snapshotJson: string;
  month1Total: number;
  month2Total: number;
  bimonthlyTotal: number;
  beneficiaryCount: number;
};

export type CycleChange = {
  id: string;
  employeeCode: string;
  employeeName: string;
  changeType: 'ADD' | 'REMOVE' | 'AMOUNT' | 'ELIGIBILITY';
  effectiveMonth: 1 | 2 | 'BOTH';
  previousMonthlyRate?: number | null;
  newMonthlyRate?: number | null;
  month1Eligible?: boolean | null;
  month2Eligible?: boolean | null;
  reason: string;
  comment?: string | null;
  actor: string;
  createdAt: string;
};

export type CycleApproval = {
  id: string;
  stage: 'HR' | 'MD' | 'CFO';
  action: 'APPROVE' | 'AUTHORIZE' | 'RETURN';
  actor: string;
  actorRole: string;
  comment?: string | null;
  reason?: string | null;
  createdAt: string;
};

export type TelephoneCycle = {
  id: string;
  cycleCode: string;
  year: number;
  month1: number;
  month2: number;
  pairLabel: string;
  pairCode: string;
  status: TelephoneAllowanceStatus;
  currentOwnerRole: string;
  preparedBy: string;
  hrReviewedBy?: string | null;
  locked: boolean;
  rowVersion: number;
  month1Total: number;
  month2Total: number;
  bimonthlyTotal: number;
  beneficiaryCount: number;
  originalBeneficiaryCount?: number | null;
  originalBimonthlyTotal?: number | null;
  employees: CycleEmployeeLine[];
  versions: CycleVersion[];
  changes: CycleChange[];
  approvals: CycleApproval[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type PaymentItem = {
  id: string;
  employeeCode: string;
  employeeName: string;
  amount: number;
  accountNoMasked: string;
  accountNoFull?: string | null;
  bankName: string;
  sortCode: string;
  status: 'Authorized' | 'Processing' | 'Paid' | 'Failed';
  failureReason?: string | null;
};

export type TelephonePayment = {
  id: string;
  cycleId: string;
  cycleCode: string;
  status: 'Authorized' | 'Processing' | 'Paid' | 'Partially Paid' | 'Failed' | 'Completed';
  authorizedAmount: number;
  paidAmount: number;
  beneficiaryCount: number;
  paymentDate?: string | null;
  paymentReference?: string | null;
  bankReference?: string | null;
  batchReference?: string | null;
  remarks?: string | null;
  items: PaymentItem[];
  createdAt: string;
  updatedAt: string;
};

export type TelephoneException = {
  id: string;
  cycleId: string;
  cycleCode: string;
  employeeCode?: string | null;
  employeeName?: string | null;
  type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  owner: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  resolution?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
};

export type TelephoneAudit = {
  id: string;
  cycleId?: string | null;
  employeeCode?: string | null;
  user: string;
  role: string;
  action: string;
  previousValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  workflowStage?: string | null;
  ip?: string | null;
  createdAt: string;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const pairForMonth = (month: number): BimonthlyPair => {
  const found = BIMONTHLY_PAIRS.find((p) => p.month1 === month || p.month2 === month);
  if (!found) throw new Error(`Invalid month ${month}`);
  return found;
};

export const pairForCode = (pairCode: string): BimonthlyPair => {
  const found = BIMONTHLY_PAIRS.find((p) => p.code === pairCode.toUpperCase());
  if (!found) throw new Error(`Unknown pair code ${pairCode}`);
  return found;
};

export const nextPairAfter = (year: number, month1: number): { year: number; pair: BimonthlyPair } => {
  const idx = BIMONTHLY_PAIRS.findIndex((p) => p.month1 === month1);
  if (idx < 0) throw new Error('Invalid cycle month');
  if (idx === BIMONTHLY_PAIRS.length - 1) return { year: year + 1, pair: BIMONTHLY_PAIRS[0] };
  return { year, pair: BIMONTHLY_PAIRS[idx + 1] };
};

export const currentOpenPair = (asOf = new Date()) => {
  const month = asOf.getUTCMonth() + 1;
  const year = asOf.getUTCFullYear();
  return { year, pair: pairForMonth(month) };
};

export const monthLabel = (year: number, month: number) => `${MONTH_NAMES[month - 1]} ${year}`;

export const buildCycleCode = (year: number, pairCode: string, seq = 1) =>
  `CALL-${year}-${pairCode}-${String(seq).padStart(3, '0')}`;

export const dateInMonth = (isoDate: string | null | undefined, year: number, month: number) => {
  if (!isoDate) return false;
  const d = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m] = d.split('-').map(Number);
  return y === year && m === month;
};

export const entitlementCoversMonth = (
  entitlement: Pick<TelephoneEntitlement, 'effectiveFrom' | 'effectiveTo' | 'status'>,
  year: number,
  month: number,
) => {
  if (entitlement.status === 'Suspended' || entitlement.status === 'Ended') {
    // Ended entitlements still cover months before effectiveTo.
    if (entitlement.status === 'Suspended') return false;
  }
  const from = entitlement.effectiveFrom.slice(0, 10);
  const to = entitlement.effectiveTo ? entitlement.effectiveTo.slice(0, 10) : null;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDay).padStart(2, '0')}`;
  if (from > monthEnd) return false;
  if (to && to < monthStart) return false;
  if (entitlement.status === 'Ended' && to && to < monthStart) return false;
  return true;
};

/** Resolve monthly amount for a calendar month from effective-dated entitlements (latest covering wins). */
export const resolveMonthlyAmount = (
  entitlements: TelephoneEntitlement[],
  employeeCode: string,
  year: number,
  month: number,
) => {
  const code = employeeCode.trim().toUpperCase();
  const covering = entitlements
    .filter((e) => e.employeeCode.trim().toUpperCase() === code)
    .filter((e) => entitlementCoversMonth(e, year, month))
    .filter((e) => e.status === 'Active' || (e.status === 'Ended' && entitlementCoversMonth(e, year, month)))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const hit = covering.find((e) => e.status === 'Active') || covering[0];
  if (!hit || hit.status === 'Suspended') return { eligible: false, amount: 0, monthlyRate: 0, entitlement: null as TelephoneEntitlement | null };
  return { eligible: true, amount: roundMoney(hit.monthlyAmount), monthlyRate: roundMoney(hit.monthlyAmount), entitlement: hit };
};

export const buildLineFromEntitlements = (
  entitlements: TelephoneEntitlement[],
  employeeCode: string,
  year: number,
  pair: BimonthlyPair,
  identity?: { employeeName?: string; department?: string; jobTitle?: string; bankName?: string | null; accountNo?: string | null; sortCode?: string | null },
): CycleEmployeeLine | null => {
  const m1 = resolveMonthlyAmount(entitlements, employeeCode, year, pair.month1);
  const m2 = resolveMonthlyAmount(entitlements, employeeCode, year, pair.month2);
  if (!m1.eligible && !m2.eligible) return null;
  const base = m2.entitlement || m1.entitlement;
  const month1Amount = m1.eligible ? m1.amount : 0;
  const month2Amount = m2.eligible ? m2.amount : 0;
  const monthlyRate = m2.monthlyRate || m1.monthlyRate;
  let changeBadge: ChangeBadge = 'UNCHANGED';
  if (m1.eligible && !m2.eligible) changeBadge = 'MONTH1_ONLY';
  else if (!m1.eligible && m2.eligible) changeBadge = 'MONTH2_ONLY';
  else if (m1.eligible && m2.eligible && month1Amount !== month2Amount) changeBadge = 'AMOUNT_CHANGED';

  const exceptionFlags: string[] = [];
  if (!identity?.accountNo && !base?.accountNo) exceptionFlags.push('Missing bank information');
  if (!identity?.department && !base?.department) exceptionFlags.push('Missing department');

  return {
    id: `line-${employeeCode}-${year}-${pair.code}`,
    employeeCode,
    employeeName: identity?.employeeName || base?.employeeName || employeeCode,
    department: identity?.department || base?.department || '',
    jobTitle: identity?.jobTitle || base?.jobTitle || '',
    monthlyRate,
    month1Eligible: m1.eligible,
    month1Amount: roundMoney(month1Amount),
    month2Eligible: m2.eligible,
    month2Amount: roundMoney(month2Amount),
    bimonthlyTotal: roundMoney(month1Amount + month2Amount),
    changeBadge,
    status: exceptionFlags.length ? 'Exception' : 'Eligible',
    bankName: identity?.bankName || base?.bankName || null,
    accountNo: identity?.accountNo || base?.accountNo || null,
    sortCode: identity?.sortCode || base?.sortCode || null,
    exceptionFlags,
  };
};

export const recalcCycleTotals = (employees: CycleEmployeeLine[]) => {
  const active = employees.filter((e) => e.bimonthlyTotal > 0 || e.month1Eligible || e.month2Eligible);
  return {
    month1Total: roundMoney(active.reduce((s, e) => s + e.month1Amount, 0)),
    month2Total: roundMoney(active.reduce((s, e) => s + e.month2Amount, 0)),
    bimonthlyTotal: roundMoney(active.reduce((s, e) => s + e.bimonthlyTotal, 0)),
    beneficiaryCount: active.filter((e) => e.bimonthlyTotal > 0).length,
  };
};

export const assertBimonthlyEqualsMonths = (line: CycleEmployeeLine) => {
  const expected = roundMoney(line.month1Amount + line.month2Amount);
  if (roundMoney(line.bimonthlyTotal) !== expected) {
    throw new Error(`Bimonthly total mismatch for ${line.employeeCode}: ${line.bimonthlyTotal} != ${expected}`);
  }
};

const EDITABLE: TelephoneAllowanceStatus[] = ['DRAFT', 'RETURNED_TO_IT', 'RETURNED_FOR_CORRECTION', 'IT_VALIDATION'];
const HR_REVIEWABLE: TelephoneAllowanceStatus[] = ['PENDING_HR_REVIEW'];

export const canEditSchedule = (status: TelephoneAllowanceStatus, locked: boolean) =>
  !locked && EDITABLE.includes(status);

export const canHrReviewEdit = (status: TelephoneAllowanceStatus) => HR_REVIEWABLE.includes(status);

export const WORKFLOW_STEPS = [
  { key: 'IT_PREP', label: 'IT Preparation', statuses: ['DRAFT', 'RETURNED_TO_IT', 'RETURNED_FOR_CORRECTION', 'IT_VALIDATION'] },
  { key: 'HR_REVIEW', label: 'HR Review', statuses: ['PENDING_HR_REVIEW'] },
  { key: 'IT_VALIDATION', label: 'IT Validation', statuses: ['RETURNED_TO_IT', 'IT_VALIDATION'] },
  { key: 'HR_APPROVAL', label: 'HR Approval', statuses: ['PENDING_HR_APPROVAL'] },
  { key: 'MD_APPROVAL', label: 'MD Approval', statuses: ['PENDING_MD_APPROVAL'] },
  { key: 'CFO_AUTH', label: 'CFO Authorization', statuses: ['PENDING_CFO_AUTHORIZATION'] },
  { key: 'PAYMENT', label: 'Payment', statuses: ['AUTHORIZED_FOR_PAYMENT', 'PAYMENT_PROCESSING', 'PARTIALLY_PAID', 'PAID', 'COMPLETED'] },
] as const;

export const ALLOWED_TRANSITIONS: Record<TelephoneAllowanceStatus, TelephoneAllowanceStatus[]> = {
  DRAFT: ['PENDING_HR_REVIEW'],
  PENDING_HR_REVIEW: ['RETURNED_TO_IT'],
  RETURNED_TO_IT: ['IT_VALIDATION', 'PENDING_HR_REVIEW', 'PENDING_HR_APPROVAL'],
  IT_VALIDATION: ['PENDING_HR_APPROVAL', 'PENDING_HR_REVIEW'],
  PENDING_HR_APPROVAL: ['PENDING_MD_APPROVAL', 'RETURNED_FOR_CORRECTION'],
  PENDING_MD_APPROVAL: ['PENDING_CFO_AUTHORIZATION', 'RETURNED_FOR_CORRECTION'],
  PENDING_CFO_AUTHORIZATION: ['AUTHORIZED_FOR_PAYMENT', 'RETURNED_FOR_CORRECTION'],
  AUTHORIZED_FOR_PAYMENT: ['PAYMENT_PROCESSING', 'PAID'],
  PAYMENT_PROCESSING: ['PARTIALLY_PAID', 'PAID', 'COMPLETED'],
  PARTIALLY_PAID: ['PAID', 'COMPLETED', 'PAYMENT_PROCESSING'],
  PAID: ['COMPLETED'],
  COMPLETED: [],
  RETURNED_FOR_CORRECTION: ['IT_VALIDATION', 'PENDING_HR_APPROVAL', 'DRAFT'],
};

export const assertTransition = (from: TelephoneAllowanceStatus, to: TelephoneAllowanceStatus) => {
  if (!(ALLOWED_TRANSITIONS[from] || []).includes(to)) {
    throw new Error(`Illegal workflow transition: ${from} → ${to}`);
  }
};

export const maskAccount = (accountNo?: string | null) => {
  const raw = String(accountNo || '').replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
};
