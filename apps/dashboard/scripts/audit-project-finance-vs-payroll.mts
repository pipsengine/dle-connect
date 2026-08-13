import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service';
import { buildCCodeProjectFinanceCosts } from '../lib/project-finance-cost-service';

const period = process.argv[2] || '2026-07';
const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const sum = <T,>(rows: T[], key: keyof T) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

const calc = await calculatePayrollForPeriod(period, { pack: 'daily-rate', forceRefresh: true });
const sampleRows = calc.records.slice(0, 5).flatMap((record, index) => ([
  {
    periodId: `per-${period}`,
    timesheetDate: period === '2026-07' ? '2026-07-10' : `${period}-10`,
    employeeNo: record.employeeCode,
    employeeId: record.employeeId || record.employeeCode,
    employeeName: record.fullName,
    projectCode: 'DL2423',
    projectName: 'Sample',
    allocationHours: 8,
    productiveHours: 8,
  },
  // Spill day into next timesheet period — must not pull next month's pack when dominant is July.
  ...(index === 0 ? [{
    periodId: 'per-2026-08',
    timesheetDate: '2026-07-16',
    employeeNo: record.employeeCode,
    employeeId: record.employeeId || record.employeeCode,
    employeeName: record.fullName,
    projectCode: 'DL2423',
    projectName: 'Sample',
    allocationHours: 8,
    productiveHours: 8,
  }] : []),
]));

const financeAuto = await buildCCodeProjectFinanceCosts(sampleRows);
const financeExplicit = await buildCCodeProjectFinanceCosts(sampleRows, { payrollPeriods: [period] });

console.log(JSON.stringify({
  period,
  payroll: {
    employees: calc.records.length,
    gross: round(Number(calc.summary?.grossPay ?? sum(calc.records, 'grossPay'))),
    net: round(Number(calc.summary?.netPay ?? sum(calc.records, 'netPay'))),
  },
  financeAuto: {
    periods: financeAuto.payrollPeriods,
    employees: financeAuto.controlTotals.cCodeEmployees,
    gross: financeAuto.controlTotals.payrollGross,
    net: financeAuto.controlTotals.net,
    balanced: financeAuto.controlTotals.balanced,
  },
  financeExplicit: {
    periods: financeExplicit.payrollPeriods,
    employees: financeExplicit.controlTotals.cCodeEmployees,
    gross: financeExplicit.controlTotals.payrollGross,
    net: financeExplicit.controlTotals.net,
  },
}, null, 2));
