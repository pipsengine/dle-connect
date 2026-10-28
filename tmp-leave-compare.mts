import { readEmployeeDirectoryFromDb } from './apps/dashboard/lib/dle-enterprise-db.ts';
import { readPayrollSnapshot } from './apps/dashboard/lib/payroll-run-store.ts';
import { hrisPayeFromEmployee } from './apps/dashboard/lib/payroll-sage-pay-rules.ts';
import { isVariableEarningForPaye } from './apps/dashboard/lib/payroll-earning-tax-classification.ts';

const codes = new Set(['P0040', 'P0044', 'P0279', 'P0449', 'P0450', 'P0462']);
const employees = await readEmployeeDirectoryFromDb();
const byCode = new Map((employees || []).map((employee) => [String(employee.employeeCode || '').toUpperCase(), employee]));
const snapshot = await readPayrollSnapshot('payroll-2026-10-salaried-DLE');
const rows = (snapshot?.records || []).filter((record) => codes.has(record.employeeCode) && record.payCurrency !== 'USD');
const result = rows.map((record) => {
  const employee = byCode.get(record.employeeCode);
  const stripped = employee
    ? { ...employee, payCurrency: 'NGN', payeCalculation: { ...(employee.payeCalculation || {}), monthlyPayeOverride: undefined, ngnMonthlyPayeOverride: undefined } }
    : null;
  const lines = (record.earningLines || []).map((line) => ({
    code: line.code,
    name: line.name,
    amount: line.amount,
    taxable: line.taxable !== false,
  }));
  const computed = stripped
    ? hrisPayeFromEmployee({
      employee: stripped,
      earnings: { profileId: record.earningProfileId || 'senior-permanent', paidEarningLines: lines, earningLines: lines },
      nhfApplicable: stripped.nhfApplicable === true,
    })
    : null;
  return {
    code: record.employeeCode,
    name: record.fullName,
    storedPaye: record.paye,
    computedPaye: computed?.paye ?? null,
    fixedTaxable: computed && 'fixedTaxable' in computed ? computed.fixedTaxable : null,
    variableTaxable: computed && 'variableTaxable' in computed ? computed.variableTaxable : null,
    gap: computed ? Math.round((Number(computed.paye) - Number(record.paye)) * 100) / 100 : null,
    leave: lines.filter((line) => /LEAVE/i.test(`${line.code} ${line.name}`)).map((line) => ({
      code: line.code,
      name: line.name,
      amount: line.amount,
      variable: isVariableEarningForPaye(line),
    })),
  };
});
console.log(JSON.stringify(result, null, 2));
