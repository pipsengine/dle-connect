import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { isEnterprisePayrollPeriod } from '@/lib/payroll-enterprise-source';
import { readPayrollSnapshotsByPeriods, type PayrollRunSnapshot } from '@/lib/payroll-run-store';
import { normalizePayrollMatchKey, readSageEmployeePayslipSnapshotsForPeriods, type SageEmployeePayslipSnapshot } from '@/lib/sage-people-payroll-store';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const findPayrollCalculationRecord = (
  snapshot: PayrollRunSnapshot | null | undefined,
  matchKeys: string[],
): PayrollCalculationRecord | null => {
  if (!snapshot?.records?.length) return null;
  const keys = new Set(matchKeys.map(normalizePayrollMatchKey).filter(Boolean));
  return snapshot.records.find((record) =>
    keys.has(normalizePayrollMatchKey(record.employeeId))
    || keys.has(normalizePayrollMatchKey(record.employeeCode))
  ) || null;
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
): Promise<Map<string, SageEmployeePayslipSnapshot>> {
  const preEnterprisePeriods = periods.filter((period) => !isEnterprisePayrollPeriod(period));
  if (!preEnterprisePeriods.length) return new Map();
  const snapshots = await readSageEmployeePayslipSnapshotsForPeriods(matchKeys, preEnterprisePeriods).catch(() => []);
  return new Map(snapshots.map((snapshot) => [snapshot.period, snapshot]));
};
