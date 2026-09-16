import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';

const zeroCompanion = (companion: PayrollCalculationRecord['companionNgnPay']) => {
  if (!companion) return companion;
  return {
    ...companion,
    grossPay: 0,
    totalDeductions: 0,
    netPay: 0,
    employerCost: 0,
  };
};

const zeroLineAmounts = <T extends object>(lines: T[] | null | undefined): T[] =>
  (lines || []).map((line) => ({ ...line, amount: 0 }));

export const zeroPendingPayrollRecord = (record: PayrollCalculationRecord): PayrollCalculationRecord => ({
  ...record,
  basePay: 0,
  allowances: 0,
  grossPay: 0,
  periodPackageGross: 0,
  taxablePay: 0,
  nonTaxablePay: 0,
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
  deductions: 0,
  pension: 0,
  usdPackageGross: 0,
  companionNgnPay: zeroCompanion(record.companionNgnPay),
  earningLines: zeroLineAmounts(record.earningLines),
  annualBenefitLines: zeroLineAmounts(record.annualBenefitLines),
  deductionLines: zeroLineAmounts(record.deductionLines),
  sageActual: record.sageActual
    ? {
        ...record.sageActual,
        grossPay: 0,
        taxablePay: 0,
        paye: 0,
        pensionEmployee: 0,
        totalDeductions: 0,
        netPay: 0,
      }
    : record.sageActual,
  discrepancies: {
    ...record.discrepancies,
    grossVariance: 0,
    netVariance: 0,
    deductionVariance: 0,
  },
});

type PendingCalculation = {
  records: PayrollCalculationRecord[];
  summary: Record<string, unknown> & {
    basePay?: number;
    allowances?: number;
    grossPay?: number;
    totalDeductions?: number;
    deductions?: number;
    netPay?: number;
    employerCost?: number;
    sageGrossPay?: number;
    sageNetPay?: number;
    grossVariance?: number;
    netVariance?: number;
    scheduleNetPay?: number;
    scheduleGrossPay?: number;
  };
  breakdowns: {
    byPayrollGroup: Array<{ grossPay?: number; netPay?: number } & Record<string, unknown>>;
    byDepartment: Array<{ grossPay?: number; netPay?: number } & Record<string, unknown>>;
    byEmploymentType: Array<{ grossPay?: number; netPay?: number } & Record<string, unknown>>;
    byComponent: Array<{ amount?: number } & Record<string, unknown>>;
  };
};

/** New open months show headcount but no pay until Validate / Process Payroll is run. */
export const stripPendingPayrollAmounts = <T extends PendingCalculation>(calculation: T): T => ({
  ...calculation,
  records: calculation.records.map(zeroPendingPayrollRecord),
  summary: {
    ...calculation.summary,
    basePay: 0,
    allowances: 0,
    grossPay: 0,
    totalDeductions: 0,
    deductions: 0,
    netPay: 0,
    employerCost: 0,
    sageGrossPay: 0,
    sageNetPay: 0,
    grossVariance: 0,
    netVariance: 0,
    scheduleNetPay: 0,
    scheduleGrossPay: 0,
  },
  breakdowns: {
    ...calculation.breakdowns,
    byPayrollGroup: calculation.breakdowns.byPayrollGroup.map((item) => ({ ...item, grossPay: 0, netPay: 0 })),
    byDepartment: calculation.breakdowns.byDepartment.map((item) => ({ ...item, grossPay: 0, netPay: 0 })),
    byEmploymentType: calculation.breakdowns.byEmploymentType.map((item) => ({ ...item, grossPay: 0, netPay: 0 })),
    byComponent: calculation.breakdowns.byComponent.map((item) => ({ ...item, amount: 0 })),
  },
});
