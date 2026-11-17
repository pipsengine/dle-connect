/**
 * Project labour rate sources: payroll seed and the Finance rate sheet.
 * Run: npx tsx lib/project-labour-rate-sources.test.ts   (from apps/dashboard)
 */
import assert from 'node:assert/strict';
import { readDelimitedRows, readFirstSheetRows } from './crew-mobilization-upload';
import { buildLabourReport, type LabourRateCard, type LabourSourceLine } from './project-labour-cost';
import { buildSimpleWorkbook } from './project-labour-export';
import {
  PAYROLL_MULTIPLIERS,
  employerOnCostPercent,
  isManualRateNote,
  isPayrollSeedNote,
  parseRateSheet,
  parseSheetDate,
  payrollSeedRate,
  rateSheetRows,
  sameRate,
  type LabourRateInput,
} from './project-labour-rate-sources';

const options = { effectiveFrom: '2026-07-16', seededOn: '2026-11-17' };

// Payroll seed: day rate ÷ 8 with payroll multipliers.
const seeded = payrollSeedRate({ employeeCode: 'c1979', ratePerDay: 10250, currency: 'NGN' }, options)!;
assert.equal(seeded.employeeCode, 'C1979');
assert.equal(seeded.method, 'hourly');
assert.equal(seeded.amount, 1281.25);
assert.equal(seeded.weekdayOvt, 1.5);
assert.equal(seeded.sunday, 2);
assert.equal(seeded.rateVersion, 'payroll-2026-11-17');
assert.equal(isPayrollSeedNote(seeded.notes), true);
assert.equal(isManualRateNote(seeded.notes), false);

// On-cost loads the hourly rate and is recorded in the version.
const loaded = payrollSeedRate({ employeeCode: 'C1979', ratePerDay: 10250, currency: 'NGN' }, { ...options, onCostPercent: 20 })!;
assert.equal(loaded.amount, 1537.5);
assert.equal(loaded.rateVersion, 'payroll-2026-11-17-oc20');
assert.equal(sameRate(seeded, loaded), false);
assert.equal(sameRate(seeded, { ...seeded, rateVersion: 'other', notes: 'other' }), true);

// Actual employer on-cost from payroll contribution lines (P0080-style: pension + ITF + NSITF).
const p0080Lines = JSON.stringify([
  { code: 'ITF', name: 'ITF Levy', amount: 5545.13 },
  { code: 'ITF', name: 'NSITF - Nigeria Social Insurance Tr', amount: 5545.13 },
  { code: 'PENSION_ER', name: 'Pension Employer', amount: 28000 },
]);
assert.equal(employerOnCostPercent(p0080Lines, 510216.01), 7.66);
assert.equal(employerOnCostPercent('[]', 320812.51), 0);
assert.equal(employerOnCostPercent(null, 320812.51), 0);
assert.equal(employerOnCostPercent('not json', 320812.51), 0);
assert.equal(employerOnCostPercent(p0080Lines, 0), 0);
assert.equal(employerOnCostPercent(JSON.stringify([{ amount: -50 }, { amount: 'x' }]), 1000), 0);
// USD salary with naira contribution lines (P0442 in live data) must not produce a 100% load.
assert.equal(employerOnCostPercent(JSON.stringify([{ code: 'PENSION_ER', amount: 288039.54 }]), 4631.42, 'USD'), 0);
assert.equal(employerOnCostPercent(p0080Lines, 510216.01, 'ngn'), 7.66);
const actualPermanent = payrollSeedRate({ employeeCode: 'P0080', ratePerDay: 26090.5914, currency: 'NGN' }, { ...options, onCostBasis: 'actual', onCostPercent: 7.66 })!;
assert.equal(actualPermanent.amount, Math.round((26090.5914 / 8) * 1.0766 * 10000) / 10000);
assert.equal(actualPermanent.rateVersion, 'payroll-2026-11-17-er');
assert.match(actualPermanent.notes, /7\.66% employer contributions \(payroll actual\)/);
const actualDayRate = payrollSeedRate({ employeeCode: 'C1979', ratePerDay: 10250, currency: 'NGN' }, { ...options, onCostBasis: 'actual', onCostPercent: 0 })!;
assert.equal(actualDayRate.amount, 1281.25);
assert.equal(sameRate(actualDayRate, seeded), true);

// No usable payroll rate → no seed row.
assert.equal(payrollSeedRate({ employeeCode: 'C1', ratePerDay: 0, currency: 'NGN' }, options), null);
assert.equal(payrollSeedRate({ employeeCode: 'C1', ratePerDay: null, currency: 'NGN' }, options), null);

// A seeded rate prices a day the way payroll pays it: 8h at the hourly rate + 2h OVT at ×1.5.
const sourceLine = (patch: Partial<LabourSourceLine>): LabourSourceLine => ({
  allocationId: 'a1', timesheetId: 't1', reference: 'TS-1', periodId: 'p1', workDate: '2026-10-20',
  employeeCode: 'C1979', employeeName: 'YUSUF WAHABI', employeeType: 'Contract', department: 'Maintenance',
  supervisor: 'Mr SUNDAY OKEWU', location: 'IDI_ORO', workCenter: 'Maintenance', projectCode: 'DL1985',
  projectName: 'General Maintenance', projectManager: '', projectManagerCode: '', shift: 'Day',
  regularHours: 8, ovtHours: 2, nightSession: false, attendanceStatus: 'Present', timesheetStatus: 'Project Manager',
  pmState: 'pending', activity: '', chargeCode: '', recordedDayKind: 'Weekday', ...patch,
});
const asCard = (rate: LabourRateInput, patch: Partial<LabourRateCard> = {}): LabourRateCard => ({
  employeeCode: rate.employeeCode, method: rate.method, rateVersion: rate.rateVersion, effectiveFrom: rate.effectiveFrom,
  currency: rate.currency, amount: rate.amount, standardHours: rate.standardHours,
  multipliers: {
    weekdayOvt: rate.weekdayOvt ?? undefined, saturday: rate.saturday ?? undefined, saturdayOvt: rate.saturdayOvt ?? undefined,
    sunday: rate.sunday ?? undefined, sundayOvt: rate.sundayOvt ?? undefined,
    publicHoliday: rate.publicHoliday ?? undefined, publicHolidayOvt: rate.publicHolidayOvt ?? undefined,
  },
  ...patch,
});
const priced = buildLabourReport({ lines: [sourceLine({})], rates: [asCard(seeded)] });
assert.equal(priced.lines[0].regularCostKobo, 1025000);
assert.equal(priced.lines[0].ovtCostKobo, 384375);
assert.equal(priced.lines[0].totalCostKobo, 1409375);
assert.equal(priced.overview.provisionalCostKobo, 1409375);

// Weekend and public-holiday day shifts are priced too (night labour is zero, not unknown).
const saturday = buildLabourReport({ lines: [sourceLine({ workDate: '2026-10-03', ovtHours: 0 })], rates: [asCard(seeded)] });
assert.equal(saturday.lines[0].dayKind, 'saturday');
assert.equal(saturday.lines[0].totalCostKobo, 1537500);
const sunday = buildLabourReport({ lines: [sourceLine({ workDate: '2026-10-04', ovtHours: 2 })], rates: [asCard(seeded)] });
assert.equal(sunday.lines[0].totalCostKobo, 2562500);
const holiday = buildLabourReport({ lines: [sourceLine({ workDate: '2026-10-01', ovtHours: 0 })], rates: [asCard(seeded)], holidays: ['2026-10-01'] });
assert.equal(holiday.lines[0].dayKind, 'ph');
assert.equal(holiday.lines[0].totalCostKobo, 2050000);
assert.equal(saturday.projects[0].costIncomplete, false);

// Overlapping rates: the latest effective date wins regardless of row order.
const override = asCard(seeded, { amount: 2000, effectiveFrom: '2026-10-01', rateVersion: 'manual' });
const overlap = buildLabourReport({ lines: [sourceLine({ ovtHours: 0 })], rates: [override, asCard(seeded)] });
const overlapReversed = buildLabourReport({ lines: [sourceLine({ ovtHours: 0 })], rates: [asCard(seeded), override] });
assert.equal(overlap.lines[0].regularCostKobo, 1600000);
assert.equal(overlapReversed.lines[0].regularCostKobo, 1600000);

// Dates.
assert.equal(parseSheetDate('2026-10-01'), '2026-10-01');
assert.equal(parseSheetDate('01/10/2026'), '2026-10-01');
assert.equal(parseSheetDate('1/10/26'), '2026-10-01');
assert.equal(parseSheetDate('46296'), '2026-10-01');
assert.equal(parseSheetDate('next week'), '');

// Rate sheet: build → xlsx → read back → parse. Unchanged payroll rows import as identical rates.
const sheet = rateSheetRows([
  { employeeCode: 'C1979', employeeName: 'YUSUF WAHABI', payrollDayRate: 10250, current: seeded },
  { employeeCode: 'C2832', employeeName: 'NEW STARTER', payrollDayRate: 55000, current: null },
]);
assert.equal(sheet[1][17], 10250);
assert.equal(sheet[1][16], 'Payroll');
assert.equal(sheet[2][16], 'No rate');
const workbook = buildSimpleWorkbook([{ name: 'Rates', rows: sheet }, { name: 'Guide', rows: [['x']] }]);
const readBack = readFirstSheetRows(workbook);
assert.equal(readBack[0][0], 'Employee Code');
const roundTrip = parseRateSheet(readBack, { defaultEffectiveFrom: '2026-07-16', importedOn: '2026-11-17' });
assert.equal(roundTrip.errors.length, 0);
assert.equal(roundTrip.rates.length, 1);
assert.equal(roundTrip.blankRows, 1);
assert.equal(sameRate(roundTrip.rates[0], seeded), true);
assert.equal(isManualRateNote(roundTrip.rates[0].notes), true);

// CSV: defaults, overrides, and validation. Errors name the sheet row.
const csv = readDelimitedRows([
  'Employee Code,Employee Name,Method,Amount,Currency,Exchange Rate,Effective From,Weekday OVT x,Working Days,Notes',
  'P0442,EXPAT,expatriate,4631.42,USD,1500,2026-10-01,,,USD monthly',
  'C2832,NEW STARTER,daily,"55,000",,,,,,',
  'C1000,BAD METHOD,weekly,100,,,,,,',
  'C1001,NO FX,hourly,10,USD,,,,,',
  'C1002,NO DAYS,monthly,300000,,,,,,',
  'C1003,BAD DATE,hourly,10,,,someday,,,',
  'C2832,DUPLICATE,daily,60000,,,,,,',
  'C1004,NEG,hourly,-5,,,,,,',
].join('\n'));
const parsed = parseRateSheet(csv, { defaultEffectiveFrom: '2026-07-16', importedOn: '2026-11-17' });
assert.equal(parsed.rates.length, 2);
const expat = parsed.rates.find((rate) => rate.employeeCode === 'P0442')!;
assert.equal(expat.currency, 'USD');
assert.equal(expat.exchangeRate, 1500);
assert.equal(expat.weekdayOvt, PAYROLL_MULTIPLIERS.weekdayOvt);
const daily = parsed.rates.find((rate) => rate.employeeCode === 'C2832')!;
assert.equal(daily.amount, 55000);
assert.equal(daily.effectiveFrom, '2026-07-16');
assert.deepEqual(parsed.errors.map((item) => item.row), [4, 5, 6, 7, 8, 9]);
assert.match(parsed.errors[0].message, /Method/);
assert.match(parsed.errors[1].message, /Exchange Rate is required/);
assert.match(parsed.errors[2].message, /Working Days/);
assert.match(parsed.errors[3].message, /Effective From/);
assert.match(parsed.errors[4].message, /Duplicate of row 3/);
assert.match(parsed.errors[5].message, /Amount/);

assert.throws(() => parseRateSheet([['Name', 'Amount']], { defaultEffectiveFrom: '2026-07-16', importedOn: '2026-11-17' }), /Employee Code/);

console.log('project-labour-rate-sources.test.ts: ok');
