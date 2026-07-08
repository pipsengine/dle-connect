import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isLeaveAllowancePaymentCode } from '@/lib/leave-allowance-policy';
import { normalizePayrollPeriod } from '@/lib/payroll-leave-allowance-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { isEnterprisePayrollPeriod, isSagePayrollRuntimeEnabled } from '@/lib/payroll-enterprise-source';
import { isSagePayeRefundEarning, shouldUseSagePayeRefundEarnings } from '@/lib/payroll-refund-policy';
import { invalidateEssPortalCache } from '@/lib/ess-portal-cache';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { isContractStyleEarningLine, isPermanentPayrollEmployee, permanentStyleSageEarnings } from '@/lib/payroll-employee-classification';
import {
  expandSagePayslipMatchKeys,
  normalizePayrollMatchKey,
  readActiveSagePayrollEmployees,
  readSageEmployeePayslipSnapshotsForPeriods,
} from '@/lib/sage-people-payroll-store';

export type PayrollPeriodEarningAdjustment = {
  period: string;
  employeeId?: string;
  employeeCode?: string;
  salaryGrades?: string[];
  profileIds?: string[];
  code: string;
  name: string;
  amount: number;
  taxable: boolean;
  source?: string;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

const STANDARD_PROFILE_EARNING_CODES = new Set([
  'JNR_BASIC', 'JNR_HOUSE', 'JNR_HOUSING', 'JNR_LEAVE', 'JNR_MEDICAL', 'JNR_MEDICALTAX',
  'JNR_OTHERALL', 'JNR_OTHERALLTAX', 'JNR_TRANS', 'JNR_TRANSPORT', 'JNR_UTILITY',
  'SNR_BASIC', 'SNR_HOUSE', 'SNR_HOUSING', 'SNR_LEAVE', 'SNR_MEDICAL', 'SNR_MEDICALTAX',
  'SNR_OTHERALL', 'SNR_OTHERALLTAX', 'SNR_TRANS', 'SNR_TRANSPORT', 'SNR_UTILITY', 'SNR_LEAVETAX',
  'SNR_NJIC', 'PER_MEAL',
  'MGT_BASIC', 'MGT_HOUSE', 'MGT_HOUSING', 'MGT_LEAVE', 'MGT_MEDICAL', 'MGT_MEDICALTAX',
  'MGT_OTHERALL', 'MGT_OTHERALLTAX', 'MGT_TRANS', 'MGT_TRANSPORT', 'MGT_UTILITY', 'MGT_FURN',
  'MGT_FURN_TAX', 'MGT_UTILITY_TAX', 'MGT_LEAVE_TAX', 'MGT_OTHALL_TAX',
  'MGT1COLA_BASIC', 'MGT1COLA_HOUSIN', 'MGT1COLA_LEAVE', 'MGT1COLA_MEDICAL', 'MGT1COLA_MEDTAX',
  'MGT1COLA_OTHALL', 'MGT1COLA_OTHALLTAX', 'MGT1COLA_TRANSP', 'MGT1COLA_FURN', 'MGT1COLA_UTILIT',
  'SNM_BASIC', 'SNM_HOUSE', 'SNM_HOUSING', 'SNM_LEAVE', 'SNM_MEDICAL', 'SNM_MEDICALTAX',
  'SNM_OTHERALL', 'SNM_OTHERALLTAX', 'SNM_TRANS', 'SNM_TRANSPORT', 'SNM_UTILITY', 'SNM_FURN',
  'JCWEEKDAY', 'JCWEEKDAY_NT', 'WEEKDAYOVT', 'PUBHOL', 'SATEARN', 'SUNDAYEARN',
  'STIPEND_NT', 'BASIC', 'ALLOWANCE', 'ARREARS', 'LTI', 'LT',
]);

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const ADJUSTMENTS_PATH = process.env.DLE_PAYROLL_EARNING_ADJUSTMENTS_PATH
  || (process.env.DLE_HRIS_DATA_DIR ? path.join(process.env.DLE_HRIS_DATA_DIR, 'payroll-period-earning-adjustments.json') : '')
  || path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-period-earning-adjustments.json');

export const isSupplementalSageEarningCode = (code?: string | null) => {
  const normalized = compact(code).toUpperCase();
  if (!normalized) return false;
  if (STANDARD_PROFILE_EARNING_CODES.has(normalized)) return false;
  if (isLeaveAllowancePaymentCode(normalized)) return false;
  return true;
};

const SAGE_PAYSLIP_EARNING_SYNC_SOURCE = 'Sage payslip period earning sync';
export const TIMESHEET_OT_POSTING_SOURCE = 'Timesheet OT Posting';
export const HR_ARREARS_POSTING_SOURCE = 'HR Arrears Approval';

export const isTimesheetOtPostingSource = (value?: string | null) =>
  compact(value) === TIMESHEET_OT_POSTING_SOURCE;

export const isHrArrearsPostingSource = (value?: string | null) =>
  compact(value) === HR_ARREARS_POSTING_SOURCE;

export const upsertPayrollPeriodEarningAdjustment = async (row: PayrollPeriodEarningAdjustment) => {
  const next: PayrollPeriodEarningAdjustment = {
    ...row,
    period: normalizePayrollPeriod(row.period),
    employeeCode: compact(row.employeeCode || row.employeeId),
    employeeId: compact(row.employeeId || row.employeeCode),
    code: compact(row.code).toUpperCase(),
    name: compact(row.name || row.code),
    amount: roundMoney(Number(row.amount || 0)),
    taxable: row.taxable !== false,
  };
  if (!next.period || !next.code) throw new Error('Period and earning code are required.');
  const current = await readPayrollPeriodEarningAdjustments();
  const byKey = new Map(current.map((item) => [adjustmentKey(item), item]));
  byKey.set(adjustmentKey(next), next);
  await writePayrollPeriodEarningAdjustments(Array.from(byKey.values()));
  invalidateEssPortalCache();
  onAdjustmentsChanged?.(next.period);
  return next;
};

export const removePayrollPeriodEarningAdjustments = async (filter: {
  period: string;
  source?: string;
  employeeCode?: string;
}) => {
  const period = normalizePayrollPeriod(filter.period);
  const source = compact(filter.source);
  const employeeCode = compact(filter.employeeCode).toUpperCase();
  const current = await readPayrollPeriodEarningAdjustments();
  const next = current.filter((row) => {
    if (normalizePayrollPeriod(row.period) !== period) return true;
    if (source && compact(row.source) !== source) return true;
    if (employeeCode && compact(row.employeeCode || row.employeeId).toUpperCase() !== employeeCode) return true;
    return false;
  });
  if (next.length === current.length) return { removed: 0, period };
  await writePayrollPeriodEarningAdjustments(next);
  invalidateEssPortalCache();
  onAdjustmentsChanged?.(period);
  return { removed: current.length - next.length, period };
};

export const periodEarningAdjustmentsForPeriod = async (period?: string, source?: string) => {
  const normalizedPeriod = normalizePayrollPeriod(period || activePayrollPeriod());
  const rows = await readPayrollPeriodEarningAdjustments();
  return rows.filter((row) => {
    if (normalizePayrollPeriod(row.period) !== normalizedPeriod) return false;
    if (source && compact(row.source) !== source) return false;
    return true;
  });
};

export const readPayrollPeriodEarningAdjustments = async (): Promise<PayrollPeriodEarningAdjustment[]> => {
  try {
    const parsed = JSON.parse(await readFile(ADJUSTMENTS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed as PayrollPeriodEarningAdjustment[] : [];
  } catch {
    return [];
  }
};
export const writePayrollPeriodEarningAdjustments = async (rows: PayrollPeriodEarningAdjustment[]) => {
  await mkdir(path.dirname(ADJUSTMENTS_PATH), { recursive: true });
  const sorted = [...rows].sort((left, right) =>
    `${left.period}-${left.employeeCode || left.employeeId}-${left.code}`.localeCompare(`${right.period}-${right.employeeCode || right.employeeId}-${right.code}`));
  await writeFile(ADJUSTMENTS_PATH, JSON.stringify(sorted, null, 2), 'utf8');
};

const adjustmentKey = (row: Pick<PayrollPeriodEarningAdjustment, 'period' | 'employeeCode' | 'employeeId' | 'code'>) =>
  `${normalizePayrollPeriod(row.period)}|${compact(row.employeeCode || row.employeeId).toUpperCase()}|${compact(row.code).toUpperCase()}`;

const employeeAdjustmentIdentity = (
  employeeCode: string,
  employee?: { employeeCode?: string; employeeId?: string; fullName?: string; sourceEmployeeId?: string | null },
) => {
  const code = compact(employee?.employeeCode || employeeCode || employee?.employeeId);
  const name = compact(employee?.fullName);
  if (code && name) return `${code} - ${name}`;
  return code || name;
};

export type SagePayrollSyncOptions = {
  contractEmployeesOnly?: boolean;
  /** Set true only for one-off migration scripts — never from runtime API/page loads. */
  migration?: boolean;
};

/** Migration-only: copies Sage payslip earning lines into local period adjustments JSON. */
export const syncSagePeriodEarningAdjustments = async (
  period?: string,
  options?: SagePayrollSyncOptions,
) => {
  const normalizedPeriod = normalizePayrollPeriod(period || activePayrollPeriod());
  if (!normalizedPeriod) {
    return { period: normalizedPeriod, synced: 0, changed: false, employees: 0 };
  }
  if (!options?.migration && !isSagePayrollRuntimeEnabled(normalizedPeriod)) {
    return { period: normalizedPeriod, synced: 0, changed: false, employees: 0 };
  }
  const enterprise = isEnterprisePayrollPeriod(normalizedPeriod);
  if (enterprise && !options?.migration && !options?.contractEmployeesOnly) {
    return { period: normalizedPeriod, synced: 0, changed: false, employees: 0 };
  }

  const [{ employees }, sageDirectory] = await Promise.all([
    readPayrollEmployees(),
    readActiveSagePayrollEmployees().catch(() => []),
  ]);
  const sageCodeById = new Map(
    sageDirectory.map((row) => [Number(row.employeeId), compact(row.employeeCodeDisplay || row.employeeCode || row.directoryEmployeeCode)]),
  );
  const employeeByKey = new Map<string, (typeof employees)[number]>();
  for (const employee of employees) {
    [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId]
      .map((value) => normalizePayrollMatchKey(value))
      .filter(Boolean)
      .forEach((key) => employeeByKey.set(key, employee));
  }

  const matchKeys = employees.flatMap((employee) => [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId]);
  const snapshots = await readSageEmployeePayslipSnapshotsForPeriods(
    expandSagePayslipMatchKeys(matchKeys),
    [normalizedPeriod],
  ).catch(() => []);

  const current = await readPayrollPeriodEarningAdjustments();
  const byKey = new Map(current.map((row) => [adjustmentKey(row), row]));
  let synced = 0;
  let changed = false;

  for (const snapshot of snapshots) {
    const directoryCode = sageCodeById.get(Number(snapshot.employeeId)) || '';
    const employee = employeeByKey.get(normalizePayrollMatchKey(directoryCode))
      || employeeByKey.get(normalizePayrollMatchKey(snapshot.employeeId))
      || null;
    const employeeCode = compact(employee?.employeeCode || directoryCode);
    if (!employeeCode) continue;
    const identity = employeeAdjustmentIdentity(employeeCode, employee || undefined);
    const hasStructural = permanentStyleSageEarnings(snapshot.earningLines);
    const permanentEmployee = employee ? isPermanentPayrollEmployee(employee) : hasStructural;
    if (enterprise && permanentEmployee) continue;

    for (const [key, row] of [...byKey.entries()]) {
      if (normalizePayrollPeriod(row.period) !== normalizedPeriod) continue;
      if (compact(row.employeeCode || row.employeeId) !== identity) continue;
      if (row.source !== SAGE_PAYSLIP_EARNING_SYNC_SOURCE) continue;
      byKey.delete(key);
      changed = true;
    }

    for (const line of snapshot.earningLines) {
      const code = compact(line.code);
      const amount = roundMoney(Number(line.amount || 0));
      if (!code || Math.abs(amount) < 0.004) continue;
      if (!shouldUseSagePayeRefundEarnings(normalizedPeriod) && isSagePayeRefundEarning(code, line.name)) continue;
      if (permanentEmployee && hasStructural && isContractStyleEarningLine({ code, name: line.name })) continue;
      const taxableAmount = line.taxableAmount === null || line.taxableAmount === undefined
        ? amount
        : roundMoney(Number(line.taxableAmount || 0));
      const next: PayrollPeriodEarningAdjustment = {
        period: normalizedPeriod,
        employeeId: identity,
        employeeCode: identity,
        code,
        name: compact(line.name || code),
        amount,
        taxable: Math.abs(taxableAmount) > 0.004,
        source: SAGE_PAYSLIP_EARNING_SYNC_SOURCE,
      };
      const key = adjustmentKey(next);
      const existing = byKey.get(key);
      if (existing && existing.amount === next.amount && existing.taxable === next.taxable && existing.name === next.name) continue;
      byKey.set(key, next);
      changed = true;
      synced += 1;
    }

    if (permanentEmployee && hasStructural) {
      for (const [key, row] of [...byKey.entries()]) {
        if (normalizePayrollPeriod(row.period) !== normalizedPeriod) continue;
        if (compact(row.employeeCode || row.employeeId) !== identity) continue;
        if (!isContractStyleEarningLine({ code: row.code, name: row.name })) continue;
        byKey.delete(key);
        changed = true;
      }
    }
  }

  if (!shouldUseSagePayeRefundEarnings(normalizedPeriod)) {
    for (const [key, row] of [...byKey.entries()]) {
      if (normalizePayrollPeriod(row.period) !== normalizedPeriod) continue;
      if (!isSagePayeRefundEarning(row.code, row.name)) continue;
      byKey.delete(key);
      changed = true;
    }
  }

  const cleaned = Array.from(byKey.values());
  if (changed) {
    await writePayrollPeriodEarningAdjustments(cleaned);
    invalidateEssPortalCache();
    onAdjustmentsChanged?.(normalizedPeriod);
  }
  return { period: normalizedPeriod, synced, changed, employees: snapshots.length };
};

const periodSyncInFlight = new Map<string, Promise<{ period: string; synced: number; changed: boolean; employees: number }>>();

let onAdjustmentsChanged: ((period: string) => void) | null = null;

/** Lets payroll calculation invalidate its cache when period adjustments are rewritten. */
export const registerPayrollAdjustmentsChangeHandler = (handler: (period: string) => void) => {
  onAdjustmentsChanged = handler;
};

/** Idempotent migration helper — does not run during normal payroll UI loads. */
export const ensureSagePeriodEarningAdjustments = async (
  period?: string,
  options?: SagePayrollSyncOptions,
) => {
  const normalizedPeriod = normalizePayrollPeriod(period || activePayrollPeriod());
  if (!normalizedPeriod || (!options?.migration && !isSagePayrollRuntimeEnabled(normalizedPeriod))) {
    return { period: normalizedPeriod, synced: 0, changed: false, employees: 0 };
  }
  const cacheKey = `${normalizedPeriod}:${options?.contractEmployeesOnly ? 'contract' : 'all'}:${options?.migration ? 'migration' : 'runtime'}`;
  const existing = periodSyncInFlight.get(cacheKey);
  if (existing) return existing;
  const task = syncSagePeriodEarningAdjustments(normalizedPeriod, options).finally(() => {
    periodSyncInFlight.delete(cacheKey);
  });
  periodSyncInFlight.set(cacheKey, task);
  return task;
};

export const syncSageSupplementalEarningAdjustments = async (period?: string, options?: SagePayrollSyncOptions) => {
  const normalizedPeriod = normalizePayrollPeriod(period || activePayrollPeriod());
  if (!normalizedPeriod || (!options?.migration && !isSagePayrollRuntimeEnabled(normalizedPeriod))) return [];
  const result = await syncSagePeriodEarningAdjustments(normalizedPeriod, options);
  if (!result.changed) {
    const [current] = await Promise.all([readPayrollPeriodEarningAdjustments()]);
    return current.filter((row) => normalizePayrollPeriod(row.period) === normalizedPeriod && isSupplementalSageEarningCode(row.code));
  }
  const merged = await readPayrollPeriodEarningAdjustments();
  return merged.filter((row) => normalizePayrollPeriod(row.period) === normalizedPeriod && isSupplementalSageEarningCode(row.code));
};

export const adjustmentsPathForDiagnostics = () => ADJUSTMENTS_PATH;
export const adjustmentsFileMtime = () => {
  try {
    if (!existsSync(ADJUSTMENTS_PATH)) return 0;
    return (statSync(ADJUSTMENTS_PATH) as { mtimeMs: number }).mtimeMs;
  } catch {
    return 0;
  }
};
