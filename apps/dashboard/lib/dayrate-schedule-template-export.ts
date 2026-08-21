/**
 * Fill the official Dayrate Payment Schedule .xlsx template for payroll export.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { loadDayrateAttendanceByEmpCode, resolveOfficialCompanyBucket } from '@/lib/payroll-official-excel-export';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
] as const;

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const suffix = path.join('apps', 'dashboard');
  return cwd.endsWith(suffix) ? cwd : path.join(cwd, suffix);
};

const resolveRepoRoot = () => {
  let dir = path.resolve(process.cwd());
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(dir, 'apps', 'dashboard')) && existsSync(path.join(dir, 'backups'))) return dir;
    if (existsSync(path.join(dir, 'deployment')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(resolveDashboardRoot(), '..', '..');
};

export const dayratePaymentScheduleFileName = (period: string, periodLabel?: string) => {
  const token = compact(period).replace(/^per-/i, '');
  const match = /^(\d{4})-(\d{2})$/.exec(token);
  if (match) {
    const year = match[1];
    const month = MONTH_NAMES[Number(match[2]) - 1] || 'MONTH';
    return `${month} ${year}DAYRATE PAYMENT SCHEDULE .xlsx`;
  }
  const fromLabel = compact(periodLabel).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (fromLabel) {
    const parts = fromLabel.split(/\s+/);
    const month = MONTH_NAMES.find((name) => parts.includes(name));
    const year = parts.find((part) => /^\d{4}$/.test(part));
    if (month && year) return `${month} ${year}DAYRATE PAYMENT SCHEDULE .xlsx`;
  }
  return 'DAYRATE PAYMENT SCHEDULE .xlsx';
};

const scheduleTitleForSheet = (period: string, periodLabel?: string) => {
  const token = compact(period).replace(/^per-/i, '');
  const match = /^(\d{4})-(\d{2})$/.exec(token);
  if (match) {
    const month = MONTH_NAMES[Number(match[2]) - 1] || 'MONTH';
    return `${month} ${match[1]} DAYRATE PAYMENT SCHEDULE`;
  }
  return dayratePaymentScheduleFileName(period, periodLabel)
    .replace(/\.xlsx$/i, '')
    .replace(/(\d{4})DAYRATE/, '$1 DAYRATE')
    .trim();
};

export const resolveDayratePaymentScheduleTemplatePath = () => {
  const candidates = [
    process.env.DLE_DAYRATE_SCHEDULE_TEMPLATE_PATH,
    path.join(resolveDashboardRoot(), 'data', 'hris', 'templates', 'dayrate-payment-schedule.xlsx'),
    path.join(resolveRepoRoot(), 'data', 'hris', 'templates', 'dayrate-payment-schedule.xlsx'),
    path.join(resolveRepoRoot(), 'backups', 'Dayrate Payment Schedule', 'AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx'),
    path.join(resolveDashboardRoot(), '..', '..', 'backups', 'Dayrate Payment Schedule', 'AUGUST 2026DAYRATE PAYMENT SCHEDULE .xlsx'),
  ].map((value) => compact(value)).filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
};

const officialEmployeeCode = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId'>) => {
  const code = compact(record.employeeCode || record.employeeId).toUpperCase();
  const match = code.match(/\b(C\d{3,})\b/);
  return match?.[1] || code;
};

const splitName = (fullName: string, firstName?: string | null, lastName?: string | null) => {
  if (compact(firstName) || compact(lastName)) {
    return { firstName: compact(firstName) || compact(fullName), lastName: compact(lastName) };
  }
  const cleaned = compact(fullName).replace(/^(Mr|Mrs|Miss|Ms|Dr|Engr)\.?\s+/i, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const lineAmount = (lines: PayrollCalculationRecord['earningLines'] | undefined, pattern: RegExp) =>
  roundMoney((lines || [])
    .filter((line) => pattern.test(`${line.code || ''} ${line.name || ''}`))
    .reduce((sum, line) => sum + Number(line.amount || 0), 0));

type DetailRow = {
  code: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  location: string;
  dailyRate: number;
  age: string | number;
  gender: string;
  weekDays: number;
  weekdayOvtHrs: number;
  satHrs: number;
  sunHrs: number;
  phHrs: number;
  nightDays: number;
  wkdEarning: number;
  wkdOvtAmt: number;
  satAmt: number;
  sunAmt: number;
  phAmt: number;
  nightAmt: number;
  meal: number;
  transport: number;
  site: number;
  tcmMeal: number;
  tcmTransport: number;
  arrears: number;
  totalEarnings: number;
  wht: number;
  netPay: number;
  bankName: string;
  accountNo: string;
  sortCode: string;
};

const buildDetailRows = async (
  records: PayrollCalculationRecord[],
  period: string,
  directoryEmployees: DleEmployeeDirectoryRow[],
) => {
  const dirMap = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of directoryEmployees) {
    [employee.employeeCode, employee.employeeId].map(upper).filter(Boolean).forEach((key) => dirMap.set(key, employee));
  }
  const attendance = period ? await loadDayrateAttendanceByEmpCode(period) : new Map();
  const dayrate = records.filter((record) => record.isDailyRate || upper(record.employmentType).includes('DAILY'));

  const enriched = dayrate.map((record) => {
    const dir = dirMap.get(upper(record.employeeCode)) || dirMap.get(upper(record.employeeId));
    const code = officialEmployeeCode(record);
    const names = splitName(record.fullName || dir?.fullName || '', dir?.firstName, dir?.lastName);
    const att = attendance.get(upper(code))
      || attendance.get(upper(record.employeeCode))
      || attendance.get(upper(record.fullName));
    const dailyRate = Number(record.ratePerDay || 0)
      || (att && att.weekDaysWorked > 0 ? roundMoney(Number(att.weekDayTotal || 0) / att.weekDaysWorked) : 0);
    const weekDays = Number(att?.weekDaysWorked ?? record.timesheetDaysWorked ?? 0);
    const weekdayOvtHrs = Number(att?.weekdayOvertimeHours ?? 0);
    const satHrs = Number(att?.saturdayHours ?? 0);
    const sunHrs = Number(att?.sundayHours ?? 0);
    const phHrs = Number(att?.publicHolidayHours ?? 0);
    const nightDays = Number(att?.nightWorkedDays ?? 0);
    const wkdEarning = lineAmount(record.earningLines, /JCWEEKDAY(?!_NT)/i) + lineAmount(record.earningLines, /JCWEEKDAY_NT/i)
      || Number(att?.weekDayTotal || 0)
      || roundMoney(weekDays * dailyRate);
    const wkdOvtAmt = lineAmount(record.earningLines, /WEEKDAYOVT/i)
      || Number(att?.weekdayOvertimeTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 1.5 * weekdayOvtHrs) : 0);
    const satAmt = lineAmount(record.earningLines, /SATEARN/i)
      || Number(att?.saturdayTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 1.5 * satHrs) : 0);
    const sunAmt = lineAmount(record.earningLines, /SUNDAYEARN/i)
      || Number(att?.sundayTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 2 * sunHrs) : 0);
    const phAmt = lineAmount(record.earningLines, /PUBHOL/i)
      || Number(att?.publicHolidayTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 2 * phHrs) : 0);
    const nightAmt = lineAmount(record.earningLines, /NIGHT/i)
      || Number(att?.nightWorkedTotal || 0)
      || roundMoney(1100 * nightDays);
    const meal = lineAmount(record.earningLines, /^MEAL$|MEAL ALLOW|PER_MEAL/i) || roundMoney(500 * weekDays);
    const transport = lineAmount(record.earningLines, /TRANSPORT ALLOW|EXP_TRANS|^TRANSPORT$/i);
    const site = lineAmount(record.earningLines, /SITE ALLOW/i) || Number(att?.siteAllowanceTotal || 0);
    const tcmMeal = lineAmount(record.earningLines, /TCMMEAL/i);
    const tcmTransport = lineAmount(record.earningLines, /TCM.?TRANS/i);
    const arrears = lineAmount(record.earningLines, /ARREARS/i);
    const totalEarnings = roundMoney(Number(record.grossPay || 0))
      || roundMoney(wkdEarning + wkdOvtAmt + satAmt + sunAmt + phAmt + nightAmt + meal + transport + site + tcmMeal + tcmTransport + arrears);
    const wht = roundMoney(Number(record.paye || 0)) || roundMoney(totalEarnings * 0.05);
    const netPay = roundMoney(Number(record.netPay || 0)) || roundMoney(totalEarnings - wht);
    return {
      code,
      firstName: names.firstName || att?.firstName || '',
      lastName: names.lastName || att?.lastName || '',
      jobTitle: compact(record.jobTitle || dir?.jobTitle || att?.jobTitle),
      location: compact(record.location || dir?.location || att?.location),
      dailyRate: roundMoney(dailyRate),
      age: '',
      gender: compact(dir?.gender).slice(0, 1).toUpperCase(),
      weekDays,
      weekdayOvtHrs,
      satHrs,
      sunHrs,
      phHrs,
      nightDays,
      wkdEarning: roundMoney(wkdEarning),
      wkdOvtAmt: roundMoney(wkdOvtAmt),
      satAmt: roundMoney(satAmt),
      sunAmt: roundMoney(sunAmt),
      phAmt: roundMoney(phAmt),
      nightAmt: roundMoney(nightAmt),
      meal: roundMoney(meal),
      transport: roundMoney(transport),
      site: roundMoney(site),
      tcmMeal: roundMoney(tcmMeal),
      tcmTransport: roundMoney(tcmTransport),
      arrears: roundMoney(arrears),
      totalEarnings,
      wht,
      netPay,
      bankName: compact(record.bankName || dir?.bankName),
      accountNo: compact(record.accountNo || dir?.accountNo),
      sortCode: compact(record.sortCode || record.branchCode || record.bankCode || dir?.bankCode),
    } satisfies DetailRow;
  });

  const withBucket = dayrate.map((record, index) => ({
    bucket: resolveOfficialCompanyBucket(record),
    row: enriched[index],
  }));
  return {
    dle: withBucket.filter((item) => item.bucket === 'DLE').map((item) => item.row),
    dlpc: withBucket.filter((item) => item.bucket === 'DLPC').map((item) => item.row),
  };
};

const clearSheetFromRow = (sheet: ExcelJS.Worksheet, startRow: number) => {
  if (sheet.rowCount < startRow) return;
  sheet.spliceRows(startRow, sheet.rowCount - startRow + 1);
};

const writeRow = (sheet: ExcelJS.Worksheet, rowNumber: number, values: Array<string | number | null | undefined>) => {
  const row = sheet.getRow(rowNumber);
  values.forEach((value, index) => {
    row.getCell(index + 1).value = value == null || value === '' ? null : value;
  });
  row.commit();
};

export const buildDayratePaymentScheduleXlsx = async (input: {
  period: string;
  periodLabel?: string;
  records: PayrollCalculationRecord[];
  directoryEmployees?: DleEmployeeDirectoryRow[];
}) => {
  const templatePath = resolveDayratePaymentScheduleTemplatePath();
  if (!templatePath) throw new Error('Dayrate Payment Schedule template was not found.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(readFileSync(templatePath));
  const { dle, dlpc } = await buildDetailRows(input.records, input.period, input.directoryEmployees || []);
  const title = scheduleTitleForSheet(input.period, input.periodLabel);

  const summary = workbook.getWorksheet('SUMMARY') || workbook.worksheets[0];
  const dleSheet = workbook.getWorksheet('DLE') || workbook.worksheets[1];
  const dlpcSheet = workbook.getWorksheet('DLPC') || workbook.worksheets[2];
  const dleBank = workbook.getWorksheet('DLE BANK SCHD') || workbook.worksheets[3];
  const dlpcBank = workbook.getWorksheet('DLPC.BANK.SCHD') || workbook.worksheets[4];

  if (summary) {
    summary.getCell('A1').value = title;
    clearSheetFromRow(summary, 4);
    writeRow(summary, 4, ['DLE', dle.length, roundMoney(dle.reduce((s, r) => s + r.totalEarnings, 0)), roundMoney(dle.reduce((s, r) => s + r.netPay, 0))]);
    writeRow(summary, 5, ['DLPC', dlpc.length, roundMoney(dlpc.reduce((s, r) => s + r.totalEarnings, 0)), roundMoney(dlpc.reduce((s, r) => s + r.netPay, 0))]);
    writeRow(summary, 6, [
      'Total',
      dle.length + dlpc.length,
      roundMoney([...dle, ...dlpc].reduce((s, r) => s + r.totalEarnings, 0)),
      roundMoney([...dle, ...dlpc].reduce((s, r) => s + r.netPay, 0)),
    ]);
  }

  if (dleSheet) {
    clearSheetFromRow(dleSheet, 2);
    dle.forEach((row, index) => {
      writeRow(dleSheet, index + 2, [
        row.code, row.firstName, row.lastName, row.jobTitle, row.location, row.dailyRate, row.age, row.gender,
        row.weekDays, row.weekdayOvtHrs, row.satHrs, row.sunHrs, row.nightDays,
        row.wkdEarning, row.wkdOvtAmt, row.satAmt, row.sunAmt, row.nightAmt,
        row.meal, row.transport || null, row.site || null, row.tcmMeal || null, row.tcmTransport || null, row.arrears || null,
        row.totalEarnings, row.wht, row.totalEarnings, row.netPay,
      ]);
    });
  }

  if (dlpcSheet) {
    clearSheetFromRow(dlpcSheet, 2);
    dlpc.forEach((row, index) => {
      writeRow(dlpcSheet, index + 2, [
        row.code, row.firstName, row.lastName, row.jobTitle, row.dailyRate, row.age, row.gender,
        row.weekDays, row.weekdayOvtHrs, row.satHrs, row.sunHrs, row.phHrs, row.nightDays,
        row.wkdEarning, row.wkdOvtAmt, row.satAmt, row.sunAmt, row.phAmt, row.nightAmt,
        row.meal, row.transport, row.totalEarnings, row.wht, row.totalEarnings, row.netPay,
      ]);
    });
  }

  if (dleBank) {
    clearSheetFromRow(dleBank, 3);
    dle.filter((row) => row.netPay !== 0 || row.accountNo).forEach((row, index) => {
      writeRow(dleBank, index + 3, [
        row.code,
        `${row.lastName} ${row.firstName}`.trim(),
        row.bankName,
        row.accountNo,
        row.sortCode,
        row.netPay,
      ]);
    });
  }

  if (dlpcBank) {
    clearSheetFromRow(dlpcBank, 3);
    dlpc.filter((row) => row.netPay !== 0 || row.accountNo).forEach((row, index) => {
      writeRow(dlpcBank, index + 3, [
        row.code,
        `${row.lastName} ${row.firstName}`.trim(),
        row.bankName,
        row.accountNo,
        row.sortCode,
        row.netPay,
        row.location,
      ]);
    });
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    fileName: dayratePaymentScheduleFileName(input.period, input.periodLabel),
    buffer,
    templatePath,
    counts: { dle: dle.length, dlpc: dlpc.length },
  };
};

export const dayrateScheduleXlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
