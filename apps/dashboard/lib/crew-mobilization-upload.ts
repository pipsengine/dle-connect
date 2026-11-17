/**
 * Extract employee codes from crew mobilization upload files (CSV / XLSX)
 * without an external spreadsheet dependency.
 */

import { inflateRawSync } from 'node:zlib';

const CODE_HEADER = /^(employee\s*code|emp\.?\s*code|staff\s*(?:no|number|id|code)|personnel\s*(?:no|number|id)|badge\s*(?:no|id)|code)$/i;
const NAME_HEADER = /^(employee\s*name|full\s*name|name|staff\s*name)$/i;
const LOOKS_LIKE_CODE = /^[A-Za-z]{0,4}\d{2,8}[A-Za-z0-9/-]*$/;

const u16 = (buf: Buffer, offset: number) => buf.readUInt16LE(offset);
const u32 = (buf: Buffer, offset: number) => buf.readUInt32LE(offset);

const inflateEntry = (data: Buffer, compression: number, size: number) => {
  if (compression === 0) return data.subarray(0, size);
  if (compression === 8) return inflateRawSync(data);
  throw new Error(`Unsupported ZIP compression method ${compression}`);
};

const readZipEntries = (buffer: Buffer): Map<string, Buffer> => {
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
    out.set(name.replace(/\\/g, '/'), inflateEntry(buffer.subarray(dataStart, dataEnd), compression, uncompSize));
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

const parseSheetGrid = (xml: string, shared: string[]): Map<string, string> => {
  const grid = new Map<string, string>();
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
      grid.set(key, Number.isFinite(idx) ? String(shared[idx] ?? '') : '');
    } else {
      grid.set(key, raw
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'));
    }
  }
  return grid;
};

const firstSheetPath = (entries: Map<string, Buffer>) => {
  const wb = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const sheetMatch = /<sheet\b[^>]*\br:id="(rId\d+)"[^>]*\/?>/i.exec(wb);
  const rid = sheetMatch?.[1] || 'rId1';
  const rels = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const relMatch = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`, 'i').exec(rels)
    || /Target="(worksheets\/sheet\d+\.xml)"/i.exec(rels);
  const target = (relMatch?.[1] || 'worksheets/sheet1.xml').replace(/^\//, '');
  const path = target.startsWith('xl/') ? target : `xl/${target}`;
  if (!entries.has(path)) throw new Error(`Worksheet not found at ${path}`);
  return path;
};

const normalizeCode = (value: unknown) => String(value ?? '').replace(/\u00a0/g, ' ').trim();

const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
};

const extractCodesFromRows = (rows: string[][]): string[] => {
  if (!rows.length) return [];

  let headerIndex = -1;
  let codeCol = 0;
  for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
    const cols = rows[r].map((cell) => normalizeCode(cell));
    const found = cols.findIndex((cell) => CODE_HEADER.test(cell));
    if (found >= 0) {
      headerIndex = r;
      codeCol = found;
      break;
    }
    const nameFound = cols.findIndex((cell) => NAME_HEADER.test(cell));
    if (nameFound >= 0 && cols.length > 1) {
      // Prefer a neighbouring code-like header, else first non-name column.
      const alt = cols.findIndex((cell, idx) => idx !== nameFound && CODE_HEADER.test(cell));
      headerIndex = r;
      codeCol = alt >= 0 ? alt : (nameFound === 0 ? 1 : 0);
      break;
    }
  }

  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  const codes: string[] = [];
  for (let r = start; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const candidate = normalizeCode(row[codeCol] ?? row[0]);
    if (!candidate) continue;
    if (headerIndex < 0 && CODE_HEADER.test(candidate)) continue;
    if (headerIndex < 0 && !LOOKS_LIKE_CODE.test(candidate) && row.length > 1) {
      const alt = row.map(normalizeCode).find((cell) => LOOKS_LIKE_CODE.test(cell));
      if (alt) {
        codes.push(alt);
        continue;
      }
    }
    if (CODE_HEADER.test(candidate) || NAME_HEADER.test(candidate)) continue;
    codes.push(candidate);
  }
  return codes;
};

export const extractEmployeeCodesFromText = (text: string): string[] => {
  const cleaned = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  // Paste / mixed delimiters: newlines, commas, semicolons, tabs.
  if (!cleaned.includes('\n') && /[,;\t|]+/.test(cleaned)) {
    return cleaned
      .split(/[,;\t|]+/)
      .map(normalizeCode)
      .filter(Boolean)
      .filter((code) => !CODE_HEADER.test(code));
  }

  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const delimiter = lines.some((line) => line.includes(','))
    ? ','
    : lines.some((line) => line.includes('\t'))
      ? '\t'
      : lines.some((line) => line.includes(';'))
        ? ';'
        : null;

  if (!delimiter) {
    return lines.filter((line) => !CODE_HEADER.test(line));
  }

  const rows = lines.map((line) => (delimiter === ',' ? splitCsvLine(line) : line.split(delimiter).map((cell) => cell.trim())));
  return extractCodesFromRows(rows);
};

export const extractEmployeeCodesFromXlsx = (input: Buffer | ArrayBuffer | Uint8Array): string[] => {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  const entries = readZipEntries(buffer);
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const sheetXml = entries.get(firstSheetPath(entries))!.toString('utf8');
  const grid = parseSheetGrid(sheetXml, shared);

  const cols = new Set<string>();
  const maxRow = Array.from(grid.keys()).reduce((max, key) => {
    const match = /^([A-Z]+)(\d+)$/.exec(key);
    if (!match) return max;
    cols.add(match[1]);
    return Math.max(max, Number(match[2]));
  }, 0);

  const sortedCols = Array.from(cols).sort((a, b) => a.length - b.length || a.localeCompare(b));
  const rows: string[][] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    rows.push(sortedCols.map((col) => normalizeCode(grid.get(`${col}${r}`) || '')));
  }
  return extractCodesFromRows(rows);
};

export type CrewUploadMatchResult = {
  matchedCodes: string[];
  unmatchedCodes: string[];
  duplicateCodes: string[];
  uploadedCount: number;
};

export const matchCrewUploadCodes = (
  uploadedCodes: string[],
  knownCodes: string[],
): CrewUploadMatchResult => {
  const knownByUpper = new Map(knownCodes.map((code) => [code.toUpperCase(), code]));
  const matched: string[] = [];
  const unmatched: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const raw of uploadedCodes) {
    const code = normalizeCode(raw);
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) {
      duplicates.push(code);
      continue;
    }
    seen.add(key);
    const known = knownByUpper.get(key);
    if (known) matched.push(known);
    else unmatched.push(code);
  }

  return {
    matchedCodes: matched,
    unmatchedCodes: unmatched,
    duplicateCodes: duplicates,
    uploadedCount: seen.size + duplicates.length,
  };
};

export const crewMobilizationUploadTemplateCsv = () =>
  ['Employee Code', 'C2225', 'P0425'].join('\n');
