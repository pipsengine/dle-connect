import { consolidatePrImportLines, parseCsvGrid, parsePrImportGrid, parsePrImportText, type PrImportResult } from '@/lib/procurement/pr-line-import';

const asCell = (value: unknown) => {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value);
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
    let XLSX: typeof import('xlsx');
    try {
      const mod = await import('xlsx');
      XLSX = ((mod as { default?: typeof import('xlsx') }).default || mod) as typeof import('xlsx');
    } catch {
      throw new Error('Excel (.xls / .xlsx) import is not available. Save the MTO as CSV, or install the xlsx package.');
    }
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The workbook has no sheets to import.');
    const sheet = workbook.Sheets[sheetName];
    const rows = (XLSX.utils.sheet_to_json<(unknown[] | null)>(sheet, {
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
