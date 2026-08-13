/**
 * Parse CALL CARDS bank-upload workbooks (e.g. CALL CREDIT JUL - AUG 2026.xlsx)
 * without an external xlsx dependency (OOXML zip + sharedStrings).
 */

import { inflateRawSync } from 'node:zlib';
import { BIMONTHLY_PAIRS, roundMoney } from '@/lib/telephone-allowance-cycle';

export type CallCreditImportRow = {
  employeeCode: string;
  employeeName?: string;
  amount?: number;
  bimonthlyAmount?: number;
  month1Eligible?: boolean;
  month2Eligible?: boolean;
  bankName?: string | null;
  accountNo?: string | null;
  sortCode?: string | null;
};

export type CallCreditParseResult = {
  year: number;
  pairCode: string;
  pairLabel: string;
  title: string;
  rows: CallCreditImportRow[];
  bimonthlyTotal: number;
  beneficiaryCount: number;
};

const u16 = (buf: Buffer, offset: number) => buf.readUInt16LE(offset);
const u32 = (buf: Buffer, offset: number) => buf.readUInt32LE(offset);

const inflateEntry = (data: Buffer, compression: number, size: number) => {
  if (compression === 0) return data.subarray(0, size);
  if (compression === 8) return inflateRawSync(data);
  throw new Error(`Unsupported ZIP compression method ${compression}`);
};

/** Minimal local-file-header ZIP reader (stored + deflate). */
export const readZipEntries = (buffer: Buffer): Map<string, Buffer> => {
  const out = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = u32(buffer, offset);
    if (sig !== 0x04034b50) break;
    const compression = u16(buffer, offset + 8);
    const compSize = u32(buffer, offset + 18);
    const uncompSize = u32(buffer, offset + 22);
    const nameLen = u16(buffer, offset + 26);
    const extraLen = u16(buffer, offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) throw new Error('Corrupt ZIP entry.');
    const raw = buffer.subarray(dataStart, dataEnd);
    out.set(name.replace(/\\/g, '/'), inflateEntry(raw, compression, uncompSize));
    offset = dataEnd;
  }
  if (!out.size) throw new Error('No ZIP entries found — file may not be a valid .xlsx.');
  return out;
};

const parseSharedStrings = (xml: string): string[] => {
  const strings: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const parts: string[] = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(m[1]))) {
      parts.push(tm[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'));
    }
    strings.push(parts.join(''));
  }
  return strings;
};

const parseSheetGrid = (xml: string, shared: string[]): Map<string, string | number> => {
  const grid = new Map<string, string | number>();
  // Prefer matching each complete <c> element; style attrs like s="16" must never be treated as values.
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(xml))) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    const refMatch = /\br="([A-Z]+)(\d+)"/i.exec(attrs);
    if (!refMatch) continue;
    const key = `${refMatch[1].toUpperCase()}${refMatch[2]}`;
    const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body);
    const isMatch = /<t\b[^>]*>([\s\S]*?)<\/t>/i.exec(body);
    const raw = (vMatch?.[1] ?? isMatch?.[1] ?? '').trim();
    if (!raw) {
      grid.set(key, '');
      continue;
    }
    if (/\bt="s"/i.test(attrs)) {
      const idx = Number(raw);
      grid.set(key, Number.isFinite(idx) ? (shared[idx] ?? '') : '');
    } else if (/\bt="b"/i.test(attrs)) {
      grid.set(key, raw === '1' ? 'TRUE' : 'FALSE');
    } else if (/\bt="str"|t="inlineStr"/i.test(attrs)) {
      grid.set(key, raw
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'));
    } else if (!Number.isNaN(Number(raw))) {
      // Keep long account numbers as text so leading zeros / precision survive.
      grid.set(key, raw.length > 12 ? raw : Number(raw));
    } else {
      grid.set(key, raw);
    }
  }
  return grid;
};

const firstSheetPath = (entries: Map<string, Buffer>) => {
  const wb = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const sheetMatch = /<sheet\b[^>]*\br:id="(rId\d+)"[^>]*\/?>|<sheet\b[^>]*\bname="[^"]*"[^>]*\br:id="(rId\d+)"/i.exec(wb);
  const rid = sheetMatch?.[1] || sheetMatch?.[2] || 'rId1';
  const rels = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const relMatch = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`, 'i').exec(rels)
    || /Target="(worksheets\/sheet\d+\.xml)"/i.exec(rels);
  const target = (relMatch?.[1] || 'worksheets/sheet1.xml').replace(/^\//, '');
  const path = target.startsWith('xl/') ? target : `xl/${target}`;
  if (!entries.has(path)) throw new Error(`Worksheet not found at ${path}`);
  return path;
};

const detectPairFromTitle = (title: string): { year: number; pairCode: string; pairLabel: string } | null => {
  const cleaned = title.replace(/\s+/g, ' ').trim();
  const yearMatch = cleaned.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
  const upper = cleaned.toUpperCase();
  for (const pair of BIMONTHLY_PAIRS) {
    const a = pair.label.split('–')[0].slice(0, 3).toUpperCase();
    const b = pair.label.split('–')[1].slice(0, 3).toUpperCase();
    if (upper.includes(`${a}`) && upper.includes(`${b}`)) {
      return { year, pairCode: pair.code, pairLabel: pair.label };
    }
    if (upper.includes(pair.code.replace('-', ' - ')) || upper.includes(pair.code)) {
      return { year, pairCode: pair.code, pairLabel: pair.label };
    }
  }
  // Jul-Aug / July August variants
  if (/JUL/.test(upper) && /AUG/.test(upper)) return { year, pairCode: 'JUL-AUG', pairLabel: 'Jul–Aug' };
  if (/SEP|SEPT/.test(upper) && /OCT/.test(upper)) return { year, pairCode: 'SEP-OCT', pairLabel: 'Sep–Oct' };
  return null;
};

const cell = (grid: Map<string, string | number>, col: string, row: number) =>
  grid.get(`${col}${row}`);

const asText = (value: unknown) => String(value ?? '').replace(/\u00a0/g, ' ').trim();

const asAmount = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value);
  const raw = asText(value).replace(/,/g, '');
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? roundMoney(n) : 0;
};

export const parseCallCreditWorkbook = (input: Buffer | ArrayBuffer | Uint8Array): CallCreditParseResult => {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  const entries = readZipEntries(buffer);
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const sheetXml = entries.get(firstSheetPath(entries))!.toString('utf8');
  const grid = parseSheetGrid(sheetXml, shared);

  let title = '';
  for (let r = 1; r <= 5; r += 1) {
    for (const col of ['A', 'B', 'C', 'D', 'E']) {
      const v = asText(cell(grid, col, r));
      if (/call|credit|jul|aug|sep|oct|employee/i.test(v) && v.length > title.length) title = v;
    }
  }

  let headerRow = 0;
  for (let r = 1; r <= 15; r += 1) {
    const rowText = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
      .map((c) => asText(cell(grid, c, r)).toUpperCase())
      .join('|');
    if (rowText.includes('STAFF') && rowText.includes('AMOUNT')) {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) throw new Error('Could not find CALL CARDS header row (Staff ID / AMOUNT).');

  const headers: Record<string, string> = {};
  for (let ci = 0; ci < 26; ci += 1) {
    const col = String.fromCharCode(65 + ci);
    const label = asText(cell(grid, col, headerRow)).toUpperCase();
    if (!label) continue;
    if (/STAFF\s*ID|EMPLOYEE.?ID|EMP.?NO/.test(label)) headers.staff = col;
    else if (/SURNAME|LAST.?NAME/.test(label)) headers.surname = col;
    else if (/FIRST.?NAME|OTHER.?NAME/.test(label)) headers.firstName = col;
    else if (/^AMOUNT$|PAYMENT.?AMOUNT|NET.?AMOUNT/.test(label)) headers.amount = col;
    else if (/BENEFICIARY\s+ACC|BENEFICIARY\s+ACCOUNT|ACC(?:OUNT)?\s*NO/.test(label) && !/DEBIT|CUST/.test(label)) {
      headers.accountNo = col;
    } else if (/ROUTING|SORT\s*CODE|BANK\s*CODE/.test(label) && !/BENEFICIARY\s+CODE/.test(label)) {
      headers.sortCode = col;
    } else if (/^BANK\s*NAME$/.test(label)) headers.bankName = col;
  }

  // Standard CALL CARDS layout fallback used by finance bank-upload files.
  if (!headers.staff) headers.staff = 'B';
  if (!headers.surname) headers.surname = 'C';
  if (!headers.firstName) headers.firstName = 'D';
  if (!headers.amount) headers.amount = 'E';
  if (!headers.accountNo) headers.accountNo = 'H';
  if (!headers.sortCode) headers.sortCode = 'I';

  const looksLikeStaffId = (code: string) => /^[A-Z]?\d{2,6}$/i.test(code) || /^[A-Z]\d{3,5}$/i.test(code);

  const rows: CallCreditImportRow[] = [];
  for (let r = headerRow + 1; r <= headerRow + 500; r += 1) {
    const employeeCode = asText(cell(grid, headers.staff, r));
    if (!employeeCode) continue;
    if (/^total|^designation|^date:|^sign|^prepared|^approved/i.test(employeeCode)) break;
    if (!looksLikeStaffId(employeeCode)) {
      // Stop at signature / summary blocks that reuse numeric cells.
      if (rows.length > 0) break;
      continue;
    }
    const amount = asAmount(cell(grid, headers.amount, r));
    if (!(amount > 0)) continue;
    const surname = headers.surname ? asText(cell(grid, headers.surname, r)) : '';
    const firstName = headers.firstName ? asText(cell(grid, headers.firstName, r)) : '';
    const employeeName = [surname, firstName].filter(Boolean).join(' ').trim();
    if (!employeeName && String(amount) === employeeCode) continue;
    rows.push({
      employeeCode,
      employeeName: employeeName || employeeCode,
      bimonthlyAmount: amount,
      amount,
      accountNo: headers.accountNo ? asText(cell(grid, headers.accountNo, r)) || null : null,
      sortCode: headers.sortCode ? asText(cell(grid, headers.sortCode, r)) || null : null,
      bankName: headers.bankName ? asText(cell(grid, headers.bankName, r)) || null : null,
      month1Eligible: true,
      month2Eligible: true,
    });
  }

  if (!rows.length) throw new Error('No beneficiary rows found in CALL CARDS workbook.');

  const detected = detectPairFromTitle(title) || detectPairFromTitle(asText(cell(grid, 'A', headerRow + 1)));
  const pair = detected || { year: new Date().getFullYear(), pairCode: 'JUL-AUG', pairLabel: 'Jul–Aug' };
  const bimonthlyTotal = roundMoney(rows.reduce((s, r) => s + Number(r.bimonthlyAmount || r.amount || 0), 0));

  return {
    year: pair.year,
    pairCode: pair.pairCode,
    pairLabel: pair.pairLabel,
    title: title || `CALL CREDIT ${pair.pairCode} ${pair.year}`,
    rows,
    bimonthlyTotal,
    beneficiaryCount: rows.length,
  };
};
