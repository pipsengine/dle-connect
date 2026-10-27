/**
 * DLE Final Entitlement Sheet arithmetic — matches the official Olamide Badetan sheet.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/final-entitlement-sheet.test.ts
 */
import {
  DLE_ANNUAL_WORKING_DAYS,
  buildEntitlementSnapshot,
  buildFinalEntitlementSheet,
  daysWorkedInLeaveYear,
  entitlementSheetFromSettlement,
  formatEntitlementDate,
  formatEntitlementHeaderMoney,
  formatEntitlementMoney,
  roundOfficialSheetAmount,
  isStatutoryNigeriaWorkHoliday,
  prorateMonthlyAmount,
  salaryEarnedLabel,
} from './final-entitlement-sheet';
import type { FinalPayrollLine, FinalPayrollSettlement } from './final-payroll-settlement-shared';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const closeTo = (actual: number, expected: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(actual * factor) === Math.round(expected * factor);
};

const official2026Holidays = [
  { date: '2026-01-01', label: "New Year's Day" },
  { date: '2026-02-14', label: "Valentine's Day" },
  { date: '2026-03-08', label: "Women's Day" },
  { date: '2026-03-19', label: 'Eid El-Fitr Holiday' },
  { date: '2026-03-20', label: 'Eid El-Fitr' },
  { date: '2026-04-03', label: 'Good Friday' },
  { date: '2026-04-04', label: 'Holy Saturday' },
  { date: '2026-04-05', label: 'Easter Sunday' },
  { date: '2026-04-06', label: 'Easter Monday' },
  { date: '2026-05-01', label: "Workers' Day" },
  { date: '2026-05-27', label: "Children's Day" },
  { date: '2026-05-28', label: 'Id el Kabir Holiday' },
  { date: '2026-06-12', label: 'Democracy Day' },
  { date: '2026-06-16', label: 'Al-Hijra' },
  { date: '2026-06-21', label: "Father's Day" },
  { date: '2026-08-25', label: 'Id el Maulud' },
  { date: '2026-10-01', label: 'National Day' },
];

assert(DLE_ANNUAL_WORKING_DAYS === 248, 'company working-day year is 248');
assert(!isStatutoryNigeriaWorkHoliday("Valentine's Day"), 'Valentine is not a work holiday');
assert(!isStatutoryNigeriaWorkHoliday("Children's Day"), 'Children’s Day is not a work holiday');
assert(isStatutoryNigeriaWorkHoliday('Eid El-Fitr'), 'Eid is a work holiday');
assert(isStatutoryNigeriaWorkHoliday('National Day'), 'Independence / National Day is a work holiday');

const daysWorked = daysWorkedInLeaveYear({
  lastWorkingDay: '2026-10-06',
  dateOfJoining: '2024-05-27',
  leaveYear: 2026,
  holidays: official2026Holidays,
});
assert(daysWorked === 189, `days worked in 2026 to 6 Oct should be 189, got ${daysWorked}`);

const recovery = buildEntitlementSnapshot({
  lastWorkingDay: '2026-10-06',
  dateOfJoining: '2024-05-27',
  annualLeaveAllowance: 465962.92,
  leaveAllowancePaid: true,
  daysWorkedInYear: 189,
  totalWorkingDays: 248,
});
assert(recovery.remainingWorkingDays === 59, `remaining days ${recovery.remainingWorkingDays}`);
assert(closeTo(recovery.proratedLeaveRecovery, 110854), `leave recovery ${recovery.proratedLeaveRecovery}`);
assert(recovery.leaveAllowanceCredit === 0, 'already-paid leave allowance is not credited again');

const unpaid = buildEntitlementSnapshot({
  lastWorkingDay: '2026-10-06',
  annualLeaveAllowance: 465962.92,
  leaveAllowancePaid: false,
  daysWorkedInYear: 189,
  totalWorkingDays: 248,
});
assert(unpaid.proratedLeaveRecovery === 0, 'unpaid leave allowance is not clawed back');
assert(unpaid.leaveAllowanceCredit === 355109, `earned leave credit ${unpaid.leaveAllowanceCredit}`);

assert(closeTo(prorateMonthlyAmount(1_179_147, '2026-10-06'), 228222), 'Oct 1–6 salary from calendar month');
assert(salaryEarnedLabel('2026-10-06') === 'Salary Earned (1st - 6th October 2026)', salaryEarnedLabel('2026-10-06'));
assert(formatEntitlementDate('2024-05-27') === '27 May 2024', formatEntitlementDate('2024-05-27'));
assert(formatEntitlementMoney(0) === '-', 'zero prints as dash');
assert(formatEntitlementMoney(89772) === '89,772.00', formatEntitlementMoney(89772));
assert(roundOfficialSheetAmount(228222.41) === 228222, 'salary kobo rounds to official naira');
assert(roundOfficialSheetAmount(11308.64) === 11309, 'pension kobo rounds to official naira');
assert(roundOfficialSheetAmount(16287.07) === 16287, 'tax kobo rounds to official naira');
assert(formatEntitlementHeaderMoney(465962.92) === '465,962.92', formatEntitlementHeaderMoney(465962.92));

const sheet = buildFinalEntitlementSheet({
  employeeName: 'Olamide Badetan',
  employeeCode: '04559',
  designation: 'AG. HR & ADMIN',
  department: 'HUMAN RESOURCES & ADMIN',
  dateOfEmployment: '2024-05-27',
  dateOfExit: '2026-10-06',
  annualLeaveAllowance: 465962.92,
  leaveAllowancePaid: true,
  salaryEarned: 228222,
  pension: 11309,
  taxDeduction: 16287,
  daysWorkedInYear: 189,
  preparedBy: 'Fawaz Adeshina',
  preparedDate: '2026-10-21',
});

assert(sheet.daysWorkedInYear === 189, 'sheet days worked');
assert(sheet.totalWorkingDays === 248, 'sheet total working days');
assert(closeTo(sheet.annualLeaveAllowance, 465962.92), 'header leave allowance');
assert(sheet.allowances[0].amount === 0, 'leave allowance credit is blank when already paid');
assert(sheet.allowances[1].amount === 228222, 'salary earned');
assert(sheet.allowances[2].amount === 0, 'gratuity nil under 5 years');
assert(closeTo(sheet.deductions.find((row) => row.id === 'prorated-leave')?.amount || 0, 110854), 'prorated leave');
assert(sheet.amountDueToEmployee === 228222, `due to employee ${sheet.amountDueToEmployee}`);
assert(closeTo(sheet.amountDueToDle, 138450), `due to DLE ${sheet.amountDueToDle}`);
assert(closeTo(sheet.netDueToEmployee, 89772), `net ${sheet.netDueToEmployee}`);

const line = (id: string, amount: number, extra: Partial<FinalPayrollLine> = {}): FinalPayrollLine => ({
  id,
  label: id,
  description: id,
  policyBasis: '-',
  periodDays: '-',
  amount,
  remarks: '-',
  included: true,
  ...extra,
});

const settlementInput = {
  id: 'FPS-202610-04559',
  period: '2026-10',
  employeeId: '04559',
  employeeCode: '04559',
  employeeName: 'Olamide Badetan',
  department: 'HUMAN RESOURCES & ADMIN',
  employmentType: 'Permanent',
  jobTitle: 'AG. HR & ADMIN',
  grade: '—',
  currency: 'NGN' as const,
  basicSalary: 0,
  dateOfJoining: '2024-05-27',
  serviceLength: '2 Years 4 Months',
  exitType: 'Resignation',
  resignationDate: null,
  lastWorkingDay: '2026-10-06',
  noticePeriod: '1 Month',
  reasonForLeaving: '',
  remarks: '',
  lastRegularPayroll: 'Oct 2026',
  nextPayrollExcluded: true,
  status: 'Draft' as const,
  clearance: [],
  approvalStages: [],
  earnings: [line('gross-salary', 228222.41), line('gratuity', 0), line('leave-allowance', 0)],
  deductions: [line('staff-loan', 0), line('cash-advance', 0), line('prorated-leave', 110854), line('notice-recovery', 10143.74)],
  statutory: [line('paye', 16287.07), line('pension', 11308.64), line('union-dues', 0), line('nhf', 2500)],
  comments: [],
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
  createdBy: 'Fawaz Adeshina',
  updatedBy: 'Fawaz Adeshina',
  entitlement: recovery,
} as FinalPayrollSettlement;

const fromSettlement = entitlementSheetFromSettlement(settlementInput);

assert(fromSettlement.allowances[1].label === 'Salary Earned (1st - 6th October 2026)', fromSettlement.allowances[1].label);
assert(fromSettlement.allowances[0].id === 'leave-allowance', 'official leave row stays first');
assert(fromSettlement.allowances[1].amount === 228222, `rounded salary ${fromSettlement.allowances[1].amount}`);
assert(fromSettlement.deductions.find((row) => row.id === 'notice-recovery')?.amount === 10144, 'notice recovery prints on the sheet');
assert(fromSettlement.deductions.find((row) => row.id === 'nhf')?.amount === 2500, 'NHF prints when it has an amount');
assert(fromSettlement.amountDueToDle === 151093, `sheet deductions include recoveries ${fromSettlement.amountDueToDle}`);
assert(fromSettlement.netDueToEmployee === 77129, `sheet net matches settlement recoveries ${fromSettlement.netDueToEmployee}`);

const anetor = entitlementSheetFromSettlement({
  ...settlementInput,
  employeeCode: 'L2787',
  employeeName: 'Mr. ANETOR OTAIGBE',
  lastWorkingDay: '2026-10-06',
  earnings: [line('gross-salary', 77183.32)],
  deductions: [line('notice-recovery', 186097.56)],
  statutory: [line('paye', 0), line('pension', 0)],
  entitlement: null,
});
assert(anetor.allowances[1].amount === 77183, `Anetor salary ${anetor.allowances[1].amount}`);
assert(anetor.deductions.find((row) => row.id === 'notice-recovery')?.amount === 186098, 'Anetor notice recovery is on the sheet');
assert(anetor.amountDueToEmployee === 77183, `Anetor due to employee ${anetor.amountDueToEmployee}`);
assert(anetor.amountDueToDle === 186098, `Anetor due to DLE ${anetor.amountDueToDle}`);
assert(anetor.netDueToEmployee === -108914, `Anetor net ${anetor.netDueToEmployee}`);

const reuben = entitlementSheetFromSettlement({
  ...settlementInput,
  employeeCode: 'L2216',
  employeeName: 'REUBEN AUDU',
  lastWorkingDay: '2026-10-07',
  earnings: [
    line('gross-salary', 36129.03),
    line('leave-encashment', 69533.38, { label: 'Leave Encashment' }),
    line('notice-pay', 69533.38, { label: 'Notice Pay (In Lieu)' }),
  ],
  deductions: [line('staff-loan', 0), line('cash-advance', 0)],
  statutory: [line('paye', 0), line('pension', 0)],
  entitlement: null,
});
assert(!reuben.allowances.some((row) => row.id === 'leave-encashment'), 'leave encashment is not its own sheet row');
assert(reuben.allowances[1].amount === 36129, `Reuben salary is October days only ${reuben.allowances[1].amount}`);
assert(reuben.allowances.some((row) => row.id === 'notice-pay' && row.amount === 69533), 'Reuben notice pay is on the sheet');
assert(reuben.amountDueToEmployee === 105662, `Reuben due to employee ${reuben.amountDueToEmployee}`);
assert(reuben.netDueToEmployee === 105662, `Reuben net ${reuben.netDueToEmployee}`);

const faturoti = entitlementSheetFromSettlement({
  ...settlementInput,
  employeeCode: 'P0459',
  employeeName: 'FATUROTI ISAAC GBOLAHAN',
  lastWorkingDay: '2026-10-06',
  earnings: [line('gross-salary', 277664.95)],
  deductions: [line('other-deductions', 88666.65, { label: 'Other Deductions' }), line('union-dues', 8009.74, { label: 'Union Dues' })],
  statutory: [line('paye', 23700.7), line('pension', 11326.93)],
  entitlement: null,
});
assert(faturoti.deductions.find((row) => row.id === 'union-dues')?.amount === 8010, 'union dues on the deduction list still print');
assert(faturoti.deductions.find((row) => row.id === 'other-deductions')?.amount === 88667, 'other deductions print');
assert(faturoti.amountDueToEmployee === 277665, `Faturoti due to employee ${faturoti.amountDueToEmployee}`);
assert(faturoti.amountDueToDle === 131704, `Faturoti due to DLE ${faturoti.amountDueToDle}`);
assert(faturoti.netDueToEmployee === 145961, `Faturoti net ${faturoti.netDueToEmployee}`);

console.log('final-entitlement-sheet.test: OK');
