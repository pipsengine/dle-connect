import { hrisPayeFromEmployee } from '../lib/payroll-sage-pay-rules.ts';

const employee = {
  employeeId: '0027',
  employeeCode: 'P0027',
  fullName: 'AMAUKWU',
  status: 'Active',
  employmentType: 'Permanent',
  payCurrency: 'NGN',
  salaryGrade: 'JS',
  nhfApplicable: true,
} as never;

const lines = [
  { code: 'BASIC', name: 'BASIC SALARY', amount: 156825.88, taxable: true },
  { code: 'HOUSING', name: 'HOUSING', amount: 27287.7, taxable: true },
  { code: 'JNRMEAL', name: 'Jnr Staff_Meal Allowance', amount: 8800, taxable: true },
  { code: 'JNRUNION', name: 'JUNIOR UNION', amount: 40000, taxable: true },
  { code: 'MEDICAL', name: 'MEDICAL', amount: 23523.88, taxable: true },
  { code: 'OTHERALL', name: 'OTHER ALLOWANCE', amount: 140202.34, taxable: true },
  { code: 'TRANSPORT', name: 'TRANSPORT ALLOWANCE', amount: 23523.88, taxable: true },
  { code: 'UTILITY', name: 'UTILITIES', amount: 7841.29, taxable: true },
];
const result = hrisPayeFromEmployee({
  employee,
  earnings: { profileId: 'junior-permanent', paidEarningLines: lines, earningLines: lines } as never,
  nhfApplicable: true,
});
console.log('P0027', result.payeExact, 'delta', result.payeExact - 48345.198176);
const p309lines = [
  { code: 'BASIC', name: 'BASIC SALARY', amount: 96540.38, taxable: true },
  { code: 'HOUSING', name: 'HOUSING', amount: 16798.03, taxable: true },
  { code: 'JNRMEAL', name: 'Jnr Staff_Meal Allowance', amount: 8800, taxable: true },
  { code: 'JNRUNION', name: 'JUNIOR UNION', amount: 40000, taxable: true },
  { code: 'MEDICAL', name: 'MEDICAL', amount: 14481.06, taxable: true },
  { code: 'OTHERALL', name: 'OTHER ALLOWANCE', amount: 86307.1, taxable: true },
  { code: 'TRANSPORT', name: 'TRANSPORT ALLOWANCE', amount: 14481.06, taxable: true },
  { code: 'UTILITY', name: 'UTILITIES', amount: 4827.02, taxable: true },
  { code: 'OVERTIME', name: 'OVERTIME', amount: 10000, taxable: true },
];
const p309 = hrisPayeFromEmployee({
  employee: { ...employee, employeeCode: 'P0309', nhfApplicable: true } as never,
  earnings: { profileId: 'junior-permanent', paidEarningLines: p309lines, earningLines: p309lines } as never,
  nhfApplicable: true,
});
console.log('P0309', p309.payeExact, 'delta', p309.payeExact - 24314.33736);
