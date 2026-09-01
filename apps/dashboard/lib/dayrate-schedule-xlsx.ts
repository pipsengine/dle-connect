/**
 * Parse HR Dayrate Payment Schedule workbooks (DLE / DLPC sheets).
 * The sheet name is the company of record for that period's overlay.
 * Attendance buckets are the authority; money columns are kept as reference or
 * as non-formula adjustments (night amt, site, TCM, transport, arrears).
 */
import { inflateRawSync } from 'node:zlib';

export type DayrateScheduleCompany = 'DLE' | 'DLPC';

export type DayrateScheduleRow = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  employeeName: string;
  jobTitle: string;
  location: string;
  company: DayrateScheduleCompany;
  excelDailyRate: number;
  weekdayDays: number;
  weekdayOvtHours: number;
  saturdayHours: number;
  sundayHours: number;
  publicHolidayHours: number;
  nightDays: number;
  nightAmt: number;
  mealAllowance: number;
  transport: number;
  siteAllowance: number;
  tcmMeal: number;
  tcmTransport: number;
  arrears: number;
  excelGross: number;
  excelNet: number;
};

export type DayrateScheduleParseResult = {
  title: string;
  rows: DayrateScheduleRow[];
  skipped: Array<{ sheet: string; reason: string; value?: string }>;
  sheets: Array<{ name: string; company: DayrateScheduleCompany; rowCount: number }>;
};

const u16 = (buf: Buffer, offset: number) => buf.readUInt16LE(offset);
const u32 = (buf: Buffer, offset: number) => buf.readUInt32LE(offset);
const inflateEntry = (data: Buffer, compression: number, size: number) => {
  if (compression === 0) return data.subarray(0, size);
  if (compression === 8) return inflateRawSync(data);
  throw new Error(`Unsupported ZIP compression method ${compression}.`);
};

const readZipEntries = (buffer: Buffer): Map<string, Buffer> => {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = Math.max(0, buffer.length - 22 - 65535); i <= buffer.length - 22; i += 1) {
    if (u32(buffer, i) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) throw new Error('No ZIP entries found — file may not be a valid .xlsx.');
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
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) throw new Error(`Corrupt ZIP entry: ${name}`);
    out.set(name.replace(/\\/g, '/'), inflateEntry(buffer.subarray(dataStart, dataEnd), compression, uncompSize));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (!out.size) throw new Error('No ZIP entries found — file may not be a valid .xlsx.');
  return out;
};

const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const parseSharedStrings = (xml: string): string[] => {
  const strings: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRe.exec(xml))) {
    const parts: string[] = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let text: RegExpExecArray | null;
    while ((text = tRe.exec(match[1]))) parts.push(decodeXml(text[1]));
    strings.push(parts.join(''));
  }
  return strings;
};

const colToNumber = (col: string) => {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

const numberToCol = (n: number) => {
  let value = '';
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    value = String.fromCharCode(65 + rem) + value;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return value;
};

const parseSheetGrid = (xml: string, shared: string[]) => {
  const grid = new Map<string, string | number>();
  let maxRow = 0;
  let maxCol = 0;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(xml))) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const refMatch = /\br="([A-Z]+)(\d+)"/i.exec(attrs);
    if (!refMatch) continue;
    const col = refMatch[1].toUpperCase();
    const row = Number(refMatch[2]);
    const raw = (/<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? /<t\b[^>]*>([\s\S]*?)<\/t>/i.exec(body)?.[1] ?? '').trim();
    let value: string | number = '';
    if (raw) {
      if (/\bt="s"/i.test(attrs)) {
        const idx = Number(raw);
        value = Number.isFinite(idx) ? (shared[idx] ?? '') : '';
      } else if (/\bt="b"/i.test(attrs)) {
        value = raw === '1' ? 'TRUE' : 'FALSE';
      } else if (/\bt="str"|t="inlineStr"/i.test(attrs)) {
        value = decodeXml(raw);
      } else if (!Number.isNaN(Number(raw))) {
        value = raw.length > 12 ? raw : Number(raw);
      } else {
        value = raw;
      }
    }
    grid.set(`${col}${row}`, value);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, colToNumber(col));
  }
  return { grid, maxRow, maxCol };
};

export const normalizeDayrateHeader = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

type FieldKey =
  | 'employeeCode'
  | 'firstName'
  | 'lastName'
  | 'jobTitle'
  | 'location'
  | 'excelDailyRate'
  | 'weekdayDays'
  | 'weekdayOvtHours'
  | 'saturdayHours'
  | 'sundayHours'
  | 'publicHolidayHours'
  | 'nightDays'
  | 'nightAmt'
  | 'mealAllowance'
  | 'transport'
  | 'siteAllowance'
  | 'tcmMeal'
  | 'tcmTransport'
  | 'arrears'
  | 'excelGross'
  | 'excelNet';

const HEADER_ALIASES: Array<{ field: FieldKey; match: (header: string) => boolean }> = [
  { field: 'employeeCode', match: (h) => /^(emp code|employee code|staff no|staff number|employee id|emp no)$/.test(h) },
  { field: 'firstName', match: (h) => h === 'first name' },
  { field: 'lastName', match: (h) => h === 'last name' },
  { field: 'jobTitle', match: (h) => h === 'job title' || h === 'designation' },
  { field: 'location', match: (h) => h === 'location' || h === 'site' },
  { field: 'excelDailyRate', match: (h) => h === 'daily rate' || h === 'day rate' },
  { field: 'weekdayDays', match: (h) => /^(total weekday|total weekday days|week days worked|weekday days)$/.test(h) },
  { field: 'weekdayOvtHours', match: (h) => h.startsWith('weekday ovt') || h.includes('overtime weekday') || h === 'total overtime weekday hrs' },
  { field: 'saturdayHours', match: (h) => !h.includes('earn') && (h.startsWith('total saturday') || h === 'saturday hours' || h === 'sat hours') },
  { field: 'sundayHours', match: (h) => !h.includes('earn') && (h.startsWith('total sunday') || h === 'sunday hours' || h === 'sun hours') },
  { field: 'publicHolidayHours', match: (h) => !h.includes('earn') && (h === 'public holiday' || h.startsWith('total public holiday') || h === 'public holiday hours') },
  { field: 'nightDays', match: (h) => h === 'night worked' || h.startsWith('night worked') },
  { field: 'nightAmt', match: (h) => h === 'night amt' || h.startsWith('night amount') || h === 'night amt' },
  { field: 'mealAllowance', match: (h) => h.startsWith('meal allowance') && !h.includes('tcm') },
  { field: 'transport', match: (h) => (h === 'transport' || h.startsWith('transport allowance')) && !h.includes('tcm') },
  { field: 'siteAllowance', match: (h) => h === 'site allowance' || h.startsWith('site allowance') },
  { field: 'tcmMeal', match: (h) => h === 'tcm meal' || h.startsWith('tcm meal') },
  { field: 'tcmTransport', match: (h) => h === 'tcm transport' || h.startsWith('tcm transport') },
  { field: 'arrears', match: (h) => h === 'arrears' },
  { field: 'excelGross', match: (h) => h === 'gross salary' || h === 'total earnings' },
  { field: 'excelNet', match: (h) => h === 'net pay' || h === 'net salary' },
];

export const mapDayrateHeaders = (headers: string[]) => {
  const mapped = new Map<FieldKey, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeDayrateHeader(header);
    if (!normalized) return;
    const alias = HEADER_ALIASES.find((item) => item.match(normalized) && !mapped.has(item.field));
    if (alias) mapped.set(alias.field, index);
  });
  return mapped;
};

const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const canonicalContractEmployeeCode = (value: unknown) => {
  const raw = compact(value).toUpperCase();
  const match = raw.match(/\b(C\d{3,})\b/);
  return match?.[1] || (/^C\d+$/.test(raw) ? raw : '');
};

export const dayrateBookedHours = (row: Pick<DayrateScheduleRow, 'weekdayDays' | 'weekdayOvtHours' | 'saturdayHours' | 'sundayHours' | 'publicHolidayHours'>) =>
  Math.round((Number(row.weekdayDays || 0) * 8 + Number(row.weekdayOvtHours || 0) + Number(row.saturdayHours || 0) + Number(row.sundayHours || 0) + Number(row.publicHolidayHours || 0)) * 10) / 10;

const sheetCompany = (name: string): DayrateScheduleCompany | null => {
  const upper = name.toUpperCase();
  if (upper.includes('BANK')) return null;
  if (upper.includes('SUMMARY')) return null;
  if (/\bDLPC\b/.test(upper)) return 'DLPC';
  if (/\bDLE\b/.test(upper) || upper === 'DLE') return 'DLE';
  return null;
};

const isTotalLabel = (value: unknown) => /^(total|grand total|subtotal)$/i.test(compact(value));

export const parseDayratePaymentScheduleWorkbook = (buffer: Buffer): DayrateScheduleParseResult => {
  const entries = readZipEntries(buffer);
  const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const shared = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8') || '');
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*?)\/>/g)].map((match) => {
    const attrs = match[1];
    const name = /name="([^"]+)"/.exec(attrs)?.[1] || '';
    const rid = /r:id="([^"]+)"/.exec(attrs)?.[1] || '';
    const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`, 'i').exec(relsXml)?.[1] || '';
    const path = target.startsWith('xl/') ? target : `xl/${target.replace(/^\//, '')}`;
    return { name, path };
  });

  const titleCell = [...entries.values()]
    .slice(0, 1);
  void titleCell;
  const titleMatch = /AUGUST|JULY|JUNE|MAY|APRIL|MARCH|FEBRUARY|JANUARY|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER/i.exec(
    shared.find((item) => /dayrate payment schedule/i.test(item)) || '',
  );
  const title = shared.find((item) => /dayrate payment schedule/i.test(item)) || titleMatch?.[0] || 'Dayrate Payment Schedule';

  const rows: DayrateScheduleRow[] = [];
  const skipped: DayrateScheduleParseResult['skipped'] = [];
  const sheetSummary: DayrateScheduleParseResult['sheets'] = [];
  const seen = new Set<string>();

  for (const sheet of sheets) {
    const company = sheetCompany(sheet.name);
    if (!company) continue;
    const xml = entries.get(sheet.path)?.toString('utf8');
    if (!xml) {
      skipped.push({ sheet: sheet.name, reason: 'Worksheet XML missing' });
      continue;
    }
    const { grid, maxRow, maxCol } = parseSheetGrid(xml, shared);
    let headerRow = 1;
    let bestFilled = 0;
    for (let row = 1; row <= Math.min(maxRow, 8); row += 1) {
      let filled = 0;
      for (let col = 1; col <= maxCol; col += 1) {
        if (compact(grid.get(`${numberToCol(col)}${row}`))) filled += 1;
      }
      if (filled > bestFilled) {
        bestFilled = filled;
        headerRow = row;
      }
    }
    const headers: string[] = [];
    for (let col = 1; col <= maxCol; col += 1) {
      headers.push(compact(grid.get(`${numberToCol(col)}${headerRow}`)));
    }
    const mapped = mapDayrateHeaders(headers);
    if (!mapped.has('employeeCode') || !mapped.has('weekdayDays')) {
      skipped.push({ sheet: sheet.name, reason: 'Sheet is missing Emp. Code or Total Weekday' });
      continue;
    }

    let count = 0;
    for (let row = headerRow + 1; row <= maxRow; row += 1) {
      const cell = (field: FieldKey) => {
        const index = mapped.get(field);
        if (index == null) return '';
        return grid.get(`${numberToCol(index + 1)}${row}`) ?? '';
      };
      const codeRaw = cell('employeeCode');
      if (isTotalLabel(codeRaw) || isTotalLabel(cell('firstName'))) continue;
      const employeeCode = canonicalContractEmployeeCode(codeRaw);
      if (!employeeCode) {
        if (compact(codeRaw)) skipped.push({ sheet: sheet.name, reason: 'Not a C-code employee', value: compact(codeRaw) });
        continue;
      }
      const firstName = compact(cell('firstName'));
      const lastName = compact(cell('lastName'));
      const next: DayrateScheduleRow = {
        employeeCode,
        firstName,
        lastName,
        employeeName: [firstName, lastName].filter(Boolean).join(' '),
        jobTitle: compact(cell('jobTitle')),
        location: compact(cell('location')),
        company,
        excelDailyRate: num(cell('excelDailyRate')),
        weekdayDays: num(cell('weekdayDays')),
        weekdayOvtHours: num(cell('weekdayOvtHours')),
        saturdayHours: num(cell('saturdayHours')),
        sundayHours: num(cell('sundayHours')),
        publicHolidayHours: num(cell('publicHolidayHours')),
        nightDays: num(cell('nightDays')),
        nightAmt: num(cell('nightAmt')),
        mealAllowance: num(cell('mealAllowance')),
        transport: num(cell('transport')),
        siteAllowance: num(cell('siteAllowance')),
        tcmMeal: num(cell('tcmMeal')),
        tcmTransport: num(cell('tcmTransport')),
        arrears: num(cell('arrears')),
        excelGross: num(cell('excelGross')),
        excelNet: num(cell('excelNet')),
      };
      const key = `${employeeCode}::${company}`;
      if (seen.has(employeeCode)) {
        skipped.push({ sheet: sheet.name, reason: 'Duplicate C-code skipped', value: employeeCode });
        continue;
      }
      seen.add(employeeCode);
      void key;
      rows.push(next);
      count += 1;
    }
    sheetSummary.push({ name: sheet.name, company, rowCount: count });
  }

  if (!rows.length) {
    throw new Error('No C-code employees found on DLE or DLPC sheets. Upload the Dayrate Payment Schedule workbook.');
  }

  return { title, rows, skipped, sheets: sheetSummary };
};
