/**
 * Project labour cost rates are calculated by the system from payroll — nobody enters them.
 *
 * Each employee's day rate comes from [hris].[EmployeePayrollSetup]. The report prices hours the way
 * the day-rate payroll schedule pays them (dayrate-schedule-template-export.ts):
 *   hourly rate = day rate ÷ 8
 *   weekday OVT ×1.5 · Saturday ×1.5 · Sunday ×2 · public holiday ×2
 * Only naira pay is costed; foreign-currency staff are not applicable to this report.
 */
import type { LabourRateCard } from '@/lib/project-labour-cost';

export const PAYROLL_HOURS_PER_DAY = 8;

/** Multipliers the day-rate payroll schedule applies. */
export const PAYROLL_MULTIPLIERS = {
  weekdayOvt: 1.5,
  saturday: 1.5,
  saturdayOvt: 1.5,
  sunday: 2,
  sundayOvt: 2,
  publicHoliday: 2,
  publicHolidayOvt: 2,
} as const;

export const PAYROLL_DAY_RATE_VERSION = 'Payroll day rate ÷ 8';

export type PayrollDayRate = {
  employeeCode: string;
  ratePerDay: number | null;
  currency: string | null;
};

const text = (value: unknown) => String(value ?? '').trim();

/** Payroll day rate → the hourly rate card the report prices with, or null when it cannot be costed. */
export const payrollDayRateCard = (source: PayrollDayRate): LabourRateCard | null => {
  const daily = Number(source.ratePerDay);
  if (!Number.isFinite(daily) || daily <= 0) return null;
  const currency = text(source.currency).toUpperCase() || 'NGN';
  if (currency !== 'NGN') return null;
  return {
    employeeCode: text(source.employeeCode).toUpperCase(),
    method: 'hourly',
    rateVersion: PAYROLL_DAY_RATE_VERSION,
    effectiveFrom: '',
    currency,
    amount: Math.round((daily / PAYROLL_HOURS_PER_DAY) * 10000) / 10000,
    standardHours: PAYROLL_HOURS_PER_DAY,
    multipliers: { ...PAYROLL_MULTIPLIERS },
  };
};
