export type EmploymentStatus =
  | 'Active'
  | 'Probation'
  | 'Suspended'
  | 'Terminated'
  | 'Retired'
  | 'Resigned'
  | 'Contract'
  | 'Inactive'
  | string;

export type WorkforceCategory = 'Permanent' | 'Contract' | 'Lumpsum' | 'NYSC' | 'IT Student' | 'Other';

export type DirectoryEmployee = {
  id: string;
  employeeId: string;
  employeeCode?: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  department: string;
  division: string;
  businessUnit: string;
  location: string;
  costCenter?: string;
  employmentType: string;
  employeeCategory?: string;
  staffCategory?: string;
  status: EmploymentStatus;
  managerName?: string;
  yearsOfService: number;
  dateJoined: string;
  createdAt?: string;
  documentCount?: number;
  emergencyContactsComplete?: boolean;
  hasManagerAssigned?: boolean;
};

export type EmployeeDirectoryPayload = {
  source: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  syncedAt: string;
  employees: DirectoryEmployee[];
};

export type ApiResponse<T> = {
  status: 'success' | 'error';
  data?: T;
  error?: string;
};

const text = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const next = String(value).trim();
  return next || fallback;
};

const optionalText = (value: unknown) => text(value) || undefined;

const numberValue = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export const normalizeDirectoryEmployee = (record: Partial<DirectoryEmployee>): DirectoryEmployee => {
  const employeeId = text(record.employeeId || record.employeeCode || record.id, 'Unknown');
  const fullName = text(record.fullName, employeeId);
  return {
    ...record,
    id: text(record.id, employeeId),
    employeeId,
    employeeCode: optionalText(record.employeeCode),
    fullName,
    email: text(record.email, ''),
    phone: text(record.phone, ''),
    jobTitle: text(record.jobTitle, '—'),
    department: text(record.department, 'Unassigned'),
    division: text(record.division, 'Unassigned'),
    businessUnit: text(record.businessUnit, 'Unassigned'),
    location: text(record.location || record.businessUnit, 'Unassigned'),
    costCenter: optionalText(record.costCenter),
    employmentType: text(record.employmentType, 'Unassigned'),
    employeeCategory: optionalText(record.employeeCategory),
    staffCategory: optionalText(record.staffCategory),
    status: text(record.status, 'Active') as EmploymentStatus,
    managerName: optionalText(record.managerName),
    yearsOfService: numberValue(record.yearsOfService),
    dateJoined: text(record.dateJoined, ''),
    createdAt: optionalText(record.createdAt),
    documentCount: numberValue(record.documentCount),
    emergencyContactsComplete: record.emergencyContactsComplete === true,
    hasManagerAssigned: record.hasManagerAssigned === true,
  };
};

export const resolveWorkforceCategory = (employee: Pick<DirectoryEmployee, 'employeeId' | 'employeeCode' | 'employmentType' | 'employeeCategory' | 'staffCategory'>): WorkforceCategory => {
  const code = text(employee.employeeCode || employee.employeeId).toUpperCase();
  const prefix = code.charAt(0);
  if (prefix === 'P') return 'Permanent';
  if (prefix === 'C') return 'Contract';
  if (prefix === 'L') return 'Lumpsum';
  if (prefix === 'N') return 'NYSC';
  if (prefix === 'I') return 'IT Student';

  const blob = `${employee.employmentType} ${employee.employeeCategory || ''} ${employee.staffCategory || ''}`.toLowerCase();
  if (blob.includes('permanent')) return 'Permanent';
  if (blob.includes('lumpsum')) return 'Lumpsum';
  if (blob.includes('nysc')) return 'NYSC';
  if (blob.includes('intern') || blob.includes('it student') || blob.includes('industrial')) return 'IT Student';
  if (blob.includes('contract') || blob.includes('daily rate')) return 'Contract';
  return 'Other';
};

export const categoryStyles: Record<WorkforceCategory, { label: string; bg: string; text: string; dot: string }> = {
  Permanent: { label: 'Permanent', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  Contract: { label: 'Contract', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  Lumpsum: { label: 'Lumpsum', bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  NYSC: { label: 'NYSC', bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  'IT Student': { label: 'IT Student', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  Other: { label: 'Other', bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
};

export const employeeCodeGuide = [
  { category: 'Permanent', range: 'P00001 – P99999' },
  { category: 'Contract', range: 'C00001 – C99999' },
  { category: 'Lumpsum', range: 'L00001 – L99999' },
  { category: 'NYSC', range: 'N00001 – N99999' },
  { category: 'IT Student', range: 'I00001 – I99999' },
];

export const formatNumber = (value: number) => new Intl.NumberFormat('en-GB').format(value);

export const formatPct = (value: number, total: number) => {
  if (!total) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
};

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const formatRelativeTime = (value: string | null | undefined) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
};

export const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const statusTone = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('active') || normalized.includes('confirmed')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (normalized.includes('probation')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (normalized.includes('inactive') || normalized.includes('terminated') || normalized.includes('resigned')) return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};
