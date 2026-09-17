import type { ProcLineItem } from '@/lib/procurement/catalog';

export type PrImportAttachmentHint = {
  suggestedTitle?: string;
  suggestedProject?: string;
  source: 'mto' | 'template' | 'generic';
  skipped: number;
  consolidatedFrom?: number;
};

export type PrImportResult = {
  lines: ProcLineItem[];
  meta: PrImportAttachmentHint;
};

const compact = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const lower = (value: unknown) => compact(value).toLowerCase();
const isNumeric = (value: unknown) => /^-?\d+(\.\d+)?$/.test(compact(value).replace(/,/g, ''));
const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(compact(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

const newLine = (partial: Partial<ProcLineItem>): ProcLineItem => ({
  id: `line-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
  description: compact(partial.description),
  specification: compact(partial.specification) || undefined,
  quantity: Number(partial.quantity ?? partial.qty ?? 1) || 1,
  uom: compact(partial.uom) || 'PCS',
  unitPrice: Number(partial.unitPrice ?? partial.unitEstimate ?? 0) || 0,
  taxRate: Number(partial.taxRate ?? 0) || 0,
  requiredDate: compact(partial.requiredDate) || undefined,
  itemCode: compact(partial.itemCode) || undefined,
});

export const parseCsvGrid = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const raw = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && raw[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => compact(cell))) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => compact(cell))) rows.push(row);
  }
  return rows;
};

const headerIndex = (headers: string[], aliases: string[]) => {
  const normalized = headers.map((h) => lower(h).replace(/[^a-z0-9]+/g, ' ').trim());
  for (const alias of aliases) {
    const needle = alias.replace(/[^a-z0-9]+/g, ' ').trim();
    const idx = normalized.findIndex((h) => h === needle || h.includes(needle));
    if (idx >= 0) return idx;
  }
  return -1;
};

const isSkipRow = (cells: string[]) => {
  const joined = lower(cells.join(' '));
  if (!joined) return true;
  if (/sub total|grand total|frame \d|frame total|^total$/.test(joined)) return true;
  if (/prepared by|checked by|approved by|material spec used|mtcs are required|qhse/.test(joined)) return true;
  if (/material take off|project title|doc\.?\s*no|rev:/.test(joined)) return true;
  return false;
};

const isSectionRow = (sno: string, desc: string, qty: string) =>
  /^[a-z]$/i.test(sno) && Boolean(desc) && !qty;

const parseMtoGrid = (rows: string[][]): PrImportResult => {
  const headerAt = rows.findIndex((row) => /item description/i.test(row.join(' ')) && /qty/i.test(row.join(' ')));
  const start = headerAt >= 0 ? headerAt + 1 : 0;
  const header = headerAt >= 0 ? rows[headerAt] : [];
  const descIdx = headerIndex(header, ['item description', 'description']) >= 0
    ? headerIndex(header, ['item description', 'description'])
    : 1;
  const specIdx = headerIndex(header, ['material specification', 'specification', 'spec']);
  const qtyIdx = headerIndex(header, ['qty', 'quantity']);
  const lenIdx = headerIndex(header, ['total lenght', 'total length']);
  const wtIdx = headerIndex(header, ['total weight']);
  const snoIdx = headerIndex(header, ['s no', 's/no', 'sn']);

  let section = '';
  let skipped = 0;
  const lines: ProcLineItem[] = [];
  let suggestedTitle = '';
  let suggestedProject = '';

  for (const row of rows) {
    const text = compact(row.join(' '));
    if (/project title\s*:/i.test(text)) suggestedProject = compact(text.replace(/.*project title\s*:/i, '').split(/job no/i)[0]);
    if (/doc\.?\s*no\s*:/i.test(text)) suggestedTitle = compact(text.replace(/.*doc\.?\s*no\s*:/i, ''));
  }

  for (const row of rows.slice(start)) {
    const sno = compact(row[snoIdx >= 0 ? snoIdx : 0]);
    const desc = compact(row[descIdx >= 0 ? descIdx : 1]);
    const spec = specIdx >= 0 ? compact(row[specIdx]) : compact(row[2]);
    const qty = qtyIdx >= 0 ? compact(row[qtyIdx]) : compact(row[3]);
    if (isSkipRow(row)) {
      skipped += 1;
      continue;
    }
    if (isSectionRow(sno, desc, qty) || (!sno && desc && !qty && desc === desc.toUpperCase() && desc.length < 40)) {
      section = [sno, desc].filter(Boolean).join(' ');
      continue;
    }
    if (!desc || !isNumeric(sno)) {
      if (desc && !isNumeric(qty)) skipped += 1;
      continue;
    }
    const quantity = toNumber(qty, 0);
    if (quantity <= 0) {
      skipped += 1;
      continue;
    }
    const totLen = lenIdx >= 0 ? compact(row[lenIdx]) : compact(row[6]);
    const totWt = wtIdx >= 0 ? compact(row[wtIdx]) : compact(row[7]);
    const details = [
      spec ? `Spec ${spec}` : '',
      totLen ? `${totLen} m` : '',
      totWt ? `${totWt} kg` : '',
      section ? section : '',
    ].filter(Boolean);
    lines.push(newLine({
      description: details.length ? `${desc} — ${details.join(' · ')}` : desc,
      specification: spec || section || undefined,
      quantity,
      uom: 'PCS',
      itemCode: sno,
    }));
  }

  return {
    lines,
    meta: {
      source: 'mto',
      skipped,
      suggestedTitle: suggestedTitle || suggestedProject || undefined,
      suggestedProject: suggestedProject || undefined,
    },
  };
};

const parseHeaderMapped = (rows: string[][]): PrImportResult | null => {
  const headerAt = rows.findIndex((row) =>
    row.some((cell) => /description|item/i.test(compact(cell))) && row.some((cell) => /qty|quantity/i.test(compact(cell))),
  );
  if (headerAt < 0) return null;
  const header = rows[headerAt];
  const descIdx = headerIndex(header, ['item description', 'description / specification', 'description']);
  const qtyIdx = headerIndex(header, ['qty', 'quantity']);
  const uomIdx = headerIndex(header, ['uom', 'unit']);
  const priceIdx = headerIndex(header, ['unit price', 'unit estimate', 'price']);
  const taxIdx = headerIndex(header, ['tax %', 'tax']);
  const dateIdx = headerIndex(header, ['expected date', 'required', 'required date']);
  const specIdx = headerIndex(header, ['scope / note', 'specification', 'module']);
  if (descIdx < 0 || qtyIdx < 0) return null;

  const lines: ProcLineItem[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerAt + 1)) {
    const description = compact(row[descIdx]);
    if (!description) {
      skipped += 1;
      continue;
    }
    if (isSkipRow(row)) {
      skipped += 1;
      continue;
    }
    const spec = specIdx >= 0 ? compact(row[specIdx]) : '';
    lines.push(newLine({
      description: spec && !/module/i.test(compact(header[specIdx] || '')) ? `${description}${spec ? ` — ${spec}` : ''}` : description,
      specification: spec || undefined,
      quantity: toNumber(row[qtyIdx], 1),
      uom: uomIdx >= 0 ? compact(row[uomIdx]) || 'EA' : 'EA',
      unitPrice: priceIdx >= 0 ? toNumber(row[priceIdx]) : 0,
      taxRate: taxIdx >= 0 ? toNumber(row[taxIdx]) : 0,
      requiredDate: dateIdx >= 0 ? compact(row[dateIdx]) : undefined,
      itemCode: specIdx >= 0 && /module/i.test(compact(header[specIdx] || '')) ? spec : undefined,
    }));
  }
  return { lines, meta: { source: 'template', skipped } };
};

export const consolidatePrImportLines = (lines: ProcLineItem[]): ProcLineItem[] => {
  const grouped = new Map<string, ProcLineItem>();
  for (const line of lines) {
    const base = compact(line.description).split(' — ')[0];
    const key = `${lower(base)}|${lower(line.specification)}|${lower(line.uom)}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...line,
        id: newLine({}).id,
        description: line.specification ? `${base} — Spec ${line.specification}` : base,
      });
      continue;
    }
    existing.quantity = Number(existing.quantity || 0) + Number(line.quantity || 0);
  }
  return [...grouped.values()];
};

export const parsePrImportGrid = (rows: string[][]): PrImportResult => {
  const blob = lower(rows.slice(0, 25).map((row) => row.join(' ')).join(' '));
  if (/material take off|\bmto\b/.test(blob) || (/item description/.test(blob) && /material specification/.test(blob))) {
    return parseMtoGrid(rows);
  }
  const mapped = parseHeaderMapped(rows);
  if (mapped?.lines.length) return mapped;
  const lines = rows
    .filter((row) => compact(row[0]) && !isSkipRow(row) && !/description/i.test(compact(row[0])))
    .map((row) => newLine({
      description: compact(row[0]),
      quantity: toNumber(row[1], 1),
      uom: compact(row[2]) || 'EA',
      unitPrice: toNumber(row[3]),
      taxRate: toNumber(row[4]),
      requiredDate: compact(row[5]) || undefined,
    }));
  return { lines, meta: { source: 'generic', skipped: Math.max(0, rows.length - lines.length) } };
};

export const parsePrImportText = (text: string): PrImportResult => parsePrImportGrid(parseCsvGrid(text));

export const prLineImportTemplateCsv = () =>
  [
    ['Item Description', 'UOM', 'Qty', 'Unit Price', 'Tax %', 'Required Date', 'Specification'],
    ['6-inch ANSI 300 Gate Valve', 'PCS', '12', '', '', '', 'Urgent — required on site'],
  ]
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\r\n');
