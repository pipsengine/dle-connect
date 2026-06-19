'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowDownUp,
  ArrowUpAZ,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Download,
  Eye,
  Filter,
  FileText,
  Globe2,
  History,
  IdCard,
  MapPinned,
  Minus,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';

type EmploymentStatus =
  | 'Active'
  | 'Probation'
  | 'Suspended'
  | 'Terminated'
  | 'Retired'
  | 'Resigned'
  | 'Contract'
  | 'Seconded'
  | 'On Leave'
  | 'Field Assignment'
  | 'Travel Assignment'
  | 'Inactive'
  | string;

type EmploymentType = 'Permanent' | 'Contract' | 'Intern' | 'Consultant' | 'Secondment' | 'Payroll' | string;

type Employee = {
  id: string;
  employeeId: string;
  employeeCode?: string;
  fullName: string;
  preferredName?: string;
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  maritalStatus?: string;
  email: string;
  officialEmail?: string;
  personalEmail?: string;
  phone: string;
  primaryPhone?: string;
  alternatePhone?: string;
  officeExtension?: string;
  residentialAddress?: string;
  permanentAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  jobTitle: string;
  designation?: string;
  jobGrade?: string;
  department: string;
  division: string;
  businessUnit: string;
  costCenter?: string;
  managerName?: string;
  functionalManager?: string;
  departmentHead?: string;
  hrBusinessPartner?: string;
  location: string;
  workLocation?: string;
  officeLocation?: string;
  projectSite?: string;
  shift?: 'Day' | 'Night' | 'Rotational';
  staffCategory?: string;
  employeeCategory?: string;
  employmentType: EmploymentType;
  status: EmploymentStatus;
  nationality: string;
  expatriate: boolean;
  fieldWorker: boolean;
  remoteWorker: boolean;
  dateJoined: string;
  probationStartDate?: string;
  probationEndDate?: string;
  confirmationDueDate?: string;
  contractStartDate?: string;
  yearsOfService: number;
  lastPromotion?: string;
  trainingCompliance: 'Compliant' | 'Overdue' | 'At Risk';
  performanceRating?: 'A' | 'B' | 'C' | 'D';
  contractEndDate?: string;
  emergencyContactsComplete: boolean;
  emergencyContactCount?: number;
  documentCount?: number;
  hasManagerAssigned: boolean;
  createdAt?: string;
  modifiedAt?: string;
};

type EmployeeDirectoryPayload = {
  source: string;
  dataSource?: { source: string; databaseAvailable: boolean; warning: string | null; employeeCount: number };
  syncedAt: string;
  employees: Employee[];
};

type ApiResponse<T> = {
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

const boolValue = (value: unknown) => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

const auditId = () => {
  const randomUuid = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID.bind(globalThis.crypto) : null;
  return randomUuid ? randomUuid() : `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeEmployee = (record: Partial<Employee>): Employee => {
  const employeeId = text(record.employeeId || record.employeeCode || record.id, 'Unknown');
  const fullName = text(record.fullName, employeeId);
  return {
    ...record,
    id: text(record.id, employeeId),
    employeeId,
    employeeCode: optionalText(record.employeeCode),
    fullName,
    preferredName: optionalText(record.preferredName),
    title: optionalText(record.title),
    firstName: optionalText(record.firstName),
    middleName: optionalText(record.middleName),
    lastName: optionalText(record.lastName),
    gender: optionalText(record.gender),
    dateOfBirth: optionalText(record.dateOfBirth),
    maritalStatus: optionalText(record.maritalStatus),
    email: text(record.email || record.officialEmail || record.personalEmail, ''),
    officialEmail: optionalText(record.officialEmail),
    personalEmail: optionalText(record.personalEmail),
    phone: text(record.phone || record.primaryPhone || record.alternatePhone, ''),
    primaryPhone: optionalText(record.primaryPhone),
    alternatePhone: optionalText(record.alternatePhone),
    officeExtension: optionalText(record.officeExtension),
    residentialAddress: optionalText(record.residentialAddress),
    permanentAddress: optionalText(record.permanentAddress),
    city: optionalText(record.city),
    state: optionalText(record.state),
    country: text(record.country, 'Nigeria'),
    postalCode: optionalText(record.postalCode),
    jobTitle: text(record.jobTitle || record.designation, 'Unassigned role'),
    designation: optionalText(record.designation),
    jobGrade: optionalText(record.jobGrade),
    department: text(record.department, 'Unassigned'),
    division: text(record.division, 'Unassigned'),
    businessUnit: text(record.businessUnit, 'Unassigned'),
    costCenter: optionalText(record.costCenter),
    managerName: optionalText(record.managerName),
    functionalManager: optionalText(record.functionalManager),
    departmentHead: optionalText(record.departmentHead),
    hrBusinessPartner: optionalText(record.hrBusinessPartner),
    location: text(record.location || record.workLocation || record.officeLocation, 'Unassigned'),
    workLocation: optionalText(record.workLocation),
    officeLocation: optionalText(record.officeLocation),
    projectSite: optionalText(record.projectSite),
    shift: optionalText(record.shift) as Employee['shift'],
    staffCategory: optionalText(record.staffCategory),
    employeeCategory: optionalText(record.employeeCategory),
    employmentType: text(record.employmentType, 'Unclassified'),
    status: text(record.status, 'Active'),
    nationality: text(record.nationality, 'Nigerian'),
    expatriate: boolValue(record.expatriate),
    fieldWorker: boolValue(record.fieldWorker),
    remoteWorker: boolValue(record.remoteWorker),
    dateJoined: text(record.dateJoined),
    probationStartDate: optionalText(record.probationStartDate),
    probationEndDate: optionalText(record.probationEndDate),
    confirmationDueDate: optionalText(record.confirmationDueDate),
    contractStartDate: optionalText(record.contractStartDate),
    yearsOfService: numberValue(record.yearsOfService),
    lastPromotion: optionalText(record.lastPromotion),
    trainingCompliance: (['Compliant', 'Overdue', 'At Risk'].includes(text(record.trainingCompliance))
      ? text(record.trainingCompliance)
      : 'Compliant') as Employee['trainingCompliance'],
    performanceRating: optionalText(record.performanceRating) as Employee['performanceRating'],
    contractEndDate: optionalText(record.contractEndDate),
    emergencyContactsComplete: boolValue(record.emergencyContactsComplete),
    emergencyContactCount: numberValue(record.emergencyContactCount),
    documentCount: numberValue(record.documentCount),
    hasManagerAssigned: boolValue(record.hasManagerAssigned),
    createdAt: optionalText(record.createdAt),
    modifiedAt: optionalText(record.modifiedAt),
  };
};

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'Payroll Officer'
  | 'Compliance Officer'
  | 'Auditor'
  | 'Employee'
  | 'Executive Management';

type AuditEventType =
  | 'directory.view'
  | 'employee.open'
  | 'employee.profile.open'
  | 'export.generate'
  | 'report.generate'
  | 'import.open'
  | 'ai.insight.action';

type AuditEvent = {
  id: string;
  type: AuditEventType;
  at: string;
  actorRole: Role;
  message: string;
  employeeId?: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatDate = (iso: string) => {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not recorded';
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const formatTimeUtc = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

const formatDateTimeUtc = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const formatNumber = (n: number) => numberFmt.format(n);

const statusStyle = (status: EmploymentStatus) => {
  switch (status) {
    case 'Active':
      return { bg: 'bg-emerald-600/10', fg: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'Probation':
      return { bg: 'bg-amber-600/10', fg: 'text-amber-700', dot: 'bg-amber-500' };
    case 'Contract':
      return { bg: 'bg-blue-600/10', fg: 'text-blue-700', dot: 'bg-blue-500' };
    case 'On Leave':
      return { bg: 'bg-violet-600/10', fg: 'text-violet-700', dot: 'bg-violet-500' };
    case 'Field Assignment':
      return { bg: 'bg-cyan-600/10', fg: 'text-cyan-700', dot: 'bg-cyan-500' };
    case 'Travel Assignment':
      return { bg: 'bg-indigo-600/10', fg: 'text-indigo-700', dot: 'bg-indigo-500' };
    case 'Suspended':
      return { bg: 'bg-orange-600/10', fg: 'text-orange-700', dot: 'bg-orange-500' };
    case 'Resigned':
      return { bg: 'bg-slate-700/10', fg: 'text-slate-700', dot: 'bg-slate-500' };
    case 'Terminated':
      return { bg: 'bg-red-600/10', fg: 'text-red-700', dot: 'bg-red-500' };
    case 'Retired':
      return { bg: 'bg-teal-600/10', fg: 'text-teal-700', dot: 'bg-teal-500' };
    case 'Seconded':
      return { bg: 'bg-fuchsia-600/10', fg: 'text-fuchsia-700', dot: 'bg-fuchsia-500' };
    case 'Inactive':
    default:
      return { bg: 'bg-slate-600/10', fg: 'text-slate-700', dot: 'bg-slate-400' };
  }
};

const trainingStyle = (s: Employee['trainingCompliance']) => {
  if (s === 'Compliant') return { fg: 'text-emerald-700', bg: 'bg-emerald-600/10', icon: CheckCircle2 };
  if (s === 'At Risk') return { fg: 'text-amber-700', bg: 'bg-amber-600/10', icon: CircleAlert };
  return { fg: 'text-red-700', bg: 'bg-red-600/10', icon: AlertTriangle };
};

type ViewMode = 'table' | 'grid' | 'org' | 'geo';

type SortKey =
  | 'employeeId'
  | 'fullName'
  | 'jobTitle'
  | 'department'
  | 'businessUnit'
  | 'location'
  | 'status'
  | 'dateJoined'
  | 'yearsOfService';

type ColumnKey =
  | 'employee'
  | 'personal'
  | 'job'
  | 'jobMeta'
  | 'org'
  | 'manager'
  | 'location'
  | 'employment'
  | 'status'
  | 'contact'
  | 'address'
  | 'records'
  | 'joined'
  | 'yos'
  | 'promotion'
  | 'actions';

type ColumnDef = {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  stickyLeft?: boolean;
  widthClass?: string;
};

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'employee', label: 'Employee Identity', defaultVisible: true, stickyLeft: true, widthClass: 'min-w-[330px]' },
  { key: 'personal', label: 'Personal Info', defaultVisible: true, widthClass: 'min-w-[220px]' },
  { key: 'job', label: 'Job Title', defaultVisible: true, widthClass: 'min-w-[220px]' },
  { key: 'jobMeta', label: 'Grade / Designation', defaultVisible: true, widthClass: 'min-w-[190px]' },
  { key: 'org', label: 'Dept / Division / BU', defaultVisible: true, widthClass: 'min-w-[260px]' },
  { key: 'manager', label: 'Manager', defaultVisible: true, widthClass: 'min-w-[200px]' },
  { key: 'location', label: 'Work Location / Site', defaultVisible: true, widthClass: 'min-w-[220px]' },
  { key: 'employment', label: 'Employment Type', defaultVisible: true, widthClass: 'min-w-[210px]' },
  { key: 'status', label: 'Status', defaultVisible: true, widthClass: 'min-w-[170px]' },
  { key: 'contact', label: 'Official Contact', defaultVisible: true, widthClass: 'min-w-[250px]' },
  { key: 'address', label: 'Address', defaultVisible: true, widthClass: 'min-w-[260px]' },
  { key: 'records', label: 'Records', defaultVisible: true, widthClass: 'min-w-[170px]' },
  { key: 'joined', label: 'Date Joined', defaultVisible: true, widthClass: 'min-w-[140px]' },
  { key: 'yos', label: 'Years', defaultVisible: true, widthClass: 'min-w-[110px]' },
  { key: 'promotion', label: 'Last Promotion', defaultVisible: false, widthClass: 'min-w-[160px]' },
  { key: 'actions', label: 'Actions', defaultVisible: true, widthClass: 'min-w-[120px]' },
];

const useOutsideClick = (ref: React.RefObject<HTMLElement | null>, onOutside: () => void, enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [enabled, onOutside, ref]);
};

type MultiSelectFilterProps = {
  label: string;
  options: string[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  searchable?: boolean;
};

function MultiSelectFilter({ label, options, value, onChange, searchable }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(
    ref,
    () => {
      setOpen(false);
      setQ('');
    },
    open
  );

  const filtered = useMemo(() => {
    if (!searchable || q.trim().length === 0) return options;
    const needle = q.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [options, q, searchable]);

  const count = value.size;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs font-extrabold text-slate-700 truncate">{label}</span>
        <span className="flex items-center gap-2">
          {count > 0 && <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-dle-blue/10 text-dle-blue">{count}</span>}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            className="absolute z-30 mt-2 w-full min-w-[260px] max-w-[360px] bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
          >
            {searchable && (
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`Search ${label.toLowerCase()}...`}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 focus:border-dle-blue"
                  />
                </div>
              </div>
            )}

            <div className="max-h-[280px] overflow-auto">
              {filtered.map((opt) => {
                const checked = value.has(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const next = new Set(value);
                      if (checked) next.delete(opt);
                      else next.add(opt);
                      onChange(next);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-slate-800 truncate">{opt}</span>
                    <span
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                        checked ? 'bg-dle-blue border-dle-blue text-white' : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                  </button>
                );
              })}

              {filtered.length === 0 && <div className="px-4 py-6 text-sm text-slate-500 text-center">No matches.</div>}
            </div>

            <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-xs font-extrabold text-slate-600 hover:text-slate-900"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-extrabold px-3 py-2 rounded-xl bg-dle-blue text-white hover:bg-dle-blue-deep transition-colors"
              >
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: EmploymentStatus }) {
  const s = statusStyle(status);
  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${s.bg} ${s.fg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-extrabold">
      {label}
      <button type="button" onClick={onRemove} className="text-slate-500 hover:text-slate-900">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: string;
  icon: any;
  accent: { bg: string; fg: string; gradient: string };
  sub: string;
}) {
  return (
    <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm p-4 relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent.gradient}`} />
      <div className="relative flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl border border-slate-200/60 flex items-center justify-center ${accent.bg} ${accent.fg}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-extrabold text-slate-600">{label}</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 leading-tight">{value}</div>
          <div className="text-[11px] font-bold text-slate-500 mt-1 truncate">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function EmployeeActionsMenu({
  employee,
  canChangeStatus,
  onQuickView,
}: {
  employee: Employee;
  canChangeStatus: boolean;
  onQuickView: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const employeeId = encodeURIComponent(employee.employeeId);

  useOutsideClick(ref, () => setOpen(false), open);

  const primaryActions = [
    { label: 'Open profile', href: `/hris/employees/employee-profile/${employeeId}`, icon: Eye },
    { label: 'Edit profile', href: `/hris/employees/employee-profile/${employeeId}?mode=edit`, icon: UserCog },
    { label: 'Job information', href: `/hris/employees/job-information/${employeeId}`, icon: IdCard },
    { label: 'Employment history', href: `/hris/employees/employment-history/${employeeId}`, icon: History },
    { label: 'Documents', href: `/hris/employees/employee-documents/${employeeId}`, icon: FileText },
    { label: 'Emergency contacts', href: `/hris/employees/emergency-contacts/${employeeId}`, icon: Phone },
    { label: 'Reporting line', href: `/hris/employees/reporting-line/${employeeId}`, icon: Users },
  ];

  const changeActions = [
    { label: 'Status change', href: `/hris/employees/employee-status/${employeeId}`, icon: ShieldCheck },
    { label: 'Transfer', href: `/hris/employees/employee-transfer?employeeId=${employeeId}`, icon: ArrowDownUp },
    { label: 'Promotion', href: `/hris/employees/employee-promotion?employeeId=${employeeId}`, icon: UserCheck },
  ];

  return (
    <div className="relative flex justify-end" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${employee.fullName}`}
      >
        <MoreHorizontal className="w-4 h-4 text-slate-600" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-full z-40 mt-2 w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            role="menu"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onQuickView();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              role="menuitem"
            >
              <Eye className="w-4 h-4 text-dle-blue" />
              <span className="text-sm font-extrabold text-slate-800">Quick view</span>
            </button>

            <div className="border-t border-slate-100 py-1">
              {primaryActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    role="menuitem"
                  >
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-bold text-slate-700">{action.label}</span>
                  </Link>
                );
              })}
            </div>

            {canChangeStatus && (
              <div className="border-t border-slate-100 py-1">
                {changeActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                      role="menuitem"
                    >
                      <Icon className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-bold text-slate-700">{action.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="text-xs font-extrabold text-slate-700">{title}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function EmployeeDirectoryClient({ initialNow }: { initialNow: string }) {
  const router = useRouter();
  const nowMs = useMemo(() => new Date(initialNow).getTime(), [initialNow]);
  const nowStamp = useMemo(() => formatTimeUtc(initialNow), [initialNow]);

  const [role, setRole] = useState<Role>('HR Manager');
  const [view, setView] = useState<ViewMode>('table');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('fullName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [drawerEmployee, setDrawerEmployee] = useState<Employee | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'org' | 'compliance' | 'workforce-ai' | 'activity'>('overview');
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<{ name: string; filters: Record<string, string[]> }[]>([
    { name: 'All Employees', filters: {} },
    { name: 'Contract Expiring (<= 30 days)', filters: { contractExpiry: ['<=30'] } },
    { name: 'Missing Emergency Contacts', filters: { emergencyContacts: ['Missing'] } },
  ]);
  const [activePreset, setActivePreset] = useState('All Employees');

  const [filters, setFilters] = useState<Record<string, Set<string>>>({
    department: new Set(),
    businessUnit: new Set(),
    division: new Set(),
    location: new Set(),
    employmentType: new Set(),
    employmentStatus: new Set(),
    jobGrade: new Set(),
    designation: new Set(),
    manager: new Set(),
    gender: new Set(),
    nationality: new Set(),
    expatriateStatus: new Set(),
    projectSite: new Set(),
    shift: new Set(),
    leaveStatus: new Set(),
    probationStatus: new Set(),
    contractExpiry: new Set(),
    retirementWindow: new Set(),
    yearsOfService: new Set(),
    trainingCompliance: new Set(),
    performanceRating: new Set(),
    emergencyContacts: new Set(),
  });

  const [audit, setAudit] = useState<AuditEvent[]>(() => [
    { id: 'audit-0', type: 'directory.view', at: initialNow, actorRole: role, message: 'Employee Directory opened' },
  ]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [directorySource, setDirectorySource] = useState('DLE_Enterprise HRIS');
  const [directoryWarning, setDirectoryWarning] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const res = await fetch('/api/hris/employees', {
        method: 'GET',
        headers: { 'x-hris-role': role },
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<EmployeeDirectoryPayload> | null;
      if (!res.ok || !payload || payload.status !== 'success' || !payload.data) {
        throw new Error(payload?.error || `Employee directory request failed (${res.status})`);
      }
      const data = payload.data;
      const normalizedEmployees = (Array.isArray(data.employees) ? data.employees : []).map(normalizeEmployee);
      setEmployees(normalizedEmployees);
      setDirectorySource(data.source);
      setDirectoryWarning(data.dataSource?.warning || null);
      setSyncedAt(data.syncedAt);
      setPage(1);
      setAudit((prev) => [
        {
          id: auditId(),
          type: 'directory.view',
          at: new Date().toISOString(),
          actorRole: role,
          message: `Directory synced from ${data.source} (${normalizedEmployees.length} employees)`,
        },
        ...prev,
      ]);
    } catch (error) {
      setEmployees([]);
      setDirectoryWarning(null);
      setDirectoryError(error instanceof Error ? error.message : 'Unable to load DLE_Enterprise HRIS employees');
    } finally {
      setDirectoryLoading(false);
    }
  }, [role]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadEmployees();
    });
  }, [loadEmployees]);

  const options = useMemo(() => {
    const uniq = (values: Array<string | undefined>) => Array.from(new Set(values.map((value) => text(value)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      departments: uniq(employees.map((e) => e.department)),
      divisions: uniq(employees.map((e) => e.division)),
      businessUnits: uniq(employees.map((e) => e.businessUnit)),
      locations: uniq(employees.map((e) => e.location)),
      employmentTypes: uniq(employees.map((e) => e.employmentType)),
      statuses: uniq(employees.map((e) => e.status)),
      managers: uniq(employees.map((e) => e.managerName).filter(Boolean) as string[]),
      nationalities: uniq(employees.map((e) => e.nationality)),
      projectSites: uniq(employees.map((e) => e.projectSite).filter(Boolean) as string[]),
      shifts: uniq(employees.map((e) => e.shift).filter(Boolean) as string[]),
    };
  }, [employees]);

  const permissions = useMemo(() => {
    return {
      canAdd: role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer',
      canBulkImport: role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager',
      canExport: role !== 'Employee',
      canViewPayroll: role === 'Super Admin' || role === 'Payroll Officer' || role === 'HR Director' || role === 'Executive Management',
      canViewMedical: role === 'Super Admin' || role === 'HR Director' || role === 'Compliance Officer',
      canViewRisk: role !== 'Employee',
      canChangeStatus: role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager',
    };
  }, [role]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const visibleColumns = useMemo(() => columns.filter((c) => c.defaultVisible), [columns]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; value: string }[] = [];
    for (const [k, set] of Object.entries(filters)) {
      for (const v of set) chips.push({ key: k, label: k, value: v });
    }
    return chips;
  }, [filters]);

  const suggestions = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    const hits = employees
      .filter((e) => {
        return (
          e.employeeId.toLowerCase().includes(q) ||
          e.fullName.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.phone.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q) ||
          (e.managerName || '').toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.businessUnit.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);

    return hits.map((e) => ({
      id: e.id,
      label: `${e.fullName} - ${e.employeeId}`,
      sub: `${e.jobTitle} - ${e.department}`,
      employee: e,
    }));
  }, [debouncedQuery, employees]);

  const filteredEmployees = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    const setHas = (key: string, val: string | undefined) => {
      const s = filters[key];
      if (!s || s.size === 0) return true;
      if (!val) return false;
      return s.has(val);
    };

    const matchSpecial = (e: Employee) => {
      const contractExpiry = filters.contractExpiry;
      if (contractExpiry.size > 0) {
        const days = e.contractEndDate ? Math.ceil((new Date(e.contractEndDate).getTime() - nowMs) / (24 * 3600 * 1000)) : undefined;
        if (contractExpiry.has('<=30')) {
          if (!days || days > 30) return false;
        }
        if (contractExpiry.has('<=14')) {
          if (!days || days > 14) return false;
        }
      }

      const emergency = filters.emergencyContacts;
      if (emergency.size > 0) {
        if (emergency.has('Missing') && e.emergencyContactsComplete) return false;
        if (emergency.has('Complete') && !e.emergencyContactsComplete) return false;
      }

      const years = filters.yearsOfService;
      if (years.size > 0) {
        const y = e.yearsOfService;
        const ok =
          (years.has('0-1') && y <= 1) ||
          (years.has('2-5') && y >= 2 && y <= 5) ||
          (years.has('6-10') && y >= 6 && y <= 10) ||
          (years.has('11+') && y >= 11);
        if (!ok) return false;
      }

      const exp = filters.expatriateStatus;
      if (exp.size > 0) {
        if (exp.has('Expatriate') && !e.expatriate) return false;
        if (exp.has('Local') && e.expatriate) return false;
      }

      const leave = filters.leaveStatus;
      if (leave.size > 0) {
        if (leave.has('On Leave') && e.status !== 'On Leave') return false;
        if (leave.has('Not On Leave') && e.status === 'On Leave') return false;
      }

      const probation = filters.probationStatus;
      if (probation.size > 0) {
        if (probation.has('Probation') && e.status !== 'Probation') return false;
        if (probation.has('Not Probation') && e.status === 'Probation') return false;
      }

      const training = filters.trainingCompliance;
      if (training.size > 0) {
        if (!training.has(e.trainingCompliance)) return false;
      }

      const pr = filters.performanceRating;
      if (pr.size > 0) {
        if (!e.performanceRating || !pr.has(e.performanceRating)) return false;
      }

      return true;
    };

    return employees
      .filter((e) => {
        const matchesQuery =
          q.length === 0 ||
          e.employeeId.toLowerCase().includes(q) ||
          e.fullName.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.phone.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q) ||
          (e.managerName || '').toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.businessUnit.toLowerCase().includes(q);

        if (!matchesQuery) return false;

        if (!setHas('department', e.department)) return false;
        if (!setHas('division', e.division)) return false;
        if (!setHas('businessUnit', e.businessUnit)) return false;
        if (!setHas('location', e.location)) return false;
        if (!setHas('employmentType', e.employmentType)) return false;
        if (!setHas('employmentStatus', e.status)) return false;
        if (!setHas('manager', e.managerName || 'Unassigned')) return false;
        if (!setHas('nationality', e.nationality)) return false;
        if (!setHas('projectSite', e.projectSite || 'Unassigned')) return false;
        if (!setHas('shift', e.shift || 'Unassigned')) return false;
        return matchSpecial(e);
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        const cmpStr = (x: string, y: string) => x.localeCompare(y) * dir;
        const cmpNum = (x: number, y: number) => (x - y) * dir;
        switch (sortKey) {
          case 'employeeId':
            return cmpStr(a.employeeId, b.employeeId);
          case 'fullName':
            return cmpStr(a.fullName, b.fullName);
          case 'jobTitle':
            return cmpStr(a.jobTitle, b.jobTitle);
          case 'department':
            return cmpStr(a.department, b.department);
          case 'businessUnit':
            return cmpStr(a.businessUnit, b.businessUnit);
          case 'location':
            return cmpStr(a.location, b.location);
          case 'status':
            return cmpStr(a.status, b.status);
          case 'dateJoined':
            return cmpStr(a.dateJoined, b.dateJoined);
          case 'yearsOfService':
            return cmpNum(a.yearsOfService, b.yearsOfService);
          default:
            return 0;
        }
      });
  }, [debouncedQuery, employees, filters, nowMs, sortDir, sortKey]);

  const summary = useMemo(() => {
    const total = filteredEmployees.length;
    const active = filteredEmployees.filter((e) => e.status === 'Active').length;
      const contract = filteredEmployees.filter((e) => ['Lumpsum', 'Daily Rate', 'Contract'].includes(e.employmentType) || e.status === 'Contract').length;
    const probation = filteredEmployees.filter((e) => e.status === 'Probation').length;
    const onLeave = filteredEmployees.filter((e) => e.status === 'On Leave').length;
    const inactive = filteredEmployees.filter((e) => e.status === 'Inactive').length;
    const expatriates = filteredEmployees.filter((e) => e.expatriate).length;
    const field = filteredEmployees.filter((e) => e.fieldWorker).length;
    const remote = filteredEmployees.filter((e) => e.remoteWorker).length;
    const depts = new Set(filteredEmployees.map((e) => e.department)).size;
    const bus = new Set(filteredEmployees.map((e) => e.businessUnit)).size;
    return { total, active, contract, probation, onLeave, inactive, expatriates, field, remote, depts, bus };
  }, [filteredEmployees]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(filteredEmployees.length / pageSize)), [filteredEmployees.length, pageSize]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, page, pageSize]);

  const columnPanelRef = useRef<HTMLDivElement>(null);
  useOutsideClick(columnPanelRef, () => setColumnPanelOpen(false), columnPanelOpen);

  const applyPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    if (!preset) return;
    const next: Record<string, Set<string>> = { ...filters };
    for (const key of Object.keys(next)) next[key] = new Set();
    for (const [key, values] of Object.entries(preset.filters)) {
      if (!next[key]) next[key] = new Set();
      for (const v of values) next[key].add(v);
    }
    setFilters(next);
    setActivePreset(name);
    setPage(1);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const snapshot: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v.size > 0) snapshot[k] = Array.from(v);
    }
    setPresets((prev) => [{ name, filters: snapshot }, ...prev.filter((p) => p.name !== name)]);
    setActivePreset(name);
    setPresetName('');
  };

  const openEmployee = (e: Employee) => {
    setDrawerEmployee(e);
    setDrawerTab('overview');
    setAudit((prev) => [
      {
        id: auditId(),
        type: 'employee.open',
        at: new Date().toISOString(),
        actorRole: role,
        message: `Quick View opened for ${e.fullName} (${e.employeeId})`,
        employeeId: e.employeeId,
      },
      ...prev,
    ]);
  };

  const openEmployeeProfile = (e: Employee) => {
    setAudit((prev) => [
      {
        id: auditId(),
        type: 'employee.profile.open',
        at: new Date().toISOString(),
        actorRole: role,
        message: `Full profile opened for ${e.employeeId}`,
        employeeId: e.employeeId,
      },
      ...prev,
    ]);
    router.push(`/hris/employees/employee-profile/${encodeURIComponent(e.employeeId)}`);
  };

  const closeEmployee = () => setDrawerEmployee(null);

  const aiAction = (action: string) => {
    setAudit((prev) => [
      { id: auditId(), type: 'ai.insight.action', at: new Date().toISOString(), actorRole: role, message: `AI action triggered: ${action}` },
      ...prev,
    ]);

    if (action.includes('Contract')) setFilters((prev) => ({ ...prev, contractExpiry: new Set(['<=14']) }));
    if (action.includes('Emergency')) setFilters((prev) => ({ ...prev, emergencyContacts: new Set(['Missing']) }));
    if (action.includes('Assign Managers')) setFilters((prev) => ({ ...prev, manager: new Set(['Unassigned']) }));
    setPage(1);
  };

  const exportDirectory = () => {
    setAudit((prev) => [
      { id: auditId(), type: 'export.generate', at: new Date().toISOString(), actorRole: role, message: `Directory export requested (${filteredEmployees.length} records)` },
      ...prev,
    ]);
  };

  const orgNodes = useMemo(() => {
    const byDept = new Map<string, Employee[]>();
    for (const e of filteredEmployees) {
      const key = `${e.businessUnit} - ${e.division} - ${e.department}`;
      byDept.set(key, [...(byDept.get(key) || []), e]);
    }
    return Array.from(byDept.entries())
      .map(([k, list]) => ({ group: k, count: list.length, managers: new Set(list.map((x) => x.managerName || 'Unassigned')).size }))
      .sort((a, b) => b.count - a.count);
  }, [filteredEmployees]);

  const geoNodes = useMemo(() => {
    const byLoc = new Map<string, Employee[]>();
    for (const e of filteredEmployees) {
      byLoc.set(e.location, [...(byLoc.get(e.location) || []), e]);
    }
    return Array.from(byLoc.entries())
      .map(([loc, list]) => ({
        loc,
        count: list.length,
        active: list.filter((x) => x.status === 'Active').length,
        field: list.filter((x) => x.fieldWorker).length,
        expatriates: list.filter((x) => x.expatriate).length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredEmployees]);

  const sortButton = (key: SortKey, label: string) => {
    const is = sortKey === key;
    const dir = is ? sortDir : undefined;
    return (
      <button
        type="button"
        onClick={() => {
          if (is) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          else {
            setSortKey(key);
            setSortDir('asc');
          }
        }}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
          is ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span>{label}</span>
        {!is && <ArrowDownUp className="w-4 h-4 text-slate-400" />}
        {dir === 'asc' && <ArrowUpAZ className="w-4 h-4" />}
        {dir === 'desc' && <ArrowDownAZ className="w-4 h-4" />}
      </button>
    );
  };

  const masked = (value: string) => (permissions.canViewPayroll ? value : '******');

  const renderCell = (col: ColumnKey, e: Employee) => {
    if (col === 'employee') {
      return (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-white border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold">
            {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openEmployee(e)} className="text-sm font-extrabold text-slate-900 hover:text-dle-blue truncate">
                {e.fullName}
              </button>
              {e.preferredName && <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Pref: {e.preferredName}</span>}
              {e.expatriate && <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-600/10 text-indigo-700">Expat</span>}
              {e.fieldWorker && <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-cyan-600/10 text-cyan-700">Field</span>}
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              Code: {e.employeeCode || e.employeeId}
            </div>
          </div>
        </div>
      );
    }

    if (col === 'personal')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800 truncate">{[e.title, e.gender].filter(Boolean).join(' / ') || 'Not recorded'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">
            DOB: {formatDate(e.dateOfBirth || '')}
            {e.maritalStatus ? <span className="ml-1">/ {e.maritalStatus}</span> : null}
          </div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">Nationality: {e.nationality || 'Not recorded'}</div>
        </div>
      );

    if (col === 'job')
      return (
        <div className="text-sm">
          <div className="font-semibold text-slate-800">{e.jobTitle}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5">
            {e.designation || 'No designation'} {e.jobGrade ? <span className="mx-1">-</span> : null} {e.jobGrade || ''}
          </div>
        </div>
      );
    if (col === 'jobMeta')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800 truncate">{e.jobGrade || 'No grade'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.designation || 'No designation'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.costCenter || 'No cost center'}</div>
        </div>
      );
    if (col === 'org')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800 truncate">{e.department}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">
            {e.division} <span className="mx-1">-</span> {e.businessUnit}
          </div>
        </div>
      );
    if (col === 'manager')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800 truncate">{e.managerName || 'Unassigned'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">Functional: {e.functionalManager || 'Unassigned'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">HRBP: {e.hrBusinessPartner || 'Unassigned'}</div>
        </div>
      );
    if (col === 'location')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800 truncate">{e.location}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.projectSite || 'No project site'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.workLocation || e.officeLocation || 'No work location'}</div>
        </div>
      );
    if (col === 'employment')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800">{e.employmentType}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5">{e.staffCategory || e.employeeCategory || 'Unclassified'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5">{e.shift ? `${e.shift} shift` : 'Standard schedule'}</div>
        </div>
      );
    if (col === 'status') return <StatusBadge status={e.status} />;
    if (col === 'contact')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800 truncate">{e.officialEmail || e.email || 'No official email'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.primaryPhone || e.phone || 'No primary phone'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.officeExtension ? `Ext. ${e.officeExtension}` : e.personalEmail || 'No personal email'}</div>
        </div>
      );
    if (col === 'address')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800 truncate">{[e.city, e.state].filter(Boolean).join(', ') || 'No city/state'}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.country || 'No country'} {e.postalCode ? `/ ${e.postalCode}` : ''}</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{e.residentialAddress || e.permanentAddress || 'No address recorded'}</div>
        </div>
      );
    if (col === 'records')
      return (
        <div className="text-sm">
          <div className="font-extrabold text-slate-800">{formatNumber(e.documentCount || 0)} documents</div>
          <div className="text-xs text-slate-500 font-semibold mt-0.5">{formatNumber(e.emergencyContactCount || 0)} emergency contacts</div>
          <div className={`text-[11px] font-extrabold mt-1 ${e.emergencyContactsComplete ? 'text-emerald-700' : 'text-red-700'}`}>
            {e.emergencyContactsComplete ? 'Emergency complete' : 'Emergency missing'}
          </div>
        </div>
      );
    if (col === 'joined') return <div className="text-sm font-extrabold text-slate-800">{formatDate(e.dateJoined)}</div>;
    if (col === 'yos') return <div className="text-sm font-extrabold text-slate-800">{e.yearsOfService}y</div>;
    if (col === 'promotion') return <div className="text-sm font-extrabold text-slate-800">{e.lastPromotion ? formatDate(e.lastPromotion) : '-'}</div>;
    if (col === 'actions')
      return (
        <EmployeeActionsMenu employee={e} canChangeStatus={permissions.canChangeStatus} onQuickView={() => openEmployee(e)} />
      );

    return null;
  };

  const filterConfigs = useMemo(
    () => [
      { key: 'department', label: 'Department', options: options.departments, searchable: true },
      { key: 'businessUnit', label: 'Business Unit', options: options.businessUnits, searchable: true },
      { key: 'division', label: 'Division', options: options.divisions, searchable: true },
      { key: 'location', label: 'Location', options: options.locations, searchable: true },
      { key: 'employmentType', label: 'Employment Type', options: options.employmentTypes, searchable: false },
      { key: 'employmentStatus', label: 'Employment Status', options: options.statuses, searchable: true },
      { key: 'manager', label: 'Manager', options: ['Unassigned', ...options.managers], searchable: true },
      { key: 'nationality', label: 'Nationality', options: options.nationalities, searchable: true },
      { key: 'projectSite', label: 'Project Site', options: ['Unassigned', ...options.projectSites], searchable: true },
      { key: 'shift', label: 'Shift', options: ['Unassigned', ...options.shifts], searchable: false },
      { key: 'trainingCompliance', label: 'Training Compliance', options: ['Compliant', 'At Risk', 'Overdue'], searchable: false },
      { key: 'performanceRating', label: 'Performance Rating', options: ['A', 'B', 'C', 'D'], searchable: false },
      { key: 'expatriateStatus', label: 'Expatriate Status', options: ['Local', 'Expatriate'], searchable: false },
      { key: 'leaveStatus', label: 'Leave Status', options: ['On Leave', 'Not On Leave'], searchable: false },
      { key: 'probationStatus', label: 'Probation Status', options: ['Probation', 'Not Probation'], searchable: false },
      { key: 'yearsOfService', label: 'Years of Service', options: ['0-1', '2-5', '6-10', '11+'], searchable: false },
      { key: 'contractExpiry', label: 'Contract Expiry', options: ['<=14', '<=30'], searchable: false },
      { key: 'emergencyContacts', label: 'Emergency Contacts', options: ['Missing', 'Complete'], searchable: false },
      { key: 'jobGrade', label: 'Job Grade', options: ['JG-01', 'JG-02', 'JG-03', 'JG-04', 'JG-05', 'JG-06', 'JG-07', 'JG-08'], searchable: true },
      { key: 'designation', label: 'Designation', options: ['Engineer', 'Supervisor', 'Technician', 'Officer', 'Manager', 'Director'], searchable: true },
      { key: 'gender', label: 'Gender', options: ['Male', 'Female', 'Prefer not to say'], searchable: false },
      { key: 'retirementWindow', label: 'Retirement Window', options: ['<= 12 months', '1-3 years', '3-5 years', '5+ years'], searchable: false },
    ],
    [options]
  );

  const columnVisibilityPanel = (
    <div className="relative" ref={columnPanelRef}>
      <button
        type="button"
        onClick={() => setColumnPanelOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
          columnPanelOpen ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span>Columns</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${columnPanelOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {columnPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 z-30 mt-2 w-[360px] bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs font-extrabold text-slate-700">Column Visibility & Order</div>
              <button
                type="button"
                onClick={() => {
                  setColumns(DEFAULT_COLUMNS);
                  setColumnPanelOpen(false);
                }}
                className="text-xs font-extrabold text-slate-600 hover:text-slate-900"
              >
                Reset
              </button>
            </div>
            <div className="max-h-[320px] overflow-auto">
              {columns.map((c, idx) => {
                const checked = c.defaultVisible;
                return (
                  <div key={c.key} className="px-4 py-3 border-b border-slate-50 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setColumns((prev) => prev.map((x) => (x.key === c.key ? { ...x, defaultVisible: !x.defaultVisible } : x)))}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <span
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                          checked ? 'bg-dle-blue border-dle-blue text-white' : 'bg-white border-slate-300 text-transparent'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-semibold text-slate-800 truncate">{c.label}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === 0) return;
                          setColumns((prev) => {
                            const next = [...prev];
                            const tmp = next[idx - 1];
                            next[idx - 1] = next[idx];
                            next[idx] = tmp;
                            return next;
                          });
                        }}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                        aria-label="Move up"
                      >
                        <ChevronLeft className="w-4 h-4 text-slate-600 rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (idx === columns.length - 1) return;
                          setColumns((prev) => {
                            const next = [...prev];
                            const tmp = next[idx + 1];
                            next[idx + 1] = next[idx];
                            next[idx] = tmp;
                            return next;
                          });
                        }}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                        aria-label="Move down"
                      >
                        <ChevronRight className="w-4 h-4 text-slate-600 rotate-90" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!permissions.canAdd}
        onClick={() => {
          if (!permissions.canAdd) return;
          setAudit((prev) => [
            {
              id: auditId(),
              type: 'employee.open',
              at: new Date().toISOString(),
              actorRole: role,
              message: 'Add Employee opened from Employee Directory',
            },
            ...prev,
          ]);
          router.push('/hris/employees/add-new-employee');
        }}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors ${
          permissions.canAdd ? 'bg-dle-blue text-white border-dle-blue hover:bg-dle-blue-deep' : 'bg-slate-100 text-slate-400 border-slate-200'
        }`}
      >
        <Plus className="w-4 h-4" />
        Add Employee
      </button>
      <button
        type="button"
        disabled={!permissions.canBulkImport}
        onClick={() => setAudit((prev) => [{ id: auditId(), type: 'import.open', at: new Date().toISOString(), actorRole: role, message: 'Bulk import opened' }, ...prev])}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors ${
          permissions.canBulkImport ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 border-slate-200'
        }`}
      >
        <Download className="w-4 h-4 rotate-180" />
        Bulk Import
      </button>
      <button
        type="button"
        disabled={!permissions.canExport}
        onClick={exportDirectory}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors ${
          permissions.canExport ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 border-slate-200'
        }`}
      >
        <Download className="w-4 h-4" />
        Export
      </button>
      <button
        type="button"
        onClick={() => setAudit((prev) => [{ id: auditId(), type: 'report.generate', at: new Date().toISOString(), actorRole: role, message: 'Generate report requested' }, ...prev])}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <BarChart3 className="w-4 h-4" />
        Generate Report
      </button>
      <button
        type="button"
        onClick={loadEmployees}
        disabled={directoryLoading}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border border-slate-200 bg-white text-slate-700 transition-colors ${
          directoryLoading ? 'opacity-60 cursor-wait' : 'hover:bg-slate-50'
        }`}
      >
        <RefreshCcw className={`w-4 h-4 ${directoryLoading ? 'animate-spin' : ''}`} />
        {directoryLoading ? 'Syncing' : 'Refresh'}
      </button>
    </div>
  );

  return (
    <div className="bg-white">
      <div className="flex flex-col gap-4 pt-0 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-dle-blue/10 text-dle-blue">
              <Users className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">Employee Directory</h1>
              <p className="mt-0.5 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                Centralized workforce registry and employee intelligence hub for all DLE employees, departments, locations, and reporting structures.
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-extrabold text-slate-700">Audit Ready</span>
          </div>
          <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex-none">
            <span className="text-xs font-extrabold text-slate-600">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="min-w-0 flex-1 bg-white text-xs font-extrabold text-slate-800 focus:outline-none sm:flex-none">
              {[
                'Super Admin',
                'HR Director',
                'HR Manager',
                'HR Officer',
                'Department Head',
                'Line Manager',
                'Payroll Officer',
                'Compliance Officer',
                'Auditor',
                'Employee',
                'Executive Management',
              ].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Source: {directorySource}
        </span>
        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700">
          <RefreshCcw className={`w-4 h-4 text-dle-blue ${directoryLoading ? 'animate-spin' : ''}`} />
          {directoryLoading ? 'Loading HRIS records' : `Last load: ${syncedAt ? formatDateTimeUtc(syncedAt) : 'Not loaded yet'}`}
        </span>
      </div>

      {directoryError && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {directoryError}
        </div>
      )}
      {directoryWarning && !directoryError && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {directoryWarning}
        </div>
      )}

      <div className="mt-6 mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-4">
        <MetricCard
          label="Total Employees"
          value={formatNumber(summary.total)}
          icon={Users}
          accent={{ bg: 'bg-blue-600/10', fg: 'text-blue-700', gradient: 'from-blue-600/12 via-blue-500/5 to-transparent' }}
          sub="All records in current scope"
        />
        <MetricCard
          label="Active Employees"
          value={formatNumber(summary.active)}
          icon={CheckCircle2}
          accent={{ bg: 'bg-emerald-600/10', fg: 'text-emerald-700', gradient: 'from-emerald-600/12 via-emerald-500/5 to-transparent' }}
          sub="Operational workforce"
        />
        <MetricCard
          label="Contract Staff"
          value={formatNumber(summary.contract)}
          icon={CalendarClock}
          accent={{ bg: 'bg-amber-600/10', fg: 'text-amber-700', gradient: 'from-amber-600/12 via-amber-500/5 to-transparent' }}
          sub="Fixed-term contracts"
        />
        <MetricCard
          label="Probation Employees"
          value={formatNumber(summary.probation)}
          icon={Clock}
          accent={{ bg: 'bg-violet-600/10', fg: 'text-violet-700', gradient: 'from-violet-600/12 via-violet-500/5 to-transparent' }}
          sub="Pending confirmation"
        />
        <MetricCard
          label="Expatriates"
          value={formatNumber(summary.expatriates)}
          icon={Globe2}
          accent={{ bg: 'bg-indigo-600/10', fg: 'text-indigo-700', gradient: 'from-indigo-600/12 via-indigo-500/5 to-transparent' }}
          sub="Non-local workforce"
        />
        <MetricCard
          label="Field Workers"
          value={formatNumber(summary.field)}
          icon={MapPinned}
          accent={{ bg: 'bg-cyan-600/10', fg: 'text-cyan-700', gradient: 'from-cyan-600/12 via-cyan-500/5 to-transparent' }}
          sub="Sites & operations"
        />
      </div>

      <div className="sticky top-0 z-20 rounded-lg border border-slate-200/60 bg-white shadow-sm sm:rounded-2xl">
        <div className="flex flex-col justify-between gap-3 p-3 sm:p-4 xl:flex-row xl:items-center">
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by ID, name, email, phone, department, title, manager, location, skills, certification, or project..."
                className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 focus:border-dle-blue"
              />
              {query.length > 0 && (
                <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}

              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.16 }}
                    className="absolute z-30 mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          openEmployee(s.employee);
                          setQuery(s.employee.fullName);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className="text-sm font-extrabold text-slate-900">{s.label}</div>
                        <div className="text-xs text-slate-500 font-semibold mt-0.5">{s.sub}</div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
              <button
                type="button"
                onClick={() => setFilterPanelOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-extrabold text-slate-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterChips.length > 0 && (
                  <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-dle-blue/10 text-dle-blue">{activeFilterChips.length}</span>
                )}
              </button>

              {columnVisibilityPanel}

              {sortButton('fullName', 'Name')}
              {sortButton('department', 'Department')}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
              {(['table', 'grid', 'org', 'geo'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setView(m)}
                  className={`px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
                    view === m ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m === 'table' ? 'Table' : m === 'grid' ? 'Grid' : m === 'org' ? 'Org' : 'Geo'}
                </button>
              ))}
            </div>

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <select value={activePreset} onChange={(e) => applyPreset(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 focus:outline-none sm:w-auto">
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>
                    Preset: {p.name}
                  </option>
                ))}
              </select>

              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Save preset..."
                  className="min-w-0 flex-1 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none sm:w-[140px]"
                />
                <button
                  type="button"
                  onClick={savePreset}
                  className={`text-xs font-extrabold ${presetName.trim() ? 'text-dle-blue hover:text-dle-blue-deep' : 'text-slate-300'}`}
                  disabled={!presetName.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeFilterChips.length > 0 && (
          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {activeFilterChips.slice(0, 20).map((c) => (
              <Chip
                key={`${c.key}:${c.value}`}
                label={`${c.label}: ${c.value}`}
                onRemove={() => {
                  setFilters((prev) => {
                    const next = { ...prev };
                    const set = new Set(next[c.key] || []);
                    set.delete(c.value);
                    next[c.key] = set;
                    return next;
                  });
                  setPage(1);
                }}
              />
            ))}
            {activeFilterChips.length > 20 && <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-extrabold">+{activeFilterChips.length - 20} more</span>}
            <button
              type="button"
              onClick={() => {
                const next: Record<string, Set<string>> = { ...filters };
                for (const key of Object.keys(next)) next[key] = new Set();
                setFilters(next);
                setActivePreset('All Employees');
                setPage(1);
              }}
              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-600/10 text-red-700 text-[11px] font-extrabold hover:bg-red-600/15"
            >
              <X className="w-3.5 h-3.5" />
              Clear All
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-slate-600 font-semibold">
          Showing <span className="font-extrabold text-slate-900">{formatNumber(pageRows.length)}</span> of{' '}
          <span className="font-extrabold text-slate-900">{formatNumber(filteredEmployees.length)}</span> employees
        </div>
        {headerActions}
      </div>

      <div className="mt-4">
        {view === 'table' && (
          <div className="overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-sm sm:rounded-2xl">
            <div className="max-h-[calc(100dvh-220px)] overflow-auto">
              <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left">
                <thead className="bg-slate-50">
                  <tr>
                    {visibleColumns.map((c) => (
                      <th key={c.key} className={`sticky top-0 z-10 bg-slate-50 px-4 py-3 text-[11px] font-extrabold text-slate-600 border-b border-slate-100 shadow-[0_1px_0_rgba(15,23,42,0.08)] ${c.widthClass || ''}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((e) => (
                    <tr
                      key={e.id}
                      onDoubleClick={() => openEmployeeProfile(e)}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                      title="Double-click to open employee profile"
                    >
                      {visibleColumns.map((c) => (
                        <td key={c.key} className={`px-4 py-3 align-top ${c.widthClass || ''}`}>
                          {renderCell(c.key, e)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={visibleColumns.length} className="px-6 py-16 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-extrabold">
                          {directoryLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Minus className="w-4 h-4" />}
                          {directoryLoading ? 'Loading employees from HRIS...' : directoryError ? 'Unable to load HRIS employees.' : 'No employees match your search/filters.'}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pageRows.map((e) => {
              const t = trainingStyle(e.trainingCompliance);
              const TrainingIcon = t.icon;
              return (
                <div key={e.id} className="bg-white border border-slate-200/60 rounded-2xl shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-100 to-white border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold">
                        {e.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 truncate">{e.fullName}</div>
                        <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">
                          {e.employeeId} <span className="mx-1">-</span> {e.jobTitle}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <div className="text-[11px] font-extrabold text-slate-600">Department</div>
                      <div className="text-xs font-extrabold text-slate-900 mt-1 truncate">{e.department}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <div className="text-[11px] font-extrabold text-slate-600">Location</div>
                      <div className="text-xs font-extrabold text-slate-900 mt-1 truncate">{e.location}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <div className="text-[11px] font-extrabold text-slate-600">Training</div>
                      <div className={`inline-flex items-center gap-2 mt-1 text-[11px] font-extrabold px-2 py-1 rounded-full ${t.bg} ${t.fg}`}>
                        <TrainingIcon className="w-4 h-4" />
                        {e.trainingCompliance}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => openEmployee(e)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                      Quick View
                    </button>
                    <Link
                      href={`/hris/employees/employee-profile?employeeId=${encodeURIComponent(e.employeeId)}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                      onClick={() =>
                        setAudit((prev) => [
                          { id: auditId(), type: 'employee.profile.open', at: new Date().toISOString(), actorRole: role, message: `Full profile opened for ${e.employeeId}`, employeeId: e.employeeId },
                          ...prev,
                        ])
                      }
                    >
                      Open Profile
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'org' && (
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-slate-200/60 flex items-center justify-center text-amber-700">
                  <Building2 className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Organization View</div>
                  <div className="text-xs text-slate-500 font-semibold mt-0.5">Groupings across BU - Division - Department</div>
                </div>
              </div>
              <div className="text-xs font-extrabold px-3 py-2 rounded-xl bg-slate-100 text-slate-700">Groups: {formatNumber(orgNodes.length)}</div>
            </div>
            <div className="divide-y divide-slate-100">
              {orgNodes.slice(0, 40).map((n) => (
                <div key={n.group} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900 truncate">{n.group}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-0.5">Managers in scope: {n.managers}</div>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">{formatNumber(n.count)}</div>
                </div>
              ))}
              {orgNodes.length > 40 && <div className="px-6 py-4 text-xs text-slate-500 font-semibold">Showing top 40 groups. Refine filters to narrow scope.</div>}
            </div>
          </div>
        )}

        {view === 'geo' && (
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-cyan-600/10 border border-slate-200/60 flex items-center justify-center text-cyan-700">
                  <MapPinned className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Geographic View</div>
                  <div className="text-xs text-slate-500 font-semibold mt-0.5">Location distribution (map-ready)</div>
                </div>
              </div>
              <div className="text-xs font-extrabold px-3 py-2 rounded-xl bg-slate-100 text-slate-700">Locations: {formatNumber(geoNodes.length)}</div>
            </div>
            <div className="divide-y divide-slate-100">
              {geoNodes.map((n) => (
                <div key={n.loc} className="px-6 py-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                  <div className="md:col-span-2">
                    <div className="text-sm font-extrabold text-slate-900">{n.loc}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-0.5">
                      Active: {formatNumber(n.active)} <span className="mx-1">-</span> Field: {formatNumber(n.field)} <span className="mx-1">-</span> Expat: {formatNumber(n.expatriates)}
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-dle-blue to-dle-blue-deep"
                        style={{ width: `${Math.min(100, Math.round((n.count / Math.max(1, summary.total)) * 1000) / 10)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">Headcount: {formatNumber(n.count)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={`px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
              page === 1 ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Prev
          </button>
          <div className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700">
            Page {page} of {pageCount}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page === pageCount}
            className={`px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
              page === pageCount ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Next
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold text-slate-600">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 focus:outline-none"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-2xl bg-slate-700/10 border border-slate-200/60 flex items-center justify-center text-slate-700">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <div className="text-sm font-extrabold text-slate-900">Activity & Audit</div>
              <div className="text-xs text-slate-500 font-semibold mt-0.5">Every significant action is captured for compliance and traceability.</div>
            </div>
          </div>
          <div className="text-xs font-extrabold px-3 py-2 rounded-xl bg-slate-100 text-slate-700">Events: {audit.length}</div>
        </div>

        <div className="divide-y divide-slate-100">
          {audit.slice(0, 8).map((a) => (
            <div key={a.id} className="px-6 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-slate-900">{a.message}</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">
                  {formatDateTimeUtc(a.at)} <span className="mx-2">-</span> Role: {a.actorRole}{' '}
                  <span className="mx-2">-</span> Event: <span className="font-mono">{a.type}</span>
                  {a.employeeId && (
                    <>
                      <span className="mx-2">-</span> Employee: <span className="font-mono">{a.employeeId}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 shrink-0">Audit</span>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {filterPanelOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setFilterPanelOpen(false)}>
            <motion.div
              initial={{ x: 520 }}
              animate={{ x: 0 }}
              exit={{ x: 520 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white border-l border-slate-200 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-dle-blue/10 border border-slate-200/60 flex items-center justify-center text-dle-blue">
                    <Filter className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Advanced Filters</div>
                    <div className="text-xs text-slate-500 font-semibold mt-0.5">Role-driven, multi-select, saved presets.</div>
                  </div>
                </div>
                <button type="button" onClick={() => setFilterPanelOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-auto h-[calc(100%-64px)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filterConfigs.map((fc) => (
                    <MultiSelectFilter
                      key={fc.key}
                      label={fc.label}
                      options={fc.options}
                      value={filters[fc.key] || new Set()}
                      searchable={fc.searchable}
                      onChange={(next) => {
                        setFilters((prev) => ({ ...prev, [fc.key]: next }));
                        setPage(1);
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerEmployee && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={closeEmployee}>
            <motion.div
              initial={{ x: 560 }}
              animate={{ x: 0 }}
              exit={{ x: 560 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="absolute right-0 top-0 h-full w-full max-w-[560px] bg-white border-l border-slate-200 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-100 to-white border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold">
                    {drawerEmployee.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 truncate">{drawerEmployee.fullName}</div>
                      <StatusBadge status={drawerEmployee.status} />
                    </div>
                    <div className="text-xs text-slate-500 font-semibold mt-0.5 truncate">
                      {drawerEmployee.employeeId} <span className="mx-1">-</span> {drawerEmployee.jobTitle}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={closeEmployee} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-auto h-[calc(100%-64px)]">
                <div className="grid grid-cols-2 gap-2">
                  {(['overview', 'org', 'compliance', 'workforce-ai', 'activity'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDrawerTab(t)}
                      className={`px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
                        drawerTab === t ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {t === 'workforce-ai' ? 'AI Insights' : t === 'org' ? 'Reporting Line' : t === 'activity' ? 'Activity' : t === 'compliance' ? 'Compliance' : 'Overview'}
                    </button>
                  ))}
                </div>

                {drawerTab === 'overview' && (
                  <div className="space-y-4">
                    <DrawerSection title="Profile Summary">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-extrabold text-slate-600">Department</div>
                          <div className="text-sm font-extrabold text-slate-900 mt-1">{drawerEmployee.department}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-extrabold text-slate-600">Location</div>
                          <div className="text-sm font-extrabold text-slate-900 mt-1">{drawerEmployee.location}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-extrabold text-slate-600">Work Email</div>
                          <div className="text-sm font-extrabold text-slate-900 mt-1 truncate">{drawerEmployee.email}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-extrabold text-slate-600">Phone</div>
                          <div className="text-sm font-extrabold text-slate-900 mt-1">{drawerEmployee.phone}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-extrabold text-slate-600">Payroll Summary</div>
                          <div className="text-sm font-extrabold text-slate-900 mt-1">{masked('NGN 1,250,000')}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-extrabold text-slate-600">Years of Service</div>
                          <div className="text-sm font-extrabold text-slate-900 mt-1">{drawerEmployee.yearsOfService} years</div>
                        </div>
                      </div>
                    </DrawerSection>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
