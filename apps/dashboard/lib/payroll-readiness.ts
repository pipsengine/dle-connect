import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  contractEmployeeCode,
  isDailyRatePayrollEmployee,
  isInactiveNonDailyContractEmployee,
} from '@/lib/payroll-employee-classification';

const compact = (value: unknown) => String(value || '').trim();

export type PayrollReadinessStatus = 'Ready' | 'Awaiting Timesheet' | 'Review' | 'Blocked';

const activeStatus = (value: unknown) => !compact(value).toLowerCase().match(/terminated|resigned|retired|inactive|deceased/);

/** Permanent, lumpsum, NYSC, and IT staff are paid from fixed salary setup — not timesheets. */
export const isFixedSalaryPayrollEmployee = (employee: DleEmployeeDirectoryRow, dailyRateEmployee: boolean) => {
  if (dailyRateEmployee) return false;
  if (isInactiveNonDailyContractEmployee(employee)) return false;
  const code = compact(employee.employeeCode || employee.employeeId).toUpperCase();
  if (/^P\d/.test(code) || /^L\d/.test(code) || /^N\d/.test(code) || /^I\d/.test(code)) return true;
  const type = compact(employee.employmentType).toLowerCase();
  return /permanent|lumpsum|nysc|\bit\b|intern|it student/.test(type);
};

const hasTimesheetHours = (timesheet: { daysWorked: number; bookedHours: number } | null | undefined) =>
  Boolean(timesheet && (timesheet.daysWorked > 0 || timesheet.bookedHours > 0));

export const computePayrollReadinessStatus = (
  employee: DleEmployeeDirectoryRow,
  input: {
    dailyRateEmployee: boolean;
    timesheet: { daysWorked: number; bookedHours: number } | null;
    grossPay: number;
    ratePerDay: number;
    ratePerHour: number;
  },
): PayrollReadinessStatus => {
  if (isInactiveNonDailyContractEmployee(employee)) return 'Blocked';
  if (!activeStatus(employee.status)) return 'Blocked';
  if (!employee.setupAssignedToPayroll) return 'Blocked';
  if (!compact(employee.payrollGroup)) return 'Blocked';
  if (!compact(employee.payCurrency)) return 'Blocked';

  const fixedSalary = isFixedSalaryPayrollEmployee(employee, input.dailyRateEmployee);
  const dailyRate = input.dailyRateEmployee || (contractEmployeeCode(employee) && isDailyRatePayrollEmployee(employee));

  if (dailyRate) {
    if (!hasTimesheetHours(input.timesheet)) return 'Awaiting Timesheet';
    if (input.grossPay <= 0 && input.ratePerDay <= 0 && input.ratePerHour <= 0) return 'Blocked';
    if (input.grossPay <= 0) return 'Review';
    return 'Ready';
  }

  if (fixedSalary) {
    const hasSalary = input.grossPay > 0 || Number(employee.periodSalary || 0) > 0;
    return hasSalary ? 'Ready' : 'Blocked';
  }

  if (input.grossPay <= 0) return 'Blocked';
  return 'Ready';
};

export const summarizePayrollReadiness = (
  records: Array<{ readinessStatus: PayrollReadinessStatus }>,
) => ({
  readinessReadyEmployees: records.filter((record) => record.readinessStatus === 'Ready').length,
  readinessAwaitingTimesheetEmployees: records.filter((record) => record.readinessStatus === 'Awaiting Timesheet').length,
  readinessReviewEmployees: records.filter((record) => record.readinessStatus === 'Review').length,
  readinessBlockedEmployees: records.filter((record) => record.readinessStatus === 'Blocked').length,
});

export const readinessStatusFromCalculationRecord = (record: PayrollCalculationRecord): PayrollReadinessStatus => {
  if ('readinessStatus' in record && record.readinessStatus) return record.readinessStatus;
  const pseudoEmployee = {
    employeeCode: record.employeeCode,
    employeeId: record.employeeId,
    employmentType: record.employmentType,
    status: record.employmentStatus,
    setupAssignedToPayroll: record.setupAssignedToPayroll,
    payrollGroup: record.payrollGroup,
    payCurrency: record.payCurrency,
    periodSalary: record.grossPay > 0 ? record.grossPay : 0,
    ratePerDay: record.ratePerDay,
    ratePerHour: record.ratePerHour,
  } as DleEmployeeDirectoryRow;
  return computePayrollReadinessStatus(pseudoEmployee, {
    dailyRateEmployee: record.isDailyRate,
    timesheet:
      record.timesheetDaysWorked != null || record.timesheetBookedHours != null
        ? { daysWorked: Number(record.timesheetDaysWorked || 0), bookedHours: Number(record.timesheetBookedHours || 0) }
        : null,
    grossPay: record.grossPay,
    ratePerDay: Number(record.ratePerDay || 0),
    ratePerHour: Number(record.ratePerHour || 0),
  });
};

export const enrichCalculationRecordsWithReadiness = (records: PayrollCalculationRecord[]) =>
  records.map((record) => ({
    ...record,
    readinessStatus: readinessStatusFromCalculationRecord(record),
  }));
