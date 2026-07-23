/** Client-safe payroll attendance sheet columns/types (no Node/SQL imports). */

export const PAYROLL_ATTENDANCE_SHEET_COLUMNS = [
  'Emp. Code',
  'First Name',
  'Last Name',
  'Job Title',
  'Location',
  'WEEK DAYS WORKED',
  'WKD TOT',
  'PAID LEAVE (DAYS)',
  'L TOT',
  'TOTAL SATURDAY (HRS)',
  'S TOT',
  'TOTAL SUNDAY (HRS)',
  'SN TOT',
  'TOTAL PUBLIC HOLIDAY (HRS)',
  'PH TOT',
  'TOTAL OVERTIME WEEKDAY (HRS)',
  'OVT TOT',
  'NIGHT WORKED (DAYS)',
  'NW TOT',
  'SITE ALLOWANCE (DAYS)',
  'SA TOT',
  'TOTAL NUMBER OF DAYS WORKED',
] as const;

export type PayrollAttendanceSheetRow = {
  empCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  location: string;
  weekDaysWorked: number;
  weekDayTotal: number;
  paidLeaveDays: number;
  paidLeaveTotal: number;
  saturdayHours: number;
  saturdayTotal: number;
  sundayHours: number;
  sundayTotal: number;
  publicHolidayHours: number;
  publicHolidayTotal: number;
  weekdayOvertimeHours: number;
  weekdayOvertimeTotal: number;
  nightWorkedDays: number;
  nightWorkedTotal: number;
  siteAllowanceDays: number;
  siteAllowanceTotal: number;
  totalDaysWorked: number;
};

export const payrollAttendanceSheetToExcelRows = (
  rows: PayrollAttendanceSheetRow[],
  canViewCosts = true,
): (string | number)[][] =>
  rows.map((row) => [
    row.empCode,
    row.firstName,
    row.lastName,
    row.jobTitle,
    row.location,
    row.weekDaysWorked,
    canViewCosts ? row.weekDayTotal : 'Restricted',
    row.paidLeaveDays,
    canViewCosts ? row.paidLeaveTotal : 'Restricted',
    row.saturdayHours,
    canViewCosts ? row.saturdayTotal : 'Restricted',
    row.sundayHours,
    canViewCosts ? row.sundayTotal : 'Restricted',
    row.publicHolidayHours,
    canViewCosts ? row.publicHolidayTotal : 'Restricted',
    row.weekdayOvertimeHours,
    canViewCosts ? row.weekdayOvertimeTotal : 'Restricted',
    row.nightWorkedDays,
    canViewCosts ? row.nightWorkedTotal : 'Restricted',
    row.siteAllowanceDays,
    canViewCosts ? row.siteAllowanceTotal : 'Restricted',
    row.totalDaysWorked,
  ]);
