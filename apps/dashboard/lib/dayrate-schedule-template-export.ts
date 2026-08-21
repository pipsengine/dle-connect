/**
 * Fill the official Dayrate Payment Schedule .xlsx template for payroll export.
 * Uses Node zlib/ZIP only (no exceljs) so deploy:server -SkipInstall keeps working.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
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

const u16 = (buf: Buffer, offset: number) => buf.readUInt16LE(offset);
const u32 = (buf: Buffer, offset: number) => buf.readUInt32LE(offset);

const inflateEntry = (data: Buffer, compression: number, size: number) => {
  if (compression === 0) return data.subarray(0, size);
  if (compression === 8) return inflateRawSync(data);
  throw new Error(`Unsupported ZIP compression method ${compression}.`);
};

const readZipEntries = (buffer: Buffer) => {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = Math.max(0, buffer.length - 22 - 65535); i <= buffer.length - 22; i += 1) {
    if (u32(buffer, i) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new Error('Dayrate template is not a valid .xlsx workbook.');
  const cdOffset = u32(buffer, eocd + 16);
  const cdEntries = u16(buffer, eocd + 10);
  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i += 1) {
    if (u32(buffer, offset) !== 0x02014b50) break;
    const compression = u16(buffer, offset + 10);
    const compSize = u32(buffer, offset + 20);
    const uncompSize = u32(buffer, offset + 24);
    const nameLen = u16(buffer, offset + 28);
    const extraLen = u16(buffer, offset + 30);
    const commentLen = u16(buffer, offset + 32);
    const localOffset = u32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    const localNameLen = u16(buffer, localOffset + 26);
    const localExtraLen = u16(buffer, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    out.set(name.replace(/\\/g, '/'), inflateEntry(buffer.subarray(dataStart, dataStart + compSize), compression, uncompSize));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
};

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf: Buffer) => {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const writeZipStore = (files: Map<string, Buffer>) => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files.entries()) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(content);
    const useStore = compressed.length >= content.length;
    const payload = useStore ? content : compressed;
    const method = useStore ? 0 : 8;
    const checksum = crc32(content);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    locals.push(local, payload);
    centrals.push(central);
    offset += local.length + payload.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, end]);
};

const officialEmployeeCode = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId'>) => {
  const code = compact(record.employeeCode || record.employeeId).toUpperCase();
  const match = code.match(/\b(C\d{3,})\b/);
  return match?.[1] || code;
};

const escapeXml = (value: unknown) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colLetter = (index: number) => {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const cellXml = (ref: string, value: string | number | null | undefined) => {
  if (value == null || value === '') return `<c r="${ref}"/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
};

const rowXml = (rowNumber: number, values: Array<string | number | null | undefined>) => {
  const cells = values.map((value, index) => cellXml(`${colLetter(index + 1)}${rowNumber}`, value)).join('');
  return `<row r="${rowNumber}">${cells}</row>`;
};

const replaceSheetData = (sheetXml: string, sheetDataInner: string, dimension: string) => {
  let next = sheetXml.replace(/<dimension\b[^>]*\/>/i, `<dimension ref="${dimension}"/>`);
  if (/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/i.test(next)) {
    next = next.replace(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/i, `<sheetData>${sheetDataInner}</sheetData>`);
  } else {
    next = next.replace(/<sheetData\b[^>]*\/>/i, `<sheetData>${sheetDataInner}</sheetData>`);
  }
  return next;
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

const DLE_HEADERS = [
  'Emp. Code', 'First Name', 'Last Name', 'Job Title', 'Location', 'Daily Rate', 'AGE', 'Gender',
  'Total Weekday', 'Weekday OVT', 'Total Saturday', 'Total Sunday', 'Night Worked',
  'Wkd Earning', 'Wkd Ovt Amt', 'Sat Ovt Amt', 'Sun Ovt Amt', 'Night Amt',
  'Meal Allowance', 'Transport', 'Site Allowance', 'TCM Meal', 'TCM TRANSPORT', 'Arrears',
  'Total Earnings', 'WHT', 'Gross Salary', 'Net Pay',
];

const DLPC_HEADERS = [
  'Emp. Code', 'First Name', 'Last Name', 'Job Title', 'Daily Rate', 'Age', 'Gender',
  'Total Weekday', 'Weekday OVT', 'Total Saturday', 'Total Sunday', 'Public Holiday', 'Night Worked',
  'Wkd Earning', 'Wkd Ovt Amt', 'Sat Ovt Amt', 'Sun Ovt Amt', 'PH Amt', 'Night Amt',
  'Meal Allowance', 'Transport', 'Total Earnings', 'WHT', 'Gross Salary', 'Net Pay',
];

export const buildDayratePaymentScheduleXlsx = async (input: {
  period: string;
  periodLabel?: string;
  records: PayrollCalculationRecord[];
  directoryEmployees?: DleEmployeeDirectoryRow[];
}) => {
  const templatePath = resolveDayratePaymentScheduleTemplatePath();
  if (!templatePath) throw new Error('Dayrate Payment Schedule template was not found.');
  const entries = readZipEntries(readFileSync(templatePath));
  const { dle, dlpc } = await buildDetailRows(input.records, input.period, input.directoryEmployees || []);
  const title = scheduleTitleForSheet(input.period, input.periodLabel);

  const summaryInner = [
    rowXml(1, [title]),
    rowXml(3, ['COMPANY', 'HEADCOUNT', 'GROSS PAY', 'NET PAY']),
    rowXml(4, ['DLE', dle.length, roundMoney(dle.reduce((s, r) => s + r.totalEarnings, 0)), roundMoney(dle.reduce((s, r) => s + r.netPay, 0))]),
    rowXml(5, ['DLPC', dlpc.length, roundMoney(dlpc.reduce((s, r) => s + r.totalEarnings, 0)), roundMoney(dlpc.reduce((s, r) => s + r.netPay, 0))]),
    rowXml(6, [
      'Total',
      dle.length + dlpc.length,
      roundMoney([...dle, ...dlpc].reduce((s, r) => s + r.totalEarnings, 0)),
      roundMoney([...dle, ...dlpc].reduce((s, r) => s + r.netPay, 0)),
    ]),
  ].join('');

  const dleInner = [
    rowXml(1, DLE_HEADERS),
    ...dle.map((row, index) => rowXml(index + 2, [
      row.code, row.firstName, row.lastName, row.jobTitle, row.location, row.dailyRate, row.age, row.gender,
      row.weekDays, row.weekdayOvtHrs, row.satHrs, row.sunHrs, row.nightDays,
      row.wkdEarning, row.wkdOvtAmt, row.satAmt, row.sunAmt, row.nightAmt,
      row.meal, row.transport || '', row.site || '', row.tcmMeal || '', row.tcmTransport || '', row.arrears || '',
      row.totalEarnings, row.wht, row.totalEarnings, row.netPay,
    ])),
  ].join('');

  const dlpcInner = [
    rowXml(1, DLPC_HEADERS),
    ...dlpc.map((row, index) => rowXml(index + 2, [
      row.code, row.firstName, row.lastName, row.jobTitle, row.dailyRate, row.age, row.gender,
      row.weekDays, row.weekdayOvtHrs, row.satHrs, row.sunHrs, row.phHrs, row.nightDays,
      row.wkdEarning, row.wkdOvtAmt, row.satAmt, row.sunAmt, row.phAmt, row.nightAmt,
      row.meal, row.transport, row.totalEarnings, row.wht, row.totalEarnings, row.netPay,
    ])),
  ].join('');

  const dleBankInner = [
    rowXml(1, ['Employee Bank Details']),
    rowXml(2, ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary']),
    ...dle.filter((row) => row.netPay !== 0 || row.accountNo).map((row, index) => rowXml(index + 3, [
      row.code, `${row.lastName} ${row.firstName}`.trim(), row.bankName, row.accountNo, row.sortCode, row.netPay,
    ])),
  ].join('');

  const dlpcBankInner = [
    rowXml(1, ['Employee Bank Details']),
    rowXml(2, ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location']),
    ...dlpc.filter((row) => row.netPay !== 0 || row.accountNo).map((row, index) => rowXml(index + 3, [
      row.code, `${row.lastName} ${row.firstName}`.trim(), row.bankName, row.accountNo, row.sortCode, row.netPay, row.location,
    ])),
  ].join('');

  const sheetMap = [
    { path: 'xl/worksheets/sheet1.xml', inner: summaryInner, dimension: 'A1:D6' },
    { path: 'xl/worksheets/sheet2.xml', inner: dleInner, dimension: `A1:AB${Math.max(2, dle.length + 1)}` },
    { path: 'xl/worksheets/sheet3.xml', inner: dlpcInner, dimension: `A1:Y${Math.max(2, dlpc.length + 1)}` },
    { path: 'xl/worksheets/sheet4.xml', inner: dleBankInner, dimension: `A1:F${Math.max(3, dle.length + 2)}` },
    { path: 'xl/worksheets/sheet5.xml', inner: dlpcBankInner, dimension: `A1:G${Math.max(3, dlpc.length + 2)}` },
  ];

  for (const sheet of sheetMap) {
    const current = entries.get(sheet.path);
    if (!current) continue;
    entries.set(sheet.path, Buffer.from(replaceSheetData(current.toString('utf8'), sheet.inner, sheet.dimension), 'utf8'));
  }

  // Drop cached formula chain so Excel recalculates cleanly after data rewrite.
  entries.delete('xl/calcChain.xml');

  return {
    fileName: dayratePaymentScheduleFileName(input.period, input.periodLabel),
    buffer: writeZipStore(entries),
    templatePath,
    counts: { dle: dle.length, dlpc: dlpc.length },
  };
};

export const dayrateScheduleXlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
