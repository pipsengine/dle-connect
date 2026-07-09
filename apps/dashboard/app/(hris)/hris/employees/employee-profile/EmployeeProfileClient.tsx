'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import { useRouter } from 'next/navigation';
import { ContractPayrollClassificationPanel, type ContractPayrollClassificationView } from '../components/ContractPayrollClassificationUi';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Fingerprint,
  HeartPulse,
  History,
  IdCard,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Admin Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'Payroll Officer'
  | 'HSE Officer'
  | 'Compliance Officer'
  | 'Auditor'
  | 'IT Administrator'
  | 'Employee'
  | 'Executive Management';

type AuthSession = {
  username: string;
  employeeId?: string;
  employeeCode?: string;
  roles?: string[];
  isGlobalAdmin?: boolean;
};

type EmployeeStatus =
  | 'Active'
  | 'On Leave'
  | 'Probation'
  | 'Confirmed'
  | 'Suspended'
  | 'Resigned'
  | 'Terminated'
  | 'Retired'
  | 'Contract'
  | 'Seconded'
  | 'Field Assignment'
  | 'Inactive';

type Severity = 'high' | 'medium' | 'low';

type EmployeeProfile = {
  id: string;
  employeeId: string;
  photoUrl?: string;
  fullName: string;
  jobTitle: string;
  department: string;
  businessUnit: string;
  location: string;
  employmentStatus: EmployeeStatus;
  employmentType: string;
  reportingManager: string;
  dateJoined: string;
  yearsOfService: number;
};

type PersonalInfo = Record<string, string | null>;
type EmploymentDetails = Record<string, string | null>;
type JobDetails = Record<string, string | null>;
type ContactDetails = Record<string, string | null>;

type EmergencyContact = {
  id: string;
  fullName: string;
  relationship: string;
  phoneNumber: string;
  alternativePhone?: string | null;
  email?: string | null;
  address?: string | null;
  isPrimary: boolean;
  isNextOfKin: boolean;
  isBeneficiary: boolean;
};

type DocumentItem = {
  id: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'Uploaded' | 'Verified' | 'Rejected' | 'Archived';
  uploadedAt: string;
  expiresAt?: string | null;
  verifiedBy?: string | null;
};

type LeaveSummary = {
  balances: Record<string, number>;
  balanceDetails?: Array<{
    leaveType: string;
    available: number;
    entitlement: number;
    used: number;
    pending: number;
    carryForward: number;
  }>;
  history: { id: string; type: string; start: string; end: string; days: number; status: 'Approved' | 'Pending' | 'Rejected' }[];
  sourceSystem?: string | null;
  lastUpdatedAt?: string | null;
};

type AttendanceSummary = {
  score: number;
  presentDays: number;
  absentDays: number;
  lateComing: number;
  earlyDeparture: number;
  overtimeHours: number;
  biometricLogs: { id: string; at: string; source: string; status: string }[];
};

type PayrollSummary = {
  payrollStatus: 'Verified' | 'Pending Validation' | 'Masked';
  salaryGrade: string;
  basicSalary: number | null;
  allowances: number | null;
  deductions: number | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  pensionProvider: string | null;
  taxId: string | null;
  payrollGroup: string | null;
  lastPayrollProcessed: string | null;
};

type PerformanceSummary = {
  currentRating: 'A' | 'B' | 'C' | 'D' | '-';
  lastReviewAt?: string | null;
  goals: { id: string; title: string; progressPct: number; status: 'On Track' | 'At Risk' | 'Completed' }[];
  managerFeedback?: string | null;
  aiSignals: { id: string; title: string; severity: Severity; confidence: number }[];
};

type TrainingRecord = {
  id: string;
  trainingName: string;
  provider: string;
  completionDate?: string | null;
  expiryDate?: string | null;
  status: 'Completed' | 'Pending' | 'Expired';
  score?: number | null;
};

type AssetItem = {
  id: string;
  assetType: string;
  assetTag: string;
  assetName: string;
  serialNumber?: string | null;
  assignedDate: string;
  condition: 'Good' | 'Fair' | 'Needs Repair';
  returnStatus: 'Assigned' | 'Returned';
  returnDate?: string | null;
};

type MedicalHSE = {
  medicalFitnessStatus: string | null;
  bloodGroup: string | null;
  knownAllergies: string | null;
  medicalRestrictions: string | null;
  fitToWorkStatus: string | null;
  incidentHistory: { id: string; at: string; title: string; severity: Severity; status: string }[];
  hseCertifications: { id: string; name: string; expiryDate?: string | null; status: 'Valid' | 'Expired' }[];
};

type DisciplinaryRecord = {
  id: string;
  caseType: string;
  dateReported: string;
  description: string;
  actionTaken?: string | null;
  status: 'Open' | 'Closed' | 'Appealed';
  approver?: string | null;
};

type HistoryEvent = { id: string; at: string; type: string; detail: string; actor: string };

type EmployeeProfilePayload = EmployeeProfile & {
  personalInfo: PersonalInfo;
  employmentDetails: EmploymentDetails;
  jobDetails: JobDetails;
  contacts: ContactDetails;
  overview: EmployeeOverview;
  emergencyContacts: EmergencyContact[];
  documents: DocumentItem[];
  leaveSummary: LeaveSummary;
  attendanceSummary: AttendanceSummary;
  payrollSummary: PayrollSummary;
  performanceSummary: PerformanceSummary;
  training: TrainingRecord[];
  assets: AssetItem[];
  medicalHse: MedicalHSE | null;
  disciplinary: DisciplinaryRecord[] | null;
  history: HistoryEvent[];
  aiInsights: AIInsight[];
  payrollClassification?: ContractPayrollClassificationView;
};

type EmployeeOverview = {
  profileCompletionPct: number;
  leaveBalanceDays: number;
  attendanceScore: number;
  trainingCompliancePct: number;
  performanceRating: 'A' | 'B' | 'C' | 'D' | '-';
  payrollStatus: 'Verified' | 'Pending Validation' | 'Masked';
  documentStatus: 'Compliant' | 'Missing' | 'Expiring';
  assetStatus: 'Assigned' | 'None';
  currentLeaveStatus: 'None' | 'On Leave' | 'Pending';
  recentActivity: { id: string; at: string; title: string; detail: string; actor: string }[];
};

type AIInsight = { id: string; severity: Severity; confidence: number; title: string; recommendation: string; actionLabel: string; action: string };

type AuditLog = {
  id: string;
  at: string;
  action: string;
  performedBy: string;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  device?: string;
  reason?: string;
};

type EmployeeSearchOption = {
  employeeId: string;
  employeeCode?: string;
  fullName: string;
  jobTitle: string;
  department: string;
  location: string;
  status?: string;
};

type ApiState<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data?: T; error?: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDateUtc = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const formatDateTimeUtc = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
};
const numberFmt = new Intl.NumberFormat('en-GB');
const formatNumber = (n: number) => numberFmt.format(n);

const statusStyle = (status: EmployeeStatus) => {
  switch (status) {
    case 'Active':
      return { bg: 'bg-emerald-600/10', fg: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'On Leave':
      return { bg: 'bg-violet-600/10', fg: 'text-violet-700', dot: 'bg-violet-500' };
    case 'Probation':
      return { bg: 'bg-amber-600/10', fg: 'text-amber-700', dot: 'bg-amber-500' };
    case 'Confirmed':
      return { bg: 'bg-blue-600/10', fg: 'text-blue-700', dot: 'bg-blue-500' };
    case 'Suspended':
      return { bg: 'bg-orange-600/10', fg: 'text-orange-700', dot: 'bg-orange-500' };
    case 'Resigned':
      return { bg: 'bg-slate-700/10', fg: 'text-slate-700', dot: 'bg-slate-500' };
    case 'Terminated':
      return { bg: 'bg-red-600/10', fg: 'text-red-700', dot: 'bg-red-500' };
    case 'Retired':
      return { bg: 'bg-teal-600/10', fg: 'text-teal-700', dot: 'bg-teal-500' };
    case 'Contract':
      return { bg: 'bg-indigo-600/10', fg: 'text-indigo-700', dot: 'bg-indigo-500' };
    case 'Seconded':
      return { bg: 'bg-fuchsia-600/10', fg: 'text-fuchsia-700', dot: 'bg-fuchsia-500' };
    case 'Field Assignment':
      return { bg: 'bg-cyan-600/10', fg: 'text-cyan-700', dot: 'bg-cyan-500' };
    case 'Inactive':
      return { bg: 'bg-slate-600/10', fg: 'text-slate-700', dot: 'bg-slate-400' };
    default:
      return { bg: 'bg-cyan-600/10', fg: 'text-cyan-700', dot: 'bg-cyan-500' };
  }
};

const severityStyle = (s: Severity) => {
  if (s === 'high') return { bg: 'bg-red-600/10', border: 'border-red-200/70', fg: 'text-red-700', icon: AlertTriangle };
  if (s === 'medium') return { bg: 'bg-amber-600/10', border: 'border-amber-200/70', fg: 'text-amber-700', icon: CircleAlert };
  return { bg: 'bg-blue-600/10', border: 'border-blue-200/70', fg: 'text-blue-700', icon: Sparkles };
};

const rolePermissions = (role: Role, subjectEmployeeId: string, viewerEmployeeId: string | undefined) => {
  const isSelf = viewerEmployeeId ? viewerEmployeeId === subjectEmployeeId : role === 'Employee';
  const canViewPayroll = role === 'Super Admin' || role === 'Payroll Officer' || role === 'HR Director' || role === 'HR Manager' || role === 'Executive Management';
  const canViewMedical = role === 'Super Admin' || role === 'HR Director' || role === 'HSE Officer' || role === 'Compliance Officer';
  const canViewDisciplinary = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Compliance Officer';
  const canEdit = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer';
  const canEditPayroll = canViewPayroll && (canEdit || role === 'Payroll Officer');
  const canChangeStatus = role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager';
  const canManagePayrollClassification =
    role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'Payroll Officer';
  const canViewAudit = role !== 'Employee' && role !== 'IT Administrator';
  const canViewSensitivePersonal = role !== 'Employee' && role !== 'IT Administrator' && role !== 'Auditor';
  const canViewDocuments = role !== 'IT Administrator';
  const canViewProfile = role !== 'Employee' || isSelf;
  return {
    isSelf,
    canViewProfile,
    canViewPayroll,
    canViewMedical,
    canViewDisciplinary,
    canEdit,
    canEditPayroll,
    canChangeStatus,
    canManagePayrollClassification,
    canViewAudit,
    canViewSensitivePersonal,
    canViewDocuments,
  };
};

const profileRoleFromSession = (session: AuthSession | null): Role => {
  if (!session) return 'Employee';
  const value = (session.roles || []).join(' ').toLowerCase();
  if (session.isGlobalAdmin || value.includes('super administrator')) return 'Super Admin';
  if (value.includes('executive')) return 'Executive Management';
  if (value.includes('payroll')) return 'Payroll Officer';
  if (value.includes('hse')) return 'HSE Officer';
  if (value.includes('compliance')) return 'Compliance Officer';
  if (value.includes('auditor') || value.includes('audit')) return 'Auditor';
  if (value.includes('it administrator')) return 'IT Administrator';
  if (value.includes('department head')) return 'Department Head';
  if (value.includes('manager') || value.includes('supervisor')) return 'Line Manager';
  if (value.includes('hr administrator') || value.includes('hr manager')) return 'HR Manager';
  if (value.includes('hr officer') || value.includes('employee records')) return 'HR Officer';
  return 'Employee';
};

const EMPLOYMENT_FIELD_LABELS: Record<string, string> = {
  employeeId: 'Employee ID',
  employmentType: 'Employment Type',
  employmentStatus: 'Employment Status',
  dateJoined: 'Date Joined',
  confirmationDate: 'Confirmation Date',
  probationStartDate: 'Probation Start',
  probationEndDate: 'Probation End',
  contractStartDate: 'Contract Start',
  contractEndDate: 'Contract End',
  exitDate: 'Exit Date',
  exitReason: 'Exit Reason',
  rehireEligibility: 'Rehire Eligibility',
  workLocation: 'Work Location',
  workMode: 'Work Mode',
  shiftPattern: 'Shift Pattern',
  staffCategory: 'Staff Category',
  employeeCategory: 'Employee Category',
  unionStatus: 'Union Status',
};

const JOB_FIELD_LABELS: Record<string, string> = {
  jobTitle: 'Job Title',
  designation: 'Designation',
  jobGrade: 'Job Grade',
  department: 'Department',
  division: 'Division',
  unit: 'Unit',
  businessUnit: 'Business Unit',
  costCenter: 'Cost Center',
  location: 'Location',
  officeSite: 'Office / Site',
  projectSite: 'Project Site',
  currentProject: 'Current Project',
  projectName: 'Project Name',
  siteLocation: 'Site Location',
  reportingManager: 'Reporting Manager',
  functionalManager: 'Functional Manager',
  departmentHead: 'Department Head',
  hrBusinessPartner: 'HR Business Partner',
  assignmentType: 'Assignment Type',
  assignmentStatus: 'Assignment Status',
  assignmentEffectiveDate: 'Assignment Effective Date',
  assignmentStartDate: 'Assignment Start',
  assignmentEndDate: 'Assignment End',
  roleProfile: 'Role Profile',
  jobDescription: 'Job Description',
  keyResponsibilities: 'Key Responsibilities',
};

const humanizeFieldKey = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
const employmentLabel = (key: string) => EMPLOYMENT_FIELD_LABELS[key] || humanizeFieldKey(key);
const jobLabel = (key: string) => JOB_FIELD_LABELS[key] || humanizeFieldKey(key);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-slate-200/70 rounded-xl shadow-sm ${className || ''}`}>{children}</div>
);

const Pill = ({ label, tone }: { label: string; tone: { bg: string; fg: string; dot: string } }) => (
  <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${tone.bg} ${tone.fg}`}>
    <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
    {label}
  </span>
);

const initialsFor = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return (parts.map((p) => p[0]).join('') || 'EP').toUpperCase();
};

const Skeleton = ({ className }: { className: string }) => <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;

const LockBadge = () => (
  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-extrabold">
    <Lock className="w-3.5 h-3.5" />
    Restricted
  </span>
);

const TabButton = ({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) => {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold whitespace-nowrap transition-colors ${
        active ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className={`w-4 h-4 ${active ? '' : 'text-slate-400'}`} />
      {label}
    </button>
  );
};

const Field = ({ label, value, masked }: { label: string; value: string; masked?: boolean }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
    <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
    <div className={`text-sm font-extrabold mt-1 ${masked ? 'text-slate-400' : 'text-slate-900'}`}>{masked ? '••••••' : value}</div>
  </div>
);

const EditField = ({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) => (
  <div className={`rounded-xl border p-2.5 ${disabled ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white'}`}>
    <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={`mt-1 w-full text-sm font-semibold focus:outline-none ${disabled ? 'bg-transparent text-slate-400' : 'bg-white text-slate-900'}`}
    />
  </div>
);

const SummaryCard = ({ label, value, tone, hint }: { label: string; value: string; tone: { bg: string; fg: string }; hint?: string }) => (
  <div className="rounded-xl border border-slate-200/70 bg-white p-3.5 relative overflow-hidden">
    <div className={`absolute inset-0 ${tone.bg}`} />
    <div className="relative">
      <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
      <div className={`text-lg font-extrabold mt-1 ${tone.fg}`}>{value}</div>
      {hint ? <div className="text-[10px] font-semibold text-slate-500 mt-1">{hint}</div> : null}
    </div>
  </div>
);

const leaveBalanceTone = (leaveType: string) => {
  const normalized = leaveType.toLowerCase();
  if (normalized.includes('annual')) return { bg: 'bg-emerald-600/5', fg: 'text-emerald-700' };
  if (normalized.includes('sick')) return { bg: 'bg-amber-600/5', fg: 'text-amber-700' };
  if (normalized.includes('compassion')) return { bg: 'bg-violet-600/5', fg: 'text-violet-700' };
  if (normalized.includes('exam')) return { bg: 'bg-blue-600/5', fg: 'text-blue-700' };
  if (normalized.includes('carry')) return { bg: 'bg-cyan-600/5', fg: 'text-cyan-700' };
  return { bg: 'bg-slate-50', fg: 'text-slate-900' };
};

const leaveStatusTone = (status: 'Approved' | 'Pending' | 'Rejected') => {
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'Rejected') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-amber-50 text-amber-700 border-amber-100';
};

const Section = ({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const Icon = icon;
  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </span>
          <div className="text-sm font-extrabold text-slate-900">{title}</div>
        </div>
        {actions}
      </div>
      <div className="p-6">{children}</div>
    </Card>
  );
};

async function apiFetch<T>(
  employeeId: string,
  resource: string,
  init: RequestInit & { role: Role; viewerEmployeeId?: string } = { role: 'HR Manager' }
): Promise<T> {
  const res = await fetch(`/api/hris/employees/${encodeURIComponent(employeeId)}/${resource}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'x-hris-role': init.role,
      ...(init.viewerEmployeeId ? { 'x-hris-employee-id': init.viewerEmployeeId } : {}),
    },
  });
  const json = (await res.json()) as { status: string; data?: T; error?: string };
  if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function apiMutate<T>(
  employeeId: string,
  resource: string,
  init: RequestInit & { role: Role; viewerEmployeeId?: string }
): Promise<T> {
  const res = await fetch(`/api/hris/employees/${encodeURIComponent(employeeId)}/${resource}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'content-type': 'application/json',
      'x-hris-role': init.role,
      ...(init.viewerEmployeeId ? { 'x-hris-employee-id': init.viewerEmployeeId } : {}),
    },
  });
  const json = (await res.json()) as { status: string; data?: T; error?: string };
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Request failed');
  return json.data as T;
}

const ProfileHeader = ({
  profile,
  role,
  onAction,
  permissions,
}: {
  profile: EmployeeProfile;
  role: Role;
  onAction: (action: string) => void;
  permissions: ReturnType<typeof rolePermissions>;
}) => {
  const tone = statusStyle(profile.employmentStatus);
  return (
    <Card className="p-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
        <div className="flex items-start gap-5 min-w-0">
          <div className="w-16 h-16 rounded-xl border border-blue-200 overflow-hidden bg-blue-600/10 shrink-0">
            <EmployeeAvatar
              fullName={profile.fullName}
              employeeId={profile.employeeId}
              photoUrl={profile.photoUrl}
              tryPhoto={Boolean(profile.photoUrl)}
              hasPhoto={Boolean(profile.photoUrl)}
              size="xl"
              className="h-full w-full rounded-xl ring-0"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight truncate">{profile.fullName}</h1>
              <Pill label={profile.employmentStatus} tone={tone} />
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-extrabold">
                <Fingerprint className="w-3.5 h-3.5 text-slate-500" />
                {profile.employeeId}
              </span>
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-600/10 text-blue-700 text-[11px] font-extrabold">
                <ShieldCheck className="w-3.5 h-3.5" />
                HR Profile
              </span>
            </div>
            <div className="text-sm text-slate-600 font-semibold mt-1 truncate">
              {profile.jobTitle} <span className="mx-2">•</span> {profile.department} <span className="mx-2">•</span> {profile.businessUnit}
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" />
                {profile.location}
              </span>
              <span className="inline-flex items-center gap-2">
                <BriefcaseBusiness className="w-4 h-4 text-slate-400" />
                {profile.employmentType}
              </span>
              <span className="inline-flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Manager: {profile.reportingManager}
              </span>
              <span className="inline-flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                Joined: {formatDateUtc(profile.dateJoined)} <span className="mx-1">•</span> {profile.yearsOfService} yrs
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            disabled={!permissions.canEdit}
            onClick={() => onAction('profile.edit')}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
              permissions.canEdit ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <Pencil className="w-4 h-4" />
            Edit Profile
          </button>
          <button type="button" onClick={() => onAction('profile.download')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" />
            Download
          </button>
          <button type="button" onClick={() => onAction('profile.print')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button type="button" onClick={() => onAction('message.send')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
            <Mail className="w-4 h-4" />
            Send Message
          </button>
          <button
            type="button"
            disabled={!permissions.canViewDocuments}
            onClick={() => onAction('tab.documents')}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
              permissions.canViewDocuments ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            View Documents
          </button>
          <button
            type="button"
            onClick={() => onAction('report.generate')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            Generate HR Report
          </button>
          <button
            type="button"
            disabled={!permissions.canChangeStatus}
            onClick={() => onAction('status.change')}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${
              permissions.canChangeStatus ? 'border-dle-blue bg-dle-blue text-white hover:bg-dle-blue-deep' : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}
          >
            <BadgeCheck className="w-4 h-4" />
            Change Status
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <span className="text-[11px] font-extrabold text-slate-600">Role</span>
            <span className="text-xs font-extrabold text-slate-800">{role}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

const InsightBanner = ({
  insights,
  onAction,
}: {
  insights: AIInsight[];
  onAction: (action: string) => void;
}) => {
  if (insights.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-violet-600/10 border border-slate-200/60 flex items-center justify-center text-violet-700">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">AI Employee Insights</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Risk signals, missing data detection, and workflow-ready recommendations.</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700">
          <Fingerprint className="w-4 h-4 text-slate-500" />
          Confidence-weighted
        </span>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {insights.map((i) => {
          const st = severityStyle(i.severity);
          const Icon = st.icon;
          return (
            <div key={i.id} className={`rounded-xl border ${st.border} bg-white p-3.5`}>
              <div className="flex items-start gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${st.bg} ${st.fg}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900 leading-snug">{i.title}</div>
                  <div className="text-xs text-slate-500 font-semibold mt-1">{i.recommendation}</div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${st.bg} ${st.fg}`}>AI confidence: {Math.round(i.confidence * 100)}%</span>
                    <button type="button" onClick={() => onAction(i.action)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                      {i.actionLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

type TabKey =
  | 'overview'
  | 'personal'
  | 'employment'
  | 'job'
  | 'contact'
  | 'emergency'
  | 'documents'
  | 'leave'
  | 'attendance'
  | 'payroll'
  | 'performance'
  | 'training'
  | 'assets'
  | 'medical'
  | 'disciplinary'
  | 'history'
  | 'audit';

const EmptyState = ({ title, detail }: { title: string; detail: string }) => (
  <Card className="p-10 text-center">
    <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
      <FileText className="w-6 h-6" />
    </div>
    <div className="text-lg font-extrabold text-slate-900 mt-4">{title}</div>
    <div className="text-sm text-slate-600 font-semibold mt-1">{detail}</div>
    <div className="mt-5">
      <Link href="/hris/employees/employee-directory" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-extrabold hover:bg-slate-800 transition-colors">
        <ChevronRight className="w-5 h-5" />
        Back to Employee Directory
      </Link>
    </div>
  </Card>
);

const ErrorState = ({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) => (
  <Card className="p-10 text-center">
    <div className="mx-auto w-12 h-12 rounded-2xl bg-red-600/10 border border-red-200 flex items-center justify-center text-red-700">
      <AlertTriangle className="w-6 h-6" />
    </div>
    <div className="text-lg font-extrabold text-slate-900 mt-4">{title}</div>
    <div className="text-sm text-slate-600 font-semibold mt-1">{detail}</div>
    <div className="mt-5">
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-extrabold hover:bg-slate-800 transition-colors">
        Retry
      </button>
    </div>
  </Card>
);

const ProfileSkeleton = () => (
  <div className="space-y-6">
    <Card className="p-6">
      <div className="flex items-start gap-5">
        <Skeleton className="w-20 h-20" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-[320px]" />
          <Skeleton className="h-4 w-[520px]" />
          <Skeleton className="h-4 w-[420px]" />
        </div>
      </div>
    </Card>
    <Card className="p-6">
      <Skeleton className="h-5 w-[260px]" />
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] w-full" />
        ))}
      </div>
    </Card>
    <Card className="p-4">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-[120px]" />
        ))}
      </div>
    </Card>
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <Card className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px]" />
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <Skeleton className="h-5 w-[220px]" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[52px]" />
          ))}
        </div>
      </Card>
    </div>
  </div>
);

const OverviewTab = ({
  overview,
  permissions,
}: {
  overview: EmployeeOverview;
  permissions: ReturnType<typeof rolePermissions>;
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Profile Completion" value={`${overview.profileCompletionPct}%`} tone={{ bg: 'bg-blue-600/5', fg: 'text-blue-700' }} />
        <SummaryCard label="Attendance Score" value={`${overview.attendanceScore}/100`} tone={{ bg: 'bg-emerald-600/5', fg: 'text-emerald-700' }} />
        <SummaryCard label="Training Compliance" value={`${overview.trainingCompliancePct}%`} tone={{ bg: 'bg-amber-600/5', fg: 'text-amber-700' }} />
        <SummaryCard
          label="Payroll Status"
          value={permissions.canViewPayroll ? overview.payrollStatus : 'Masked'}
          tone={{ bg: 'bg-violet-600/5', fg: 'text-violet-700' }}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <ClipboardList className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Employee Snapshot</div>
                <div className="text-xs text-slate-500 font-semibold mt-0.5">High-level, role-aware summary across profile, payroll, compliance, and activity.</div>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Compliance signalized
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Current Leave Status" value={overview.currentLeaveStatus} />
            <Field label="Leave Balance" value={`${overview.leaveBalanceDays} days`} />
            <Field label="Performance Rating" value={overview.performanceRating === '-' ? 'Not available' : overview.performanceRating} />
            <Field label="Document Status" value={overview.documentStatus} />
            <Field label="Training Compliance" value={`${overview.trainingCompliancePct}%`} />
            <Field label="Assets" value={overview.assetStatus} />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-900">Recent Activity</div>
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{formatNumber(overview.recentActivity.length)}</span>
          </div>
          <div className="mt-4 space-y-2.5">
            {overview.recentActivity.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs font-semibold text-slate-600">No recent activity recorded.</div>
            ) : null}
            {overview.recentActivity.slice(0, 6).map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-extrabold text-slate-900">{a.title}</div>
                <div className="text-[11px] text-slate-500 font-semibold mt-1">
                  {formatDateTimeUtc(a.at)} <span className="mx-2">•</span> {a.actor}
                </div>
                <div className="text-xs text-slate-600 font-semibold mt-1">{a.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default function EmployeeProfileClient({
  employeeId,
  initialNow,
  initialMode,
  initialTab,
}: {
  employeeId: string;
  initialNow: string;
  initialMode?: string;
  initialTab?: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('Employee');
  const [viewerEmployeeId, setViewerEmployeeId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>('overview');
  const [toast, setToast] = useState<{ title: string; detail: string; tone: 'ok' | 'warn' | 'err' } | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeSearchOption[]>([]);
  const [employeeSearchLoading, setEmployeeSearchLoading] = useState(false);
  const [employeeSearchError, setEmployeeSearchError] = useState<string | null>(null);

  const perms = useMemo(() => rolePermissions(role, employeeId, viewerEmployeeId), [employeeId, role, viewerEmployeeId]);
  const nowStamp = useMemo(() => formatDateTimeUtc(initialNow), [initialNow]);

  const [profile, setProfile] = useState<ApiState<EmployeeProfilePayload>>({ status: 'idle' });
  const [overview, setOverview] = useState<ApiState<EmployeeOverview>>({ status: 'idle' });
  const [insights, setInsights] = useState<ApiState<AIInsight[]>>({ status: 'idle' });
  const [audit, setAudit] = useState<ApiState<AuditLog[]>>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    const loadAuthContext = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const json = (await res.json()) as { status: string; data?: AuthSession };
        if (!res.ok || json.status !== 'success' || !json.data || cancelled) return;
        setRole(profileRoleFromSession(json.data));
        if (!json.data.isGlobalAdmin) setViewerEmployeeId(json.data.employeeCode || json.data.employeeId || json.data.username);
      } catch {
        if (!cancelled) setRole('Employee');
      }
    };
    void loadAuthContext();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEmployees = async () => {
      setEmployeeSearchLoading(true);
      setEmployeeSearchError(null);
      try {
        const res = await fetch('/api/hris/employees', { cache: 'no-store' });
        const json = (await res.json()) as { status: string; data?: { employees?: EmployeeSearchOption[] }; error?: string };
        if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load employees');
        if (cancelled) return;
        setEmployeeOptions(
          [...(json.data?.employees || [])]
            .filter((employee) => employee.employeeId && employee.fullName)
            .sort((a, b) => a.fullName.localeCompare(b.fullName)),
        );
      } catch (e) {
        if (!cancelled) setEmployeeSearchError(e instanceof Error ? e.message : 'Unable to load employees');
      } finally {
        if (!cancelled) setEmployeeSearchLoading(false);
      }
    };
    void loadEmployees();
    return () => {
      cancelled = true;
    };
  }, []);

  const employeeSearchResults = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employeeOptions.slice(0, 8);
    return employeeOptions
      .filter((employee) =>
        [
          employee.employeeId,
          employee.employeeCode,
          employee.fullName,
          employee.jobTitle,
          employee.department,
          employee.location,
          employee.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
  }, [employeeOptions, employeeSearch]);

  const openEmployeeProfile = (nextEmployeeId: string) => {
    const id = nextEmployeeId.trim();
    if (!id || id === employeeId) return;
    router.push(`/hris/employees/employee-profile/${encodeURIComponent(id)}`);
  };

  const [personalEdit, setPersonalEdit] = useState(false);
  const [personalDraft, setPersonalDraft] = useState<PersonalInfo | null>(null);
  const [employmentEdit, setEmploymentEdit] = useState(false);
  const [employmentDraft, setEmploymentDraft] = useState<EmploymentDetails | null>(null);
  const [jobEdit, setJobEdit] = useState(false);
  const [jobDraft, setJobDraft] = useState<JobDetails | null>(null);
  const [contactsEdit, setContactsEdit] = useState(false);
  const [contactsDraft, setContactsDraft] = useState<ContactDetails | null>(null);
  const [payrollEdit, setPayrollEdit] = useState(false);
  const [payrollDraft, setPayrollDraft] = useState<PayrollSummary | null>(null);
  const [medicalEdit, setMedicalEdit] = useState(false);
  const [medicalDraft, setMedicalDraft] = useState<MedicalHSE | null>(null);
  const [performanceEdit, setPerformanceEdit] = useState(false);
  const [performanceDraft, setPerformanceDraft] = useState<PerformanceSummary | null>(null);
  const [trainingEdit, setTrainingEdit] = useState(false);
  const [trainingDraft, setTrainingDraft] = useState<TrainingRecord[] | null>(null);
  const [assetsEdit, setAssetsEdit] = useState(false);
  const [assetsDraft, setAssetsDraft] = useState<AssetItem[] | null>(null);
  const [disciplinaryEdit, setDisciplinaryEdit] = useState(false);
  const [disciplinaryDraft, setDisciplinaryDraft] = useState<DisciplinaryRecord[] | null>(null);
  const [pendingEditTab, setPendingEditTab] = useState<TabKey | null>(null);

  const [statusReason, setStatusReason] = useState('');
  const [statusNext, setStatusNext] = useState<EmployeeStatus | ''>('');

  const [emergencyModal, setEmergencyModal] = useState<{ mode: 'add' | 'edit'; contact?: EmergencyContact } | null>(null);
  const [emergencyDraft, setEmergencyDraft] = useState<Partial<EmergencyContact>>({});

  const [docCategory, setDocCategory] = useState('Government ID');
  const [docExpiry, setDocExpiry] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  const tabs = useMemo(() => {
    const base: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
      { key: 'overview', label: 'Overview', icon: ClipboardList, show: true },
      { key: 'personal', label: 'Personal Information', icon: User, show: true },
      { key: 'employment', label: 'Employment Details', icon: IdCard, show: true },
      { key: 'job', label: 'Job & Department', icon: BriefcaseBusiness, show: true },
      { key: 'contact', label: 'Contact Details', icon: Phone, show: true },
      { key: 'emergency', label: 'Emergency Contacts', icon: HeartPulse, show: true },
      { key: 'documents', label: 'Documents', icon: FileText, show: perms.canViewDocuments },
      { key: 'leave', label: 'Leave', icon: Calendar, show: true },
      { key: 'attendance', label: 'Attendance', icon: CheckCircle2, show: true },
      { key: 'payroll', label: 'Payroll', icon: BadgeCheck, show: perms.canViewPayroll || perms.isSelf },
      { key: 'performance', label: 'Performance', icon: BadgeCheck, show: true },
      { key: 'training', label: 'Training & Certifications', icon: BadgeCheck, show: true },
      { key: 'assets', label: 'Assets', icon: BriefcaseBusiness, show: true },
      { key: 'medical', label: 'Medical / HSE', icon: Stethoscope, show: perms.canViewMedical },
      { key: 'disciplinary', label: 'Disciplinary', icon: AlertTriangle, show: perms.canViewDisciplinary },
      { key: 'history', label: 'History', icon: History, show: true },
      { key: 'audit', label: 'Audit Trail', icon: ShieldCheck, show: perms.canViewAudit },
    ];
    return base.filter((t) => t.show);
  }, [perms.canViewAudit, perms.canViewDisciplinary, perms.canViewDocuments, perms.canViewMedical, perms.canViewPayroll, perms.isSelf]);

  useEffect(() => {
    if (!perms.canViewProfile) {
      const t = setTimeout(() => {
        setProfile({ status: 'error', error: 'Permission denied' });
        setOverview({ status: 'error', error: 'Permission denied' });
        setInsights({ status: 'error', error: 'Permission denied' });
        setAudit({ status: 'error', error: 'Permission denied' });
      }, 0);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    const load = async () => {
      try {
        const [p, a] = await Promise.all([
          apiFetch<EmployeeProfilePayload>(employeeId, 'profile', { role, viewerEmployeeId }),
          apiFetch<AuditLog[]>(employeeId, 'audit-trail', { role, viewerEmployeeId }),
        ]);
        if (cancelled) return;
        setProfile({ status: 'ready', data: p });
        setOverview({ status: 'ready', data: p.overview });
        setInsights({ status: 'ready', data: p.aiInsights });
        setAudit({ status: 'ready', data: a });
      } catch (e) {
        if (cancelled) return;
        setProfile({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load profile' });
        setOverview({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load profile' });
        setInsights({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load profile' });
        setAudit({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load profile' });
      }
    };
    const t = setTimeout(() => {
      if (cancelled) return;
      setProfile({ status: 'loading' });
      setOverview({ status: 'loading' });
      setInsights({ status: 'loading' });
      setAudit({ status: 'loading' });
      void load();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [employeeId, perms.canViewProfile, role, viewerEmployeeId]);

  useEffect(() => {
    if (tabs.length === 0) return;
    const exists = tabs.some((t) => t.key === tab);
    if (!exists) {
      const t = setTimeout(() => setTab(tabs[0].key), 0);
      return () => clearTimeout(t);
    }
  }, [tab, tabs]);

  useEffect(() => {
    if (initialTab) setTab(initialTab as TabKey);
    if (initialMode === 'edit') setPendingEditTab((initialTab as TabKey) || 'personal');
  }, [initialMode, initialTab]);

  useEffect(() => {
    if (!pendingEditTab || profile.status !== 'ready' || !profile.data) return;
    if (pendingEditTab === 'personal') {
      setPersonalDraft(profile.data.personalInfo);
      setPersonalEdit(true);
    }
    if (pendingEditTab === 'employment') {
      setEmploymentDraft(profile.data.employmentDetails);
      setEmploymentEdit(true);
    }
    if (pendingEditTab === 'job') {
      setJobDraft(profile.data.jobDetails);
      setJobEdit(true);
    }
    if (pendingEditTab === 'contact') {
      setContactsDraft(profile.data.contacts);
      setContactsEdit(true);
    }
    if (pendingEditTab === 'payroll') {
      setPayrollDraft(profile.data.payrollSummary);
      setPayrollEdit(true);
    }
    if (pendingEditTab === 'medical' && profile.data.medicalHse) {
      setMedicalDraft(profile.data.medicalHse);
      setMedicalEdit(true);
    }
    if (pendingEditTab === 'performance') {
      setPerformanceDraft(profile.data.performanceSummary);
      setPerformanceEdit(true);
    }
    if (pendingEditTab === 'training') {
      setTrainingDraft(profile.data.training);
      setTrainingEdit(true);
    }
    if (pendingEditTab === 'assets') {
      setAssetsDraft(profile.data.assets);
      setAssetsEdit(true);
    }
    if (pendingEditTab === 'disciplinary' && profile.data.disciplinary) {
      setDisciplinaryDraft(profile.data.disciplinary);
      setDisciplinaryEdit(true);
    }
    setPendingEditTab(null);
  }, [pendingEditTab, profile]);

  const pushAudit = (evt: AuditLog) => {
    setAudit((prev) => {
      if (prev.status !== 'ready' || !prev.data) return prev;
      return { status: 'ready', data: [evt, ...prev.data] };
    });
  };

  const onAction = (action: string) => {
    if (action === 'profile.edit') {
      setTab('personal');
      setPendingEditTab('personal');
      return;
    }
    pushAudit({
      id: `audit-${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      action,
      performedBy: role,
      ipAddress: '10.0.12.44',
      device: 'DLE-HRIS-Web',
      reason: action === 'status.change' ? 'Workflow action initiated' : undefined,
    });
    setToast({ title: 'Action queued', detail: `${action} captured for audit at ${nowStamp}`, tone: 'ok' });
    if (action.startsWith('tab.')) {
      const key = action.slice(4) as TabKey;
      if (tabs.some((t) => t.key === key)) setTab(key);
      return;
    }
    if (action.includes('document')) setTab('documents');
    if (action.includes('status')) setTab('employment');
  };

  const retry = () => {
    setProfile({ status: 'idle' });
    setOverview({ status: 'idle' });
    setInsights({ status: 'idle' });
    setAudit({ status: 'idle' });
  };

  const updateProfile = (updater: (p: EmployeeProfilePayload) => EmployeeProfilePayload) => {
    setProfile((prev) => {
      if (prev.status !== 'ready' || !prev.data) return prev;
      return { status: 'ready', data: updater(prev.data) };
    });
  };

  const v = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : '-');
  const naira = (n: number | null) => (typeof n === 'number' ? `NGN ${formatNumber(Math.round(n))}` : '-');

  const breadcrumb = (
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      <span>HRIS</span>
      <ChevronRight className="w-4 h-4" />
      <span>Employees</span>
      <ChevronRight className="w-4 h-4" />
      <span className="text-slate-700 font-extrabold">Employee Profile</span>
    </div>
  );

  const roleBar = (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Fingerprint className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Access Context</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Role-based visibility, field masking, and audit logging are enforced on this view.</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={employeeSearch}
              list="employee-profile-search-options"
              onChange={(e) => setEmployeeSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const query = employeeSearch.trim().toLowerCase();
                const match = employeeOptions.find((employee) =>
                  employee.employeeId.toLowerCase() === query ||
                  employee.fullName.toLowerCase() === query ||
                  `${employee.employeeId} - ${employee.fullName}`.toLowerCase() === query,
                );
                openEmployeeProfile(match?.employeeId || employeeSearch);
              }}
              placeholder={employeeSearchLoading ? 'Loading employees...' : 'Search employee...'}
              className="w-[260px] max-w-[70vw] text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <datalist id="employee-profile-search-options">
              {employeeSearchResults.map((employee) => (
                <option key={employee.employeeId} value={`${employee.employeeId} - ${employee.fullName}`}>
                  {employee.jobTitle} | {employee.department} | {employee.location}
                </option>
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => {
                const query = employeeSearch.trim().toLowerCase();
                const match = employeeOptions.find((employee) =>
                  employee.employeeId.toLowerCase() === query ||
                  employee.fullName.toLowerCase() === query ||
                  `${employee.employeeId} - ${employee.fullName}`.toLowerCase() === query,
                );
                openEmployeeProfile(match?.employeeId || employeeSearch);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-extrabold hover:bg-slate-800"
            >
              Go
            </button>
          </div>
          {employeeSearchError ? <span className="text-[11px] font-extrabold text-red-700">{employeeSearchError}</span> : null}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <span className="text-xs font-extrabold text-slate-600">Viewer Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="text-xs font-extrabold text-slate-800 bg-white focus:outline-none">
              {[
                'Super Admin',
                'HR Director',
                'HR Manager',
                'HR Officer',
                'Admin Officer',
                'Department Head',
                'Line Manager',
                'Payroll Officer',
                'HSE Officer',
                'Compliance Officer',
                'Auditor',
                'IT Administrator',
                'Employee',
                'Executive Management',
              ].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <span className="text-xs font-extrabold text-slate-600">Viewer EmployeeId</span>
            <input
              value={viewerEmployeeId || ''}
              onChange={(e) => setViewerEmployeeId(e.target.value.trim() ? e.target.value.trim() : undefined)}
              placeholder="Optional (for self-view)"
              className="w-[200px] text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
          {!perms.canViewProfile && <LockBadge />}
        </div>
      </div>
    </Card>
  );

  if (!employeeId || !employeeId.trim()) return <EmptyState title="No employee selected" detail="Open an employee from the directory to view a 360° master profile." />;
  if (!perms.canViewProfile) return <EmptyState title="Permission denied" detail="You do not have permission to view this employee profile." />;

  const loading = profile.status === 'loading' || overview.status === 'loading' || insights.status === 'loading' || audit.status === 'loading';
  const hasError = profile.status === 'error' || overview.status === 'error' || insights.status === 'error' || audit.status === 'error';
  const profileData = profile.data;
  const overviewData = overview.data;
  const insightsData = insights.data;
  const auditData = audit.data;

  if (loading && (profile.status !== 'ready' || !profileData)) {
    return (
      <div className="bg-white space-y-6">
        {breadcrumb}
        {roleBar}
        <ProfileSkeleton />
      </div>
    );
  }

  if (hasError) {
    const msg = profile.error || overview.error || insights.error || audit.error || 'Unable to load employee profile.';
    return (
      <div className="bg-white space-y-6">
        {breadcrumb}
        {roleBar}
        <ErrorState title="Unable to load employee profile" detail={`${msg} Please refresh or contact IT support.`} onRetry={retry} />
      </div>
    );
  }

  if (!profileData || !overviewData || !insightsData || !auditData) return <EmptyState title="No employee profile found" detail="The requested employee record could not be retrieved." />;

  return (
    <div className="bg-white space-y-6">
      {breadcrumb}
      {roleBar}

      <ProfileHeader profile={profileData} role={role} onAction={onAction} permissions={perms} />
      <InsightBanner insights={insightsData} onAction={onAction} />

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap overflow-auto">
            {tabs.map((t) => (
              <TabButton key={t.key} label={t.label} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">ID: {profileData.employeeId}</span>
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Loaded: {nowStamp}</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6 min-w-0">
          <AnimatePresence mode="wait">
            {tab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                <OverviewTab overview={overviewData} permissions={perms} />
              </motion.div>
            )}

            {tab !== 'overview' && (
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                <div className="space-y-6">
                  {tab === 'personal' && (
                    <Section
                      title="Personal Information"
                      icon={User}
                      actions={
                        <div className="flex items-center gap-2">
                          {!perms.canViewSensitivePersonal && <LockBadge />}
                          {!personalEdit && perms.canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setPersonalDraft(profileData.personalInfo);
                                setPersonalEdit(true);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {personalEdit && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const next = await apiMutate<PersonalInfo>(employeeId, 'personal-info', {
                                      method: 'PATCH',
                                      body: JSON.stringify(personalDraft || {}),
                                      role,
                                      viewerEmployeeId,
                                    });
                                    updateProfile((p) => ({ ...p, personalInfo: next }));
                                    pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Edited personal information', performedBy: role });
                                    setPersonalEdit(false);
                                    setToast({ title: 'Saved', detail: 'Personal information updated and audited.', tone: 'ok' });
                                  } catch (e) {
                                    setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                  }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPersonalEdit(false);
                                  setPersonalDraft(null);
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(
                          [
                            { label: 'Title', key: 'title', restricted: false },
                            { label: 'First Name', key: 'firstName', restricted: false },
                            { label: 'Middle Name', key: 'middleName', restricted: false },
                            { label: 'Last Name', key: 'lastName', restricted: false },
                            { label: 'Preferred Name', key: 'preferredName', restricted: false },
                            { label: 'Gender', key: 'gender', restricted: false },
                            { label: 'Date of Birth', key: 'dateOfBirth', restricted: true },
                            { label: 'Marital Status', key: 'maritalStatus', restricted: true },
                            { label: 'Nationality', key: 'nationality', restricted: false },
                            { label: 'State of Origin', key: 'stateOfOrigin', restricted: false },
                            { label: 'Local Government Area', key: 'localGovernmentArea', restricted: false },
                            { label: 'Religion', key: 'religion', restricted: true },
                            { label: 'Languages Spoken', key: 'languagesSpoken', restricted: false },
                            { label: 'Personal Email', key: 'personalEmail', restricted: false },
                            { label: 'Personal Phone', key: 'personalPhone', restricted: true },
                            { label: 'Residential Address', key: 'residentialAddress', restricted: true },
                            { label: 'Permanent Address', key: 'permanentAddress', restricted: true },
                          ] as const
                        ).map((f) => {
                          const restricted = f.restricted && !perms.canViewSensitivePersonal;
                          const current = profileData.personalInfo[f.key] ?? null;
                          if (!personalEdit) return <Field key={f.key} label={f.label} value={v(current)} masked={restricted} />;
                          return (
                            <EditField
                              key={f.key}
                              label={f.label}
                              value={restricted ? '••••••' : v(personalDraft?.[f.key] ?? current)}
                              disabled={restricted}
                              onChange={(next) => {
                                setPersonalDraft((prev) => ({ ...(prev || {}), [f.key]: next } as PersonalInfo));
                              }}
                            />
                          );
                        })}
                      </div>
                    </Section>
                  )}

                  {tab === 'employment' && (
                    <div className="space-y-6">
                      <Section
                        title="Employment Details"
                        icon={IdCard}
                        actions={
                          <div className="flex items-center gap-2">
                            {!employmentEdit && perms.canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEmploymentDraft(profileData.employmentDetails);
                                  setEmploymentEdit(true);
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                                Edit
                              </button>
                            )}
                            {employmentEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const next = await apiMutate<EmploymentDetails>(employeeId, 'employment', {
                                        method: 'PATCH',
                                        body: JSON.stringify(employmentDraft || {}),
                                        role,
                                        viewerEmployeeId,
                                      });
                                      updateProfile((p) => ({ ...p, employmentDetails: next }));
                                      pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Updated employment details', performedBy: role });
                                      setEmploymentEdit(false);
                                      setToast({ title: 'Saved', detail: 'Employment details updated and audited.', tone: 'ok' });
                                    } catch (e) {
                                      setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                    }
                                  }}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEmploymentEdit(false);
                                    setEmploymentDraft(null);
                                  }}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                            {perms.canChangeStatus && (
                              <button type="button" onClick={() => setStatusNext(profileData.employmentStatus)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dle-blue bg-dle-blue/5 text-xs font-extrabold text-dle-blue hover:bg-dle-blue/10 transition-colors">
                                <RefreshCcw className="w-4 h-4" />
                                Status Workflow
                              </button>
                            )}
                          </div>
                        }
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(profileData.employmentDetails).map(([k, val]) => {
                            if (!employmentEdit) return <Field key={k} label={employmentLabel(k)} value={v(val)} />;
                            return (
                              <EditField
                                key={k}
                                label={employmentLabel(k)}
                                value={v(employmentDraft?.[k] ?? val)}
                                onChange={(next) => setEmploymentDraft((prev) => ({ ...(prev || {}), [k]: next }))}
                              />
                            );
                          })}
                        </div>
                      </Section>

                      <ContractPayrollClassificationPanel
                        employeeId={profileData.employeeId}
                        employeeName={profileData.fullName}
                        employmentStatus={profileData.employmentStatus}
                        classification={profileData.payrollClassification}
                        canManage={perms.canManagePayrollClassification}
                        onUpdated={(next) => {
                          updateProfile((p) => ({
                            ...p,
                            payrollClassification: next,
                            employmentStatus: next.isDailyRate ? 'Active' : next.shouldDeactivate ? 'Inactive' : p.employmentStatus,
                            employmentType: next.isDailyRate ? 'Daily Rate' : p.employmentType,
                          }));
                          setToast({
                            title: 'Classification updated',
                            detail: 'Contract payroll classification saved to DLE_Enterprise.',
                            tone: 'ok',
                          });
                        }}
                      />

                      {perms.canChangeStatus && statusNext && (
                        <Section
                          title="Change Status (Workflow)"
                          icon={BadgeCheck}
                          actions={
                            <button type="button" onClick={() => setStatusNext('')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                              Close
                            </button>
                          }
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs font-extrabold text-slate-700">New Employment Status</div>
                              <select
                                value={statusNext}
                                onChange={(e) => setStatusNext(e.target.value as EmployeeStatus)}
                                className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-800 focus:outline-none"
                              >
                                {[
                                  'Active',
                                  'On Leave',
                                  'Probation',
                                  'Confirmed',
                                  'Suspended',
                                  'Resigned',
                                  'Terminated',
                                  'Retired',
                                  'Contract',
                                  'Seconded',
                                  'Field Assignment',
                                  'Inactive',
                                ].map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs font-extrabold text-slate-700">Reason</div>
                              <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none" placeholder="Provide a reason for audit trail..." />
                            </div>
                          </div>
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await apiMutate<{ employmentStatus: EmployeeStatus }>(employeeId, 'status', {
                                    method: 'PATCH',
                                    body: JSON.stringify({ employmentStatus: statusNext, reason: statusReason }),
                                    role,
                                    viewerEmployeeId,
                                  });
                                  updateProfile((p) => ({
                                    ...p,
                                    employmentStatus: res.employmentStatus,
                                    employmentDetails: { ...p.employmentDetails, employmentStatus: res.employmentStatus },
                                  }));
                                  pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Changed status', performedBy: role, oldValue: profileData.employmentStatus, newValue: res.employmentStatus, reason: statusReason || 'Status change' });
                                  setToast({ title: 'Status updated', detail: 'Employment status changed and audited.', tone: 'ok' });
                                  setStatusReason('');
                                  setStatusNext('');
                                } catch (e) {
                                  setToast({ title: 'Status update failed', detail: e instanceof Error ? e.message : 'Unable to update status', tone: 'err' });
                                }
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-dle-blue text-white text-sm font-extrabold hover:bg-dle-blue-deep transition-colors"
                            >
                              <BadgeCheck className="w-5 h-5" />
                              Submit Status Change
                            </button>
                          </div>
                        </Section>
                      )}
                    </div>
                  )}

                  {tab === 'job' && (
                    <Section
                      title="Job & Department Details"
                      icon={BriefcaseBusiness}
                      actions={
                        <div className="flex items-center gap-2">
                          {!jobEdit && perms.canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setJobDraft(profileData.jobDetails);
                                setJobEdit(true);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {jobEdit && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const next = await apiMutate<JobDetails>(employeeId, 'job', {
                                      method: 'PATCH',
                                      body: JSON.stringify(jobDraft || {}),
                                      role,
                                      viewerEmployeeId,
                                    });
                                    updateProfile((p) => ({ ...p, jobDetails: next, jobTitle: v(next.jobTitle), department: v(next.department), businessUnit: v(next.businessUnit), reportingManager: v(next.reportingManager) }));
                                    pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Changed department/job details', performedBy: role });
                                    setJobEdit(false);
                                    setToast({ title: 'Saved', detail: 'Job and department details updated and audited.', tone: 'ok' });
                                  } catch (e) {
                                    setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                  }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setJobEdit(false);
                                  setJobDraft(null);
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(profileData.jobDetails).map(([k, val]) => {
                          if (!jobEdit) return <Field key={k} label={jobLabel(k)} value={v(val)} />;
                          return (
                            <EditField
                              key={k}
                              label={jobLabel(k)}
                              value={v(jobDraft?.[k] ?? val)}
                              onChange={(next) => setJobDraft((prev) => ({ ...(prev || {}), [k]: next }))}
                            />
                          );
                        })}
                      </div>
                    </Section>
                  )}

                  {tab === 'contact' && (
                    <Section
                      title="Contact Information"
                      icon={Phone}
                      actions={
                        <div className="flex items-center gap-2">
                          {!contactsEdit && perms.canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setContactsDraft(profileData.contacts);
                                setContactsEdit(true);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {contactsEdit && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const next = await apiMutate<ContactDetails>(employeeId, 'contacts', {
                                      method: 'PATCH',
                                      body: JSON.stringify(contactsDraft || {}),
                                      role,
                                      viewerEmployeeId,
                                    });
                                    updateProfile((p) => ({ ...p, contacts: next }));
                                    pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Updated contact information', performedBy: role });
                                    setContactsEdit(false);
                                    setToast({ title: 'Saved', detail: 'Contact details updated and audited.', tone: 'ok' });
                                  } catch (e) {
                                    setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                  }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setContactsEdit(false);
                                  setContactsDraft(null);
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(profileData.contacts).map(([k, val]) => {
                          if (!contactsEdit) return <Field key={k} label={k} value={v(val)} />;
                          return (
                            <EditField
                              key={k}
                              label={k}
                              value={v(contactsDraft?.[k] ?? val)}
                              onChange={(next) => setContactsDraft((prev) => ({ ...(prev || {}), [k]: next }))}
                            />
                          );
                        })}
                      </div>
                    </Section>
                  )}

                  {tab === 'emergency' && (
                    <Section
                      title="Emergency Contacts"
                      icon={HeartPulse}
                      actions={
                        perms.canEdit ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEmergencyDraft({ isPrimary: profileData.emergencyContacts.length === 0, isNextOfKin: true, isBeneficiary: false });
                              setEmergencyModal({ mode: 'add' });
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Add Contact
                          </button>
                        ) : (
                          <LockBadge />
                        )
                      }
                    >
                      <div className="space-y-3">
                        {profileData.emergencyContacts.map((c) => (
                          <div key={c.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="text-sm font-extrabold text-slate-900">{c.fullName}</div>
                                  {c.isPrimary && <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-600/10 text-emerald-700">Primary</span>}
                                  {c.isNextOfKin && <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Next of Kin</span>}
                                  {c.isBeneficiary && <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-blue-600/10 text-blue-700">Beneficiary</span>}
                                </div>
                                <div className="text-xs text-slate-500 font-semibold mt-1">
                                  {c.relationship} <span className="mx-2">•</span> {c.phoneNumber}
                                </div>
                                {(c.email || c.address) && (
                                  <div className="text-xs text-slate-600 font-semibold mt-1">
                                    {c.email ? <span>{c.email}</span> : null}
                                    {c.email && c.address ? <span className="mx-2">•</span> : null}
                                    {c.address ? <span>{c.address}</span> : null}
                                  </div>
                                )}
                              </div>
                              {perms.canEdit && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEmergencyDraft(c);
                                      setEmergencyModal({ mode: 'edit', contact: c });
                                    }}
                                    className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                                  >
                                    <MoreHorizontal className="w-4 h-4 text-slate-600" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await apiMutate<{ deleted: true }>(employeeId, `emergency-contacts/${encodeURIComponent(c.id)}`, {
                                          method: 'DELETE',
                                          body: JSON.stringify({}),
                                          role,
                                          viewerEmployeeId,
                                        });
                                        updateProfile((p) => ({ ...p, emergencyContacts: p.emergencyContacts.filter((x) => x.id !== c.id) }));
                                        pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Deleted emergency contact', performedBy: role });
                                        setToast({ title: 'Deleted', detail: 'Emergency contact removed.', tone: 'ok' });
                                      } catch (e) {
                                        setToast({ title: 'Delete failed', detail: e instanceof Error ? e.message : 'Unable to delete', tone: 'err' });
                                      }
                                    }}
                                    className="p-2 rounded-xl border border-red-200 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-700" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {profileData.emergencyContacts.length === 0 && <div className="text-sm text-slate-600 font-semibold">No emergency contacts on file.</div>}
                      </div>
                    </Section>
                  )}

                  {tab === 'documents' && (
                    <Section
                      title="Documents"
                      icon={FileText}
                      actions={
                        perms.canViewDocuments ? (
                          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Access logged</span>
                        ) : (
                          <LockBadge />
                        )
                      }
                    >
                      {!perms.canViewDocuments ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">You do not have permission to view employee documents.</div>
                      ) : (
                        <div className="space-y-5">
                          {perms.canEdit && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="text-xs font-extrabold text-slate-700">Upload document</div>
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="md:col-span-1">
                                  <div className="text-[11px] font-extrabold text-slate-600">Category</div>
                                  <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none">
                                    {[
                                      'Employment Letter',
                                      'CV / Resume',
                                      'Academic Certificates',
                                      'Professional Certifications',
                                      'Government ID',
                                      'Passport',
                                      'NIN',
                                      'BVN',
                                      'Tax Documents',
                                      'Medical Certificate',
                                      'Guarantor Form',
                                      'Reference Letter',
                                      'Promotion Letter',
                                      'Transfer Letter',
                                      'Disciplinary Letter',
                                      'Exit Documents',
                                      'Contract Agreement',
                                    ].map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="md:col-span-1">
                                  <div className="text-[11px] font-extrabold text-slate-600">Expiry date (optional)</div>
                                  <input value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} placeholder="YYYY-MM-DD" className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none" />
                                </div>
                                <div className="md:col-span-1">
                                  <div className="text-[11px] font-extrabold text-slate-600">File</div>
                                  <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} className="mt-1 w-full text-sm" />
                                </div>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!docFile}
                                  onClick={async () => {
                                    if (!docFile) return;
                                    try {
                                      const created = await apiMutate<DocumentItem>(employeeId, 'documents', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                          category: docCategory,
                                          fileName: docFile.name,
                                          mimeType: docFile.type || 'application/octet-stream',
                                          sizeBytes: docFile.size,
                                          expiresAt: docExpiry ? `${docExpiry}T00:00:00.000Z` : null,
                                        }),
                                        role,
                                        viewerEmployeeId,
                                      });
                                      updateProfile((p) => ({ ...p, documents: [created, ...p.documents] }));
                                      pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Uploaded document', performedBy: role });
                                      setToast({ title: 'Uploaded', detail: 'Document uploaded and logged for audit.', tone: 'ok' });
                                      setDocFile(null);
                                      setDocExpiry('');
                                    } catch (e) {
                                      setToast({ title: 'Upload failed', detail: e instanceof Error ? e.message : 'Unable to upload', tone: 'err' });
                                    }
                                  }}
                                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${docFile ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400'}`}
                                >
                                  <Upload className="w-4 h-4" />
                                  Upload
                                </button>
                              </div>
                              <div className="mt-2 text-[11px] text-slate-500 font-semibold">File types: PDF/JPG/PNG. Size limit enforced. Access is logged and stored securely.</div>
                            </div>
                          )}

                          <div className="divide-y divide-slate-100 border border-slate-200/60 rounded-2xl overflow-hidden">
                            {profileData.documents.slice(0, 24).map((d) => (
                              <div key={d.id} className="px-5 py-4 flex items-start justify-between gap-3 bg-white">
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold text-slate-900">{d.category}</div>
                                  <div className="text-xs text-slate-500 font-semibold mt-1">
                                    {d.fileName} <span className="mx-2">•</span> {formatDateUtc(d.uploadedAt)}
                                    {d.expiresAt ? (
                                      <>
                                        <span className="mx-2">•</span> Expires: {formatDateUtc(d.expiresAt)}
                                      </>
                                    ) : null}
                                  </div>
                                  <div className="text-xs text-slate-600 font-semibold mt-1">
                                    Status:{' '}
                                    <span className={`font-extrabold ${d.status === 'Verified' ? 'text-emerald-700' : d.status === 'Rejected' ? 'text-red-700' : 'text-slate-700'}`}>{d.status}</span>
                                    {d.verifiedBy ? <span className="text-slate-500"> • Verified by {d.verifiedBy}</span> : null}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Previewed document', performedBy: role });
                                      setToast({ title: 'Preview', detail: 'Preview is stubbed in this build. Download/secure preview will be wired to encrypted storage.', tone: 'warn' });
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <Eye className="w-4 h-4" />
                                    Preview
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      pushAudit({ id: `audit-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), action: 'Downloaded document', performedBy: role });
                                      setToast({ title: 'Download', detail: 'Download is stubbed in this build. Secure download will be wired to storage.', tone: 'warn' });
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                                  >
                                    <Download className="w-4 h-4" />
                                    Download
                                  </button>
                                </div>
                              </div>
                            ))}
                            {profileData.documents.length === 0 && <div className="px-5 py-6 text-sm text-slate-600 font-semibold bg-white">No documents available.</div>}
                          </div>
                        </div>
                      )}
                    </Section>
                  )}

                  {tab === 'leave' && (
                    <div className="space-y-6">
                      <Section
                        title="Leave Summary"
                        icon={Calendar}
                        actions={
                          <div className="flex items-center gap-2">
                            {profileData.leaveSummary.sourceSystem ? (
                              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                {profileData.leaveSummary.sourceSystem}
                              </span>
                            ) : null}
                            {profileData.leaveSummary.lastUpdatedAt ? (
                              <span className="text-[11px] font-semibold text-slate-500">
                                Updated {formatDateTimeUtc(profileData.leaveSummary.lastUpdatedAt)}
                              </span>
                            ) : null}
                          </div>
                        }
                      >
                        {(profileData.leaveSummary.balanceDetails?.length
                          ? profileData.leaveSummary.balanceDetails
                          : Object.entries(profileData.leaveSummary.balances).map(([leaveType, available]) => ({
                              leaveType,
                              available,
                              entitlement: available,
                              used: 0,
                              pending: 0,
                              carryForward: 0,
                            }))
                        ).length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {(profileData.leaveSummary.balanceDetails?.length
                              ? profileData.leaveSummary.balanceDetails
                              : Object.entries(profileData.leaveSummary.balances).map(([leaveType, available]) => ({
                                  leaveType,
                                  available,
                                  entitlement: available,
                                  used: 0,
                                  pending: 0,
                                  carryForward: 0,
                                }))
                            ).map((item) => {
                              const tone = leaveBalanceTone(item.leaveType);
                              return (
                                <SummaryCard
                                  key={item.leaveType}
                                  label={item.leaveType}
                                  value={`${item.available} days`}
                                  tone={tone}
                                  hint={`Entitlement ${item.entitlement} · Used ${item.used}${item.pending > 0 ? ` · Pending ${item.pending}` : ''}`}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                            <div className="text-sm font-extrabold text-slate-800">No Sage leave balances loaded yet</div>
                            <div className="text-xs font-semibold text-slate-500 mt-1">
                              Balances and history sync from Sage Payroll / ESS when the employee is linked to a Sage source record.
                            </div>
                          </div>
                        )}
                      </Section>
                      <Section title="Leave History" icon={Calendar}>
                        {profileData.leaveSummary.history.length > 0 ? (
                          <div className="overflow-auto rounded-2xl border border-slate-200/70">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                  <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Type</th>
                                  <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Start</th>
                                  <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">End</th>
                                  <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Days</th>
                                  <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {profileData.leaveSummary.history.slice(0, 20).map((h) => (
                                  <tr key={h.id} className="border-b border-slate-100 bg-white">
                                    <td className="px-4 py-3 text-sm font-extrabold text-slate-900">{h.type}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{formatDateUtc(h.start)}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{formatDateUtc(h.end)}</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-slate-900">{h.days}</td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${leaveStatusTone(h.status)}`}>
                                        {h.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                            <div className="text-sm font-extrabold text-slate-800">No leave transactions on record</div>
                            <div className="text-xs font-semibold text-slate-500 mt-1">Approved and processed leave from Sage Payroll will appear here.</div>
                          </div>
                        )}
                      </Section>
                    </div>
                  )}

                  {tab === 'attendance' && (
                    <div className="space-y-6">
                      <Section title="Attendance Summary" icon={CheckCircle2}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <Field label="Attendance Score" value={`${profileData.attendanceSummary.score}/100`} />
                          <Field label="Present Days" value={`${profileData.attendanceSummary.presentDays}`} />
                          <Field label="Absent Days" value={`${profileData.attendanceSummary.absentDays}`} />
                          <Field label="Late Coming" value={`${profileData.attendanceSummary.lateComing}`} />
                          <Field label="Early Departure" value={`${profileData.attendanceSummary.earlyDeparture}`} />
                          <Field label="Overtime (hrs)" value={`${profileData.attendanceSummary.overtimeHours}`} />
                        </div>
                      </Section>
                      <Section title="Biometric / Clock-in Logs" icon={Fingerprint}>
                        <div className="divide-y divide-slate-100 border border-slate-200/60 rounded-2xl overflow-hidden">
                          {profileData.attendanceSummary.biometricLogs.slice(0, 18).map((l) => (
                            <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-3 bg-white">
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-slate-900">
                                  {l.source} <span className="mx-2">•</span> {l.status}
                                </div>
                                <div className="text-xs text-slate-500 font-semibold mt-0.5">{formatDateTimeUtc(l.at)}</div>
                              </div>
                              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Logged</span>
                            </div>
                          ))}
                        </div>
                      </Section>
                    </div>
                  )}

                  {tab === 'payroll' && (
                    <Section
                      title="Payroll Summary"
                      icon={BadgeCheck}
                      actions={
                        <div className="flex items-center gap-2">
                          {!perms.canViewPayroll && <LockBadge />}
                          {!payrollEdit && perms.canEditPayroll && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayrollDraft(profileData.payrollSummary);
                                setPayrollEdit(true);
                              }}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {payrollEdit && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const next = await apiMutate<PayrollSummary>(employeeId, 'payroll', {
                                      method: 'PATCH',
                                      body: JSON.stringify(payrollDraft || {}),
                                      role,
                                      viewerEmployeeId,
                                    });
                                    updateProfile((p) => ({ ...p, payrollSummary: next }));
                                    setPayrollEdit(false);
                                    setToast({ title: 'Saved', detail: 'Payroll details updated.', tone: 'ok' });
                                  } catch (e) {
                                    setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                  }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Save
                              </button>
                              <button type="button" onClick={() => { setPayrollEdit(false); setPayrollDraft(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </>
                          )}
                          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{profileData.payrollSummary.payrollStatus}</span>
                        </div>
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {!payrollEdit ? (
                          <>
                            <Field label="Salary Grade" value={v(profileData.payrollSummary.salaryGrade)} />
                            <Field label="Basic Salary" value={naira(profileData.payrollSummary.basicSalary)} masked={!perms.canViewPayroll} />
                            <Field label="Allowances" value={naira(profileData.payrollSummary.allowances)} masked={!perms.canViewPayroll} />
                            <Field label="Deductions" value={naira(profileData.payrollSummary.deductions)} masked={!perms.canViewPayroll} />
                            <Field label="Bank Name" value={v(profileData.payrollSummary.bankName)} masked={!perms.canViewPayroll} />
                            <Field label="Account Number" value={v(profileData.payrollSummary.accountNumberMasked)} />
                            <Field label="Pension Provider" value={v(profileData.payrollSummary.pensionProvider)} masked={!perms.canViewPayroll} />
                            <Field label="Tax ID" value={v(profileData.payrollSummary.taxId)} masked={!perms.canViewPayroll} />
                            <Field label="Payroll Group" value={v(profileData.payrollSummary.payrollGroup)} masked={!perms.canViewPayroll} />
                          </>
                        ) : (
                          <>
                            <EditField label="Salary Grade" value={v(payrollDraft?.salaryGrade)} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), salaryGrade: next }))} />
                            <EditField label="Basic Salary (NGN)" value={payrollDraft?.basicSalary != null ? String(payrollDraft.basicSalary) : ''} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), basicSalary: next ? Number(next) : null }))} />
                            <EditField label="Allowances (NGN)" value={payrollDraft?.allowances != null ? String(payrollDraft.allowances) : ''} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), allowances: next ? Number(next) : null }))} />
                            <EditField label="Deductions (NGN)" value={payrollDraft?.deductions != null ? String(payrollDraft.deductions) : ''} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), deductions: next ? Number(next) : null }))} />
                            <EditField label="Bank Name" value={v(payrollDraft?.bankName)} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), bankName: next }))} />
                            <EditField label="Account Number" value={v(payrollDraft?.accountNumberMasked)} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), accountNumberMasked: next }))} />
                            <EditField label="Pension Provider" value={v(payrollDraft?.pensionProvider)} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), pensionProvider: next }))} />
                            <EditField label="Tax ID" value={v(payrollDraft?.taxId)} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), taxId: next }))} />
                            <EditField label="Payroll Group" value={v(payrollDraft?.payrollGroup)} onChange={(next) => setPayrollDraft((prev) => ({ ...(prev || profileData.payrollSummary), payrollGroup: next }))} />
                          </>
                        )}
                        <Field label="Last Payroll Processed" value={profileData.payrollSummary.lastPayrollProcessed ? formatDateUtc(profileData.payrollSummary.lastPayrollProcessed) : '—'} />
                      </div>
                      {!perms.canViewPayroll && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">
                          Payroll amounts are masked. Only Payroll Officer, HR leadership, and authorized executives can view salary and bank details.
                        </div>
                      )}
                    </Section>
                  )}

                  {tab === 'performance' && (
                    <div className="space-y-6">
                      <Section
                        title="Performance Summary"
                        icon={BadgeCheck}
                        actions={
                          perms.canEdit ? (
                            <div className="flex items-center gap-2">
                              {!performanceEdit && (
                                <button type="button" onClick={() => { setPerformanceDraft(profileData.performanceSummary); setPerformanceEdit(true); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                  <Pencil className="w-4 h-4" />
                                  Edit
                                </button>
                              )}
                              {performanceEdit && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const saved = await apiMutate<{ performanceSummary?: PerformanceSummary }>(employeeId, 'profile-extensions', {
                                          method: 'PATCH',
                                          body: JSON.stringify({ performanceSummary: performanceDraft }),
                                          role,
                                          viewerEmployeeId,
                                        });
                                        const next = saved.performanceSummary || performanceDraft || profileData.performanceSummary;
                                        updateProfile((p) => ({ ...p, performanceSummary: next }));
                                        setPerformanceEdit(false);
                                        setToast({ title: 'Saved', detail: 'Performance details updated.', tone: 'ok' });
                                      } catch (e) {
                                        setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                      }
                                    }}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Save
                                  </button>
                                  <button type="button" onClick={() => { setPerformanceEdit(false); setPerformanceDraft(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                    Cancel
                                  </button>
                                </>
                              )}
                            </div>
                          ) : undefined
                        }
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {!performanceEdit ? (
                            <>
                              <Field label="Current Rating" value={profileData.performanceSummary.currentRating === '-' ? 'Not available' : profileData.performanceSummary.currentRating} />
                              <Field label="Last Review" value={profileData.performanceSummary.lastReviewAt ? formatDateUtc(profileData.performanceSummary.lastReviewAt) : '—'} />
                              <Field label="Manager Feedback" value={v(profileData.performanceSummary.managerFeedback)} />
                            </>
                          ) : (
                            <>
                              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                <div className="text-[11px] font-extrabold text-slate-600">Current Rating</div>
                                <select value={performanceDraft?.currentRating || '-'} onChange={(e) => setPerformanceDraft((prev) => ({ ...(prev || profileData.performanceSummary), currentRating: e.target.value as PerformanceSummary['currentRating'] }))} className="mt-1 w-full text-sm font-semibold text-slate-900 focus:outline-none">
                                  {['A', 'B', 'C', 'D', '-'].map((r) => (
                                    <option key={r} value={r}>{r === '-' ? 'Not available' : r}</option>
                                  ))}
                                </select>
                              </div>
                              <EditField label="Last Review (YYYY-MM-DD)" value={performanceDraft?.lastReviewAt ? performanceDraft.lastReviewAt.slice(0, 10) : ''} onChange={(next) => setPerformanceDraft((prev) => ({ ...(prev || profileData.performanceSummary), lastReviewAt: next ? `${next}T00:00:00.000Z` : null }))} />
                              <EditField label="Manager Feedback" value={v(performanceDraft?.managerFeedback)} onChange={(next) => setPerformanceDraft((prev) => ({ ...(prev || profileData.performanceSummary), managerFeedback: next }))} />
                            </>
                          )}
                        </div>
                      </Section>
                      <Section title="Goals / KPIs" icon={ClipboardList}>
                        <div className="divide-y divide-slate-100 border border-slate-200/60 rounded-2xl overflow-hidden">
                          {(performanceEdit ? performanceDraft?.goals : profileData.performanceSummary.goals)?.map((g, idx) => (
                            <div key={g.id} className="px-5 py-4 bg-white flex items-center justify-between gap-3">
                              {!performanceEdit ? (
                                <>
                                  <div className="min-w-0">
                                    <div className="text-sm font-extrabold text-slate-900">{g.title}</div>
                                    <div className="text-xs text-slate-500 font-semibold mt-1">Status: {g.status}</div>
                                  </div>
                                  <span className="text-xs font-extrabold px-3 py-2 rounded-xl bg-slate-100 text-slate-700">{g.progressPct}%</span>
                                </>
                              ) : (
                                <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                                  <EditField label="Goal" value={g.title} onChange={(next) => setPerformanceDraft((prev) => {
                                    const goals = [...(prev?.goals || profileData.performanceSummary.goals)];
                                    goals[idx] = { ...goals[idx], title: next };
                                    return { ...(prev || profileData.performanceSummary), goals };
                                  })} />
                                  <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                    <div className="text-[11px] font-extrabold text-slate-600">Status</div>
                                    <select value={g.status} onChange={(e) => setPerformanceDraft((prev) => {
                                      const goals = [...(prev?.goals || profileData.performanceSummary.goals)];
                                      goals[idx] = { ...goals[idx], status: e.target.value as typeof g.status };
                                      return { ...(prev || profileData.performanceSummary), goals };
                                    })} className="mt-1 w-full text-sm font-semibold text-slate-900 focus:outline-none">
                                      {['On Track', 'At Risk', 'Completed'].map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  </div>
                                  <EditField label="Progress %" value={String(g.progressPct)} onChange={(next) => setPerformanceDraft((prev) => {
                                    const goals = [...(prev?.goals || profileData.performanceSummary.goals)];
                                    goals[idx] = { ...goals[idx], progressPct: Math.max(0, Math.min(100, Number(next) || 0)) };
                                    return { ...(prev || profileData.performanceSummary), goals };
                                  })} />
                                  <button type="button" onClick={() => setPerformanceDraft((prev) => ({ ...(prev || profileData.performanceSummary), goals: (prev?.goals || profileData.performanceSummary.goals).filter((_, i) => i !== idx) }))} className="p-2 rounded-xl border border-red-200 hover:bg-red-50 self-end">
                                    <Trash2 className="w-4 h-4 text-red-700" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          {performanceEdit && (
                            <div className="px-5 py-3 bg-white">
                              <button type="button" onClick={() => setPerformanceDraft((prev) => ({ ...(prev || profileData.performanceSummary), goals: [...(prev?.goals || profileData.performanceSummary.goals), { id: `goal-${Date.now()}`, title: 'New goal', progressPct: 0, status: 'On Track' }] }))} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                <Plus className="w-4 h-4" />
                                Add Goal
                              </button>
                            </div>
                          )}
                        </div>
                      </Section>
                      <Section title="AI Signals" icon={Sparkles}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {(performanceEdit ? performanceDraft?.aiSignals : profileData.performanceSummary.aiSignals)?.map((s, idx) => {
                            const st = severityStyle(s.severity);
                            const Icon = st.icon;
                            return (
                              <div key={s.id} className={`rounded-2xl border ${st.border} bg-white p-4`}>
                                {!performanceEdit ? (
                                  <div className="flex items-start gap-3">
                                    <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${st.bg} ${st.fg}`}>
                                      <Icon className="w-5 h-5" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="text-sm font-extrabold text-slate-900">{s.title}</div>
                                      <div className="text-xs text-slate-500 font-semibold mt-1">AI confidence: {Math.round(s.confidence * 100)}%</div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <EditField label="Signal" value={s.title} onChange={(next) => setPerformanceDraft((prev) => {
                                      const aiSignals = [...(prev?.aiSignals || profileData.performanceSummary.aiSignals)];
                                      aiSignals[idx] = { ...aiSignals[idx], title: next };
                                      return { ...(prev || profileData.performanceSummary), aiSignals };
                                    })} />
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                        <div className="text-[11px] font-extrabold text-slate-600">Severity</div>
                                        <select value={s.severity} onChange={(e) => setPerformanceDraft((prev) => {
                                          const aiSignals = [...(prev?.aiSignals || profileData.performanceSummary.aiSignals)];
                                          aiSignals[idx] = { ...aiSignals[idx], severity: e.target.value as Severity };
                                          return { ...(prev || profileData.performanceSummary), aiSignals };
                                        })} className="mt-1 w-full text-sm font-semibold text-slate-900 focus:outline-none">
                                          {(['high', 'medium', 'low'] as Severity[]).map((v) => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                      </div>
                                      <EditField label="Confidence (0-1)" value={String(s.confidence)} onChange={(next) => setPerformanceDraft((prev) => {
                                        const aiSignals = [...(prev?.aiSignals || profileData.performanceSummary.aiSignals)];
                                        aiSignals[idx] = { ...aiSignals[idx], confidence: Math.max(0, Math.min(1, Number(next) || 0)) };
                                        return { ...(prev || profileData.performanceSummary), aiSignals };
                                      })} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </Section>
                    </div>
                  )}

                  {tab === 'training' && (
                    <Section
                      title="Training & Certifications"
                      icon={BadgeCheck}
                      actions={
                        perms.canEdit ? (
                          <div className="flex items-center gap-2">
                            {!trainingEdit && (
                              <button type="button" onClick={() => { setTrainingDraft(profileData.training); setTrainingEdit(true); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                <Pencil className="w-4 h-4" />
                                Edit
                              </button>
                            )}
                            {trainingEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const saved = await apiMutate<{ training?: TrainingRecord[] }>(employeeId, 'profile-extensions', {
                                        method: 'PATCH',
                                        body: JSON.stringify({ training: trainingDraft }),
                                        role,
                                        viewerEmployeeId,
                                      });
                                      const next = saved.training || trainingDraft || profileData.training;
                                      updateProfile((p) => ({ ...p, training: next }));
                                      setTrainingEdit(false);
                                      setToast({ title: 'Saved', detail: 'Training records updated.', tone: 'ok' });
                                    } catch (e) {
                                      setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                    }
                                  }}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Save
                                </button>
                                <button type="button" onClick={() => { setTrainingEdit(false); setTrainingDraft(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        ) : undefined
                      }
                    >
                      <div className="overflow-auto border border-slate-200/60 rounded-2xl">
                        <table className="w-full text-left bg-white">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Training</th>
                              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Provider</th>
                              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Completion</th>
                              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Expiry</th>
                              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Status</th>
                              <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600">Score</th>
                              {trainingEdit && <th className="px-4 py-3 text-[11px] font-extrabold text-slate-600" />}
                            </tr>
                          </thead>
                          <tbody>
                            {(trainingEdit ? trainingDraft : profileData.training)?.slice(0, 24).map((t, idx) => (
                              <tr key={t.id} className="border-b border-slate-100">
                                {!trainingEdit ? (
                                  <>
                                    <td className="px-4 py-3 text-sm font-extrabold text-slate-900">{t.trainingName}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{t.provider}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{t.completionDate ? formatDateUtc(t.completionDate) : '—'}</td>
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{t.expiryDate ? formatDateUtc(t.expiryDate) : '—'}</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-slate-700">{t.status}</td>
                                    <td className="px-4 py-3 text-xs font-extrabold text-slate-900">{typeof t.score === 'number' ? `${t.score}` : '—'}</td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-4 py-3"><input value={t.trainingName} onChange={(e) => setTrainingDraft((prev) => { const rows = [...(prev || profileData.training)]; rows[idx] = { ...rows[idx], trainingName: e.target.value }; return rows; })} className="w-full text-sm font-semibold border border-slate-200 rounded-lg px-2 py-1" /></td>
                                    <td className="px-4 py-3"><input value={t.provider} onChange={(e) => setTrainingDraft((prev) => { const rows = [...(prev || profileData.training)]; rows[idx] = { ...rows[idx], provider: e.target.value }; return rows; })} className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1" /></td>
                                    <td className="px-4 py-3"><input value={t.completionDate ? t.completionDate.slice(0, 10) : ''} onChange={(e) => setTrainingDraft((prev) => { const rows = [...(prev || profileData.training)]; rows[idx] = { ...rows[idx], completionDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : null }; return rows; })} placeholder="YYYY-MM-DD" className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1" /></td>
                                    <td className="px-4 py-3"><input value={t.expiryDate ? t.expiryDate.slice(0, 10) : ''} onChange={(e) => setTrainingDraft((prev) => { const rows = [...(prev || profileData.training)]; rows[idx] = { ...rows[idx], expiryDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : null }; return rows; })} placeholder="YYYY-MM-DD" className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1" /></td>
                                    <td className="px-4 py-3">
                                      <select value={t.status} onChange={(e) => setTrainingDraft((prev) => { const rows = [...(prev || profileData.training)]; rows[idx] = { ...rows[idx], status: e.target.value as TrainingRecord['status'] }; return rows; })} className="w-full text-xs font-extrabold border border-slate-200 rounded-lg px-2 py-1">
                                        {(['Completed', 'Pending', 'Expired'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-4 py-3"><input value={t.score != null ? String(t.score) : ''} onChange={(e) => setTrainingDraft((prev) => { const rows = [...(prev || profileData.training)]; rows[idx] = { ...rows[idx], score: e.target.value ? Number(e.target.value) : null }; return rows; })} className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1" /></td>
                                    <td className="px-4 py-3">
                                      <button type="button" onClick={() => setTrainingDraft((prev) => (prev || profileData.training).filter((_, i) => i !== idx))} className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50">
                                        <Trash2 className="w-4 h-4 text-red-700" />
                                      </button>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {trainingEdit && (
                          <div className="px-4 py-3 bg-white border-t border-slate-100">
                            <button type="button" onClick={() => setTrainingDraft((prev) => [...(prev || profileData.training), { id: `tr-${Date.now()}`, trainingName: 'New training', provider: '', status: 'Pending', completionDate: null, expiryDate: null, score: null }])} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                              <Plus className="w-4 h-4" />
                              Add Training
                            </button>
                          </div>
                        )}
                      </div>
                    </Section>
                  )}

                  {tab === 'assets' && (
                    <Section
                      title="Assets Assigned"
                      icon={BriefcaseBusiness}
                      actions={
                        perms.canEdit ? (
                          <div className="flex items-center gap-2">
                            {!assetsEdit && (
                              <button type="button" onClick={() => { setAssetsDraft(profileData.assets); setAssetsEdit(true); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                <Pencil className="w-4 h-4" />
                                Edit
                              </button>
                            )}
                            {assetsEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const saved = await apiMutate<{ assets?: AssetItem[] }>(employeeId, 'profile-extensions', {
                                        method: 'PATCH',
                                        body: JSON.stringify({ assets: assetsDraft }),
                                        role,
                                        viewerEmployeeId,
                                      });
                                      const next = saved.assets || assetsDraft || profileData.assets;
                                      updateProfile((p) => ({ ...p, assets: next }));
                                      setAssetsEdit(false);
                                      setToast({ title: 'Saved', detail: 'Asset records updated.', tone: 'ok' });
                                    } catch (e) {
                                      setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                    }
                                  }}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Save
                                </button>
                                <button type="button" onClick={() => { setAssetsEdit(false); setAssetsDraft(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        ) : undefined
                      }
                    >
                      <div className="divide-y divide-slate-100 border border-slate-200/60 rounded-2xl overflow-hidden">
                        {(assetsEdit ? assetsDraft : profileData.assets)?.slice(0, 24).map((a, idx) => (
                          <div key={a.id} className="px-5 py-4 bg-white flex items-start justify-between gap-3">
                            {!assetsEdit ? (
                              <>
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold text-slate-900">
                                    {a.assetType} <span className="mx-2">•</span> {a.assetName}
                                  </div>
                                  <div className="text-xs text-slate-500 font-semibold mt-1">
                                    Tag: {a.assetTag} <span className="mx-2">•</span> Serial: {a.serialNumber || '—'}
                                  </div>
                                  <div className="text-xs text-slate-600 font-semibold mt-1">
                                    Assigned: {formatDateUtc(a.assignedDate)} <span className="mx-2">•</span> Condition: {a.condition} <span className="mx-2">•</span> {a.returnStatus}
                                    {a.returnDate ? (
                                      <>
                                        <span className="mx-2">•</span> Returned: {formatDateUtc(a.returnDate)}
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 shrink-0">Asset</span>
                              </>
                            ) : (
                              <div className="w-full grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                <EditField label="Asset Type" value={a.assetType} onChange={(next) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], assetType: next }; return rows; })} />
                                <EditField label="Asset Name" value={a.assetName} onChange={(next) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], assetName: next }; return rows; })} />
                                <EditField label="Asset Tag" value={a.assetTag} onChange={(next) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], assetTag: next }; return rows; })} />
                                <EditField label="Serial Number" value={v(a.serialNumber)} onChange={(next) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], serialNumber: next || null }; return rows; })} />
                                <EditField label="Assigned Date" value={a.assignedDate.slice(0, 10)} onChange={(next) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], assignedDate: next ? `${next}T00:00:00.000Z` : rows[idx].assignedDate }; return rows; })} />
                                <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                  <div className="text-[11px] font-extrabold text-slate-600">Condition</div>
                                  <select value={a.condition} onChange={(e) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], condition: e.target.value as AssetItem['condition'] }; return rows; })} className="mt-1 w-full text-sm font-semibold text-slate-900 focus:outline-none">
                                    {(['Good', 'Fair', 'Needs Repair'] as const).map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                  <div className="text-[11px] font-extrabold text-slate-600">Return Status</div>
                                  <select value={a.returnStatus} onChange={(e) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], returnStatus: e.target.value as AssetItem['returnStatus'] }; return rows; })} className="mt-1 w-full text-sm font-semibold text-slate-900 focus:outline-none">
                                    {(['Assigned', 'Returned'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                                <EditField label="Return Date" value={a.returnDate ? a.returnDate.slice(0, 10) : ''} onChange={(next) => setAssetsDraft((prev) => { const rows = [...(prev || profileData.assets)]; rows[idx] = { ...rows[idx], returnDate: next ? `${next}T00:00:00.000Z` : null }; return rows; })} />
                                <button type="button" onClick={() => setAssetsDraft((prev) => (prev || profileData.assets).filter((_, i) => i !== idx))} className="p-2 rounded-xl border border-red-200 hover:bg-red-50 self-end">
                                  <Trash2 className="w-4 h-4 text-red-700" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                        {assetsEdit && (
                          <div className="px-5 py-3 bg-white">
                            <button type="button" onClick={() => setAssetsDraft((prev) => [...(prev || profileData.assets), { id: `as-${Date.now()}`, assetType: 'Laptop', assetTag: '', assetName: 'New asset', serialNumber: null, assignedDate: new Date().toISOString(), condition: 'Good', returnStatus: 'Assigned', returnDate: null }])} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                              <Plus className="w-4 h-4" />
                              Add Asset
                            </button>
                          </div>
                        )}
                        {!assetsEdit && profileData.assets.length === 0 && <div className="px-5 py-6 text-sm text-slate-600 font-semibold bg-white">No assets assigned.</div>}
                      </div>
                    </Section>
                  )}

                  {tab === 'medical' && (
                    <Section
                      title="Medical / HSE"
                      icon={Stethoscope}
                      actions={
                        <div className="flex items-center gap-2">
                          {!perms.canViewMedical && <LockBadge />}
                          {perms.canViewMedical && perms.canEdit && !medicalEdit && (
                            <button type="button" onClick={() => { setMedicalDraft(profileData.medicalHse); setMedicalEdit(true); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                              <Pencil className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {medicalEdit && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiMutate(employeeId, 'profile-extensions', {
                                      method: 'PATCH',
                                      body: JSON.stringify({ medicalHse: medicalDraft }),
                                      role,
                                      viewerEmployeeId,
                                    });
                                    updateProfile((p) => ({ ...p, medicalHse: medicalDraft || p.medicalHse }));
                                    setMedicalEdit(false);
                                    setToast({ title: 'Saved', detail: 'Medical / HSE details updated.', tone: 'ok' });
                                  } catch (e) {
                                    setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                  }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Save
                              </button>
                              <button type="button" onClick={() => { setMedicalEdit(false); setMedicalDraft(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      }
                    >
                      {!perms.canViewMedical || !profileData.medicalHse ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">You do not have permission to view medical / HSE information.</div>
                      ) : (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {!medicalEdit ? (
                              <>
                                <Field label="Medical Fitness Status" value={v(profileData.medicalHse.medicalFitnessStatus)} />
                                <Field label="Blood Group" value={v(profileData.medicalHse.bloodGroup)} />
                                <Field label="Known Allergies" value={v(profileData.medicalHse.knownAllergies)} />
                                <Field label="Medical Restrictions" value={v(profileData.medicalHse.medicalRestrictions)} />
                                <Field label="Fit-to-Work Status" value={v(profileData.medicalHse.fitToWorkStatus)} />
                              </>
                            ) : (
                              <>
                                <EditField label="Medical Fitness Status" value={v(medicalDraft?.medicalFitnessStatus)} onChange={(next) => setMedicalDraft((prev) => ({ ...(prev || profileData.medicalHse!), medicalFitnessStatus: next }))} />
                                <EditField label="Blood Group" value={v(medicalDraft?.bloodGroup)} onChange={(next) => setMedicalDraft((prev) => ({ ...(prev || profileData.medicalHse!), bloodGroup: next }))} />
                                <EditField label="Known Allergies" value={v(medicalDraft?.knownAllergies)} onChange={(next) => setMedicalDraft((prev) => ({ ...(prev || profileData.medicalHse!), knownAllergies: next }))} />
                                <EditField label="Medical Restrictions" value={v(medicalDraft?.medicalRestrictions)} onChange={(next) => setMedicalDraft((prev) => ({ ...(prev || profileData.medicalHse!), medicalRestrictions: next }))} />
                                <EditField label="Fit-to-Work Status" value={v(medicalDraft?.fitToWorkStatus)} onChange={(next) => setMedicalDraft((prev) => ({ ...(prev || profileData.medicalHse!), fitToWorkStatus: next }))} />
                              </>
                            )}
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <div className="text-xs font-extrabold text-slate-700 mb-2">Incident History</div>
                              <div className="space-y-3">
                                {profileData.medicalHse.incidentHistory.map((i) => (
                                  <div key={i.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
                                    <div className="text-sm font-extrabold text-slate-900">{i.title}</div>
                                    <div className="text-xs text-slate-500 font-semibold mt-1">
                                      {formatDateUtc(i.at)} <span className="mx-2">•</span> Severity: {i.severity} <span className="mx-2">•</span> {i.status}
                                    </div>
                                  </div>
                                ))}
                                {profileData.medicalHse.incidentHistory.length === 0 && <div className="text-sm text-slate-600 font-semibold">No incidents recorded.</div>}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-extrabold text-slate-700 mb-2">HSE Certifications</div>
                              <div className="space-y-3">
                                {profileData.medicalHse.hseCertifications.map((c) => (
                                  <div key={c.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
                                    <div className="text-sm font-extrabold text-slate-900">{c.name}</div>
                                    <div className="text-xs text-slate-500 font-semibold mt-1">
                                      Status: {c.status}
                                      {c.expiryDate ? (
                                        <>
                                          <span className="mx-2">•</span> Expiry: {formatDateUtc(c.expiryDate)}
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </Section>
                  )}

                  {tab === 'disciplinary' && (
                    <Section
                      title="Disciplinary Records"
                      icon={AlertTriangle}
                      actions={
                        !perms.canViewDisciplinary ? (
                          <LockBadge />
                        ) : perms.canEdit ? (
                          <div className="flex items-center gap-2">
                            {!disciplinaryEdit && (
                              <button type="button" onClick={() => { setDisciplinaryDraft(profileData.disciplinary || []); setDisciplinaryEdit(true); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                <Pencil className="w-4 h-4" />
                                Edit
                              </button>
                            )}
                            {disciplinaryEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const saved = await apiMutate<{ disciplinary?: DisciplinaryRecord[] }>(employeeId, 'profile-extensions', {
                                        method: 'PATCH',
                                        body: JSON.stringify({ disciplinary: disciplinaryDraft }),
                                        role,
                                        viewerEmployeeId,
                                      });
                                      const next = saved.disciplinary || disciplinaryDraft || profileData.disciplinary || [];
                                      updateProfile((p) => ({ ...p, disciplinary: next }));
                                      setDisciplinaryEdit(false);
                                      setToast({ title: 'Saved', detail: 'Disciplinary records updated.', tone: 'ok' });
                                    } catch (e) {
                                      setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                                    }
                                  }}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Save
                                </button>
                                <button type="button" onClick={() => { setDisciplinaryEdit(false); setDisciplinaryDraft(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        ) : undefined
                      }
                    >
                      {!perms.canViewDisciplinary || !profileData.disciplinary ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">You do not have permission to view disciplinary records.</div>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200/60 rounded-2xl overflow-hidden">
                          {(disciplinaryEdit ? disciplinaryDraft : profileData.disciplinary)?.map((d, idx) => (
                            <div key={d.id} className="px-5 py-4 bg-white">
                              {!disciplinaryEdit ? (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-extrabold text-slate-900">
                                      {d.caseType} <span className="mx-2">•</span> {d.status}
                                    </div>
                                    <div className="text-xs text-slate-500 font-semibold mt-1">Reported: {formatDateUtc(d.dateReported)}</div>
                                    <div className="text-xs text-slate-600 font-semibold mt-1">{d.description}</div>
                                    {d.actionTaken && <div className="text-xs text-slate-700 font-extrabold mt-2">Action: {d.actionTaken}</div>}
                                  </div>
                                  <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 shrink-0">Case</span>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  <EditField label="Case Type" value={d.caseType} onChange={(next) => setDisciplinaryDraft((prev) => { const rows = [...(prev || profileData.disciplinary || [])]; rows[idx] = { ...rows[idx], caseType: next }; return rows; })} />
                                  <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                                    <div className="text-[11px] font-extrabold text-slate-600">Status</div>
                                    <select value={d.status} onChange={(e) => setDisciplinaryDraft((prev) => { const rows = [...(prev || profileData.disciplinary || [])]; rows[idx] = { ...rows[idx], status: e.target.value as DisciplinaryRecord['status'] }; return rows; })} className="mt-1 w-full text-sm font-semibold text-slate-900 focus:outline-none">
                                      {(['Open', 'Closed', 'Appealed'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  </div>
                                  <EditField label="Date Reported" value={d.dateReported.slice(0, 10)} onChange={(next) => setDisciplinaryDraft((prev) => { const rows = [...(prev || profileData.disciplinary || [])]; rows[idx] = { ...rows[idx], dateReported: next ? `${next}T00:00:00.000Z` : rows[idx].dateReported }; return rows; })} />
                                  <EditField label="Description" value={d.description} onChange={(next) => setDisciplinaryDraft((prev) => { const rows = [...(prev || profileData.disciplinary || [])]; rows[idx] = { ...rows[idx], description: next }; return rows; })} />
                                  <EditField label="Action Taken" value={v(d.actionTaken)} onChange={(next) => setDisciplinaryDraft((prev) => { const rows = [...(prev || profileData.disciplinary || [])]; rows[idx] = { ...rows[idx], actionTaken: next || null }; return rows; })} />
                                  <EditField label="Approver" value={v(d.approver)} onChange={(next) => setDisciplinaryDraft((prev) => { const rows = [...(prev || profileData.disciplinary || [])]; rows[idx] = { ...rows[idx], approver: next || null }; return rows; })} />
                                  <button type="button" onClick={() => setDisciplinaryDraft((prev) => (prev || profileData.disciplinary || []).filter((_, i) => i !== idx))} className="p-2 rounded-xl border border-red-200 hover:bg-red-50 self-end">
                                    <Trash2 className="w-4 h-4 text-red-700" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          {disciplinaryEdit && (
                            <div className="px-5 py-3 bg-white">
                              <button type="button" onClick={() => setDisciplinaryDraft((prev) => [...(prev || profileData.disciplinary || []), { id: `dc-${Date.now()}`, caseType: 'New case', dateReported: new Date().toISOString(), description: '', status: 'Open', actionTaken: null, approver: null }])} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                                <Plus className="w-4 h-4" />
                                Add Record
                              </button>
                            </div>
                          )}
                          {!disciplinaryEdit && profileData.disciplinary.length === 0 && <div className="px-5 py-6 text-sm text-slate-600 font-semibold bg-white">No disciplinary records.</div>}
                        </div>
                      )}
                    </Section>
                  )}

                  {tab === 'history' && (
                    <Section title="Employment History" icon={History}>
                      <div className="space-y-3">
                        {profileData.history.map((h) => (
                          <div key={h.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-extrabold text-slate-900">{h.type}</div>
                                <div className="text-xs text-slate-500 font-semibold mt-1">
                                  {formatDateUtc(h.at)} <span className="mx-2">•</span> {h.actor}
                                </div>
                                <div className="text-xs text-slate-600 font-semibold mt-1">{h.detail}</div>
                              </div>
                              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 shrink-0">Event</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {tab === 'audit' && (
                    <Section title="Audit Trail" icon={ShieldCheck} actions={!perms.canViewAudit ? <LockBadge /> : undefined}>
                      {!perms.canViewAudit ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">You do not have permission to view the audit trail.</div>
                      ) : (
                        <div className="space-y-3">
                          {auditData.slice(0, 40).map((l) => (
                            <div key={l.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold text-slate-900">{l.action}</div>
                                  <div className="text-xs text-slate-500 font-semibold mt-1">
                                    {formatDateTimeUtc(l.at)} <span className="mx-2">•</span> {l.performedBy} <span className="mx-2">•</span> IP: {l.ipAddress || '—'} <span className="mx-2">•</span> Device: {l.device || '—'}
                                  </div>
                                  {(l.oldValue || l.newValue) && (
                                    <div className="text-xs text-slate-600 font-semibold mt-2">
                                      {l.oldValue ? <span>Old: {l.oldValue}</span> : null}
                                      {l.oldValue && l.newValue ? <span className="mx-2">•</span> : null}
                                      {l.newValue ? <span>New: {l.newValue}</span> : null}
                                    </div>
                                  )}
                                  {l.reason && <div className="text-xs text-slate-600 font-semibold mt-2">Reason: {l.reason}</div>}
                                </div>
                                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-600/10 text-emerald-700 shrink-0">Audit</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-slate-900">Quick Summary</div>
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{profileData.employmentStatus}</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <Field label="Profile Completion" value={`${overviewData.profileCompletionPct}%`} />
              <Field label="Attendance Score" value={`${overviewData.attendanceScore}/100`} />
              <Field label="Leave Balance" value={`${overviewData.leaveBalanceDays} days`} />
              <Field label="Training Compliance" value={`${overviewData.trainingCompliancePct}%`} />
              <Field label="Document Status" value={overviewData.documentStatus} />
              <Field label="Asset Status" value={overviewData.assetStatus} />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-slate-900">Audit / Activity Timeline</div>
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{formatNumber(auditData.length)}</span>
            </div>
            <div className="mt-4 space-y-3">
              {auditData.slice(0, 10).map((l) => (
                <div key={l.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900">{l.action}</div>
                      <div className="text-[11px] text-slate-500 font-semibold mt-1">
                        {formatDateTimeUtc(l.at)} <span className="mx-2">•</span> {l.performedBy}
                      </div>
                      {(l.oldValue || l.newValue) && (
                        <div className="text-xs text-slate-600 font-semibold mt-1">
                          {l.oldValue ? <span>Old: {l.oldValue}</span> : null}
                          {l.oldValue && l.newValue ? <span className="mx-2">•</span> : null}
                          {l.newValue ? <span>New: {l.newValue}</span> : null}
                        </div>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-extrabold text-slate-700 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Audit
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <AnimatePresence>
        {emergencyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            onClick={() => {
              setEmergencyModal(null);
              setEmergencyDraft({});
            }}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute left-1/2 top-1/2 w-[92vw] max-w-[720px] -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                    <HeartPulse className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">{emergencyModal.mode === 'add' ? 'Add Emergency Contact' : 'Edit Emergency Contact'}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-0.5">At least one contact is required and one must be primary.</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEmergencyModal(null);
                    setEmergencyDraft({});
                  }}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                >
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditField label="Full Name" value={typeof emergencyDraft.fullName === 'string' ? emergencyDraft.fullName : ''} onChange={(next) => setEmergencyDraft((p) => ({ ...p, fullName: next }))} placeholder="Full name" />
                  <EditField label="Relationship" value={typeof emergencyDraft.relationship === 'string' ? emergencyDraft.relationship : ''} onChange={(next) => setEmergencyDraft((p) => ({ ...p, relationship: next }))} placeholder="Spouse / Parent / Sibling..." />
                  <EditField label="Phone Number" value={typeof emergencyDraft.phoneNumber === 'string' ? emergencyDraft.phoneNumber : ''} onChange={(next) => setEmergencyDraft((p) => ({ ...p, phoneNumber: next }))} placeholder="+234 ..." />
                  <EditField label="Alternative Phone" value={typeof emergencyDraft.alternativePhone === 'string' ? emergencyDraft.alternativePhone : ''} onChange={(next) => setEmergencyDraft((p) => ({ ...p, alternativePhone: next }))} placeholder="Optional" />
                  <EditField label="Email" value={typeof emergencyDraft.email === 'string' ? emergencyDraft.email : ''} onChange={(next) => setEmergencyDraft((p) => ({ ...p, email: next }))} placeholder="Optional" />
                  <EditField label="Address" value={typeof emergencyDraft.address === 'string' ? emergencyDraft.address : ''} onChange={(next) => setEmergencyDraft((p) => ({ ...p, address: next }))} placeholder="Optional" />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    { key: 'isPrimary', label: 'Primary' },
                    { key: 'isNextOfKin', label: 'Next of Kin' },
                    { key: 'isBeneficiary', label: 'Beneficiary' },
                  ].map((x) => (
                    <label key={x.key} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean((emergencyDraft as any)[x.key])}
                        onChange={(e) => setEmergencyDraft((p) => ({ ...p, [x.key]: e.target.checked }))}
                        className="accent-dle-blue"
                      />
                      {x.label}
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmergencyModal(null);
                      setEmergencyDraft({});
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const fullName = (emergencyDraft.fullName || '').toString().trim();
                      const relationship = (emergencyDraft.relationship || '').toString().trim();
                      const phoneNumber = (emergencyDraft.phoneNumber || '').toString().trim();
                      if (!fullName || !relationship || !phoneNumber) {
                        setToast({ title: 'Validation', detail: 'Full name, relationship, and phone number are required.', tone: 'warn' });
                        return;
                      }
                      try {
                        const endpoint =
                          emergencyModal.mode === 'add'
                            ? 'emergency-contacts'
                            : `emergency-contacts/${encodeURIComponent(emergencyModal.contact?.id || '')}`;
                        const method = emergencyModal.mode === 'add' ? 'POST' : 'PATCH';
                        const updated = await apiMutate<EmergencyContact[]>(employeeId, endpoint, {
                          method,
                          body: JSON.stringify({
                            fullName,
                            relationship,
                            phoneNumber,
                            alternativePhone: emergencyDraft.alternativePhone || null,
                            email: emergencyDraft.email || null,
                            address: emergencyDraft.address || null,
                            isPrimary: Boolean(emergencyDraft.isPrimary),
                            isNextOfKin: Boolean(emergencyDraft.isNextOfKin),
                            isBeneficiary: Boolean(emergencyDraft.isBeneficiary),
                          }),
                          role,
                          viewerEmployeeId,
                        });
                        updateProfile((p) => ({ ...p, emergencyContacts: updated }));
                        pushAudit({
                          id: `audit-${Math.random().toString(16).slice(2)}`,
                          at: new Date().toISOString(),
                          action: emergencyModal.mode === 'add' ? 'Added emergency contact' : 'Updated emergency contact',
                          performedBy: role,
                        });
                        setToast({ title: 'Saved', detail: 'Emergency contacts updated and audited.', tone: 'ok' });
                        setEmergencyModal(null);
                        setEmergencyDraft({});
                      } catch (e) {
                        setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Unable to save', tone: 'err' });
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.16 }} className="fixed bottom-6 right-6 z-50">
            <div className={`w-[360px] rounded-2xl border shadow-lg p-4 bg-white ${toast.tone === 'err' ? 'border-red-200' : toast.tone === 'warn' ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">{toast.title}</div>
                  <div className="text-xs text-slate-600 font-semibold mt-1">{toast.detail}</div>
                </div>
                <button type="button" onClick={() => setToast(null)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
