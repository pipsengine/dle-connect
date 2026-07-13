import type { ItAssetRecord } from '@/lib/it-asset-management-store';

export const MAINTENANCE_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const MAINTENANCE_TYPES = ['Preventive maintenance', 'Corrective maintenance', 'Inspection', 'Software update', 'Hardware repair'] as const;
export const MAINTENANCE_CATEGORIES = ['Hardware', 'Software', 'Network', 'Printer', 'Facility', 'Other'] as const;
export const MAINTENANCE_SCOPES = ['individual', 'department', 'location'] as const;
export const MAINTENANCE_INTENTS = ['plan', 'schedule', 'perform'] as const;
export const MAINTENANCE_STATUS_FILTERS = ['Planned', 'Upcoming', 'Overdue', 'In Progress', 'Completed'] as const;

export type MaintenanceScope = (typeof MAINTENANCE_SCOPES)[number];
export type MaintenanceIntent = (typeof MAINTENANCE_INTENTS)[number];
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export const deriveMaintenanceStatus = (scheduledDate: string | null, explicitStatus?: string) => {
  if (explicitStatus === 'Planned' || explicitStatus === 'Completed' || explicitStatus === 'Cancelled' || explicitStatus === 'In Progress') {
    return explicitStatus;
  }
  if (!scheduledDate) return explicitStatus || 'Upcoming';
  const today = new Date().toISOString().slice(0, 10);
  if (scheduledDate < today) return 'Overdue';
  if (scheduledDate === today) return explicitStatus === 'In Progress' ? 'In Progress' : 'Upcoming';
  return explicitStatus || 'Upcoming';
};

export const maintenanceStatusClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'overdue') return 'font-semibold text-rose-700';
  if (value === 'completed') return 'font-semibold text-emerald-700';
  if (value === 'in progress') return 'font-semibold text-amber-700';
  if (value === 'planned') return 'font-semibold text-blue-700';
  if (value === 'cancelled') return 'font-semibold text-slate-500';
  return 'font-semibold text-slate-700';
};

export const buildMaintenanceTitle = (type: string, assetName: string) => {
  const label = type.trim() || 'Preventive maintenance';
  const asset = assetName.trim();
  if (!asset) return label;
  if (label.toLowerCase().includes(asset.toLowerCase())) return label;
  return `${label} - ${asset}`;
};

export const maintenanceIntentLabel = (intent: MaintenanceIntent) => {
  if (intent === 'plan') return 'Plan';
  if (intent === 'perform') return 'Perform';
  return 'Schedule';
};

export const maintenanceScopeLabel = (scope: MaintenanceScope) => {
  if (scope === 'department') return 'By department';
  if (scope === 'location') return 'By location';
  return 'Individual asset';
};

export const uniqueAssetDepartments = (assets: ItAssetRecord[]) => {
  const values = new Set<string>();
  assets.forEach((asset) => {
    const department = (asset.department || '').trim();
    if (department) values.add(department);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
};

export const uniqueAssetLocations = (assets: ItAssetRecord[]) => {
  const values = new Set<string>();
  assets.forEach((asset) => {
    const location = (asset.location || '').trim();
    if (location) values.add(location);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
};

export const assetsForMaintenanceScope = (
  assets: ItAssetRecord[],
  scope: MaintenanceScope,
  options: { assetId?: string; department?: string; location?: string; onlyPmDue?: boolean },
) => {
  let rows = assets.filter((asset) => asset.assetType === 'Hardware');
  if (scope === 'individual') {
    if (!options.assetId) return [];
    rows = rows.filter((asset) => asset.assetId === options.assetId);
  } else if (scope === 'department') {
    if (!options.department?.trim()) return [];
    const department = options.department.trim().toLowerCase();
    rows = rows.filter((asset) => (asset.department || '').trim().toLowerCase() === department);
  } else if (scope === 'location') {
    if (!options.location?.trim()) return [];
    const location = options.location.trim().toLowerCase();
    rows = rows.filter((asset) => (asset.location || '').trim().toLowerCase() === location);
  }
  if (options.onlyPmDue) {
    rows = rows.filter((asset) => asset.pmStatus === 'OVERDUE' || asset.pmStatus === 'DUE');
  }
  return rows;
};

export const maintenanceIntentStatus = (intent: MaintenanceIntent, scheduledDate: string | null) => {
  if (intent === 'plan') return 'Planned';
  if (intent === 'perform') return 'In Progress';
  return deriveMaintenanceStatus(scheduledDate, 'Upcoming');
};

export type ScheduleModalPreset = 'default' | 'work-order' | 'bulk-schedule' | 'service-request';

type PresetConfig = {
  title: string;
  description: string;
  scope: MaintenanceScope;
  intent: MaintenanceIntent;
  maintenanceType: string;
  priority: string;
  showIntentPicker: boolean;
  showScopePicker: boolean;
  allowedScopes: MaintenanceScope[];
  showPmDueFilter: boolean;
  requireNotes: boolean;
  submitVerb: string;
};

export const SCHEDULE_MODAL_PRESETS: Record<ScheduleModalPreset, PresetConfig> = {
  default: {
    title: 'Plan & Schedule Maintenance',
    description: 'Create maintenance records individually or across departments and locations.',
    scope: 'individual',
    intent: 'schedule',
    maintenanceType: 'Preventive maintenance',
    priority: 'Medium',
    showIntentPicker: true,
    showScopePicker: true,
    allowedScopes: ['individual', 'department', 'location'],
    showPmDueFilter: true,
    requireNotes: false,
    submitVerb: 'Save maintenance',
  },
  'work-order': {
    title: 'Create Work Order',
    description: 'Start immediate maintenance for an individual asset, entire department, or location.',
    scope: 'individual',
    intent: 'perform',
    maintenanceType: 'Preventive maintenance',
    priority: 'High',
    showIntentPicker: false,
    showScopePicker: true,
    allowedScopes: ['individual', 'department', 'location'],
    showPmDueFilter: true,
    requireNotes: false,
    submitVerb: 'Create work order',
  },
  'bulk-schedule': {
    title: 'Bulk Schedule',
    description: 'Schedule maintenance for all assets in a department or location.',
    scope: 'department',
    intent: 'schedule',
    maintenanceType: 'Preventive maintenance',
    priority: 'Medium',
    showIntentPicker: false,
    showScopePicker: true,
    allowedScopes: ['department', 'location'],
    showPmDueFilter: true,
    requireNotes: false,
    submitVerb: 'Schedule maintenance',
  },
  'service-request': {
    title: 'Service Request',
    description: 'Log corrective maintenance for an asset, department, or location.',
    scope: 'individual',
    intent: 'plan',
    maintenanceType: 'Corrective maintenance',
    priority: 'High',
    showIntentPicker: true,
    showScopePicker: true,
    allowedScopes: ['individual', 'department', 'location'],
    showPmDueFilter: true,
    requireNotes: true,
    submitVerb: 'Submit service request',
  },
};
