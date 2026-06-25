import { calculatePayrollForPeriod, type PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { isPermanentPayrollEmployee } from '@/lib/payroll-employee-classification';
import { resolvePayrollEarningProfile } from '@/lib/payroll-earnings-engine';
import { payrollPeriodLabel } from '@/lib/payroll-period-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  normalizePayrollMatchKey,
  readSageEmployeePayslipSnapshotsForPeriods,
  readSagePayrollPeriodTotals,
  type SageEmployeePayslipSnapshot,
  type SagePayrollPeriodTotal,
} from '@/lib/sage-people-payroll-store';

export type PayrollReconciliationStatus = 'Matched' | 'Variance' | 'Missing Sage' | 'Missing Enterprise' | 'Wrong Profile' | 'Review';

export type PayrollReconciliationLineVariance = {
  code: string;
  name: string;
  sageAmount: number | null;
  enterpriseAmount: number | null;
  variance: number | null;
};

export type PayrollReconciliationRecord = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  salaryGrade: string;
  payrollGroup: string;
  earningProfileId: string;
  earningProfile: string;
  status: PayrollReconciliationStatus;
  issues: string[];
  sage: {
    grossPay: number;
    taxablePay: number;
    paye: number;
    pensionEmployee: number;
    nhf: number;
    totalDeductions: number;
    netPay: number;
    bht: number;
    earningCodes: string[];
  } | null;
  enterprise: {
    grossPay: number;
    taxablePay: number;
    paye: number;
    pensionEmployee: number;
    totalDeductions: number;
    netPay: number;
    bht: number;
    earningCodes: string[];
    payrollStatus: string;
  } | null;
  variance: {
    grossPay: number | null;
    netPay: number | null;
    paye: number | null;
    pensionEmployee: number | null;
    totalDeductions: number | null;
    bht: number | null;
  };
  lineVariances: PayrollReconciliationLineVariance[];
};

export type PayrollReconciliationResult = {
  generatedAt: string;
  referencePeriod: string;
  referencePeriodLabel: string;
  targetPeriod: string;
  targetPeriodLabel: string;
  summary: {
    employees: number;
    matched: number;
    variance: number;
    missingSage: number;
    missingEnterprise: number;
    wrongProfile: number;
    sageGrossPay: number;
    enterpriseGrossPay: number;
    grossVariance: number;
    sageNetPay: number;
    enterpriseNetPay: number;
    netVariance: number;
  };
  records: PayrollReconciliationRecord[];
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const moneyVariance = (expected: number | null | undefined, actual: number | null | undefined) => {
  if (expected === null || expected === undefined || actual === null || actual === undefined) return null;
  return roundMoney(Number(actual) - Number(expected));
};
const withinTolerance = (variance: number | null, tolerance = 1) => variance !== null && Math.abs(variance) <= tolerance;

const isBasicCode = (code: string) => {
  const upper = code.toUpperCase();
  if (upper === 'BASIC_LUMPSUM') return false;
  return /(^|_)BASIC($|_)|^BASIC$|_BASIC$|BASIC1_LUMPSUM/.test(upper) && !/LUMPSUM_NT|NON_TAX|NON TAX/i.test(code);
};
const isHousingCode = (code: string) => /HOUSE|HOUSING/i.test(code);
const isTransportCode = (code: string) => /TRANS|TRANSPORT/i.test(code);
const isContractDayRateCode = (code: string) => /^(JCWEEKDAY|JCWEEKDAY_NT|WEEKDAYOVT|SATEARN|SUNDAYEARN|PUBHOL)/i.test(code);

const bhtFromEarningLines = (lines: Array<{ code: string; amount: number }>) =>
  roundMoney(lines.filter((line) => isBasicCode(line.code) || isHousingCode(line.code) || isTransportCode(line.code)).reduce((sum, line) => sum + line.amount, 0));

const sageBht = (snapshot: SageEmployeePayslipSnapshot | SagePayrollPeriodTotal, lines?: SageEmployeePayslipSnapshot['earningLines']) => {
  if (lines?.length) return bhtFromEarningLines(lines);
  return 0;
};

const enterpriseBht = (record: PayrollCalculationRecord) => {
  const lines = (record.earningLines || []) as Array<{ code?: string; amount?: number }>;
  return bhtFromEarningLines(lines.map((line) => ({ code: compact(line.code), amount: Number(line.amount || 0) })));
};

const lineMapFromSage = (snapshot: SageEmployeePayslipSnapshot) =>
  new Map(snapshot.earningLines.map((line) => [line.code.toUpperCase(), line]));

const lineMapFromEnterprise = (record: PayrollCalculationRecord) => {
  const lines = (record.earningLines || []) as Array<{ code?: string; name?: string; amount?: number }>;
  return new Map(lines.map((line) => [compact(line.code).toUpperCase(), line]));
};

const buildLineVariances = (sageSnapshot: SageEmployeePayslipSnapshot | null, enterpriseRecord: PayrollCalculationRecord | null) => {
  if (!sageSnapshot || !enterpriseRecord) return [] as PayrollReconciliationLineVariance[];
  const sageLines = lineMapFromSage(sageSnapshot);
  const enterpriseLines = lineMapFromEnterprise(enterpriseRecord);
  const codes = Array.from(new Set([...sageLines.keys(), ...enterpriseLines.keys()])).sort();
  return codes.map((code) => {
    const sageLine = sageLines.get(code);
    const enterpriseLine = enterpriseLines.get(code);
    const sageAmount = sageLine ? roundMoney(sageLine.amount) : null;
    const enterpriseAmount = enterpriseLine ? roundMoney(Number(enterpriseLine.amount || 0)) : null;
    return {
      code,
      name: compact(enterpriseLine?.name || sageLine?.name || code),
      sageAmount,
      enterpriseAmount,
      variance: sageAmount !== null && enterpriseAmount !== null ? moneyVariance(sageAmount, enterpriseAmount) : null,
    };
  }).filter((line) => (line.sageAmount || 0) !== 0 || (line.enterpriseAmount || 0) !== 0);
};

const sageTotalsByKey = (rows: SagePayrollPeriodTotal[]) => {
  const map = new Map<string, SagePayrollPeriodTotal>();
  for (const row of rows) {
    [row.directoryEmployeeCode, row.employeeCode, String(row.employeeId)]
      .map(normalizePayrollMatchKey)
      .filter(Boolean)
      .forEach((key) => map.set(key, row));
  }
  return map;
};

const recordKeys = (record: Pick<PayrollCalculationRecord, 'employeeId' | 'employeeCode'>) =>
  [record.employeeId, record.employeeCode].map(normalizePayrollMatchKey).filter(Boolean);

const statusForRecord = (
  sage: SagePayrollPeriodTotal | null,
  enterprise: PayrollCalculationRecord | null,
  issues: string[],
): PayrollReconciliationStatus => {
  if (issues.some((issue) => /contract-style|wrong profile/i.test(issue))) return 'Wrong Profile';
  if (!sage) return 'Missing Sage';
  if (!enterprise) return 'Missing Enterprise';
  if (!issues.length) return 'Matched';
  if (issues.some((issue) => /variance/i.test(issue))) return 'Variance';
  return 'Review';
};

export const buildPayrollSageReconciliation = async (input: {
  referencePeriod: string;
  targetPeriod: string;
  employeeId?: string;
  detailLimit?: number;
}): Promise<PayrollReconciliationResult> => {
  const referencePeriod = compact(input.referencePeriod);
  const targetPeriod = compact(input.targetPeriod);
  const employeeFilter = compact(input.employeeId).toUpperCase();
  const detailLimit = Math.min(Math.max(input.detailLimit || 40, 1), 200);

  const [employeeSource, enterpriseCalculation, sageTotals] = await Promise.all([
    readPayrollEmployees(),
    calculatePayrollForPeriod(targetPeriod),
    readSagePayrollPeriodTotals(referencePeriod).catch(() => [] as SagePayrollPeriodTotal[]),
  ]);

  const sageByKey = sageTotalsByKey(sageTotals);
  const enterpriseByKey = new Map<string, PayrollCalculationRecord>();
  for (const record of enterpriseCalculation.records) {
    recordKeys(record).forEach((key) => enterpriseByKey.set(key, record));
  }

  const permanentEmployees = employeeSource.employees.filter((employee) => {
    if (!isPermanentPayrollEmployee(employee)) return false;
    if (!employeeFilter) return true;
    const keys = [employee.employeeId, employee.employeeCode].map((value) => compact(value).toUpperCase());
    return keys.includes(employeeFilter);
  });

  const detailKeys = permanentEmployees
    .slice(0, detailLimit)
    .flatMap((employee) => [employee.employeeId, employee.employeeCode])
    .filter(Boolean);
  const sageSnapshots = detailKeys.length
    ? await readSageEmployeePayslipSnapshotsForPeriods(detailKeys, [referencePeriod]).catch(() => [])
    : [];
  const sageSnapshotByEmployeeId = new Map<number, SageEmployeePayslipSnapshot>();
  for (const snapshot of sageSnapshots) {
    if (snapshot.period === referencePeriod) sageSnapshotByEmployeeId.set(snapshot.employeeId, snapshot);
  }

  const records: PayrollReconciliationRecord[] = permanentEmployees.map((employee) => {
    const keys = recordKeys({
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
    });
    const sageTotal = keys.map((key) => sageByKey.get(key)).find(Boolean) || null;
    const enterpriseRecord = keys.map((key) => enterpriseByKey.get(key)).find(Boolean) || null;
    const sageSnapshot = sageTotal ? sageSnapshotByEmployeeId.get(sageTotal.employeeId) || null : null;
    const profileId = resolvePayrollEarningProfile(employee);

    const sageEarningCodes = sageSnapshot?.earningLines.map((line) => line.code) || [];
    const enterpriseEarningCodes = ((enterpriseRecord?.earningLines || []) as Array<{ code?: string }>).map((line) => compact(line.code));
    const contractCodesOnPermanent = enterpriseEarningCodes.filter(isContractDayRateCode);
    const sageContractCodes = sageEarningCodes.filter(isContractDayRateCode);

    const sageSide = sageTotal ? {
      grossPay: roundMoney(Number(sageTotal.grossPay || 0)),
      taxablePay: roundMoney(Number(sageTotal.taxablePay || 0)),
      paye: roundMoney(Number(sageTotal.paye || 0)),
      pensionEmployee: roundMoney(Number(sageTotal.pensionEmployee || 0)),
      nhf: roundMoney(Number(sageTotal.nhf || 0)),
      totalDeductions: roundMoney(Number(sageTotal.totalDeductions || 0)),
      netPay: roundMoney(Number(sageTotal.netPay || 0)),
      bht: sageSnapshot ? bhtFromEarningLines(sageSnapshot.earningLines) : sageBht(sageTotal),
      earningCodes: sageEarningCodes,
    } : null;

    const enterpriseSide = enterpriseRecord ? {
      grossPay: roundMoney(enterpriseRecord.grossPay),
      taxablePay: roundMoney(enterpriseRecord.taxablePay),
      paye: roundMoney(enterpriseRecord.paye),
      pensionEmployee: roundMoney(enterpriseRecord.pensionEmployee),
      totalDeductions: roundMoney(enterpriseRecord.totalDeductions),
      netPay: roundMoney(enterpriseRecord.netPay),
      bht: enterpriseBht(enterpriseRecord),
      earningCodes: enterpriseEarningCodes,
      payrollStatus: enterpriseRecord.payrollStatus,
    } : null;

    const variance = {
      grossPay: sageSide && enterpriseSide ? moneyVariance(sageSide.grossPay, enterpriseSide.grossPay) : null,
      netPay: sageSide && enterpriseSide ? moneyVariance(sageSide.netPay, enterpriseSide.netPay) : null,
      paye: sageSide && enterpriseSide ? moneyVariance(sageSide.paye, enterpriseSide.paye) : null,
      pensionEmployee: sageSide && enterpriseSide ? moneyVariance(sageSide.pensionEmployee, enterpriseSide.pensionEmployee) : null,
      totalDeductions: sageSide && enterpriseSide ? moneyVariance(sageSide.totalDeductions, enterpriseSide.totalDeductions) : null,
      bht: sageSide && enterpriseSide ? moneyVariance(sageSide.bht, enterpriseSide.bht) : null,
    };

    const issues = [
      ...!sageSide ? [`No Sage payslip found for ${referencePeriod}`] : [],
      ...!enterpriseSide ? [`No enterprise payroll record for ${targetPeriod}`] : [],
      ...contractCodesOnPermanent.length ? [`Enterprise uses contract-style earning lines: ${contractCodesOnPermanent.join(', ')}`] : [],
      ...profileId === 'fallback' ? ['Permanent employee resolved to fallback earning profile — check salary grade mapping'] : [],
      ...profileId === 'contract-day-rate' ? ['Permanent employee misclassified as daily-rate contract'] : [],
      ...variance.grossPay !== null && !withinTolerance(variance.grossPay) ? [`Gross pay variance ${variance.grossPay}`] : [],
      ...variance.netPay !== null && !withinTolerance(variance.netPay) ? [`Net pay variance ${variance.netPay}`] : [],
      ...variance.paye !== null && !withinTolerance(variance.paye) ? [`PAYE variance ${variance.paye}`] : [],
      ...variance.pensionEmployee !== null && !withinTolerance(variance.pensionEmployee) ? [`Pension variance ${variance.pensionEmployee}`] : [],
      ...variance.bht !== null && !withinTolerance(variance.bht) ? [`BHT variance ${variance.bht}`] : [],
      ...sageContractCodes.length && !contractCodesOnPermanent.length ? [`Sage reference uses contract codes (${sageContractCodes.join(', ')}) but enterprise does not`] : [],
    ];

    return {
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.department,
      salaryGrade: employee.salaryGrade || employee.jobGrade || '',
      payrollGroup: employee.payrollGroup || '',
      earningProfileId: profileId,
      earningProfile: enterpriseRecord?.earningProfile || profileId,
      status: statusForRecord(sageTotal, enterpriseRecord, issues),
      issues,
      sage: sageSide,
      enterprise: enterpriseSide,
      variance,
      lineVariances: buildLineVariances(sageSnapshot, enterpriseRecord),
    };
  }).sort((a, b) => {
    const rank = (status: PayrollReconciliationStatus) => ({
      'Wrong Profile': 0,
      Variance: 1,
      'Missing Sage': 2,
      'Missing Enterprise': 3,
      Review: 4,
      Matched: 5,
    })[status];
    return rank(a.status) - rank(b.status) || a.employeeCode.localeCompare(b.employeeCode);
  });

  const summary = records.reduce(
    (totals, record) => {
      totals.employees += 1;
      totals.matched += record.status === 'Matched' ? 1 : 0;
      totals.variance += record.status === 'Variance' ? 1 : 0;
      totals.missingSage += record.status === 'Missing Sage' ? 1 : 0;
      totals.missingEnterprise += record.status === 'Missing Enterprise' ? 1 : 0;
      totals.wrongProfile += record.status === 'Wrong Profile' ? 1 : 0;
      totals.sageGrossPay += record.sage?.grossPay || 0;
      totals.enterpriseGrossPay += record.enterprise?.grossPay || 0;
      totals.sageNetPay += record.sage?.netPay || 0;
      totals.enterpriseNetPay += record.enterprise?.netPay || 0;
      return totals;
    },
    {
      employees: 0,
      matched: 0,
      variance: 0,
      missingSage: 0,
      missingEnterprise: 0,
      wrongProfile: 0,
      sageGrossPay: 0,
      enterpriseGrossPay: 0,
      grossVariance: 0,
      sageNetPay: 0,
      enterpriseNetPay: 0,
      netVariance: 0,
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    referencePeriod,
    referencePeriodLabel: payrollPeriodLabel(referencePeriod),
    targetPeriod,
    targetPeriodLabel: payrollPeriodLabel(targetPeriod),
    summary: {
      ...summary,
      sageGrossPay: roundMoney(summary.sageGrossPay),
      enterpriseGrossPay: roundMoney(summary.enterpriseGrossPay),
      grossVariance: roundMoney(summary.enterpriseGrossPay - summary.sageGrossPay),
      sageNetPay: roundMoney(summary.sageNetPay),
      enterpriseNetPay: roundMoney(summary.enterpriseNetPay),
      netVariance: roundMoney(summary.enterpriseNetPay - summary.sageNetPay),
    },
    records,
  };
};
