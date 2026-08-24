import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';

export type PayrollEmployeeOption = {
  employeeId: string;
  employeeCode?: string;
  nhfApplicable?: boolean;
  nhfNumber?: string | null;
  annualRentRelief?: number | null;
  /** Fixed monthly additional employee pension (PENSION_EE2 / voluntary). */
  additionalEmployeePensionMonthly?: number | null;
  payeCalculation?: {
    excludedEarningCodes?: string[];
    includeRefundInTaxable?: boolean;
    disablePensionPayeRelief?: boolean;
    annualRentRelief?: number;
    usdFlatRate?: number;
    monthlyPayeOverride?: number;
    ngnMonthlyPayeOverride?: number;
  };
  payrollGroup?: string;
  salaryGrade?: string;
  jobGrade?: string;
  healthInsurancePlan?: string | null;
  benefitGroup?: string | null;
  setupAssignedToPayroll?: boolean;
  excludedFromPayrollRun?: boolean;
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  hoursPerDay?: number | null;
  updatedAt: string;
  updatedBy?: string;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const resolveRuntimeDataDirs = () => {
  const cwd = process.cwd();
  const dirs = [path.join(cwd, 'data', 'hris')];
  if (path.basename(cwd).toLowerCase() === 'site') {
    dirs.push(path.join(path.dirname(cwd), 'runtime-data', 'hris'));
  }
  dirs.push(path.join(cwd, 'runtime-data', 'hris'));
  return dirs;
};

const resolveOptionsPaths = () => {
  const candidates = [
    process.env.DLE_PAYROLL_EMPLOYEE_OPTIONS_PATH,
    process.env.DLE_HRIS_DATA_DIR ? path.join(process.env.DLE_HRIS_DATA_DIR, 'payroll-employee-options.json') : null,
    ...resolveRuntimeDataDirs().map((dir) => path.join(dir, 'payroll-employee-options.json')),
    path.join(resolveDashboardRoot(), 'data', 'hris', 'payroll-employee-options.json'),
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'payroll-employee-options.json'),
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates.map((candidate) => path.resolve(candidate))));
};

const OPTIONS_PATHS = resolveOptionsPaths();
const compact = (value: unknown) => String(value || '').trim();
const keyFor = (value: unknown) => compact(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const OPTIONS_CACHE_MS = Number(process.env.HRIS_PAYROLL_OPTIONS_CACHE_MS || 300000);
let optionsCache: { expiresAt: number; value: PayrollEmployeeOption[] } | null = null;

export const invalidatePayrollEmployeeOptionsCache = () => {
  optionsCache = null;
};

export const readPayrollEmployeeOptions = async (): Promise<PayrollEmployeeOption[]> => {
  const now = Date.now();
  if (optionsCache && optionsCache.expiresAt > now) return optionsCache.value;
  for (const optionsPath of OPTIONS_PATHS) {
    try {
      const parsed = JSON.parse(await readFile(optionsPath, 'utf8'));
      const value = Array.isArray(parsed) ? parsed : [];
      optionsCache = { value, expiresAt: Date.now() + OPTIONS_CACHE_MS };
      return value;
    } catch {
      // Try the next configured/runtime location.
    }
  }
  return [];
};

export const writePayrollEmployeeOption = async (option: Omit<PayrollEmployeeOption, 'updatedAt'> & { updatedAt?: string }) => {
  const current = await readPayrollEmployeeOptions();
  const keys = [option.employeeId, option.employeeCode].map(keyFor).filter(Boolean);
  const previous = current.find((item) => [item.employeeId, item.employeeCode].map(keyFor).some((key) => keys.includes(key)));
  const nextOption: PayrollEmployeeOption = { ...previous, ...option, updatedAt: option.updatedAt || new Date().toISOString() };
  const next = current.filter((item) => ![item.employeeId, item.employeeCode].map(keyFor).some((key) => keys.includes(key)));
  next.push(nextOption);
  const payload = JSON.stringify(next.sort((a, b) => keyFor(a.employeeId).localeCompare(keyFor(b.employeeId))), null, 2);
  let lastError: unknown = null;
  const writePaths = [
    ...OPTIONS_PATHS.filter((optionsPath) => existsSync(optionsPath)),
    ...OPTIONS_PATHS.filter((optionsPath) => !existsSync(optionsPath)),
  ];
  for (const optionsPath of writePaths) {
    try {
      await mkdir(path.dirname(optionsPath), { recursive: true });
      await writeFile(optionsPath, payload, 'utf8');
      optionsCache = { value: next, expiresAt: Date.now() + OPTIONS_CACHE_MS };
      return nextOption;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

export const applyPayrollEmployeeOptions = async (employees: DleEmployeeDirectoryRow[]) => {
  const options = await readPayrollEmployeeOptions();
  if (!options.length) return employees;
  const byKey = new Map<string, PayrollEmployeeOption>();
  const registerOptionKeys = (option: PayrollEmployeeOption) => {
    for (const raw of [option.employeeId, option.employeeCode]) {
      const text = compact(raw).toUpperCase();
      if (!text) continue;
      const normalized = text.replace(/[^A-Z0-9]/g, '');
      byKey.set(keyFor(text), option);
      byKey.set(normalized, option);
      const prefixed = normalized.match(/^([PLC])(\d+)$/);
      if (prefixed) {
        const [, prefix, digits] = prefixed;
        byKey.set(`${prefix}${digits}`, option);
        // Permanent P-codes may also be stored as bare digits in Sage exports.
        // Never cross-map C↔L (C2786 must not exclude L2786).
        if (prefix === 'P') {
          byKey.set(digits, option);
          byKey.set(`P${digits}`, option);
        }
      } else if (/^\d+$/.test(normalized)) {
        byKey.set(normalized, option);
        byKey.set(`P${normalized}`, option);
      }
    }
  };
  options.forEach((option) => registerOptionKeys(option));
  const optionForEmployee = (employee: DleEmployeeDirectoryRow) => {
    const keys = new Set<string>();
    for (const raw of [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId]) {
      const text = compact(raw).toUpperCase();
      if (!text) continue;
      const normalized = text.replace(/[^A-Z0-9]/g, '');
      keys.add(keyFor(text));
      keys.add(normalized);
      const prefixed = normalized.match(/^([PLC])(\d+)$/);
      if (prefixed) {
        const [, prefix, digits] = prefixed;
        keys.add(`${prefix}${digits}`);
        if (prefix === 'P') {
          keys.add(digits);
          keys.add(`P${digits}`);
        }
      } else if (/^\d+$/.test(normalized)) {
        keys.add(normalized);
        keys.add(`P${normalized}`);
      }
    }
    return [...keys].map((key) => byKey.get(key)).find(Boolean);
  };
  return employees.map((employee) => {
    const option = optionForEmployee(employee);
    if (!option) return employee;
    return {
      ...employee,
      nhfApplicable: typeof option.nhfApplicable === 'boolean' ? option.nhfApplicable : employee.nhfApplicable,
      annualRentRelief: Number.isFinite(Number(option.annualRentRelief)) ? Number(option.annualRentRelief) : employee.annualRentRelief,
      additionalEmployeePensionMonthly: Number.isFinite(Number(option.additionalEmployeePensionMonthly))
        ? Number(option.additionalEmployeePensionMonthly)
        : employee.additionalEmployeePensionMonthly,
      payeCalculation: option.payeCalculation || employee.payeCalculation,
      payrollGroup: option.payrollGroup || employee.payrollGroup,
      salaryGrade: option.salaryGrade || employee.salaryGrade,
      jobGrade: option.jobGrade || employee.jobGrade,
      benefitGroup: option.benefitGroup || employee.benefitGroup,
      healthInsurancePlan: option.healthInsurancePlan || (employee as DleEmployeeDirectoryRow & { healthInsurancePlan?: string | null }).healthInsurancePlan,
      setupAssignedToPayroll: typeof option.setupAssignedToPayroll === 'boolean' ? option.setupAssignedToPayroll : employee.setupAssignedToPayroll,
      excludedFromPayrollRun: typeof option.excludedFromPayrollRun === 'boolean' ? option.excludedFromPayrollRun : (employee as DleEmployeeDirectoryRow & { excludedFromPayrollRun?: boolean }).excludedFromPayrollRun,
      ratePerDay: option.ratePerDay !== undefined && option.ratePerDay !== null && Number.isFinite(Number(option.ratePerDay)) ? Number(option.ratePerDay) : employee.ratePerDay,
      ratePerHour: option.ratePerHour !== undefined && option.ratePerHour !== null && Number.isFinite(Number(option.ratePerHour)) ? Number(option.ratePerHour) : employee.ratePerHour,
      hoursPerDay: option.hoursPerDay !== undefined && option.hoursPerDay !== null && Number.isFinite(Number(option.hoursPerDay)) ? Number(option.hoursPerDay) : employee.hoursPerDay,
    };
  });
};
