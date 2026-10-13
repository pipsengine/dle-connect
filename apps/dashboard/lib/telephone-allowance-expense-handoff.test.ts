import assert from 'node:assert/strict';
import {
  assertTransition,
  TELEPHONE_EXPENSE_APPROVAL_STAGES,
  type TelephoneCycle,
} from './telephone-allowance-cycle.ts';
import { buildTelephoneAllowanceSchedulePdf } from './telephone-allowance-schedule-pdf.ts';
import { buildTelephoneAllowanceScheduleWorkbook } from './telephone-allowance-schedule-workbook.ts';

assert.deepEqual(
  [...TELEPHONE_EXPENSE_APPROVAL_STAGES],
  ['Finance Manager', 'CFO', 'MD/CEO'],
);

assert.doesNotThrow(() => assertTransition('PENDING_HR_APPROVAL', 'EXPENSE_PAYMENT'));
assert.doesNotThrow(() => assertTransition('PENDING_CFO_AUTHORIZATION', 'EXPENSE_PAYMENT'));
assert.doesNotThrow(() => assertTransition('PENDING_MD_APPROVAL', 'EXPENSE_PAYMENT'));
assert.throws(() => assertTransition('PENDING_HR_APPROVAL', 'PENDING_MD_APPROVAL'));
assert.throws(() => assertTransition('EXPENSE_PAYMENT', 'PENDING_CFO_AUTHORIZATION'));

const cycle = {
  cycleCode: 'CALL-2026-SEP-OCT-001',
  year: 2026,
  month1: 9,
  month2: 10,
  pairLabel: 'Sep–Oct',
  bimonthlyTotal: 15000,
  employees: [
    {
      employeeCode: 'P0001',
      employeeName: 'Ada Lovelace',
      department: 'Information Technology',
      month1Amount: 5000,
      month2Amount: 5000,
      bimonthlyTotal: 10000,
      changeBadge: 'UNCHANGED',
      bankName: 'GTBank',
      accountNo: '0123456789',
    },
    {
      employeeCode: 'P0002',
      employeeName: 'Removed Person',
      department: 'HR',
      month1Amount: 0,
      month2Amount: 0,
      bimonthlyTotal: 5000,
      changeBadge: 'REMOVED',
      bankName: 'Access',
      accountNo: '999',
    },
  ],
} as TelephoneCycle;

const pdf = buildTelephoneAllowanceSchedulePdf(cycle, 'HR Manager');
const text = pdf.toString('latin1');
assert.ok(text.startsWith('%PDF-1.4'));
assert.ok(text.includes('Ada Lovelace'));
assert.ok(text.includes('P0001'));
assert.ok(text.includes('CALL-2026-SEP-OCT-001'));
assert.ok(!text.includes('Removed Person'));
assert.ok(text.includes('%%EOF'));

const many = {
  ...cycle,
  employees: Array.from({ length: 40 }, (_, index) => ({
    employeeCode: `P${String(index + 1).padStart(4, '0')}`,
    employeeName: `Employee ${index + 1}`,
    department: 'Operations',
    month1Amount: 1000,
    month2Amount: 1000,
    bimonthlyTotal: 2000,
    changeBadge: 'UNCHANGED' as const,
    bankName: 'Zenith',
    accountNo: '1234567890',
  })),
} as TelephoneCycle;
const multi = buildTelephoneAllowanceSchedulePdf(many, 'HR Manager').toString('latin1');
const workbook = buildTelephoneAllowanceScheduleWorkbook(cycle, 'HR Manager').toString('utf8');
assert.ok(workbook.includes('Ada Lovelace'));
assert.ok(workbook.includes('P0001'));
assert.ok(workbook.includes('0123456789'));
assert.ok(workbook.includes('CALL-2026-SEP-OCT-001'));
assert.ok(!workbook.includes('Removed Person'));
assert.ok(workbook.includes('<Workbook'));

assert.ok(multi.includes('Page 1 of 2'));
assert.ok(multi.includes('Page 2 of 2'));
assert.ok(multi.includes('Employee 40'));

console.log('telephone allowance expense handoff checks passed');
