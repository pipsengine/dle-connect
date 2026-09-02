/**
 * Fill the official Dayrate Payment Schedule .xlsx template for payroll export.
 * Uses Node zlib/ZIP only (no exceljs) so deploy:server -SkipInstall keeps working.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { buildDayrateExportRoster, type DayrateExportRosterEntry } from '@/lib/dayrate-export-roster';
import { canonicalContractEmployeeCode } from '@/lib/dayrate-schedule-xlsx';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { loadDayrateAttendanceByEmpCode } from '@/lib/payroll-official-excel-export';
import type { PayrollCompany } from '@/lib/payroll-schedule-scope';

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

export const dayratePaymentScheduleFileName = (period: string, periodLabel?: string, company?: PayrollCompany | null) => {
  const token = compact(period).replace(/^per-/i, '');
  const companyToken = company ? ` ${company}` : '';
  const match = /^(\d{4})-(\d{2})$/.exec(token);
  if (match) {
    const year = match[1];
    const month = MONTH_NAMES[Number(match[2]) - 1] || 'MONTH';
    return `${month} ${year}${companyToken} DAYRATE PAYMENT SCHEDULE.xlsx`;
  }
  const fromLabel = compact(periodLabel).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (fromLabel) {
    const parts = fromLabel.split(/\s+/);
    const month = MONTH_NAMES.find((name) => parts.includes(name));
    const year = parts.find((part) => /^\d{4}$/.test(part));
    if (month && year) return `${month} ${year}${companyToken} DAYRATE PAYMENT SCHEDULE.xlsx`;
  }
  return `${company ? `${company} ` : ''}DAYRATE PAYMENT SCHEDULE.xlsx`;
};

const applyDayrateContractorHeadings = (xml: string) => xml
  .replaceAll('Gross Salary', 'Gross Amount')
  .replaceAll('Net Pay', 'Amount Payable')
  .replaceAll('Emp. Code', 'Contractor Code')
  .replaceAll('Employee Code', 'Contractor Code')
  .replaceAll('Employee Name', 'Contractor Name');

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

const cellXml = (ref: string, value: string | number | null | undefined, style?: string) => {
  const styleAttr = style ? ` s="${style}"` : '';
  if (value == null || value === '') return `<c r="${ref}"${styleAttr}/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
};

const cellXmlFormula = (ref: string, formula: string, value?: number, style?: string) => {
  const styleAttr = style ? ` s="${style}"` : '';
  const valXml = value !== undefined && Number.isFinite(value) ? `<v>${value}</v>` : '';
  return `<c r="${ref}"${styleAttr}><f>${escapeXml(formula)}</f>${valXml}</c>`;
};

const MONEY_STYLE = '1';

const extractSheetRow = (sheetXml: string, rowNumber: number) => {
  const match = sheetXml.match(new RegExp(`<row r="${rowNumber}"[\\s\\S]*?</row>`, 'i'));
  return match?.[0] || '';
};

const patchTableXml = (tableXml: string, ref: string, autoFilterRef: string) =>
  tableXml
    .replace(/(<table\b[^>]*\bref=")[^"]+(")/, `$1${ref}$2`)
    .replace(/(<autoFilter ref=")[^"]+(")/, `$1${autoFilterRef}$2`);

const sumDetailRows = (rows: DetailRow[]) => ({
  count: rows.length,
  dailyRate: roundMoney(rows.reduce((s, r) => s + r.dailyRate, 0)),
  weekDays: roundMoney(rows.reduce((s, r) => s + r.weekDays, 0)),
  weekdayOvtHrs: roundMoney(rows.reduce((s, r) => s + r.weekdayOvtHrs, 0)),
  satHrs: roundMoney(rows.reduce((s, r) => s + r.satHrs, 0)),
  sunHrs: roundMoney(rows.reduce((s, r) => s + r.sunHrs, 0)),
  phHrs: roundMoney(rows.reduce((s, r) => s + r.phHrs, 0)),
  nightDays: roundMoney(rows.reduce((s, r) => s + r.nightDays, 0)),
  wkdEarning: roundMoney(rows.reduce((s, r) => s + r.wkdEarning, 0)),
  wkdOvtAmt: roundMoney(rows.reduce((s, r) => s + r.wkdOvtAmt, 0)),
  satAmt: roundMoney(rows.reduce((s, r) => s + r.satAmt, 0)),
  sunAmt: roundMoney(rows.reduce((s, r) => s + r.sunAmt, 0)),
  phAmt: roundMoney(rows.reduce((s, r) => s + r.phAmt, 0)),
  nightAmt: roundMoney(rows.reduce((s, r) => s + r.nightAmt, 0)),
  meal: roundMoney(rows.reduce((s, r) => s + r.meal, 0)),
  transport: roundMoney(rows.reduce((s, r) => s + r.transport, 0)),
  site: roundMoney(rows.reduce((s, r) => s + r.site, 0)),
  tcmMeal: roundMoney(rows.reduce((s, r) => s + r.tcmMeal, 0)),
  tcmTransport: roundMoney(rows.reduce((s, r) => s + r.tcmTransport, 0)),
  arrears: roundMoney(rows.reduce((s, r) => s + r.arrears, 0)),
  totalEarnings: roundMoney(rows.reduce((s, r) => s + r.totalEarnings, 0)),
  wht: roundMoney(rows.reduce((s, r) => s + r.wht, 0)),
  netPay: roundMoney(rows.reduce((s, r) => s + r.netPay, 0)),
});

const buildDleDataRow = (rowNum: number, row: DetailRow) =>
  `<row r="${rowNum}" spans="1:28" x14ac:dyDescent="0.25">${
    [
      cellXml(`A${rowNum}`, row.code),
      cellXml(`B${rowNum}`, row.firstName),
      cellXml(`C${rowNum}`, row.lastName),
      cellXml(`D${rowNum}`, row.jobTitle),
      cellXml(`E${rowNum}`, row.location),
      cellXml(`F${rowNum}`, row.dailyRate || null, row.dailyRate ? MONEY_STYLE : undefined),
      cellXml(`G${rowNum}`, row.age || null),
      cellXml(`H${rowNum}`, row.gender || null),
      cellXml(`I${rowNum}`, row.weekDays || null),
      cellXml(`J${rowNum}`, row.weekdayOvtHrs || null),
      cellXml(`K${rowNum}`, row.satHrs || null),
      cellXml(`L${rowNum}`, row.sunHrs || null),
      cellXml(`M${rowNum}`, row.nightDays || null),
      cellXml(`N${rowNum}`, row.wkdEarning || null, row.wkdEarning ? MONEY_STYLE : undefined),
      cellXml(`O${rowNum}`, row.wkdOvtAmt || null, row.wkdOvtAmt ? MONEY_STYLE : undefined),
      cellXml(`P${rowNum}`, row.satAmt || null, row.satAmt ? MONEY_STYLE : undefined),
      cellXml(`Q${rowNum}`, row.sunAmt || null, row.sunAmt ? MONEY_STYLE : undefined),
      cellXml(`R${rowNum}`, row.nightAmt || null, row.nightAmt ? MONEY_STYLE : undefined),
      cellXml(`S${rowNum}`, row.meal || null, row.meal ? MONEY_STYLE : undefined),
      cellXml(`T${rowNum}`, row.transport || null, row.transport ? MONEY_STYLE : undefined),
      cellXml(`U${rowNum}`, row.site || null, row.site ? MONEY_STYLE : undefined),
      cellXml(`V${rowNum}`, row.tcmMeal || null, row.tcmMeal ? MONEY_STYLE : undefined),
      cellXml(`W${rowNum}`, row.tcmTransport || null, row.tcmTransport ? MONEY_STYLE : undefined),
      cellXml(`X${rowNum}`, row.arrears || null, row.arrears ? MONEY_STYLE : undefined),
      cellXml(`Y${rowNum}`, row.totalEarnings || null, row.totalEarnings ? MONEY_STYLE : undefined),
      cellXml(`Z${rowNum}`, row.wht || null, row.wht ? MONEY_STYLE : undefined),
      cellXml(`AA${rowNum}`, row.totalEarnings || null, row.totalEarnings ? MONEY_STYLE : undefined),
      cellXml(`AB${rowNum}`, row.netPay || null, row.netPay ? MONEY_STYLE : undefined),
    ].join('')
  }</row>`;

const buildDleTotalsRow = (rowNum: number, totals: ReturnType<typeof sumDetailRows>) => {
  const table = 'Table4';
  const f = (col: string, formula: string, value: number, style?: string) =>
    cellXmlFormula(`${col}${rowNum}`, formula, value, style);
  return `<row r="${rowNum}" spans="1:28" x14ac:dyDescent="0.25">${
    f('A', `SUBTOTAL(103,${table}[Contractor Code])`, totals.count)
    + f('I', `SUBTOTAL(109,${table}[Total Weekday])`, totals.weekDays)
    + f('J', `SUBTOTAL(109,${table}[Weekday OVT])`, totals.weekdayOvtHrs)
    + f('K', `SUBTOTAL(109,${table}[Total Saturday])`, totals.satHrs)
    + f('L', `SUBTOTAL(109,${table}[Total Sunday])`, totals.sunHrs)
    + f('M', `SUBTOTAL(109,${table}[Night Worked])`, totals.nightDays)
    + f('N', `SUBTOTAL(109,${table}[Wkd Earning])`, totals.wkdEarning, MONEY_STYLE)
    + f('O', `SUBTOTAL(109,${table}[Wkd Ovt Amt])`, totals.wkdOvtAmt, MONEY_STYLE)
    + f('P', `SUBTOTAL(109,${table}[Sat Ovt Amt])`, totals.satAmt, MONEY_STYLE)
    + f('Q', `SUBTOTAL(109,${table}[Sun Ovt Amt])`, totals.sunAmt, MONEY_STYLE)
    + f('R', `SUBTOTAL(109,${table}[Night Amt])`, totals.nightAmt, MONEY_STYLE)
    + f('S', `SUBTOTAL(109,${table}[Meal Allowance])`, totals.meal, MONEY_STYLE)
    + f('T', `SUBTOTAL(109,${table}[Transport])`, totals.transport, MONEY_STYLE)
    + f('U', `SUBTOTAL(109,${table}[Site Allowance])`, totals.site, MONEY_STYLE)
    + f('V', `SUBTOTAL(109,${table}[TCM Meal])`, totals.tcmMeal, MONEY_STYLE)
    + f('W', `SUBTOTAL(109,${table}[TCM TRANSPORT])`, totals.tcmTransport, MONEY_STYLE)
    + `<c r="X${rowNum}" s="${MONEY_STYLE}"/>`
    + f('Y', `SUBTOTAL(109,${table}[Total Earnings])`, totals.totalEarnings, MONEY_STYLE)
    + f('Z', `SUBTOTAL(109,${table}[WHT])`, totals.wht, MONEY_STYLE)
    + f('AA', `SUBTOTAL(109,${table}[Gross Amount])`, totals.totalEarnings, MONEY_STYLE)
    + f('AB', `SUBTOTAL(109,${table}[Amount Payable])`, totals.netPay, MONEY_STYLE)
  }</row>`;
};

const buildDlpcDataRow = (rowNum: number, row: DetailRow) =>
  `<row r="${rowNum}" spans="1:25" x14ac:dyDescent="0.25">${
    [
      cellXml(`A${rowNum}`, row.code),
      cellXml(`B${rowNum}`, row.firstName),
      cellXml(`C${rowNum}`, row.lastName),
      cellXml(`D${rowNum}`, row.jobTitle),
      cellXml(`E${rowNum}`, row.dailyRate || null, row.dailyRate ? MONEY_STYLE : undefined),
      cellXml(`F${rowNum}`, row.age || null),
      cellXml(`G${rowNum}`, row.gender || null),
      cellXml(`H${rowNum}`, row.weekDays || null),
      cellXml(`I${rowNum}`, row.weekdayOvtHrs || null),
      cellXml(`J${rowNum}`, row.satHrs || null),
      cellXml(`K${rowNum}`, row.sunHrs || null),
      cellXml(`L${rowNum}`, row.phHrs || null),
      cellXml(`M${rowNum}`, row.nightDays || null),
      cellXml(`N${rowNum}`, row.wkdEarning || null, row.wkdEarning ? MONEY_STYLE : undefined),
      cellXml(`O${rowNum}`, row.wkdOvtAmt || null, row.wkdOvtAmt ? MONEY_STYLE : undefined),
      cellXml(`P${rowNum}`, row.satAmt || null, row.satAmt ? MONEY_STYLE : undefined),
      cellXml(`Q${rowNum}`, row.sunAmt || null, row.sunAmt ? MONEY_STYLE : undefined),
      cellXml(`R${rowNum}`, row.phAmt || null, row.phAmt ? MONEY_STYLE : undefined),
      cellXml(`S${rowNum}`, row.nightAmt || null, row.nightAmt ? MONEY_STYLE : undefined),
      cellXml(`T${rowNum}`, row.meal || null, row.meal ? MONEY_STYLE : undefined),
      cellXml(`U${rowNum}`, row.transport || null, row.transport ? MONEY_STYLE : undefined),
      cellXml(`V${rowNum}`, row.totalEarnings || null, row.totalEarnings ? MONEY_STYLE : undefined),
      cellXml(`W${rowNum}`, row.wht || null, row.wht ? MONEY_STYLE : undefined),
      cellXml(`X${rowNum}`, row.totalEarnings || null, row.totalEarnings ? MONEY_STYLE : undefined),
      cellXml(`Y${rowNum}`, row.netPay || null, row.netPay ? MONEY_STYLE : undefined),
    ].join('')
  }</row>`;

const buildDlpcTotalsRow = (rowNum: number, totals: ReturnType<typeof sumDetailRows>) => {
  const table = 'Table52';
  const f = (col: string, formula: string, value: number, style?: string) =>
    cellXmlFormula(`${col}${rowNum}`, formula, value, style);
  return `<row r="${rowNum}" spans="1:25" x14ac:dyDescent="0.25">${
    f('A', `SUBTOTAL(103,${table}[Contractor Code])`, totals.count)
    + f('E', `SUBTOTAL(109,${table}[Daily Rate])`, totals.dailyRate, MONEY_STYLE)
    + f('H', `SUBTOTAL(109,${table}[Total Weekday])`, totals.weekDays)
    + f('I', `SUBTOTAL(109,${table}[Weekday OVT])`, totals.weekdayOvtHrs)
    + f('J', `SUBTOTAL(109,${table}[Total Saturday])`, totals.satHrs)
    + f('N', `SUBTOTAL(109,${table}[Wkd Earning])`, totals.wkdEarning, MONEY_STYLE)
    + f('O', `SUBTOTAL(109,${table}[Wkd Ovt Amt])`, totals.wkdOvtAmt, MONEY_STYLE)
    + f('P', `SUBTOTAL(109,${table}[Sat Ovt Amt])`, totals.satAmt, MONEY_STYLE)
    + f('Q', `SUBTOTAL(109,${table}[Sun Ovt Amt])`, totals.sunAmt, MONEY_STYLE)
    + f('R', `SUBTOTAL(109,${table}[PH Amt])`, totals.phAmt, MONEY_STYLE)
    + f('S', `SUBTOTAL(109,${table}[Night Amt])`, totals.nightAmt, MONEY_STYLE)
    + f('T', `SUBTOTAL(109,${table}[Meal Allowance])`, totals.meal, MONEY_STYLE)
    + f('U', `SUBTOTAL(109,${table}[Transport])`, totals.transport, MONEY_STYLE)
    + f('V', `SUBTOTAL(109,${table}[Total Earnings])`, totals.totalEarnings, MONEY_STYLE)
    + f('W', `SUBTOTAL(109,${table}[WHT])`, totals.wht, MONEY_STYLE)
    + f('X', `SUBTOTAL(109,${table}[Gross Amount])`, totals.totalEarnings, MONEY_STYLE)
    + f('Y', `SUBTOTAL(109,${table}[Amount Payable])`, totals.netPay, MONEY_STYLE)
  }</row>`;
};

const buildDleBankDataRow = (rowNum: number, row: DetailRow) =>
  `<row r="${rowNum}" spans="1:6" ht="13.5" customHeight="1" x14ac:dyDescent="0.25">${
    cellXml(`A${rowNum}`, row.code, '15')
    + cellXml(`B${rowNum}`, `${row.lastName} ${row.firstName}`.trim(), '15')
    + cellXml(`C${rowNum}`, row.bankName, '15')
    + cellXml(`D${rowNum}`, row.accountNo, '15')
    + cellXml(`E${rowNum}`, row.sortCode, '15')
    + cellXmlFormula(
      `F${rowNum}`,
      '_xlfn.XLOOKUP(Table13[[#This Row],[Contractor Code]],DLE!A:A,DLE!AB:AB)',
      row.netPay,
      '16',
    )
  }</row>`;

const buildDlpcBankDataRow = (rowNum: number, row: DetailRow) =>
  `<row r="${rowNum}" spans="1:7" ht="12.75" customHeight="1" x14ac:dyDescent="0.25">${
    cellXml(`A${rowNum}`, row.code, '4')
    + cellXml(`B${rowNum}`, `${row.lastName} ${row.firstName}`.trim(), '4')
    + cellXml(`C${rowNum}`, row.bankName, '4')
    + cellXml(`D${rowNum}`, row.accountNo, '4')
    + cellXml(`E${rowNum}`, row.sortCode, '4')
    + cellXmlFormula(
      `F${rowNum}`,
      '_xlfn.XLOOKUP(Table146[[#This Row],[Contractor Code]],Table52[Contractor Code],Table52[Amount Payable])',
      row.netPay,
      '5',
    )
    + cellXml(`G${rowNum}`, row.location, '4')
  }</row>`;

const buildBankTotalsRow = (
  rowNum: number,
  tableName: string,
  totals: { count: number; netPay: number },
  netStyle = '5',
) =>
  `<row r="${rowNum}" spans="1:7" ht="15.6" customHeight="1" x14ac:dyDescent="0.25">${
    cellXmlFormula(`A${rowNum}`, `SUBTOTAL(103,${tableName}[Contractor Code])`, totals.count, '6')
    + `<c r="B${rowNum}" s="6"/><c r="C${rowNum}" s="6"/><c r="D${rowNum}" s="6"/><c r="E${rowNum}" s="6"/>`
    + cellXmlFormula(`F${rowNum}`, `SUBTOTAL(109,${tableName}[NET Salary])`, totals.netPay, netStyle)
  }</row>`;

const fillDetailTableSheet = (
  templateSheetXml: string,
  rows: DetailRow[],
  lastCol: string,
  buildDataRow: (rowNum: number, row: DetailRow) => string,
  buildTotalsRow: (rowNum: number, totals: ReturnType<typeof sumDetailRows>) => string,
) => {
  const headerRow = extractSheetRow(templateSheetXml, 1);
  const dataStart = 2;
  const totals = sumDetailRows(rows);
  const dataInner = rows.map((row, index) => buildDataRow(dataStart + index, row)).join('');
  const totalRowNum = Math.max(dataStart, dataStart + rows.length);
  const totalsRow = buildTotalsRow(totalRowNum, totals);
  const inner = `${headerRow}${dataInner}${totalsRow}`;
  const dimension = `A1:${lastCol}${totalRowNum}`;
  return { sheetXml: replaceSheetData(templateSheetXml, inner, dimension), totalRowNum, totals };
};

const fillBankTableSheet = (
  templateSheetXml: string,
  rows: DetailRow[],
  tableName: string,
  buildDataRow: (rowNum: number, row: DetailRow) => string,
  lastCol: string,
) => {
  const preserved = [1, 2].map((rowNum) => extractSheetRow(templateSheetXml, rowNum)).join('');
  const dataStart = 3;
  const netTotal = roundMoney(rows.reduce((sum, row) => sum + row.netPay, 0));
  const dataInner = rows.map((row, index) => buildDataRow(dataStart + index, row)).join('');
  const totalRowNum = Math.max(dataStart, dataStart + rows.length);
  const totalsRow = buildBankTotalsRow(totalRowNum, tableName, { count: rows.length, netPay: netTotal });
  const inner = `${preserved}${dataInner}${totalsRow}`;
  const dimension = `A1:${lastCol}${totalRowNum}`;
  return { sheetXml: replaceSheetData(templateSheetXml, inner, dimension), totalRowNum, netTotal };
};

const fillSummarySheet = (templateSheetXml: string, title: string, dle: DetailRow[], dlpc: DetailRow[]) => {
  const titleRow = `<row r="1" spans="1:4" x14ac:dyDescent="0.25"><c r="A1" s="18" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c></row>`;
  const headerRow = extractSheetRow(templateSheetXml, 2)
    || `<row r="2" spans="1:4">${cellXml('A2', 'COMPANY')}${cellXml('B2', 'HEADCOUNT')}${cellXml('C2', 'GROSS AMOUNT')}${cellXml('D2', 'AMOUNT PAYABLE')}</row>`;
  const dleGross = roundMoney(dle.reduce((sum, row) => sum + row.totalEarnings, 0));
  const dleNet = roundMoney(dle.reduce((sum, row) => sum + row.netPay, 0));
  const dlpcGross = roundMoney(dlpc.reduce((sum, row) => sum + row.totalEarnings, 0));
  const dlpcNet = roundMoney(dlpc.reduce((sum, row) => sum + row.netPay, 0));
  const line = (rowNum: number, label: string, count: number, gross: number, net: number) =>
    `<row r="${rowNum}" spans="1:4">${
      cellXml(`A${rowNum}`, label)
      + cellXml(`B${rowNum}`, count)
      + cellXml(`C${rowNum}`, gross, MONEY_STYLE)
      + cellXml(`D${rowNum}`, net, MONEY_STYLE)
    }</row>`;
  const companyLines = [
    ...(dle.length ? [{ label: 'DLE', count: dle.length, gross: dleGross, net: dleNet }] : []),
    ...(dlpc.length ? [{ label: 'DLPC', count: dlpc.length, gross: dlpcGross, net: dlpcNet }] : []),
  ];
  const bodyLines = [
    ...companyLines,
    ...(companyLines.length
      ? [{
          label: 'Total',
          count: dle.length + dlpc.length,
          gross: roundMoney(dleGross + dlpcGross),
          net: roundMoney(dleNet + dlpcNet),
        }]
      : []),
  ];
  const body = bodyLines.map((item, index) => line(3 + index, item.label, item.count, item.gross, item.net)).join('');
  const lastRow = 2 + bodyLines.length;
  return replaceSheetData(templateSheetXml, `${titleRow}${headerRow}${body}`, `A1:D${Math.max(2, lastRow)}`);
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

/**
 * Rates the HR schedule itself applies, confirmed against the signed August 2026 workbook:
 * weekday pay is days x daily rate, overtime is hours x hourly rate x multiplier, and
 * meal and night pay are flat per-day amounts.
 */
const HOURS_PER_DAY = 8;
const WEEKDAY_OVT_MULTIPLIER = 1.5;
const SATURDAY_MULTIPLIER = 1.5;
const SUNDAY_MULTIPLIER = 2;
const PUBLIC_HOLIDAY_MULTIPLIER = 2;
const MEAL_PER_WEEKDAY = 500;
const NIGHT_PER_NIGHT_DAY = 2500;
const WHT_RATE = 0.05;

/** Treats an absent value as missing but keeps a deliberate zero from HR. */
const scheduleAmount = (value: number | null | undefined) =>
  (value === null || value === undefined ? null : roundMoney(Number(value) || 0));

const firstAmount = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const amount = roundMoney(Number(value) || 0);
    if (amount !== 0) return amount;
  }
  return 0;
};

const ageFromDateOfBirth = (dateOfBirth: unknown, asOf: Date) => {
  const raw = compact(dateOfBirth).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const dob = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) return '';
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    asOf.getUTCMonth() < dob.getUTCMonth()
    || (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age > 0 && age < 120 ? age : '';
};

/** End of the payroll period, so ages match the month the schedule covers. */
const periodAsOfDate = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(compact(period).replace(/^per-/i, ''));
  if (!match) return new Date();
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0));
};

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
  scheduleDriven: boolean;
};

const EARNING_COMPONENTS: Array<keyof DetailRow> = [
  'wkdEarning', 'wkdOvtAmt', 'satAmt', 'sunAmt', 'phAmt', 'nightAmt',
  'meal', 'transport', 'site', 'tcmMeal', 'tcmTransport', 'arrears',
];

/**
 * Every printed row must equal the sum of its own printed components, otherwise the
 * bank schedule pays an amount the sheet cannot explain.
 */
const assertRowsFoot = (sheet: string, rows: DetailRow[]) => {
  const broken = rows
    .filter((row) => row.scheduleDriven)
    .map((row) => {
      const components = roundMoney(EARNING_COMPONENTS.reduce((sum, key) => sum + Number(row[key] || 0), 0));
      return { code: row.code, components, total: row.totalEarnings, gap: roundMoney(row.totalEarnings - components) };
    })
    .filter((row) => Math.abs(row.gap) > 0.02);
  if (!broken.length) return;
  const detail = broken.slice(0, 5).map((row) => `${row.code} (components ${row.components}, total ${row.total})`).join('; ');
  throw new Error(
    `Dayrate schedule ${sheet}: ${broken.length} row(s) do not reconcile against their own earning columns — ${detail}.`,
  );
};

const detailRowFromEntry = (
  entry: DayrateExportRosterEntry,
  dirMap: Map<string, DleEmployeeDirectoryRow>,
  attendance: Awaited<ReturnType<typeof loadDayrateAttendanceByEmpCode>>,
  asOf: Date,
): DetailRow => {
  const schedule = entry.scheduleRow;
  const record = entry.record;
  const dir = record
    ? (dirMap.get(upper(record.employeeCode)) || dirMap.get(upper(record.employeeId)))
    : (dirMap.get(upper(schedule?.employeeCode)) || dirMap.get(upper(schedule?.employeeName)));
  const code = schedule
    ? upper(canonicalContractEmployeeCode(schedule.employeeCode) || schedule.employeeCode)
    : officialEmployeeCode(record || { employeeCode: '', employeeId: '' });
  const names = schedule
    ? { firstName: compact(schedule.firstName), lastName: compact(schedule.lastName) }
    : splitName(record?.fullName || dir?.fullName || '', dir?.firstName, dir?.lastName);
  const att = attendance.get(upper(code))
    || (record ? attendance.get(upper(record.employeeCode)) || attendance.get(upper(record.fullName)) : undefined);
  const dailyRate = roundMoney(
    Number(schedule?.excelDailyRate || 0)
      || Number(record?.ratePerDay || 0)
      || (att && att.weekDaysWorked > 0 ? roundMoney(Number(att.weekDayTotal || 0) / att.weekDaysWorked) : 0),
  );
  const weekDays = Number(schedule?.weekdayDays ?? att?.weekDaysWorked ?? record?.timesheetDaysWorked ?? 0);
  const weekdayOvtHrs = Number(schedule?.weekdayOvtHours ?? att?.weekdayOvertimeHours ?? 0);
  const satHrs = Number(schedule?.saturdayHours ?? att?.saturdayHours ?? 0);
  const sunHrs = Number(schedule?.sundayHours ?? att?.sundayHours ?? 0);
  const phHrs = Number(schedule?.publicHolidayHours ?? att?.publicHolidayHours ?? 0);
  const nightDays = Number(schedule?.nightDays ?? att?.nightWorkedDays ?? 0);
  // With an HR schedule row the sheet must reproduce HR's own arithmetic: the printed
  // hours and the printed amounts have to describe each other, and the row has to foot.
  // Payroll earning lines are only consulted for employees the schedule does not cover.
  const hourlyRate = dailyRate / HOURS_PER_DAY;
  const wkdEarning = schedule
    ? roundMoney(weekDays * dailyRate)
    : firstAmount(
      lineAmount(record?.earningLines, /JCWEEKDAY(?!_NT)/i) + lineAmount(record?.earningLines, /JCWEEKDAY_NT/i),
      att?.weekDayTotal,
      dailyRate > 0 && weekDays > 0 ? weekDays * dailyRate : 0,
    );
  const wkdOvtAmt = schedule
    ? roundMoney(hourlyRate * WEEKDAY_OVT_MULTIPLIER * weekdayOvtHrs)
    : firstAmount(
      lineAmount(record?.earningLines, /WEEKDAYOVT/i),
      att?.weekdayOvertimeTotal,
      hourlyRate * WEEKDAY_OVT_MULTIPLIER * weekdayOvtHrs,
    );
  const satAmt = schedule
    ? roundMoney(hourlyRate * SATURDAY_MULTIPLIER * satHrs)
    : firstAmount(
      lineAmount(record?.earningLines, /SATEARN/i),
      att?.saturdayTotal,
      hourlyRate * SATURDAY_MULTIPLIER * satHrs,
    );
  const sunAmt = schedule
    ? roundMoney(hourlyRate * SUNDAY_MULTIPLIER * sunHrs)
    : firstAmount(
      lineAmount(record?.earningLines, /SUNDAYEARN/i),
      att?.sundayTotal,
      hourlyRate * SUNDAY_MULTIPLIER * sunHrs,
    );
  const phAmt = schedule
    ? roundMoney(hourlyRate * PUBLIC_HOLIDAY_MULTIPLIER * phHrs)
    : firstAmount(
      lineAmount(record?.earningLines, /PUBHOL/i),
      att?.publicHolidayTotal,
      hourlyRate * PUBLIC_HOLIDAY_MULTIPLIER * phHrs,
    );
  const nightAmt = scheduleAmount(schedule?.nightAmt)
    ?? firstAmount(
      lineAmount(record?.earningLines, /NIGHT/i),
      att?.nightWorkedTotal,
      NIGHT_PER_NIGHT_DAY * nightDays,
    );
  const meal = scheduleAmount(schedule?.mealAllowance)
    ?? firstAmount(
      lineAmount(record?.earningLines, /^MEAL$|MEAL ALLOW|PER_MEAL/i),
      MEAL_PER_WEEKDAY * weekDays,
    );
  const transport = scheduleAmount(schedule?.transport)
    ?? lineAmount(record?.earningLines, /TRANSPORT ALLOW|EXP_TRANS|^TRANSPORT$/i);
  const site = scheduleAmount(schedule?.siteAllowance)
    ?? firstAmount(lineAmount(record?.earningLines, /SITE ALLOW/i), att?.siteAllowanceTotal);
  const tcmMeal = scheduleAmount(schedule?.tcmMeal) ?? lineAmount(record?.earningLines, /TCMMEAL/i);
  const tcmTransport = scheduleAmount(schedule?.tcmTransport) ?? lineAmount(record?.earningLines, /TCM.?TRANS/i);
  const arrears = scheduleAmount(schedule?.arrears) ?? lineAmount(record?.earningLines, /ARREARS/i);
  const componentTotal = roundMoney(
    wkdEarning + wkdOvtAmt + satAmt + sunAmt + phAmt + nightAmt
    + meal + transport + site + tcmMeal + tcmTransport + arrears,
  );
  const totalEarnings = schedule
    ? componentTotal
    : firstAmount(record?.grossPay, componentTotal);
  const wht = schedule
    ? roundMoney(totalEarnings * WHT_RATE)
    : firstAmount(record?.paye, roundMoney(totalEarnings * WHT_RATE));
  const netPay = schedule
    ? roundMoney(totalEarnings - wht)
    : firstAmount(record?.netPay, roundMoney(totalEarnings - wht));
  return {
    code,
    firstName: names.firstName || att?.firstName || compact(schedule?.firstName) || '',
    lastName: names.lastName || att?.lastName || compact(schedule?.lastName) || '',
    jobTitle: compact(schedule?.jobTitle || record?.jobTitle || dir?.jobTitle || att?.jobTitle),
    location: compact(schedule?.location || record?.location || dir?.location || att?.location),
    dailyRate,
    age: ageFromDateOfBirth(dir?.dateOfBirth, asOf),
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
    bankName: compact(record?.bankName || dir?.bankName),
    accountNo: compact(record?.accountNo || dir?.accountNo),
    sortCode: compact(record?.sortCode || record?.branchCode || record?.bankCode || dir?.bankCode),
    scheduleDriven: Boolean(schedule),
  };
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
  const roster = buildDayrateExportRoster({ period, calculatedRecords: records, directoryEmployees });
  const asOf = periodAsOfDate(period);
  const dle = roster.filter((entry) => entry.company === 'DLE').map((entry) => detailRowFromEntry(entry, dirMap, attendance, asOf));
  const dlpc = roster.filter((entry) => entry.company === 'DLPC').map((entry) => detailRowFromEntry(entry, dirMap, attendance, asOf));
  return { dle, dlpc };
};

export const buildDayratePaymentScheduleXlsx = async (input: {
  period: string;
  periodLabel?: string;
  records: PayrollCalculationRecord[];
  directoryEmployees?: DleEmployeeDirectoryRow[];
  company?: PayrollCompany | null;
}) => {
  const templatePath = resolveDayratePaymentScheduleTemplatePath();
  if (!templatePath) throw new Error('Dayrate Payment Schedule template was not found.');
  const entries = readZipEntries(readFileSync(templatePath));
  const { dle: dleAll, dlpc: dlpcAll } = await buildDetailRows(input.records, input.period, input.directoryEmployees || []);
  const dle = !input.company || input.company === 'DLE' ? dleAll : [];
  const dlpc = !input.company || input.company === 'DLPC' ? dlpcAll : [];
  assertRowsFoot('DLE', dle);
  assertRowsFoot('DLPC', dlpc);
  const title = scheduleTitleForSheet(input.period, input.periodLabel);

  const sheet1Template = applyDayrateContractorHeadings(entries.get('xl/worksheets/sheet1.xml')?.toString('utf8') || '');
  const sheet2Template = applyDayrateContractorHeadings(entries.get('xl/worksheets/sheet2.xml')?.toString('utf8') || '');
  const sheet3Template = applyDayrateContractorHeadings(entries.get('xl/worksheets/sheet3.xml')?.toString('utf8') || '');
  const sheet4Template = applyDayrateContractorHeadings(entries.get('xl/worksheets/sheet4.xml')?.toString('utf8') || '');
  const sheet5Template = applyDayrateContractorHeadings(entries.get('xl/worksheets/sheet5.xml')?.toString('utf8') || '');

  if (sheet1Template) {
    entries.set('xl/worksheets/sheet1.xml', Buffer.from(fillSummarySheet(sheet1Template, title, dle, dlpc), 'utf8'));
  }

  const dleFilled = sheet2Template
    ? fillDetailTableSheet(sheet2Template, dle, 'AB', buildDleDataRow, buildDleTotalsRow)
    : null;
  if (dleFilled) {
    entries.set('xl/worksheets/sheet2.xml', Buffer.from(dleFilled.sheetXml, 'utf8'));
    const table2 = entries.get('xl/tables/table2.xml')?.toString('utf8');
    if (table2) {
      entries.set(
        'xl/tables/table2.xml',
        Buffer.from(applyDayrateContractorHeadings(patchTableXml(table2, `A1:AB${dleFilled.totalRowNum}`, `A1:AB${Math.max(1, dleFilled.totalRowNum - 1)}`)), 'utf8'),
      );
    }
  }

  const dlpcFilled = sheet3Template
    ? fillDetailTableSheet(sheet3Template, dlpc, 'Y', buildDlpcDataRow, buildDlpcTotalsRow)
    : null;
  if (dlpcFilled) {
    entries.set('xl/worksheets/sheet3.xml', Buffer.from(dlpcFilled.sheetXml, 'utf8'));
    const table3 = entries.get('xl/tables/table3.xml')?.toString('utf8');
    if (table3) {
      entries.set(
        'xl/tables/table3.xml',
        Buffer.from(applyDayrateContractorHeadings(patchTableXml(table3, `A1:Y${dlpcFilled.totalRowNum}`, `A1:Y${Math.max(1, dlpcFilled.totalRowNum - 1)}`)), 'utf8'),
      );
    }
  }

  const dleBankFilled = sheet4Template
    ? fillBankTableSheet(sheet4Template, dle, 'Table13', buildDleBankDataRow, 'F')
    : null;
  if (dleBankFilled) {
    entries.set('xl/worksheets/sheet4.xml', Buffer.from(dleBankFilled.sheetXml, 'utf8'));
    const table4 = entries.get('xl/tables/table4.xml')?.toString('utf8');
    if (table4) {
      entries.set(
        'xl/tables/table4.xml',
        Buffer.from(applyDayrateContractorHeadings(patchTableXml(table4, `A2:F${dleBankFilled.totalRowNum}`, `A2:F${Math.max(2, dleBankFilled.totalRowNum - 1)}`)), 'utf8'),
      );
    }
  }

  const dlpcBankFilled = sheet5Template
    ? fillBankTableSheet(sheet5Template, dlpc, 'Table146', buildDlpcBankDataRow, 'G')
    : null;
  if (dlpcBankFilled) {
    entries.set('xl/worksheets/sheet5.xml', Buffer.from(dlpcBankFilled.sheetXml, 'utf8'));
    const table5 = entries.get('xl/tables/table5.xml')?.toString('utf8');
    if (table5) {
      entries.set(
        'xl/tables/table5.xml',
        Buffer.from(applyDayrateContractorHeadings(patchTableXml(table5, `A2:G${dlpcBankFilled.totalRowNum}`, `A2:G${Math.max(2, dlpcBankFilled.totalRowNum - 1)}`)), 'utf8'),
      );
    }
  }

  // Drop cached formula chain so Excel recalculates cleanly after data rewrite.
  entries.delete('xl/calcChain.xml');
  for (const [name, buffer] of [...entries.entries()]) {
    if (!name.endsWith('.xml')) continue;
    const next = applyDayrateContractorHeadings(buffer.toString('utf8'));
    if (next !== buffer.toString('utf8')) entries.set(name, Buffer.from(next, 'utf8'));
  }

  return {
    fileName: dayratePaymentScheduleFileName(input.period, input.periodLabel, input.company),
    buffer: writeZipStore(entries),
    templatePath,
    counts: { dle: dle.length, dlpc: dlpc.length },
  };
};

export const dayrateScheduleXlsxMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
