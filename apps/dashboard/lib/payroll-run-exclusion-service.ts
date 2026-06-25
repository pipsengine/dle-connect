import { calculatePayrollForPeriod } from '@/lib/payroll-calculation-service';
import { isRemovableDailyRatePayrollRecord } from '@/lib/payroll-employee-classification';
import { writePayrollEmployeeOption } from '@/lib/payroll-employee-options-store';
import { invalidatePayrollEmployeeCache } from '@/lib/payroll-employee-source';

export const setPayrollRunExclusion = async (input: {
  employeeId: string;
  excluded: boolean;
  updatedBy?: string;
  reason?: string;
}) => {
  const employeeId = input.employeeId.trim();
  if (!employeeId) throw new Error('Employee ID is required.');
  const option = await writePayrollEmployeeOption({
    employeeId,
    employeeCode: employeeId,
    excludedFromPayrollRun: input.excluded,
    updatedBy: input.updatedBy,
  });
  invalidatePayrollEmployeeCache();
  return option;
};

export const excludeUnconfiguredDailyRateContracts = async (input: {
  period: string;
  employeeIds?: string[];
  updatedBy?: string;
}) => {
  const calculation = await calculatePayrollForPeriod(input.period);
  const idSet = new Set((input.employeeIds || []).map((value) => value.trim().toUpperCase()).filter(Boolean));
  const targets = calculation.records.filter((record) => {
    if (!isRemovableDailyRatePayrollRecord(record)) return false;
    if (!idSet.size) return true;
    return idSet.has(record.employeeId.toUpperCase()) || idSet.has(record.employeeCode.toUpperCase());
  });

  const results: Array<{ employeeId: string; ok: boolean; error?: string }> = [];
  for (const record of targets) {
    const employeeId = record.employeeCode || record.employeeId;
    try {
      await setPayrollRunExclusion({ employeeId, excluded: true, updatedBy: input.updatedBy });
      results.push({ employeeId, ok: true });
    } catch (error) {
      results.push({
        employeeId,
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to exclude employee from payroll run.',
      });
    }
  }

  return {
    processed: results.length,
    succeeded: results.filter((row) => row.ok).length,
    results,
  };
};
