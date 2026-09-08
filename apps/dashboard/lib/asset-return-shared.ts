/**
 * Client-safe Asset Return types + helpers.
 * Do not import server/mssql modules from here.
 */

export type AssetLineStatus = 'Outstanding' | 'Returned' | 'Waived' | 'Recovered';

export type AssetReturnCaseStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Blocked';

export type AssetReturnLine = {
  id: string;
  assetType: string;
  tagOrSerial: string;
  condition: string;
  status: AssetLineStatus;
  note?: string | null;
  returnedAt?: string | null;
  returnedBy?: string | null;
};

export type AssetReturnCase = {
  id: string;
  period: string;
  resignationId: string;
  resignationReference: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  position: string;
  managerName: string;
  resignationDate: string | null;
  lastWorkingDay: string | null;
  resignationStatus: string;
  status: AssetReturnCaseStatus;
  completionPct: number;
  outstandingCount: number;
  assets: AssetReturnLine[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type OffboardingModuleKpi = {
  id: string;
  label: string;
  value: number;
  display: string;
  deltaLabel: string;
  tone: 'blue' | 'amber' | 'mint' | 'purple' | 'rose' | 'green';
};

export type AssetReturnPayload = {
  generatedAt: string;
  period: string;
  periodLabel: string;
  cases: AssetReturnCase[];
  kpis: OffboardingModuleKpi[];
  tabCounts: Record<string, number>;
  selectedId: string | null;
  selected: AssetReturnCase | null;
  filterOptions: {
    departments: string[];
    statuses: AssetReturnCaseStatus[];
  };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatAssetReturnDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const assetReturnPct = (assets: AssetReturnLine[]) => {
  if (!assets.length) return 100;
  const closed = assets.filter((item) => item.status !== 'Outstanding').length;
  return Math.round((closed / assets.length) * 100);
};

export const assetOutstandingCount = (assets: AssetReturnLine[]) =>
  assets.filter((item) => item.status === 'Outstanding').length;

export const assetReturnResignationHref = (row: Pick<AssetReturnCase, 'resignationId' | 'period'>) =>
  `/hris/offboarding/resignation-management?id=${encodeURIComponent(row.resignationId)}&period=${encodeURIComponent(row.period)}`;

export const assetReturnClearanceHref = (row: Pick<AssetReturnCase, 'employeeCode'>) =>
  `/hris/offboarding/exit-clearance?employeeCode=${encodeURIComponent(row.employeeCode)}`;

export const DEFAULT_ASSET_LINES: Omit<AssetReturnLine, 'status' | 'returnedAt' | 'returnedBy'>[] = [
  { id: 'laptop', assetType: 'Laptop', tagOrSerial: 'TBD', condition: 'Good', note: null },
  { id: 'phone', assetType: 'Mobile Phone', tagOrSerial: 'TBD', condition: 'Good', note: null },
  { id: 'idcard', assetType: 'Staff ID Card', tagOrSerial: 'TBD', condition: 'Good', note: null },
  { id: 'access', assetType: 'Access Card / Fob', tagOrSerial: 'TBD', condition: 'Good', note: null },
  { id: 'other', assetType: 'Other company property', tagOrSerial: '—', condition: 'N/A', note: null },
];
