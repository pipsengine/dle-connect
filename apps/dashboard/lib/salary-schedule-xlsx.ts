/**
 * Parse DLE Salary Schedule workbooks (PERM.STAFF / CONT. STAFF / USD REPORT / Summary).
 * One book covers both companies. COMPANY column DLENG → DLE Salaries, DLPCG → DLPC Salaries.
 * USD REPORT always stays on DLE. Applied per selected period whenever HR uploads the month's file.
 */
import { inflateRawSync } from 'node:zlib';

export type SalaryScheduleSheetKind = 'perm' | 'cont' | 'usd' | 'summary' | 'other';

export type SalaryScheduleEarningLine = {
  code: string;
  name: string;
  amount: number;
};

export type SalaryScheduleDeductionLine = {
  code: string;
  name: string;
  amount: number;
};

export type SalaryScheduleRow = {
  sheet: string;
  kind: SalaryScheduleSheetKind;
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  company: string;
  department: string;
  location: string;
  employmentType: string;
  contType: string;
  periodSalary: number;
  annualSalary: number;
  earningTotal: number;
  deductionTotal: number;
  grossPay: number;
  netPay: number;
  paye: number;
  pension: number;
  nhf: number;
  earnings: SalaryScheduleEarningLine[];
  deductions: SalaryScheduleDeductionLine[];
};

export type SalaryScheduleParseResult = {
  title: string;
  rows: SalaryScheduleRow[];
  byKind: Record<'perm' | 'cont' | 'usd', SalaryScheduleRow[]>;
  summary: {
    permCount: number;
    contCount: number;
    usdCount: number;
    permGross: number;
    contGross: number;
    usdGross: number;
    permNet: number;
    contNet: number;
    usdNet: number;
  };
  skipped: Array<{ sheet: string; reason: string; value?: string }>;
  sheets: Array<{ name: string; kind: SalaryScheduleSheetKind; rowCount: number }>;
};

const compact = (value: unknown) => String(value || '').trim();
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

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

const readSharedStrings = (zip: Map<string, Buffer>) => {
  const xml = zip.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const out: string[] = [];
  for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    out.push([...match[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((item) => item[1]).join(''));
  }
  return out;
};

const decodeXml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const colToIndex = (col: string) => [...col].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);

const parseSheetGrid = (xml: string, shared: string[]) => {
  const rows = new Map<number, Map<string, string>>();
  for (const rowMatch of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNo = Number(rowMatch[1]);
    const cells = new Map<string, string>();
    for (const cellMatch of rowMatch[2].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = cellMatch[1];
      const attrs = cellMatch[3] || '';
      const body = cellMatch[4] || '';
      const valueMatch = body.match(/<v>([^<]*)<\/v>/);
      if (!valueMatch) continue;
      const raw = valueMatch[1];
      cells.set(col, attrs.includes('t="s"') ? decodeXml(shared[Number(raw)] ?? raw) : raw);
    }
    if (cells.size) rows.set(rowNo, cells);
  }
  return rows;
};

const sheetKind = (name: string): SalaryScheduleSheetKind => {
  const key = compact(name).toUpperCase().replace(/\s+/g, ' ');
  if (key === 'PERM.STAFF' || key === 'PERM STAFF') return 'perm';
  if (key === 'CONT. STAFF' || key === 'CONT STAFF' || key === 'CONT.STAFF') return 'cont';
  if (key === 'USD REPORT') return 'usd';
  if (key === 'SUMMARY') return 'summary';
  return 'other';
};

const normalizeEmployeeCode = (raw: string, kind: SalaryScheduleSheetKind) => {
  let code = compact(raw).toUpperCase().replace(/_+$/g, '');
  if (!code) return '';
  if (/^(NYSC|IT)\d+$/i.test(code)) return code.toUpperCase();
  if (/^[PLCNI]\d+$/i.test(code)) return code.toUpperCase();
  if (/^\d+$/.test(code)) {
    // Permanent numeric codes in this workbook are P-prefixed HRIS codes.
    if (kind === 'perm' || kind === 'usd') return `P${code.padStart(4, '0')}`;
    return code;
  }
  return code;
};

const isEmployeeCode = (code: string) => /^(?:[PLCNI]\d+|NYSC\d+|IT\d+)$/i.test(compact(code));

const headerKey = (value: string) =>
  compact(value)
    .toUpperCase()
    .replace(/\(EARNING\)|\(DEDUCTION\)|\(COMPANYCONTRIBUTION\)|\(PROVISIONS\)|\(HA\)/gi, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

const earningCodeFromHeader = (header: string) => {
  const key = headerKey(header);
  const map: Record<string, string> = {
    'BASIC SALARY': 'BASIC',
    FURNITURE: 'FURNITURE',
    'FURNITURE ALLOWANCE': 'FURN_ALLOW',
    HOUSING: 'HOUSING',
    'JNR MEDICAL': 'JNRMEDICAL',
    'JNR OTHER ALLOWANCE': 'JNROTHERALL',
    'JNR STAFF MEAL ALLOWANCE': 'JNRMEAL',
    'JNR UTILITY': 'JNRUTILITY',
    'JUNIOR UNION': 'JNRUNION',
    'LEAVE ALLOWANCE': 'LEAVEALLOW',
    MEAL: 'MEAL',
    'MEAL ALLOWANCE': 'MEAL',
    MEDICAL: 'MEDICAL',
    'OTHER ALLOWANCE': 'OTHERALL',
    OVERTIME: 'OVERTIME',
    'PENSION REFUND': 'PENSION_REFUND',
    'SENIOR MANAGEMENT HOUSING TAX': 'SNMHOUSINGTAX',
    'SENIOR MANAGEMENT OTHER ALLOWANCE T': 'SNMOTHALLTAX',
    'SENIOR MANAGER TRANSPORT': 'SNMTRANSPTAX',
    'SITE ALLOWANCE': 'SITE_ALLOW',
    'SNR UNION': 'SNRUNION',
    'TCM TRANSPORT': 'TCMTRANS',
    'TRANSPORT ALLOWANCE': 'TRANSPORT',
    UTILITIES: 'UTILITY',
    UTILITY: 'UTILITY',
    ARREARS: 'ARREARS',
    'IT ALLOWANCE': 'ITALLOW',
    'LUMPSUM ALLOWANCE': 'LUMPSUMTAX',
    'LUMSUM AMOUNT': 'BASIC1_LUMPSUM',
    'NIGHT ALLOWANCE': 'NIGHT_ALLOW',
    'NYSC ALLOWANCE': 'NYSCALLOW',
    'WEEKLY TRANSPORT': 'TRANSPORT_WK',
    'EXP SMGT BASIC': 'EXP_BASIC_TAX',
    'EXP SMGT OTHER ALLOWANCE': 'EXP_OTHALL',
    'EXP SMGT HOUSING': 'EXP_HOUSING_TAX',
    'EXP SNMG TRANSPORT': 'EXP_TRANSP',
  };
  return map[key] || key.replace(/\s+/g, '_');
};

const deductionCodeFromHeader = (header: string) => {
  const key = headerKey(header);
  if (key.includes('NHF')) return 'NHF';
  if (key.includes('PAYE')) return 'PAYE';
  if (key.includes('PENSION EE2')) return 'PENSION_EE2';
  if (key === 'PENSION' || key.includes('PENSION')) return 'PENSION_EE';
  if (key.includes('UNION')) return 'UNION';
  return key.replace(/\s+/g, '_');
};

const cell = (row: Map<string, string>, col: string | undefined) => (col ? compact(row.get(col)) : '');
const cellNum = (row: Map<string, string>, col: string | undefined) => (col ? num(row.get(col)) : 0);

const buildHeaderMap = (headerRow: Map<string, string>) => {
  const byKey = new Map<string, string>();
  const earnings: Array<{ col: string; name: string; code: string }> = [];
  const deductions: Array<{ col: string; name: string; code: string }> = [];
  for (const [col, raw] of [...headerRow.entries()].sort((a, b) => colToIndex(a[0]) - colToIndex(b[0]))) {
    const name = compact(raw);
    if (!name) continue;
    const upper = name.toUpperCase();
    byKey.set(headerKey(name), col);
    if (/\(Earning\)/i.test(name)) earnings.push({ col, name, code: earningCodeFromHeader(name) });
    if (/\(Deduction\)/i.test(name) && !/Column2/i.test(name)) {
      deductions.push({ col, name, code: deductionCodeFromHeader(name) });
    }
    // also index common aliases
    if (/^Employee Code$/i.test(name)) byKey.set('EMPLOYEE CODE', col);
  }
  return { byKey, earnings, deductions };
};

const findCol = (map: Map<string, string>, ...keys: string[]) => {
  for (const key of keys) {
    const hit = map.get(headerKey(key));
    if (hit) return hit;
  }
  return undefined;
};

const parseEmployeeSheet = (
  sheetName: string,
  kind: 'perm' | 'cont' | 'usd',
  grid: Map<number, Map<string, string>>,
  skipped: SalaryScheduleParseResult['skipped'],
) => {
  const header = grid.get(1);
  if (!header) {
    skipped.push({ sheet: sheetName, reason: 'missing header row' });
    return [] as SalaryScheduleRow[];
  }
  const { byKey, earnings: earningCols, deductions: deductionCols } = buildHeaderMap(header);
  const codeCol = findCol(byKey, 'EMPLOYEE CODE');
  const rows: SalaryScheduleRow[] = [];

  for (const [rowNo, row] of [...grid.entries()].sort((a, b) => a[0] - b[0])) {
    if (rowNo === 1) continue;
    const rawCode = cell(row, codeCol);
    if (!rawCode || /^total$/i.test(rawCode) || /^grand total$/i.test(rawCode)) continue;
    const employeeCode = normalizeEmployeeCode(rawCode, kind);
    if (!employeeCode) {
      skipped.push({ sheet: sheetName, reason: 'blank employee code', value: `row ${rowNo}` });
      continue;
    }
    const surname = cell(row, findCol(byKey, 'EMPLOYEESURNAME'));
    const first = cell(row, findCol(byKey, 'EMPLOYEEFIRSTNAME'));
    const second = cell(row, findCol(byKey, 'EMPLOYEESECONDNAME'));
    const employeeName = compact([first, second, surname].filter(Boolean).join(' '));
    // Sheet total / subtotal rows: numeric "name", or codes that are not real HRIS IDs.
    if (/^\d+(\.\d+)?$/.test(employeeName)) {
      skipped.push({ sheet: sheetName, reason: 'summary/total row', value: `${rawCode}:${employeeName || 'blank'}` });
      continue;
    }
    if (kind === 'usd' && employeeCode === 'P0004') {
      skipped.push({ sheet: sheetName, reason: 'usd total row', value: rawCode });
      continue;
    }
    if (!isEmployeeCode(employeeCode)) {
      skipped.push({ sheet: sheetName, reason: 'non-employee code', value: rawCode });
      continue;
    }

    const earnings = earningCols
      .map((item) => ({ code: item.code, name: item.name.replace(/\s*\(Earning\)\s*/i, '').trim(), amount: roundMoney(cellNum(row, item.col)) }))
      .filter((line) => line.amount !== 0);
    const deductions = deductionCols
      .map((item) => ({ code: item.code, name: item.name.replace(/\s*\(Deduction\)\s*/i, '').trim(), amount: roundMoney(cellNum(row, item.col)) }))
      .filter((line) => line.amount !== 0);

    const earningTotal = roundMoney(cellNum(row, findCol(byKey, 'EARNING TOTAL')) || earnings.reduce((sum, line) => sum + line.amount, 0));
    const deductionTotal = roundMoney(cellNum(row, findCol(byKey, 'DEDUCTION TOTAL', 'DEDUCTION TOTAL')) || deductions.reduce((sum, line) => sum + line.amount, 0));
    const grossPay = roundMoney(cellNum(row, findCol(byKey, 'GROSS EARNINGS')) || earningTotal);
    const netPay = roundMoney(cellNum(row, findCol(byKey, 'NET PAY')) || (grossPay - deductionTotal));

    rows.push({
      sheet: sheetName,
      kind,
      employeeCode,
      employeeName: employeeName || employeeCode,
      jobTitle: cell(row, findCol(byKey, 'JOB TITLE LONG DESCRIPTION')),
      company: cell(row, findCol(byKey, 'COMPANY')),
      department: cell(row, findCol(byKey, 'DEPARTMENT')),
      location: cell(row, findCol(byKey, 'LOCATION')),
      employmentType: cell(row, findCol(byKey, 'EMPLOYEE TYPE')),
      contType: cell(row, findCol(byKey, 'CONT TYPE')),
      periodSalary: roundMoney(cellNum(row, findCol(byKey, 'PERIOD SALARY'))),
      annualSalary: roundMoney(cellNum(row, findCol(byKey, 'ANNUAL SALARY'))),
      earningTotal,
      deductionTotal,
      grossPay,
      netPay,
      paye: roundMoney(deductions.find((line) => line.code === 'PAYE')?.amount || 0),
      pension: roundMoney(deductions.find((line) => line.code === 'PENSION_EE' || line.code === 'PENSION')?.amount || 0),
      nhf: roundMoney(deductions.find((line) => line.code === 'NHF')?.amount || 0),
      earnings,
      deductions,
    });
  }
  return rows;
};

export const parseSalaryScheduleWorkbook = (workbook: Buffer): SalaryScheduleParseResult => {
  const zip = readZipEntries(workbook);
  const shared = readSharedStrings(zip);
  const wb = zip.get('xl/workbook.xml')?.toString('utf8') || '';
  const sheetsMeta = [...wb.matchAll(/<sheet[^>]+name="([^"]+)"[^>]+r:id="([^"]+)"/g)].map((match) => ({
    name: decodeXml(match[1]),
    rid: match[2],
  }));
  const rels = zip.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const relMap = Object.fromEntries(
    [...rels.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)].map((match) => [match[1], match[2].replace(/^\.\//, '')]),
  );

  const skipped: SalaryScheduleParseResult['skipped'] = [];
  const sheets: SalaryScheduleParseResult['sheets'] = [];
  const byKind: SalaryScheduleParseResult['byKind'] = { perm: [], cont: [], usd: [] };
  const rows: SalaryScheduleRow[] = [];

  for (const sheet of sheetsMeta) {
    const kind = sheetKind(sheet.name);
    const targetRaw = relMap[sheet.rid] || '';
    const target = targetRaw.startsWith('xl/') ? targetRaw : `xl/${targetRaw}`;
    const xml = zip.get(target)?.toString('utf8') || zip.get(targetRaw)?.toString('utf8') || '';
    if (!xml) {
      skipped.push({ sheet: sheet.name, reason: 'worksheet missing' });
      continue;
    }
    const grid = parseSheetGrid(xml, shared);
    if (kind === 'perm' || kind === 'cont' || kind === 'usd') {
      const parsed = parseEmployeeSheet(sheet.name, kind, grid, skipped);
      byKind[kind].push(...parsed);
      rows.push(...parsed);
      sheets.push({ name: sheet.name, kind, rowCount: parsed.length });
    } else {
      sheets.push({ name: sheet.name, kind, rowCount: Math.max(0, grid.size - 1) });
    }
  }

  const sum = (list: SalaryScheduleRow[], field: keyof SalaryScheduleRow) =>
    roundMoney(list.reduce((total, row) => total + num(row[field]), 0));

  return {
    title: 'DLE Salary Schedule',
    rows,
    byKind,
    summary: {
      permCount: byKind.perm.length,
      contCount: byKind.cont.length,
      usdCount: byKind.usd.length,
      permGross: sum(byKind.perm, 'grossPay'),
      contGross: sum(byKind.cont, 'grossPay'),
      usdGross: sum(byKind.usd, 'grossPay'),
      permNet: sum(byKind.perm, 'netPay'),
      contNet: sum(byKind.cont, 'netPay'),
      usdNet: sum(byKind.usd, 'netPay'),
    },
    skipped,
    sheets,
  };
};

export const salaryScheduleEmployeeKeys = (code: string) => {
  const upper = compact(code).toUpperCase();
  const bare = upper.replace(/^P0+/, 'P').replace(/^P/, '');
  const padded = /^\d+$/.test(bare) ? `P${bare.padStart(4, '0')}` : upper;
  return Array.from(new Set([upper, padded, bare, `P${bare}`, upper.replace(/_+$/, '')].filter(Boolean)));
};
