import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { pensionablePayrollInputFromEmployee, resolvePayrollEarningProfile, type PayrollEarningsOptions } from '@/lib/payroll-earnings-engine';

export type PensionStatus = 'Draft' | 'Active' | 'Retired';
export type PensionRules = {
  employeeRate: number;
  employerRate: number;
  minimumCombinedRate: number;
  employerFullResponsibilityMinimumRate: number;
  voluntaryContributionRate: number;
  remittanceDueDays: number;
  basisComponents: string[];
  fallbackBasis: string;
  eligibleEmploymentTypes: string[];
  excludedEmploymentTypes: string[];
};
export type PensionVersion = {
  id: string;
  name: string;
  status: PensionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  basis: string;
  notes: string;
  rules: PensionRules;
  providers: Array<{ id: string; name: string; status: string; custodian: string }>;
  regulatoryChanges: Array<Record<string, unknown>>;
};
export type PensionConfig = {
  schemaVersion: number;
  country: string;
  jurisdiction: string;
  activeVersionId: string;
  versions: PensionVersion[];
  audit: Array<Record<string, unknown>>;
};
export type PensionInput = {
  employee: DleEmployeeDirectoryRow;
  monthlyBasePay: number;
  monthlyAllowances: number;
  voluntaryContributionMonthly?: number;
  providerId?: string;
  rsaPin?: string;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const resolveConfigPath = () => {
  const candidates = [
    process.env.DLE_PAYROLL_PENSION_CONFIG_PATH,
    process.env.DLE_HRIS_DATA_DIR ? path.join(process.env.DLE_HRIS_DATA_DIR, 'payroll-pension-config.json') : null,
    path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-pension-config.json'),
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'payroll-pension-config.json'),
    path.join(process.cwd(), 'data', 'hris', 'payroll-pension-config.json'),
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
};
const CONFIG_PATH = resolveConfigPath();
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();

export const readPayrollPensionConfig = async (): Promise<PensionConfig> => JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as PensionConfig;

export const writePayrollPensionConfig = async (config: PensionConfig, actor: string) => {
  const next = {
    ...config,
    audit: [...(Array.isArray(config.audit) ? config.audit : []), { at: new Date().toISOString(), actor, action: 'Payroll pension configuration updated', versionId: config.activeVersionId }],
  };
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

export const activePensionVersion = (config: PensionConfig, asOf = new Date().toISOString()) => {
  const asOfDate = asOf.slice(0, 10);
  return (
    config.versions.find((version) => version.id === config.activeVersionId) ||
    config.versions.filter((version) => version.status === 'Active' && version.effectiveFrom <= asOfDate && (!version.effectiveTo || version.effectiveTo >= asOfDate)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  );
};

export const pensionInputFromEmployee = (employee: DleEmployeeDirectoryRow, options?: PayrollEarningsOptions): PensionInput => {
  const earnings = pensionablePayrollInputFromEmployee(employee, options);
  return { employee, monthlyBasePay: earnings.monthlyBasePay, monthlyAllowances: earnings.monthlyAllowances };
};

export const calculatePension = (input: PensionInput, version: PensionVersion) => {
  const type = compact(input.employee.employmentType || input.employee.staffCategory || input.employee.employeeCategory);
  const typeLower = type.toLowerCase();
  const profileId = resolvePayrollEarningProfile(input.employee);
  const configEligible =
    !String(profileId).startsWith('contract-') &&
    version.rules.eligibleEmploymentTypes.some((item) => typeLower.includes(item.toLowerCase())) &&
    !version.rules.excludedEmploymentTypes.some((item) => typeLower.includes(item.toLowerCase()));
  const pensionableEmolument = roundMoney(Math.max(0, Number(input.monthlyBasePay || 0) + Number(input.monthlyAllowances || 0)));
  const eligible = configEligible;
  const employeeContribution = configEligible ? roundMoney(pensionableEmolument * Number(version.rules.employeeRate || 0)) : 0;
  const employerContribution = configEligible ? roundMoney(pensionableEmolument * Number(version.rules.employerRate || 0)) : 0;
  const voluntaryContribution = eligible ? roundMoney(Number(input.voluntaryContributionMonthly || 0) || pensionableEmolument * Number(version.rules.voluntaryContributionRate || 0)) : 0;
  const totalContribution = roundMoney(employeeContribution + employerContribution + voluntaryContribution);
  const combinedRate = pensionableEmolument ? roundMoney((employeeContribution + employerContribution) / pensionableEmolument) : 0;
  const issues: string[] = [];
  if (!eligible) issues.push('Employment type is not eligible under active pension configuration');
  if (eligible && pensionableEmolument <= 0) issues.push('Pensionable emolument is missing');
  if (eligible && combinedRate < version.rules.minimumCombinedRate) issues.push('Combined pension rate is below configured minimum');
  if (!compact(input.rsaPin)) issues.push('RSA PIN is not on file');
  if (!compact(input.providerId)) issues.push('PFA provider is not assigned');
  if (compact(input.employee.status).toLowerCase().match(/terminated|resigned|retired|inactive/)) issues.push('Employee is not payroll active');
  return {
    eligible,
    pensionableEmolument,
    employeeContribution,
    employerContribution,
    voluntaryContribution,
    totalContribution,
    combinedRate,
    monthlyRemittance: totalContribution,
    annualEmployeeContribution: roundMoney(employeeContribution * 12),
    annualEmployerContribution: roundMoney(employerContribution * 12),
    annualTotalContribution: roundMoney(totalContribution * 12),
    issues,
    status: issues.some((issue) => issue.includes('missing') || issue.includes('not payroll active')) ? 'Blocked' : issues.length ? 'Review' : 'Ready',
  };
};
