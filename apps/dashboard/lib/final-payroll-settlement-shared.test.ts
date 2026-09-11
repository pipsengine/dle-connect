import {
  mergeGrossSalaryEarnings,
  parseFinalPayrollAmountInput,
  type FinalPayrollLine,
} from './final-payroll-settlement-shared';

const line = (id: string, amount: number, extra: Partial<FinalPayrollLine> = {}): FinalPayrollLine => ({
  id,
  label: id,
  description: id,
  policyBasis: '-',
  periodDays: '10 days',
  amount,
  remarks: extra.remarks || '-',
  included: true,
  ...extra,
});

const merged = mergeGrossSalaryEarnings([
  line('salary-lwd', 21544, { remarks: 'Sep 1 – 10 Sep 2026' }),
  line('outstanding-salary', 0),
  line('unpaid-arrears', 0),
  line('earned-allowances', 364631, { remarks: 'Allowances: HOUSING' }),
  line('leave-encashment', 243087),
  line('gratuity', 3646312),
]);

if (merged[0].id !== 'gross-salary') throw new Error(`expected Gross Salary first, got ${merged[0].id}`);
if (merged[0].label !== 'Gross Salary') throw new Error('label');
if (merged[0].amount !== 386175) throw new Error(`amount ${merged[0].amount}`);
if (merged.some((item) => item.id === 'salary-lwd' || item.id === 'earned-allowances')) {
  throw new Error('legacy rows should be removed');
}
if (merged.findIndex((item) => item.id === 'leave-encashment') < 0) throw new Error('leave missing');
if (parseFinalPayrollAmountInput('1,500') !== 1500) throw new Error('parse commas');
if (parseFinalPayrollAmountInput('') !== 0) throw new Error('parse empty');

const alreadyMerged = mergeGrossSalaryEarnings([line('gross-salary', 100), line('leave-encashment', 20)]);
if (alreadyMerged.length !== 2 || alreadyMerged[0].id !== 'gross-salary') throw new Error('already merged should pass through');

console.log('final-payroll-settlement-shared.test: OK');
