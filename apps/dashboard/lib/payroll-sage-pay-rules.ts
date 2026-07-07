import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { PayrollEarningLine, PayrollEarningsResult, PayrollEarningProfileId } from '@/lib/payroll-earnings-engine';
import { splitEarningLinesForPaye } from '@/lib/payroll-earning-tax-classification';
import { isSagePayeRefundEarning } from '@/lib/payroll-refund-policy';

export type PayeCalculationRules = {
  excludedEarningCodes?: string[];
  includeRefundInTaxable?: boolean;
  disablePensionPayeRelief?: boolean;
  annualRentRelief?: number;
  usdFlatRate?: number;
  monthlyPayeOverride?: number;
};

export type SagePayeEarningLine = {
  code: string;
  name?: string;
  amount: number;
  taxableAmount?: number | null;
  taxable?: boolean;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export const normalizedGrade = (value: unknown) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export const isBasicEarningCode = (code: unknown) => {
  const upper = String(code || '').toUpperCase();
  if (upper === 'BASIC_LUMPSUM') return false;
  return /BASIC1_LUMPSUM|BASICSALARY|LUMPSUMTAX|EXP_BASIC|EXP_BASICTAX|_(BASIC)$|^BASIC$|_BASIC$|COLA_BASIC|MGT_BASIC|SNR_BASIC|JNR_BASIC/i.test(upper);
};

export const isHousingEarningCode = (code: unknown) => /HOUSE|HOUSIN|_HOUS$/i.test(String(code || '').toUpperCase());
export const isTransportEarningCode = (code: unknown) => {
  const upper = String(code || '').toUpperCase();
  if (/^TCM/.test(upper)) return false;
  return /TRANS/i.test(upper);
};

export const isPensionBhtEarningCode = (code: unknown) => {
  const upper = String(code || '').toUpperCase();
  if (/^TCM/.test(upper)) return false;
  return isBasicEarningCode(upper) || isHousingEarningCode(upper) || isTransportEarningCode(upper);
};

export const bhtFromEarningLines = (lines: SagePayeEarningLine[]) =>
  roundMoney(
    lines
      .filter((line) => isPensionBhtEarningCode(line.code))
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );

export const basicFromEarningLines = (lines: SagePayeEarningLine[]) =>
  roundMoney(lines.filter((line) => isBasicEarningCode(line.code)).reduce((sum, line) => sum + Number(line.amount || 0), 0));

const taxablePositive = (line: SagePayeEarningLine) => {
  if (line.taxableAmount !== null && line.taxableAmount !== undefined) {
    return Number(line.taxableAmount) > 0 ? Number(line.taxableAmount) : 0;
  }
  if (line.taxable === false) return 0;
  return Number(line.amount || 0) > 0 ? Number(line.amount || 0) : 0;
};

export const resolvePayeRules = (employee?: Pick<DleEmployeeDirectoryRow, 'payeCalculation'> | null): PayeCalculationRules | null =>
  employee?.payeCalculation && typeof employee.payeCalculation === 'object' ? employee.payeCalculation : null;

const payeCategoryFromProfile = (profileId?: PayrollEarningProfileId | string) => {
  if (profileId === 'contract-lumpsum') return 'lumpsum';
  if (String(profileId || '').startsWith('contract-')) return 'contract';
  if (profileId === 'stipend-non-taxable') return 'stipend';
  return 'permanent';
};

export const payeExcludedCodes = (
  salaryGrade: unknown,
  earningLines: SagePayeEarningLine[],
  category: string,
  payeRules: PayeCalculationRules | null,
) => {
  const excluded = new Set(['REFUND']);
  if (Array.isArray(payeRules?.excludedEarningCodes)) {
    payeRules.excludedEarningCodes.forEach((code) => excluded.add(String(code).toUpperCase()));
    return excluded;
  }
  if (category === 'permanent' && normalizedGrade(salaryGrade) === 'MGT7') {
    excluded.add('MGT_TRANS');
    excluded.add('MGT_UTILITY');
  }
  return excluded;
};

export const payeTaxableFromEarningLines = (
  lines: SagePayeEarningLine[],
  category: string,
  salaryGrade: unknown,
  payeRules: PayeCalculationRules | null = null,
) => {
  const excluded = payeExcludedCodes(salaryGrade, lines, category, payeRules);
  const includeRefund = false;

  if (/^EXP_USD|EXP_USDSNMGT|USD SENIOR/i.test(normalizedGrade(salaryGrade))) {
    return roundMoney(lines.reduce((sum, line) => sum + taxablePositive(line), 0));
  }

  if (category === 'lumpsum') {
    let monthly = roundMoney(
      lines.filter((line) => !excluded.has(String(line.code || '').toUpperCase())).reduce((sum, line) => sum + taxablePositive(line), 0),
    );
    if (includeRefund || monthly * 12 <= 876960) {
      monthly = roundMoney(
        monthly + lines.filter((line) => /^REFUND$/i.test(String(line.code || ''))).reduce((sum, line) => sum + Number(line.amount || 0), 0),
      );
    }
    return monthly;
  }

  const hasTaxableAmount = lines.some((line) => line.taxableAmount !== null && line.taxableAmount !== undefined);
  if (hasTaxableAmount) {
    let monthly = roundMoney(
      lines
        .filter((line) => !excluded.has(String(line.code || '').toUpperCase()))
        .reduce((sum, line) => {
          if (line.taxableAmount !== null && line.taxableAmount !== undefined) return sum + Number(line.taxableAmount || 0);
          return sum + Number(line.amount || 0);
        }, 0),
    );
    if (includeRefund) {
      monthly = roundMoney(
        monthly + lines.filter((line) => /^REFUND$/i.test(String(line.code || ''))).reduce((sum, line) => sum + Number(line.amount || 0), 0),
      );
    }
    return monthly;
  }

  const nonTaxableCodes = /^(PER_MEAL|PER_MEAL_JNR|SNR_NJIC|SNR_NTC|JNR_NJIC|REFUND)$/i;
  return roundMoney(
    lines
      .filter((line) => {
        const code = String(line.code || '').toUpperCase();
        if (excluded.has(code)) return false;
        if (line.taxable === false) return false;
        if (line.taxable === true) return Number(line.amount || 0) > 0;
        return !nonTaxableCodes.test(code) && Number(line.amount || 0) > 0;
      })
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );
};

export const lumpsumAnnualRentRelief = (monthlyTaxable: number) => {
  const annualTaxable = Math.max(0, Number(monthlyTaxable || 0) * 12);
  if (annualTaxable >= 2040000) return 500000;
  if (annualTaxable > 876960) return roundMoney(annualTaxable - 876960);
  return 0;
};

export const resolveSageAlignedAnnualRentRelief = (input: {
  employee?: DleEmployeeDirectoryRow;
  category: string;
  monthlyTaxable: number;
  payeRules?: PayeCalculationRules | null;
}) => {
  const payeRules = input.payeRules || resolvePayeRules(input.employee);
  if (Number.isFinite(Number(payeRules?.annualRentRelief))) return Number(payeRules?.annualRentRelief);
  if (input.category === 'stipend' || input.category === 'contract') return 0;
  if (input.category === 'lumpsum') return lumpsumAnnualRentRelief(input.monthlyTaxable);
  if (Number.isFinite(Number(input.employee?.annualRentRelief)) && Number(input.employee?.annualRentRelief) > 0) {
    return Number(input.employee?.annualRentRelief);
  }
  if (normalizedGrade(input.employee?.salaryGrade || input.employee?.jobGrade) === 'MGT7') return 400000;
  return 500000;
};

export const calculatePayeWithReliefs = (input: {
  monthlyTaxable: number;
  monthlyBht: number;
  monthlyBasic: number;
  nhfApplicable: boolean;
  rentRelief: number;
  includePensionRelief?: boolean;
  /** annualized: monthly × 12 → bands → ÷ 12 (fixed earnings). monthly-once: bands on this month only (variable earnings). */
  taxBasis?: 'annualized' | 'monthly-once';
}) => {
  const annualize = input.taxBasis !== 'monthly-once';
  const annualTaxable = annualize ? input.monthlyTaxable * 12 : input.monthlyTaxable;
  const annualPension =
    annualize && input.includePensionRelief !== false ? roundMoney(input.monthlyBht * 0.08 * 12) : 0;
  const annualNhf = annualize && input.nhfApplicable ? roundMoney(input.monthlyBasic * 0.025 * 12) : 0;
  const rentRelief = annualize ? input.rentRelief : 0;
  let chargeable = roundMoney(Math.max(0, annualTaxable - annualPension - annualNhf - rentRelief));
  const bands = [
    { amount: 800000, rate: 0 },
    { amount: 2200000, rate: 0.15 },
    { amount: 9000000, rate: 0.18 },
    { amount: 13000000, rate: 0.21 },
    { amount: 25000000, rate: 0.23 },
    { amount: null as number | null, rate: 0.25 },
  ];
  let remaining = chargeable;
  let annualPaye = 0;
  for (const band of bands) {
    const taxable = band.amount === null ? remaining : Math.min(remaining, Math.max(0, Number(band.amount)));
    annualPaye += taxable * band.rate;
    remaining = Math.max(0, remaining - taxable);
    if (remaining <= 0) break;
  }
  return annualize ? roundMoney(annualPaye / 12) : roundMoney(annualPaye);
};

export const calculateUsdSeniorManagementPaye = (monthlyTaxable: number, rate = 0.212) =>
  roundMoney(Math.max(0, Number(monthlyTaxable || 0)) * Number(rate));

const mapPayrollLines = (lines: PayrollEarningLine[]): SagePayeEarningLine[] =>
  lines.map((line) => ({
    code: line.code,
    name: line.name,
    amount: line.amount,
    taxableAmount: line.taxable === false ? 0 : line.amount,
    taxable: line.taxable,
  }));

const calculatePermanentSplitPaye = (input: {
  earningLines: SagePayeEarningLine[];
  employee: DleEmployeeDirectoryRow;
  category: string;
  salaryGrade: string;
  effectiveRules: PayeCalculationRules | null;
  nhfApplicable: boolean;
}) => {
  const payeLines = input.earningLines.filter((line) => !isSagePayeRefundEarning(line.code, line.name));
  const { fixed, variable } = splitEarningLinesForPaye(payeLines);
  const fixedTaxable = payeTaxableFromEarningLines(
    fixed,
    input.category,
    input.salaryGrade,
    input.effectiveRules,
  );
  const variableTaxable = payeTaxableFromEarningLines(
    variable,
    input.category,
    input.salaryGrade,
    input.effectiveRules,
  );
  const rentRelief = resolveSageAlignedAnnualRentRelief({
    employee: input.employee,
    category: input.category,
    monthlyTaxable: fixedTaxable,
    payeRules: input.effectiveRules,
  });
  const fixedPaye = calculatePayeWithReliefs({
    monthlyTaxable: fixedTaxable,
    monthlyBht: bhtFromEarningLines(fixed),
    monthlyBasic: basicFromEarningLines(fixed),
    nhfApplicable: input.nhfApplicable,
    rentRelief,
    includePensionRelief: input.category === 'permanent' && !input.effectiveRules?.disablePensionPayeRelief,
    taxBasis: 'annualized',
  });
  const variablePaye =
    variableTaxable > 0
      ? calculatePayeWithReliefs({
          monthlyTaxable: variableTaxable,
          monthlyBht: 0,
          monthlyBasic: 0,
          nhfApplicable: false,
          rentRelief: 0,
          includePensionRelief: false,
          taxBasis: 'monthly-once',
        })
      : 0;

  return {
    paye: roundMoney(fixedPaye + variablePaye),
    monthlyTaxable: roundMoney(fixedTaxable + variableTaxable),
    fixedTaxable,
    variableTaxable,
    fixedPaye,
    variablePaye,
  };
};

export const hrisPayeFromEmployee = (input: {
  employee: DleEmployeeDirectoryRow;
  earnings: Pick<PayrollEarningsResult, 'paidEarningLines' | 'earningLines' | 'profileId'>;
  nhfApplicable: boolean;
}) => {
  const paidLines = (input.earnings.paidEarningLines || input.earnings.earningLines || []) as PayrollEarningLine[];
  const earningLines = mapPayrollLines(paidLines);
  const category = payeCategoryFromProfile(input.earnings.profileId);
  const salaryGrade = input.employee.salaryGrade || input.employee.jobGrade;
  const payeRules = resolvePayeRules(input.employee);

  if (Number.isFinite(Number(payeRules?.monthlyPayeOverride))) {
    return {
      paye: roundMoney(Number(payeRules?.monthlyPayeOverride)),
      monthlyTaxable: payeTaxableFromEarningLines(earningLines, category, salaryGrade, payeRules),
    };
  }

  const grade = normalizedGrade(salaryGrade);
  if (/^EXP_USD|EXP_USDSNMGT|USD SENIOR/i.test(grade)) {
    const monthlyTaxable = payeTaxableFromEarningLines(earningLines, category, salaryGrade, payeRules);
    return {
      paye: calculateUsdSeniorManagementPaye(monthlyTaxable, Number(payeRules?.usdFlatRate || 0.212)),
      monthlyTaxable,
    };
  }

  const effectiveRules =
    payeRules ||
    (grade === 'MGT7' && category === 'permanent'
      ? { disablePensionPayeRelief: true, annualRentRelief: 400000 }
      : null);

  if (category === 'permanent') {
    return calculatePermanentSplitPaye({
      earningLines,
      employee: input.employee,
      category,
      salaryGrade: String(salaryGrade || ''),
      effectiveRules,
      nhfApplicable: input.nhfApplicable,
    });
  }

  const taxable = payeTaxableFromEarningLines(earningLines, category, salaryGrade, effectiveRules);
  const rentRelief = resolveSageAlignedAnnualRentRelief({
    employee: input.employee,
    category,
    monthlyTaxable: taxable,
    payeRules: effectiveRules,
  });

  const paye = calculatePayeWithReliefs({
    monthlyTaxable: taxable,
    monthlyBht: bhtFromEarningLines(earningLines),
    monthlyBasic: basicFromEarningLines(earningLines),
    nhfApplicable: false,
    rentRelief,
    includePensionRelief: false,
    taxBasis: 'annualized',
  });

  return {
    paye,
    monthlyTaxable: taxable,
    fixedTaxable: taxable,
    variableTaxable: 0,
    fixedPaye: paye,
    variablePaye: 0,
  };
};

export const payeTaxableFromPayrollEarnings = (
  employee: DleEmployeeDirectoryRow,
  earnings: Pick<PayrollEarningsResult, 'paidEarningLines' | 'earningLines' | 'profileId'>,
) => {
  const paidLines = (earnings.paidEarningLines || earnings.earningLines || []) as PayrollEarningLine[];
  const category = payeCategoryFromProfile(earnings.profileId);
  const payeRules = resolvePayeRules(employee);
  const grade = normalizedGrade(employee.salaryGrade || employee.jobGrade);
  const effectiveRules =
    payeRules ||
    (grade === 'MGT7' && category === 'permanent'
      ? { disablePensionPayeRelief: true, annualRentRelief: 400000 }
      : null);
  return payeTaxableFromEarningLines(mapPayrollLines(paidLines), category, employee.salaryGrade || employee.jobGrade, effectiveRules);
};
