/**
 * USD package shown as naira at the payroll-run rate.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/payroll-fx-display.test.ts
 */
import assert from 'node:assert/strict';
import {
  convertAmountText,
  convertPayrollMoney,
  formatPayrollRunFxCaption,
  payrollLinesForDisplay,
  payrollLinesFromDisplay,
} from './payroll-fx-display';

const rate = 1351;

assert.equal(convertPayrollMoney(36.56, 'USD', 'NGN', rate), 49392.56);
assert.equal(convertPayrollMoney(2147.32, 'USD', 'NGN', rate), 2901029.32);
assert.equal(convertPayrollMoney(694.7, 'USD', 'NGN', rate), 938539.7);
assert.equal(convertPayrollMoney(453.1, 'USD', 'NGN', rate), 612138.1);
assert.equal(convertPayrollMoney(49392.56, 'NGN', 'USD', rate), 36.56);
assert.equal(convertPayrollMoney(36.56, 'USD', 'USD', rate), 36.56);
assert.equal(convertPayrollMoney(100, 'NGN', 'NGN', rate), 100);

assert.equal(convertAmountText('', 'USD', 'NGN', rate), '');
assert.equal(convertAmountText('36.56', 'USD', 'NGN', rate), '49392.56');
assert.equal(convertAmountText('49392.56', 'NGN', 'USD', rate), '36.56');

const native = [
  { id: '1', code: 'BASIC', name: 'Basic', amount: '36.56', taxable: true, frequency: 'monthly' as const },
  { id: '2', code: 'TRANSPORT', name: 'Transport', amount: '453.10', taxable: true, frequency: 'monthly' as const },
];
const shown = payrollLinesForDisplay(native, 'USD', 'NGN', rate);
assert.equal(shown[0].amount, '49392.56');
assert.equal(shown[1].amount, '612138.1');
const restored = payrollLinesFromDisplay(shown, 'USD', 'NGN', rate);
assert.equal(restored[0].amount, '36.56');
assert.equal(restored[1].amount, '453.1');
assert.deepEqual(payrollLinesForDisplay(native, 'USD', 'USD', rate), native);

const caption = formatPayrollRunFxCaption({
  rate: 1351,
  rateDate: '2026-08-20',
  source: 'MD',
  kind: 'cbn',
  period: '2026-09',
});
assert.match(caption, /CBN rate/);
assert.match(caption, /September 2026/);
assert.match(caption, /20 Aug 2026/);
assert.match(caption, /Dollar amounts stay saved/);

console.log('payroll-fx-display.test.ts ok');
