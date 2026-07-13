export type AssetRegisterRow = {
  sourceAssetId: string;
  assetTag: string;
  serialNumber: string | null;
  model: string;
  manufacturer: string | null;
  assetType: string;
  category: string;
  subCategory: string;
  department: string | null;
  location: string | null;
  assignedEmployeeName: string | null;
  assignedEmail: string | null;
  registerStatus: string;
  status: string;
  pmStatus: string | null;
  nextPmDue: string | null;
  assetCondition: string | null;
  operatingSystem: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiry: string | null;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
};

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const cleanNullable = (value: unknown, max = 200) => {
  const text = clean(value, max);
  return text || null;
};

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
  return cells;
};

const normalizeDate = (value: string | null | undefined) => {
  const text = cleanNullable(value, 40);
  if (!text) return null;
  if (text.startsWith('1970-01-01')) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const mapTypeToCategory = (type: string) => {
  const value = type.toUpperCase();
  if (value === 'LAPTOP') return { category: 'Laptop', subCategory: 'Laptop' };
  if (value === 'DESKTOP') return { category: 'Desktop', subCategory: 'Desktop' };
  if (value === 'MONITOR') return { category: 'Desktop', subCategory: 'Monitor' };
  if (value === 'PRINTER') return { category: 'Printer', subCategory: 'Printer' };
  if (value === 'SERVER') return { category: 'Server', subCategory: 'Server' };
  if (value === 'UPS') return { category: 'Other', subCategory: 'UPS' };
  if (value === 'MOUSE' || value === 'KEYBOARD') return { category: 'Other', subCategory: value[0] + value.slice(1).toLowerCase() };
  if (value === 'NETWORK') return { category: 'Network', subCategory: 'Network' };
  return { category: 'Other', subCategory: value || 'Other' };
};

const mapRegisterStatus = (status: string, assignedTo: string | null) => {
  const value = status.toUpperCase();
  if (value === 'IDLE' || value === 'IN STORE' || value === 'NOT IN USE') return assignedTo ? 'Active' : 'In Stock';
  if (value === 'IN USE') return 'Active';
  if (value === 'INACTIVE' || value === 'RETIRED' || value === 'SCRAP') return 'Retired';
  if (value === 'UNDER MAINTENANCE') return 'Under Maintenance';
  return 'Active';
};

export const parseAssetRegisterCsv = (csvText: string): AssetRegisterRow[] => {
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const indexOf = (name: string) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
  const get = (cells: string[], name: string) => {
    const index = indexOf(name);
    return index >= 0 ? cleanNullable(cells[index], 4000) : null;
  };

  const rows: AssetRegisterRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    if (!cells.some((cell) => cell.trim())) continue;

    const sourceAssetId = clean(get(cells, 'Asset ID') || get(cells, 'Asset Tag'), 40);
    const assetTag = clean(get(cells, 'Asset Tag') || sourceAssetId, 40);
    if (!sourceAssetId && !assetTag) continue;

    const type = clean(get(cells, 'Type') || 'OTHER', 40).toUpperCase();
    const { category, subCategory } = mapTypeToCategory(type);
    const assignedEmployeeName = cleanNullable(get(cells, 'Assigned To'), 220);
    const registerStatus = clean(get(cells, 'Status') || 'IN USE', 40).toUpperCase();
    const model = clean(get(cells, 'Model') || assetTag, 200);

    rows.push({
      sourceAssetId: sourceAssetId || assetTag,
      assetTag,
      serialNumber: cleanNullable(get(cells, 'Serial Number'), 120),
      model,
      manufacturer: cleanNullable(get(cells, 'Manufacturer') || get(cells, 'Brand'), 120),
      assetType: 'Hardware',
      category,
      subCategory,
      department: cleanNullable(get(cells, 'Department'), 180),
      location: cleanNullable(get(cells, 'Location'), 180),
      assignedEmployeeName,
      assignedEmail: cleanNullable(get(cells, 'Assigned Email'), 180),
      registerStatus,
      status: mapRegisterStatus(registerStatus, assignedEmployeeName),
      pmStatus: cleanNullable(get(cells, 'PM Status'), 40),
      nextPmDue: normalizeDate(get(cells, 'Next PM Due')),
      assetCondition: cleanNullable(get(cells, 'Asset Condition'), 40),
      operatingSystem: cleanNullable(get(cells, 'Operating System'), 80),
      purchaseDate: normalizeDate(get(cells, 'Purchase Date')),
      purchaseCost: (() => {
        const raw = cleanNullable(get(cells, 'Purchase Price') || get(cells, 'Purchase Cost'), 40);
        if (!raw) return null;
        const n = Number(raw.replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
      })(),
      warrantyExpiry: normalizeDate(get(cells, 'Warranty Expiry')),
      lastMaintenanceDate: normalizeDate(get(cells, 'Last Maintenance Date')),
      nextMaintenanceDate: normalizeDate(get(cells, 'Next Maintenance Date')),
      notes: cleanNullable(get(cells, 'Notes'), 4000),
      createdAt: normalizeDate(get(cells, 'Created At')),
      updatedAt: normalizeDate(get(cells, 'Updated At')),
      createdBy: cleanNullable(get(cells, 'Created By'), 120),
      updatedBy: cleanNullable(get(cells, 'Updated By'), 120),
    });
  }

  return rows;
};
