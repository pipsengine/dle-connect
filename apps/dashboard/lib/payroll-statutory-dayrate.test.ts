import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';
import {
  calculateStatutoryFunds,
  isDayRateStatutoryExempt,
  type StatutoryFundsVersion,
} from './payroll-statutory-funds-engine';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const dayRateEmployee = {
  employeeCode: 'C1924',
  employeeId: 'C1924',
  employmentType: 'Daily Rate',
  staffCategory: 'Daily Rate',
  ratePerDay: 25000,
  hoursPerDay: 8,
} as DleEmployeeDirectoryRow;

const version: StatutoryFundsVersion = {
  id: 'test',
  name: 'test',
  status: 'Active',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  currency: 'NGN',
  basis: 'test',
  notes: '',
  funds: [
    {
      id: 'nsitf',
      label: 'NSITF',
      shortName: 'NSITF',
      enabled: true,
      payer: 'Employer',
      deductFromEmployee: false,
      calculationBasis: 'percent_of_monthly_emolument',
      rate: 0.01,
      monthlyCap: null,
      annualCap: null,
      minimumMonthlyIncome: 0,
      eligibilityMode: 'all_payroll_employees',
      eligibleEmploymentTypes: ['Permanent', 'Contract', 'Payroll', 'Daily'],
      remittanceFrequency: 'Monthly',
      authority: 'NSITF',
      accountingTreatment: 'Employer statutory cost',
    },
    {
      id: 'itf',
      label: 'ITF',
      shortName: 'ITF',
      enabled: true,
      payer: 'Employer',
      deductFromEmployee: false,
      calculationBasis: 'percent_of_annual_payroll',
      rate: 0.01,
      monthlyCap: null,
      annualCap: null,
      minimumMonthlyIncome: 0,
      eligibilityMode: 'employer_threshold',
      employeeThreshold: 25,
      eligibleEmploymentTypes: ['Permanent', 'Contract', 'Payroll', 'Daily'],
      remittanceFrequency: 'Annual',
      authority: 'ITF',
      accountingTreatment: 'Employer statutory cost',
    },
  ],
  regulatoryChanges: [],
};

assert(isDayRateStatutoryExempt(dayRateEmployee), 'daily-rate employee is statutory-exempt');
const computed = calculateStatutoryFunds({
  employee: dayRateEmployee,
  monthlyBasePay: 500000,
  monthlyAllowances: 200000,
  organizationEmployeeCount: 500,
}, version);
assert(computed.employerCosts === 0, 'day-rate employer NSITF/ITF must be zero');
assert(computed.employeeDeductions === 0, 'day-rate employee statutory deductions must be zero');
assert(computed.fundResults.every((fund) => fund.monthlyAmount === 0 && fund.eligible === false), 'no day-rate fund is eligible');

console.log('payroll-statutory-dayrate tests passed');
