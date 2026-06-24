import { contractPayrollClassification, isInactiveNonDailyContractEmployee, type ContractPayrollClassification } from '@/lib/payroll-employee-classification';
import { updateEmployeeContractPayrollClassificationInDb } from '@/lib/dle-enterprise-db';
import { invalidatePayrollEmployeeCache, readDirectoryEmployees } from '@/lib/payroll-employee-source';

export type ContractPayrollClassificationAction = 'deactivate-non-daily' | 'activate-daily-rate';

const matchEmployee = (employeeId: string, row: { employeeId: string; employeeCode: string }) => {
  const key = employeeId.trim().toLowerCase();
  return row.employeeCode.toLowerCase() === key || row.employeeId.toLowerCase() === key;
};

export const findDirectoryEmployee = async (employeeId: string) => {
  const source = await readDirectoryEmployees();
  return source.employees.find((row) => matchEmployee(employeeId, row)) || null;
};

export const applyContractPayrollClassification = async (input: {
  employeeId: string;
  action: ContractPayrollClassificationAction;
  reason?: string;
}): Promise<{ employeeId: string; classification: ContractPayrollClassification; persisted: boolean }> => {
  const employee = await findDirectoryEmployee(input.employeeId);
  if (!employee) throw new Error('Employee not found in directory.');
  if (!employee.employeeDbId) throw new Error('Employee database record is unavailable. Classification cannot be saved.');

  if (input.action === 'deactivate-non-daily' && !isInactiveNonDailyContractEmployee(employee)) {
    throw new Error('This employee is already on daily-rate payroll or is not a C-code contract.');
  }
  if (input.action === 'activate-daily-rate' && !/^[Cc]\d+/.test(employee.employeeCode || employee.employeeId)) {
    throw new Error('Only C-code contract employees can be set up for daily-rate payroll.');
  }

  const persisted = await updateEmployeeContractPayrollClassificationInDb({
    employeeDbId: employee.employeeDbId,
    action: input.action,
    reason: input.reason,
  });
  if (!persisted) throw new Error('Unable to persist classification to DLE_Enterprise.');

  invalidatePayrollEmployeeCache();
  const refreshed = await findDirectoryEmployee(input.employeeId);
  return {
    employeeId: employee.employeeCode || employee.employeeId,
    classification: contractPayrollClassification(refreshed || employee),
    persisted: true,
  };
};

export const applyContractPayrollClassificationBulk = async (input: {
  action: ContractPayrollClassificationAction;
  employeeIds?: string[];
  applyAll?: boolean;
  reason?: string;
}) => {
  const source = await readDirectoryEmployees();
  const targets = input.applyAll
    ? source.employees.filter((employee) =>
        input.action === 'deactivate-non-daily'
          ? isInactiveNonDailyContractEmployee(employee)
          : isInactiveNonDailyContractEmployee(employee) || (employee.payrollClassification?.isContractCode && !employee.payrollClassification?.isDailyRate),
      )
    : source.employees.filter((employee) => (input.employeeIds || []).some((id) => matchEmployee(id, employee)));

  const results: Array<{ employeeId: string; ok: boolean; error?: string }> = [];
  for (const employee of targets) {
    try {
      await applyContractPayrollClassification({
        employeeId: employee.employeeCode || employee.employeeId,
        action: input.action,
        reason: input.reason,
      });
      results.push({ employeeId: employee.employeeCode || employee.employeeId, ok: true });
    } catch (error) {
      results.push({
        employeeId: employee.employeeCode || employee.employeeId,
        ok: false,
        error: error instanceof Error ? error.message : 'Classification failed',
      });
    }
  }
  return { processed: results.length, succeeded: results.filter((row) => row.ok).length, results };
};
