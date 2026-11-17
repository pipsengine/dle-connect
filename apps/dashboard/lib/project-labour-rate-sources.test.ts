/**
 * Project labour cost from payroll day rates (day rate ÷ 8, payroll multipliers).
 * Run: npx tsx lib/project-labour-rate-sources.test.ts   (from apps/dashboard)
 */
import assert from 'node:assert/strict';
import { buildLabourReport, type LabourSourceLine } from './project-labour-cost';
import { payrollDayRateCard } from './project-labour-rate-sources';

const yusuf = payrollDayRateCard({ employeeCode: 'c1979', ratePerDay: 10250, currency: 'NGN' })!;
assert.equal(yusuf.employeeCode, 'C1979');
assert.equal(yusuf.method, 'hourly');
assert.equal(yusuf.amount, 1281.25);
assert.equal(yusuf.multipliers?.weekdayOvt, 1.5);
assert.equal(yusuf.multipliers?.saturday, 1.5);
assert.equal(yusuf.multipliers?.sunday, 2);
assert.equal(yusuf.multipliers?.publicHoliday, 2);

// Not costed: no day rate, or foreign-currency pay (not applicable to this report).
assert.equal(payrollDayRateCard({ employeeCode: 'C1', ratePerDay: 0, currency: 'NGN' }), null);
assert.equal(payrollDayRateCard({ employeeCode: 'C1', ratePerDay: null, currency: 'NGN' }), null);
assert.equal(payrollDayRateCard({ employeeCode: 'P0442', ratePerDay: 210, currency: 'USD' }), null);
assert.equal(payrollDayRateCard({ employeeCode: 'C2', ratePerDay: 8000, currency: null })?.amount, 1000);

const line = (patch: Partial<LabourSourceLine>): LabourSourceLine => ({
  allocationId: 'a1', timesheetId: 't1', reference: 'TS-1', periodId: 'p1', workDate: '2026-10-20',
  employeeCode: 'C1979', employeeName: 'YUSUF WAHABI', employeeType: 'Daily Rate', department: 'Maintenance',
  supervisor: 'Mr SUNDAY OKEWU', location: 'IDI_ORO', workCenter: 'Maintenance', projectCode: 'DL1985',
  projectName: 'General Maintenance', projectManager: '', projectManagerCode: '', shift: 'Day',
  regularHours: 8, ovtHours: 2, nightSession: false, attendanceStatus: 'Present', timesheetStatus: 'Project Manager',
  pmState: 'pending', activity: '', chargeCode: '', recordedDayKind: 'Weekday', ...patch,
});
const price = (patch: Partial<LabourSourceLine>, holidays: string[] = []) =>
  buildLabourReport({ lines: [line(patch)], rates: [yusuf], holidays }).lines[0];

// Weekday 8h + 2h OVT: ₦10,250 + 2 × ₦1,281.25 × 1.5 = ₦14,093.75 (as payroll pays it).
const weekday = price({});
assert.equal(weekday.regularCostKobo, 1025000);
assert.equal(weekday.ovtCostKobo, 384375);
assert.equal(weekday.totalCostKobo, 1409375);
// Saturday 8h ×1.5 = ₦15,375.
assert.equal(price({ workDate: '2026-10-03', ovtHours: 0 }).totalCostKobo, 1537500);
// Sunday 8h + 2h, all ×2 = ₦25,625.
assert.equal(price({ workDate: '2026-10-04' }).totalCostKobo, 2562500);
// Public holiday 8h ×2 = ₦20,500.
const holiday = price({ workDate: '2026-10-01', ovtHours: 0 }, ['2026-10-01']);
assert.equal(holiday.dayKind, 'ph');
assert.equal(holiday.totalCostKobo, 2050000);
// The rate applies to any work date (no effective-date gap).
assert.equal(price({ workDate: '2025-01-06', ovtHours: 0 }).totalCostKobo, 1025000);

console.log('project-labour-rate-sources.test.ts: ok');
