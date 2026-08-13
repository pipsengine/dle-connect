import { buildCCodeProjectFinanceCosts } from '../lib/project-finance-cost-service';
import { calculatePayrollForPeriod } from '../lib/payroll-calculation-service';

const period = process.argv[2] || '2026-07';
const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const sum = <T,>(rows: T[], key: keyof T) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

const calc = await calculatePayrollForPeriod(period, { pack: 'daily-rate' });
const packGross = round(Number(calc.summary?.grossPay ?? sum(calc.records, 'grossPay')));
const packNet = round(Number(calc.summary?.netPay ?? sum(calc.records, 'netPay')));
const packPaye = round(sum(calc.records, 'paye'));

const sample = calc.records[0];
const finance = await buildCCodeProjectFinanceCosts([
  {
    periodId: `per-${period}`,
    timesheetDate: `${period}-01`,
    employeeNo: sample?.employeeCode || 'C0001',
    employeeId: sample?.employeeId || sample?.employeeCode || 'C0001',
    employeeName: sample?.fullName || 'Sample',
    projectCode: 'DL2423',
    projectName: 'Sample Project',
    allocationHours: 8,
    productiveHours: 8,
  },
]);

const noProject = finance.projects.find((p) => p.projectCode === 'No Project');
const projectCost = finance.projects.filter((p) => p.projectCode !== 'No Project').reduce((s, p) => s + p.labourCost, 0);

console.log(JSON.stringify({
  period,
  pack: { employees: calc.records.length, packGross, packPaye, packNet },
  control: finance.controlTotals,
  projectRows: finance.projects.length,
  noProject: noProject ? {
    employees: noProject.employees,
    hours: noProject.productiveHours,
    labourCost: noProject.labourCost,
    wht: noProject.wht,
    net: noProject.net,
  } : null,
  codedToProjects: round(projectCost),
  deltas: {
    controlGross_minus_packGross: round(finance.controlTotals.payrollGross - packGross),
    controlNet_minus_packNet: round(finance.controlTotals.net - packNet),
    controlWht_minus_packPaye: round(finance.controlTotals.wht - packPaye),
    allocated_minus_packGross: round(finance.controlTotals.allocatedLabourCost - packGross),
  },
  balanced: finance.controlTotals.balanced,
  basis: finance.basis,
}, null, 2));
