import { createRequire } from 'node:module';
import path from 'node:path';
import { consolidatePrImportLines, parseCsvGrid, parsePrImportGrid, parsePrImportText, type PrImportResult } from '@/lib/procurement/pr-line-import';

type XlsxLike = {
  read: (data: Buffer, opts?: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: (sheet: unknown, opts?: Record<string, unknown>) => unknown[];
  };
};

const asCell = (value: unknown) => {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value);
};

const loadXlsx = (): XlsxLike => {
  try {
    const require = createRequire(path.join(process.cwd(), 'package.json'));
    const moduleName = 'xlsx';
    return require(moduleName) as XlsxLike;
  } catch {
    throw new Error('Excel (.xls / .xlsx) import is not available on this server. Save the MTO as CSV, or run npm install so the xlsx package is present.');
  }
};

export const parsePrImportWorkbook = async (
  fileName: string,
  buffer: Buffer,
  consolidate = false,
): Promise<PrImportResult> => {
  const name = String(fileName || '').toLowerCase();
  let result: PrImportResult;
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    result = parsePrImportText(buffer.toString('utf8'));
  } else {
    const XLSX = loadXlsx();
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The workbook has no sheets to import.');
    const sheet = workbook.Sheets[sheetName];
    const rows = (XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    }) || []) as unknown[][];
    const grid = rows.map((row) => (Array.isArray(row) ? row.map(asCell) : []));
    result = parsePrImportGrid(grid.length ? grid : parseCsvGrid(buffer.toString('utf8')));
  }

  if (!result.lines.length) {
    throw new Error('No line items were found in that file. Check the Qty column and skip total / note rows.');
  }

  if (!consolidate) return result;
  const original = result.lines.length;
  return {
    lines: consolidatePrImportLines(result.lines),
    meta: { ...result.meta, consolidatedFrom: original },
  };
};
