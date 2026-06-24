import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { resolvePayrollEarningProfile } from '@/lib/payroll-earnings-engine';

const compact = (value: unknown) => String(value || '').trim();

export type ContractPayrollClassification = {
  isContractCode: boolean;
  isDailyRate: boolean;
  shouldDeactivate: boolean;
  payrollEligible: boolean;
  label: string;
  recommendation: string | null;
};

export const contractEmployeeCode = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'sourceEmployeeId'>) => {
  const code = compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId).toUpperCase();
  return /^C\d+/.test(code);
};

export const payrollCategoryText = (employee: DleEmployeeDirectoryRow) =>
  [employee.employmentType, employee.payrollGroup, employee.paymentRun, employee.paymentType, employee.staffCategory, employee.employeeCategory]
    .map(compact)
    .join(' ')
    .toLowerCase();

/** True when the employee is on attendance-driven daily / day-rate payroll. */
export const isDailyRatePayrollEmployee = (employee: DleEmployeeDirectoryRow, profileId?: string) => {
  if (profileId === 'contract-day-rate') return true;
  const text = payrollCategoryText(employee);
  if (/\bdaily\b|day\s*rate|dle\b/.test(text)) return true;
  if (contractEmployeeCode(employee) && Number(employee.ratePerDay || 0) > 0 && !Number(employee.periodSalary || 0)) return true;
  if (contractEmployeeCode(employee) && Number(employee.ratePerDay || 0) > 0 && /\bdaily\b|day\s*rate|dle\b/.test(text)) return true;
  return false;
};

/** C-coded staff who are not on daily-rate payroll should be inactive and excluded from payroll runs. */
export const isInactiveNonDailyContractEmployee = (employee: DleEmployeeDirectoryRow, profileId?: string) =>
  contractEmployeeCode(employee) && !isDailyRatePayrollEmployee(employee, profileId);

export const contractPayrollClassification = (employee: DleEmployeeDirectoryRow): ContractPayrollClassification => {
  const profileId = resolvePayrollEarningProfile(employee);
  const isContractCode = contractEmployeeCode(employee);
  const isDailyRate = isDailyRatePayrollEmployee(employee, profileId);
  const shouldDeactivate = isInactiveNonDailyContractEmployee(employee, profileId);
  const payrollEligible = !shouldDeactivate && !compact(employee.status).toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);
  let label = 'Not a contract code';
  let recommendation: string | null = null;
  if (isContractCode && isDailyRate) {
    label = 'Daily rate contract';
    recommendation = null;
  } else if (shouldDeactivate) {
    label = 'Contract — not daily rate';
    recommendation = 'Deactivate this employee or set up daily-rate payroll (employment type Daily Rate / DLE).';
  } else if (isContractCode) {
    label = 'Contract code';
  }
  return { isContractCode, isDailyRate, shouldDeactivate, payrollEligible, label, recommendation };
};

export const markInactiveNonDailyContractEmployees = (employees: DleEmployeeDirectoryRow[]) =>
  employees.map((employee) => {
    if (!isInactiveNonDailyContractEmployee(employee)) return employee;
    return {
      ...employee,
      status: 'Inactive',
      employmentType: employee.employmentType || 'Contract',
    };
  });

export const payrollActiveEmployees = (employees: DleEmployeeDirectoryRow[]) =>
  markInactiveNonDailyContractEmployees(employees).filter((employee) => !isInactiveNonDailyContractEmployee(employee));

export const withContractPayrollClassification = <T extends DleEmployeeDirectoryRow>(employee: T) => ({
  ...employee,
  payrollClassification: contractPayrollClassification(employee),
});
