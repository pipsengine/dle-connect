/**
 * Overlay approved final settlements onto Process Payroll for the settlement month.
 * Later periods stay excluded because the employee is Inactive + payroll-run excluded.
 */
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import {
  settlementTotals,
  type FinalPayrollLine,
  type FinalPayrollSettlement,
} from '@/lib/final-payroll-settlement-shared';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

const employeeKeys = (code?: string | null, id?: string | null, name?: string | null) => {
  const keys = new Set<string>();
  for (const raw of [code, id]) {
    const value = compact(raw).toUpperCase();
    if (!value) continue;
    keys.add(value);
    keys.add(value.replace(/^P/, ''));
  }
  const fullName = compact(name).toUpperCase();
  if (fullName) keys.add(fullName);
  return [...keys];
};

const includedAmount = (lines: FinalPayrollLine[], pattern: RegExp) =>
  roundMoney(
    (lines || [])
      .filter((line) => line.included && pattern.test(`${line.id} ${line.label}`))
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );

const overlayFromSettlement = (
  base: PayrollCalculationRecord | null,
  settlement: FinalPayrollSettlement,
  period: string,
): PayrollCalculationRecord => {
  const totals = settlementTotals(settlement);
  const grossPay = roundMoney(totals.gross);
  const totalDeductions = roundMoney(totals.deductions + totals.statutory);
  const netPay = roundMoney(totals.net);
  const grossSalary = includedAmount(settlement.earnings, /gross-salary|salary-lwd|basic/i);
  const basePay = roundMoney(grossSalary || Number(settlement.basicSalary || 0));
  const paye = includedAmount(settlement.statutory, /paye|tax/i);
  const pension = includedAmount(settlement.statutory, /pension/i);
  const nhf = includedAmount(settlement.statutory, /nhf/i);
  const loanRecovery = includedAmount(settlement.deductions, /loan|advance/i);
  const statutoryEmployee = roundMoney(Math.max(0, totals.statutory - paye - pension));
  const otherDeductions = roundMoney(Math.max(0, totals.deductions - loanRecovery));
  const currency = settlement.currency === 'USD' ? 'USD' : 'NGN';
  const earningLines = (settlement.earnings || [])
    .filter((line) => line.included && Number(line.amount || 0) > 0)
    .map((line) => ({
      code: line.id,
      name: line.label,
      amount: roundMoney(line.amount),
      taxable: !/gratuity|leave/i.test(`${line.id} ${line.label}`),
    }));
  const deductionLines = [...(settlement.deductions || []), ...(settlement.statutory || [])]
    .filter((line) => line.included && Number(line.amount || 0) > 0)
    .map((line) => ({
      code: line.id,
      label: line.label,
      amount: roundMoney(line.amount),
    }));

  const stub: PayrollCalculationRecord = base || {
    recordKey: `${period}-final-settlement-${settlement.employeeCode || settlement.employeeId}`,
    employeeId: settlement.employeeId || settlement.employeeCode,
    employeeCode: settlement.employeeCode || settlement.employeeId,
    fullName: settlement.employeeName,
    department: settlement.department,
    businessUnit: '',
    location: '',
    jobTitle: settlement.jobTitle,
    employmentType: settlement.employmentType,
    employmentStatus: 'Active',
    payrollGroup: currency === 'USD' ? 'DLE_USD' : 'DLE',
    salaryGrade: settlement.grade || 'Unassigned',
    payCurrency: currency,
    paymentRun: 'Monthly',
    basePay: 0,
    allowances: 0,
    grossPay: 0,
    taxablePay: 0,
    nonTaxablePay: 0,
    earningProfile: 'Final Settlement',
    earningProfileId: 'final-settlement',
    paye: 0,
    pensionEmployee: 0,
    pensionEmployer: 0,
    statutoryEmployee: 0,
    statutoryEmployer: 0,
    loanRecovery: 0,
    otherDeductions: 0,
    totalDeductions: 0,
    netPay: 0,
    employerCost: 0,
    deductionRatio: 0,
    timesheetDaysWorked: null,
    timesheetBookedHours: null,
    sageActual: null,
    discrepancies: { status: 'Matched', grossVariance: 0, netVariance: 0, deductionVariance: 0 },
    status: 'Ready',
    readinessStatus: 'Ready',
    issues: [],
    payrollStatus: 'Ready',
    riskSeverity: 'Low',
    exceptionCount: 0,
    exceptions: [],
    deferredWarnings: [],
    deductions: 0,
    pension: 0,
    isDailyRate: false,
    ratePerDay: null,
    ratePerHour: null,
    hoursPerDay: null,
    setupAssignedToPayroll: true,
    nhfApplicable: nhf > 0,
    salaryStructure: settlement.grade || 'Final Settlement',
    earningLines: [],
    annualBenefitLines: [],
    deductionLines: [],
  };

  return {
    ...stub,
    employeeId: stub.employeeId || settlement.employeeId || settlement.employeeCode,
    employeeCode: stub.employeeCode || settlement.employeeCode,
    fullName: settlement.employeeName || stub.fullName,
    department: settlement.department || stub.department,
    jobTitle: settlement.jobTitle || stub.jobTitle,
    employmentType: settlement.employmentType || stub.employmentType,
    employmentStatus: 'Active',
    payCurrency: currency,
    basePay,
    allowances: roundMoney(Math.max(0, grossPay - basePay)),
    grossPay,
    periodPackageGross: grossPay,
    taxablePay: grossPay,
    nonTaxablePay: 0,
    earningProfile: 'Final Settlement (HR Manager approved)',
    earningProfileId: stub.earningProfileId || 'final-settlement',
    paye,
    pensionEmployee: pension,
    pension: pension,
    statutoryEmployee,
    loanRecovery,
    otherDeductions,
    totalDeductions,
    deductions: totalDeductions,
    netPay,
    employerCost: roundMoney(grossPay + Number(stub.pensionEmployer || 0) + Number(stub.statutoryEmployer || 0)),
    deductionRatio: grossPay > 0 ? roundMoney((totalDeductions / grossPay) * 100) : 0,
    status: 'Ready',
    payrollStatus: 'Ready',
    readinessStatus: 'Ready',
    issues: [],
    exceptions: [],
    exceptionCount: 0,
    deferredWarnings: [],
    riskSeverity: 'Low',
    setupAssignedToPayroll: true,
    nhfApplicable: nhf > 0,
    earningLines,
    deductionLines,
  };
};

export const applyApprovedFinalSettlementsToRecords = async (
  records: PayrollCalculationRecord[],
  period: string,
): Promise<PayrollCalculationRecord[]> => {
  const { listApprovedFinalSettlementsForPeriod } = await import('@/lib/final-payroll-settlement-store');
  const settlements = await listApprovedFinalSettlementsForPeriod(period).catch(() => [] as FinalPayrollSettlement[]);
  if (!settlements.length) return records;

  const used = new Set<string>();
  const next = records.map((record) => {
    const keys = employeeKeys(record.employeeCode, record.employeeId);
    const settlement = settlements.find((row) => {
      const settlementKeys = employeeKeys(row.employeeCode, row.employeeId);
      if (!keys.some((key) => settlementKeys.includes(key))) return false;
      const currency = row.currency === 'USD' ? 'USD' : 'NGN';
      const recordCurrency = String(record.payCurrency || '').toUpperCase() === 'USD' ? 'USD' : 'NGN';
      if (currency === recordCurrency) return true;
      const samePerson = records.filter((item) =>
        employeeKeys(item.employeeCode, item.employeeId).some((key) => settlementKeys.includes(key)),
      );
      return samePerson.length === 1;
    });
    if (!settlement) return record;
    used.add(settlement.id);
    return overlayFromSettlement(record, settlement, period);
  });

  for (const settlement of settlements) {
    if (used.has(settlement.id)) continue;
    next.push(overlayFromSettlement(null, settlement, period));
  }
  return next;
};
