/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/employee-payroll-excel-export.test.ts
 */
import assert from 'node:assert/strict';
import { buildExcelWorkbookXml } from './excel-export';
import {
  buildEmployeePayrollExcelWorkbook,
  employeePayrollExcelFileName,
} from './employee-payroll-excel-export';

const workbook = buildEmployeePayrollExcelWorkbook({
  employeeCode: 'P0442',
  fullName: 'Ada Lovelace',
  currency: 'NGN',
  subtitle: 'Amounts in NGN · Saved pay currency USD',
  summaryRows: [
    ['Employee', 'Ada Lovelace'],
    ['Basic Salary', 1500.5],
    ['Account Number', '****4412'],
  ],
  sections: [
    {
      title: 'Standing monthly package',
      sheetName: 'Standing Package',
      description: 'Repeats every payroll until changed.',
      lineKind: 'earning',
      lines: [
        { id: '1', code: 'BASIC', name: 'Basic', amount: '1000', taxable: true, frequency: 'monthly' },
        { id: '2', code: 'TRANS', name: 'Transport', amount: '100', taxable: false, frequency: 'weekly' },
      ],
    },
    {
      title: 'This period only — 2026-11',
      sheetName: 'This Period',
      lineKind: 'earning',
      lines: [
        { id: '3', code: 'OVERTIME', name: 'Overtime', amount: '250', taxable: true, frequency: 'one-off', payrollPeriod: '2026-11' },
      ],
    },
    {
      title: 'Empty leftover',
      sheetName: 'Leftover Earnings',
      lineKind: 'earning',
      lines: [],
    },
    {
      title: 'Deduction Lines',
      sheetName: 'Deductions',
      lineKind: 'deduction',
      lines: [
        { id: '4', code: 'LOAN', name: 'Loan', amount: '50', taxable: false, frequency: 'monthly' },
      ],
    },
  ],
});

assert.deepEqual(workbook.worksheets.map((sheet) => sheet.sheetName), [
  'Payroll Summary',
  'Standing Package',
  'This Period',
  'Deductions',
]);
assert.equal(workbook.worksheets[0].rows[1][1], 1500.5);
assert.deepEqual(workbook.worksheets[1].columns, [
  'Name',
  'Code',
  'Amount (NGN)',
  'Frequency',
  'Taxable',
  'Monthly equivalent (NGN)',
]);
assert.equal(workbook.worksheets[1].rows[0][4], 'Yes');
assert.equal(workbook.worksheets[1].rows[1][5], Math.round(100 * (52 / 12) * 100) / 100);
assert.equal(workbook.worksheets[1].rows[2][0], 'Total');
assert.equal(workbook.worksheets[2].rows[0][5], '');
assert.equal(workbook.worksheets[2].rows[1][5], '');
assert.equal(workbook.worksheets[3].columns.includes('Taxable'), false);
assert.equal(employeePayrollExcelFileName('P0442', 'Ada Lovelace'), 'employee-payroll-P0442-Ada-Lovelace.xls');
assert.equal(employeePayrollExcelFileName('P/1', 'A:B'), 'employee-payroll-P-1-A-B.xls');

const xml = buildExcelWorkbookXml(workbook);
assert.match(xml, /Employee Payroll — P0442 — Ada Lovelace/);
assert.match(xml, /Standing Package/);
assert.match(xml, /ss:Type="Number"/);
assert.match(xml, /#,##0\.00/);
assert.doesNotMatch(xml, /Leftover Earnings/);

console.log('employee-payroll-excel-export.test.ts ok');
