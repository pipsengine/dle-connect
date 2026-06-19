import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';

export type PayrollEmployeeOption = {
  employeeId: string;
  employeeCode?: string;
  nhfApplicable?: boolean;
  annualRentRelief?: number | null;
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

export const readPayrollEmployeeOptions = async (): Promise<PayrollEmployeeOption[]> => {
  for (const optionsPath of OPTIONS_PATHS) {
    try {
      const parsed = JSON.parse(await readFile(optionsPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Try the next configured/runtime location.
    }
  }
  return [];
};

export const writePayrollEmployeeOption = async (option: Omit<PayrollEmployeeOption, 'updatedAt'> & { updatedAt?: string }) => {
  const current = await readPayrollEmployeeOptions();
  const nextOption: PayrollEmployeeOption = { ...option, updatedAt: option.updatedAt || new Date().toISOString() };
  const keys = [nextOption.employeeId, nextOption.employeeCode].map(keyFor).filter(Boolean);
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
  options.forEach((option) => {
    [option.employeeId, option.employeeCode].map(keyFor).filter(Boolean).forEach((key) => byKey.set(key, option));
  });
  return employees.map((employee) => {
    const option = [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId].map(keyFor).map((key) => byKey.get(key)).find(Boolean);
    if (!option) return employee;
    return {
      ...employee,
      nhfApplicable: typeof option.nhfApplicable === 'boolean' ? option.nhfApplicable : employee.nhfApplicable,
      annualRentRelief: Number.isFinite(Number(option.annualRentRelief)) ? Number(option.annualRentRelief) : employee.annualRentRelief,
    };
  });
};
