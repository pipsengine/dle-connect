/** Client-safe payroll attendance sheet columns/types (no Node/SQL imports). */

export const PAYROLL_ATTENDANCE_SHEET_COLUMNS = [
  'Emp. Code',
  'First Name',
  'Last Name',
  'Job Title',
  'Location',
  'WEEK DAYS WORKED',
  'PAID LEAVE (DAYS)',
  'SATURDAYS WORKED',
  'TOTAL SATURDAY (HRS)',
  'SUNDAYS WORKED',
  'TOTAL SUNDAY (HRS)',
  'TOTAL PUBLIC HOLIDAY (HRS)',
  'TOTAL OVERTIME WEEKDAY (HRS)',
  'NIGHT WORKED (DAYS)',
  'TOTAL NIGHT (HRS)',
  'SITE ALLOWANCE (DAYS)',
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
  saturdayDaysWorked: number;
  saturdayHours: number;
  saturdayTotal: number;
  sundayDaysWorked: number;
  sundayHours: number;
  sundayTotal: number;
  publicHolidayHours: number;
  publicHolidayTotal: number;
  weekdayOvertimeHours: number;
  weekdayOvertimeTotal: number;
  nightWorkedDays: number;
  nightWorkedHours: number;
  nightWorkedTotal: number;
  siteAllowanceDays: number;
  siteAllowanceTotal: number;
  totalDaysWorked: number;
};

export const payrollAttendanceSheetToExcelRows = (
  rows: PayrollAttendanceSheetRow[],
): (string | number)[][] =>
  rows.map((row) => [
    row.empCode,
    row.firstName,
    row.lastName,
    row.jobTitle,
    row.location,
    row.weekDaysWorked,
    row.paidLeaveDays,
    row.saturdayDaysWorked,
    row.saturdayHours,
    row.sundayDaysWorked,
    row.sundayHours,
    row.publicHolidayHours,
    row.weekdayOvertimeHours,
    row.nightWorkedDays,
    row.nightWorkedHours,
    row.siteAllowanceDays,
    row.totalDaysWorked,
  ]);
