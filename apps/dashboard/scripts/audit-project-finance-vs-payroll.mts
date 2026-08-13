import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service';
import { buildCCodeProjectFinanceCosts } from '../lib/project-finance-cost-service';

const period = process.argv[2] || '2026-07';
const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const sum = <T,>(rows: T[], key: keyof T) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

const calc = await calculatePayrollForPeriod(period, { pack: 'daily-rate', forceRefresh: true });
const zeroGross = calc.records.filter((r) => Number(r.grossPay || 0) <= 0).length;
const sample = calc.records.find((r) => Number(r.grossPay || 0) > 0) || calc.records[0];

const finance = sample
  ? await buildCCodeProjectFinanceCosts([
      {
        periodId: `per-${period}`,
        timesheetDate: `${period}-01`,
        employeeNo: sample.employeeCode,
        employeeId: sample.employeeId || sample.employeeCode,
        employeeName: sample.fullName,
        projectCode: 'DL2423',
        projectName: 'Sample Project',
        allocationHours: 8,
        productiveHours: 8,
      },
    ])
  : null;

const noProject = finance?.projects.find((p) => p.projectCode === 'No Project');

console.log(JSON.stringify({
  period,
  dailyRatePack: {
    employees: calc.records.length,
    zeroGross,
    gross: round(Number(calc.summary?.grossPay ?? sum(calc.records, 'grossPay'))),
    net: round(Number(calc.summary?.netPay ?? sum(calc.records, 'netPay'))),
    paye: round(sum(calc.records, 'paye')),
  },
  financeControl: finance?.controlTotals || null,
  noProjectEmployees: noProject?.employees || 0,
  noProjectCost: noProject?.labourCost || 0,
  noProjectHours: noProject?.productiveHours || 0,
}, null, 2));
