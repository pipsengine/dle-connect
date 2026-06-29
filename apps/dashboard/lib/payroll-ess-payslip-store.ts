import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { permanentStyleSageEarnings } from '@/lib/payroll-employee-classification';
import { isEnterprisePayrollPeriod } from '@/lib/payroll-enterprise-source';
import { readPayrollSnapshotsByPeriods, type PayrollRunSnapshot } from '@/lib/payroll-run-store';
import { normalizePayrollMatchKey, partitionSagePayslipLookupKeys, readSageEmployeePayslipSnapshotsForPeriods, type SageEmployeePayslipSnapshot } from '@/lib/sage-people-payroll-store';
import { sagePayslipAcceptableForEmployee, sanitizePermanentPayslipEarnings } from '@/lib/payroll-employee-classification';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const isPensionDeductionCode = (code: string) => {
  const upper = String(code || '').toUpperCase();
  return (upper.includes('PENSION') || upper === 'PENARR' || upper === 'VOLPENS') && upper !== 'SUSPENSION';
};

export const buildStoredEnterprisePayslipSnapshot = (
  employee: DleEmployeeDirectoryRow,
  period: string,
  options?: { permanentEmployee?: boolean },
): SageEmployeePayslipSnapshot | null => {
  const safePeriod = String(period || '').trim();
  if (!/^\d{4}-\d{2}$/.test(safePeriod)) return null;
  const storedPeriod = String(employee.sagePayslipPeriod || '').trim();
  if (storedPeriod !== safePeriod) return null;

  const earningLines = (employee.sagePayrollEarnings || [])
    .filter((line) => Math.abs(Number(line.amount || 0)) > 0.004)
    .map((line) => ({
      code: String(line.code || '').trim(),
      name: String(line.name || line.code || '').trim(),
      amount: roundMoney(Number(line.amount || 0)),
      taxableAmount: line.taxableAmount === null || line.taxableAmount === undefined ? null : roundMoney(Number(line.taxableAmount)),
      ytdTotal: line.ytdTotal === null || line.ytdTotal === undefined ? null : roundMoney(Number(line.ytdTotal)),
    }));
  if (!earningLines.length) return null;
  if (options?.permanentEmployee && !permanentStyleSageEarnings(earningLines)) return null;

  const deductionLines = (employee.sagePayrollDeductions?.lines || [])
    .filter((line) => Math.abs(Number(line.amount || 0)) > 0.004)
    .map((line) => ({
      code: String(line.code || '').trim(),
      name: String(line.name || line.code || '').trim(),
      amount: roundMoney(Number(line.amount || 0)),
      ytdTotal: line.ytdTotal === null || line.ytdTotal === undefined ? null : roundMoney(Number(line.ytdTotal)),
    }));

  const contributionLines = (employee.sagePayrollContributions?.lines || [])
    .filter((line) => Math.abs(Number(line.amount || 0)) > 0.004)
    .map((line) => ({
      code: String(line.code || '').trim(),
      name: String(line.name || line.code || '').trim(),
      amount: roundMoney(Number(line.amount || 0)),
      ytdTotal: line.ytdTotal === null || line.ytdTotal === undefined ? null : roundMoney(Number(line.ytdTotal)),
    }));

  const grossPay = roundMoney(earningLines.reduce((sum, line) => sum + line.amount, 0));
  const taxablePay = roundMoney(earningLines.reduce((sum, line) => {
    const taxableAmount = line.taxableAmount === null || line.taxableAmount === undefined ? line.amount : line.taxableAmount;
    return sum + taxableAmount;
  }, 0));
  const totalDeductions = roundMoney(
    deductionLines.length
      ? deductionLines.reduce((sum, line) => sum + line.amount, 0)
      : Number(employee.sagePayrollDeductions?.totalDeductions || employee.latestDeductions || 0),
  );
  const paye = roundMoney(
    deductionLines.filter((line) => String(line.code || '').toUpperCase() === 'PAYE').reduce((sum, line) => sum + line.amount, 0)
    || Number(employee.sagePayrollDeductions?.paye || 0),
  );
  const pensionEmployee = roundMoney(
    deductionLines.filter((line) => isPensionDeductionCode(line.code)).reduce((sum, line) => sum + line.amount, 0)
    || Number(employee.sagePayrollDeductions?.pensionEmployee || 0),
  );
  const nhf = roundMoney(
    deductionLines.filter((line) => String(line.code || '').toUpperCase() === 'NHF').reduce((sum, line) => sum + line.amount, 0)
    || Number(employee.sagePayrollDeductions?.nhf || 0),
  );
  const pensionEmployer = roundMoney(
    contributionLines.filter((line) => String(line.code || '').toUpperCase() === 'PENSION_ER').reduce((sum, line) => sum + line.amount, 0)
    || Number(employee.sagePayrollContributions?.pensionEmployer || 0),
  );
  const employerContributions = roundMoney(
    contributionLines.length
      ? contributionLines.reduce((sum, line) => sum + line.amount, 0)
      : Number(employee.sagePayrollContributions?.totalEmployerContributions || 0),
  );
  const netPay = roundMoney(
    Number(employee.sagePayrollDeductions?.netPay || 0) > 0
      ? Number(employee.sagePayrollDeductions?.netPay || 0)
      : Math.max(0, grossPay - totalDeductions),
  );
  const ytdGrossEarnings = roundMoney(earningLines.reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
  const ytdTaxPaid = roundMoney(deductionLines.filter((line) => String(line.code || '').toUpperCase() === 'PAYE').reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
  const ytdPensionContribution = roundMoney(deductionLines.filter((line) => isPensionDeductionCode(line.code)).reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
  const ytdDeductions = roundMoney(deductionLines.reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
  const ytdNetEarnings = roundMoney(ytdGrossEarnings - ytdDeductions);

  return {
    period: safePeriod,
    employeeId: employee.employeeDbId,
    payslipId: 0,
    lastCalcDate: employee.modifiedAt || null,
    earningLines,
    deductionLines,
    contributionLines,
    grossPay,
    taxablePay,
    totalDeductions,
    netPay,
    paye,
    pensionEmployee,
    nhf,
    pensionEmployer,
    employerContributions,
    ytdGrossEarnings,
    ytdTaxPaid,
    ytdPensionContribution,
    ytdDeductions,
    ytdNetEarnings,
  };
};

export const findPayrollCalculationRecord = (
  snapshot: PayrollRunSnapshot | null | undefined,
  matchKeys: string[],
): PayrollCalculationRecord | null => {
  if (!snapshot?.records?.length) return null;
  const keys = new Set(matchKeys.map((value) => normalizePayrollMatchKey(String(value ?? ''))).filter(Boolean));
  if (!keys.size) return null;
  return snapshot.records.find((record) => {
    const recordKeys = [
      record.employeeId,
      record.employeeCode,
      record.sageActual?.employeeCode,
      record.sageActual?.directoryEmployeeCode,
    ].map((value) => normalizePayrollMatchKey(String(value ?? ''))).filter(Boolean);
    return recordKeys.some((key) => keys.has(key));
  }) || null;
};

export async function readEnterpriseEmployeePayslipRecordsByPeriod(
  matchKeys: Array<string | number | null | undefined>,
  periods: string[],
): Promise<Map<string, PayrollCalculationRecord>> {
  const snapshots = await readPayrollSnapshotsByPeriods(periods);
  const keys = matchKeys.map((value) => normalizePayrollMatchKey(String(value ?? ''))).filter(Boolean);
  const byPeriod = new Map<string, PayrollCalculationRecord>();
  for (const [period, snapshot] of snapshots.entries()) {
    const record = findPayrollCalculationRecord(snapshot, keys);
    if (record) byPeriod.set(period, record);
  }
  return byPeriod;
}

export const computeEnterpriseYtdTotals = (
  period: string,
  periods: string[],
  recordsByPeriod: Map<string, PayrollCalculationRecord>,
) => {
  const year = period.slice(0, 4);
  const eligiblePeriods = periods.filter((item) => item.startsWith(year) && item <= period).sort();
  const sumField = (field: keyof Pick<PayrollCalculationRecord, 'grossPay' | 'paye' | 'pensionEmployee' | 'totalDeductions' | 'netPay'>) =>
    roundMoney(eligiblePeriods.reduce((sum, item) => sum + Number(recordsByPeriod.get(item)?.[field] || 0), 0));

  return {
    grossEarnings: sumField('grossPay'),
    taxPaid: sumField('paye'),
    pensionContribution: sumField('pensionEmployee'),
    deductions: sumField('totalDeductions'),
    netEarnings: sumField('netPay'),
  };
};

export async function readAuthoritativeSagePayslipSnapshotsByPeriod(
  matchKeys: Array<string | number | null | undefined>,
  periods: string[],
  options?: { nonPermanentPayroll?: boolean },
): Promise<Map<string, SageEmployeePayslipSnapshot>> {
  const preEnterprisePeriods = periods.filter((period) => !isEnterprisePayrollPeriod(period));
  if (!preEnterprisePeriods.length) return new Map();
  const snapshots = await readSageEmployeePayslipSnapshotsForPeriods(matchKeys, preEnterprisePeriods).catch(() => []);
  const nonPermanent = Boolean(options?.nonPermanentPayroll);
  const byPeriod = new Map<string, SageEmployeePayslipSnapshot>();
  for (const snapshot of snapshots) {
    if (sagePayslipAcceptableForEmployee(snapshot.earningLines, nonPermanent)) {
      const existing = byPeriod.get(snapshot.period);
      if (!existing || snapshot.grossPay > existing.grossPay) byPeriod.set(snapshot.period, snapshot);
      continue;
    }
    if (!nonPermanent) {
      const sanitizedLines = sanitizePermanentPayslipEarnings(snapshot.earningLines);
      if (!sanitizedLines.length || !sagePayslipAcceptableForEmployee(sanitizedLines, false)) continue;
      const grossPay = roundMoney(sanitizedLines.reduce((sum, line) => sum + Number(line.amount || 0), 0));
      const cleaned: SageEmployeePayslipSnapshot = { ...snapshot, earningLines: sanitizedLines, grossPay };
      const existing = byPeriod.get(snapshot.period);
      if (!existing || grossPay > existing.grossPay) byPeriod.set(snapshot.period, cleaned);
    }
  }
  return byPeriod;
};
