/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-pension-eligibility.test.ts
 */
import assert from 'node:assert/strict';
import { isPCodePayrollEmployee, isPensionEligibleStaff } from './payroll-employee-classification';
import { calculatePension, type PensionVersion } from './payroll-pension-engine';
import { calculateStatutoryFunds, type StatutoryFundsVersion } from './payroll-statutory-funds-engine';
import { buildSalarySetupExportReport } from './payroll-salary-setup-export';

assert.equal(isPCodePayrollEmployee({ employeeId: 'P0387', employeeCode: 'P0387' }), true);
assert.equal(isPensionEligibleStaff({ employeeId: 'P0013', employeeCode: 'P0013' }), true);
assert.equal(isPensionEligibleStaff({ employeeId: 'L2289', employeeCode: 'L2289' }), false);
assert.equal(isPensionEligibleStaff({ employeeId: 'C1065', employeeCode: 'C1065' }), false);
assert.equal(isPensionEligibleStaff({ employeeId: 'PEX001', employeeCode: 'PEX001' }), false);
assert.equal(isPensionEligibleStaff({ employeeId: 'IT0001', employeeCode: 'IT0001' }), false);
assert.equal(isPensionEligibleStaff({ employeeId: 'NYSC0032', employeeCode: 'NYSC0032' }), false);

const version: PensionVersion = {
  id: 'test',
  name: 'test',
  status: 'Active',
  effectiveFrom: '2014-07-01',
  effectiveTo: null,
  currency: 'NGN',
  basis: 'test',
  notes: '',
  rules: {
    employeeRate: 0.08,
    employerRate: 0.1,
    minimumCombinedRate: 0.18,
    employerFullResponsibilityMinimumRate: 0.2,
    voluntaryContributionRate: 0,
    remittanceDueDays: 7,
    basisComponents: ['basic'],
    fallbackBasis: 'monthly_base_plus_allowances',
    eligibleEmploymentTypes: ['Permanent', 'Contract'],
    excludedEmploymentTypes: ['Intern', 'NYSC', 'Daily'],
  },
  providers: [],
  regulatoryChanges: [],
};

const perm = calculatePension({
  employee: { employeeId: 'P0387', employeeCode: 'P0387', employmentType: 'Permanent', status: 'Active' } as any,
  monthlyBasePay: 400000,
  monthlyAllowances: 100000,
  rsaPin: 'PEN100038712345',
  providerId: 'leadway',
}, version);
assert.equal(perm.eligible, true);
assert.ok(perm.employeeContribution > 0);
assert.ok(perm.employerContribution > 0);

const lumpsum = calculatePension({
  employee: { employeeId: 'L2289', employeeCode: 'L2289', employmentType: 'Contract', status: 'Active' } as any,
  monthlyBasePay: 500000,
  monthlyAllowances: 0,
  rsaPin: 'PEN999',
  providerId: 'leadway',
}, version);
assert.equal(lumpsum.eligible, false);
assert.equal(lumpsum.employeeContribution, 0);
assert.equal(lumpsum.employerContribution, 0);

const fundsVersion: StatutoryFundsVersion = {
  id: 'test',
  name: 'test',
  status: 'Active',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  currency: 'NGN',
  basis: 'test',
  notes: '',
  funds: [{
    id: 'nhf',
    label: 'NHF',
    shortName: 'NHF',
    enabled: true,
    payer: 'Employee',
    deductFromEmployee: true,
    calculationBasis: 'percent_of_monthly_base',
    rate: 0.025,
    monthlyCap: null,
    annualCap: null,
    minimumMonthlyIncome: 0,
    eligibilityMode: 'all',
    eligibleEmploymentTypes: ['Permanent', 'Contract'],
    remittanceFrequency: 'Monthly',
    authority: 'FMBN',
    accountingTreatment: 'deduction',
  }],
  regulatoryChanges: [],
};

const lumpsumFunds = calculateStatutoryFunds({
  employee: { employeeId: 'L2289', employeeCode: 'L2289', employmentType: 'Contract', status: 'Active', nhfApplicable: true } as any,
  monthlyBasePay: 500000,
  monthlyAllowances: 0,
  organizationEmployeeCount: 200,
}, fundsVersion);
assert.equal(lumpsumFunds.fundResults[0]?.eligible, false);
assert.equal(lumpsumFunds.fundResults[0]?.monthlyAmount, 0);

const report = buildSalarySetupExportReport([
  {
    employeeId: 'L2289',
    fullName: 'Contract Staff',
    department: 'Works',
    pension: 40000,
    deductionLines: [{ code: 'PENSION_EE', label: 'Pension', amount: 40000 }],
  },
  {
    employeeId: 'P0387',
    fullName: 'Permanent Staff',
    department: 'HR',
    pension: 25000,
    deductionLines: [{ code: 'PENSION_EE', label: 'Pension', amount: 25000 }],
  },
]);
const pensionIdx = report.columns.indexOf('Pension');
assert.ok(pensionIdx >= 0);
assert.equal(report.rows[0][pensionIdx], '');
assert.equal(report.rows[1][pensionIdx], 25000);

console.log('payroll-pension-eligibility.test.ts ok');
