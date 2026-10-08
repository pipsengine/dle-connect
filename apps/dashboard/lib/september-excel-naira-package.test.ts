/**
 * September 2026 PERM STAFF naira packages.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/september-excel-naira-package.test.ts
 */
import assert from 'node:assert/strict';
import { applyLockedPayrollPackage } from './locked-payroll-package';
import { applySeptemberExcelNairaPackage, SEPTEMBER_EXCEL_NAIRA_PACKAGES, septemberExcelNairaPackageFor } from './september-excel-naira-package';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';

const odulate = { employeeCode: 'P0442', fullName: 'ODULATE', payCurrency: 'USD' } as DleEmployeeDirectoryRow;
const applied = applySeptemberExcelNairaPackage(applyLockedPayrollPackage(odulate, '2026-09'), '2026-09');
const lines = applied.sageLocalPayrollEarnings || [];
const sum = Math.round(lines.reduce((total, line) => total + Number(line.amount), 0) * 100) / 100;

assert.equal(applied.localPeriodSalary, 6393380.73);
assert.equal(sum, 6393380.73);
assert.equal(lines.find((line) => line.code === 'PENSION_REFUND')?.amount, 222163.81);
assert.equal(lines.find((line) => line.code === 'BASIC')?.amount, 1234243.38);
assert.equal(applied.payeCalculation?.ngnMonthlyPayeOverride, 1359887.56);
assert.equal(applied.periodSalary, 4631.33);

const mgbeoji = applySeptemberExcelNairaPackage({ employeeCode: 'P0364', fullName: 'MGBEOJI' } as DleEmployeeDirectoryRow, '2026-10');
assert.equal(mgbeoji.localPeriodSalary, 6100527.02);
assert.equal(mgbeoji.sageLocalPayrollEarnings?.find((line) => line.code === 'PENSION_REFUND')?.amount, 211987.43);

const austen = applySeptemberExcelNairaPackage({ employeeCode: '0457', fullName: 'AUSTEN-PETERS' } as DleEmployeeDirectoryRow, '2026-09');
assert.equal(austen.localPeriodSalary, 2481637.88);
assert.equal(austen.sageLocalPayrollEarnings?.some((line) => line.code === 'PENSION_REFUND'), false);
assert.equal(austen.payeCalculation?.ngnMonthlyPayeOverride, 443744.19);

assert.equal(septemberExcelNairaPackageFor(odulate, '2026-08'), null);
assert.equal(septemberExcelNairaPackageFor({ employeeCode: 'P0458' }, '2026-09')?.grossNgn, 6100527.02);

const pensionOnBht = (basic: number, housing: number, transport: number) => (basic + housing + transport) * 0.08;
const nets: Record<string, number> = {
  P0442: 4589165.55,
  P0364: 4387333.93,
  P0458: 4387333.93,
  P0457: 1914926.19,
};
for (const pack of SEPTEMBER_EXCEL_NAIRA_PACKAGES) {
  const basic = pack.lines.find((item) => item.code === 'BASIC')?.amount || 0;
  const housing = pack.lines.find((item) => /HOUS/i.test(item.code))?.amount || 0;
  const transport = pack.lines.find((item) => /TRANS/i.test(item.code))?.amount || 0;
  const net = Math.round((pack.grossNgn - pack.paye - pensionOnBht(basic, housing, transport) - pack.otherDeduction) * 100) / 100;
  assert.equal(net, nets[pack.employeeCode], pack.employeeCode);
}

console.log('september-excel-naira-package.test.ts ok');
