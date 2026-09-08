/**
 * Final Payroll Processing — offboarding settlement register + calculation store.
 * Persistence: JSON under data/hris (durable enough for draft/approval workflow).
 * Server-only — do not value-import from client components (use final-payroll-settlement-shared).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readEmployeeExitStatusFromDb, type EmployeeExitStatusRecord } from '@/lib/employee-exit-status-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  type FinalPayrollApprovalStage,
  type FinalPayrollClearanceItem,
  type FinalPayrollKpi,
  type FinalPayrollLine,
  type FinalPayrollPayload,
  type FinalPayrollSettlement,
  type FinalPayrollStatus,
  currentFinalPayrollPeriod,
  formatFinalPayrollDate,
  formatFinalPayrollMoney,
  periodLabelFromCode,
  previousFinalPayrollPeriod,
  roundFinalPayrollMoney,
  settlementTotals,
  sumIncludedLines,
} from '@/lib/final-payroll-settlement-shared';

export type {
  ClearanceItemStatus,
  ApprovalStageStatus,
  FinalPayrollLine,
  FinalPayrollClearanceItem,
  FinalPayrollApprovalStage,
  FinalPayrollComment,
  FinalPayrollSettlement,
  FinalPayrollKpi,
  FinalPayrollPayload,
  FinalPayrollStatus,
} from '@/lib/final-payroll-settlement-shared';

export {
  formatFinalPayrollDate,
  formatFinalPayrollMoney,
  periodLabelFromCode,
  currentFinalPayrollPeriod,
  previousFinalPayrollPeriod,
  moneySymbol,
  sumIncludedLines,
  settlementTotals,
} from '@/lib/final-payroll-settlement-shared';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'));
const FILE_PATH = path.join(DATA_DIR, 'final-payroll-settlements.json');

const compact = (value: unknown) => String(value || '').trim();
const roundMoney = roundFinalPayrollMoney;
const nowIso = () => new Date().toISOString();

const defaultClearance = (): FinalPayrollClearanceItem[] => [
  { id: 'hr', label: 'HR Clearance', status: 'Completed' },
  { id: 'it', label: 'IT Clearance', status: 'Completed' },
  { id: 'finance', label: 'Finance Clearance', status: 'Completed' },
  { id: 'admin', label: 'Administration', status: 'Pending' },
  { id: 'asset', label: 'Asset Return', status: 'Pending', note: 'Laptop outstanding.' },
  { id: 'access', label: 'Access Deactivation', status: 'Completed' },
  { id: 'handover', label: 'Handover Checklist', status: 'Completed' },
];

const defaultApprovalStages = (status: FinalPayrollStatus): FinalPayrollApprovalStage[] => {
  const stages: FinalPayrollApprovalStage[] = [
    { id: 'prep', label: 'Payroll Preparation', status: 'Pending' },
    { id: 'hr', label: 'HR Manager Review', status: 'Pending' },
    { id: 'finance', label: 'Finance Review', status: 'Pending' },
    { id: 'cfo', label: 'CFO Authorization', status: 'Pending' },
    { id: 'payment', label: 'Final Payment', status: 'Pending' },
  ];
  const mark = (index: number, value: ApprovalStageStatus) => {
    for (let i = 0; i < stages.length; i += 1) {
      if (i < index) stages[i].status = 'Completed';
      else if (i === index) stages[i].status = value;
      else stages[i].status = 'Pending';
    }
  };
  switch (status) {
    case 'Draft':
    case 'Awaiting Clearance':
    case 'Ready for Calculation':
      mark(0, 'In Review');
      break;
    case 'In Review':
      mark(1, 'In Review');
      break;
    case 'Awaiting Approval':
      mark(2, 'In Review');
      break;
    case 'Approved':
      mark(3, 'Completed');
      stages[4].status = 'Pending';
      break;
    case 'Paid':
      stages.forEach((stage) => {
        stage.status = 'Completed';
      });
      break;
    default:
      mark(0, 'In Review');
  }
  return stages;
};

const daysInMonth = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return 30;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
};

const workingDaysUntil = (period: string, lastWorkingDay?: string | null) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return 21;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const endDay = lastWorkingDay
    ? Number(String(lastWorkingDay).slice(8, 10)) || daysInMonth(period)
    : daysInMonth(period);
  return Math.max(1, Math.min(endDay, daysInMonth(period)));
};

const serviceLengthLabel = (years: number, joining?: string | null, lastDay?: string | null) => {
  if (joining && lastDay) {
    const start = new Date(`${joining}T00:00:00.000Z`);
    const end = new Date(`${lastDay}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
      let y = end.getUTCFullYear() - start.getUTCFullYear();
      let m = end.getUTCMonth() - start.getUTCMonth();
      if (m < 0) {
        y -= 1;
        m += 12;
      }
      return `${y} Year${y === 1 ? '' : 's'} ${m} Month${m === 1 ? '' : 's'}`;
    }
  }
  const whole = Math.max(0, Math.floor(years));
  const months = Math.round((years - whole) * 12);
  return `${whole} Year${whole === 1 ? '' : 's'} ${months} Month${months === 1 ? '' : 's'}`;
};

export const buildDefaultEarnings = (input: {
  period: string;
  currency: 'NGN' | 'USD';
  basicSalary: number;
  lastWorkingDay?: string | null;
  allowanceMonthly?: number;
}): FinalPayrollLine[] => {
  const days = workingDaysUntil(input.period, input.lastWorkingDay);
  const monthDays = daysInMonth(input.period);
  const basic = Math.max(0, Number(input.basicSalary || 0));
  const allowances = Math.max(0, Number(input.allowanceMonthly ?? basic * 0.15));
  const salary = roundMoney((basic / monthDays) * days);
  const earnedAllowances = roundMoney((allowances / monthDays) * days);
  const period = periodLabelFromCode(input.period);
  const lwd = formatFinalPayrollDate(input.lastWorkingDay);
  return [
    {
      id: 'salary-lwd',
      label: 'Salary up to Last Working Day',
      description: 'Pro-rated basic salary',
      policyBasis: 'Actual days worked',
      periodDays: `${days} days`,
      amount: salary,
      remarks: `${period.split(' ')[0]} 1 – ${lwd}`,
      included: true,
    },
    {
      id: 'outstanding-salary',
      label: 'Outstanding Salary',
      description: 'Unpaid salary (if any)',
      policyBasis: 'Payroll records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'earned-allowances',
      label: 'Earned Allowances',
      description: 'Housing, transport, etc.',
      policyBasis: 'Pro-rated',
      periodDays: `${days} days`,
      amount: earnedAllowances,
      remarks: 'Based on current entitlements',
      included: true,
    },
    {
      id: 'leave-encashment',
      label: 'Leave Encashment',
      description: 'Unused annual leave',
      policyBasis: 'Company policy',
      periodDays: '0 days',
      amount: 0,
      remarks: 'No eligible leave balance',
      included: true,
    },
    {
      id: 'overtime',
      label: 'Overtime',
      description: 'Approved overtime',
      policyBasis: 'Timesheet records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
    {
      id: 'bonus',
      label: 'Bonus / Commission',
      description: 'Outstanding bonus/commission',
      policyBasis: 'Approval records',
      periodDays: '-',
      amount: 0,
      remarks: '-',
      included: true,
    },
  ];
};

export const buildDefaultDeductions = (): FinalPayrollLine[] => [
  {
    id: 'staff-loan',
    label: 'Staff Loan Balance',
    description: 'Outstanding staff loan',
    policyBasis: 'Loan register',
    periodDays: '-',
    amount: 0,
    remarks: '-',
    included: true,
  },
  {
    id: 'cash-advance',
    label: 'Unretired Cash Advance',
    description: 'Open cash advances',
    policyBasis: 'Treasury records',
    periodDays: '-',
    amount: 0,
    remarks: '-',
    included: true,
  },
  {
    id: 'other-deductions',
    label: 'Other Deductions',
    description: 'Other recoveries',
    policyBasis: 'HR / Finance',
    periodDays: '-',
    amount: 0,
    remarks: '-',
    included: true,
  },
];

export const buildDefaultStatutory = (): FinalPayrollLine[] => [
  {
    id: 'paye',
    label: 'PAYE',
    description: 'Pay-as-you-earn tax',
    policyBasis: 'Statutory',
    periodDays: '-',
    amount: 0,
    remarks: 'Applied on final earnings where due',
    included: true,
  },
  {
    id: 'pension',
    label: 'Pension (Employee)',
    description: 'Employee pension contribution',
    policyBasis: 'Statutory',
    periodDays: '-',
    amount: 0,
    remarks: '-',
    included: true,
  },
];

const mapStatusFromExit = (row: EmployeeExitStatusRecord): FinalPayrollStatus => {
  if (row.clearanceStatus === 'Overdue') return 'Exception';
  if (row.clearanceStatus === 'Complete' && row.payrollStatus === 'Closed') return 'Paid';
  if (row.clearanceStatus !== 'Complete') return 'Awaiting Clearance';
  if (row.payrollStatus === 'Final Settlement Due') return 'Ready for Calculation';
  return 'Draft';
};

const readJsonSettlements = async (): Promise<FinalPayrollSettlement[]> => {
  try {
    const parsed = JSON.parse(await readFile(FILE_PATH, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.settlements) ? parsed.settlements : [];
    return rows.filter((row: FinalPayrollSettlement) => row?.id && row?.employeeCode);
  } catch {
    return [];
  }
};

const writeJsonSettlements = async (settlements: FinalPayrollSettlement[]) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify({ settlements, updatedAt: nowIso() }, null, 2), 'utf8');
};

const statusToneClass = (status: FinalPayrollStatus) =>
  status.replace(/\s+/g, '').toLowerCase();

export { statusToneClass };

const buildKpis = (current: FinalPayrollSettlement[], prior: FinalPayrollSettlement[]): FinalPayrollKpi[] => {
  const count = (rows: FinalPayrollSettlement[], statuses: FinalPayrollStatus[]) =>
    rows.filter((row) => statuses.includes(row.status)).length;
  const pending = count(current, ['Draft', 'Awaiting Clearance', 'Ready for Calculation', 'In Review', 'Awaiting Approval', 'Exception']);
  const awaitingClearance = count(current, ['Awaiting Clearance']);
  const ready = count(current, ['Ready for Calculation']);
  const awaitingApproval = count(current, ['Awaiting Approval']);
  const approved = count(current, ['Approved', 'Paid']);
  const totalValue = roundMoney(current.reduce((sum, row) => sum + settlementTotals(row).net, 0));

  const priorPending = count(prior, ['Draft', 'Awaiting Clearance', 'Ready for Calculation', 'In Review', 'Awaiting Approval', 'Exception']);
  const priorClearance = count(prior, ['Awaiting Clearance']);
  const priorReady = count(prior, ['Ready for Calculation']);
  const priorApproval = count(prior, ['Awaiting Approval']);
  const priorApproved = count(prior, ['Approved', 'Paid']);
  const priorValue = roundMoney(prior.reduce((sum, row) => sum + settlementTotals(row).net, 0));

  const delta = (now: number, was: number, asPct = false) => {
    const diff = now - was;
    if (asPct) {
      if (was <= 0) return now > 0 ? '+100% vs last month' : '0% vs last month';
      const pct = Math.round((diff / was) * 1000) / 10;
      return `${pct >= 0 ? '+' : ''}${pct}% vs last month`;
    }
    return `${diff >= 0 ? '+' : ''}${diff} vs last month`;
  };

  return [
    { id: 'pending', label: 'Pending Final Payroll', value: pending, display: String(pending), deltaLabel: delta(pending, priorPending), tone: 'blue' },
    { id: 'clearance', label: 'Awaiting Clearance', value: awaitingClearance, display: String(awaitingClearance), deltaLabel: delta(awaitingClearance, priorClearance), tone: 'amber' },
    { id: 'ready', label: 'Ready for Calculation', value: ready, display: String(ready), deltaLabel: delta(ready, priorReady), tone: 'mint' },
    { id: 'approval', label: 'Awaiting Approval', value: awaitingApproval, display: String(awaitingApproval), deltaLabel: delta(awaitingApproval, priorApproval), tone: 'purple' },
    { id: 'approved', label: 'Approved for Payment', value: approved, display: String(approved), deltaLabel: delta(approved, priorApproved), tone: 'green' },
    {
      id: 'value',
      label: 'Total Settlement Value',
      value: totalValue,
      display: formatFinalPayrollMoney(totalValue, 'NGN'),
      deltaLabel: delta(totalValue, priorValue, true),
      tone: 'rose',
    },
  ];
};

const tabCountsFor = (rows: FinalPayrollSettlement[]) => {
  const counts: Record<string, number> = {
    All: rows.length,
    'Awaiting Clearance': 0,
    'Ready for Calculation': 0,
    'In Review': 0,
    'Awaiting Approval': 0,
    Approved: 0,
    Paid: 0,
    Exceptions: 0,
  };
  for (const row of rows) {
    if (row.status === 'Awaiting Clearance') counts['Awaiting Clearance'] += 1;
    else if (row.status === 'Ready for Calculation') counts['Ready for Calculation'] += 1;
    else if (row.status === 'In Review') counts['In Review'] += 1;
    else if (row.status === 'Awaiting Approval') counts['Awaiting Approval'] += 1;
    else if (row.status === 'Approved') counts.Approved += 1;
    else if (row.status === 'Paid') counts.Paid += 1;
    else if (row.status === 'Exception') counts.Exceptions += 1;
  }
  return counts;
};

const findEmployeePay = async (employeeCode: string) => {
  const source = await readPayrollEmployees().catch(() => null);
  const code = compact(employeeCode).toUpperCase();
  const hit = (source?.employees || []).find((row) => {
    const rowCode = compact(row.employeeCode || row.employeeId).toUpperCase();
    return rowCode === code || rowCode.replace(/^P/, '') === code.replace(/^P/, '');
  });
  return hit || null;
};

export const recalculateSettlement = (settlement: FinalPayrollSettlement): FinalPayrollSettlement => {
  const earnings = buildDefaultEarnings({
    period: settlement.period,
    currency: settlement.currency,
    basicSalary: settlement.basicSalary,
    lastWorkingDay: settlement.lastWorkingDay,
  }).map((line) => {
    const existing = settlement.earnings.find((item) => item.id === line.id);
    if (!existing) return line;
    // Preserve manual overrides for non-prorated lines; refresh prorated salary/allowances.
    if (line.id === 'salary-lwd' || line.id === 'earned-allowances') return { ...line, included: existing.included };
    return { ...existing, label: line.label, description: line.description, policyBasis: line.policyBasis };
  });
  return {
    ...settlement,
    earnings,
    updatedAt: nowIso(),
  };
};

const settlementFromExit = (
  row: EmployeeExitStatusRecord,
  period: string,
  actor: string,
  pay?: {
    basicSalary?: number | null;
    payCurrency?: string | null;
    contractStartDate?: string | null;
    jobGrade?: string | null;
    salaryGrade?: string | null;
  } | null,
): FinalPayrollSettlement => {
  const currency: 'NGN' | 'USD' = /USD|US\$/i.test(String(pay?.payCurrency || '')) ? 'USD' : 'NGN';
  const basic = Number(pay?.basicSalary || 0);
  const lastWorkingDay = row.exitDate || row.contractEndDate;
  const status = mapStatusFromExit(row);
  const id = `FPS-${period.replace('-', '')}-${compact(row.employeeCode).toUpperCase()}`;
  return {
    id,
    period,
    employeeId: row.employeeId,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    department: row.department || '—',
    employmentType: row.employmentType || '—',
    jobTitle: row.jobTitle || '—',
    grade: compact(pay?.jobGrade || pay?.salaryGrade) || '—',
    currency,
    basicSalary: basic,
    dateOfJoining: pay?.contractStartDate || row.contractStartDate,
    serviceLength: serviceLengthLabel(row.serviceYears, pay?.contractStartDate || row.contractStartDate, lastWorkingDay),
    exitType: row.exitCategory === 'Active Monitoring' ? 'Resignation' : row.exitCategory,
    resignationDate: row.noticeDate,
    lastWorkingDay,
    noticePeriod: '1 Month',
    reasonForLeaving: '',
    remarks: '',
    lastRegularPayroll: periodLabelFromCode(period),
    nextPayrollExcluded: true,
    status,
    clearance: defaultClearance().map((item) => ({
      ...item,
      status: row.clearanceStatus === 'Complete' ? 'Completed' : item.status,
    })),
    approvalStages: defaultApprovalStages(status),
    earnings: buildDefaultEarnings({ period, currency, basicSalary: basic, lastWorkingDay }),
    deductions: buildDefaultDeductions(),
    statutory: buildDefaultStatutory(),
    comments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: actor,
    updatedBy: actor,
  };
};

const ensureSeededFromExit = async (period: string, actor: string) => {
  const existing = await readJsonSettlements();
  const byCode = new Map(existing.map((row) => [`${row.period}:${compact(row.employeeCode).toUpperCase()}`, row]));
  const exit = await readEmployeeExitStatusFromDb().catch(() => null);
  const candidates = (exit?.records || []).filter((row) =>
    row.payrollStatus === 'Final Settlement Due'
    || row.payrollStatus === 'Monitor'
    || row.exitStage === 'Payroll Closure'
    || row.exitStage === 'In Clearance'
    || row.exitStage === 'Due Soon'
    || row.clearanceStatus === 'Pending Payroll'
    || row.clearanceStatus === 'Overdue'
    || row.clearanceStatus === 'In Progress'
    || row.clearanceStatus === 'Complete',
  );

  let changed = false;
  const next = [...existing];
  for (const row of candidates.slice(0, 40)) {
    const key = `${period}:${compact(row.employeeCode).toUpperCase()}`;
    if (byCode.has(key)) continue;
    const pay = await findEmployeePay(row.employeeCode);
    const created = settlementFromExit(row, period, actor, pay);
    next.push(created);
    byCode.set(key, created);
    changed = true;
  }

  if (changed) await writeJsonSettlements(next);
  return next;
};

export const listFinalPayrollSettlements = async (period?: string) => {
  const periodCode = period || currentFinalPayrollPeriod();
  const rows = await ensureSeededFromExit(periodCode, 'System');
  return rows.filter((row) => row.period === periodCode);
};

export const getFinalPayrollSettlement = async (id: string) => {
  const rows = await readJsonSettlements();
  return rows.find((row) => row.id === id) || null;
};

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = compact(right).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a || !b) return false;
  return a === b || a.replace(/^P/, '') === b.replace(/^P/, '');
};

/** Latest settlement for an employee (optional period filter), plus profile deep-link helpers. */
export const resolveFinalPayrollForEmployee = async (input: {
  employeeCode?: string | null;
  employeeId?: string | null;
  period?: string | null;
}) => {
  const code = compact(input.employeeCode);
  const employeeId = compact(input.employeeId);
  if (!code && !employeeId) return null;

  const period = compact(input.period) || null;
  const all = await readJsonSettlements();
  const matches = all
    .filter((row) => {
      if (period && row.period !== period) return false;
      return codesMatch(row.employeeCode, code)
        || codesMatch(row.employeeId, employeeId)
        || codesMatch(row.employeeCode, employeeId)
        || codesMatch(row.employeeId, code);
    })
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  const settlement = matches[0] || null;
  const totals = settlement ? settlementTotals(settlement) : null;
  return {
    settlement,
    totals,
    profileHref: `/hris/employees/employee-profile/${encodeURIComponent(settlement?.employeeId || employeeId || code)}`,
    registerHref: settlement
      ? `/hris/offboarding/final-payroll-processing?id=${encodeURIComponent(settlement.id)}&period=${encodeURIComponent(settlement.period)}`
      : `/hris/offboarding/final-payroll-processing${period ? `?period=${encodeURIComponent(period)}` : ''}`,
    newSettlementHref: `/hris/offboarding/final-payroll-processing/new-settlement?employeeCode=${encodeURIComponent(code || employeeId)}`,
  };
};

export const buildFinalPayrollPayload = async (input?: {
  period?: string;
  selectedId?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  actor?: string;
}): Promise<FinalPayrollPayload> => {
  const period = input?.period || currentFinalPayrollPeriod();
  const actor = input?.actor || 'System';
  const all = await ensureSeededFromExit(period, actor);
  const settlements = all
    .filter((row) => row.period === period)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const priorPeriod = previousFinalPayrollPeriod(period);
  const prior = priorPeriod ? all.filter((row) => row.period === priorPeriod) : [];

  let selectedId = input?.selectedId || null;
  if (!selectedId && (input?.employeeCode || input?.employeeId)) {
    const hit = settlements.find((row) =>
      codesMatch(row.employeeCode, input.employeeCode)
      || codesMatch(row.employeeId, input.employeeId)
      || codesMatch(row.employeeCode, input.employeeId)
      || codesMatch(row.employeeId, input.employeeCode),
    );
    selectedId = hit?.id || null;
  }
  if (!selectedId) selectedId = settlements[0]?.id || null;
  const selected = settlements.find((row) => row.id === selectedId) || null;

  return {
    generatedAt: nowIso(),
    period,
    periodLabel: periodLabelFromCode(period),
    settlements,
    kpis: buildKpis(settlements, prior),
    tabCounts: tabCountsFor(settlements),
    selectedId,
    selected,
    filterOptions: {
      departments: [...new Set(settlements.map((row) => row.department).filter(Boolean))].sort(),
      exitTypes: [...new Set(settlements.map((row) => row.exitType).filter(Boolean))].sort(),
      statuses: ['Draft', 'Awaiting Clearance', 'Ready for Calculation', 'In Review', 'Awaiting Approval', 'Approved', 'Paid', 'Exception'],
    },
  };
};

export const createFinalPayrollSettlement = async (input: {
  actor: string;
  period?: string;
  employeeCode: string;
  exitType?: string;
  resignationDate?: string | null;
  lastWorkingDay?: string | null;
  noticePeriod?: string;
  reasonForLeaving?: string;
  remarks?: string;
}) => {
  const period = input.period || currentFinalPayrollPeriod();
  const code = compact(input.employeeCode).toUpperCase();
  if (!code) throw new Error('Employee code is required.');

  const all = await readJsonSettlements();
  const existing = all.find((row) => row.period === period && compact(row.employeeCode).toUpperCase() === code);
  if (existing) return existing;

  const exit = await readEmployeeExitStatusFromDb().catch(() => null);
  const exitRow = (exit?.records || []).find((row) => compact(row.employeeCode).toUpperCase() === code);
  const pay = await findEmployeePay(code);

  let settlement: FinalPayrollSettlement;
  if (exitRow) {
    settlement = settlementFromExit(exitRow, period, input.actor, pay);
  } else if (pay) {
    settlement = settlementFromExit(
      {
        id: pay.employeeId || code,
        employeeId: pay.employeeId || code,
        employeeCode: pay.employeeCode || code,
        employeeName: pay.fullName || code,
        jobTitle: pay.jobTitle || '—',
        department: pay.department || '—',
        division: pay.division || '',
        businessUnit: pay.businessUnit || '',
        costCenter: pay.costCenter || '',
        location: pay.location || '',
        managerName: pay.managerName || '',
        hrBusinessPartner: '',
        employmentType: pay.employmentType || 'Permanent',
        currentStatus: pay.status || 'Active',
        exitCategory: input.exitType || 'Resignation',
        exitStage: 'Payroll Closure',
        exitDate: input.lastWorkingDay || null,
        noticeDate: input.resignationDate || null,
        contractStartDate: pay.contractStartDate || null,
        contractEndDate: pay.contractEndDate || null,
        daysToExit: null,
        daysSinceExit: null,
        clearanceStatus: 'In Progress',
        payrollStatus: 'Final Settlement Due',
        accessStatus: 'Review Required',
        documentStatus: 'Partial',
        risk: 'Medium',
        riskReason: 'Final settlement created manually.',
        serviceYears: Number(pay.yearsOfService || 0),
        documentCount: Number(pay.documentCount || 0),
        emergencyContactCount: 0,
        lastUpdated: nowIso(),
      },
      period,
      input.actor,
      pay,
    );
  } else {
    throw new Error(`Employee ${code} was not found in the directory or exit register.`);
  }

  settlement = {
    ...settlement,
    status: 'Draft',
    exitType: input.exitType || settlement.exitType,
    resignationDate: input.resignationDate ?? settlement.resignationDate,
    lastWorkingDay: input.lastWorkingDay ?? settlement.lastWorkingDay,
    noticePeriod: input.noticePeriod || settlement.noticePeriod,
    reasonForLeaving: input.reasonForLeaving || '',
    remarks: input.remarks || '',
    approvalStages: defaultApprovalStages('Draft'),
    earnings: buildDefaultEarnings({
      period,
      currency: settlement.currency,
      basicSalary: settlement.basicSalary,
      lastWorkingDay: input.lastWorkingDay ?? settlement.lastWorkingDay,
    }),
  };

  all.push(settlement);
  await writeJsonSettlements(all);
  return settlement;
};

export const updateFinalPayrollSettlement = async (input: {
  id: string;
  actor: string;
  patch?: Partial<FinalPayrollSettlement>;
  action?: 'save' | 'recalculate' | 'submit' | 'approve' | 'return' | 'clarify' | 'mark-paid';
  comment?: string;
}) => {
  const all = await readJsonSettlements();
  const index = all.findIndex((row) => row.id === input.id);
  if (index < 0) throw new Error('Settlement not found.');
  let row = { ...all[index], ...(input.patch || {}) };

  if (input.action === 'recalculate') row = recalculateSettlement(row);
  if (input.action === 'submit') {
    row.status = row.clearance.some((item) => item.status === 'Pending') ? 'Awaiting Clearance' : 'In Review';
    row.approvalStages = defaultApprovalStages(row.status);
  }
  if (input.action === 'approve') {
    if (row.status === 'In Review') row.status = 'Awaiting Approval';
    else if (row.status === 'Awaiting Approval') row.status = 'Approved';
    else row.status = 'Approved';
    row.approvalStages = defaultApprovalStages(row.status);
  }
  if (input.action === 'return') {
    row.status = 'Ready for Calculation';
    row.approvalStages = defaultApprovalStages(row.status);
  }
  if (input.action === 'clarify') {
    row.status = 'Exception';
    row.approvalStages = defaultApprovalStages('In Review');
  }
  if (input.action === 'mark-paid') {
    row.status = 'Paid';
    row.approvalStages = defaultApprovalStages('Paid');
  }

  if (compact(input.comment)) {
    row.comments = [
      ...row.comments,
      {
        id: `cmt-${Date.now()}`,
        body: compact(input.comment),
        actor: input.actor,
        createdAt: nowIso(),
      },
    ];
  }

  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJsonSettlements(all);
  return row;
};

export const searchEmployeesForFinalPayroll = async (query: string, limit = 12) => {
  const q = compact(query).toLowerCase();
  if (q.length < 2) return [];
  const source = await readPayrollEmployees();
  return source.employees
    .filter((row) => {
      const blob = `${row.fullName} ${row.employeeCode} ${row.employeeId} ${row.department}`.toLowerCase();
      return blob.includes(q);
    })
    .slice(0, limit)
    .map((row) => ({
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.fullName,
      department: row.department,
      employmentType: row.employmentType,
      jobTitle: row.jobTitle,
      currency: /USD|US\$/i.test(String(row.payCurrency || '')) ? 'USD' as const : 'NGN' as const,
      basicSalary: Number(row.basicSalary || 0),
      dateOfJoining: row.contractStartDate || null,
      status: row.status,
    }));
};

export const settlementsToCsv = (settlements: FinalPayrollSettlement[]) => {
  const header = [
    'Employee',
    'Employee ID',
    'Department',
    'Exit Type',
    'Last Working Day',
    'Currency',
    'Gross Entitlement',
    'Deductions',
    'Statutory',
    'Final Net Pay',
    'Clearance',
    'Approval',
    'Status',
  ];
  const lines = settlements.map((row) => {
    const totals = settlementTotals(row);
    const clearance = row.clearance.every((item) => item.status === 'Completed') ? 'Cleared' : 'Pending';
    const approval = row.approvalStages.find((stage) => stage.status === 'In Review')?.label
      || (row.status === 'Approved' || row.status === 'Paid' ? 'Approved' : 'Pending');
    return [
      row.employeeName,
      row.employeeCode,
      row.department,
      row.exitType,
      formatFinalPayrollDate(row.lastWorkingDay),
      row.currency,
      totals.gross,
      totals.deductions,
      totals.statutory,
      totals.net,
      clearance,
      approval,
      row.status,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
  });
  return [header.join(','), ...lines].join('\n');
};
