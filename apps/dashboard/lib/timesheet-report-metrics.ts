/**
 * Timesheet report figures used by the Excel export.
 * Booked hours are already net of the unpaid break — do not subtract it again.
 */
import {
  clockTimeToMinutes,
  isDayRateTimesheetEmployeeCode,
  weekdayOvertimeHoursFromLine,
} from '@/lib/timesheet-entry-shared';

/** Flat 5% WHT / PAYE for C-code daily-rate contract labour. Permanent staff are not taxed here. */
export const TIMESHEET_CONTRACT_WHT_RATE = 0.05;

export const roundReportHours = (hours: number, digits = 1) => {
  const value = Number.isFinite(hours) ? hours : 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Stored booked hours, rounded. Never applies a second break deduction. */
export const bookedTimesheetHours = (hours: number) => roundReportHours(Math.max(0, Number(hours) || 0));

export const resolveTimesheetLabourRateNgn = (
  employee?: { ratePerHour?: number | null; ratePerDay?: number | null } | null,
) => {
  const hourly = Number(employee?.ratePerHour || 0);
  if (hourly > 0) return roundReportHours(hourly, 4);
  const daily = Number(employee?.ratePerDay || 0);
  if (daily > 0) return roundReportHours(daily / 8, 4);
  return 0;
};

export const isContractDayRateEmployee = (employeeNo?: string | null, employeeId?: string | null) =>
  isDayRateTimesheetEmployeeCode(employeeNo) || isDayRateTimesheetEmployeeCode(employeeId);

export const contractLabourWhtNgn = (labourCost: number, contract: boolean) =>
  contract ? Math.round(Math.max(0, Number(labourCost) || 0) * TIMESHEET_CONTRACT_WHT_RATE) : 0;

export const contractLabourNetNgn = (labourCost: number, contract: boolean) => {
  const gross = Math.round(Math.max(0, Number(labourCost) || 0));
  return contract ? gross - contractLabourWhtNgn(gross, true) : null;
};

/** Split a line total across allocations so the rounded shares still add back to the total. */
export const prorateBookedHours = (total: number, weights: number[]) => {
  const amount = bookedTimesheetHours(total);
  if (!weights.length) return [];
  if (amount <= 0) return weights.map(() => 0);
  const positive = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const sum = positive.reduce((totalWeight, weight) => totalWeight + weight, 0);
  if (sum <= 0) return weights.map(() => 0);
  const rounded = positive.map((weight) => bookedTimesheetHours((amount * weight) / sum));
  const drift = bookedTimesheetHours(amount - rounded.reduce((totalRounded, value) => totalRounded + value, 0));
  if (drift !== 0) {
    let index = 0;
    positive.forEach((weight, itemIndex) => {
      if (weight > positive[index]) index = itemIndex;
    });
    rounded[index] = bookedTimesheetHours(Math.max(0, rounded[index] + drift));
  }
  return rounded;
};

export const lineOvertimeHours = (input: {
  usedHours: number;
  offshoreAllowanceHours?: number | null;
  timesheetDate: string;
  holidayDates?: string[];
}) => weekdayOvertimeHoursFromLine(
  { usedHours: input.usedHours, offshoreAllowanceHours: input.offshoreAllowanceHours },
  input.timesheetDate,
  input.holidayDates,
);

/** Punch time as written. ISO values keep the clock in the string so Excel does not shift timezone. */
export const formatTimesheetClockForExport = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const minutes = clockTimeToMinutes(raw);
  if (minutes === null) return raw;
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export type TimesheetExportMeasureRow = {
  lineId: string;
  employeeNo?: string;
  employeeId?: string;
  employeeName?: string;
  department?: string;
  timesheetDate?: string;
  dayWorked?: number;
  daysWorked?: number;
  attendanceHours?: number;
  usedHours?: number;
  idleHours?: number;
  productiveHours?: number;
  nonProductiveHours?: number;
  overtimeHours?: number;
  totalHours?: number;
  allocationHours?: number;
  variance?: number;
  labourCostNgn?: number;
  whtNgn?: number | null;
  netNgn?: number | null;
  projectCode?: string;
  normalizedStatus?: string;
};

const uniqueLines = (rows: TimesheetExportMeasureRow[]) => {
  const seen = new Set<string>();
  const lines: TimesheetExportMeasureRow[] = [];
  for (const row of rows) {
    const key = row.lineId || `${row.employeeNo || row.employeeId}-${row.timesheetDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(row);
  }
  return lines;
};

const sumHours = (rows: TimesheetExportMeasureRow[], pick: (row: TimesheetExportMeasureRow) => number | null | undefined) =>
  bookedTimesheetHours(rows.reduce((sum, row) => sum + Number(pick(row) || 0), 0));

const sumMoney = (rows: TimesheetExportMeasureRow[], pick: (row: TimesheetExportMeasureRow) => number | null | undefined) =>
  Math.round(rows.reduce((sum, row) => sum + Number(pick(row) || 0), 0));

export type TimesheetExportControlTotals = {
  lines: number;
  allocations: number;
  employees: number;
  payableEmployeeDays: number;
  attendanceHours: number;
  usedHours: number;
  idleHours: number;
  variance: number;
  productiveHours: number;
  allocationHours: number;
  nonProductiveHours: number;
  overtimeHours: number;
  totalHours: number;
  labourCostNgn: number;
  whtNgn: number;
  netNgn: number;
};

/** Attendance, used hours, idle, and payable days are counted once per timesheet line. Project hours are summed per allocation. */
export const timesheetExportControlTotals = (rows: TimesheetExportMeasureRow[]): TimesheetExportControlTotals => {
  const lines = uniqueLines(rows);
  const employeeDays = new Set<string>();
  const employees = new Set<string>();
  for (const line of lines) {
    const employeeKey = String(line.employeeNo || line.employeeId || line.employeeName || '').trim();
    if (employeeKey) employees.add(employeeKey);
    if (line.dayWorked === 1 && line.timesheetDate && employeeKey) {
      employeeDays.add(`${employeeKey}::${line.timesheetDate}`);
    }
  }
  return {
    lines: lines.length,
    allocations: rows.length,
    employees: employees.size,
    payableEmployeeDays: employeeDays.size,
    attendanceHours: sumHours(lines, (row) => row.attendanceHours),
    usedHours: sumHours(lines, (row) => row.usedHours),
    idleHours: sumHours(lines, (row) => row.idleHours),
    variance: sumHours(lines, (row) => row.variance),
    productiveHours: sumHours(rows, (row) => row.productiveHours),
    allocationHours: sumHours(rows, (row) => row.allocationHours),
    nonProductiveHours: sumHours(rows, (row) => row.nonProductiveHours),
    overtimeHours: sumHours(rows, (row) => row.overtimeHours),
    totalHours: sumHours(rows, (row) => row.totalHours),
    labourCostNgn: sumMoney(rows, (row) => row.labourCostNgn),
    whtNgn: sumMoney(rows, (row) => row.whtNgn),
    netNgn: sumMoney(rows, (row) => (row.netNgn == null ? Number(row.labourCostNgn || 0) - Number(row.whtNgn || 0) : row.netNgn)),
  };
};

export type TimesheetExportLineTotal = {
  timesheetDate: string;
  periodName: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  dayWorked: number;
  daysWorked: number;
  attendanceHours: number;
  usedHours: number;
  idleHours: number;
  overtimeHours: number;
  totalHours: number;
  allocationHours: number;
  projectCodes: string;
  labourCostNgn: number;
  whtNgn: number | null;
  netNgn: number | null;
  status: string;
};

export const buildTimesheetExportLineTotals = (
  rows: Array<TimesheetExportMeasureRow & { periodName?: string }>,
): TimesheetExportLineTotal[] => {
  const groups = new Map<string, TimesheetExportLineTotal & { projects: string[] }>();
  for (const row of rows) {
    const key = row.lineId || `${row.employeeNo || row.employeeId}-${row.timesheetDate}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        timesheetDate: row.timesheetDate || '',
        periodName: row.periodName || '',
        employeeNo: row.employeeNo || '',
        employeeName: row.employeeName || '',
        department: row.department || '',
        dayWorked: row.dayWorked === 1 ? 1 : 0,
        daysWorked: Number(row.daysWorked || 0),
        attendanceHours: bookedTimesheetHours(Number(row.attendanceHours || 0)),
        usedHours: bookedTimesheetHours(Number(row.usedHours || 0)),
        idleHours: bookedTimesheetHours(Number(row.idleHours || 0)),
        overtimeHours: bookedTimesheetHours(Number(row.overtimeHours || 0)),
        totalHours: bookedTimesheetHours(Number(row.totalHours || 0)),
        allocationHours: bookedTimesheetHours(Number(row.allocationHours || 0)),
        projectCodes: '',
        projects: row.projectCode ? [row.projectCode] : [],
        labourCostNgn: Math.round(Number(row.labourCostNgn || 0)),
        whtNgn: row.whtNgn == null ? null : Math.round(Number(row.whtNgn)),
        netNgn: row.netNgn == null ? null : Math.round(Number(row.netNgn)),
        status: row.normalizedStatus || '',
      });
      continue;
    }
    existing.overtimeHours = bookedTimesheetHours(existing.overtimeHours + Number(row.overtimeHours || 0));
    existing.totalHours = bookedTimesheetHours(existing.totalHours + Number(row.totalHours || 0));
    existing.allocationHours = bookedTimesheetHours(existing.allocationHours + Number(row.allocationHours || 0));
    existing.labourCostNgn += Math.round(Number(row.labourCostNgn || 0));
    if (row.whtNgn != null) existing.whtNgn = Math.round(Number(existing.whtNgn || 0) + Number(row.whtNgn));
    if (row.netNgn != null) existing.netNgn = Math.round(Number(existing.netNgn || 0) + Number(row.netNgn));
    if (row.projectCode && !existing.projects.includes(row.projectCode)) existing.projects.push(row.projectCode);
    if (row.dayWorked === 1) existing.dayWorked = 1;
    existing.daysWorked = Math.max(existing.daysWorked, Number(row.daysWorked || 0));
  }
  return Array.from(groups.values())
    .map(({ projects, ...row }) => ({ ...row, projectCodes: projects.join(', ') }))
    .sort((a, b) => b.timesheetDate.localeCompare(a.timesheetDate) || a.employeeName.localeCompare(b.employeeName));
};
