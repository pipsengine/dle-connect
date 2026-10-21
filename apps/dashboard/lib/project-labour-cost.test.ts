/**
 * Project labour cost scenarios.
 * Run: npx tsx apps/dashboard/lib/project-labour-cost.test.ts
 */
import assert from 'node:assert/strict';
import { buildLabourWorkbook, labourWorkbookRows } from './project-labour-export';
import {
  approvalLabelFor,
  buildLabourReport,
  canViewProjectLabourReport,
  mobilizationCreatesLabour,
  reportCostTotals,
  type LabourRateCard,
  type LabourSourceLine,
} from './project-labour-cost';

const hourly = (amount = 1000, code = 'C1000'): LabourRateCard => ({
  employeeCode: code,
  method: 'hourly',
  rateVersion: 'v1',
  effectiveFrom: '2026-01-01',
  currency: 'NGN',
  amount,
  multipliers: {
    weekdayOvt: 1.5,
    saturday: 2,
    saturdayOvt: 2,
    sunday: 2,
    sundayOvt: 2,
    publicHoliday: 2,
    publicHolidayOvt: 2,
  },
});

const line = (patch: Partial<LabourSourceLine>): LabourSourceLine => ({
  allocationId: patch.allocationId || 'a1',
  timesheetId: 't1',
  reference: 'TS-1',
  periodId: 'p1',
  workDate: '2026-10-08',
  employeeCode: 'C1000',
  employeeName: 'Employee A',
  employeeType: 'Contract',
  department: 'Construction',
  supervisor: 'Supervisor',
  location: 'Yard',
  workCenter: 'Fabrication',
  projectCode: 'DL2601',
  projectName: 'DL2601',
  projectManager: 'PM',
  projectManagerCode: 'C0001',
  shift: 'Day',
  regularHours: 8,
  ovtHours: 0,
  nightSession: false,
  attendanceStatus: '',
  timesheetStatus: 'Payroll Ready',
  pmState: 'approved',
  activity: 'General',
  chargeCode: '',
  ...patch,
});

const kobo = (naira: number) => Math.round(naira * 100);

const scenarioA = buildLabourReport({
  lines: [
    line({ allocationId: 'a', projectCode: 'DL2601', regularHours: 3 }),
    line({ allocationId: 'b', projectCode: 'DL2421', projectName: 'DL2421', regularHours: 2 }),
    line({ allocationId: 'c', projectCode: 'DL1811', projectName: 'DL1811', regularHours: 3 }),
  ],
  rates: [hourly()],
});
assert.deepEqual(scenarioA.projects.map((project) => [project.projectCode, project.uniqueHours, project.approvedCostKobo]), [
  ['DL1811', 3, kobo(3000)],
  ['DL2601', 3, kobo(3000)],
  ['DL2421', 2, kobo(2000)],
]);
assert.equal(scenarioA.overview.totalHours, 8);
assert.equal(scenarioA.projects.some((project) => project.uniqueHours === 8), false);

const scenarioB = buildLabourReport({
  lines: [line({ regularHours: 8, ovtHours: 3 })],
  rates: [hourly()],
});
assert.equal(scenarioB.lines[0].uniqueHours, 11);
assert.equal(scenarioB.lines[0].weekdayRegular, 8);
assert.equal(scenarioB.lines[0].weekdayOvt, 3);
assert.equal(scenarioB.lines[0].regularCostKobo, kobo(8000));
assert.equal(scenarioB.lines[0].ovtCostKobo, kobo(4500));

const scenarioC = buildLabourReport({
  lines: [line({ workDate: '2026-10-04', regularHours: 8, ovtHours: 2 })],
  rates: [hourly()],
});
assert.equal(scenarioC.lines[0].dayKind, 'sunday');
assert.equal(scenarioC.lines[0].sundayHours, 8);
assert.equal(scenarioC.lines[0].sundayOvt, 2);
assert.equal(scenarioC.lines[0].weekdayRegular, 0);
assert.equal(scenarioC.lines[0].regularCostKobo, kobo(16000));
assert.equal(scenarioC.lines[0].ovtCostKobo, kobo(4000));
assert.equal(scenarioC.lines[0].uniqueHours, 10);

const scenarioD = buildLabourReport({
  lines: [line({ workDate: '2026-10-01', regularHours: 6, ovtHours: 2 })],
  holidays: ['2026-10-01'],
  rates: [hourly()],
});
assert.equal(scenarioD.lines[0].dayKind, 'ph');
assert.equal(scenarioD.lines[0].phHours, 6);
assert.equal(scenarioD.lines[0].phOvt, 2);
assert.equal(scenarioD.lines[0].weekdayRegular, 0);
assert.equal(scenarioD.lines[0].regularCostKobo, kobo(12000));
assert.equal(scenarioD.lines[0].ovtCostKobo, kobo(4000));

const scenarioE = buildLabourReport({
  lines: [line({ regularHours: 8, nightSession: true })],
  rates: [hourly()],
});
assert.equal(scenarioE.lines[0].nightHours, 0);
assert.equal(scenarioE.lines[0].uniqueHours, 8);
assert.equal(scenarioE.lines[0].nightAllowanceKobo, kobo(1500));
assert.equal(scenarioE.overview.nightSessions, 1);
assert.notEqual(scenarioE.lines[0].nightAllowanceKobo, kobo(1500 * 8));

const scenarioF = buildLabourReport({
  lines: [
    line({ allocationId: 'a', projectCode: 'DL2601', regularHours: 3 }),
    line({ allocationId: 'b', projectCode: 'DL2421', regularHours: 2 }),
    line({ allocationId: 'c', projectCode: 'DL1811', regularHours: 3 }),
  ],
  rates: [{ ...hourly(), method: 'daily', amount: 24000, multipliers: {} }],
});
const dailyCosts = scenarioF.projects.map((project) => project.approvedCostKobo).sort((left, right) => (right || 0) - (left || 0));
assert.deepEqual(dailyCosts, [kobo(9000), kobo(9000), kobo(6000)]);
assert.equal(scenarioF.overview.approvedCostKobo, kobo(24000));

assert.equal(mobilizationCreatesLabour(0), false);
const scenarioG = buildLabourReport({ lines: [], rates: [hourly()] });
assert.equal(scenarioG.overview.totalHours, 0);
assert.equal(scenarioG.overview.approvedCostKobo, 0);
assert.equal(scenarioG.projects.length, 0);

const scenarioH = buildLabourReport({
  lines: [line({ timesheetStatus: 'Submitted', pmState: 'none', regularHours: 8 })],
  rates: [hourly()],
});
assert.equal(scenarioH.lines[0].approval, 'Submitted');
assert.equal(scenarioH.lines[0].provisional, true);
assert.equal(scenarioH.overview.approvedCostKobo, 0);
assert.equal(scenarioH.overview.provisionalCostKobo, kobo(8000));

const scenarioI = buildLabourReport({
  lines: [line({ regularHours: 8 })],
  rates: [hourly(2000)],
  locked: [{
    allocationId: 'a1',
    regularHours: 8,
    ovtHours: 0,
    nightSession: false,
    regularCostKobo: kobo(8000),
    ovtCostKobo: 0,
    nightLabourKobo: 0,
    nightAllowanceKobo: 0,
    otherAllowanceKobo: 0,
    totalKobo: kobo(8000),
    rateVersion: 'v1',
    method: 'hourly',
  }],
});
assert.equal(scenarioI.lines[0].locked, true);
assert.equal(scenarioI.lines[0].totalCostKobo, kobo(8000));
assert.equal(scenarioI.lines[0].rateVersion, 'v1');

const reconciled = buildLabourReport({
  lines: [
    line({ allocationId: 'a', projectCode: 'DL2601', regularHours: 3 }),
    line({ allocationId: 'b', projectCode: 'DL2421', regularHours: 5, ovtHours: 2 }),
  ],
  rates: [hourly()],
  budgets: [{ projectCode: 'DL2601', labourBudgetKobo: kobo(10000), plannedHours: 10 }],
});
const totals = reportCostTotals(reconciled);
assert.equal(totals.projectApproved, totals.lineApproved);
assert.equal(totals.overview, totals.lineApproved);
const workbookRows = labourWorkbookRows(reconciled, { title: 'Labour', period: 'October 2026', from: '2026-09-16', to: '2026-10-15', filters: 'none', generatedAt: '2026-10-19T00:00:00Z', generatedBy: 'test' });
const exportedApproved = workbookRows.projects.slice(1).reduce((total, row) => total + Math.round(Number(row[21] || 0) * 100), 0);
assert.equal(exportedApproved, totals.projectApproved);
const workbook = buildLabourWorkbook(reconciled, { title: 'Labour', period: 'October 2026', from: '2026-09-16', to: '2026-10-15', filters: 'none', generatedAt: '2026-10-19T00:00:00Z', generatedBy: 'test' });
assert.equal(workbook.subarray(0, 2).toString(), 'PK');

const sundayNight = buildLabourReport({
  lines: [line({ workDate: '2026-10-04', shift: 'Night', regularHours: 8, ovtHours: 2, nightSession: true })],
  rates: [hourly()],
});
assert.equal(sundayNight.lines[0].sundayHours, 0);
assert.equal(sundayNight.lines[0].sundayOvt, 0);
assert.equal(sundayNight.lines[0].nightHours, 10);
assert.equal(sundayNight.lines[0].uniqueHours, 10);
assert.equal(sundayNight.lines[0].nightAllowanceKobo, kobo(1500));
assert.equal(sundayNight.lines[0].nightLabourKobo, kobo(16000));
assert.equal(sundayNight.lines[0].ovtCostKobo, kobo(4000));

const missing = buildLabourReport({ lines: [line({ regularHours: 8 })], rates: [] });
assert.equal(missing.lines[0].totalCostKobo, null);
assert.equal(missing.lines[0].exceptions.includes('Missing Cost Rate'), true);
assert.equal(missing.projects[0].status, 'Budget Not Configured');
assert.equal(missing.projects[0].varianceKobo, null);
assert.equal(missing.projects[0].utilization, null);

assert.equal(approvalLabelFor('Cost Control'), 'Supervisor Approved');
assert.equal(approvalLabelFor('Project Manager', 'partial'), 'PM Partially Approved');
assert.equal(approvalLabelFor('Payroll Readiness'), 'HR Approved');
assert.equal(canViewProjectLabourReport({ globalAdmin: true }), true);
assert.equal(canViewProjectLabourReport({ department: 'Finance' }), true);
assert.equal(canViewProjectLabourReport({ unit: 'Projects' }), true);
assert.equal(canViewProjectLabourReport({ roles: 'IT Administrator' }), true);
assert.equal(canViewProjectLabourReport({ department: 'Sales' }), true);
assert.equal(canViewProjectLabourReport({ department: 'Proposal' }), true);
assert.equal(canViewProjectLabourReport({ roles: 'Super Administrator' }), true);
assert.equal(canViewProjectLabourReport({ roles: 'Timesheet Administrator', department: 'Human Resources' }), false);

console.log('project-labour-cost.test.ts: ok');
