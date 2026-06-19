import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { calculatePayrollEarnings, resolvePayrollEarningProfile, type PayrollEarningsOptions } from '@/lib/payroll-earnings-engine';

export type FundStatus = 'Draft' | 'Active' | 'Retired';
export type FundPayer = 'Employee' | 'Employer';
export type StatutoryFundRule = {
  id: string;
  label: string;
  shortName: string;
  enabled: boolean;
  payer: FundPayer;
  deductFromEmployee: boolean;
  calculationBasis: string;
  rate: number;
  monthlyCap: number | null;
  annualCap: number | null;
  minimumMonthlyIncome: number;
  eligibilityMode: string;
  employeeThreshold?: number;
  turnoverThreshold?: number;
  eligibleEmploymentTypes: string[];
  remittanceFrequency: string;
  remittanceDueDay?: number;
  remittanceDueDate?: string;
  authority: string;
  accountingTreatment: string;
};
export type StatutoryFundsVersion = {
  id: string;
  name: string;
  status: FundStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  basis: string;
  notes: string;
  funds: StatutoryFundRule[];
  regulatoryChanges: Array<Record<string, unknown>>;
};
export type StatutoryFundsConfig = {
  schemaVersion: number;
  country: string;
  jurisdiction: string;
  activeVersionId: string;
  versions: StatutoryFundsVersion[];
  audit: Array<Record<string, unknown>>;
};
export type StatutoryFundInput = {
  employee: DleEmployeeDirectoryRow;
  monthlyBasePay: number;
  monthlyAllowances: number;
  organizationEmployeeCount: number;
  organizationAnnualTurnover?: number;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const CONFIG_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-statutory-funds-config.json');
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const normalizedTextKey = (value: unknown) => compact(value).toUpperCase().replace(/\s+/g, '');
const NHF_EXCLUDED_GRADES = new Set(['MGT6', 'MGT7', 'SMGT10']);
const isNhfExcludedGrade = (employee: DleEmployeeDirectoryRow) =>
  [employee.salaryGrade, employee.jobGrade].map(normalizedTextKey).some((grade) => NHF_EXCLUDED_GRADES.has(grade));

export const readStatutoryFundsConfig = async (): Promise<StatutoryFundsConfig> => JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as StatutoryFundsConfig;

export const writeStatutoryFundsConfig = async (config: StatutoryFundsConfig, actor: string) => {
  const next = {
    ...config,
    audit: [...(Array.isArray(config.audit) ? config.audit : []), { at: new Date().toISOString(), actor, action: 'NHF/NSITF/ITF configuration updated', versionId: config.activeVersionId }],
  };
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

export const activeStatutoryFundsVersion = (config: StatutoryFundsConfig, asOf = new Date().toISOString()) => {
  const asOfDate = asOf.slice(0, 10);
  return (
    config.versions.find((version) => version.id === config.activeVersionId) ||
    config.versions.filter((version) => version.status === 'Active' && version.effectiveFrom <= asOfDate && (!version.effectiveTo || version.effectiveTo >= asOfDate)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  );
};

export const statutoryFundInputFromEmployee = (employee: DleEmployeeDirectoryRow, organizationEmployeeCount: number, options?: PayrollEarningsOptions): StatutoryFundInput => {
  const earnings = calculatePayrollEarnings(employee, options);
  return { employee, monthlyBasePay: earnings.basicPay, monthlyAllowances: earnings.allowances, organizationEmployeeCount };
};

const cap = (amount: number, rule: StatutoryFundRule) => {
  let value = amount;
  if (rule.monthlyCap !== null && rule.monthlyCap !== undefined) value = Math.min(value, Number(rule.monthlyCap));
  if (rule.annualCap !== null && rule.annualCap !== undefined && rule.calculationBasis === 'percent_of_annual_payroll') value = Math.min(value, Number(rule.annualCap));
  return Math.max(0, value);
};

const eligible = (rule: StatutoryFundRule, input: StatutoryFundInput) => {
  if (!rule.enabled) return false;
  const profileId = resolvePayrollEarningProfile(input.employee);
  if (rule.id === 'nhf' && String(profileId).startsWith('contract-')) return false;
  if (rule.id === 'nhf' && input.employee.nhfApplicable === false) return false;
  if (rule.id === 'nhf' && input.employee.nhfApplicable !== true && isNhfExcludedGrade(input.employee)) return false;
  if (rule.id === 'nhf' && input.employee.nhfApplicable !== true && profileId === 'senior-permanent') return false;
  const type = compact(input.employee.employmentType || input.employee.staffCategory || input.employee.employeeCategory).toLowerCase();
  if (rule.eligibleEmploymentTypes.length && !rule.eligibleEmploymentTypes.some((item) => type.includes(item.toLowerCase()))) return false;
  if (Number(rule.minimumMonthlyIncome || 0) > 0 && input.monthlyBasePay < Number(rule.minimumMonthlyIncome)) return false;
  if (rule.eligibilityMode === 'employer_threshold') {
    const staffOk = input.organizationEmployeeCount >= Number(rule.employeeThreshold || 0);
    const turnoverOk = Number(input.organizationAnnualTurnover || 0) >= Number(rule.turnoverThreshold || 0);
    return staffOk || turnoverOk;
  }
  return true;
};

export const calculateStatutoryFunds = (input: StatutoryFundInput, version: StatutoryFundsVersion) => {
  const monthlyGross = roundMoney(Number(input.monthlyBasePay || 0) + Number(input.monthlyAllowances || 0));
  const monthlyBase = roundMoney(Number(input.monthlyBasePay || 0));
  const fundResults = version.funds.map((rule) => {
    const isEligible = eligible(rule, input);
    let amount = 0;
    if (isEligible && rule.calculationBasis === 'percent_of_monthly_base') amount = monthlyBase * Number(rule.rate || 0);
    if (isEligible && rule.calculationBasis === 'percent_of_monthly_emolument') amount = monthlyGross * Number(rule.rate || 0);
    if (isEligible && rule.calculationBasis === 'percent_of_annual_payroll') amount = (monthlyGross * 12 * Number(rule.rate || 0)) / 12;
    amount = roundMoney(cap(amount, rule));
    return {
      id: rule.id,
      label: rule.label,
      shortName: rule.shortName,
      payer: rule.payer,
      deductFromEmployee: rule.deductFromEmployee,
      eligible: isEligible,
      monthlyAmount: amount,
      annualAmount: roundMoney(amount * 12),
      rate: Number(rule.rate || 0),
      authority: rule.authority,
      remittanceFrequency: rule.remittanceFrequency,
      accountingTreatment: rule.accountingTreatment,
    };
  });
  const employeeDeductions = roundMoney(fundResults.filter((item) => item.deductFromEmployee).reduce((sum, item) => sum + item.monthlyAmount, 0));
  const employerCosts = roundMoney(fundResults.filter((item) => item.payer === 'Employer').reduce((sum, item) => sum + item.monthlyAmount, 0));
  const issues: string[] = [];
  if (monthlyGross <= 0) issues.push('Monthly payroll amount is missing');
  if (compact(input.employee.status).toLowerCase().match(/terminated|resigned|retired|inactive/)) issues.push('Employee is not payroll active');
  if (!fundResults.some((item) => item.eligible)) issues.push('No statutory fund eligibility matched this employee');
  return {
    monthlyBase,
    monthlyGross,
    fundResults,
    employeeDeductions,
    employerCosts,
    totalMonthlyStatutoryFunds: roundMoney(employeeDeductions + employerCosts),
    totalAnnualStatutoryFunds: roundMoney((employeeDeductions + employerCosts) * 12),
    issues,
    status: issues.some((issue) => issue.includes('missing') || issue.includes('not payroll active')) ? 'Blocked' : issues.length ? 'Review' : 'Ready',
  };
};
