import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { calculatePayrollEarnings, calculatePermanentUnionDues, resolvePayrollEarningProfile, taxablePayrollInputFromEmployee, type PayrollEarningsOptions, type PayrollEarningsResult } from '@/lib/payroll-earnings-engine';
import { contractEmployeeCode } from '@/lib/payroll-employee-classification';
import { hrisPayeFromEmployee, resolveSageAlignedAnnualRentRelief } from '@/lib/payroll-sage-pay-rules';

/**
 * Contract ("C" code) employees are taxed at a flat 5% of their monthly gross,
 * calculated month-on-month (not annualized and not run through the progressive
 * PAYE bands). This applies to enterprise-calculated periods going forward.
 */
export const CONTRACT_FLAT_PAYE_RATE = 0.05;

/** True when the employee is a contract ("C" code) employee on the flat monthly PAYE rate. */
export const usesContractFlatPaye = (employee?: DleEmployeeDirectoryRow) => Boolean(employee && contractEmployeeCode(employee));

export type TaxBand = { id: string; sequence: number; label: string; bandAmount: number | null; rate: number };
export type ConfigStatus = 'Draft' | 'Active' | 'Retired';
export type TaxComponentConfig = {
  id: string;
  label: string;
  enabled: boolean;
  preTax: boolean;
  calculationBasis: string;
  rate: number;
  monthlyCap?: number | null;
  annualCap?: number | null;
  minimumMonthlyBase?: number | null;
  appliesTo?: string[];
  requiresEmployeeEvidence?: boolean;
  priority: number;
};
export type PayrollTaxVersion = {
  id: string;
  name: string;
  status: ConfigStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  basis: string;
  notes: string;
  taxBands: TaxBand[];
  statutoryDeductions: TaxComponentConfig[];
  reliefs: TaxComponentConfig[];
  stateRules: Array<Record<string, unknown>>;
  regulatoryChanges: Array<Record<string, unknown>>;
};
export type PayrollTaxConfig = {
  schemaVersion: number;
  country: string;
  jurisdiction: string;
  activeVersionId: string;
  versions: PayrollTaxVersion[];
  audit: Array<Record<string, unknown>>;
};
export type PayrollTaxInput = {
  employee?: DleEmployeeDirectoryRow;
  earnings?: Pick<PayrollEarningsResult, 'paidEarningLines' | 'earningLines' | 'profileId'>;
  monthlyBasicPay?: number;
  monthlyBasePay: number;
  monthlyAllowances: number;
  monthlyGrossPay?: number;
  monthlyTaxablePay?: number;
  annualRent?: number;
  courtGarnisheeMonthly?: number;
  taxState?: string;
  asOf?: string;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const resolveConfigPath = () => {
  const candidates = [
    process.env.DLE_PAYROLL_TAX_CONFIG_PATH,
    process.env.DLE_HRIS_DATA_DIR ? path.join(process.env.DLE_HRIS_DATA_DIR, 'payroll-tax-config.json') : null,
    path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-tax-config.json'),
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'payroll-tax-config.json'),
    path.join(process.cwd(), 'data', 'hris', 'payroll-tax-config.json'),
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
};
const CONFIG_PATH = resolveConfigPath();
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const round4 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10000) / 10000;
const compact = (value: unknown) => String(value || '').trim();
const employeeType = (input: PayrollTaxInput) => compact(input.employee?.employmentType || input.employee?.staffCategory || input.employee?.employeeCategory || 'Payroll');
const normalizedTextKey = (value: unknown) => compact(value).toUpperCase().replace(/\s+/g, '');
const NHF_EXCLUDED_GRADES = new Set(['MGT6', 'SMGT10']);
const DEFAULT_ANNUAL_RENT_RELIEF = 500000;
const isNhfExcludedGrade = (employee?: DleEmployeeDirectoryRow) => {
  if (!employee) return false;
  return [employee.salaryGrade, employee.jobGrade].map(normalizedTextKey).some((grade) => NHF_EXCLUDED_GRADES.has(grade));
};
const employeeGradeKey = (employee?: DleEmployeeDirectoryRow) =>
  normalizedTextKey(employee?.salaryGrade || employee?.jobGrade || '');

/** Sage-aligned NHF: per-employee flag when set; otherwise junior grades default on, senior/management default off. */
export const defaultNhfApplicableForEmployee = (employee?: DleEmployeeDirectoryRow) => {
  if (!employee) return false;
  if (employee.nhfApplicable === true) return true;
  if (employee.nhfApplicable === false) return false;
  if (isNhfExcludedGrade(employee)) return false;
  const grade = employeeGradeKey(employee);
  if (/^(JS|JNR|JR)/.test(grade)) return true;
  if (/^(SS|SNR|MGT|SMGT|MGTCOLA|EXP)/.test(grade)) return false;
  return false;
};

export const defaultAnnualRentReliefForEmployee = (employee?: DleEmployeeDirectoryRow) => {
  if (!employee) return 0;
  const explicit = Number(employee.annualRentRelief);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const profileId = resolvePayrollEarningProfile(employee);
  if (profileId === 'stipend-non-taxable' || profileId === 'contract-day-rate' || profileId === 'contract-lumpsum') return 0;
  return DEFAULT_ANNUAL_RENT_RELIEF;
};

const resolveAnnualRentRelief = (component: TaxComponentConfig, input: PayrollTaxInput) => {
  const annualRentPaid = Math.max(0, Number(input.annualRent || input.employee?.annualRent || 0));
  const employeeRelief = Number(input.employee?.annualRentRelief);
  const statutoryCap = Number(component.annualCap || DEFAULT_ANNUAL_RENT_RELIEF);
  if (Number.isFinite(employeeRelief) && employeeRelief > 0) return employeeRelief;
  if (annualRentPaid > 0) return annualRentPaid * Number(component.rate || 0);
  if (component.requiresEmployeeEvidence === false) {
    const profileId = input.employee ? resolvePayrollEarningProfile(input.employee) : 'fallback';
    const monthlyTaxable = Math.max(0, Number(input.monthlyTaxablePay ?? (Number(input.monthlyBasePay || 0) + Number(input.monthlyAllowances || 0))));
    const category = profileId === 'contract-lumpsum' ? 'lumpsum' : String(profileId).startsWith('contract-') ? 'contract' : 'permanent';
    return resolveSageAlignedAnnualRentRelief({
      employee: input.employee,
      category,
      monthlyTaxable,
      payeRules: input.employee?.payeCalculation || null,
    });
  }
  return defaultAnnualRentReliefForEmployee(input.employee);
};

export const readPayrollTaxConfig = async (): Promise<PayrollTaxConfig> => {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as PayrollTaxConfig;
};

export const writePayrollTaxConfig = async (config: PayrollTaxConfig, actor: string) => {
  const next = {
    ...config,
    audit: [
      ...(Array.isArray(config.audit) ? config.audit : []),
      { at: new Date().toISOString(), actor, action: 'Payroll tax configuration updated', versionId: config.activeVersionId },
    ],
  };
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

export const activeTaxVersion = (config: PayrollTaxConfig, asOf = new Date().toISOString()) => {
  const asOfDate = asOf.slice(0, 10);
  const active = config.versions.find((version) => version.id === config.activeVersionId);
  if (active) return active;
  return config.versions
    .filter((version) => version.status === 'Active' && version.effectiveFrom <= asOfDate && (!version.effectiveTo || version.effectiveTo >= asOfDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
};

const appliesToEmployee = (component: TaxComponentConfig, input: PayrollTaxInput) => {
  if (!component.enabled) return false;
  if (!component.appliesTo?.length) return true;
  const type = employeeType(input).toLowerCase();
  return component.appliesTo.some((item) => type.includes(String(item).toLowerCase()));
};

const capAnnual = (amount: number, component: TaxComponentConfig) => {
  const monthlyCap = component.monthlyCap === null || component.monthlyCap === undefined ? null : Number(component.monthlyCap);
  const annualCap = component.annualCap === null || component.annualCap === undefined ? null : Number(component.annualCap);
  let capped = amount;
  if (Number.isFinite(monthlyCap as number) && monthlyCap !== null) capped = Math.min(capped, monthlyCap * 12);
  if (Number.isFinite(annualCap as number) && annualCap !== null) capped = Math.min(capped, annualCap);
  return Math.max(0, capped);
};

const calculateComponent = (component: TaxComponentConfig, input: PayrollTaxInput) => {
  const profileId = input.employee ? resolvePayrollEarningProfile(input.employee) : 'fallback';
  if (!appliesToEmployee(component, input)) return 0;
  if ((component.id === 'pension' || component.id === 'nhf') && String(profileId).startsWith('contract-')) return 0;
  if (component.id === 'nhf' && !defaultNhfApplicableForEmployee(input.employee)) return 0;
  if (component.id === 'union-dues' && input.employee) return calculatePermanentUnionDues(input.employee).amount * 12;
  const monthlyBasic = Math.max(0, Number(input.monthlyBasicPay || 0));
  const monthlyBase = Math.max(0, Number(input.monthlyBasePay || 0));
  const annualBase = monthlyBase * 12;
  const annualGross = Math.max(0, Number(input.monthlyTaxablePay ?? (Number(input.monthlyBasePay || 0) + Number(input.monthlyAllowances || 0))) * 12);
  if (component.id === 'pension') return roundMoney(capAnnual(annualBase * Number(component.rate || 0), component));
  const annualRent = Math.max(0, Number(input.annualRent || 0));
  const minimumBase = Number(component.minimumMonthlyBase || 0);
  if (minimumBase > 0 && monthlyBase < minimumBase) return 0;
  const rate = Number(component.rate || 0);
  let amount = 0;
  if (component.calculationBasis === 'percent_of_monthly_basic_annualized') amount = monthlyBasic * rate * 12;
  if (component.calculationBasis === 'percent_of_monthly_base_annualized') amount = monthlyBase * rate * 12;
  if (component.calculationBasis === 'percent_of_annual_gross') amount = annualGross * rate;
  if (component.calculationBasis === 'percent_of_annual_rent') {
    amount = resolveAnnualRentRelief(component, input);
  }
  if (component.calculationBasis === 'configured_employee_amount') amount = Number(input.courtGarnisheeMonthly || 0) * 12;
  if (component.calculationBasis === 'employer_statutory_tracking_only') amount = annualGross * rate;
  return roundMoney(capAnnual(amount, component));
};

export const calculatePayrollTax = (input: PayrollTaxInput, version: PayrollTaxVersion) => {
  const annualGrossIncome = roundMoney(Number(input.monthlyTaxablePay ?? (Number(input.monthlyBasePay || 0) + Number(input.monthlyAllowances || 0))) * 12);
  const statutoryItems = [...version.statutoryDeductions].sort((a, b) => a.priority - b.priority).map((config) => ({
    id: config.id,
    label: config.label,
    preTax: config.preTax,
    amount: calculateComponent(config, input),
    calculationBasis: config.calculationBasis,
  }));
  const reliefItems = [...version.reliefs].sort((a, b) => a.priority - b.priority).map((config) => ({
    id: config.id,
    label: config.label,
    preTax: config.preTax,
    amount: calculateComponent(config, input),
    calculationBasis: config.calculationBasis,
  }));
  const annualPreTaxDeductions = roundMoney(statutoryItems.filter((item) => item.preTax).reduce((sum, item) => sum + item.amount, 0));
  const annualReliefs = roundMoney(reliefItems.filter((item) => item.preTax).reduce((sum, item) => sum + item.amount, 0));
  const annualChargeableIncome = roundMoney(Math.max(0, annualGrossIncome - annualPreTaxDeductions - annualReliefs));
  let remaining = annualChargeableIncome;
  const bandResults = [...version.taxBands]
    .sort((a, b) => a.sequence - b.sequence)
    .map((band) => {
      const taxable = band.bandAmount === null ? remaining : Math.min(remaining, Math.max(0, Number(band.bandAmount)));
      const tax = taxable * Number(band.rate || 0);
      remaining = Math.max(0, remaining - taxable);
      return { ...band, taxable: roundMoney(taxable), tax: roundMoney(tax), rate: round4(Number(band.rate || 0)) };
    });
  const annualPaye = roundMoney(bandResults.reduce((sum, band) => sum + band.tax, 0));
  const postTaxDeductions = roundMoney(statutoryItems.filter((item) => !item.preTax).reduce((sum, item) => sum + item.amount, 0));
  const flatContractPaye = usesContractFlatPaye(input.employee);
  const monthlyGrossPay = roundMoney(
    Number(input.monthlyGrossPay ?? (Number(input.monthlyBasePay || 0) + Number(input.monthlyAllowances || 0))),
  );
  const enterprisePaye =
    !flatContractPaye && input.employee && input.earnings
      ? hrisPayeFromEmployee({
          employee: input.employee,
          earnings: input.earnings,
          nhfApplicable: defaultNhfApplicableForEmployee(input.employee),
        }).paye
      : null;
  const monthlyPaye = flatContractPaye
    ? roundMoney(Math.max(0, monthlyGrossPay) * CONTRACT_FLAT_PAYE_RATE)
    : enterprisePaye ?? roundMoney(annualPaye / 12);
  return {
    annualGrossIncome,
    annualPreTaxDeductions,
    annualReliefs,
    annualChargeableIncome,
    annualPaye: roundMoney(monthlyPaye * 12),
    monthlyPaye,
    annualPostTaxDeductions: postTaxDeductions,
    monthlyPostTaxDeductions: roundMoney(postTaxDeductions / 12),
    statutoryItems,
    reliefItems,
    bandResults,
  };
};

export const payrollInputFromEmployee = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions, earningsOverride?: PayrollEarningsResult): PayrollTaxInput => {
  const earnings = earningsOverride || calculatePayrollEarnings(employee, options);
  const taxInput = taxablePayrollInputFromEmployee(employee, options, earnings);
  const annualRentRelief = defaultAnnualRentReliefForEmployee(employee);
  return {
    ...taxInput,
    earnings,
    employee: {
      ...employee,
      annualRentRelief: annualRentRelief > 0 ? annualRentRelief : employee.annualRentRelief,
    },
    monthlyBasicPay: earnings.basicPay,
    annualRent: Math.max(0, Number(employee.annualRent || 0)),
    courtGarnisheeMonthly: 0,
  };
};
