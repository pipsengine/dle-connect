/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-salary-setup-export.test.ts
 */
import assert from 'node:assert/strict';
import { buildSalarySetupExportReport, type SalarySetupExportRecord } from './payroll-salary-setup-export';

const dlpc: SalarySetupExportRecord = {
  employeeId: 'P0387',
  fullName: 'DLPC Staff',
  department: 'Production',
  businessUnit: 'DLPC',
  payrollGroup: 'DLPC',
  salaryGrade: 'SNR',
  payCurrency: 'NGN',
  earningLines: [
    { code: 'SNR_BASIC', name: 'BASIC SALARY', amount: 400000 },
    { code: 'SNR_HOUSE', name: 'HOUSING', amount: 112800 },
    { code: 'SNR_UTILITY', name: 'UTILITIES', amount: 20500 },
    { code: 'SNR_MEDICAL', name: 'MEDICAL', amount: 30000 },
    { code: 'SNR_TRANS', name: 'TRANSPORT', amount: 25000 },
  ],
  grossPay: 588300,
  netPay: 500000,
};

const dle: SalarySetupExportRecord = {
  employeeId: 'L2289',
  fullName: 'DLE Staff',
  department: 'Engineering',
  businessUnit: 'DLE',
  payrollGroup: 'DLE',
  salaryGrade: 'JNR',
  payCurrency: 'NGN',
  earningLines: [
    { code: 'JNR_BASIC', name: 'BASIC SALARY', amount: 200000 },
    { code: 'JNR_UTILITY', name: 'UTILITIES', amount: 4000 },
    { code: 'JNR_HOUSE', name: 'HOUSING', amount: 13920 },
  ],
  grossPay: 217920,
};

const report = buildSalarySetupExportReport([dlpc, dle]);
const utilitiesIndex = report.columns.indexOf('Utilities');
const housingIndex = report.columns.indexOf('Housing');
const medicalIndex = report.columns.indexOf('Medical');
const basicIndex = report.columns.indexOf('Basic Salary');

assert.ok(utilitiesIndex >= 0, 'export includes Utilities column');
assert.ok(housingIndex >= 0, 'export includes Housing column');
assert.ok(medicalIndex >= 0, 'export includes Medical column');
assert.equal(report.rows[0][utilitiesIndex], 20500);
assert.equal(report.rows[0][housingIndex], 112800);
assert.equal(report.rows[0][medicalIndex], 30000);
assert.equal(report.rows[0][basicIndex], 400000);
assert.equal(report.rows[1][utilitiesIndex], 4000);
assert.equal(report.rows[1][housingIndex], 13920);

console.log('payroll-salary-setup-export.test.ts ok');
