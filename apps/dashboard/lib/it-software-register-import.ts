export type SoftwareRegisterRow = {
  sn: string;
  productName: string;
  purchaseDate: string | null;
  quantityLabel: string;
  seatsTotal: number;
  expiryDate: string | null;
  remark: string;
  vendorName: string;
  renewalPriceUsd: number | null;
  renewalPriceNgn: number | null;
  annualCostNgn: number | null;
  licenseType: string;
  complianceStatus: string;
  category: string;
  edition: string | null;
};

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
};

const parseNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const raw = String(value).replace(/,/g, '').trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const parseDate = (value: unknown): string | null => {
  const raw = clean(value, 40);
  if (!raw) return null;
  if (/^permanent$/i.test(raw)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const USD_TO_NGN = 1600;

const inferCategory = (productName: string) => {
  const value = productName.toLowerCase();
  if (value.includes('office') || value.includes('microsoft 365') || value.includes('adobe')) return 'Productivity';
  if (value.includes('sage') || value.includes('erp') || value.includes('crm')) return 'Business Systems';
  if (value.includes('autocad') || value.includes('autodesk') || value.includes('solidworks') || value.includes('tekla') || value.includes('bentley') || value.includes('pv elite')) return 'Engineering';
  if (value.includes('eset') || value.includes('endpoint')) return 'Security';
  if (value.includes('hosting') || value.includes('storage') || value.includes('server')) return 'Infrastructure';
  return 'Software';
};

const parseSeats = (quantity: unknown): { seatsTotal: number; quantityLabel: string; licenseTypeHint?: string } => {
  const label = clean(quantity, 40);
  if (!label) return { seatsTotal: 0, quantityLabel: '' };
  if (/tb|gb|storage/i.test(label)) {
    const num = parseNumber(label.replace(/[^\d.]/g, ''));
    return { seatsTotal: num && num > 0 ? 1 : 1, quantityLabel: label, licenseTypeHint: 'Storage' };
  }
  const num = parseNumber(label);
  return { seatsTotal: Math.max(0, Math.round(num || 0)), quantityLabel: label };
};

const complianceFrom = (remark: string, expiryDate: string | null, isPermanent: boolean) => {
  if (isPermanent) return 'In Compliance';
  const note = remark.toLowerCase();
  if (note.includes('expired') || note.includes('lapsed')) return 'Non-Compliant';
  if (expiryDate) {
    const expiry = new Date(`${expiryDate}T00:00:00Z`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() < today.getTime()) return 'Expired';
    const in90 = new Date(today);
    in90.setDate(in90.getDate() + 90);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= in90.getTime()) return 'Expiring Soon';
  }
  if (note.includes('valid') || note.includes('active')) return 'In Compliance';
  return clean(remark, 40) || 'In Compliance';
};

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/\n/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const HEADER_ALIASES: Record<string, keyof SoftwareRegisterRow | 'ignored'> = {
  sn: 'sn',
  s_n: 'sn',
  software: 'productName',
  product: 'productName',
  product_name: 'productName',
  date_of_purchase: 'purchaseDate',
  purchase_date: 'purchaseDate',
  quantity_users: 'quantityLabel',
  quantity: 'quantityLabel',
  users: 'quantityLabel',
  expiring_date: 'expiryDate',
  expiry_date: 'expiryDate',
  remark: 'remark',
  status: 'remark',
  vendor: 'vendorName',
  vendor_name: 'vendorName',
  renewal_price_usd: 'renewalPriceUsd',
  last_renewal_price: 'renewalPriceUsd',
  renewal_price_ngn: 'renewalPriceNgn',
  last_renewal_price_n: 'renewalPriceNgn',
};

export const parseSoftwareRegisterCsv = (csvText: string): SoftwareRegisterRow[] => {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const index: Partial<Record<keyof SoftwareRegisterRow, number>> = {};
  headers.forEach((header, idx) => {
    const mapped = HEADER_ALIASES[header];
    if (mapped && mapped !== 'ignored') index[mapped] = idx;
  });

  // Support Excel-exported header row that may not match aliases exactly
  if (index.productName == null) {
    const softwareIdx = headers.findIndex((h) => h.includes('software') || h.includes('product'));
    if (softwareIdx >= 0) index.productName = softwareIdx;
  }

  const rows: SoftwareRegisterRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const productName = clean(index.productName != null ? cells[index.productName] : '', 200);
    if (!productName || /^s\/?n$/i.test(productName) || /^software$/i.test(productName)) continue;

    const quantityRaw = index.quantityLabel != null ? cells[index.quantityLabel] : '';
    const seats = parseSeats(quantityRaw);
    const expiryRaw = index.expiryDate != null ? cells[index.expiryDate] : '';
    const isPermanent = /^permanent$/i.test(clean(expiryRaw, 40));
    const expiryDate = isPermanent ? null : parseDate(expiryRaw);
    const remark = clean(index.remark != null ? cells[index.remark] : '', 80);
    const usd = parseNumber(index.renewalPriceUsd != null ? cells[index.renewalPriceUsd] : null);
    const ngn = parseNumber(index.renewalPriceNgn != null ? cells[index.renewalPriceNgn] : null);
    const annualCostNgn = ngn != null && ngn > 0 ? ngn : usd != null && usd > 0 ? Math.round(usd * USD_TO_NGN) : usd === 0 ? 0 : null;

    rows.push({
      sn: clean(index.sn != null ? cells[index.sn] : String(i), 20),
      productName,
      purchaseDate: parseDate(index.purchaseDate != null ? cells[index.purchaseDate] : null),
      quantityLabel: seats.quantityLabel,
      seatsTotal: seats.seatsTotal,
      expiryDate,
      remark,
      vendorName: clean(index.vendorName != null ? cells[index.vendorName] : '', 180),
      renewalPriceUsd: usd,
      renewalPriceNgn: ngn,
      annualCostNgn,
      licenseType: isPermanent ? 'Perpetual' : seats.licenseTypeHint || 'Subscription',
      complianceStatus: complianceFrom(remark, expiryDate, isPermanent),
      category: inferCategory(productName),
      edition: seats.quantityLabel && /tb|gb/i.test(seats.quantityLabel) ? seats.quantityLabel : null,
    });
  }
  return rows;
};
