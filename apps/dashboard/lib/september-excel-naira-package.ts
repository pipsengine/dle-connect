import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';

/**
 * Naira payslips from the September 2026 salary schedule (PERM STAFF).
 * Applied from September 2026 so the payroll naira leg matches that workbook.
 */
export type SeptemberExcelNairaLine = {
  code: string;
  name: string;
  amount: number;
};

export type SeptemberExcelNairaPackage = {
  employeeCode: string;
  grossNgn: number;
  paye: number;
  /** Excel "Other Deductions". For the senior packages this is the pension refund taken back off the net. */
  otherDeduction: number;
  lines: SeptemberExcelNairaLine[];
};

const line = (code: string, name: string, amount: number): SeptemberExcelNairaLine => ({ code, name, amount });

const SENIOR_NAIRA = (basic: number, housing: number, transport: number, other: number, refund: number) => [
  line('BASIC', 'BASIC SALARY', basic),
  line('SNMHOUSINGTAX', 'SENIOR MANAGEMENT HOUSING_TAX', housing),
  line('SNMTRANSPTAX', 'SENIOR MANAGER TRANSPORT', transport),
  line('SNMOTHALLTAX', 'SENIOR MANAGEMENT OTHER ALLOWANCE_T', other),
  line('PENSION_REFUND', 'PENSION REFUND', refund),
];

export const SEPTEMBER_EXCEL_NAIRA_PACKAGES: SeptemberExcelNairaPackage[] = [
  {
    employeeCode: 'P0442',
    grossNgn: 6393380.73,
    paye: 1359887.56,
    otherDeduction: 222163.81,
    lines: SENIOR_NAIRA(1234243.38, 925682.54, 617121.69, 3394169.31, 222163.81),
  },
  {
    employeeCode: 'P0364',
    grossNgn: 6100527.02,
    paye: 1289218.23,
    otherDeduction: 211987.43,
    lines: SENIOR_NAIRA(1177707.92, 883280.94, 588853.96, 3238696.77, 211987.43),
  },
  {
    employeeCode: 'P0458',
    grossNgn: 6100527.02,
    paye: 1289218.23,
    otherDeduction: 211987.43,
    lines: SENIOR_NAIRA(1177707.92, 883280.94, 588853.96, 3238696.77, 211987.43),
  },
  {
    employeeCode: 'P0457',
    grossNgn: 2481637.88,
    paye: 443744.19,
    otherDeduction: 0,
    lines: [
      line('BASIC', 'BASIC SALARY', 640455.73),
      line('HOUSING', 'HOUSING', 512364.59),
      line('TRANSPORT', 'TRANSPORT ALLOWANCE', 384273.44),
      line('OTHERALL', 'OTHER ALLOWANCE', 742928.65),
      line('FURNITURE', 'FURNITURE', 102472.92),
      line('UTILITY', 'UTILITY', 99142.55),
    ],
  },
];

const periodKey = (period?: string | null) => {
  const match = String(period || '').match(/\d{4}-\d{2}/);
  return match ? match[0] : '';
};

const packageMatchesEmployee = (
  pack: SeptemberExcelNairaPackage,
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
) => {
  const codes = [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId]
    .map((value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);
  const target = pack.employeeCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const shortCode = target.replace(/^P/, '');
  return codes.some((code) => code === target || code === shortCode);
};

export const septemberExcelNairaPackageFor = (
  employee: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  },
  period?: string | null,
) => {
  const key = periodKey(period);
  if (key && key < '2026-09') return null;
  return SEPTEMBER_EXCEL_NAIRA_PACKAGES.find((pack) => packageMatchesEmployee(pack, employee)) || null;
};

export const applySeptemberExcelNairaPackage = <T extends DleEmployeeDirectoryRow>(employee: T, period?: string | null): T => {
  const pack = septemberExcelNairaPackageFor(employee, period);
  if (!pack) return employee;
  const earnings = pack.lines.map((item) => ({
    code: item.code,
    name: item.name,
    amount: item.amount,
    taxableAmount: item.amount,
    sourceAmount: item.amount,
    runFrequency: 'monthly' as const,
    includeInMonthlyPayroll: true,
  }));
  return {
    ...employee,
    hasDualCurrencyPayroll: true,
    localPayCurrency: 'NGN',
    localPayrollGroup: employee.localPayrollGroup || 'DLE',
    localPeriodSalary: pack.grossNgn,
    sageLocalPayrollEarnings: earnings as T['sageLocalPayrollEarnings'],
    payeCalculation: {
      ...(employee.payeCalculation || {}),
      includeRefundInTaxable: pack.lines.some((item) => item.code === 'PENSION_REFUND'),
      ngnMonthlyPayeOverride: pack.paye,
    },
  };
};
