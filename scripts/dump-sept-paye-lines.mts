import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { calculatePayrollForPeriod } from '../apps/dashboard/lib/payroll-calculation-service';
import { resolvePayCurrency } from '../apps/dashboard/lib/payroll-currency';
import { resolvePayrollCompany } from '../apps/dashboard/lib/payroll-schedule-scope';

loadWorkspaceEnv();
const codes = new Set(process.argv.slice(2));
const calc = await calculatePayrollForPeriod('2026-09', { pack: 'salaried', company: 'DLE' });
for (const r of calc.records) {
  const code = String(r.employeeCode || '');
  if (codes.size && !codes.has(code)) continue;
  if (resolvePayrollCompany(r) !== 'DLE' || resolvePayCurrency(r) === 'USD') continue;
  const lines = (r.earningLines || []).map((l) => `${l.code}|${l.name}|${l.amount}|t=${l.taxable}`);
  const deds = (r.deductionLines || []).map((l) => `${l.code}|${l.label}|${l.amount}`);
  console.log(`${code}\t${r.fullName}\tpaye=${r.paye}\tprofile=${r.earningProfileId}`);
  console.log(`  E: ${lines.join(' || ')}`);
  console.log(`  D: ${deds.join(' || ')}`);
}
setTimeout(() => process.exit(0), 200).unref();
