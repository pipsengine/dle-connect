export type HardwareTypeOption = {
  label: string;
  category: string;
  subCategory: string;
};

export const HARDWARE_TYPE_OPTIONS: HardwareTypeOption[] = [
  { label: 'Laptop', category: 'Laptop', subCategory: 'Laptop' },
  { label: 'Desktop', category: 'Desktop', subCategory: 'Desktop' },
  { label: 'Monitor', category: 'Desktop', subCategory: 'Monitor' },
  { label: 'Printer', category: 'Printer', subCategory: 'Printer' },
  { label: 'Server', category: 'Server', subCategory: 'Server' },
  { label: 'Router', category: 'Network', subCategory: 'Router' },
  { label: 'Switch', category: 'Network', subCategory: 'Switch' },
  { label: 'Firewall', category: 'Network', subCategory: 'Firewall' },
  { label: 'Storage', category: 'Server', subCategory: 'Storage' },
  { label: 'Mobile Device', category: 'Phone', subCategory: 'Mobile' },
  { label: 'UPS', category: 'Other', subCategory: 'UPS' },
  { label: 'Other', category: 'Other', subCategory: 'Other' },
];

export const REGISTER_STATUS_OPTIONS = ['IN USE', 'IDLE', 'IN STORE', 'NOT IN USE', 'UNDER MAINTENANCE', 'RETIRED', 'SCRAP'] as const;
export const PM_STATUS_OPTIONS = ['NONE', 'DUE', 'OVERDUE', 'SCHEDULED'] as const;
export const ASSET_CONDITION_OPTIONS = ['GOOD', 'FAIR', 'POOR', 'FAULTY'] as const;
export const LOCATION_SUGGESTIONS = ['IDI ORO', 'PORT HARCOURT', 'LAGOS', 'AGEGE', 'ABUJA'] as const;

export const deriveAssetStatus = (registerStatus: string, assignedName: string | null) => {
  const value = registerStatus.trim().toUpperCase();
  if (value === 'IDLE' || value === 'IN STORE' || value === 'NOT IN USE') return assignedName ? 'Active' : 'In Stock';
  if (value === 'IN USE') return 'Active';
  if (value === 'INACTIVE' || value === 'RETIRED' || value === 'SCRAP') return 'Retired';
  if (value === 'UNDER MAINTENANCE') return 'Under Maintenance';
  return 'Active';
};

export const defaultHardwareAssetForm = (defaults?: Partial<{ category: string; subCategory: string }>) => {
  const match = HARDWARE_TYPE_OPTIONS.find(
    (option) => option.category === defaults?.category && option.subCategory === defaults?.subCategory,
  ) || HARDWARE_TYPE_OPTIONS[0];

  return {
    assetTag: '',
    sourceAssetId: '',
    serialNumber: '',
    model: '',
    manufacturer: '',
    typeKey: `${match.category}::${match.subCategory}`,
    department: '',
    location: '',
    assignedEmployeeId: '',
    assignedEmployeeName: '',
    assignedEmail: '',
    registerStatus: 'IN USE' as typeof REGISTER_STATUS_OPTIONS[number],
    pmStatus: 'NONE' as typeof PM_STATUS_OPTIONS[number],
    nextPmDue: '',
    assetCondition: 'GOOD' as typeof ASSET_CONDITION_OPTIONS[number],
    operatingSystem: '',
    purchaseDate: '',
    purchaseCost: '',
    warrantyExpiry: '',
    notes: '',
  };
};

export type HardwareAssetFormState = ReturnType<typeof defaultHardwareAssetForm>;

export const resolveHardwareType = (typeKey: string) => {
  const [category, subCategory] = typeKey.split('::');
  const match = HARDWARE_TYPE_OPTIONS.find((option) => option.category === category && option.subCategory === subCategory);
  return match || HARDWARE_TYPE_OPTIONS[0];
};

const normalizeRegisterStatus = (value: string | null | undefined) => {
  const text = String(value || '').trim().toUpperCase();
  if (REGISTER_STATUS_OPTIONS.includes(text as typeof REGISTER_STATUS_OPTIONS[number])) {
    return text as typeof REGISTER_STATUS_OPTIONS[number];
  }
  if (text === 'ACTIVE' || text === 'IN STOCK') return 'IN USE';
  if (text === 'RETIRED') return 'RETIRED';
  if (text === 'UNDER MAINTENANCE') return 'UNDER MAINTENANCE';
  return 'IN USE';
};

const normalizePmStatus = (value: string | null | undefined) => {
  const text = String(value || 'NONE').trim().toUpperCase();
  return PM_STATUS_OPTIONS.includes(text as typeof PM_STATUS_OPTIONS[number])
    ? text as typeof PM_STATUS_OPTIONS[number]
    : 'NONE';
};

const normalizeCondition = (value: string | null | undefined) => {
  const text = String(value || 'GOOD').trim().toUpperCase();
  return ASSET_CONDITION_OPTIONS.includes(text as typeof ASSET_CONDITION_OPTIONS[number])
    ? text as typeof ASSET_CONDITION_OPTIONS[number]
    : 'GOOD';
};

export const hardwareAssetFormFromRecord = (asset: {
  assetTag: string;
  sourceAssetId?: string | null;
  assetId: string;
  serialNumber?: string | null;
  model?: string | null;
  name: string;
  manufacturer?: string | null;
  category: string;
  subCategory?: string | null;
  department?: string | null;
  location?: string | null;
  assignedEmployeeId?: string | null;
  assignedEmployeeName?: string | null;
  assignedEmail?: string | null;
  registerStatus?: string | null;
  status?: string;
  pmStatus?: string | null;
  nextPmDue?: string | null;
  assetCondition?: string | null;
  operatingSystem?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
}): HardwareAssetFormState => {
  const category = asset.category || 'Other';
  const subCategory = asset.subCategory || category;
  const typeKey = `${category}::${subCategory}`;

  return {
    assetTag: asset.assetTag || '',
    sourceAssetId: asset.sourceAssetId || asset.assetId || '',
    serialNumber: asset.serialNumber || '',
    model: asset.model || asset.name || '',
    manufacturer: asset.manufacturer || '',
    typeKey,
    department: asset.department || '',
    location: asset.location || '',
    assignedEmployeeId: asset.assignedEmployeeId || '',
    assignedEmployeeName: asset.assignedEmployeeName || '',
    assignedEmail: asset.assignedEmail || '',
    registerStatus: normalizeRegisterStatus(asset.registerStatus || asset.status),
    pmStatus: normalizePmStatus(asset.pmStatus),
    nextPmDue: asset.nextPmDue || '',
    assetCondition: normalizeCondition(asset.assetCondition),
    operatingSystem: asset.operatingSystem || '',
    purchaseDate: asset.purchaseDate || '',
    purchaseCost: asset.purchaseCost == null ? '' : String(asset.purchaseCost),
    warrantyExpiry: asset.warrantyExpiry || '',
    notes: asset.notes || '',
  };
};

export const hardwareAssetFormToPayload = (
  form: HardwareAssetFormState,
  options?: { preserveAssignedOn?: string | null; isEdit?: boolean },
) => {
  const type = resolveHardwareType(form.typeKey);
  const assignedName = form.assignedEmployeeName.trim() || null;
  const registerStatus = form.registerStatus.trim().toUpperCase();

  return {
    assetId: form.sourceAssetId.trim() || form.assetTag.trim(),
    sourceAssetId: form.sourceAssetId.trim() || form.assetTag.trim(),
    assetTag: form.assetTag.trim(),
    name: form.model.trim(),
    model: form.model.trim(),
    manufacturer: form.manufacturer.trim() || null,
    assetType: 'Hardware',
    category: type.category,
    subCategory: type.subCategory,
    serialNumber: form.serialNumber.trim() || null,
    registerStatus,
    status: deriveAssetStatus(registerStatus, assignedName),
    pmStatus: form.pmStatus || null,
    nextPmDue: form.nextPmDue || null,
    assetCondition: form.assetCondition || null,
    operatingSystem: form.operatingSystem.trim() || null,
    department: form.department.trim() || null,
    location: form.location.trim() || null,
    assignedEmployeeId: form.assignedEmployeeId.trim() || null,
    assignedEmployeeName: assignedName,
    assignedEmail: form.assignedEmail.trim() || null,
    assignedOn: assignedName
      ? (options?.preserveAssignedOn || new Date().toISOString().slice(0, 10))
      : null,
    purchaseDate: form.purchaseDate || null,
    purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : null,
    warrantyExpiry: form.warrantyExpiry || null,
    warrantyStatus: form.pmStatus === 'OVERDUE' ? 'Expiring soon' : 'Good',
    notes: form.notes.trim() || null,
  };
};
